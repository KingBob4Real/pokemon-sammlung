import { CARDMARKET_FILTER } from "../config.js";
import { positive } from "../core/format.js";

// Cardmarket-Richtwerte aus einer TCGdex-Karte. Sie mischen alle Sprachen und Zustände.
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
  };
}

// Marktwert = Trend, sonst 30-Tage-Schnitt, sonst „ab“
export const marketValue = (price) => (price ? price.trend ?? price.avg30 ?? price.low : null);

// Link mit Filter „Deutsch, ab Excellent“ – zeigt den echten Preis für deutsche Karten
export function cardmarketUrl(card, price) {
  return price?.cardmarketId
    ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(price.cardmarketId)}&${CARDMARKET_FILTER}`
    : `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}&${CARDMARKET_FILTER}`;
}
