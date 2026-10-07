// Kurzer Test des Backends: node smoke.mjs [URL] [SCHLÜSSEL]
// Ohne Angaben: lokales `npx wrangler dev` (Port 8787) mit dem Schlüssel aus .dev.vars.
// Legt eine Test-Karte an und löscht sie am Ende wieder (bleibt als gelöschter Eintrag liegen, die App ignoriert ihn).
import assert from "node:assert/strict";
import fs from "node:fs";

const url = (process.argv[2] || "http://localhost:8787").replace(/\/$/, "") + "/sync";
const key = process.argv[3] || fs.readFileSync(new URL(".dev.vars", import.meta.url), "utf8").match(/SYNC_KEY\s*=\s*"?([^"\n]+)/)[1];

const call = async (body, k = key) => {
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

const id = `c:smoke-test-${Date.now()}`;
const doc = (updated, data, deleted = 0) => ({ id, kind: "card", data, updated, deleted });

assert.equal((await call({ since: 0, changes: [] }, "falsch")).status, 401, "falscher Schlüssel wird abgewiesen");

const start = await call({ since: 0, changes: [] });
assert.equal(start.status, 200);
const since = start.body.rev;

const a = await call({ since, changes: [doc(2000, { qty: 2 })] });
assert.ok(a.body.rev > since, "rev steigt bei Änderungen");
assert.deepEqual(a.body.docs.find((d) => d.id === id).data, { qty: 2 });

const old = await call({ since: a.body.rev, changes: [doc(1000, { qty: 9 })] });
assert.deepEqual(old.body.docs.find((d) => d.id === id).data, { qty: 2 }, "ältere Änderung verliert, Server-Stand kommt zurück");

const none = await call({ since: old.body.rev, changes: [] });
assert.equal(none.body.docs.length, 0, "nichts Neues seit letztem Stand");

const del = await call({ since: none.body.rev, changes: [doc(3000, null, 1)] });
assert.equal(del.body.docs.find((d) => d.id === id).deleted, 1, "Löschen kommt an");

assert.equal((await call({ since: 0, changes: [{ id: "x", kind: "böse", updated: 1, deleted: 0 }] })).status, 400, "unbekannte Art wird abgewiesen");
console.log("Backend ok:", url);
