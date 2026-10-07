import { numCmp } from "../core/format.js";

// Sortierungen für Sammlung und Listen. Einträge haben { card, added }.
// valueOf(cardId) → Marktwert, setOrder(setId) → Erscheinungsreihenfolge (höher = neuer)
export function createSorters({ valueOf, setOrder }) {
  const bySet = (a, b) => setOrder(b.card.set) - setOrder(a.card.set) || a.card.set.localeCompare(b.card.set) || numCmp(a.card.num, b.card.num);
  return {
    newest: { label: "Neueste zuerst", compare: (a, b) => b.added - a.added },
    order: { label: "Reihenfolge", compare: (a, b) => a.added - b.added },
    value: { label: "Höchster Wert", compare: (a, b) => (valueOf(b.card.id) ?? -1) - (valueOf(a.card.id) ?? -1) },
    name: { label: "Name", compare: (a, b) => a.card.name.localeCompare(b.card.name, "de") || bySet(a, b) },
    set: { label: "Set & Nummer", compare: bySet },
  };
}
