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

console.log("Sammlung ok");
