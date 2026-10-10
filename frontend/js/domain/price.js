import { CARDMARKET_LANGUAGES, CARDMARKET_MIN_CONDITION } from "../config.js";
import { positive } from "../core/format.js";

// Cardmarket-Richtwerte aus einer TCGdex-Karte (mischen alle Sprachen und Zustände): Ø 7 und Ø 30 Tage, dazu für den
// Tauschrechner „ab“ (low) und Ø 1 Tag; außerdem Kartendetails, die nur die volle Karte hat: Seltenheit und
// Pokédex-Nummer (Trainer/Energie: null).
export function toPrice(card) {
  const cm = card?.pricing?.cardmarket;
  const first = (...values) => values.map(positive).find((x) => x != null) ?? null;
  return {
    at: Date.now(),
    avg7: cm ? first(cm.avg7, cm["avg7-holo"]) : null,
    avg30: cm ? first(cm.avg30, cm["avg30-holo"]) : null,
    avg1: cm ? first(cm.avg1, cm["avg1-holo"]) : null,
    low: cm ? first(cm.low, cm["low-holo"]) : null,
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

// Gestiegen / Gefallen: Karten mit dem größten Unterschied Ø 7 Tage gegen Ø 30 Tage (in €, pro Stück).
// entries: [{ card }], priceOf(cardId) → Preis → { up, down } mit je höchstens n Einträgen { entry, price, diff }
export function movers(entries, priceOf, n = 5) {
  const all = entries.flatMap((entry) => {
    const price = priceOf(entry.card.id);
    return price?.avg7 != null && price.avg30 != null && price.avg7 !== price.avg30 ? [{ entry, price, diff: price.avg7 - price.avg30 }] : [];
  });
  return {
    up: all.filter((m) => m.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, n),
    down: all.filter((m) => m.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, n),
  };
}

// Link mit Filter „Sprache der Karte, ab Zustand“ (Cardmarket: 1 Mint … 7 Poor, Standard Excellent) – zeigt den
// echten Preis für genau solche Karten
export function cardmarketUrl(card, price, language = "Deutsch", minCondition = CARDMARKET_MIN_CONDITION) {
  const lang = CARDMARKET_LANGUAGES[language];
  const filter = `${lang ? `language=${lang}&` : ""}minCondition=${minCondition}`;
  return price?.cardmarketId
    ? `https://www.cardmarket.com/de/Pokemon/Products?idProduct=${encodeURIComponent(price.cardmarketId)}&${filter}`
    : `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(searchName(card.name))}&${filter}`;
}

// Ohne Cardmarket-Produkt (TCGdex ordnet Namen mit ♀, ♂, ◇, δ, ’ oder „-EX“ oft nicht zu) nach dem Namen suchen –
// ohne diese Zeichen, sonst findet Cardmarket nichts: „Nidoran♀“ → „Nidoran“, „Farfetch’d“ → „Farfetch'd“
export const searchName = (name) => name.replace(/[♀♂◇δ★]/g, " ").replace(/’/g, "'").replace(/-(EX|GX)\b/g, " $1").replace(/\s+/g, " ").trim();
