// Test des Karten-Scanners (Zuordnung, Kamera-Ausschnitt): node frontend/test/scan.test.mjs
import assert from "node:assert/strict";
import { coverCrop } from "../js/core/image.js";
import { rankMatches, scanQueries } from "../js/domain/scanMatch.js";

const card = (id, name, num, set, total) => ({ id, name, num, set, setName: set, total, img: null });
const rec = (r) => ({ name: null, number: null, total: null, setCode: null, language: "de", confidence: 0.9, ...r });

// Suchanfragen
assert.deepEqual(scanQueries(rec({ name: "Glurak-ex", number: "199", total: "165" })), ["Glurak-ex 199/165", "199/165", "Glurak-ex"]);
assert.deepEqual(scanQueries(rec({ name: "Simsala-ex", number: "050" })), ["Simsala-ex 50", "50", "Simsala-ex"], "Promo ohne Setgröße, führende Null weg");
assert.deepEqual(scanQueries(rec({ name: "Glurak", number: "TG05" })), ["Glurak"], "Nummer mit Buchstaben → nur Name");
assert.deepEqual(scanQueries(rec({})), [], "nichts gelesen → keine Suche");

// Ranking: Nummer + Set-Kürzel entscheiden
const glurak = card("sv03.5-199", "Glurak-ex", "199", "sv03.5", 165);
const other = card("sv04-199", "Glurak-ex", "199", "sv04", 182);
let r = rankMatches([other, glurak], rec({ name: "Glurak-ex", number: "199", total: "165", setCode: "MEW" }), (id) => ({ "sv03.5": "MEW", sv04: "PAR" })[id]);
assert.equal(r.cards[0], glurak, "passende Setgröße und Kürzel gewinnen");
assert.equal(r.sure, true, "eindeutig → direkt bestätigen");

// Promo: Kürzel SVP statt Setgröße
const promo = card("svp-050", "Simsala-ex", "050", "svp", null);
const sim = card("sv03.5-065", "Simsala-ex", "065", "sv03.5", 165);
r = rankMatches([sim, promo], rec({ name: "Simsala-ex", number: "050", setCode: "SVP" }), (id) => (id === "svp" ? "SVP" : "MEW"));
assert.deepEqual([r.cards[0], r.sure], [promo, true], "Promo über Nummer + Kürzel");

// Gleichstand (Nummer + Setgröße in zwei Sets) → Auswahl statt raten
const base = card("base1-4", "Glurak", "4", "base1", 102);
const hgss = card("hgss4-4", "Gallopa", "4", "hgss4", 102);
r = rankMatches([hgss, base], rec({ name: "Charizard", number: "4", total: "102" }));
assert.equal(r.sure, false, "zwei gleich gute Treffer → Auswahl");
assert.equal(r.cards.length, 2);

// Unsicher erkannt → nie direkt bestätigen
r = rankMatches([glurak], rec({ name: "Glurak-ex", number: "199", total: "165", confidence: 0.3 }));
assert.equal(r.sure, false, "confidence < 0,5 → Auswahl");

// Kamera: Hochkant-Video 1080×1920 füllt ein 375×812-Display (links/rechts abgeschnitten), Rahmen in der Mitte
const view = { left: 0, top: 0, width: 375, height: 812 };
const frame = { left: 41.5, top: 202, width: 292, height: 408 };
const crop = coverCrop(view, frame, { width: 1080, height: 1920 });
const near = (a, b) => Math.abs(a - b) < 1;
assert.ok(near(crop.x + crop.width / 2, 540) && near(crop.y + crop.height / 2, 960), "Rahmen in der Mitte → Mitte des Videos");
assert.ok(near(crop.width, 292 / (812 / 1920)), "Größe umgerechnet in Video-Pixel");
const edge = coverCrop(view, { ...frame, left: -100, top: -100 }, { width: 1080, height: 1920 }, 0.1);
assert.ok(edge.x === 0 && edge.y === 0, "Ausschnitt bleibt im Video");

console.log("Scanner ok");
