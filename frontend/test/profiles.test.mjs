// Test von „Wer sammelt?“ (Personen vom Backend, Antippen): node frontend/test/profiles.test.mjs
import assert from "node:assert/strict";

globalThis.location ??= { pathname: "/" }; // config.js schaut auf die Adresse (Live oder Dev)
const { ProfileService } = await import("../js/services/profileService.js");
const { PERSONAL_KEYS } = await import("../js/config.js");

Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); // Node kennt kein onLine
const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true), remove: (k) => mem.delete(k) };
const keysOf = (slot) => Object.fromEntries(PERSONAL_KEYS.map((k) => [k, `ps.${slot ? `${slot}.` : ""}${k}`]));
const fail = (status, error) => Promise.reject(Object.assign(new Error(error), { status, body: { error } }));

// Kleines Backend: Antippen meldet an
const people = [{ id: "owner", name: "Lukas" }, { id: "lucas", name: "Lucas" }];
let logins = 0;
const loggedOut = [];
const api = {
  logout: async ({ key }) => (loggedOut.push(key), { ok: true }),
  people: async () => ({ people: structuredClone(people) }),
  login: async (url, id) => {
    const p = people.find((x) => x.id === id);
    if (!p) return fail(404, "Diese Person gibt es nicht.");
    return { token: `token-${id}-${++logins}`, user: { id, name: p.name } };
  },
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
// Antippen meldet an; die erste Person bekommt den bisherigen Platz
assert.deepEqual(await profiles.choose("lucas"), {});
assert.equal(fresh().slot, "", "erste Person nutzt die bisherigen Speicher-Namen, nach Neustart noch aktiv");
assert.equal(storage.get("ps.sync").key, "token-lucas-1", "Sitzung statt Sync-Schlüssel gespeichert");

// Lukas ist auf dem Gerät schon angemeldet (z. B. von früher) → Wechsel ohne neuen Login, zurück zu Lucas auch
storage.set("ps.owner.sync", { key: "token-owner-alt" });
profiles = fresh();
const before = logins;
assert.deepEqual(await profiles.choose("owner"), {});
assert.equal(logins, before, "kein neuer Login nötig");
assert.equal(profiles.slot, "owner", "eigener Platz");
assert.deepEqual(await profiles.choose("lucas"), {});
assert.equal(logins, before, "zurück ohne neuen Login");

// Abmelden: Sitzung im Backend beenden, eigene Daten der Person weg, Daten der anderen bleiben, danach niemand aktiv
storage.set("ps.entities", { x: 1 });
storage.set("ps.prices.v4", { y: 1 });
await profiles.logout();
assert.equal(loggedOut.at(-1), "token-lucas-1", "Sitzung beendet");
assert.deepEqual([storage.get("ps.sync", null), storage.get("ps.entities", null)], [null, null], "Lucas' Daten sind vom Gerät");
assert.deepEqual([storage.get("ps.owner.sync").key, storage.get("ps.prices.v4")], ["token-owner-alt", { y: 1 }], "Lukas und gemeinsame Preise bleiben");
profiles = fresh();
assert.deepEqual([profiles.active, "lucas" in profiles.data.slots], ["", false], "nach Neustart ist niemand angemeldet");
api.logout = async () => Promise.reject(new Error("offline"));
await profiles.choose("owner");
await profiles.logout();
assert.equal(storage.get("ps.owner.sync", null), null, "offline abmelden klappt auf dem Gerät trotzdem");

// Gerät mit altem Sync-Schlüssel: Sync nennt die Person → sie übernimmt den bisherigen Platz
mem.clear();
storage.set("ps.sync", { key: "ALTER-SCHLUESSEL" });
profiles = fresh();
profiles.remember("owner", "Lukas");
assert.deepEqual([profiles.active, profiles.slot], ["owner", ""]);

// Name ändern
await profiles.refresh();
assert.equal((await profiles.rename("Lukas N.")).name, "Lukas N.");
assert.equal(profiles.people[0].name, "Lukas N.");

console.log("Personen ok");
