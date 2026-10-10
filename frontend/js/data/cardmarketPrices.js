// Cardmarket-Preise für Karten, die TCGdex keinem Cardmarket-Produkt zuordnet – liegt täglich neben der App
// (scripts/cardmarket.mjs prices im Pages-Workflow). Fehlt die Datei (z. B. lokal) oder klappt der Abruf nicht: kein Ersatz.
// → { updated, prices: { tcgdexId: { id, avg1, avg7, avg30, low } } }
export const fetchCardmarketPrices = (fetchJson, url = "data/cardmarket-prices.json") =>
  fetchJson(url).then(
    (data) => ({ updated: data.updated ?? null, prices: data.prices ?? {} }),
    () => ({ updated: null, prices: {} })
  );
