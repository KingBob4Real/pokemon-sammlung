import { MAX_CHANGES_PER_REQUEST } from "../config.js";

// Prüft eine Sync-Anfrage: { since, changes: [{ type, id, data, updated, deleted }] }.
// Pro Datenart eine Regel; eine neue Art braucht hier eine Zeile.

const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v, max) => v == null || str(v, max);
const int = (v) => Number.isSafeInteger(v);
const optAmount = (v) => v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7);
const optPosition = (v) => v == null || (typeof v === "number" && Number.isFinite(v));

const isCard = (c) =>
  c != null &&
  str(c.id, 100) &&
  str(c.name, 200) &&
  str(c.num, 20) &&
  str(c.set, 60) &&
  str(c.setName, 200) &&
  (c.total == null || int(c.total)) &&
  (c.img == null || (str(c.img, 300) && c.img.startsWith("https://")));

const DATA_RULES = {
  collection: (d, id) =>
    int(d.qty) && d.qty >= 0 && d.qty <= 9999 && optStr(d.cond, 40) && optStr(d.lang, 40) && optAmount(d.paid) && int(d.added) && isCard(d.card) && d.card.id === id,
  list: (d) => str(d.name, 80) && d.name.trim() !== "" && int(d.created) && optPosition(d.position),
  listItem: (d, id) => str(d.list, 100) && isCard(d.card) && int(d.added) && optPosition(d.position) && id === `${d.list}:${d.card.id}`,
};

export const CHANGE_TYPES = Object.keys(DATA_RULES);

function isValidChange(c) {
  if (c == null || typeof c !== "object" || !DATA_RULES[c.type]) return false;
  if (!str(c.id, 300) || !int(c.updated) || (c.deleted !== 0 && c.deleted !== 1)) return false;
  if (c.type === "listItem" && !c.id.includes(":")) return false;
  if (c.deleted === 1) return c.data == null;
  return c.data != null && typeof c.data === "object" && DATA_RULES[c.type](c.data, c.id);
}

export function parseSyncRequest(body) {
  const since = Number.isSafeInteger(body?.since) && body.since >= 0 ? body.since : 0;
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES_PER_REQUEST) return { ok: false, status: 413, error: `Höchstens ${MAX_CHANGES_PER_REQUEST} Änderungen pro Anfrage` };
  const bad = changes.findIndex((c) => !isValidChange(c));
  if (bad >= 0) return { ok: false, status: 400, error: `Ungültige Änderung an Position ${bad}` };
  // nur die bekannten Felder weiterreichen
  return { ok: true, since, changes: changes.map(({ type, id, data, updated, deleted }) => ({ type, id, data: data ?? null, updated, deleted })) };
}
