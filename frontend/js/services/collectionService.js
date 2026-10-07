import { isObj, positive } from "../core/format.js";

/**
 * Meine Sammlung: pro Karte Anzahl, Zustand, Sprache und Kaufpreis.
 * Anzahl 0 = nicht vorhanden. Zustand & Kaufpreis bleiben dabei erhalten,
 * versehentlich entfernt ist also nichts verloren.
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

  update(cardId, patch) {
    const e = this.entry(cardId);
    if (e) this.store.put("collection", cardId, { ...e, ...patch });
  }

  // Kennzahlen für die Übersicht; valueOf(cardId) → Marktwert oder null
  summary(valueOf) {
    const s = { count: 0, distinct: 0, worth: 0, unknown: 0, paid: 0, diff: 0, diffCount: 0 };
    for (const e of this.entries()) {
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
