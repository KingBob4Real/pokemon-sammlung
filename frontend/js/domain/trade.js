// Tauschen: Abgleich per Karten-ID – die Sprache zählt nicht.
//   person – vom Backend: { duplicates: [{ card, qty, cond, lang }], missing: [card] }
//   owned  – meine Sammlung [{ card, qty, cond, lang }] (Anzahl > 0), wanted – Karten aus meinen Listen
// → { forMe: was die Person doppelt hat und mir fehlt, forThem: was ich doppelt habe und ihr fehlt }
export function tradeMatches(person, owned, wanted) {
  const have = new Set(owned.map((e) => e.card.id));
  const iMiss = new Set(wanted.filter((card) => !have.has(card.id)).map((card) => card.id));
  const theyMiss = new Set(person.missing.map((card) => card.id));
  return {
    forMe: person.duplicates.filter((d) => iMiss.has(d.card.id)),
    forThem: owned.filter((e) => e.qty > 1 && theyMiss.has(e.card.id)).map(({ card, qty, cond, lang }) => ({ card, qty, cond, lang })),
  };
}
