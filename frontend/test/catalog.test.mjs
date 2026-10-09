// Test des Katalogs (Sets und Suche auf Deutsch + Englisch, englische Ersatzbilder): node frontend/test/catalog.test.mjs
import assert from "node:assert/strict";
import { imageSources, nextImage, withEnglishImage } from "../js/domain/card.js";
import { CatalogService } from "../js/services/catalogService.js";
import { mergeSets, SetService } from "../js/services/setService.js";

const set = (id, name, official) => ({ id, name, cardCount: { total: official, official } });
const en = [set("base1", "Base Set", 102), set("gym1", "Gym Heroes", 132), set("swsh7", "Evolving Skies", 203), set("A1", "Genetic Apex", 226), set("svp", "SVP Black Star Promos", 0)];
const de = [set("base1", "Grundset", 102), set("swsh7", "Drachenwandel", 203), set("svp", "SVP Black Star Promos", 0)];
const serieOf = { base1: "base", gym1: "gym", swsh7: "swsh", A1: "tcgp", svp: "sv" };

const { list, pocket } = mergeSets(en, de, serieOf, "tcgp");
assert.deepEqual(pocket, ["A1"], "TCG Pocket fällt raus");
assert.deepEqual(list.map((s) => s.name), ["Grundset", "Gym Heroes", "Drachenwandel", "SVP Black Star Promos"], "deutsche Namen, Reihenfolge der englischen Liste");
assert.deepEqual([list[1].en, list[0].en, list[0].alt], [true, false, "Base Set"], "nur-englische Sets markiert, englischer Name als Zweitname");
assert.equal(list[3].serie, "sv", "Promos kennen ihre Serie");

// Set-Suche (deutsch und englisch) und Suche in beiden Sprachen
const fixtures = {
  de: { Glurak: [{ id: "base1-4", localId: "4", name: "Glurak" }], Evoli: [{ id: "svp-174", localId: "174", name: "Evoli-ex" }] },
  en: { Charizard: [{ id: "base1-4", localId: "4", name: "Charizard", image: "https://assets.tcgdex.net/en/base/base1/4" }, { id: "gym1-2", localId: "2", name: "Blaine's Charizard", image: "https://assets.tcgdex.net/en/gym/gym1/2" }] },
};
const tcgdex = {
  sets: async (lang) => (lang === "en" ? en : de),
  setSeries: async () => serieOf,
  searchByName: async (name, lang) => fixtures[lang][name] || [],
  setsByCode: async (code) => (code === "BS" ? [{ id: "base1" }] : []),
  set: async (id) => ({ id, name: "Grundset", cardCount: { official: 102 }, serie: { id: "base" }, cards: [{ id: "base1-10", localId: "10", name: "Mewtu" }, { id: "base1-11", localId: "11", name: "Nidoking" }] }),
};
const sets = new SetService(tcgdex, { get: () => null, set: () => true }, "k", 1000, "tcgp");
await sets.ready;
assert.deepEqual(sets.search("drachen").map((s) => s.id), ["swsh7"], "deutscher Set-Name");
assert.deepEqual(sets.search("evolving skies").map((s) => s.id), ["swsh7"], "englischer Set-Name");

const catalog = new CatalogService(tcgdex, sets);
const charizard = await catalog.search("Charizard");
assert.deepEqual(charizard.map((c) => c.id), ["gym1-2", "base1-4"], "englischer Name findet auch nur-englische Sets");
assert.equal(charizard[0].setName, "Gym Heroes");
const evoli = (await catalog.search("Evoli"))[0];
assert.equal(evoli.img, "https://assets.tcgdex.net/en/sv/svp/174", "kein deutsches Bild → englisches");

// Set-Kürzel + Nummer: „BS 11“, „bs 011“ → genau diese Karte
for (const q of ["BS 11", "bs 011"]) {
  const [nido] = await catalog.search(q);
  assert.deepEqual([nido.id, nido.name, nido.total, nido.setName], ["base1-11", "Nidoking", 102, "Grundset"], `Kürzel-Suche „${q}“`);
}
assert.deepEqual(await catalog.search("XYZ 11"), [], "unbekanntes Kürzel → nichts");

// Karten, die TCGdex nur auf Englisch hat (MEP 091), und Nachdrucke der Klassischen Sammlung (Nummer des Originals)
{
  const set = (id, name, official, serie) => ({ id, name, cardCount: { total: official, official } , serie: { id: serie } });
  const enSets = [set("base1", "Base Set", 102, "base"), set("dp4", "Great Encounters", 106, "dp"), set("30th", "30th Celebration", 128, "me"), set("30th-c", "30th Classic Collection", 30, "me"), set("mep", "MEP Black Star Promos", 0, "me")];
  const deSets = [set("base1", "Grundset", 102, "base"), set("30th", "30 Jahre", 128, "me"), set("30th-c", "30 Jahre: Klassische Sammlung", 30, "me"), set("mep", "MEP Black Star Promos", 0, "me")];
  const c = (id, name) => ({ id, localId: id.slice(id.lastIndexOf("-") + 1), name });
  const setData = {
    de: {
      mep: [c("mep-090", "Wingull")], // 091 fehlt auf Deutsch
      "30th-c": [c("30th-c-001", "Glurak"), c("30th-c-022", "Palkia")],
      "30th": [c("30th-020", "Palkia"), c("30th-106", "Endivie")],
    },
    en: {
      mep: [c("mep-090", "Wingull"), c("mep-091", "Mega Dragonite ex"), c("mep-097", "Articuno")],
      "30th-c": [c("30th-c-001", "Charizard"), c("30th-c-022", "Palkia")],
      "30th": [c("30th-020", "Palkia"), c("30th-106", "Chikorita")],
    },
  };
  const byName = {
    de: { Dragoran: [c("sv03.5-149", "Dragoran"), c("sv03.5-201", "Dragoran-ex")], Palkia: [c("30th-c-022", "Palkia"), c("30th-020", "Palkia")] },
    en: { "Palkia LV.X": [c("dp4-106", "Palkia LV.X")] },
  };
  const dex = { de: { 149: [c("sv03.5-149", "Dragoran"), c("sv03.5-201", "Dragoran-ex")], 144: [c("base1-2", "Arktos")] }, en: { 149: [c("sv03.5-149", "Dragonite"), c("mep-091", "Mega Dragonite ex")], 144: [c("mep-097", "Articuno")] } };
  const dexOf = { "sv03.5-149": [149], "mep-091": [149], "mep-097": [144] };
  const calls = [];
  const api = {
    sets: async (lang) => (lang === "en" ? enSets : deSets),
    setSeries: async () => ({ base1: "base", dp4: "dp", "30th": "me", "30th-c": "me", mep: "me" }),
    searchByName: async (name, lang) => byName[lang][name] || [],
    searchByNumber: async (n, lang) => (lang === "en" ? [c("dp4-106", "Palkia LV.X"), c("30th-106", "Chikorita")] : []).filter((x) => x.localId.includes(n)),
    searchByDex: async (d, lang) => (calls.push(`dex ${lang} ${d}`), dex[lang][d] || []),
    setsByCode: async (code) => ({ MEP: [{ id: "mep" }], "30C": [{ id: "30th-c" }, { id: "30th" }] })[code] || [],
    set: async (id, lang) => {
      const data = setData[lang ?? "de"][id];
      if (!data) throw Object.assign(new Error("404"), { status: 404 });
      const info = (lang === "en" ? enSets : deSets).find((s) => s.id === id);
      return { ...info, abbreviation: { official: { mep: "MEP", "30th-c": "30C", "30th": "30C" }[id] }, cards: data };
    },
    card: async (id, lang) => (calls.push(`card ${lang} ${id}`), { id, dexId: dexOf[id] }),
  };
  const sets = new SetService(api, { get: () => null, set: () => true }, "k", 1000, "tcgp");
  await sets.ready;
  const catalog = new CatalogService(api, sets);

  const dragoran = await catalog.search("Dragoran");
  const mega = dragoran.find((x) => x.id === "mep-091");
  assert.equal(mega?.name, "Mega-Dragoran-ex", "„Dragoran“ findet die nur-englische MEP 091 – mit deutschem Namen");
  assert.ok(dragoran.some((x) => x.id === "sv03.5-149" && x.name === "Dragoran"), "deutsche Karten bleiben deutsch");
  const [mep91, ...restMep] = await catalog.search("MEP 91");
  assert.deepEqual([mep91.id, mep91.name, mep91.setName, restMep.length], ["mep-091", "Mega-Dragoran-ex", "MEP Black Star Promos", 0], "„MEP 91“: genau die Karte, auch wenn TCGdex sie nur auf Englisch hat");
  assert.deepEqual((await catalog.search("MEP 97")).map((x) => x.name), ["Arktos"], "Arktos (MEP 097) mit deutschem Namen");
  for (const q of ["CC12", "30C CC12", "cc12"]) assert.deepEqual((await catalog.search(q)).map((x) => x.id), ["30th-c-022"], `„${q}“ → genau Palkia der Klassischen Sammlung`);
  const [palkia] = await catalog.search("30C 106/106");
  assert.deepEqual([palkia.id, (await catalog.search("30C 106/106")).length], ["30th-c-022", 1], "„30C 106/106“: Nummer des Originals, nicht 30th-106 (128er-Set)");
  assert.ok((await catalog.search("106/106")).some((x) => x.id === "30th-c-022"), "Nummer des Originals findet den Nachdruck");
  assert.ok((await catalog.search("Glurak 4/102")).some((x) => x.id === "30th-c-001"), "Name + Nummer des Originals");

  // Scanner mit Katalog: direkt die richtige Karte
  const { ScanService } = await import("../js/services/scanService.js");
  const scanner = new ScanService(null, { enabled: true }, catalog, sets, null);
  const scan = (r) => scanner.match({ name: null, number: null, total: null, setCode: null, language: "de", confidence: 0.95, ...r });
  let m = await scan({ name: "Mega-Dragoran-ex", number: "091", setCode: "MEP" });
  assert.deepEqual([m.cards[0].id, m.sure], ["mep-091", true], "Scan Mega-Dragoran-ex MEP 091 → direkt");
  m = await scan({ name: "Mega Dragonite ex", number: "091", setCode: "MEP", language: "en" });
  assert.deepEqual([m.cards[0].id, m.sure], ["mep-091", true], "englische Karte gescannt → dieselbe");
  m = await scan({ name: "Palkia LV.X", number: "106", total: "106", stamp: 30, language: "en" });
  assert.deepEqual([m.cards[0].id, m.sure], ["30th-c-022", true], "Scan Palkia (Klassische Sammlung, 30-Logo) → 30th-c-022");
  m = await scan({ name: "Palkia LV.X", number: "106", total: "106", language: "en" });
  assert.deepEqual([m.cards.slice(0, 2).map((x) => x.id).sort(), m.sure], [["30th-c-022", "dp4-106"], false], "ohne Logo: Auswahl Nachdruck/Original");
}

// Gespeicherte Karte ohne Bild nachträglich reparieren
assert.equal(withEnglishImage({ ...evoli, img: null }, "sv").img, evoli.img);
assert.equal(withEnglishImage(evoli, "sv"), null, "Bild da → nichts zu tun");

// Bildquellen der Reihe nach, egal ob die Kachel deutsch oder englisch startet: TCGdex de → en → Limitless → TCGplayer → pokemontcg.io
const proxy = "https://b/img";
const mep = "https://assets.tcgdex.net/en/me/mep/033/low.webp"; // API meldet kein Bild, die deutsche Datei gibt es aber
assert.deepEqual(imageSources(mep, proxy), [
  "https://assets.tcgdex.net/de/me/mep/033/low.webp",
  mep,
  "https://b/img?set=MEP&n=033&size=SM", // Limitless: dreistellig
  "https://b/img?card=mep-033&size=SM", // TCGplayer über die TCGdex-ID
  "https://images.pokemontcg.io/mep/33.png", // pokemontcg.io: ohne führende Null, zuletzt (sonst Kartenrückseite)
]);
const walk = (first, p = proxy) => {
  const tried = [first];
  for (let next; (next = nextImage(first, tried, p)); ) tried.push(next);
  return tried;
};
assert.deepEqual(walk(mep).slice(0, 2), ["https://assets.tcgdex.net/en/me/mep/033/low.webp", "https://assets.tcgdex.net/de/me/mep/033/low.webp"], "startet englisch → deutsch wird auch probiert");
assert.equal(walk(mep).length, 5, "jede Quelle genau einmal, dann Platzhalter");
assert.deepEqual(walk("https://assets.tcgdex.net/de/sm/sm7.5/1/low.webp"), [
  "https://assets.tcgdex.net/de/sm/sm7.5/1/low.webp",
  "https://assets.tcgdex.net/en/sm/sm7.5/1/low.webp",
  "https://b/img?card=sm7.5-1&size=SM",
  "https://images.pokemontcg.io/sm75/1.png",
], "Set ohne Limitless: deutsch → englisch → TCGplayer → pokemontcg.io (mit dessen Set-Namen)");
assert.equal(imageSources("https://assets.tcgdex.net/en/swsh/swsh9tg/TG01/high.webp", proxy).at(-1), "https://images.pokemontcg.io/swsh9tg/TG01_hires.png", "groß, Nummer mit Buchstaben");
assert.equal(imageSources("https://assets.tcgdex.net/en/sv/svp/175/high.webp", proxy)[2], "https://b/img?set=SVP&n=175&size=LG");
assert.equal(imageSources("https://assets.tcgdex.net/en/sv/svp/175/low.webp").length, 3, "ohne Durchreicher kein Limitless und kein TCGplayer");
assert.equal(imageSources("https://assets.tcgdex.net/en/mcd/2011bw/1/low.webp").at(-1), "https://images.pokemontcg.io/mcd11/1.png", "McDonald's heißt dort mcd11");
assert.equal(imageSources("https://assets.tcgdex.net/en/ecard/ecard2/H01/low.webp").at(-1), "https://images.pokemontcg.io/ecard2/H1.png", "e-Card-Holo „H01“ → „H1“");
assert.equal(imageSources("https://assets.tcgdex.net/en/sv/sve/017/low.webp", proxy)[2], "https://b/img?set=SVE&n=017&size=SM", "Energien bei Limitless");
assert.equal(imageSources("https://assets.tcgdex.net/en/me/30th-c/014/low.webp", proxy)[2], "https://b/img?set=30C&n=CC1&size=SM", "Klassische Sammlung: TCGdex 014 Pikachu = Limitless CC1");
assert.equal(imageSources("https://assets.tcgdex.net/en/me/30th-c/001/high.webp", proxy)[2], "https://b/img?set=30C&n=CC2&size=LG", "TCGdex 001 Glurak = Limitless CC2");

assert.equal(imageSources("https://assets.tcgdex.net/en/me/30th/B/high.webp", proxy)[2], "https://b/img?set=30C&n=B&size=LG", "30 Jahre: Mew B/G/R bei Limitless");
assert.equal(imageSources("https://assets.tcgdex.net/en/swsh/cel25cc/CC001/low.webp", proxy)[2], "https://b/img?set=CEL&n=CC1&size=SM", "Celebrations Klassische Kollektion: CC001 = Limitless CEL CC1");
assert.equal(imageSources("https://assets.tcgdex.net/en/mc/2014xy/1/high.webp", proxy)[2], "https://b/img?card=2014xy-1&size=LG", "McDonald's 2014: TCGplayer, groß");
assert.equal(imageSources("https://assets.tcgdex.net/en/me/mep/Museum/low.webp", proxy)[2], "https://b/img?card=mep-Museum&size=SM", "keine Limitless-Nummer → gleich TCGplayer");
assert.equal(imageSources("https://assets.tcgdex.net/en/ex/exu/%3F/low.webp", proxy)[2], "https://b/img?card=exu-%253F&size=SM", "Icognito „?“: ID bleibt heil");

console.log("Katalog ok");
