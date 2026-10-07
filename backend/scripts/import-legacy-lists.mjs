// Listen der alten Karten-Checkliste für eine Person ins Backend übernehmen:
//   node scripts/import-legacy-lists.mjs <BACKEND-URL> <SCHLÜSSEL-DATEI>
// Jede Gruppe der alten Checkliste wird eine Liste (gleiche IDs wie beim Import in der App, also nichts doppelt).
// Der Abhak-Status liegt nur auf den Geräten – den übernimmt die App unter „Mehr“ → Import.
import fs from "node:fs";

const OLD_CARDS = "https://kingbob4real.github.io/pokemon-karten-checkliste/cards.json";
const [baseArg, keyFile] = process.argv.slice(2);
if (!baseArg || !keyFile) {
  console.error("Aufruf: node scripts/import-legacy-lists.mjs <BACKEND-URL> <SCHLÜSSEL-DATEI>");
  process.exit(1);
}
const key = fs.readFileSync(keyFile, "utf8").trim();
const old = await (await fetch(OLD_CARDS, { cache: "no-store" })).json();

const now = Date.now();
const groups = (old.groups || []).map((g) => g.id);
const groupName = new Map((old.groups || []).map((g) => [g.id, g.name]));
const changes = [];
const seenLists = new Set();
let i = 0;
for (const line of old.lines || []) {
  const gid = line.group || line.id;
  const listId = `alt-${gid}`;
  if (!seenLists.has(listId)) {
    seenLists.add(listId);
    const created = now + (groups.includes(gid) ? groups.indexOf(gid) : groups.length + i);
    changes.push({ type: "list", id: listId, updated: now, deleted: 0, data: { name: groupName.get(gid) || line.name || gid, created } });
  }
  for (const slot of line.slots || []) {
    for (const c of slot.options || []) {
      i++;
      const set = old.sets?.[c.set] || {};
      const card = { id: c.id, name: c.name, num: String(c.number), set: set.id || c.id.split("-")[0], setName: set.name || c.set, total: set.official || null, img: c.image || null };
      changes.push({ type: "listItem", id: `${listId}:${c.id}`, updated: now, deleted: 0, data: { list: listId, card, added: now + i } });
    }
  }
}

const res = await fetch(`${baseArg.replace(/\/$/, "")}/sync`, {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ since: 0, changes }),
});
const body = await res.json();
if (!res.ok) {
  console.error(`Fehler ${res.status}: ${body.error}`);
  process.exit(1);
}
console.log(`Übernommen für ${body.user}: ${seenLists.size} Listen mit ${changes.length - seenLists.size} Karten.`);
