import { objOr } from "../core/format.js";
import { marketValue, toPrice } from "../domain/price.js";

/**
 * Cardmarket-Richtwerte über TCGdex, pro Karte zwischengespeichert.
 * request(ids) lädt fehlende/alte Preise im Hintergrund (6 parallel) und meldet "update".
 */
export class PriceService extends EventTarget {
  #queue = new Set();
  #running = false;

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

  request(cardIds) {
    for (const id of cardIds) {
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
    const worker = async () => {
      while (this.#queue.size) {
        const id = this.#queue.values().next().value;
        this.#queue.delete(id);
        try {
          this.prices[id] = toPrice(await this.tcgdex.card(id));
        } catch {
          /* alter Wert bleibt */
        }
        if (++done % 15 === 0) this.#notify();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    this.storage.set(this.storageKey, this.prices);
    this.#running = false;
    this.#notify();
  }

  #notify() {
    this.dispatchEvent(new Event("update"));
  }
}
