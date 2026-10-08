// Zugriff auf die TCGdex-API (Karten, Sets, Preise). Kostenlos, ohne Schlüssel.
// lang: "de" oder "en" – englische Daten sind vollständiger (mehr Sets, mehr Bilder).
export class TcgdexClient {
  constructor(baseUrl, fetchJson) {
    this.baseUrl = baseUrl;
    this.fetchJson = fetchJson;
  }

  #get(path, timeout) {
    return this.fetchJson(`${this.baseUrl}${path}`, { timeout });
  }

  sets(lang = "de") {
    return this.#get(`/${lang}/sets`);
  }

  // Welches Set gehört zu welcher Serie? → { setId: serieId } (die Serie steckt in den Bild-Adressen)
  async setSeries() {
    const series = await this.#get("/en/series");
    const full = await Promise.all(series.map((s) => this.#get(`/en/series/${encodeURIComponent(s.id)}`)));
    return Object.fromEntries(full.flatMap((s) => (s.sets || []).map((set) => [set.id, s.id])));
  }

  searchByName(name, lang = "de") {
    return this.#get(`/${lang}/cards?name=${encodeURIComponent(name)}`, 15000);
  }

  // Filter ist „enthält“: 23 findet auch 123 – die genaue Prüfung macht der CatalogService
  searchByNumber(number, lang = "de") {
    return this.#get(`/${lang}/cards?localId=${encodeURIComponent(number)}`, 15000);
  }

  // Deutsch, sonst Englisch (Sets, die es nur auf Englisch gibt)
  async set(setId) {
    try {
      return await this.#get(`/de/sets/${encodeURIComponent(setId)}`, 15000);
    } catch {
      return await this.#get(`/en/sets/${encodeURIComponent(setId)}`, 15000);
    }
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
