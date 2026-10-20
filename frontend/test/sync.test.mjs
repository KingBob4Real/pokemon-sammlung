// Abgleich zwischen Geräten ohne Netz: node frontend/test/sync.test.mjs
// Zusammenführen Feld für Feld, falsch gehende Uhr, abgelehnte Einträge, Päckchen, neuer Versuch nach Fehlern.
import assert from "node:assert/strict";

globalThis.location ??= { pathname: "/" }; // config.js schaut auf die Adresse (Live oder Dev)
Object.defineProperty(globalThis.navigator, "onLine", { value: true, configurable: true });
const { EntityStore } = await import("../js/services/entityStore.js");
const { SyncService } = await import("../js/services/syncService.js");
const { storageKeys } = await import("../js/config.js");

// Uhr von Hand: t = echte Zeit (Server), skew = wie falsch die Uhr des gerade handelnden Geräts geht
let t = 1_000_000_000;
let skew = 0;
Date.now = () => t + skew;
// Neue Versuche nur merken statt warten
const timers = [];
globalThis.setTimeout = (fn, ms) => timers.push(ms);
globalThis.clearTimeout = () => {};

// Server wie im Backend: neuere Änderung gewinnt, zurück kommt alles seit „since“ plus die gesendeten Einträge
const server = { rows: new Map(), rev: 0, calls: [], fail: [] };
server.sync = async (since, changes) => {
  server.calls.push(changes.length);
  const status = server.fail.shift();
  if (status) throw Object.assign(new Error(`HTTP ${status}`), { status });
  const bad = changes.findIndex((c) => c.data?.bad);
  if (bad >= 0) throw Object.assign(new Error("abgelehnt"), { status: 400, body: { error: "abgelehnt", index: bad } });
  if (changes.length) server.rev++;
  for (const c of structuredClone(changes)) {
    const row = server.rows.get(`${c.type}:${c.id}`);
    if (!row || c.updated > row.updated) server.rows.set(`${c.type}:${c.id}`, { ...c, rev: server.rev });
  }
  const sent = new Set(changes.map((c) => `${c.type}:${c.id}`));
  const rows = [...server.rows].filter(([k, r]) => r.rev > since || sent.has(k)).map(([, { rev, ...e }]) => e);
  return { rev: server.rev, now: t, user: "Tim", userId: "tim", changes: structuredClone(rows) };
};
const serverData = (id) => server.rows.get(`collection:${id}`).data;

// Gerät: eigener Speicher (bleibt über einen Neustart erhalten), Speicher + Sync darauf, eigene Uhr
function device(clockSkew = 0, batchSize = 500) {
  const mem = new Map();
  const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true), remove: (k) => mem.delete(k) };
  const api = { sync: (config, since, changes) => server.sync(since, changes) };
  const dev = {
    start() {
      dev.store = new EntityStore(storage, storageKeys());
      dev.sync = new SyncService(dev.store, api, storage, "sync", "https://backend", batchSize);
      dev.sync.config.key = "TIM";
      return dev;
    },
    // als dieses Gerät handeln (mit seiner Uhr)
    async act(fn) {
      skew = clockSkew;
      try {
        return await fn(dev.store, dev.sync);
      } finally {
        skew = 0;
      }
    },
    run: () => dev.act((store, sync) => sync.run()),
    put: (id, patch) => dev.act((store) => store.put("collection", id, { ...store.get("collection", id), ...patch })),
  };
  return dev.start();
}
const entry = { qty: 1, cond: "Near Mint", lang: "Deutsch", paid: null, copies: null, section: null, position: null, card: { id: "x" } };

// --- Zwei Geräte ändern verschiedene Felder derselben Karte: beides bleibt
const a = device();
const b = device();
await a.act((store) => store.put("collection", "x", entry));
await a.run();
await b.run();
t += 1000;
await b.put("x", { section: "ordner-1" });
await b.run();
t += 1000;
await a.put("x", { qty: 3 }); // A hat B's Ordner noch nicht gesehen
a.start(); // App neu gestartet, bevor sie hochladen konnte – der Stand vor der Änderung ist gespeichert
await a.run();
assert.equal(serverData("x").qty, 3, "Anzahl von A");
assert.equal(serverData("x").section, "ordner-1", "Ordner von B bleibt");
assert.equal(a.store.get("collection", "x").section, "ordner-1", "A hat jetzt auch den Ordner");
assert.equal(a.store.pendingCount, 0);
await b.run();
assert.equal(b.store.get("collection", "x").qty, 3, "B bekommt die Anzahl");

// --- Beide ändern dasselbe Feld: die neuere Änderung gewinnt, auch wenn die ältere später hochlädt
t += 1000;
await a.put("x", { position: 5 }); // A offline
t += 1000;
await b.put("x", { position: 9 });
await b.run();
await a.run();
assert.equal(serverData("x").position, 9, "neuere Änderung von B gewinnt");
assert.equal(a.store.get("collection", "x").position, 9);

// --- Felder, die nur zusammen stimmen (Anzahl ↔ Exemplare), kommen nur zusammen: nie copies.length ≠ qty
t += 1000;
const copies = [{ cond: "Mint", lang: "Deutsch", paid: 10 }, { cond: "Played", lang: "Englisch", paid: null }];
await b.put("x", { qty: 2, cond: "Mint", paid: 10, copies });
await b.run();
t += 1000;
await a.put("x", { qty: 4 }); // A: zwei mehr, alle gleich – neuer als B
await a.run();
assert.deepEqual([serverData("x").qty, serverData("x").copies], [4, null], "Anzahl und Exemplare aus derselben Änderung");

// --- Uhr eine Stunde nach: nach dem ersten Abgleich stimmen die Zeitstempel trotzdem
const late = device(-60 * 60 * 1000);
await late.run();
t += 1000;
await b.put("x", { trade: false });
await b.run();
t += 60 * 1000; // eine Minute später ändert das Gerät mit der falschen Uhr dasselbe Feld
await late.put("x", { trade: true });
await late.run();
assert.equal(serverData("x").trade, true, "die wirklich neuere Änderung gewinnt");

// --- Ein abgelehnter Eintrag bleibt auf dem Gerät, der Rest geht hoch
const problems = [];
const c = device(0, 2);
c.sync.addEventListener("problem", (e) => problems.push(e.detail.kind));
server.calls.length = 0;
await c.act((store) => {
  store.put("collection", "ok-1", entry);
  store.put("collection", "kaputt", { ...entry, bad: true });
  for (const id of ["ok-2", "ok-3", "ok-4"]) store.put("collection", id, entry);
});
await c.run();
assert.ok(["ok-1", "ok-2", "ok-3", "ok-4"].every((id) => server.rows.has(`collection:${id}`)), "die anderen sind oben");
assert.equal(server.rows.has("collection:kaputt"), false);
assert.ok(c.store.get("collection", "kaputt"), "der abgelehnte bleibt auf dem Gerät");
assert.equal(c.store.pendingCount, 0, "und blockiert nichts");
assert.deepEqual(problems, ["rejected"]);
assert.deepEqual(server.calls, [0, 2, 2, 2], "erst abholen, dann in Päckchen zu zweit (eins abgelehnt, nochmal)");

// --- Server-Problem: Meldung einmal, neue Versuche mit wachsender Pause, danach wieder alles gut
timers.length = 0;
problems.length = 0;
server.fail.push(503, 503);
await c.put("ok-1", { qty: 2 });
await c.run();
await c.run();
assert.equal(c.sync.state, "error");
assert.deepEqual(problems, ["server"], "dasselbe Problem nur einmal melden");
assert.deepEqual(timers, [10_000, 30_000], "neuer Versuch nach 10 s, dann 30 s");
await c.run();
assert.equal(c.sync.state, "ok");
assert.equal(serverData("ok-1").qty, 2);

// --- Schlüssel wechseln (z. B. Anmeldung abgelaufen): noch nicht Hochgeladenes bleibt und geht zur neuen Person mit
server.fail.push(401);
await c.put("neu-im-browser", { ...entry, card: { id: "neu-im-browser" } });
await c.run();
assert.equal(c.store.pendingCount, 1);
await c.act((store, sync) => sync.configure("ANDERER"));
assert.ok(c.store.get("collection", "neu-im-browser"), "bleibt auf dem Gerät");
assert.ok(server.rows.has("collection:neu-im-browser"), "und ist oben");
assert.equal(c.store.pendingCount, 0);

console.log("Abgleich ok");
