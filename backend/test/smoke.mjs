// Kurzer Test des Backends: node test/smoke.mjs [URL] [SCHLÜSSEL]
// Ohne Angaben: lokales `npx wrangler dev` (Port 8787) mit dem Schlüssel aus .dev.vars.
// Nutzt eine feste Test-Karte und Test-Liste; am Ende ist die Karte auf Anzahl 0 und die Liste gelöscht,
// in der App ist also nichts davon zu sehen.
import assert from "node:assert/strict";
import fs from "node:fs";

const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/$/, "");
const key = process.argv[3] || fs.readFileSync(new URL("../.dev.vars", import.meta.url), "utf8").match(/SYNC_KEY\s*=\s*"?([^"\n]+)/)[1];

const call = async (body, k = key) => {
  const r = await fetch(`${base}/sync`, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

const t = Date.now();
const card = { id: "smoke-test-1", name: "Smoke-Test", num: "1", set: "smoke", setName: "Test", total: null, img: null };
const entry = (updated, qty) => ({ type: "collection", id: card.id, updated, deleted: 0, data: { qty, cond: "Near Mint", lang: "Deutsch", paid: 1.5, added: t, card } });
const find = (res, type, id) => res.body.changes.find((c) => c.type === type && c.id === id);

assert.equal((await fetch(base)).status, 200, "Backend antwortet");
assert.equal((await call({ since: 0, changes: [] }, "falsch")).status, 401, "falscher Schlüssel wird abgewiesen");

const start = await call({ since: 0, changes: [] });
assert.equal(start.status, 200);

const a = await call({ since: start.body.rev, changes: [entry(t, 2)] });
assert.ok(a.body.rev > start.body.rev, "Server-Stand steigt bei Änderungen");
assert.deepEqual(find(a, "collection", card.id).data, entry(t, 2).data, "Eintrag samt Kartendaten kommt zurück");

const old = await call({ since: a.body.rev, changes: [entry(t - 1000, 9)] });
assert.equal(find(old, "collection", card.id).data.qty, 2, "ältere Änderung verliert, Server-Stand kommt zurück");

const none = await call({ since: old.body.rev, changes: [] });
assert.equal(none.body.changes.length, 0, "nichts Neues seit letztem Stand");

const list = { type: "list", id: "smoke-list", updated: t, deleted: 0, data: { name: "Smoke-Liste", created: t } };
const item = { type: "listItem", id: `smoke-list:${card.id}`, updated: t, deleted: 0, data: { list: "smoke-list", card, added: t } };
const b = await call({ since: none.body.rev, changes: [list, item] });
assert.equal(find(b, "list", "smoke-list").data.name, "Smoke-Liste", "Liste kommt an");
assert.deepEqual(find(b, "listItem", item.id).data.card, card, "Listeneintrag mit Karte kommt an");

const gone = { type: "listItem", id: item.id, updated: t + 1, deleted: 1, data: null };
const c = await call({ since: b.body.rev, changes: [gone, { ...list, updated: t + 1, deleted: 1, data: null }, entry(t + 1, 0)] });
assert.equal(find(c, "listItem", item.id).deleted, 1, "Löschen kommt an");

assert.equal((await call({ since: 0, changes: [{ type: "böse", id: "x", updated: 1, deleted: 0, data: {} }] })).status, 400, "unbekannte Art wird abgewiesen");
assert.equal((await call({ since: 0, changes: [{ ...item, id: "falsch:id" }] })).status, 400, "unstimmige ID wird abgewiesen");
console.log("Backend ok:", base);
