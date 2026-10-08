import { rankMatches, scanQueries } from "../domain/scanMatch.js";

const MAX_CHOICES = 6;
const CODE_LOOKUPS = 8; // Set-Kürzel nur für die Sets der besten Treffer nachladen

/**
 * Karten-Scanner: Foto verkleinern → Backend liest Name/Nummer → passende Karten im Katalog.
 * Zwei Schritte, damit bei einem Fehler in der Suche nicht nochmal gescannt (und gezählt) werden muss.
 */
export class ScanService {
  constructor(api, sync, catalog, sets, shrinkPhoto) {
    this.api = api;
    this.sync = sync;
    this.catalog = catalog;
    this.sets = sets;
    this.shrinkPhoto = shrinkPhoto;
  }

  // Scannen geht nur mit Sync-Schlüssel (das Backend zählt pro Person)
  get ready() {
    return this.sync.enabled;
  }

  // Wie viele Scans heute noch gehen (null = noch unbekannt). Jeder Scan bringt den neuen Stand mit.
  remaining = null;

  async usage() {
    this.remaining = (await this.api.usage(this.sync.config)).remaining;
    return this.remaining;
  }

  // Foto → { name, number, total, setCode, language, confidence }. Unlesbares Foto: Fehler mit .photo
  async recognize(file) {
    const image = await this.shrinkPhoto(file).catch((e) => Promise.reject(Object.assign(new Error("Foto nicht lesbar"), { photo: true, cause: e })));
    try {
      const result = await this.api.scan(this.sync.config, image);
      // Antworten paralleler Scans kommen durcheinander an → nur nach unten zählen (usage() setzt neu)
      if (Number.isInteger(result.remaining)) this.remaining = Math.min(this.remaining ?? Infinity, result.remaining);
      return result.recognized;
    } catch (e) {
      if (Number.isInteger(e.body?.remaining)) this.remaining = e.body.remaining; // 429: 0
      throw e;
    }
  }

  // Erkanntes → { cards: beste zuerst (höchstens 6), sure }.
  // Sucht weiter, bis ein Treffer eindeutig ist – eine falsch gelesene Nummer findet sonst nur fremde Karten.
  // Kürzel + Nummer kommt zuerst (genau die Karte im Set) – dafür die Kürzel der besten Treffer schon nach jeder Suche laden.
  async match(rec) {
    const byId = new Map();
    const codes = new Map();
    let result = { cards: [], sure: false };
    for (const query of scanQueries(rec)) {
      for (const card of await this.catalog.search(query)) if (!byId.has(card.id)) byId.set(card.id, card);
      const found = [...byId.values()];
      if (rec.setCode) {
        const setIds = [...new Set(rankMatches(found, rec).cards.map((c) => c.set))].slice(0, CODE_LOOKUPS).filter((id) => !codes.has(id));
        await Promise.all(setIds.map(async (id) => codes.set(id, await this.sets.abbreviation(id))));
      }
      result = rankMatches(found, rec, (id) => codes.get(id));
      if (result.sure) break;
    }
    return { cards: result.cards.slice(0, MAX_CHOICES), sure: result.sure };
  }
}
