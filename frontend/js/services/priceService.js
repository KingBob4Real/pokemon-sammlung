import { objOr } from "../core/format.js";
import { marketValue, toPrice } from "../domain/price.js";

/**
 * Cardmarket-Richtwerte über TCGdex, pro Karte zwischengespeichert.
 * request(ids) lädt fehlende/alte Preise im Hintergrund (6 parallel) und meldet "update".
 * Klappt in einem Durchlauf gar nichts (TCGdex weg), meldet sie "error"; gespeicherte Werte bleiben.
 */
export class PriceService extends EventTarget {
  #queue = new Set();
  #running = false;
  #failed = new Set(); // Karten, deren Preis zuletzt nicht geladen werden konnte

  constructor(tcgdex, storage, storageKey, ttlMs) {
    super();
    this.tcgdex = tcgdex;
    this.storage = storage;
    this.storageKey = storageKey;
    this.ttlMs = ttlMs;
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
          const card = await this.tcgdex.card(id);
          // Manche Karten haben auf Deutsch keine Preise, auf Englisch schon (McDonald's, Celebrations Klassische Kollektion, MEP …)
          const pricing = card.pricing?.cardmarket ? card.pricing : (await this.tcgdex.card(id, "en").catch(() => null))?.pricing;
          this.prices[id] = toPrice({ ...card, pricing });
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
