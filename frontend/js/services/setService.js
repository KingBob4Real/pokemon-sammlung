import { isObj } from "../core/format.js";

// Die Serie steht in der Adresse von Symbol/Logo: …/univ/<serie>/<set>/symbol oder …/de/<serie>/<set>/logo
const serieOf = (set) => (set.symbol || set.logo || "").match(/\/(?:univ|[a-z]{2})\/([^/]+)\/[^/]+\/(?:symbol|logo)$/)?.[1] || null;

/**
 * Alle deutschen Sets (eine Woche zwischengespeichert), ohne TCG Pocket.
 * Reihenfolge = Erscheinen (TCGdex liefert die ältesten zuerst).
 */
export class SetService {
  #data = null;
  #codes = new Map(); // Set → Promise des Kürzels

  constructor(tcgdex, storage, storageKey, ttlMs, pocketSerie) {
    this.tcgdex = tcgdex;
    this.storage = storage;
    this.storageKey = storageKey;
    this.ttlMs = ttlMs;
    this.pocketSerie = pocketSerie;
    this.ready = this.#load();
  }

  get loaded() {
    return this.#data != null;
  }

  all() {
    return this.#data?.list || [];
  }

  info(setId) {
    return this.#data?.index.get(setId) || null;
  }

  order(setId) {
    return this.info(setId)?.order ?? -1;
  }

  isPocket(setId) {
    return this.#data?.pocket.has(setId) || false;
  }

  // Offizielles Kürzel wie auf der Karte (z. B. „MEW“). Steht nur in den vollen Set-Daten → bei Bedarf laden.
  abbreviation(setId) {
    if (!this.#codes.has(setId)) this.#codes.set(setId, this.tcgdex.set(setId).then((s) => s.abbreviation?.official || null, () => (this.#codes.delete(setId), null)));
    return this.#codes.get(setId);
  }

  async #load() {
    const cached = this.storage.get(this.storageKey, null);
    if (isObj(cached) && Array.isArray(cached.list)) this.#use(cached);
    if (this.loaded && Date.now() - cached.at < this.ttlMs) return;
    try {
      const [all, pocket] = await Promise.all([this.tcgdex.sets(), this.tcgdex.serieSetIds(this.pocketSerie)]);
      const list = all
        .filter((s) => !pocket.includes(s.id))
        .map((s) => ({ id: s.id, name: s.name, serie: serieOf(s), total: s.cardCount?.total ?? null, official: s.cardCount?.official ?? null }));
      const data = { at: Date.now(), list, pocket };
      this.storage.set(this.storageKey, data);
      this.#use(data);
    } catch {
      /* offline: alter Stand bleibt */
    }
  }

  #use(data) {
    this.#data = {
      list: data.list,
      pocket: new Set(data.pocket || []),
      index: new Map(data.list.map((s, i) => [s.id, { ...s, order: i }])),
    };
  }
}
