import { objOr } from "../core/format.js";
import { marketValue, toPrice } from "../domain/price.js";

/**
 * Cardmarket-Preisliste über TCGdex, pro Karte zwischengespeichert. ownLow(id) → selbst eingetragenes „ab“ { value, at } | null.
 * request(ids) lädt fehlende/alte Preise im Hintergrund (6 parallel) und meldet "update".
 * Klappt in einem Durchlauf gar nichts (TCGdex weg), meldet sie "error"; gespeicherte Werte bleiben.
 */
export class PriceService extends EventTarget {
  #queue = new Set();
  #running = false;
  #failed = new Set(); // Karten, deren Preis zuletzt nicht geladen werden konnte

  constructor(tcgdex, storage, storageKey, ttlMs, ownLow = () => null) {
    super();
    this.ownLow = ownLow;
    this.tcgdex = tcgdex;
    this.storage = storage;
    this.storageKey = storageKey;
    this.ttlMs = ttlMs;
    this.prices = objOr(storage.get(storageKey, {}));
  }

  get(cardId) {
    return this.prices[cardId] || null;
  }

  // Selbst eingetragenes „ab“ { value, at } oder null
  own(cardId) {
    return this.ownLow(cardId);
  }

  // Wert der Karte: selbst eingetragenes „ab“ (DE/EN, ab EX), sonst Näherung – siehe marketValue
  value(cardId) {
    return marketValue(this.get(cardId), this.ownLow(cardId)?.value);
  }

  hasFailed(cardId) {
    return this.#failed.has(cardId);
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
          this.prices[id] = toPrice(await this.tcgdex.card(id));
          ok++;
        } catch (e) {
          this.#failed.add(id); // alter Wert bleibt
          lastError = e;
        }
        if (++done % 15 === 0) this.#notify();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    this.storage.set(this.storageKey, this.prices);
    this.#running = false;
    this.#notify();
    if (!ok && lastError) this.dispatchEvent(new CustomEvent("error", { detail: lastError }));
  }

  #notify() {
    this.dispatchEvent(new Event("update"));
  }
}
