import { numCmp } from "../core/format.js";
import { classicId, germanName, pokemonName, printedNumber, reprintIds, setIdOf, toCard } from "../domain/card.js";
import { baseName } from "../domain/scanMatch.js";

// „glurak“, „199“, „199/165“, „#199“, „glurak 199“, „MEW 199“, „30C 158“ oder „CC12“ → { words, number, total, code, cc }
// code: kurzes Wort neben der Nummer könnte ein Set-Kürzel sein („BS 11“, „ASC 017“) – „Mew 151“ ist beides
// cc: Nummer der Klassischen Sammlung bei Limitless („CC12“, auch „30C CC12“)
export function parseQuery(query) {
  const tokens = String(query).trim().split(/\s+/).filter(Boolean);
  const cc = tokens.find((t) => classicId(t)) ?? null;
  const numberToken = tokens.find((t) => /^#?\d+(\/\d+)?$/.test(t));
  const [number = null, total = null] = numberToken ? numberToken.replace("#", "").split("/").map(Number) : [];
  const words = tokens.filter((t) => t !== numberToken && t !== cc).join(" ");
  const code = number != null && /^(?=.*[a-z])[a-z0-9]{2,5}$/i.test(words) ? words.toUpperCase() : null;
  return { words, number, total, code, cc: cc && cc.toUpperCase() };
}

// Lohnt eine Suche? Ein einzelner Buchstabe findet bei TCGdex alles, was ihn enthält (für „g“ ~1,2 MB auf Deutsch und
// Englisch) – darum ab 2 Zeichen oder mit Nummer. ponytail: die Trainerkarte „N“ findet man mit Nummer („N 96“).
export function searchable(query) {
  const { words, number, cc } = parseQuery(query);
  return number != null || cc != null || words.length >= 2;
}

// Passt die Nummer (und Setgröße)? Nachdrucke tragen die Nummer des Originals („106/106“)
function hasNumber(card, number, total) {
  const [num, t] = printedNumber(card)?.split("/") ?? [card.num, card.total];
  return parseInt(num, 10) === number && (!total || Number(t) === total);
}

const shortest = (cards) => cards.map((c) => c.name).sort((a, b) => a.length - b.length)[0] ?? null;

// Kartenkatalog: alle Karten auf Deutsch und Englisch durchsuchen oder ein Set anzeigen.
// Gibt es eine Karte in beiden Sprachen, gewinnt die deutsche (Name, Bild); „Charizard“ findet die englischen.
// Manche Karten hat TCGdex nur auf Englisch, obwohl es sie auf Deutsch gibt (z. B. MEP 091 Mega-Dragoran-ex) –
// die findet der deutsche Name über die Pokédex-Nummer, angezeigt mit deutschem Namen.
export class CatalogService {
  #recent = new Map(); // Suche → Ergebnis, damit Zurück-Tippen sofort geht
  #setCache = new Map(); // Set → Karten (für Kürzel-Suche und Nachdrucke)
  #dexCache = new Map(); // „de:149“ → Karten dieses Pokémon
  #englishOnly = new Set(); // Karten, die es bei TCGdex nur auf Englisch gibt (Set gibt es auch auf Deutsch)

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
    const { words, number, total, code, cc } = parseQuery(query);
    if (cc) return this.#cards([classicId(cc)]); // „CC12“, „30C CC12“: genau diese Karte
    if (!searchable(query)) return [];
    const byCode = code ? this.#byCode(code, number, total).catch(() => []) : [];
    // Nachdrucke mit der Nummer des Originals findet TCGdex über die Nummer nicht. Mit Kürzel nur bei Setgröße
    // (Karpador der Klassischen Sammlung trägt „PAL 203/193“; „MEP 97“ soll keinen Xerneas 97/146 bringen)
    const reprints = number != null && (!code || total) ? this.#cards(reprintIds(number, total)).catch(() => []) : [];
    // Set-Liste und beide Sprachen gleichzeitig laden statt nacheinander
    const find = (lang) => (words ? this.tcgdex.searchByName(words, lang) : this.tcgdex.searchByNumber(number, lang));
    const [de, en] = await Promise.allSettled([find("de"), find("en"), this.sets.ready]);
    if (de.status === "rejected" && en.status === "rejected") throw de.reason;
    // Deutscher Name (englisch findet nichts) → auch die Karten, die TCGdex nur auf Englisch hat. Kürzel: siehe byCode
    const viaDex = words && !code && !en.value?.length ? await this.#viaDex(words, de.value || []).catch(() => []) : [];
    const byId = new Map();
    for (const c of [...(de.value || []), ...(en.value || []), ...viaDex]) if (c?.id && !byId.has(c.id)) byId.set(c.id, c);
    const found = [...byId.values()]
      .filter((c) => c && c.id && c.localId != null && !this.sets.isPocket(setIdOf(c)))
      .map((c) => toCard(c, (id) => this.sets.info(id)))
      .filter((c) => number == null || hasNumber(c, number, total))
      .sort((a, b) => this.sets.order(b.set) - this.sets.order(a.set) || numCmp(a.num, b.num));
    // Treffer übers Set-Kürzel zuerst (genau diese Karte), dann Nachdrucke (ohne Setgröße nur mit passendem Namen),
    // dann die übers Wort als Name
    const fits = (c) => !words || total || baseName(c.name).includes(baseName(words));
    const all = new Map();
    for (const c of [...(await byCode), ...(await reprints).filter(fits), ...found]) if (!all.has(c.id)) all.set(c.id, c);
    return [...all.values()];
  }

  // Karte Nummer n (und Setgröße) in den Sets mit diesem Kürzel – auch Karten, die TCGdex nur auf Englisch hat
  async #byCode(code, number, total) {
    const sets = await this.tcgdex.setsByCode(code);
    const lists = await Promise.all(sets.filter((s) => !this.sets.isPocket(s.id)).map((s) => this.#setCards(s.id).catch(() => [])));
    return this.#germanize(lists.flat().filter((c) => hasNumber(c, number, total)));
  }

  // Karten nach TCGdex-ID (aus wenigen Sets; ein fehlendes Set kostet nicht die anderen)
  async #cards(ids) {
    const lists = await Promise.all([...new Set(ids.map((id) => id.slice(0, id.lastIndexOf("-"))))].map((set) => this.#setCards(set).catch(() => [])));
    return this.#germanize(lists.flat().filter((c) => ids.includes(c.id)));
  }

  // Alle Karten eines Sets: deutsche, dazu die, die TCGdex nur auf Englisch hat – je Set einmal geladen
  #setCards(setId) {
    if (!this.#setCache.has(setId)) this.#setCache.set(setId, this.#loadSet(setId).catch((e) => (this.#setCache.delete(setId), Promise.reject(e))));
    return this.#setCache.get(setId);
  }

  async #loadSet(setId) {
    const [de, en] = await Promise.allSettled([this.tcgdex.set(setId, "de"), this.tcgdex.set(setId, "en")]);
    if (de.status === "rejected" && en.status === "rejected") throw de.reason;
    const data = de.value || en.value;
    const set = { id: data.id, name: data.name, cardCount: data.cardCount, serie: data.serie };
    const german = de.value?.cards || [];
    const have = new Set(german.map((c) => c.localId));
    const missing = (en.value?.cards || []).filter((c) => !have.has(c.localId));
    if (de.value) missing.forEach((c) => this.#englishOnly.add(c.id));
    return [...german, ...missing].map((c) => toCard({ ...c, set }, (id) => this.sets.info(id)));
  }

  // Karten, die TCGdex nur auf Englisch hat → deutscher Name über die Pokédex-Nummer („Mega Dragonite ex“ → „Mega-Dragoran-ex“)
  #germanize(cards) {
    return Promise.all(
      cards.map(async (card) => {
        if (!this.#englishOnly.has(card.id)) return card;
        const dex = (await this.tcgdex.card(card.id, "en").catch(() => null))?.dexId?.[0];
        const names = dex ? await this.#baseNames(dex).catch(() => []) : [];
        return { ...card, name: germanName(card.name, ...names) };
      })
    );
  }

  // Deutscher Name, den TCGdex auf Englisch nicht kennt: Pokédex-Nummer einer deutschen Karte → alle englischen Karten
  // dieses Pokémon, die zum Namen passen („Dragoran“ → u. a. MEP 091). Mit deutschem Namen, wenn es das Set auf Deutsch gibt.
  async #viaDex(words, german) {
    const base = pokemonName(words); // „Mega-Dragoran-ex“ → „Dragoran“
    const de = german.length ? german : base !== words ? await this.tcgdex.searchByName(base, "de") : [];
    const pick = de.filter((c) => baseName(c.name).includes(baseName(base))).sort((a, b) => a.name.length - b.name.length)[0];
    const dex = pick && (await this.tcgdex.card(pick.id, "de")).dexId?.[0];
    if (!dex) return [];
    const [en, names] = await Promise.all([this.#dex(dex, "en"), this.#baseNames(dex)]);
    return en.flatMap((c) => {
      const name = germanName(c.name, ...names);
      if (!baseName(name).includes(baseName(words))) return [];
      return [{ ...c, name: this.sets.info(setIdOf(c))?.en ? c.name : name }];
    });
  }

  #dex(dexId, lang) {
    const key = `${lang}:${dexId}`;
    if (!this.#dexCache.has(key)) this.#dexCache.set(key, this.tcgdex.searchByDex(dexId, lang).catch((e) => (this.#dexCache.delete(key), Promise.reject(e))));
    return this.#dexCache.get(key);
  }

  // Name des Pokémon auf Englisch und Deutsch = kürzester Kartenname („Dragonite“, „Dragoran“)
  async #baseNames(dexId) {
    const [en, de] = await Promise.all([this.#dex(dexId, "en"), this.#dex(dexId, "de")]);
    return [shortest(en), shortest(de)];
  }

  // Ein Set zum Durchblättern – mit den Karten, die TCGdex nur auf Englisch hat
  async setCards(setId) {
    const cards = await this.#setCards(setId);
    return { name: cards[0]?.setName ?? setId, cards: [...cards].sort((a, b) => numCmp(a.num, b.num)) };
  }
}
