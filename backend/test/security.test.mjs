// Sicherheit ohne Netz: node backend/test/security.test.mjs
// Kein Anmelden ohne Passwort; Sperre nach Fehlversuchen hält auch bei gleichzeitigen Versuchen; Kartenbilder nur von TCGdex.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { UserRepository } from "../src/repositories/userRepository.js";
import { AuthService, hashPassword } from "../src/services/authService.js";
import { parseSyncRequest } from "../src/validation/changeValidator.js";

// D1 im Kleinen: prepare().bind().first()/run() und batch() auf SQLite im Speicher
const sqlite = new DatabaseSync(":memory:");
sqlite.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT, key_hash TEXT, created INTEGER, password_hash TEXT,
    failed_logins INTEGER NOT NULL DEFAULT 0, failed_at INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created INTEGER NOT NULL);`);
const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => sqlite.prepare(sql).get(...args) ?? null,
  run: async () => sqlite.prepare(sql).run(...args),
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
});
const db = { prepare: (sql) => stmt(sql), batch: async (list) => Promise.all(list.map((s) => s.run())) };

sqlite.prepare("INSERT INTO users (id, name, key_hash, created, password_hash) VALUES ('tim', 'Tim', 'x', 0, ?)").run(await hashPassword("geheim"));
sqlite.prepare("INSERT INTO users (id, name, key_hash, created) VALUES ('max', 'Max', 'y', 0)").run();
const auth = new AuthService(new UserRepository(db));
const now = 1_000_000;

// Ohne Passwort kein Anmelden – die App ist öffentlich, sonst könnte jeder die Person antippen
assert.equal((await auth.login("max", "", now)).status, 403, "ohne Passwort kein Antippen");
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get().n, 0, "keine Sitzung entstanden");

// 20 falsche Passwörter gleichzeitig: nur 5 werden geprüft, der Rest ist gesperrt
const results = await Promise.all(Array.from({ length: 20 }, (_, i) => auth.login("tim", `falsch${i}`, now)));
assert.equal(results.filter((r) => r.status === 401).length, 5, "höchstens 5 Versuche werden geprüft");
assert.equal(results.filter((r) => r.status === 429).length, 15, "der Rest ist gesperrt");
assert.equal((await auth.login("tim", "geheim", now + 1000)).status, 429, "gesperrt gilt auch fürs richtige Passwort");
// nach 15 Minuten wieder ein Versuch; richtiges Passwort meldet an und setzt den Zähler zurück
const ok = await auth.login("tim", "geheim", now + 16 * 60 * 1000);
assert.ok(ok.token, "nach Ablauf der Sperre klappt das richtige Passwort");
assert.equal(sqlite.prepare("SELECT failed_logins FROM users WHERE id = 'tim'").get().failed_logins, 0);
assert.equal((await auth.login("tim", "falsch", now + 17 * 60 * 1000)).status, 401, "danach zählt es neu");

// Kartenbilder: nur TCGdex – die Tabelle cards gilt für alle Personen
const change = (img) => ({ since: 0, changes: [{ type: "collection", id: "base1-4", updated: 1, deleted: 0, data: { qty: 1, added: 1, card: { id: "base1-4", name: "Glurak", num: "4", set: "base1", setName: "Grundset", img } } }] });
assert.ok(parseSyncRequest(change("https://assets.tcgdex.net/de/base/base1/4")).ok, "TCGdex-Bild geht durch");
assert.ok(parseSyncRequest(change(null)).ok, "ohne Bild geht durch");
assert.equal(parseSyncRequest(change("https://example.com/pixel.gif")).ok, false, "fremde Adresse wird abgelehnt");

console.log("security ok");
