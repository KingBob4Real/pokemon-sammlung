import { numCmp } from "../core/format.js";

// Eigene Reihenfolge: gesetzte Position (Drag & Drop), sonst Zeitpunkt des Hinzufügens
export const orderOf = (entry) => entry.position ?? entry.added ?? entry.created ?? 0;

// Neue Position zwischen zwei Nachbarn (oder davor/dahinter); null = Nachbarn gleich, alles neu durchnummerieren
export function positionBetween(before, after) {
  if (before == null && after == null) return Date.now();
  if (before == null) return after - 1000;
  if (after == null) return before + 1000;
  return after - before > 1e-6 ? (before + after) / 2 : null;
}

// Sortierungen für Sammlung und Listen. Einträge haben { card, added, position? }.
// valueOf(cardId) → Marktwert, setOrder(setId) → Erscheinungsreihenfolge (höher = neuer)
export function createSorters({ valueOf, setOrder }) {
  const bySet = (a, b) => setOrder(b.card.set) - setOrder(a.card.set) || a.card.set.localeCompare(b.card.set) || numCmp(a.card.num, b.card.num);
  return {
    newest: { label: "Neueste zuerst", compare: (a, b) => b.added - a.added },
    order: { label: "Eigene Reihenfolge", compare: (a, b) => orderOf(a) - orderOf(b) },
    value: { label: "Höchster Wert", compare: (a, b) => (valueOf(b.card.id) ?? -1) - (valueOf(a.card.id) ?? -1) },
    name: { label: "Name", compare: (a, b) => a.card.name.localeCompare(b.card.name, "de") || bySet(a, b) },
    set: { label: "Set & Nummer", compare: bySet },
  };
}
