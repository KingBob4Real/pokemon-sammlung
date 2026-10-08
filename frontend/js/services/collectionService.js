import { isObj, positive } from "../core/format.js";
import { orderOf } from "../domain/sorting.js";

const cleanName = (name) => String(name ?? "").trim().slice(0, 80);

/**
 * Meine Sammlung: pro Karte Anzahl, Zustand, Sprache und Kaufpreis, dazu Ordner und eigene Position.
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
    this.store.put("collection", card.id, {
      cond: "Near Mint",
      lang: "Deutsch",
      paid: null,
      ...prev,
      card,
      qty: Math.max(0, Math.min(9999, qty)),
      added: prev && prev.qty > 0 ? prev.added : Date.now(),
    });
  }

  toggle(card) {
    this.setQuantity(card, this.has(card.id) ? 0 : 1);
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

  update(cardId, patch) {
    const e = this.entry(cardId);
    if (e) this.store.put("collection", cardId, { ...e, ...patch });
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
      const paid = positive(e.paid);
      s.count += e.qty;
      s.distinct++;
      if (value == null) s.unknown++;
      else s.worth += value * e.qty;
      if (paid != null) {
        s.paid += paid * e.qty;
        if (value != null) {
          s.diff += (value - paid) * e.qty;
          s.diffCount++;
        }
      }
    }
    return s;
  }
}
