import { MAX_CHANGES_PER_REQUEST, MAX_COPIES } from "../config.js";

// Prüft eine Sync-Anfrage: { since, changes: [{ type, id, data, updated, deleted }] }.
// Pro Datenart eine Regel; eine neue Art braucht hier eine Zeile.

const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
const optStr = (v, max) => v == null || str(v, max);
const int = (v) => Number.isSafeInteger(v);
const optAmount = (v) => v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e7);
const optPosition = (v) => v == null || (typeof v === "number" && Number.isFinite(v));
const optBool = (v) => v == null || typeof v === "boolean";
// Exemplare: null (alle gleich) oder genau qty Stück (2–100), jedes nur { cond, lang, paid }
const COPY_KEYS = ["cond", "lang", "paid"];
const optCopies = (v, qty) =>
  v == null ||
  (Array.isArray(v) && v.length >= 2 && v.length <= MAX_COPIES && v.length === qty &&
    v.every((c) => c != null && typeof c === "object" && Object.keys(c).every((k) => COPY_KEYS.includes(k)) && optStr(c.cond, 40) && optStr(c.lang, 40) && optAmount(c.paid)));
// Bilder nur von TCGdex: die anderen sehen deine Karten beim Tauschen – eine fremde Adresse (z. B. ein Zählpixel)
// bekämen sonst auch sie in ihre App geschickt. Die App setzt nie etwas anderes (domain/card.js, toCard).
const TCGDEX_IMAGES = "https://assets.tcgdex.net/";

const isCard = (c) =>
  c != null &&
  str(c.id, 100) &&
  str(c.name, 200) &&
  str(c.num, 20) &&
  str(c.set, 60) &&
  str(c.setName, 200) &&
  (c.total == null || int(c.total)) &&
  (c.img == null || (str(c.img, 300) && c.img.startsWith(TCGDEX_IMAGES)));

const DATA_RULES = {
  collection: (d, id) =>
    int(d.qty) &&
    d.qty >= 0 &&
    d.qty <= 9999 &&
    optStr(d.cond, 40) &&
    optStr(d.lang, 40) &&
    optAmount(d.paid) &&
    int(d.added) &&
    optStr(d.section, 100) &&
    optPosition(d.position) &&
    optBool(d.trade) &&
    optCopies(d.copies, d.qty) &&
    isCard(d.card) &&
    d.card.id === id,
  list: (d) => str(d.name, 80) && d.name.trim() !== "" && int(d.created) && optPosition(d.position),
  section: (d) => str(d.name, 80) && d.name.trim() !== "" && int(d.created) && optPosition(d.position),
  listItem: (d, id) => str(d.list, 100) && isCard(d.card) && int(d.added) && optPosition(d.position) && id === `${d.list}:${d.card.id}`,
};

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
  if (bad >= 0) return { ok: false, status: 400, error: `Ungültige Änderung an Position ${bad}`, index: bad };
  // nur die bekannten Felder weiterreichen
  return { ok: true, since, changes: changes.map(({ type, id, data, updated, deleted }) => ({ type, id, data: data ?? null, updated, deleted })) };
}
