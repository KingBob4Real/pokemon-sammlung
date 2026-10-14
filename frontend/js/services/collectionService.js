import { MAX_COPIES } from "../config.js";
import { isObj, positive } from "../core/format.js";
import { orderOf } from "../domain/sorting.js";

const cleanName = (name) => String(name ?? "").trim().slice(0, 80);

// --- Exemplare: jedes Stück mit eigenem Zustand, eigener Sprache und eigenem Kaufpreis ---
// Gespeichert nur, wenn sie sich unterscheiden (copies, genau qty Stück); sonst gelten cond/lang/paid für alle wie bisher.
// cond/lang/paid sind immer die des ersten Exemplars – für Tauschen, den Cardmarket-Link und ältere App-Fassungen.
const COPY_FIELDS = ["cond", "lang", "paid"];
const copyOf = (e) => ({ cond: e.cond, lang: e.lang, paid: e.paid ?? null });
const same = (x, y) => COPY_FIELDS.every((k) => (x[k] ?? null) === (y[k] ?? null));

// Alle Exemplare einer Karte, auch wenn sie gleich sind und nur als Anzahl gespeichert
export const copiesOf = (e) => e?.copies ?? Array.from({ length: e?.qty || 0 }, () => copyOf(e));

// Exemplare → Eintrag. ponytail: über MAX_COPIES (Backend: genauso) nur noch als Anzahl mit den Angaben des ersten –
// so viele verschiedene Stücke einer Karte hat niemand.
function withCopies(e, copies) {
  const first = copies[0] ?? copyOf(e);
  const differ = copies.length > 1 && copies.length <= MAX_COPIES && copies.some((c) => !same(c, first));
  return { ...e, ...first, qty: copies.length, copies: differ ? copies : null };
}

/**
 * Meine Sammlung: pro Karte Anzahl, Zustand, Sprache und Kaufpreis (auch je Exemplar, siehe oben), dazu Ordner und eigene Position.
 * Anzahl 0 = nicht vorhanden. Zustand & Kaufpreis bleiben dabei erhalten,
 * versehentlich entfernt ist also nichts verloren.
 * Ordner (Art „section“ – hießen früher Abteilungen, Daten unverändert) sind eigene Fächer der Sammlung, z. B. „Ordner 1“,
 * „Tauschkarten“ – eine Karte liegt in höchstens einem.
 */
export class CollectionService {
  constructor(store) {
    this.store = store;
  }

  entry(cardId) {
    return this.store.get("collection", cardId);
  }

  quantity(cardId) {
    return this.entry(cardId)?.qty || 0;
  }

  has(cardId) {
    return this.quantity(cardId) > 0;
  }

  entries() {
    return this.store
      .all("collection")
      .map((e) => e.data)
      .filter((e) => e.qty > 0 && isObj(e.card));
  }

  setQuantity(card, qty) {
    const prev = this.entry(card.id);
    const n = Math.max(0, Math.min(9999, qty));
    const next = { cond: "Near Mint", lang: "Deutsch", paid: null, ...prev, card, qty: n, added: prev && prev.qty > 0 ? prev.added : Date.now() };
    // einzeln erfasste Exemplare: weniger = die letzten weg, mehr = wie das letzte
    const copies = prev?.copies && (n <= prev.copies.length ? prev.copies.slice(0, n) : [...prev.copies, ...Array(n - prev.copies.length).fill(prev.copies.at(-1))]);
    this.store.put("collection", card.id, copies ? withCopies(next, copies) : next);
  }

  // Neue Exemplare mit eigenen Angaben (Scannen) – die vorhandenen bleiben, wie sie sind
  addCopies(card, n, copy) {
    const prev = this.entry(card.id);
    const have = prev?.qty || 0;
    if (have + n > MAX_COPIES) return this.setQuantity(card, have + n);
    const added = Array.from({ length: n }, () => ({ cond: "Near Mint", lang: "Deutsch", paid: null, ...copy }));
    const base = { ...prev, card, added: have ? prev.added : Date.now() };
    this.store.put("collection", card.id, withCopies(base, [...(have ? copiesOf(prev) : []), ...added]));
  }

  // Ein Exemplar ändern (patch: cond, lang, paid) bzw. herausnehmen
  setCopy(cardId, index, patch) {
    const e = this.entry(cardId);
    if (e) this.store.put("collection", cardId, withCopies(e, copiesOf(e).map((c, i) => (i === index ? { ...c, ...patch } : c))));
  }

  removeCopy(cardId, index) {
    const e = this.entry(cardId);
    if (e) this.store.put("collection", cardId, withCopies(e, copiesOf(e).filter((_, i) => i !== index)));
  }

  // Haken: rein (Anzahl 1) oder raus → beim Rausnehmen die Funktion für „Rückgängig“, sonst null
  toggle(card) {
    if (this.has(card.id)) return this.removeAll([card]);
    this.setQuantity(card, 1);
    return null;
  }

  // Mehrere Karten als vorhanden markieren (Anzahl mindestens 1)
  markOwned(cards) {
    this.store.batch(() => {
      for (const card of cards) if (!this.has(card.id)) this.setQuantity(card, 1);
    });
  }

  // Karten ganz aus der Sammlung nehmen (Anzahl 0) → Funktion, die alles zurückholt („Rückgängig“)
  removeAll(cards) {
    const before = cards.map((card) => [card.id, this.entry(card.id)]);
    this.store.batch(() => {
      for (const card of cards) this.setQuantity(card, 0);
    });
    // genau den alten Stand zurück – auch „hinzugefügt am“, sonst rutscht die Karte bei „Neueste“ nach vorn
    return () =>
      this.store.batch(() => {
        for (const [id, entry] of before) if (entry) this.store.put("collection", id, entry);
      });
  }

  // Verschiedene Karten je Set → Map(Set-ID → Anzahl). Für „Meine Sets“ und „x von y“ in der Set-Ansicht (gleiche Quelle)
  countBySet() {
    const counts = new Map();
    for (const e of this.entries()) counts.set(e.card.set, (counts.get(e.card.set) || 0) + 1);
    return counts;
  }

  // Zustand, Sprache oder Kaufpreis hier gelten für alle Exemplare
  update(cardId, patch) {
    const e = this.entry(cardId);
    if (!e) return;
    const forCopies = Object.fromEntries(Object.entries(patch).filter(([k]) => COPY_FIELDS.includes(k)));
    this.store.put("collection", cardId, e.copies ? withCopies({ ...e, ...patch }, e.copies.map((c) => ({ ...c, ...forCopies }))) : { ...e, ...patch });
  }

  // --- Eigene Reihenfolge (Drag & Drop) ---
  move(cardId, position) {
    const e = this.entry(cardId);
    if (e) this.store.put("collection", cardId, { ...e, position });
  }

  // Alle Positionen neu vergeben (wenn zwischen zwei Nachbarn kein Platz mehr ist)
  renumber(orderedCardIds) {
    this.store.batch(() => orderedCardIds.forEach((id, i) => this.move(id, (i + 1) * 1000)));
  }

  // --- Ordner (Art „section“) ---
  sections() {
    return this.store
      .all("section")
      .map(({ id, data }) => ({ id, ...data }))
      .sort((a, b) => orderOf(a) - orderOf(b));
  }

  createSection(name) {
    const n = cleanName(name);
    if (!n) return null;
    const id = crypto.randomUUID();
    this.store.put("section", id, { name: n, created: Date.now() });
    return id;
  }

  renameSection(id, name) {
    const section = this.store.get("section", id);
    const n = cleanName(name);
    if (section && n) this.store.put("section", id, { ...section, name: n });
  }

  // Ordner löschen: die Karten bleiben in der Sammlung, nur ohne Ordner
  removeSection(id) {
    this.store.batch(() => {
      for (const { id: cardId, data } of this.store.all("collection")) if (data.section === id) this.store.put("collection", cardId, { ...data, section: null });
      this.store.put("section", id, null);
    });
  }

  // Tauschen: true = anbieten, false = behalten, null = automatisch (wenn doppelt) – siehe domain/trade.js
  setTrade(cards, trade) {
    this.store.batch(() => {
      for (const card of cards) {
        const e = this.entry(card.id);
        if (e) this.store.put("collection", card.id, { ...e, trade });
      }
    });
  }

  // Karten in einen Ordner legen (null = aus dem Ordner nehmen)
  setSection(cards, sectionId) {
    this.store.batch(() => {
      for (const card of cards) {
        const e = this.entry(card.id);
        if (e) this.store.put("collection", card.id, { ...e, section: sectionId });
      }
    });
  }

  // Kennzahlen für die Übersicht (oder einen Ordner); valueOf(cardId) → Marktwert oder null
  summary(valueOf, entries = this.entries()) {
    const s = { count: 0, distinct: 0, worth: 0, unknown: 0, paid: 0, diff: 0, diffCount: 0 };
    for (const e of entries) {
      const value = valueOf(e.card.id);
      s.count += e.qty;
      s.distinct++;
      if (value == null) s.unknown++;
      else s.worth += value * e.qty;
      // Kaufpreis pro Exemplar; gleiche Exemplare als [Preis, Anzahl]
      let counted = false;
      for (const [p, n] of e.copies ? e.copies.map((c) => [c.paid, 1]) : [[e.paid, e.qty]]) {
        const paid = positive(p);
        if (paid == null) continue;
        s.paid += paid * n;
        if (value != null) {
          s.diff += (value - paid) * n;
          counted = true;
        }
      }
      if (counted) s.diffCount++;
    }
    return s;
  }
}
