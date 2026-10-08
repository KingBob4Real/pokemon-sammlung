import { CARDMARKET_LANGUAGES, CARDMARKET_MIN_CONDITION } from "../config.js";
import { positive } from "../core/format.js";

// Cardmarket-Richtwerte aus einer TCGdex-Karte (mischen alle Sprachen und Zustände),
// dazu Kartendetails, die nur die volle Karte hat: Seltenheit und Pokédex-Nummer (Trainer/Energie: null).
export function toPrice(card) {
  const cm = card?.pricing?.cardmarket;
  const first = (...values) => values.map(positive).find((x) => x != null) ?? null;
  return {
    at: Date.now(),
    avg7: cm ? first(cm.avg7, cm["avg7-holo"]) : null,
    avg30: cm ? first(cm.avg30, cm["avg30-holo"]) : null,
    cardmarketId: cm?.idProduct || null,
    updated: cm?.updated || null,
    rarity: card?.rarity || null,
    dexId: Array.isArray(card?.dexId) && Number.isInteger(card.dexId[0]) ? card.dexId[0] : null,
  };
}

// Marktwert = Ø 7 Tage, sonst Ø 30 Tage (keine Verkäufe in 30 Tagen = ohne Preis). Trend und „ab“ zählen nicht: der Trend ist
// bei neuen Sets oft unbrauchbar, „ab“ mischt beschädigte und fremdsprachige Karten (Mew-ex 30th-158: Trend 19 €, ab 35 €,
// Ø 7 Tage 60 €, Ø 30 Tage 80 €)
export const marketValue = (price) => (price ? price.avg7 ?? price.avg30 : null);

// Link mit Filter „Sprache der Karte, ab Excellent“ – zeigt den echten Preis für genau solche Karten
export function cardmarketUrl(card, price, language = "Deutsch") {
  const lang = CARDMARKET_LANGUAGES[language];
  const filter = `${lang ? `language=${lang}&` : ""}minCondition=${CARDMARKET_MIN_CONDITION}`;
  return price?.cardmarketId
    ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(price.cardmarketId)}&${filter}`
    : `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}&${filter}`;
}
