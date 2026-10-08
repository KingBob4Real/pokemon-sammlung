// Test „aus der Sammlung entfernen“ mit „Rückgängig“: node frontend/test/collection.test.mjs
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

// Abteilungen: anlegen, Karten hineinlegen, löschen → Karten bleiben, nur ohne Abteilung
const ordner = collection.createSection("  Ordner 1 ");
assert.deepEqual(collection.sections().map((x) => x.name), ["Ordner 1"], "Name ohne Leerzeichen drumherum");
assert.equal(collection.createSection("   "), null, "leerer Name → keine Abteilung");
collection.setSection([a, b], ordner);
assert.deepEqual(collection.entries().filter((e) => e.section === ordner).map((e) => e.card.id), ["a", "b"]);
collection.setQuantity(a, 3);
assert.equal(collection.entry("a").section, ordner, "Anzahl ändern lässt die Abteilung in Ruhe");
collection.removeSection(ordner);
assert.equal(collection.sections().length, 0);
assert.deepEqual([collection.entry("a").section, collection.entries().length], [null, 3], "Karten bleiben, nur ohne Abteilung");

// Eigene Reihenfolge: verschieben und neu durchnummerieren
const { orderOf } = await import("../js/domain/sorting.js");
const ordered = () => collection.entries().sort((x, y) => orderOf(x) - orderOf(y)).map((e) => e.card.id);
collection.renumber(["c", "a", "b"]);
assert.deepEqual(ordered(), ["c", "a", "b"]);
collection.move("b", 500); // vor „c“ (1000)
assert.deepEqual(ordered(), ["b", "c", "a"]);

console.log("Sammlung ok");
