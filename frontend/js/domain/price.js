import { CARDMARKET_LANGUAGES, CARDMARKET_MIN_CONDITION } from "../config.js";
import { positive } from "../core/format.js";

// Cardmarket-Richtwerte aus einer TCGdex-Karte (mischen alle Sprachen und Zustände),
// dazu Kartendetails, die nur die volle Karte hat: Seltenheit und Pokédex-Nummer (Trainer/Energie: null).
export function toPrice(card) {
  const cm = card?.pricing?.cardmarket;
  const first = (...values) => values.map(positive).find((x) => x != null) ?? null;
  return {
    at: Date.now(),
    low: cm ? first(cm.low, cm["low-holo"]) : null,
    trend: cm ? first(cm.trend, cm["trend-holo"]) : null,
    avg30: cm ? first(cm.avg30, cm["avg30-holo"]) : null,
    cardmarketId: cm?.idProduct || null,
    updated: cm?.updated || null,
    rarity: card?.rarity || null,
    dexId: Array.isArray(card?.dexId) && Number.isInteger(card.dexId[0]) ? card.dexId[0] : null,
  };
}

// Marktwert = Ø 30 Tage (bei neuen Sets ist der Trend oft unbrauchbar, z. B. Mew-ex 30th-158: Trend 19 €, Ø 30 Tage 80 €),
// sonst Trend, sonst „ab“
export const marketValue = (price) => (price ? price.avg30 ?? price.trend ?? price.low : null);

// Link mit Filter „Sprache der Karte, ab Excellent“ – zeigt den echten Preis für genau solche Karten
export function cardmarketUrl(card, price, language = "Deutsch") {
  const lang = CARDMARKET_LANGUAGES[language];
  const filter = `${lang ? `language=${lang}&` : ""}minCondition=${CARDMARKET_MIN_CONDITION}`;
  return price?.cardmarketId
    ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(price.cardmarketId)}&${filter}`
    : `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}&${filter}`;
}
