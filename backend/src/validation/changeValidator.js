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

// Karte prüfen → null (in Ordnung) oder das Feld, das nicht stimmt – fürs Protokoll, z. B. „card.img“
const CARD_RULES = {
  id: (c) => str(c.id, 100),
  name: (c) => str(c.name, 200),
  num: (c) => str(c.num, 20),
  set: (c) => str(c.set, 60),
  setName: (c) => str(c.setName, 200),
  total: (c) => c.total == null || int(c.total),
  img: (c) => c.img == null || (str(c.img, 300) && c.img.startsWith(TCGDEX_IMAGES)),
};
const cardProblem = (c) => (c == null || typeof c !== "object" ? "card" : (Object.keys(CARD_RULES).find((f) => !CARD_RULES[f](c)) ?? null));
const cardField = (d, id) => {
  const problem = cardProblem(d.card);
  return problem ? (problem === "card" ? problem : `card.${problem}`) : null;
};

// Pro Datenart die Felder in Prüf-Reihenfolge: (data, id) → true (in Ordnung) bzw. Grund-Text/false
const DATA_RULES = {
  collection: {
    qty: (d) => int(d.qty) && d.qty >= 0 && d.qty <= 9999,
    cond: (d) => optStr(d.cond, 40),
    lang: (d) => optStr(d.lang, 40),
    paid: (d) => optAmount(d.paid),
    added: (d) => int(d.added),
    section: (d) => optStr(d.section, 100),
    position: (d) => optPosition(d.position),
    trade: (d) => optBool(d.trade),
    copies: (d) => optCopies(d.copies, d.qty),
    card: (d, id) => cardField(d, id) ?? (d.card.id === id || "card.id passt nicht zur id"),
  },
  list: {
    name: (d) => str(d.name, 80) && d.name.trim() !== "",
    created: (d) => int(d.created),
    position: (d) => optPosition(d.position),
  },
  section: {
    name: (d) => str(d.name, 80) && d.name.trim() !== "",
    created: (d) => int(d.created),
    position: (d) => optPosition(d.position),
  },
  listItem: {
    list: (d) => str(d.list, 100),
    card: (d, id) => cardField(d, id) ?? true,
    added: (d) => int(d.added),
    position: (d) => optPosition(d.position),
    id: (d, id) => id === `${d.list}:${d.card.id}`,
  },
};

// → null (in Ordnung) oder der Grund, z. B. „collection.copies“ oder „listItem.card.img“
export function changeProblem(c) {
  if (c == null || typeof c !== "object") return "kein Objekt";
  const rules = DATA_RULES[c.type];
  if (!rules) return "type";
  if (!str(c.id, 300)) return "id";
  if (!int(c.updated)) return "updated";
  if (c.deleted !== 0 && c.deleted !== 1) return "deleted";
  if (c.type === "listItem" && !c.id.includes(":")) return "id";
  if (c.deleted === 1) return c.data == null ? null : "data (gelöscht, aber mit Daten)";
  if (c.data == null || typeof c.data !== "object") return "data";
  for (const [field, rule] of Object.entries(rules)) {
    const result = rule(c.data, c.id);
    if (typeof result === "string") return `${c.type}.${result}`;
    if (!result) return `${c.type}.${field}`;
  }
  return null;
}

export function parseSyncRequest(body) {
  const since = Number.isSafeInteger(body?.since) && body.since >= 0 ? body.since : 0;
  const changes = Array.isArray(body?.changes) ? body.changes : [];
  if (changes.length > MAX_CHANGES_PER_REQUEST) return { ok: false, status: 413, error: `Höchstens ${MAX_CHANGES_PER_REQUEST} Änderungen pro Anfrage` };
  for (let index = 0; index < changes.length; index++) {
    const reason = changeProblem(changes[index]);
    if (reason) return { ok: false, status: 400, error: `Ungültige Änderung an Position ${index} (${reason})`, index, reason };
  }
  // nur die bekannten Felder weiterreichen
  return { ok: true, since, changes: changes.map(({ type, id, data, updated, deleted }) => ({ type, id, data: data ?? null, updated, deleted })) };
}
