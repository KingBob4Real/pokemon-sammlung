// Zugriff aufs eigene Backend: GET /trade – Doppelte und fehlende Karten der anderen Personen.
export class TradeApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { people: [{ id, name, offers: [{ card, qty, cond, lang }], missing: [card] }] } – offers: doppelt oder „Tauschen: ja“
  trade({ url, key }) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/trade`, { timeout: 15000, headers: { Authorization: `Bearer ${key}` } });
  }
}
