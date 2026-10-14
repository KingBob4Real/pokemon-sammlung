// Exemplare ohne Netz: node backend/test/copies.test.mjs
// Die Liste geht unverändert durch die echte SQL (json_each, ->>) hin und zurück; die Prüfung lässt nur Passendes durch.
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CollectionRepository } from "../src/repositories/collectionRepository.js";
import { parseSyncRequest } from "../src/validation/changeValidator.js";

// D1 im Kleinen auf SQLite im Speicher, mit allen Migrationen
const sqlite = new DatabaseSync(":memory:");
for (const f of fs.readdirSync(new URL("../migrations/", import.meta.url)).sort()) sqlite.exec(fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8"));
sqlite.exec("INSERT INTO meta (k, v) VALUES ('rev', 1) ON CONFLICT (k) DO UPDATE SET v = 1");
const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: () => sqlite.prepare(sql).run(...args), all: () => ({ results: sqlite.prepare(sql).all(...args) }) });
const collection = new CollectionRepository({ prepare: (sql) => stmt(sql) });

const card = { id: "base1-4", name: "Glurak", num: "4", set: "base1", setName: "Grundset", total: 102, img: null };
const copies = [{ cond: "Near Mint", lang: "Deutsch", paid: 120 }, { cond: "Played", lang: "Englisch", paid: null }];
const change = (data) => ({ since: 0, changes: [{ type: "collection", id: card.id, updated: 1, deleted: 0, data: { qty: 2, added: 1, cond: "Near Mint", lang: "Deutsch", paid: 120, card, ...data } }] });

const ok = parseSyncRequest(change({ copies }));
assert.ok(ok.ok, "zwei verschiedene Exemplare gehen durch");
const json = JSON.stringify(ok.changes);
collection.upsert(json, "tim").run();
const [row] = collection.changed(0, json, "tim").all().results;
assert.deepEqual(collection.toEntity(row).data.copies, copies, "Exemplare kommen genau so zurück");
assert.equal(sqlite.prepare("SELECT language FROM collection").get().language, "Deutsch", "Spalten = erstes Exemplar");

collection.upsert(JSON.stringify(parseSyncRequest({ ...change({}), changes: [{ ...change({}).changes[0], updated: 2 }] }).changes), "tim").run();
assert.equal(collection.toEntity(collection.changed(0, "[]", "tim").all().results[0]).data.copies, null, "ohne Exemplare (alle gleich): null");

const bad = (data, why) => assert.equal(parseSyncRequest(change(data)).ok, false, why);
bad({ copies: [copies[0]] }, "nur eins: dafür gibt es die Felder der Karte");
bad({ copies: [...copies, copies[0]] }, "Länge ≠ Anzahl");
bad({ copies: [copies[0], { ...copies[1], note: "x" }] }, "fremde Felder");
bad({ copies: [copies[0], { ...copies[1], paid: -1 }] }, "negativer Kaufpreis");
bad({ copies: "viele" }, "keine Liste");

console.log("Exemplare ok");
