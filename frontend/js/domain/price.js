import { CARDMARKET_LANGUAGES, CARDMARKET_MIN_CONDITION } from "../config.js";
import { positive } from "../core/format.js";

// Cardmarket-Preisliste aus einer TCGdex-Karte (mischt alle Sprachen und Zustände; Trend & Ø nur als Zusatzinfo),
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

// Wert einer Karte = günstigstes Cardmarket-Angebot („ab“) auf Deutsch oder Englisch ab Excellent. Den gibt es kostenlos
// nirgends als Daten (Preisliste ohne Sprache/Zustand, API geschlossen) → selbst eingetragen über den gefilterten Link,
// sonst das ungefilterte „ab“ der Preisliste als Näherung (Untergrenze: alle Sprachen & Zustände). Trend & Ø nie.
export const marketValue = (price, ownLow = null) => positive(ownLow) ?? price?.low ?? null;

// Link mit Filter „Deutsch/Englisch (sonst Sprache der Karte), ab Excellent“ – zeigt den echten „ab“-Preis
export const cardmarketLanguages = (language) => (["Deutsch", "Englisch"].includes(language) ? "Deutsch/Englisch" : CARDMARKET_LANGUAGES[language] ? language : "alle Sprachen");
export function cardmarketUrl(card, price, language = "Deutsch") {
  const lang = ["Deutsch", "Englisch"].includes(language) ? `${CARDMARKET_LANGUAGES.Englisch},${CARDMARKET_LANGUAGES.Deutsch}` : CARDMARKET_LANGUAGES[language];
  const filter = `${lang ? `language=${lang}&` : ""}minCondition=${CARDMARKET_MIN_CONDITION}`;
  return price?.cardmarketId
    ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(price.cardmarketId)}&${filter}`
    : `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}&${filter}`;
}
