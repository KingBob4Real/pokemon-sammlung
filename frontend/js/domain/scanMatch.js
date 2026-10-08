import { norm } from "../core/format.js";
import { classicId, printedNumber, STAMPS } from "./card.js";

// Karten-Scanner: Erkanntes ({ name, number, total, setCode, stamp, confidence }) → Suchanfragen und beste Treffer.

// Nummer als Zahl, wenn sie nur aus Ziffern besteht („023“ → 23); „TG05“ → null
const numeric = (s) => (s != null && /^\d+$/.test(s) ? Number(s) : null);
// Namen vergleichen ohne Bindestriche, Leerzeichen, Akzente: „Glurak ex“ = „Glurak-ex“
const plain = (s) => norm(s).replace(/[^a-z0-9]/g, "");
// … und ohne Zusätze, die die KI mitliest oder TCGdex weglässt: „Palkia LV.X“ = „Palkia“, „Quajutsu TURBO“, „… LEGENDE“
export const baseName = (s) => plain(String(s).replace(/[\s-]*(lv\.?\s*x|legende|legend|turbo|break)\s*$/i, ""));

// Suchanfragen in dieser Reihenfolge, bis eine etwas findet: „MEW 199/165“ (Kürzel + Nummer: genau die Karte im Set),
// „Glurak-ex 199/165“, „199/165“, „Glurak-ex“. Promo ohne Setgröße: „MEP 91“, „91“. Englischer Name findet nichts → die
// Nummer allein hilft weiter. „CC12“ (Klassische Sammlung bei Limitless) zählt wie eine Nummer.
export function scanQueries({ name, number, total, setCode }) {
  const n = numeric(number);
  const num = n == null ? (classicId(number) ? number.toUpperCase() : null) : total ? `${n}/${Number(total)}` : String(n);
  return [...new Set([setCode && num && `${setCode} ${num}`, name && num && `${name} ${num}`, num, name].filter(Boolean))];
}

// Wie gut passt eine Karte zum Erkannten? Der Name zählt am meisten – den liest die KI zuverlässig, die winzige
// Nummer alter Karten nicht immer (verwechselt z. B. mit der Pokédex-Nummer). Dann Nummer, Set-Kürzel, Setgröße.
// Nachdrucke (Klassische Sammlung) tragen die Nummer des Originals – verglichen wird mit der.
export function matchScore(card, rec, setCode = null) {
  const n = numeric(rec.number);
  const [num, total] = printedNumber(card)?.split("/") ?? [card.num, card.total];
  let score = 0;
  if (rec.name) {
    const [a, b] = [plain(card.name), plain(rec.name)];
    if (a === b || baseName(card.name) === baseName(rec.name)) score += 4;
    else if (a.includes(b) || b.includes(a)) score += 2;
  }
  if (rec.number && (n != null ? parseInt(num, 10) === n : norm(num) === norm(rec.number) || classicId(rec.number) === card.id)) score += 3;
  if (rec.setCode && setCode && setCode.toUpperCase() === rec.setCode) score += 3;
  if (rec.total && total) score += Number(total) === Number(rec.total) ? 2 : -2; // „/102“ gelesen → keine Karte aus einem 165er-Set
  // Jubiläums-Logo („25“/„30“, null = keins gesehen; fehlt bei älterem Backend) trennt Nachdruck und Original (Grundset-Glurak
  // 4/102) – zählt mehr als der Name, weil der englisch gelesene Name („Charizard“) den deutschen Nachdruck („Glurak“) verfehlt
  if (rec.stamp !== undefined && STAMPS[card.set]) score += STAMPS[card.set] === rec.stamp ? 5 : -5;
  return score;
}

// Beste zuerst; bei Gleichstand bleibt die Reihenfolge der Suche (neueste Sets zuerst).
// sure: eindeutig genug, um direkt die Bestätigung zu zeigen (sonst Auswahl).
export function rankMatches(cards, rec, setCodeOf = () => null) {
  const ranked = cards
    .map((card, i) => ({ card, i, score: matchScore(card, rec, setCodeOf(card.set)) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  const [best, next] = ranked;
  const sure = Boolean(best) && rec.confidence >= 0.5 && best.score >= 6 && (!next || best.score > next.score);
  return { cards: ranked.map((r) => r.card), sure };
}
