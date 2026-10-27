// Sicherheit ohne Netz: node backend/test/security.test.mjs
// Anmelden per Antippen und Abmelden; Kartenbilder nur von TCGdex.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { UserRepository } from "../src/repositories/userRepository.js";
import { AuthService } from "../src/services/authService.js";
import { parseSyncRequest } from "../src/validation/changeValidator.js";

// D1 im Kleinen: prepare().bind().first()/run() und batch() auf SQLite im Speicher
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, key_hash TEXT, created INTEGER);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);`);
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  run: async () => sqlite.prepare(sql).run(...args),
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
});
const db = { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };

sqlite.prepare("INSERT INTO users (id, name, key_hash, created) VALUES ('tim', 'Tim', 'x', 0)").run();
const auth = new AuthService(new UserRepository(db));
const now = 1_000_000;

// Antippen meldet an; unbekannte Person nicht
assert.equal((await auth.login("niemand", now)).status, 404, "unbekannte Person");
const ok = await auth.login("tim", now);
assert.deepEqual(ok.user, { id: "tim", name: "Tim" }, "Antippen meldet an");

// Abmelden beendet genau die eigene Sitzung; mit dem Sync-Schlüssel angemeldet (session = null) passiert nichts
const users = new UserRepository(db);
const second = await auth.login("tim", now + 1000);
await auth.logout(await users.findByKey(ok.token));
assert.equal(await users.findByKey(ok.token), null, "abgemeldete Sitzung gilt nicht mehr");
assert.ok(await users.findByKey(second.token), "andere Sitzung bleibt");
await auth.logout({ id: "tim", session: null });
assert.ok(await users.findByKey(second.token), "Abmelden mit dem Schlüssel beendet keine Sitzung");

// Kartenbilder: nur TCGdex – die anderen sehen deine Karten beim Tauschen
const change = (img) => ({ since: 0, changes: [{ type: "collection", id: "base1-4", updated: 1, deleted: 0, data: { qty: 1, added: 1, card: { id: "base1-4", name: "Glurak", num: "4", set: "base1", setName: "Grundset", img } } }] });
assert.ok(parseSyncRequest(change("https://assets.tcgdex.net/de/base/base1/4")).ok, "TCGdex-Bild geht durch");
assert.ok(parseSyncRequest(change(null)).ok, "ohne Bild geht durch");
assert.equal(parseSyncRequest(change("https://example.com/pixel.gif")).ok, false, "fremde Adresse wird abgelehnt");

console.log("security ok");
