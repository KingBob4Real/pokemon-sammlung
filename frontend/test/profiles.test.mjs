// Test von „Wer sammelt?“ (Personen vom Backend, Antippen, Passwort): node frontend/test/profiles.test.mjs
import assert from "node:assert/strict";

globalThis.location ??= { pathname: "/" }; // config.js schaut auf die Adresse (Live oder Dev)
const { ProfileService } = await import("../js/services/profileService.js");
const { PERSONAL_KEYS } = await import("../js/config.js");

Object.defineProperty(navigator, "onLine", { value: true, configurable: true }); // Node kennt kein onLine
const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true), remove: (k) => mem.delete(k) };
const keysOf = (slot) => Object.fromEntries(PERSONAL_KEYS.map((k) => [k, `ps.${slot ? `${slot}.` : ""}${k}`]));
const fail = (status, error) => Promise.reject(Object.assign(new Error(error), { status, body: { error } }));

// Kleines Backend: Lukas ohne Passwort (Anmelden geht dann nicht), Lucas mit Passwort „geheim“
const people = [{ id: "owner", name: "Lukas", locked: false }, { id: "lucas", name: "Lucas", locked: true }];
let logins = 0;
const loggedOut = [];
const api = {
  logout: async ({ key }) => (loggedOut.push(key), { ok: true }),
  people: async () => ({ people: structuredClone(people) }),
  login: async (url, id, password) => {
    const p = people.find((x) => x.id === id);
    if (!p.locked) return fail(403, `${p.name} hat noch kein Passwort.`);
    if (password !== "geheim") return fail(401, "Falsches Passwort.");
    return { token: `token-${id}-${++logins}`, user: { id, name: p.name } };
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
// Ohne Passwort kein Anmelden per Antippen (die App ist öffentlich) – die Meldung des Backends kommt an
assert.deepEqual(await profiles.choose("owner"), { error: "Lukas hat noch kein Passwort." }, "ohne Passwort kein Antippen");
assert.equal(storage.get("ps.sync", null), null, "nichts gespeichert");

// Mit Passwort: ohne → nachfragen, falsch → Meldung, richtig → angemeldet; die erste Person bekommt den bisherigen Platz
assert.deepEqual(await profiles.choose("lucas"), { needPassword: true });
assert.deepEqual(await profiles.choose("lucas", "falsch"), { error: "Falsches Passwort." });
// Liste auf dem Gerät veraltet (Lucas hat inzwischen ein Passwort): nachfragen statt „Passwort fehlt.“
profiles.people[1].locked = false;
api.login = ((login) => (url, id, password) => (id === "lucas" && !password ? fail(401, "Passwort fehlt.") : login(url, id, password)))(api.login);
assert.deepEqual(await profiles.choose("lucas"), { needPassword: true }, "veraltete Liste → nach Passwort fragen");
assert.equal(fresh().people[1].locked, true, "Schloss gemerkt");
assert.deepEqual(await profiles.choose("lucas", "geheim"), {});
assert.equal(fresh().slot, "", "erste Person nutzt die bisherigen Speicher-Namen, nach Neustart noch aktiv");
assert.equal(storage.get("ps.sync").key, "token-lucas-1", "Sitzung statt Sync-Schlüssel gespeichert");

// Auf dem Gerät schon angemeldet → wechseln ohne Passwort, auch zu einer Person mit Passwort (einmal pro Gerät reicht)
storage.set("ps.owner.sync", { key: "token-owner-alt" });
profiles = fresh();
const before = logins;
assert.deepEqual(await profiles.choose("owner"), {});
assert.equal(profiles.slot, "owner", "eigener Platz");
assert.deepEqual(await profiles.choose("lucas"), {}, "zurück zu Lucas ohne Passwort");
assert.equal(logins, before, "kein neuer Login nötig");

// Anmeldung abgelaufen (Passwort woanders geändert): einmal neu anmelden, gleicher Platz – die Daten bleiben
storage.set("ps.entities", { x: 1 });
assert.deepEqual(await profiles.choose("lucas", "", true), { needPassword: true });
assert.deepEqual(await profiles.choose("lucas", "geheim", true), {});
assert.deepEqual([profiles.slot, storage.get("ps.sync").key, storage.get("ps.entities")], ["", "token-lucas-2", { x: 1 }], "neue Sitzung, Daten noch da");
assert.deepEqual(loggedOut, ["token-lucas-1"], "neue Anmeldung beendet die alte Sitzung dieses Geräts");

// Abmelden: Sitzung im Backend beenden, eigene Daten der Person weg, Daten der anderen bleiben, danach niemand aktiv
storage.set("ps.prices.v4", { y: 1 });
await profiles.logout();
assert.equal(loggedOut.at(-1), "token-lucas-2", "Sitzung beendet");
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

// Passwort festlegen (frei), ändern nur mit dem alten; Name ändern
await profiles.refresh();
assert.deepEqual(await profiles.setPassword("alt1"), { ok: true });
assert.equal(profiles.people[0].locked, true, "Liste zeigt das Schloss");
assert.deepEqual(await profiles.setPassword("neu2"), { error: "Bitte das bisherige Passwort angeben." });
assert.deepEqual(await profiles.setPassword("neu2", "alt1"), { ok: true });
assert.equal((await profiles.rename("Lukas N.")).name, "Lukas N.");
assert.equal(profiles.people[0].name, "Lukas N.");

console.log("Personen ok");
