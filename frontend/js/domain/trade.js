// Tauschrechner: diese Cardmarket-Werte werden je Seite summiert – alle mischen Sprachen und Zustände (TCGdex).
export const TRADE_PRICES = [
  ["low", "ab"],
  ["avg1", "Ø 1 Tag"],
  ["avg7", "Ø 7 Tage"],
  ["avg30", "Ø 30 Tage"],
];

// Summe einer Seite je Preisart. items: [{ card, qty, own }] – own = eigener Preis pro Stück, zählt vor jedem Richtwert.
// priceOf(cardId) → Preis oder null → { low: { sum, unknown }, avg1: …, avg7: …, avg30: … } (unknown = Stück ohne Wert)
export function tradeSums(items, priceOf) {
  return Object.fromEntries(
    TRADE_PRICES.map(([key]) => {
      let [sum, unknown] = [0, 0];
      for (const it of items) {
        const value = it.own ?? priceOf(it.card.id)?.[key] ?? null;
        if (value == null) unknown += it.qty;
        else sum += value * it.qty;
      }
      return [key, { sum, unknown }];
    })
  );
}

// Wird die Karte zum Tausch angeboten? trade: true = ja (auch einzeln), false = nein (auch doppelt), leer = wenn doppelt.
// Dieselbe Regel steht im Backend (CollectionRepository.offers).
export const isOffered = (entry) => entry.qty > 0 && (entry.trade ?? entry.qty > 1);

// Die drei Einstellungen in der Kartenansicht und bei „Auswählen“
export const TRADE_CHOICES = [
  [null, "Wenn doppelt"],
  [true, "Ja, anbieten"],
  [false, "Nein, behalten"],
];

// Tauschen: Abgleich per Karten-ID – die Sprache zählt nicht.
//   person – vom Backend: { offers: [{ card, qty, cond, lang }], missing: [card] }
//   owned  – meine Sammlung [{ card, qty, cond, lang, trade }] (Anzahl > 0), wanted – Karten aus meinen Listen
// → { forMe: was die Person anbietet und mir fehlt, forThem: was ich anbiete und ihr fehlt }
export function tradeMatches(person, owned, wanted) {
  const have = new Set(owned.map((e) => e.card.id));
  const iMiss = new Set(wanted.filter((card) => !have.has(card.id)).map((card) => card.id));
  const theyMiss = new Set(person.missing.map((card) => card.id));
  return {
    forMe: person.offers.filter((d) => iMiss.has(d.card.id)),
    forThem: owned.filter((e) => isOffered(e) && theyMiss.has(e.card.id)).map(({ card, qty, cond, lang }) => ({ card, qty, cond, lang })),
  };
}
