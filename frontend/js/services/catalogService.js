import { numCmp } from "../core/format.js";
import { setIdOf, toCard } from "../domain/card.js";

// „glurak“, „199“, „199/165“, „#199“, „glurak 199“ oder „MEW 199“ → { words, number, total, code }
// code: kurzes Wort neben der Nummer könnte ein Set-Kürzel sein („BS 11“, „ASC 017“) – „Mew 151“ ist beides
export function parseQuery(query) {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  const numberToken = tokens.find((t) => /^#?\d+(\/\d+)?$/.test(t));
  const [number = null, total = null] = numberToken ? numberToken.replace("#", "").split("/").map(Number) : [];
  const words = tokens.filter((t) => t !== numberToken).join(" ");
  return { words, number, total, code: number != null && /^[a-z][a-z0-9]{1,4}$/i.test(words) ? words.toUpperCase() : null };
}

// Kartenkatalog: alle Karten auf Deutsch und Englisch durchsuchen oder ein Set anzeigen.
// Gibt es eine Karte in beiden Sprachen, gewinnt die deutsche (Name, Bild); „Charizard“ findet die englischen.
export class CatalogService {
  #recent = new Map(); // Suche → Ergebnis, damit Zurück-Tippen sofort geht
  constructor(tcgdex, sets) {
    this.tcgdex = tcgdex;
    this.sets = sets;
  }

  async search(query) {
    const key = query.trim().toLowerCase();
    if (!this.#recent.has(key)) {
      this.#recent.set(key, this.#search(query).catch((e) => (this.#recent.delete(key), Promise.reject(e))));
      if (this.#recent.size > 30) this.#recent.delete(this.#recent.keys().next().value);
    }
    return this.#recent.get(key);
  }

  async #search(query) {
    const { words, number, total, code } = parseQuery(query);
    if (!words && number == null) return [];
    const byCode = code ? this.#byCode(code, number).catch(() => []) : [];
    // Set-Liste und beide Sprachen gleichzeitig laden statt nacheinander
    const find = (lang) => (words ? this.tcgdex.searchByName(words, lang) : this.tcgdex.searchByNumber(number, lang));
    const [de, en] = await Promise.allSettled([find("de"), find("en"), this.sets.ready]);
    if (de.status === "rejected" && en.status === "rejected") throw de.reason;
    const byId = new Map();
    for (const c of [...(de.value || []), ...(en.value || [])]) if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
    const found = [...byId.values()]
      .filter((c) => c && c.id && c.localId != null && !this.sets.isPocket(setIdOf(c)))
      .filter((c) => number == null || parseInt(c.localId, 10) === number)
      .filter((c) => !total || this.sets.info(setIdOf(c))?.official === total)
      .map((c) => toCard(c, (id) => this.sets.info(id)))
      .sort((a, b) => this.sets.order(b.set) - this.sets.order(a.set) || numCmp(a.num, b.num));
    // Treffer übers Set-Kürzel zuerst (genau diese Karte), dann die übers Wort als Name
    const exact = await byCode;
    return [...exact, ...found.filter((c) => !exact.some((e) => e.id === c.id))];
  }

  // Karte Nummer n in den Sets mit diesem Kürzel
  async #byCode(code, number) {
    const sets = await this.tcgdex.setsByCode(code);
    const full = await Promise.all(sets.filter((s) => !this.sets.isPocket(s.id)).map((s) => this.tcgdex.set(s.id)));
    return full.flatMap((data) => {
      const set = { id: data.id, name: data.name, cardCount: data.cardCount, serie: data.serie };
      return (data.cards || []).filter((c) => parseInt(c.localId, 10) === number).map((c) => toCard({ ...c, set }, (id) => this.sets.info(id)));
    });
  }

  async setCards(setId) {
    const data = await this.tcgdex.set(setId);
    const set = { id: setId, name: data.name, cardCount: data.cardCount, serie: data.serie };
    return {
      name: data.name,
      cards: (data.cards || []).map((c) => toCard({ ...c, set }, () => null)).sort((a, b) => numCmp(a.num, b.num)),
    };
  }
}
