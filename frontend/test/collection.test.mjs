// Test der Sammlung (entfernen mit „Rückgängig“, Ordner, Reihenfolge): node frontend/test/collection.test.mjs
import assert from "node:assert/strict";

globalThis.location ??= { pathname: "/" }; // config.js schaut auf die Adresse (Live oder Dev)
const { CollectionService } = await import("../js/services/collectionService.js");
const { EntityStore } = await import("../js/services/entityStore.js");
const { storageKeys } = await import("../js/config.js");

const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true) };
const collection = new CollectionService(new EntityStore(storage, storageKeys()));
const card = (id) => ({ id, name: id, num: "1", set: "x", setName: "X", total: null, img: null });
const [a, b, c] = ["a", "b", "c"].map(card);

collection.setQuantity(a, 2);
collection.update("a", { cond: "Mint", paid: 12.5 });
collection.setQuantity(b, 1);
collection.setQuantity(c, 1);
const before = collection.entry("a");

const undo = collection.removeAll([a, b]);
assert.deepEqual(collection.entries().map((e) => e.card.id), ["c"], "a und b sind raus");
undo();
assert.deepEqual(collection.entry("a"), before, "Rückgängig: genau wie vorher – Anzahl, Zustand, Kaufpreis, hinzugefügt am");
assert.equal(collection.entries().length, 3);

// Ordner (Art „section“): anlegen, Karten hineinlegen und herausnehmen, löschen → Karten bleiben, nur ohne Ordner
const ordner = collection.createSection("  Ordner 1 ");
assert.deepEqual(collection.sections().map((x) => x.name), ["Ordner 1"], "Name ohne Leerzeichen drumherum");
assert.equal(collection.createSection("   "), null, "leerer Name → kein Ordner");
collection.setSection([a, b, c], ordner);
const inOrdner = () => collection.entries().filter((e) => e.section === ordner).map((e) => e.card.id);
assert.deepEqual(inOrdner(), ["a", "b", "c"]);
collection.setSection([c], null);
assert.deepEqual([inOrdner(), collection.has("c")], [["a", "b"], true], "aus dem Ordner genommen – bleibt in der Sammlung");
collection.setQuantity(a, 3);
assert.equal(collection.entry("a").section, ordner, "Anzahl ändern lässt den Ordner in Ruhe");

// Mehrere aus einem Ordner löschen und rückgängig machen: Ordner-Zuordnung kommt mit zurück
const undoFolder = collection.removeAll([a, b]);
assert.deepEqual(inOrdner(), [], "gelöscht");
undoFolder();
assert.deepEqual(inOrdner(), ["a", "b"], "Rückgängig: wieder im Ordner");
const tausch = collection.createSection("Tauschkarten");
collection.setSection([b], tausch);
assert.deepEqual([inOrdner(), collection.entry("b").section], [["a"], tausch], "in einen anderen Ordner verschoben");
collection.removeSection(ordner);
assert.deepEqual(collection.sections().map((x) => x.name), ["Tauschkarten"]);
assert.deepEqual([collection.entry("a").section, collection.entries().length], [null, 3], "Ordner gelöscht: Karten bleiben, nur ohne Ordner");
collection.removeSection(tausch);

// Eigene Reihenfolge: verschieben und neu durchnummerieren
const { orderOf, createSetSorters } = await import("../js/domain/sorting.js");
const ordered = () => collection.entries().sort((x, y) => orderOf(x) - orderOf(y)).map((e) => e.card.id);
collection.renumber(["c", "a", "b"]);
assert.deepEqual(ordered(), ["c", "a", "b"]);
collection.move("b", 500); // vor „c“ (1000)
assert.deepEqual(ordered(), ["b", "c", "a"]);

const { numCmp } = await import("../js/core/format.js");
assert.deepEqual(["TG01", "R", "158", "SM100", "023", "SM11", "B"].sort(numCmp), ["023", "158", "B", "R", "SM11", "SM100", "TG01"], "Buchstaben-Nummern nach den Zahlen");

// Im Set: Nummer = Reihenfolge des Katalogs, Wert auf- und absteigend, ohne Preis immer am Ende
const setCards = ["s-1", "s-2", "s-3", "s-4"].map((id, i) => ({ card: { id }, i }));
const worth = { "s-1": 5, "s-2": null, "s-3": 20, "s-4": 5 };
const setSorted = (key) => [...setCards].sort(createSetSorters((id) => worth[id])[key].compare).map((e) => e.card.id);
assert.deepEqual(setSorted("numUp"), ["s-1", "s-2", "s-3", "s-4"]);
assert.deepEqual(setSorted("numDown"), ["s-4", "s-3", "s-2", "s-1"]);
assert.deepEqual(setSorted("valueDown"), ["s-3", "s-1", "s-4", "s-2"], "gleicher Wert → nach Nummer");
assert.deepEqual(setSorted("valueUp"), ["s-1", "s-4", "s-3", "s-2"]);

// Preis: deutsche Karte ohne Preis (z. B. McDonald's 2014) → englischer Preis, deutsche Details bleiben
Object.defineProperty(globalThis.navigator, "onLine", { value: true }); // Node kennt navigator, aber ohne onLine
const { PriceService } = await import("../js/services/priceService.js");
const fakeTcgdex = { card: async (id, lang) => (lang === "en" ? { pricing: { cardmarket: { avg7: 2.83 } } } : { rarity: "Common", dexId: [13] }) };
const priceService = new PriceService(fakeTcgdex, storage, "p", 1000);
const loaded = new Promise((r) => priceService.addEventListener("update", r, { once: true }));
priceService.request(["2014xy-1"]);
await loaded;
assert.equal(priceService.value("2014xy-1"), 2.83);
assert.equal(priceService.get("2014xy-1").dexId, 13);

// A1: Haken ab (Anzahl 1 → 0) liefert „Rückgängig“, das den alten Eintrag genau zurückholt – Zustand, Kaufpreis, Ordner,
// hinzugefügt am; Haken dran liefert nichts (bleibt still)
const ordnerA1 = collection.createSection("Ordner A1");
const d = card("d");
assert.equal(collection.toggle(d), null, "Hinzufügen per Haken: kein Rückgängig");
collection.update("d", { cond: "Excellent", paid: 4.2, lang: "Englisch" });
collection.setSection([d], ordnerA1);
const beforeD = collection.entry("d");
const undoD = collection.toggle(d);
assert.equal(collection.has("d"), false, "abgehakt");
undoD();
assert.deepEqual(collection.entry("d"), beforeD, "Rückgängig: alter Eintrag samt Ordner zurück");

// A3: Schnellfilter
const { QUICK_FILTERS } = await import("../js/domain/sorting.js");
const worthOf = { a: 2, c: null, d: 1 };
const quick = (key) => collection.entries().filter((e) => QUICK_FILTERS[key].test(e, (id) => worthOf[id] ?? null)).map((e) => e.card.id).sort();
assert.deepEqual(quick("all"), ["a", "b", "c", "d"]);
assert.deepEqual(quick("dupes"), ["a"], "Doppelte: Anzahl > 1");
assert.deepEqual(quick("unpaid"), ["b", "c"], "ohne Kaufpreis");
assert.deepEqual(quick("noprice"), ["b", "c"], "ohne Preis (auch noch nicht geladen)");

// C1: Set-Zähler (verschiedene Karten je Set) und „Fehlende als Liste“ – zweimal ausführen ergibt nichts doppelt
const { ListService } = await import("../js/services/listService.js");
const lists = new ListService(collection.store);
const inSet = (id) => ({ ...card(id), set: "sv1" });
collection.setQuantity(inSet("sv1-1"), 3);
collection.setQuantity(inSet("sv1-2"), 1);
collection.setQuantity(inSet("sv1-3"), 0); // Anzahl 0 zählt nicht
assert.deepEqual([collection.countBySet().get("sv1"), collection.countBySet().get("x")], [2, 4], "je Set verschiedene Karten in der Sammlung");
const missing = [inSet("sv1-3"), inSet("sv1-4")];
const first = lists.fill(" Karmesin & Purpur ", missing);
assert.deepEqual([lists.all().map((l) => l.name), first.added], [["Karmesin & Purpur"], 2], "Liste mit Set-Namen angelegt");
const again = lists.fill("Karmesin & Purpur", [...missing, inSet("sv1-5")]);
assert.deepEqual([again.id, again.added, lists.items(first.id).length], [first.id, 1, 3], "vorhandene Liste ergänzt, nichts doppelt");

// D: Tauschen – Abgleich per Karten-ID, die Sprache zählt nicht
const { tradeMatches } = await import("../js/domain/trade.js");
const tim = { duplicates: [{ card: card("t1"), qty: 2, cond: "Mint", lang: "Englisch" }, { card: card("a"), qty: 3, cond: "Mint", lang: "Deutsch" }], missing: [card("a"), card("b")] };
const owned = [{ card: card("a"), qty: 2, cond: "Near Mint", lang: "Deutsch" }, { card: card("b"), qty: 1, cond: "Near Mint", lang: "Deutsch" }];
const t = tradeMatches(tim, owned, [card("t1"), card("a"), card("x")]);
assert.deepEqual(t.forMe.map((d) => d.card.id), ["t1"], "Tim hat doppelt, was mir fehlt (a habe ich schon)");
assert.deepEqual(t.forThem.map((d) => [d.card.id, d.qty]), [["a", 2]], "ich habe doppelt, was Tim fehlt (b nur einmal)");

console.log("Sammlung ok");
