// Kurzer Test des Backends: node test/smoke.mjs <URL> <SCHLÜSSEL> [SCHLÜSSEL EINER ZWEITEN PERSON]
// Nutzt eine feste Test-Karte und Test-Liste; am Ende ist die Karte auf Anzahl 0 und die Liste gelöscht,
// in der App ist also nichts davon zu sehen. Mit zweitem Schlüssel wird geprüft, dass die andere Person
// diese Daten nicht sieht (dabei wird für sie nichts geschrieben). Am Ende ein Scan (zählt 1× zum Tageslimit).
import assert from "node:assert/strict";
import { ScanService, toRecognized } from "../src/services/scanService.js";

// Antwort des Bild-Modells prüfen (ohne Netz)
assert.deepEqual(toRecognized('Hier: {"name":"Glurak-ex","number":"#199","total":165,"setCode":"mew","language":"de","confidence":0.9}'), {
  name: "Glurak-ex", number: "199", total: "165", setCode: "MEW", language: "de", confidence: 0.9,
});
assert.deepEqual(toRecognized('{"name":"<b>","number":"199/165","total":null,"language":"fr","confidence":7}'), {
  name: null, number: null, total: null, setCode: null, language: null, confidence: 0,
});
assert.equal(toRecognized("kein JSON").name, null, "Unlesbares wird zu null");

// Tageslimit: pro Person und für alle zusammen – ohne Aufruf der KI
const limited = (mine, total) => new ScanService({ run: () => assert.fail("KI darf nicht laufen") }, { today: async () => ({ mine, total }) }, { perUser: 2, total: 5 }).scan({ id: "x" }, "");
assert.deepEqual(await limited(2, 2), { limited: true }, "Limit pro Person greift");
assert.deepEqual(await limited(0, 5), { limited: true }, "Limit für alle zusammen greift");

const [baseArg, key, otherKey] = process.argv.slice(2);
if (!baseArg || !key) {
  console.error("Aufruf: node test/smoke.mjs <URL> <SCHLÜSSEL> [ZWEITER SCHLÜSSEL]");
  process.exit(1);
}
const base = baseArg.replace(/\/$/, "");

const call = async (body, k = key) => {
  const r = await fetch(`${base}/sync`, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

const t = Date.now();
const card = { id: "smoke-test-1", name: "Smoke-Test", num: "1", set: "smoke", setName: "Test", total: null, img: null };
const entry = (updated, qty) => ({ type: "collection", id: card.id, updated, deleted: 0, data: { qty, cond: "Near Mint", lang: "Deutsch", paid: 1.5, added: t, card } });
const find = (res, type, id) => res.body.changes.find((c) => c.type === type && c.id === id);

assert.equal((await fetch(base)).status, 200, "Backend antwortet");
assert.equal((await call({ since: 0, changes: [] }, "FALSCH-FALSCH")).status, 401, "falscher Schlüssel wird abgewiesen");

const start = await call({ since: 0, changes: [] });
assert.equal(start.status, 200);
assert.equal(typeof start.body.user, "string", "Name der Person kommt zurück");

const a = await call({ since: start.body.rev, changes: [entry(t, 2)] });
assert.ok(a.body.rev > start.body.rev, "Server-Stand steigt bei Änderungen");
assert.deepEqual(find(a, "collection", card.id).data, entry(t, 2).data, "Eintrag samt Kartendaten kommt zurück");

const old = await call({ since: a.body.rev, changes: [entry(t - 1000, 9)] });
assert.equal(find(old, "collection", card.id).data.qty, 2, "ältere Änderung verliert, Server-Stand kommt zurück");

const none = await call({ since: old.body.rev, changes: [] });
assert.equal(none.body.changes.length, 0, "nichts Neues seit letztem Stand");

const list = { type: "list", id: "smoke-list", updated: t, deleted: 0, data: { name: "Smoke-Liste", created: t } };
const item = { type: "listItem", id: `smoke-list:${card.id}`, updated: t, deleted: 0, data: { list: "smoke-list", card, added: t, position: 1.5 } };
const b = await call({ since: none.body.rev, changes: [list, item] });
assert.equal(find(b, "list", "smoke-list").data.name, "Smoke-Liste", "Liste kommt an");
assert.deepEqual(find(b, "listItem", item.id).data.card, card, "Listeneintrag mit Karte kommt an");
assert.equal(find(b, "listItem", item.id).data.position, 1.5, "eigene Reihenfolge (Position) kommt an");

if (otherKey) {
  const other = await call({ since: 0, changes: [] }, otherKey);
  assert.equal(other.status, 200, "zweite Person kommt rein");
  assert.notEqual(other.body.user, start.body.user, "zweite Person ist eine andere");
  assert.ok(!other.body.changes.some((c) => c.id === card.id || c.id === "smoke-list" || c.id === item.id), "zweite Person sieht diese Daten nicht");
}

const gone = { type: "listItem", id: item.id, updated: t + 1, deleted: 1, data: null };
const c = await call({ since: b.body.rev, changes: [gone, { ...list, updated: t + 1, deleted: 1, data: null }, entry(t + 1, 0)] });
assert.equal(find(c, "listItem", item.id).deleted, 1, "Löschen kommt an");

assert.equal((await call({ since: 0, changes: [{ type: "böse", id: "x", updated: 1, deleted: 0, data: {} }] })).status, 400, "unbekannte Art wird abgewiesen");
const rejected = await call({ since: 0, changes: [list, { ...item, id: "falsch:id" }] });
assert.equal(rejected.status, 400, "unstimmige ID wird abgewiesen");
assert.equal(rejected.body.index, 1, "Server nennt die abgelehnte Änderung");
// Karten-Scanner
const scan = async (image, k = key) => {
  const r = await fetch(`${base}/scan`, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
  return { status: r.status, body: await r.json() };
};
assert.equal((await scan("data:image/jpeg;base64,AAAA", "FALSCH-FALSCH")).status, 401, "Scan ohne gültigen Schlüssel wird abgewiesen");
assert.equal((await scan(`data:image/jpeg;base64,${"A".repeat(1.6 * 1024 * 1024)}`)).status, 413, "zu großes Foto wird abgewiesen");
assert.equal((await scan("data:image/gif;base64,AAAA")).status, 400, "falsches Format wird abgewiesen");
const photo = Buffer.from(await (await fetch("https://assets.tcgdex.net/de/sv/sv03.5/199/low.jpg")).arrayBuffer()).toString("base64");
const scanned = await scan(`data:image/jpeg;base64,${photo}`);
if (scanned.status === 429) console.log("Scan: Tageslimit erreicht – Erkennung nicht geprüft");
else {
  assert.equal(scanned.status, 200, `Scan klappt (${JSON.stringify(scanned.body)})`);
  assert.equal(scanned.body.recognized.number, "199", "Kartennummer erkannt");
}

console.log(`Backend ok: ${base} (Person: ${start.body.user}${otherKey ? ", Trennung zu zweiter Person geprüft" : ""}${scanned.status === 200 ? `, Scan: ${scanned.body.recognized.name} ${scanned.body.recognized.number}/${scanned.body.recognized.total}` : ""})`);
