import { norm } from "../core/format.js";

// Karten-Scanner: Erkanntes ({ name, number, total, setCode, confidence }) → Suchanfragen und beste Treffer.

// Nummer als Zahl, wenn sie nur aus Ziffern besteht („023“ → 23); „TG05“ → null
const numeric = (s) => (s != null && /^\d+$/.test(s) ? Number(s) : null);

// Suchanfragen in dieser Reihenfolge, bis eine etwas findet: „Glurak-ex 199/165“, „199/165“, „Glurak-ex“.
// Promo ohne Setgröße: nur „50“. Englischer Name findet nichts → die Nummer allein hilft weiter.
export function scanQueries({ name, number, total }) {
  const n = numeric(number);
  const num = n == null ? null : total ? `${n}/${Number(total)}` : String(n);
  return [...new Set([name && num && `${name} ${num}`, num, name].filter(Boolean))];
}

// Wie gut passt eine Karte zum Erkannten? Nummer zählt am meisten, dann Set-Kürzel, Setgröße, Name.
export function matchScore(card, rec, setCode = null) {
  const n = numeric(rec.number);
  let score = 0;
  if (rec.number && (n != null ? parseInt(card.num, 10) === n : norm(card.num) === norm(rec.number))) score += 4;
  if (rec.setCode && setCode && setCode.toUpperCase() === rec.setCode) score += 3;
  if (rec.total && card.total === Number(rec.total)) score += 2;
  if (rec.name) {
    const [a, b] = [norm(card.name), norm(rec.name)];
    if (a === b) score += 2;
    else if (a.includes(b) || b.includes(a)) score += 1;
  }
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
