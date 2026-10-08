// Test des Kartenwerts (Cardmarket „ab“, Deutsch/Englisch, ab Excellent): node frontend/test/price.test.mjs
import assert from "node:assert/strict";

globalThis.location ??= { pathname: "/" }; // config.js schaut auf die Adresse (Live oder Dev)
const { cardmarketUrl, marketValue, toPrice } = await import("../js/domain/price.js");

// Mew-ex 30th-158 laut TCGdex am 08.10.2026: Trend 19,18 · ab 35 · Ø 30 Tage 79,79; auf Cardmarket DE/EN ab EX: 39 €
const mew = toPrice({ pricing: { cardmarket: { idProduct: 907762, trend: 19.18, low: 35, avg30: 79.79, avg: 83.34 } } });
assert.equal(marketValue(mew, 39), 39, "selbst eingetragenes „ab“ (DE/EN, ab EX) zählt");
assert.equal(marketValue(mew), 35, "sonst Näherung: ungefiltertes „ab“ – nie der Trend");
assert.equal(marketValue(toPrice({ pricing: { cardmarket: { trend: 402.61, avg30: 380 } } })), null, "ohne „ab“ kein Wert, auch wenn ein Trend da ist");
assert.equal(marketValue(null), null, "noch nichts geladen");
assert.equal(marketValue(null, 12.5), 12.5, "eigener Preis geht auch ohne Preisliste");
assert.equal(marketValue(mew, 0), 35, "0 ist kein Preis");

// Link: Deutsch/Englisch ab Excellent (Cardmarket: 1 = Englisch, 3 = Deutsch, minCondition 3 = Excellent)
assert.match(cardmarketUrl({ name: "Mew ex" }, mew, "Deutsch"), /idProduct=907762&language=1,3&minCondition=3$/);
assert.match(cardmarketUrl({ name: "Mew ex" }, mew, "Japanisch"), /language=7&minCondition=3$/, "andere Sprache: wie bisher die der Karte");

console.log("Preis ok");
