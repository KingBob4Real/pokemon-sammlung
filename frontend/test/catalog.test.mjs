// Test des Katalogs (Sets und Suche auf Deutsch + Englisch, englische Ersatzbilder): node frontend/test/catalog.test.mjs
import assert from "node:assert/strict";
import { withEnglishImage } from "../js/domain/card.js";
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

// Gespeicherte Karte ohne Bild nachträglich reparieren
assert.equal(withEnglishImage({ ...evoli, img: null }, "sv").img, evoli.img);
assert.equal(withEnglishImage(evoli, "sv"), null, "Bild da → nichts zu tun");

console.log("Katalog ok");
