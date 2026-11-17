// Protokoll der App ohne Netz: node frontend/test/log.test.mjs
// Ringpuffer, bleibt über einen Neustart, Fehler lesbar, nur Warnungen/Fehler gehen von selbst ans Backend – jeder nur einmal.
import assert from "node:assert/strict";

const { Log } = await import("../js/core/log.js");

const mem = new Map();
const storage = { get: (k, f) => (mem.has(k) ? structuredClone(mem.get(k)) : f), set: (k, v) => (mem.set(k, structuredClone(v)), true), remove: (k) => mem.delete(k) };
let now = 1_000_000;
const make = () => new Log(storage, "log", { max: 5, out: null, now: () => now });

// --- Ringpuffer: die ältesten fliegen raus, Neustart behält den Rest und das Gerät
let log = make();
for (let i = 1; i <= 7; i++) log.info("app", `Eintrag ${i}`);
assert.deepEqual(log.entries().map((e) => e.m), ["Eintrag 3", "Eintrag 4", "Eintrag 5", "Eintrag 6", "Eintrag 7"]);
const device = log.device;
log = make();
assert.equal(log.entries().length, 5, "bleibt über einen Neustart");
assert.equal(log.device, device, "gleiches Gerät");

// --- Fehlerobjekte lesbar, Person steht dabei, lange Daten gekürzt
log.context.person = "owner";
log.error("sync", "Abgleich fehlgeschlagen", { error: Object.assign(new Error("HTTP 401"), { status: 401 }) });
const last = log.entries().at(-1);
assert.deepEqual([last.l, last.p, last.d.error.message, last.d.error.status], ["error", "owner", "HTTP 401", 401]);
log.info("app", "groß", { text: "x".repeat(5000) });
assert.ok(typeof log.entries().at(-1).d === "string" && log.entries().at(-1).d.length < 700, "große Daten werden gekürzt");
assert.match(log.text({ version: "0.2.0" }), /^device: \w+ · version: 0\.2\.0\n.*ERROR \[sync\] \(owner\) Abgleich fehlgeschlagen/s);

// --- Ans Backend: nur Warnungen/Fehler, jeder nur einmal; klappt es nicht, beim nächsten Mal nochmal
mem.clear();
log = make();
const sent = [];
const ok = async (entries) => sent.push(entries.map((e) => e.m));
log.info("app", "Start");
log.warn("sync", "W1");
log.error("auth", "E1");
assert.equal(await log.ship(ok), 2);
assert.deepEqual(sent, [["W1", "E1"]]);
log.warn("sync", "W2");
assert.equal(await log.ship(ok), 0, "höchstens einmal pro Minute");
now += 61_000;
assert.equal(await log.ship(async () => Promise.reject(new Error("offline"))).catch(() => "fehler"), "fehler");
now += 61_000;
await log.ship(ok);
assert.deepEqual(sent.at(-1), ["W2"], "nach einem Fehler nochmal, ohne Doppelte");
assert.equal(await log.ship(ok, { force: true }), 0, "nichts Neues");
assert.equal(await log.ship(ok, { all: true, force: true }), 4, "auf Wunsch alles (auch info)");
log = make();
assert.equal(await log.ship(ok, { force: true }), 0, "Stand des Hochgeschickten bleibt über einen Neustart");

// --- Leeren
log.clear();
assert.equal(log.entries().length, 0);

console.log("Protokoll ok");
