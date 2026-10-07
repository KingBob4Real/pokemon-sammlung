import { numCmp } from "../core/format.js";
import { setIdOf, toCard } from "../domain/card.js";

// „glurak“, „199“, „199/165“, „#199“ oder „glurak 199“ → { words, number, total }
export function parseQuery(query) {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  const numberToken = tokens.find((t) => /^#?\d+(\/\d+)?$/.test(t));
  const [number = null, total = null] = numberToken ? numberToken.replace("#", "").split("/").map(Number) : [];
  return { words: tokens.filter((t) => t !== numberToken).join(" "), number, total };
}

// Kartenkatalog: alle deutschen Karten durchsuchen oder ein Set anzeigen.
export class CatalogService {
  constructor(tcgdex, sets) {
    this.tcgdex = tcgdex;
    this.sets = sets;
  }

  async search(query) {
    const { words, number, total } = parseQuery(query);
    if (!words && number == null) return [];
    await this.sets.ready;
    const found = words ? await this.tcgdex.searchByName(words) : await this.tcgdex.searchByNumber(number);
    return found
      .filter((c) => c && c.id && c.localId != null && !this.sets.isPocket(setIdOf(c)))
      .filter((c) => number == null || parseInt(c.localId, 10) === number)
      .filter((c) => !total || this.sets.info(setIdOf(c))?.official === total)
      .map((c) => toCard(c, (id) => this.sets.info(id)))
      .sort((a, b) => this.sets.order(b.set) - this.sets.order(a.set) || numCmp(a.num, b.num));
  }

  async setCards(setId) {
    const data = await this.tcgdex.set(setId);
    const set = { id: setId, name: data.name, cardCount: data.cardCount };
    return {
      name: data.name,
      cards: (data.cards || []).map((c) => toCard({ ...c, set }, () => null)).sort((a, b) => numCmp(a.num, b.num)),
    };
  }
}
