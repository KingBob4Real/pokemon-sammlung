import { ENTITY_TYPES } from "../config.js";
import { isObj, objOr } from "../core/format.js";

const keyOf = (type, id) => `${type}:${id}`;
const isValid = (e) => isObj(e) && ENTITY_TYPES.includes(e.type) && typeof e.id === "string" && Number.isSafeInteger(e.updated) && (e.deleted ? true : isObj(e.data));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Felder, die nur zusammen stimmen: copies ist so lang wie qty, cond/lang/paid sind das erste Exemplar
const LINKED_FIELDS = [["qty", "copies", "cond", "lang", "paid"]];
const fieldsOf = (field) => LINKED_FIELDS.find((group) => group.includes(field)) ?? [field];

/**
 * Lokaler Speicher aller synchronisierten Daten – das Repository auf dem Gerät.
 * Eintrag: { type, id, data, updated, deleted }; data = null heißt gelöscht.
 * Events: "change" nach eigenen Änderungen, "remote" wenn der Sync Neues gebracht hat,
 *         "storage-error" wenn das Gerät nicht speichern kann (Speicher voll / privater Modus).
 */
export class EntityStore extends EventTarget {
  #items = new Map();
  #dirty = new Set(); // noch nicht hochgeladen
  #base = new Map(); // Stand vor der eigenen Änderung (vom Server), für noch nicht hochgeladene Einträge – zum Zusammenführen
  #rev = 0; // letzter Server-Stand
  #batchDepth = 0;
  #batchChanged = false;
  clockOffset = 0; // Server-Uhr minus Geräte-Uhr (setzt der Sync) – Zeitstempel stimmen so auch bei falsch gehender Uhr

  constructor(storage, keys) {
    super();
    this.storage = storage;
    this.keys = keys;
    for (const [k, e] of Object.entries(objOr(storage.get(keys.entities, {})))) if (isValid(e) && keyOf(e.type, e.id) === k) this.#items.set(k, e);
    for (const k of [].concat(storage.get(keys.dirty, []))) if (this.#items.has(k)) this.#dirty.add(k);
    for (const [k, e] of Object.entries(objOr(storage.get(keys.base, {})))) if (this.#dirty.has(k) && (e === null || isValid(e))) this.#base.set(k, e);
    this.#rev = Number(storage.get(keys.rev, 0)) || 0;
  }

  get rev() {
    return this.#rev;
  }

  get pendingCount() {
    return this.#dirty.size;
  }

  get(type, id) {
    const e = this.#items.get(keyOf(type, id));
    return e && !e.deleted ? e.data : null;
  }

  all(type) {
    const out = [];
    for (const e of this.#items.values()) if (e.type === type && !e.deleted) out.push({ id: e.id, data: e.data });
    return out;
  }

  put(type, id, data) {
    const k = keyOf(type, id);
    const prev = this.#items.get(k);
    if (!this.#dirty.has(k)) this.#base.set(k, prev ?? null);
    this.#items.set(k, { type, id, data: data ?? null, deleted: data == null ? 1 : 0, updated: Math.max(Date.now() + this.clockOffset, (prev?.updated || 0) + 1) });
    this.#dirty.add(k);
    if (this.#batchDepth) this.#batchChanged = true;
    else this.#commit();
  }

  // Kartendaten in Sammlung und Listen nachbessern: fix(card) → geänderte Karte oder null. → Anzahl geändert
  fixCards(fix) {
    let count = 0;
    this.batch(() => {
      for (const e of [...this.#items.values()]) {
        const fixed = !e.deleted && e.data?.card && fix(e.data.card);
        if (!fixed) continue;
        this.put(e.type, e.id, { ...e.data, card: fixed });
        count++;
      }
    });
    return count;
  }

  // Viele Änderungen auf einmal: nur einmal speichern und melden
  batch(fn) {
    this.#batchDepth++;
    try {
      return fn();
    } finally {
      if (--this.#batchDepth === 0 && this.#batchChanged) {
        this.#batchChanged = false;
        this.#commit();
      }
    }
  }

  pendingChanges(limit) {
    return [...this.#dirty].slice(0, limit).map((k) => this.#items.get(k));
  }

  // Antwort des Servers übernehmen: pro Eintrag gewinnt der neuere Stand – außer bei eigenen, noch nicht hochgeladenen
  // Änderungen, die der Server inzwischen anders geändert hat: die werden Feld für Feld zusammengeführt (#merge).
  applySyncResult(sent, { rev, changes }) {
    const server = new Map();
    let changed = false;
    for (const e of changes) {
      if (!isValid(e)) continue;
      const k = keyOf(e.type, e.id);
      server.set(k, e);
      const local = this.#items.get(k);
      const merged = this.#dirty.has(k) ? this.#merge(k, local, e) : null;
      if (merged) {
        if (!same(merged.data, local.data)) changed = true;
        this.#items.set(k, merged);
        if (merged === e) this.#settle(k);
        else this.#base.set(k, e); // zusammengeführt, muss noch hoch – ab jetzt gegen diesen Server-Stand
        continue;
      }
      if (!local || e.updated > local.updated) changed = true;
      if (!local || e.updated >= local.updated) this.#items.set(k, e);
    }
    // hochgeladen = Server hat denselben oder einen neueren Stand (sonst wurde unterwegs weiter geändert)
    for (const e of sent) {
      const k = keyOf(e.type, e.id);
      if (server.has(k) && this.#items.get(k).updated <= server.get(k).updated) this.#settle(k);
    }
    this.#rev = rev;
    this.#persist();
    if (changed) this.dispatchEvent(new Event("remote"));
  }

  // Server hat seit dem Stand, auf dem die eigene Änderung beruht (base), selbst etwas geändert (anderes Gerät)? Dann
  // Feld für Feld: nur hier geändert → von hier, nur dort → vom Server, beides → die neuere Änderung. Z. B. Anzahl von
  // diesem Gerät, Ordner vom anderen. → zusammengeführter Eintrag, e (Server hat schon alles) oder null (neuerer gewinnt).
  // Löschen und neu Angelegtes führt nichts zusammen.
  #merge(k, local, e) {
    const base = this.#base.get(k);
    if (!base?.data || !local?.data || !e.data || e.updated <= base.updated) return null;
    const data = { ...e.data };
    const fields = new Set([...Object.keys(base.data), ...Object.keys(local.data), ...Object.keys(e.data)]);
    for (const group of new Set([...fields].map(fieldsOf))) {
      const changed = (side) => group.some((f) => !same(side[f], base.data[f]));
      if (changed(local.data) && (!changed(e.data) || local.updated > e.updated)) for (const f of group) data[f] = local.data[f];
    }
    return same(data, e.data) ? e : { ...local, data, updated: Math.max(local.updated, e.updated) + 1 };
  }

  #settle(k) {
    this.#dirty.delete(k);
    this.#base.delete(k);
  }

  // Sicherung einspielen: nur was neuer ist als der eigene Stand
  importEntities(entities) {
    let n = 0;
    for (const e of entities) {
      if (!isValid(e)) continue;
      const k = keyOf(e.type, e.id);
      if ((this.#items.get(k)?.updated ?? -1) >= e.updated) continue;
      this.#items.set(k, { type: e.type, id: e.id, data: e.deleted ? null : e.data, updated: e.updated, deleted: e.deleted ? 1 : 0 });
      this.#dirty.add(k);
      n++;
    }
    if (n) this.#commit();
    return n;
  }

  snapshot() {
    return [...this.#items.values()];
  }

  // Vom Server abgelehnter Eintrag: nicht mehr hochladen (bleibt auf dem Gerät), damit der Rest weiter synchronisiert
  markRejected(entity) {
    this.#settle(keyOf(entity.type, entity.id));
    this.#persist();
  }

  // Gerät leeren (z. B. beim Wechsel zu einer anderen Person); der nächste Sync holt alles neu
  reset() {
    this.#items.clear();
    this.#dirty.clear();
    this.#base.clear();
    this.#rev = 0;
    this.#persist();
    this.dispatchEvent(new Event("remote"));
  }

  get isEmpty() {
    return this.#items.size === 0;
  }

  #commit() {
    this.#persist();
    this.dispatchEvent(new Event("change"));
  }

  #persist() {
    const ok =
      this.storage.set(this.keys.entities, Object.fromEntries(this.#items)) &&
      this.storage.set(this.keys.dirty, [...this.#dirty]) &&
      this.storage.set(this.keys.base, Object.fromEntries(this.#base)) &&
      this.storage.set(this.keys.rev, this.#rev);
    if (!ok) this.dispatchEvent(new Event("storage-error"));
  }
}
