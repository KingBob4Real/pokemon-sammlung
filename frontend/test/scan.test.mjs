// Test des Karten-Scanners (Zuordnung, Kamera-Ausschnitt): node frontend/test/scan.test.mjs
import assert from "node:assert/strict";
import { AutoShutter, centerRect, coverCrop, gridCells } from "../js/core/image.js";
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

// Nummer falsch gelesen (Pokédex-Nummer 34 statt 11), Name und Setgröße stimmen → trotzdem die richtige Karte
const nidoking = card("base1-11", "Nidoking", "11", "base1", 102);
const farfetchd = card("base1-27", "Porenta", "27", "base1", 102);
const modern = card("sv03.5-034", "Nidoking", "034", "sv03.5", 165);
r = rankMatches([farfetchd, modern, nidoking], rec({ name: "Nidoking", number: "34", total: "102" }));
assert.equal(r.cards[0], nidoking, "Name + Setgröße schlagen eine falsche Nummer");
assert.equal(rankMatches([card("x-1", "Glurak-ex", "1", "x", 9)], rec({ name: "Glurak ex", number: "1", total: "9" })).sure, true, "„Glurak ex“ = „Glurak-ex“");

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

// Seiten-Scan: 3 × 3-Raster über die Seite, Fach für Fach von oben links, mit Rand, aber nie aus dem Bild
const page = { x: 100, y: 200, width: 900, height: 1200 };
const cells = gridCells(page, 3, 3, 0, { width: 2000, height: 2000 });
assert.equal(cells.length, 9);
assert.deepEqual(cells[0], { x: 100, y: 200, width: 300, height: 400 }, "erstes Fach oben links");
assert.deepEqual(cells[5], { x: 700, y: 600, width: 300, height: 400 }, "Zeile 2, Spalte 3");
const round = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Math.round(v)]));
const edged = gridCells({ x: 0, y: 0, width: 300, height: 400 }, 3, 4, 0.1, { width: 300, height: 400 });
assert.equal(edged.length, 12, "3 Spalten × 4 Zeilen");
assert.deepEqual(round(edged[0]), { x: 0, y: 0, width: 110, height: 110 }, "Rand oben links abgeschnitten");
assert.deepEqual(round(edged[4]), { x: 90, y: 90, width: 120, height: 120 }, "Rand innen rundum");
// Foto aus der Mediathek: Seite (3 × 3 Karten) mittig aus einem 4:3-Hochkantfoto
assert.deepEqual(centerRect(3024, 4032, 2), { x: 0, y: 1260, width: 3024, height: 1512 }, "breiter als das Foto → volle Breite");
assert.deepEqual(centerRect(4000, 1000, 1), { x: 1500, y: 0, width: 1000, height: 1000 }, "höher als das Foto → volle Höhe");

// Serien-Scan: erst auslösen, wenn das Bild ~0,7 s ruhig ist, nicht leer, und anders als beim letzten Foto
const img = (seed) => Uint8Array.from({ length: 24 * 32 }, (_, i) => ((Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1 + 1) * 100 + 20); // Zufallsmuster
const wobble = (g, d) => g.map((v, i) => v + (i % 2 ? d : -d));
const shutter = new AutoShutter();
const card1 = img(1);
const fired = (frames) => frames.map(([g, t]) => shutter.push(g, t));
assert.deepEqual(fired([[card1, 0], [wobble(card1, 5), 300], [card1, 600]]), [false, false, false], "noch keine 0,7 s ruhig");
assert.equal(shutter.push(card1, 900), true, "0,9 s ruhig → auslösen");
assert.deepEqual(fired([[card1, 1200], [card1, 1500], [card1, 3000]]), [false, false, false], "dieselbe Karte nicht nochmal");
const card2 = img(7);
assert.deepEqual(fired([[card2, 3300], [card2, 3600], [card2, 3900], [card2, 4200]]), [false, false, false, true], "neue Karte, ruhig → auslösen");
const flat = new Uint8Array(24 * 32).fill(90);
assert.deepEqual(fired([[flat, 4500], [flat, 4800], [flat, 5100], [flat, 5400]]), [false, false, false, false], "leerer Tisch löst nicht aus");
const tapped = new AutoShutter();
tapped.shot(card1); // per Antippen fotografiert
assert.deepEqual([card1, card1, card1, card1].map((g, i) => tapped.push(g, i * 300)), [false, false, false, false], "nach Antippen nicht gleich nochmal automatisch");

console.log("Scanner ok");
