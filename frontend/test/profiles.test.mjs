// Test von „Wer sammelt?“ (Personen vom Backend, Antippen, Passwort): node frontend/test/profiles.test.mjs
import assert from "node:assert/strict";
import { ProfileService } from "../js/services/profileService.js";

Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); // Node kennt kein onLine
const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true) };
const keysOf = (slot) => ({ sync: `ps.${slot ? `${slot}.` : ""}sync` });
const fail = (status, error) => Promise.reject(Object.assign(new Error(error), { status, body: { error } }));

// Kleines Backend: Lukas ohne Passwort, Lucas mit Passwort „geheim“
const people = [{ id: "owner", name: "Lukas", locked: false }, { id: "lucas", name: "Lucas", locked: true }];
let logins = 0;
const api = {
  people: async () => ({ people: structuredClone(people) }),
  login: async (url, id, password) => {
    const p = people.find((x) => x.id === id);
    if (p.locked && password !== "geheim") return fail(401, "Falsches Passwort.");
    return { token: `token-${id}-${++logins}`, user: { id, name: p.name }, firstLogin: !p.locked && logins === 1 };
  },
  setPassword: async ({ key }, password, oldPassword) => (people[0].locked && oldPassword !== "alt1" ? fail(401, "Bitte das bisherige Passwort angeben.") : ((people[0].locked = Boolean(password)), { ok: true })),
  rename: async (_, name) => ((people[0].name = name), { ok: true, name }),
};
const fresh = () => new ProfileService(storage, "ps.profiles", keysOf, api, "https://b");

// Neues Gerät: alle Personen sind da, Antippen meldet an, die erste Person bekommt den bisherigen Platz
let profiles = fresh();
assert.equal(await profiles.refresh(), true);
assert.deepEqual(profiles.people.map((p) => p.name), ["Lukas", "Lucas"], "Personen kommen vom Backend");
// Beim Start nur einmal am Tag nachfragen; zwei Anfragen gleichzeitig = eine
let peopleCalls = 0;
const askPeople = api.people;
api.people = async () => (peopleCalls++, askPeople());
await fresh().refreshIfOlder(24 * 3600e3);
await fresh().refreshIfOlder(24 * 3600e3, Date.now() + 25 * 3600e3);
await Promise.all([profiles.refresh(), profiles.refresh()]);
assert.equal(peopleCalls, 2, "frisch: keine Anfrage; nach 25 h: eine; gleichzeitig: eine");
api.people = askPeople;
assert.deepEqual(await profiles.choose("owner"), { firstLogin: true }, "Antippen genügt, erster Login");
assert.equal(profiles.slot, "", "erste Person nutzt die bisherigen Speicher-Namen");
assert.equal(storage.get("ps.sync").key, "token-owner-1", "Sitzung statt Sync-Schlüssel gespeichert");

// Mit Passwort: ohne → nachfragen, falsch → Meldung, richtig → eigener Platz
assert.deepEqual(await profiles.choose("lucas"), { needPassword: true });
assert.deepEqual(await profiles.choose("lucas", "falsch"), { error: "Falsches Passwort." });
assert.deepEqual(await profiles.choose("lucas", "geheim"), { firstLogin: false });
assert.equal(fresh().slot, "lucas", "eigener Platz, nach Neustart noch aktiv");

// Zurück zu Lukas: schon angemeldet → ohne neuen Login; zu Lucas immer mit Passwort (wie die PIN bei Netflix)
profiles = fresh();
const before = logins;
assert.deepEqual(await profiles.choose("owner"), { firstLogin: false });
assert.equal(logins, before, "kein neuer Login nötig");
assert.deepEqual(await profiles.choose("lucas"), { needPassword: true }, "geschützt: bei jedem Wechsel fragen");

// Gerät mit altem Sync-Schlüssel: Sync nennt die Person → sie übernimmt den bisherigen Platz
mem.clear();
storage.set("ps.sync", { key: "ALTER-SCHLUESSEL" });
profiles = fresh();
profiles.remember("owner", "Lukas");
assert.deepEqual([profiles.active, profiles.slot], ["owner", ""]);

// Passwort festlegen (frei), ändern nur mit dem alten; Name ändern
await profiles.refresh();
assert.deepEqual(await profiles.setPassword("alt1"), { ok: true });
assert.equal(profiles.people[0].locked, true, "Liste zeigt das Schloss");
assert.deepEqual(await profiles.setPassword("neu2"), { error: "Bitte das bisherige Passwort angeben." });
assert.deepEqual(await profiles.setPassword("neu2", "alt1"), { ok: true });
assert.equal((await profiles.rename("Lukas N.")).name, "Lukas N.");
assert.equal(profiles.people[0].name, "Lukas N.");

console.log("Personen ok");
