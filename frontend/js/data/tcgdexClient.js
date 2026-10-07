// Zugriff auf die TCGdex-API (Karten, Sets, Preise). Kostenlos, ohne Schlüssel.
export class TcgdexClient {
  constructor(baseUrl, fetchJson) {
    this.baseUrl = baseUrl;
    this.fetchJson = fetchJson;
  }

  #get(path, timeout) {
    return this.fetchJson(`${this.baseUrl}${path}`, { timeout });
  }

  sets() {
    return this.#get("/de/sets");
  }

  async serieSetIds(serieId) {
    const serie = await this.#get(`/de/series/${encodeURIComponent(serieId)}`);
    return (serie.sets || []).map((s) => s.id);
  }

  searchByName(name) {
    return this.#get(`/de/cards?name=${encodeURIComponent(name)}`, 15000);
  }

  // Filter ist „enthält“: 23 findet auch 123 – die genaue Prüfung macht der SearchService
  searchByNumber(number) {
    return this.#get(`/de/cards?localId=${encodeURIComponent(number)}`, 15000);
  }

  set(setId) {
    return this.#get(`/de/sets/${encodeURIComponent(setId)}`, 15000);
  }

  // Deutsche Daten, sonst englische (manche Karten gibt es auf Deutsch nicht vollständig)
  async card(cardId) {
    try {
      return await this.#get(`/de/cards/${encodeURIComponent(cardId)}`);
    } catch {
      return await this.#get(`/en/cards/${encodeURIComponent(cardId)}`);
    }
  }
}
