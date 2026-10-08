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

console.log("Sammlung ok");
