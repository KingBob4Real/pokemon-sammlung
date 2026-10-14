// Abgleich ohne Netz, durch die ganze App (Router, Schlüssel, Prüfung, SQL): node backend/test/sync.test.mjs
// Neueste Änderung gewinnt, Personen bleiben getrennt – auch bei den Kartendaten (Migration 0009).
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../src/index.js";
import { hashKey } from "../src/repositories/userRepository.js";

// D1 im Kleinen auf SQLite im Speicher; batch() ist wie bei D1 eine Transaktion
const sqlite = new DatabaseSync(":memory:");
const stmt = (sql, args = []) => ({
  sql,
  args,
  bind: (...a) => stmt(sql, a),
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  run: async () => sqlite.prepare(sql).run(...args),
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
});
const db = {
  prepare: (sql) => stmt(sql),
  batch: async (list) => {
    sqlite.exec("BEGIN");
    try {
      const results = list.map((s) => ({ results: sqlite.prepare(s.sql).all(...s.args) }));
      sqlite.exec("COMMIT");
      return results;
    } catch (e) {
      sqlite.exec("ROLLBACK");
      throw e;
    }
  },
};
const migrations = fs.readdirSync(new URL("../migrations/", import.meta.url)).sort();
const migrate = (files) => files.forEach((f) => sqlite.exec(fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), "utf8")));

// --- Migration 0009: gemeinsame Kartendaten → pro Person, jede bekommt die Karten aus ihrer Sammlung und ihren Listen
migrate(migrations.filter((f) => f < "0009"));
sqlite.exec(`
  INSERT INTO cards VALUES ('base1-4', 'Glurak', '4', 'base1', 'Grundset', 102, NULL), ('base1-2', 'Turtok', '2', 'base1', 'Grundset', 102, NULL);
  INSERT INTO collection (user_id, card_id, qty, added, updated, deleted, rev) VALUES ('tim', 'base1-4', 1, 1, 1, 0, 1);
  INSERT INTO list_items (user_id, id, list_id, card_id, added, updated, deleted, rev) VALUES ('max', 'l:base1-4', 'l', 'base1-4', 1, 1, 0, 1), ('max', 'l:base1-2', 'l', 'base1-2', 1, 1, 0, 1);`);
migrate(migrations.filter((f) => f >= "0009"));
assert.deepEqual(
  sqlite.prepare("SELECT user_id, id, name FROM cards ORDER BY user_id, id").all().map((r) => ({ ...r })),
  [{ user_id: "max", id: "base1-2", name: "Turtok" }, { user_id: "max", id: "base1-4", name: "Glurak" }, { user_id: "tim", id: "base1-4", name: "Glurak" }],
  "Migration: jede Person hat ihre Karten"
);

// --- Abgleich über HTTP
sqlite.exec("DELETE FROM collection; DELETE FROM list_items; DELETE FROM cards;");
for (const [id, name] of [["tim", "Tim"], ["max", "Max"]]) {
  sqlite.prepare("INSERT INTO users (id, name, key_hash, created) VALUES (?, ?, ?, 0)").run(id, name, await hashKey(`KEY-${id}`));
}
const app = createApp({ DB: db });
const sync = async (who, since, changes) => {
  const res = await app.handle(new Request("https://x/sync", { method: "POST", headers: { Authorization: `Bearer KEY-${who}` }, body: JSON.stringify({ since, changes }) }));
  return { status: res.status, ...(await res.json()) };
};
const card = (name) => ({ id: "base1-4", name, num: "4", set: "base1", setName: "Grundset", total: 102, img: null });
const entry = (updated, data, deleted = 0) => ({ type: "collection", id: "base1-4", updated, deleted, data: deleted ? null : { qty: 1, added: 1, ...data } });

assert.equal((await sync("nobody", 0, [])).status, 401, "ohne gültigen Schlüssel kein Abgleich");

const first = await sync("tim", 0, [entry(100, { qty: 2, card: card("Glurak") })]);
assert.equal(first.status, 200);
assert.equal(first.changes.length, 1);
assert.equal(first.changes[0].data.qty, 2, "eigene Änderung kommt zurück");
assert.ok(Math.abs(first.now - Date.now()) < 5000, "Server schickt seine Uhrzeit mit");

// Ein älterer Stand (z. B. von einem zweiten Gerät, das offline war) überschreibt nichts Neueres
const stale = await sync("tim", first.rev, [entry(50, { qty: 7, card: card("Glurak") })]);
assert.equal(stale.changes[0].data.qty, 2, "älterer Stand verliert");
assert.equal(stale.changes[0].updated, 100);

// Andere Person, gleiche Karte, andere Kartendaten (z. B. veraltete App): Tims Daten bleiben unberührt
const max = await sync("max", 0, [entry(200, { card: card("Charizard") })]);
assert.equal(max.changes.length, 1, "Max bekommt nur seine eigenen Einträge");
assert.equal(max.changes[0].data.card.name, "Charizard");
const tim = await sync("tim", 0, []);
assert.equal(tim.changes.length, 1);
assert.equal(tim.changes[0].data.card.name, "Glurak", "Kartendaten gehören jeder Person selbst");

// Tauschen zeigt die Karten der anderen mit deren Kartendaten (Tim hat 2 → bietet an)
const trade = await (await app.handle(new Request("https://x/trade", { headers: { Authorization: "Bearer KEY-max" } }))).json();
assert.equal(trade.people[0].offers[0].card.name, "Glurak");

// Löschen kommt bei einem anderen Gerät an, das nur „seit“ seinem letzten Stand fragt
const deleted = await sync("tim", tim.rev, [entry(300, null, 1)]);
const otherDevice = await sync("tim", first.rev, []);
assert.equal(otherDevice.changes.length, 1);
assert.equal(otherDevice.changes[0].deleted, 1, "Löschung wird weitergegeben");
assert.equal((await sync("tim", deleted.rev, [])).changes.length, 0, "nichts Neues seit dem letzten Stand");

// Ungültiger Eintrag: 400 mit Position, damit das Gerät genau diesen zurückhält
const bad = await sync("tim", 0, [entry(400, { card: card("Glurak") }), { ...entry(401, { card: card("") }), id: "base1-4" }]);
assert.equal(bad.status, 400);
assert.equal(bad.index, 1);

console.log("Abgleich ok");
