// Test der Personen auf einem Gerät („Wer sammelt?“): node frontend/test/profiles.test.mjs
import assert from "node:assert/strict";
import { ProfileService } from "../js/services/profileService.js";

Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); // Node kennt kein onLine
const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true), remove: (k) => mem.delete(k) };
const keysOf = (p) => ({ entities: `ps.${p}entities`, dirty: `ps.${p}dirty`, rev: `ps.${p}rev`, sync: `ps.${p}sync`, prefs: `ps.${p}prefs`, prices: "ps.prices" });
const users = { "AAAA-1111": "Lukas", "BBBB-2222": "Tim" };
const api = { sync: async ({ key }) => (users[key] ? { user: users[key], rev: 0, changes: [] } : Promise.reject(Object.assign(new Error("401"), { status: 401 }))) };
const fresh = () => new ProfileService(storage, "ps.profiles", keysOf, api);

// Neues Gerät ohne Sync: die erste Person bekommt den bisherigen Platz ""
let profiles = fresh();
assert.deepEqual(await profiles.add("https://b", "zzzz-9999"), { error: "Dieser Schlüssel stimmt nicht." }, "falscher Schlüssel → nichts angelegt");
assert.deepEqual(await profiles.add("https://b", "aaaa 1111"), { id: "" }, "erste Person nutzt den bisherigen Platz");
assert.equal(storage.get(keysOf("").sync).key, "AAAA-1111", "Schlüssel normalisiert gespeichert");

// Zweite Person bekommt einen eigenen Platz; derselbe Schlüssel nochmal → kein Duplikat
const tim = await profiles.add("https://b", "BBBB-2222");
assert.ok(tim.id && tim.id !== "", "eigener Platz für Tim");
assert.deepEqual(await profiles.add("https://b", "BBBB-2222"), { id: tim.id }, "schon da → dorthin wechseln");
assert.deepEqual(profiles.list.map((p) => p.name), ["Lukas", "Tim"]);

// Wechseln bleibt gespeichert (die App lädt danach neu)
profiles.switchTo(tim.id);
assert.equal(fresh().active, tim.id);

// Entfernen: nur andere Personen, ihre Daten auf dem Gerät sind weg, gemeinsame Preise bleiben
storage.set(keysOf("").entities, { x: 1 });
storage.set("ps.prices", { y: 1 });
profiles = fresh();
profiles.remove(tim.id);
assert.equal(profiles.list.length, 2, "aktive Person lässt sich nicht entfernen");
profiles.remove("");
assert.deepEqual(profiles.list.map((p) => p.name), ["Tim"]);
assert.equal(storage.get(keysOf("").entities, null), null, "Daten der entfernten Person gelöscht");
assert.deepEqual(storage.get("ps.prices"), { y: 1 }, "Preise bleiben");

// Name kommt beim Sync vom Backend
profiles.remember("Tim B.");
assert.equal(profiles.list[0].name, "Tim B.");

console.log("Personen ok");
