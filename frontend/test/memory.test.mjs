// Test für Speicher & Gedächtnis (Preise aufräumen, englische Preisquelle, Bild-Ersatz, Wertverlauf):
// node frontend/test/memory.test.mjs
import assert from "node:assert/strict";

globalThis.location ??= { pathname: "/" }; // config.js schaut auf die Adresse (Live oder Dev)
Object.defineProperty(globalThis.navigator, "onLine", { value: true }); // Node kennt navigator, aber ohne onLine
const { PriceService } = await import("../js/services/priceService.js");
const { HistoryService, dayOf } = await import("../js/services/historyService.js");
const { useImageMemory, imageFor, rememberImage } = await import("../js/ui/components/cardTile.js");

const DAY = 24 * 60 * 60 * 1000;
const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true) };
const loaded = (service) => new Promise((r) => service.addEventListener("update", r, { once: true }));

// B1: beim Speichern fliegen Preise älter als 30 Tage raus, frische bleiben
const now = Date.now();
mem.set("p", { alt: { at: now - 31 * DAY, avg7: 1 }, kaputt: { avg7: 1 }, frisch: { at: now - 2 * DAY, avg7: 2 }, heute: { at: now - 60_000, avg7: 3 } });
const calls = [];
const tcgdex = {
  card: async (id, lang) => {
    calls.push(`${lang}:${id}`);
    if (id === "mcd-1") return lang === "en" ? { rarity: "Common", dexId: [25], pricing: { cardmarket: { avg7: 2.5 } } } : { rarity: "Häufig", dexId: [25] };
    if (id === "weg-1") throw Object.assign(new Error("HTTP 404"), { status: 404 });
    return { rarity: "Selten", pricing: { cardmarket: { avg7: 9 } } };
  },
};
const prices = new PriceService(tcgdex, storage, "p", DAY, 30 * DAY);
let done = loaded(prices);
prices.request(["neu-1", "mcd-1", "weg-1"]);
await done;
assert.deepEqual(Object.keys(mem.get("p")).sort(), ["frisch", "heute", "mcd-1", "neu-1", "weg-1"], "älter als 30 Tage (und ohne Zeitpunkt) raus, frische bleiben");

// B2: Preis aus dem englischen Datensatz → gemerkt, am nächsten Tag gleich dort fragen; deutsche Seltenheit bleibt
assert.deepEqual([prices.value("mcd-1"), prices.get("mcd-1").en, prices.get("mcd-1").rarity, prices.get("mcd-1").dexId], [2.5, true, "Häufig", 25]);
assert.deepEqual([prices.get("neu-1").en, prices.value("neu-1")], [undefined, 9], "deutscher Preis: nichts gemerkt");
assert.deepEqual([prices.get("weg-1").avg7, prices.hasFailed("weg-1")], [null, false], "Karte gibt es nirgends (404): ohne Preis statt Fehler");
prices.prices["mcd-1"].at -= 2 * DAY; // ein Tag später
calls.length = 0;
done = loaded(prices);
prices.request(["mcd-1"]);
await done;
assert.deepEqual(calls, ["en:mcd-1"], "nur noch die englische Anfrage");
assert.deepEqual([prices.get("mcd-1").rarity, prices.isFresh("mcd-1")], ["Häufig", true], "Seltenheit auf Deutsch bleibt, Preis frisch");

// B3: Bild-Gedächtnis – bekannte Ersatzadresse wird direkt genutzt, „keine“ läuft nach 7 Tagen ab
const card = { id: "mcd-1", img: "https://assets.tcgdex.net/en/xy/2014xy/1" };
useImageMemory(storage, "img", 7 * DAY);
assert.equal(imageFor(card, "low"), "https://assets.tcgdex.net/en/xy/2014xy/1/low.webp", "nichts gemerkt: TCGdex");
rememberImage("mcd-1|low", "https://backend/img?card=2014xy-1&size=SM");
assert.equal(imageFor(card, "low"), "https://backend/img?card=2014xy-1&size=SM", "gemerkte Adresse direkt");
assert.equal(imageFor(card, "high"), "https://assets.tcgdex.net/en/xy/2014xy/1/high.webp", "Größen getrennt");
rememberImage("mcd-1|high", "", now - 6 * DAY);
assert.equal(imageFor(card, "high"), null, "„keine“ → gleich der Platzhalter");
assert.equal(imageFor(card, "high", now + 2 * DAY), "https://assets.tcgdex.net/en/xy/2014xy/1/high.webp", "nach 7 Tagen wird neu probiert");
useImageMemory(storage, "img", 7 * DAY, now + 2 * DAY);
assert.deepEqual(Object.keys(mem.get("img")).length, 2, "auf dem Gerät gespeichert");
useImageMemory(storage, "img", 7 * DAY, now + 2 * DAY);
assert.equal(imageFor(card, "low"), "https://backend/img?card=2014xy-1&size=SM", "nach Neustart noch da");
assert.equal(imageFor(card, "high", now + 2 * DAY), "https://assets.tcgdex.net/en/xy/2014xy/1/high.webp", "abgelaufenes beim Laden verworfen");

// C2: Wertverlauf – nur wenn alle Preise der Sammlung frisch sind, einmal pro Tag, höchstens 2 Jahre
const entries = [{ card: { id: "a" }, qty: 2 }, { card: { id: "b" }, qty: 1 }];
const collection = { entries: () => entries, summary: (valueOf, list) => ({ worth: list.reduce((s, e) => s + (valueOf(e.card.id) ?? 0) * e.qty, 0), count: list.reduce((n, e) => n + e.qty, 0) }) };
const fresh = new Set(["a"]);
const value = { a: 10, b: 5 };
const fakePrices = { isFresh: (id) => fresh.has(id), value: (id) => value[id] ?? null };
const noon = new Date(2026, 9, 10, 12).getTime();
mem.set("h", { "2024-01-01": { worth: 1, count: 1 } }); // älter als 2 Jahre
const history = new HistoryService(storage, "h", collection, fakePrices);
assert.equal(history.record(noon), false, "b ist noch nicht geladen → kein Tageswert aus halben Preisen");
fresh.add("b");
assert.equal(history.record(noon), true);
assert.deepEqual(mem.get("h"), { "2026-10-10": { worth: 25, count: 3 } }, "gespeichert, älter als 2 Jahre raus");
value.a = 20;
assert.equal(history.record(noon + 3600_000), false, "einmal pro Tag");
assert.equal(history.record(noon + 7 * DAY), true, "eine Woche später");
assert.equal(dayOf(noon + 7 * DAY), "2026-10-17");
assert.deepEqual([history.change(7, noon + 7 * DAY), history.change(30, noon + 7 * DAY)], [20, null], "+20 € seit 7 Tagen, 30 Tage gibt es noch nicht");
assert.deepEqual(history.series().map((e) => e.day), ["2026-10-10", "2026-10-17"]);

console.log("Speicher ok");
