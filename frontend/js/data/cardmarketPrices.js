// Cardmarkets Preisliste von heute – liegt täglich neben der App (scripts/cardmarket.mjs prices im Pages-Workflow):
//   prices   – Karten, die TCGdex keinem Cardmarket-Produkt zuordnet
//   products – alle Einzelkarten nach Produkt-ID, damit bekannte Karten nicht einzeln bei TCGdex fragen müssen
// Fehlt die Datei (z. B. lokal) oder klappt der Abruf nicht: leer, dann fragt die App wie gehabt TCGdex.
// → { updated, prices: { tcgdexId: { id, avg1, avg7, avg30, low } }, products: { idProduct: [avg1, avg7, avg30, low] } }
export const fetchCardmarketPrices = (fetchJson, url = "data/cardmarket-prices.json") =>
  fetchJson(url, { timeout: 30000 }).then(
    (data) => ({ updated: data.updated ?? null, prices: data.prices ?? {}, products: data.products ?? {} }),
    () => ({ updated: null, prices: {}, products: {} })
  );
