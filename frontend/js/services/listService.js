import { isObj } from "../core/format.js";

const itemId = (listId, cardId) => `${listId}:${cardId}`;
const cleanName = (name) => String(name ?? "").trim().slice(0, 80);

// Eigene Listen und welche Karten darin stehen. „Vorhanden“ entscheidet die Sammlung, nicht die Liste.
export class ListService {
  constructor(store) {
    this.store = store;
  }

  all() {
    return this.store
      .all("list")
      .map(({ id, data }) => ({ id, ...data }))
      .sort((a, b) => a.created - b.created);
  }

  get(id) {
    const data = this.store.get("list", id);
    return data ? { id, ...data } : null;
  }

  create(name) {
    const n = cleanName(name);
    if (!n) return null;
    const id = crypto.randomUUID();
    this.store.put("list", id, { name: n, created: Date.now() });
    return id;
  }

  rename(id, name) {
    const list = this.store.get("list", id);
    const n = cleanName(name);
    if (list && n) this.store.put("list", id, { ...list, name: n });
  }

  // Liste samt Einträgen löschen; die Karten bleiben in der Sammlung
  remove(id) {
    this.store.batch(() => {
      for (const item of this.items(id)) this.store.put("listItem", itemId(id, item.card.id), null);
      this.store.put("list", id, null);
    });
  }

  items(listId) {
    return this.store
      .all("listItem")
      .map((e) => e.data)
      .filter((i) => i.list === listId && isObj(i.card));
  }

  allItems() {
    return this.store.all("listItem").map((e) => e.data).filter((i) => isObj(i.card));
  }

  removeCards(listId, cards) {
    this.store.batch(() => {
      for (const card of cards) this.store.put("listItem", itemId(listId, card.id), null);
    });
  }

  contains(listId, cardId) {
    return this.store.get("listItem", itemId(listId, cardId)) != null;
  }

  setMembership(listId, card, member) {
    this.store.put("listItem", itemId(listId, card.id), member ? { list: listId, card, added: Date.now() } : null);
  }

  // Für Importe: anlegen, was fehlt – mehrfach ausführen erzeugt nichts doppelt
  ensure(id, name, created) {
    if (!this.store.get("list", id)) this.store.put("list", id, { name: cleanName(name) || id, created });
  }

  addIfMissing(listId, card, added) {
    if (!this.contains(listId, card.id)) this.store.put("listItem", itemId(listId, card.id), { list: listId, card, added });
  }

  // isOwned(cardId), valueOf(cardId) → Fortschritt und was noch fehlt
  progress(listId, isOwned, valueOf) {
    const items = this.items(listId);
    const missing = items.filter((i) => !isOwned(i.card.id)).map((i) => valueOf(i.card.id));
    const known = missing.filter((v) => v != null);
    return {
      total: items.length,
      have: items.length - missing.length,
      missing: missing.length,
      missingKnown: known.length,
      missingValue: known.reduce((sum, v) => sum + v, 0),
    };
  }
}
