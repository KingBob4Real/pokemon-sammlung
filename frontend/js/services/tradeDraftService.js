import { isObj, objOr } from "../core/format.js";

const SIDES = ["give", "get"];
const item = (card, extra = {}) => ({ card, qty: 1, lang: "Deutsch", cond: "Near Mint", own: null, ...extra });

/**
 * Tauschrechner: was ich gebe (give) und was ich bekomme (get) – beliebige Karten, auch mit Leuten ohne App.
 * Pro Person auf dem Gerät gemerkt, damit ein halb fertiger Tausch nicht verloren geht, wenn iOS die App schließt.
 * Eintrag: { card, qty, lang, cond, own } – own = eigener Preis pro Stück oder null. Gebucht wird nichts.
 */
export class TradeDraftService {
  constructor(storage, storageKey, collection) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.collection = collection;
    const saved = objOr(storage.get(storageKey, {}));
    this.draft = Object.fromEntries(SIDES.map((s) => [s, (Array.isArray(saved[s]) ? saved[s] : []).filter((i) => isObj(i?.card) && i.qty > 0)]));
  }

  // Karte auf eine Seite legen; liegt sie schon da, eine mehr. Was ich gebe, startet mit Sprache und Zustand aus meiner Sammlung.
  add(side, card) {
    const found = this.draft[side].find((i) => i.card.id === card.id);
    if (found) found.qty++;
    else {
      const mine = side === "give" ? this.collection.entry(card.id) : null;
      this.draft[side].push(item(card, mine ? { lang: mine.lang, cond: mine.cond } : {}));
    }
    this.#save();
  }

  // patch: { qty?, lang?, cond?, own? } – Anzahl 0 nimmt die Karte raus
  change(side, cardId, patch) {
    const found = this.draft[side].find((i) => i.card.id === cardId);
    if (!found) return;
    Object.assign(found, patch);
    if (found.qty <= 0) this.draft[side] = this.draft[side].filter((i) => i !== found);
    this.#save();
  }

  // Vorschlag aus „Tim hat doppelt …“ / „Du hast doppelt …“ – je ein Exemplar, ersetzt den Rechner
  fill(give, get) {
    const toItem = ({ card, lang, cond }) => item(card, { lang: lang || "Deutsch", cond: cond || "Near Mint" });
    this.draft = { give: give.map(toItem), get: get.map(toItem) };
    this.#save();
  }

  clear() {
    this.draft = { give: [], get: [] };
    this.#save();
  }

  #save() {
    this.storage.set(this.storageKey, this.draft);
  }
}
