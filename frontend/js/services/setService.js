import { isObj, norm } from "../core/format.js";

/**
 * Alle Sets auf Deutsch und Englisch (eine Woche zwischengespeichert), ohne TCG Pocket.
 * Grundlage ist die englische Liste (vollständig, älteste zuerst); deutsche Namen haben Vorrang.
 * Set: { id, name, alt (englischer Name, falls anders), en (nur auf Englisch), serie, total, official }
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

  // Sets, deren Name (deutsch oder englisch) alle Wörter enthält: „erhabene helden“, „evolving skies“
  search(query) {
    const words = norm(query).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return this.all().filter((s) => words.every((w) => norm(`${s.name} ${s.alt || ""}`).includes(w)));
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
      const [en, de, serieOf] = await Promise.all([this.tcgdex.sets("en"), this.tcgdex.sets("de"), this.tcgdex.setSeries()]);
      const data = { at: Date.now(), ...mergeSets(en, de, serieOf, this.pocketSerie) };
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

// Englische und deutsche Set-Liste zusammenführen → { list, pocket }
export function mergeSets(en, de, serieOf, pocketSerie) {
  const german = new Map(de.map((s) => [s.id, s]));
  const list = [];
  const pocket = [];
  for (const s of [...en, ...de.filter((d) => !en.some((e) => e.id === d.id))]) {
    if (serieOf[s.id] === pocketSerie) {
      pocket.push(s.id);
      continue;
    }
    const d = german.get(s.id);
    const count = (d || s).cardCount;
    list.push({ id: s.id, name: d?.name || s.name, alt: d && d.name !== s.name ? s.name : null, en: !d, serie: serieOf[s.id] || null, total: count?.total ?? null, official: count?.official ?? null });
  }
  return { list, pocket };
}
