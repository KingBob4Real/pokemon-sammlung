// Kurzer Test des Backends: node test/smoke.mjs <URL> <SCHLÜSSEL> [SCHLÜSSEL EINER ZWEITEN PERSON]
// Nutzt eine feste Test-Karte und Test-Liste; am Ende ist die Karte auf Anzahl 0 und die Liste gelöscht,
// in der App ist also nichts davon zu sehen. Mit zweitem Schlüssel wird geprüft, dass die andere Person
// diese Daten nicht sieht (dabei wird für sie nichts geschrieben). Am Ende ein Scan (zählt 1× zum Tageslimit).
import assert from "node:assert/strict";
import fs from "node:fs";
import { parseImageRequest } from "../src/validation/imageValidator.js";
import { ScanService, scansLeft, toRecognized } from "../src/services/scanService.js";

// Antwort des Bild-Modells prüfen (ohne Netz)
assert.deepEqual(toRecognized('Hier: {"name":"Glurak-ex","number":"#199","total":165,"setCode":"mew","language":"de","confidence":0.9}'), {
  name: "Glurak-ex", number: "199", total: "165", setCode: "MEW", language: "de", stamp: null, confidence: 0.9,
});
assert.deepEqual(toRecognized('{"name":"<b>","number":"199/165","total":null,"language":"fr","confidence":7}'), {
  name: null, number: null, total: null, setCode: null, language: null, stamp: null, confidence: 0,
});
const palkia = toRecognized('{"name":"Palkia LV.X","number":"106","total":"106","setCode":null,"language":"en","stamp":30,"confidence":1}');
assert.equal(palkia.stamp, 30, "30-Logo: Klassische Sammlung");
assert.equal(toRecognized('{"name":"Arktos","number":"097","setCode":"MEP DE","confidence":1}').setCode, "MEP", "Sprachkürzel neben dem Set-Kürzel fällt weg");
assert.equal(toRecognized("kein JSON").name, null, "Unlesbares wird zu null");

// Tageslimit: pro Person und für alle zusammen – ohne Aufruf der KI
const limited = (mine, total) => new ScanService({ run: () => assert.fail("KI darf nicht laufen") }, { today: async () => ({ mine, total }) }, { perUser: 2, total: 5 }).scan({ id: "x" }, "");
assert.deepEqual(await limited(2, 2), { limited: true, remaining: 0 }, "Limit pro Person greift");
assert.deepEqual(await limited(0, 5), { limited: true, remaining: 0 }, "Limit für alle zusammen greift");
assert.equal(scansLeft({ mine: 10, total: 100 }, { perUser: 360, total: 900 }), 350, "übrig: pro Person");
assert.equal(scansLeft({ mine: 10, total: 895 }, { perUser: 360, total: 900 }), 5, "übrig: Gesamtlimit ist knapper");
assert.equal(scansLeft({ mine: 400, total: 400 }, { perUser: 360, total: 900 }), 0, "nie negativ");
// Gratis-Tarif: Live + Dev zusammen bleiben auch im schlimmsten Fall (825 Tokens rein, 100 raus) unter 10.000 Neurons
const toml = fs.readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const totals = [...toml.matchAll(/^SCANS_PER_DAY_TOTAL = "(\d+)"/gm)].map((m) => Number(m[1]));
const worst = (825 * 9091 + 100 * 27273) / 1e6;
assert.equal(totals.length, 2, "Gesamtlimit für Live und Dev in wrangler.toml");
assert.ok((totals[0] + totals[1] + 5) * worst < 10000, `Limits passen in den Gratis-Tarif (${Math.round((totals[0] + totals[1]) * worst)} Neurons)`);
// Bild-Durchreicher: nur Kürzel, Nummer, Größe
assert.deepEqual(parseImageRequest("https://x/img?set=SVP&n=175&size=SM"), { set: "SVP", n: "175", size: "SM" });
assert.equal(parseImageRequest("https://x/img?set=SVP&n=175&size=XL"), null, "unbekannte Größe");
assert.equal(parseImageRequest("https://x/img?set=../..&n=1&size=SM"), null, "kein Pfad im Kürzel");
assert.deepEqual(parseImageRequest("https://x/img?set=MEP&n=033&size=LG"), { set: "MEP", n: "033", size: "LG" }, "Nummer dreistellig wie bei Limitless");
assert.equal(parseImageRequest("https://x/img?set=SVP&n=1a&size=SM"), null, "nur Ziffern");
assert.equal(parseImageRequest("https://x/img?set=30C&n=CC12&size=SM")?.n, "CC12", "Klassische Sammlung");

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
const entry = (updated, qty) => ({ type: "collection", id: card.id, updated, deleted: 0, data: { qty, cond: "Near Mint", lang: "Deutsch", paid: 1.5, added: t, section: null, position: null, card } });
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

// Abteilung + Karte darin mit eigener Position
const section = { type: "section", id: "smoke-section", updated: t, deleted: 0, data: { name: "Smoke-Abteilung", created: t, position: 2 } };
const placed = { ...entry(t + 1, 1), data: { ...entry(t + 1, 1).data, section: "smoke-section", position: 1.5 } };
const s1 = await call({ since: b.body.rev, changes: [section, placed] });
assert.equal(find(s1, "section", "smoke-section").data.name, "Smoke-Abteilung", "Abteilung kommt an");
assert.deepEqual([find(s1, "collection", card.id).data.section, find(s1, "collection", card.id).data.position], ["smoke-section", 1.5], "Karte kennt Abteilung und Position");
await call({ since: s1.body.rev, changes: [{ ...section, updated: t + 2, deleted: 1, data: null }] });

const gone = { type: "listItem", id: item.id, updated: t + 1, deleted: 1, data: null };
const c = await call({ since: b.body.rev, changes: [gone, { ...list, updated: t + 1, deleted: 1, data: null }, entry(t + 3, 0)] });
assert.equal(find(c, "listItem", item.id).deleted, 1, "Löschen kommt an");

assert.equal((await call({ since: 0, changes: [{ type: "böse", id: "x", updated: 1, deleted: 0, data: {} }] })).status, 400, "unbekannte Art wird abgewiesen");
const rejected = await call({ since: 0, changes: [list, { ...item, id: "falsch:id" }] });
assert.equal(rejected.status, 400, "unstimmige ID wird abgewiesen");
assert.equal(rejected.body.index, 1, "Server nennt die abgelehnte Änderung");
// „Wer sammelt?“: Personen-Liste ist öffentlich, Sync nennt die eigene ID
const post = async (path, payload, k) => {
  const r = await fetch(`${base}${path}`, { method: "POST", headers: { ...(k ? { Authorization: `Bearer ${k}` } : {}), "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: r.status, body: await r.json() };
};
const { people } = await (await fetch(`${base}/people`)).json();
const me = people.find((p) => p.id === start.body.userId);
assert.ok(me && me.name === start.body.user, "Person steht in der Liste, Sync nennt ihre ID");

// Anmelden & Passwort – setzt kurz ein Passwort und meldet dabei andere Geräte dieser Person ab.
// Darum nur auf Wunsch und am besten mit einer Test-Person: SMOKE_ACCOUNTS=1 node test/smoke.mjs <Dev-URL> <Test-Schlüssel>
if (process.env.SMOKE_ACCOUNTS === "1" && !me.locked) {
  const id = me.id;
  const a = await post("/login", { id });
  assert.equal(a.status, 200, "ohne Passwort: Antippen genügt");
  assert.equal(typeof a.body.firstLogin, "boolean", "App erfährt, ob die Person zum ersten Mal da ist");
  const other = (await post("/login", { id })).body.token; // zweites Gerät
  assert.equal((await call({ since: 0, changes: [] }, a.body.token)).status, 200, "Sitzung gilt wie der Schlüssel");
  assert.equal((await post("/me/password", { password: "abc" }, a.body.token)).status, 400, "zu kurzes Passwort abgelehnt");
  assert.equal((await post("/me/password", { password: "test-1234" }, a.body.token)).status, 200);
  assert.ok((await (await fetch(`${base}/people`)).json()).people.find((p) => p.id === id).locked, "Person ist jetzt gesperrt");
  assert.equal((await post("/login", { id })).status, 401, "ohne Passwort kein Zutritt");
  assert.equal((await post("/login", { id, password: "falsch" })).status, 401, "falsches Passwort");
  const b = await post("/login", { id, password: "test-1234" });
  assert.equal(b.status, 200, "richtiges Passwort");
  assert.equal(b.body.firstLogin, false, "mit Passwort ist es nie der erste Login");
  assert.equal((await call({ since: 0, changes: [] }, other)).status, 401, "anderes Gerät wurde abgemeldet");
  assert.equal((await call({ since: 0, changes: [] }, a.body.token)).status, 200, "dieses Gerät bleibt angemeldet");
  assert.equal((await call({ since: 0, changes: [] })).status, 200, "Sync-Schlüssel gilt weiter");
  assert.equal((await post("/me/password", { password: "neu-12345" }, b.body.token)).status, 401, "ändern ohne altes Passwort geht nicht");
  assert.equal((await post("/me/password", { password: "neu-12345", oldPassword: "falsch" }, b.body.token)).status, 401, "ändern mit falschem alten geht nicht");
  assert.equal((await post("/me/password", { password: "neu-12345", oldPassword: "test-1234" }, b.body.token)).status, 200, "ändern mit dem alten Passwort");
  assert.equal((await post("/me/password", { password: "" }, b.body.token)).status, 401, "entfernen nur mit altem Passwort");
  assert.equal((await post("/me/password", { password: "", oldPassword: "neu-12345" }, b.body.token)).status, 200, "Passwort wieder weg");
  assert.equal((await post("/me/name", { name: "Smoke-Name" }, key)).body.name, "Smoke-Name", "Name ändern");
  await post("/me/name", { name: me.name }, key);
  console.log("Anmelden & Passwort ok");
}

// Karten-Scanner
const scan = async (image, k = key) => {
  const r = await fetch(`${base}/scan`, { method: "POST", headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" }, body: JSON.stringify({ image }) });
  return { status: r.status, body: await r.json() };
};
assert.equal((await scan("data:image/jpeg;base64,AAAA", "FALSCH-FALSCH")).status, 401, "Scan ohne gültigen Schlüssel wird abgewiesen");
assert.equal((await scan(`data:image/jpeg;base64,${"A".repeat(1.6 * 1024 * 1024)}`)).status, 413, "zu großes Foto wird abgewiesen");
assert.equal((await scan("data:image/gif;base64,AAAA")).status, 400, "falsches Format wird abgewiesen");
const photo = Buffer.from(await (await fetch("https://assets.tcgdex.net/de/sv/sv03.5/199/low.jpg")).arrayBuffer()).toString("base64");
const usage = await (await fetch(`${base}/scan/usage`, { headers: { Authorization: `Bearer ${key}` } })).json();
assert.ok(Number.isInteger(usage.remaining), "GET /scan/usage nennt die übrigen Scans");
const scanned = await scan(`data:image/jpeg;base64,${photo}`);
if (scanned.status === 429) console.log("Scan: Tageslimit erreicht – Erkennung nicht geprüft");
else {
  assert.equal(scanned.status, 200, `Scan klappt (${JSON.stringify(scanned.body)})`);
  assert.equal(scanned.body.recognized.number, "199", "Kartennummer erkannt");
  assert.equal(scanned.body.remaining, usage.remaining - 1, "Scan zählt einen herunter");
}
// Kartenbild über den Durchreicher: mit CORS, fehlendes Bild = 404
const img = await fetch(`${base}/img?set=MEP&n=033&size=SM`);
assert.equal(img.status, 200, "MEP 033 kommt über /img");
assert.equal(img.headers.get("Access-Control-Allow-Origin"), "*", "mit CORS-Header");
assert.equal((await fetch(`${base}/img?set=SVP&n=9999&size=SM`)).status, 404, "fehlendes Bild → 404");

console.log(`Backend ok: ${base} (Person: ${start.body.user}${otherKey ? ", Trennung zu zweiter Person geprüft" : ""}${scanned.status === 200 ? `, Scan: ${scanned.body.recognized.name} ${scanned.body.recognized.number}/${scanned.body.recognized.total}` : ""})`);
