import { objOr } from "../core/format.js";
import { marketValue, toPrice } from "../domain/price.js";

// Fehlt die Karte in einer Sprache (404), ist das kein Netzproblem – weiter mit der anderen
const notFound = (e) => (e?.status === 404 ? null : Promise.reject(e));

/**
 * Cardmarket-Richtwerte über TCGdex, pro Karte zwischengespeichert (alle Personen teilen sich den Speicher).
 * request(ids) lädt fehlende/alte Preise im Hintergrund (6 parallel) und meldet "update".
 * Klappt in einem Durchlauf gar nichts (TCGdex weg), meldet sie "error"; gespeicherte Werte bleiben.
 * TCGdex liefert Preise nur pro Karte – Listen-Endpunkte und GraphQL haben kein `pricing` (geprüft 10.10.2026).
 */
export class PriceService extends EventTarget {
  #queue = new Set();
  #running = false;
  #failed = new Set(); // Karten, deren Preis zuletzt nicht geladen werden konnte

  constructor(tcgdex, storage, storageKey, ttlMs, keepMs = Infinity) {
    super();
    this.tcgdex = tcgdex;
    this.storage = storage;
    this.storageKey = storageKey;
    this.ttlMs = ttlMs;
    this.keepMs = keepMs;
    this.prices = objOr(storage.get(storageKey, {}));
  }

  get(cardId) {
    return this.prices[cardId] || null;
  }

  value(cardId) {
    return marketValue(this.get(cardId));
  }

  hasFailed(cardId) {
    return this.#failed.has(cardId);
  }

  // Preis jünger als die Speicherdauer (24 h)? Der Wertverlauf zählt nur vollständig frische Summen.
  isFresh(cardId, now = Date.now()) {
    const p = this.prices[cardId];
    return Boolean(p) && now - p.at <= this.ttlMs;
  }

  request(cardIds) {
    for (const id of cardIds) {
      this.#failed.delete(id); // neuer Versuch
      const p = this.prices[id];
      if (!p || Date.now() - p.at > this.ttlMs) this.#queue.add(id);
    }
    this.resume();
  }

  // z. B. wenn das Gerät wieder online ist
  async resume() {
    if (this.#running || !this.#queue.size || !navigator.onLine) return;
    this.#running = true;
    let done = 0;
    let ok = 0;
    let lastError = null;
    const worker = async () => {
      while (this.#queue.size) {
        const id = this.#queue.values().next().value;
        this.#queue.delete(id);
        try {
          this.prices[id] = await this.#fetch(id);
          ok++;
        } catch (e) {
          this.#failed.add(id); // alter Wert bleibt
          lastError = e;
        }
        if (++done % 15 === 0) this.#notify();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    // ponytail: nach Alter aufräumen statt nach „wird noch gebraucht“ – Karten aus Sammlung und Listen werden beim Öffnen
    // täglich erneuert und bleiben so ohnehin frisch; dafür muss niemand die Daten der anderen Personen kennen.
    // Was nur mal in „Set nach Wert“ geladen wurde, fliegt nach 30 Tagen raus.
    const now = Date.now();
    for (const [cardId, p] of Object.entries(this.prices)) if (!(now - p.at <= this.keepMs)) delete this.prices[cardId]; // auch kaputte ohne at
    this.storage.set(this.storageKey, this.prices);
    this.#running = false;
    this.#notify();
    if (!ok && lastError) this.dispatchEvent(new CustomEvent("error", { detail: lastError }));
  }

  // Erst Deutsch (Seltenheit auf Deutsch), ohne Preis dort Englisch (McDonald's, Celebrations Klassische Kollektion, MEP …).
  // Kam der Preis aus dem englischen Datensatz, ist das gemerkt (en: true) und es wird beim nächsten Mal gleich dort
  // gefragt – die deutsche Anfrage wäre wieder leer. Cardmarket-Produkt und Preis sind in beiden Sprachen dieselben.
  async #fetch(id) {
    const prev = this.prices[id];
    const de = prev?.en ? null : await this.tcgdex.card(id, "de").catch(notFound);
    if (de?.pricing?.cardmarket) return toPrice(de);
    const en = await this.tcgdex.card(id, "en").catch(notFound);
    if (!en?.pricing?.cardmarket) return toPrice(de || en); // nirgends ein Preis (oder die Karte gibt es nicht mehr)
    const rarity = de?.rarity ?? (prev?.en ? prev.rarity : null) ?? en.rarity;
    const dexId = de?.dexId ?? (prev?.en && prev.dexId != null ? [prev.dexId] : en.dexId);
    return { ...toPrice({ ...en, rarity, dexId }), en: true };
  }

  #notify() {
    this.dispatchEvent(new Event("update"));
  }
}
