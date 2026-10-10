// Cardmarket-Preise für Karten, die TCGdex keinem Cardmarket-Produkt zuordnet (Namen mit ♀/♂/◇/’, „-EX“ …) –
// dort gibt es sonst in keiner Sprache einen Preis. Quelle: Cardmarkets öffentliche Produkt- und Preisliste (täglich neu).
//
//   node scripts/cardmarket.mjs map
//     Zuordnung TCGdex-Karte → Cardmarket-Produkt ergänzen (scripts/cardmarket-map.json). Prüft nur Sets, die noch nicht
//     drinstehen – nach neuen Sets erneut ausführen und committen. Erster Lauf: eine Anfrage pro Karte (~20.000, ~10 min).
//   node scripts/cardmarket.mjs prices <map.json> <out.json>
//     Preise dieser Karten aus der aktuellen Preisliste (läuft täglich im Pages-Workflow, Ergebnis liegt neben der App).
//
// Zuordnung: Set → Cardmarket-Erweiterung über die Karten, die TCGdex schon zuordnet; dann Name + Attacken/Fähigkeiten im
// selben Set. Doppeldrucke (normal + Full Art, gleicher Name und gleiche Attacken) nur in Sets, in denen Cardmarket die
// Produkt-IDs fortlaufend nach Kartennummer vergeben hat (BW-, XY-Zeit: ID = Startwert + Nummer) – dann wird genau dieses
// Produkt genommen. Nur der Name zählt nur, wenn er eindeutig ist. Promo-Sets bleiben draußen (viele Nachdrucke in
// anderen Erweiterungen). Lieber kein Preis als ein falscher.
// Probe an den schon zugeordneten Karten (Stand 10.10.2026): wo TCGdex und wir abweichen, hat fast immer unser Produkt die
// Attacken der Karte und das von TCGdex nicht – TCGdex vertauscht gleichnamige Karten eines Sets.
// CARDMARKET_CACHE=<ordner>: TCGdex-Antworten dort zwischenspeichern (für wiederholte Läufe).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TCGDEX = "https://api.tcgdex.net/v2";
const PRODUCTS = "https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json";
const PRICE_GUIDE = "https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
const MAP_FILE = new URL("./cardmarket-map.json", import.meta.url);
const PARALLEL = 6;

const cacheDir = process.env.CARDMARKET_CACHE;
if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
const getJson = async (url) => {
  const cached = cacheDir && url.startsWith(TCGDEX) && path.join(cacheDir, `${encodeURIComponent(url.slice(TCGDEX.length))}.json`);
  if (cached && fs.existsSync(cached)) return JSON.parse(fs.readFileSync(cached, "utf8"));
  const json = await fetchJson(url);
  if (cached) fs.writeFileSync(cached, JSON.stringify(json));
  return json;
};
const fetchJson = async (url) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
};

// „Nidoran♀ [Poison Sting]“ und Cardmarkets „Nidoran ♀ [Poison Sting]“ / „Nidoran [F] […]“ / „Nidoran &female; […]“ → gleich
const ENTITIES = { "&female;": "♀", "&male;": "♂", "&amp;": "&", "&#039;": "'", "&quot;": '"', "&delta;": "δ" }; // so steht es teils in der Produktliste
const norm = (s) =>
  s
    .replace(/&[#\w]+;/g, (e) => ENTITIES[e] ?? e)
    .toLowerCase()
    .replace(/♀/g, " [f]")
    .replace(/♂/g, " [m]")
    .replace(/[’`´]/g, "'")
    .replace(/-(ex|gx)\b/g, " $1")
    .replace(/◇|\s*\|\s*prism\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
const keyOf = (card) => {
  const moves = [...(card.abilities || []), ...(card.attacks || [])].map((a) => a.name).filter(Boolean);
  return norm(moves.length ? `${card.name} [${moves.join(" | ")}]` : card.name);
};
const numOf = (card) => parseInt(String(card.localId).replace(/^\D+/, ""), 10) || 0;

// Karten (mit TCGdex-Zuordnung = known, ohne = open) ihren Produkten zuordnen → Map(tcgdexId → idProduct).
// explain: stattdessen { product, rule } – welche Regel getroffen hat (für die Probe)
export function matchSet(cards, products, { explain = false } = {}) {
  const known = cards.filter((c) => c.pricing?.cardmarket?.idProduct);
  // Fortlaufende Produkt-IDs? Dann ist ID − Kartennummer bei den meisten zugeordneten Karten gleich
  const offsets = new Map();
  for (const c of known) offsets.set(c.pricing.cardmarket.idProduct - numOf(c), (offsets.get(c.pricing.cardmarket.idProduct - numOf(c)) || 0) + 1);
  const [base, hits] = [...offsets].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const sequential = known.length >= 10 && hits >= known.length * 0.6;
  const used = new Set(known.map((c) => c.pricing.cardmarket.idProduct));
  const pool = products.filter((p) => !used.has(p.idProduct));
  const out = new Map();
  const groups = new Map();
  for (const c of cards.filter((c) => !c.pricing?.cardmarket?.idProduct)) {
    const key = keyOf(c);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  for (const [key, group] of groups) {
    let rule = "name+attacken";
    let candidates = pool.filter((p) => norm(p.name) === key);
    if (!candidates.length) {
      rule = "nur name";
      // Trainer ohne Klammer bzw. andere Schreibweise der Attacken: nur der Name
      const name = norm(group[0].name);
      candidates = pool.filter((p) => norm(p.name) === name || norm(p.name).startsWith(`${name} [`));
    }
    const take = (c, product) => out.set(c.id, explain ? { product, rule } : product);
    if (group.length === 1 && candidates.length === 1) take(group[0], candidates[0].idProduct);
    else if (sequential && rule !== "nur name") {
      // Doppeldruck: das Produkt mit genau Startwert + Nummer, sonst lieber kein Preis
      rule += ", doppeldruck";
      for (const c of group) {
        const exact = candidates.find((p) => p.idProduct === base + numOf(c));
        if (exact) take(c, exact.idProduct);
      }
    }
  }
  return out;
}

async function buildMap() {
  const saved = fs.existsSync(MAP_FILE) ? JSON.parse(fs.readFileSync(MAP_FILE, "utf8")) : { sets: {}, cards: {} };
  const [products, sets, pocket] = await Promise.all([getJson(PRODUCTS), getJson(`${TCGDEX}/en/sets`), getJson(`${TCGDEX}/en/series/tcgp`)]);
  const byExpansion = new Map();
  const productById = new Map();
  for (const p of products.products) {
    productById.set(p.idProduct, p);
    if (!byExpansion.has(p.idExpansion)) byExpansion.set(p.idExpansion, []);
    byExpansion.get(p.idExpansion).push(p);
  }
  const skip = new Set([...(pocket?.sets || []).map((s) => s.id), ...sets.filter((s) => /promo/i.test(s.name)).map((s) => s.id)]);
  const todo = sets.filter((s) => !skip.has(s.id) && !saved.sets[s.id]);
  console.log(`${todo.length} Sets zu prüfen (${Object.keys(saved.sets).length} schon erledigt)`);
  const check = { same: 0, tcgdexOff: 0, wrong: 0 };
  for (const [n, s] of todo.entries()) {
    const set = await getJson(`${TCGDEX}/en/sets/${encodeURIComponent(s.id)}`);
    const ids = (set?.cards || []).map((c) => c.id);
    const cards = [];
    let next = 0;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
      while (next < ids.length) {
        const card = await getJson(`${TCGDEX}/en/cards/${encodeURIComponent(ids[next++])}`);
        if (card) cards.push(card);
      }
    }));
    // Erweiterung = die, in der die schon zugeordneten Karten dieses Sets liegen
    const votes = new Map();
    for (const c of cards) {
      const p = productById.get(c.pricing?.cardmarket?.idProduct);
      if (p) votes.set(p.idExpansion, (votes.get(p.idExpansion) || 0) + 1);
    }
    const expansion = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
    const open = cards.filter((c) => !c.pricing?.cardmarket?.idProduct);
    let mapped = 0;
    if (expansion != null && open.length) {
      const found = matchSet(cards, byExpansion.get(expansion) || []);
      for (const [id, product] of found) saved.cards[id] = product;
      mapped = found.size;
      // Probe: die schon zugeordneten Karten so tun, als fehlten sie – trifft der Abgleich dasselbe Produkt?
      const probe = matchSet(cards.map((c) => ({ ...c, pricing: null })), byExpansion.get(expansion) || []);
      for (const c of cards) {
        const truth = c.pricing?.cardmarket?.idProduct;
        if (!truth || !probe.has(c.id)) continue;
        if (probe.get(c.id) === truth) check.same++;
        else if (norm(productById.get(truth)?.name ?? "") !== keyOf(c)) check.tcgdexOff++; // TCGdex-Produkt hat andere Attacken
        else check.wrong++;
      }
    }
    saved.sets[s.id] = { cards: cards.length, open: open.length, mapped };
    console.log(`[${n + 1}/${todo.length}] ${s.id}: ${cards.length} Karten, ${open.length} ohne Zuordnung, ${mapped} zugeordnet`);
    fs.writeFileSync(MAP_FILE, `${JSON.stringify(saved, null, 0)}\n`); // nach jedem Set – abgebrochen geht es dort weiter
  }
  console.log(`Fertig: ${Object.keys(saved.cards).length} Karten zugeordnet. Probe an bekannten Karten: ${check.same} wie TCGdex, ${check.tcgdexOff} anders als TCGdex, wo dessen Produkt nicht zu den Attacken passt, ${check.wrong} wirklich anders (gleicher Name und gleiche Attacken).`);
}

async function writePrices(mapPath, outPath) {
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8")).cards;
  const guide = await getJson(PRICE_GUIDE);
  const byId = new Map(guide.priceGuides.map((g) => [g.idProduct, g]));
  const first = (...values) => values.find((x) => typeof x === "number" && x > 0) ?? null;
  const prices = {};
  for (const [card, id] of Object.entries(map)) {
    const g = byId.get(id);
    if (g) prices[card] = { id, avg1: first(g.avg1, g["avg1-holo"]), avg7: first(g.avg7, g["avg7-holo"]), avg30: first(g.avg30, g["avg30-holo"]), low: first(g.low, g["low-holo"]) };
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ updated: guide.createdAt, prices }));
  console.log(`${Object.keys(prices).length} Preise → ${outPath} (Preisliste vom ${guide.createdAt})`);
}

// Nur direkt aufgerufen (nicht beim Import im Test)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "map") await buildMap();
  else if (command === "prices" && args.length === 2) await writePrices(...args);
  else {
    console.error("Aufruf: node scripts/cardmarket.mjs map | prices <map.json> <out.json>");
    process.exit(1);
  }
}
