// Zugriff aufs eigene Backend: GET /trade – Doppelte und fehlende Karten der anderen Personen.
export class TradeApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { people: [{ id, name, duplicates: [{ card, qty, cond, lang }], missing: [card] }] }
  trade({ url, key }) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/trade`, { timeout: 15000, headers: { Authorization: `Bearer ${key}` } });
  }
}
