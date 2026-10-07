# Prompt: Karten-Scanner für die Pokémon-Sammlung

> **So benutzt du diesen Prompt:** Alles ab „## Auftrag“ in eine neue Sitzung mit einer Coding-KI (z. B. Claude Code im Ordner `pokemon-sammlung`) kopieren. Die KI soll vor dem Bauen die genannten Dateien lesen und offene Punkte kurz bestätigen lassen.

---

## Auftrag

Baue in meine App **Pokémon-Sammlung** (Ordner `pokemon-sammlung`, Frontend auf GitHub Pages, Backend als Cloudflare Worker mit D1) einen **Karten-Scanner**: Ich fotografiere mit dem iPhone eine Pokémon-Karte, die App erkennt sie, zeigt sie mit **Cardmarket-Preis** an, und mit einem Tipp landet sie in meiner **Sammlung**. Alles muss **fürs Handy optimiert** sein (iPhone, auch als App vom Home-Bildschirm), auf **Deutsch** und **kostenlos** bleiben.

### 1. Erst lesen, dann bauen

Lies zuerst diese Dateien, damit du Aufbau und Stil übernimmst:

- `README.md` – Funktionen, Aufbau, Datenbank, Personen & Schlüssel, Deployment
- `frontend/js/main.js` – Composition Root (hier werden alle Teile verbunden)
- `frontend/js/ui/app.js` – App-Hülle, Router-Anbindung, `ctx` mit `notify`, `notifyError`, `openCard`, `afterChange`
- `frontend/js/ui/views/addView.js`, `frontend/js/ui/components/searchPanel.js`, `cardSheet.js`, `cardTile.js`
- `frontend/js/services/catalogService.js` (`search`, `parseQuery`), `collectionService.js` (`setQuantity`, `update`), `priceService.js` (`get`, `value`, `request`)
- `frontend/js/core/errors.js` (`describeError`), `frontend/js/core/http.js` (`fetchJson`)
- `backend/src/index.js`, `backend/src/http/*`, `backend/src/controllers/syncController.js`, `backend/src/services/syncService.js`, `backend/src/validation/changeValidator.js`, `backend/wrangler.toml`, `backend/test/smoke.mjs`

### 2. Regeln (bitte einhalten)

- **Aufbau nach SOLID wie im Projekt:** Backend `http/ → controllers/ → services/ → repositories/`, Validierung in `validation/`. Frontend `core/`, `data/` (API-Clients), `domain/` (reine Logik), `services/`, `ui/views` + `ui/components`. Verbunden wird nur in `main.js` bzw. `backend/src/index.js`.
- **Kein Build-Schritt, keine neuen Abhängigkeiten im Frontend** (ES-Module, natives HTML/CSS/JS). Im Backend nur Bordmittel von Cloudflare.
- **Kostenlos:** Cloudflare Workers AI im Gratis-Tarif (10.000 Neurons/Tag). Ein Tageslimit pro Person einbauen, damit das nie überschritten wird.
- **Fehler nutzerfreundlich:** keine `alert()`, Meldungen über `ctx.notify` / `ctx.notifyError` und `describeError`. Nichts darf hängen bleiben – jeder Fehler hat einen Ausweg (Nochmal, manuell suchen, abbrechen).
- **Handy zuerst:** große Tipp-Flächen (≥ 44 px), Daumen-Reichweite unten, Safe-Area beachten, `font-size: 16px` in Eingabefeldern (kein iOS-Zoom), Animationen dezent und aus bei „Bewegung reduzieren“.
- **Daten sauber:** Karten werden wie überall als `{ id, name, num, set, setName, total, img }` gespeichert (siehe `domain/card.js`, `toCard`). Keine Fotos speichern.
- Kommentare und Texte auf Deutsch, Stil wie im restlichen Code. Nach Änderungen `?v=` in `frontend/index.html` hochzählen.

### 3. Ablauf für den Nutzer

1. In **Sammlung** (und in „+ Karten hinzufügen“) gibt es einen Knopf **„📷 Scannen“**.
2. Kamera öffnet sich (Rückkamera). Hinweis: „Karte gerade, gut beleuchtet, ganze Karte im Bild.“
3. Nach dem Foto: Ladebalken „Karte wird erkannt …“ (bestehende `progressBar` nutzen).
4. **Treffer:** Bestätigungs-Ansicht (wie `cardSheet`): Bild, Name, Nummer/Set, Seltenheit, **Cardmarket-Trend, ab, Ø 30 Tage**, Link „Auf Cardmarket ansehen (Deutsch, ab Excellent)“. Darunter: Anzahl (Stepper, Start 1), Zustand (Start „Near Mint“), Sprache (Start „Deutsch“), Kaufpreis (Feld leer, Knopf „Trend übernehmen“), optional Listen zum Anhaken. Großer Knopf **„In Sammlung“**.
5. **Mehrere mögliche Treffer** (z. B. gleiche Nummer in mehreren Sets): bis zu 6 Kacheln zur Auswahl, sortiert nach Wahrscheinlichkeit.
6. **Nichts erkannt:** „Karte nicht erkannt“ + Suchfeld, vorausgefüllt mit dem, was gelesen wurde (z. B. Name), + „Nochmal scannen“.
7. Nach „In Sammlung“: kurzer Erfolgs-Hinweis „Glurak-ex 199/165 hinzugefügt“ und direkt **„Nächste Karte scannen“** – damit man viele Karten schnell hintereinander erfassen kann. Ist die Karte schon in der Sammlung: Anzahl +1 anbieten statt doppelt anlegen.

### 4. Technik

#### Kamera (Frontend)
- Erste Version mit `<input type="file" accept="image/*" capture="environment">` – funktioniert zuverlässig in Safari und in der Home-Bildschirm-App, ohne Kamera-Berechtigungsdialog-Probleme. (Live-Vorschau mit `getUserMedia` und Rahmen ist eine spätere Ausbaustufe.)
- Bild im Browser verkleinern: Canvas, längste Seite **1024 px**, JPEG-Qualität **0,8** (Ziel < 300 KB). EXIF-Drehung beachten (`createImageBitmap(file, { imageOrientation: "from-image" })`).
- Neuer API-Client in `frontend/js/data/scanApi.js`: `POST {backend}/scan` mit `Authorization: Bearer <Schlüssel>` (wie `syncApi.js`), Body `{ image: "data:image/jpeg;base64,…" }`, Zeitlimit 30 s.

#### Erkennen (Backend)
- `backend/wrangler.toml`: `[ai]` mit `binding = "AI"` ergänzen.
- Neue Route `POST /scan` (nur mit gültigem Schlüssel, wie `/sync` über `requireUser`) → `controllers/scanController.js` → `services/scanService.js` → `env.AI.run(...)`.
- Validierung in `validation/scanValidator.js`: nur `data:image/jpeg` oder `image/png`, Base64 max. **1,5 MB**, sonst 413 mit verständlicher Meldung.
- **Modell:** zuerst `@cf/meta/llama-3.2-11b-vision-instruct` probieren; als Alternative `@cf/mistralai/mistral-small-3.1-24b-instruct` (IDs vor dem Einbau in der Cloudflare-Doku prüfen; Llama 3.2 Vision verlangt laut Doku einmalig das Akzeptieren der Lizenz – falls nötig mit einem einmaligen Aufruf `{ prompt: "agree" }`).
- **Tageslimit pro Person** (z. B. 50 Scans/Tag) in D1: neue Migration `backend/migrations/0004_scan_usage.sql` mit Tabelle `scan_usage (user_id, day, count, PRIMARY KEY (user_id, day))`, Repository `scanUsageRepository.js`. Bei Limit: 429 „Tageslimit für Scans erreicht – morgen geht es weiter.“
- Antwort an die App: `{ recognized: { name, number, total, setCode, language, confidence }, raw?: string }` – nur geprüfte Felder weitergeben.

**Prompt für das Bild-Modell** (so oder sehr ähnlich verwenden, Ausgabe streng als JSON parsen und prüfen):

```text
Du siehst das Foto einer Pokémon-Sammelkarte (meist deutsch, manchmal englisch oder japanisch).
Lies nur, was wirklich auf der Karte steht, und antworte ausschließlich mit diesem JSON, ohne weiteren Text:
{
  "name": "Name des Pokémon oder der Trainerkarte genau wie gedruckt, z. B. \"Glurak-ex\" oder \"Mega-Glurak X-ex\"",
  "number": "Kartennummer unten links/rechts VOR dem Schrägstrich, z. B. \"199\" oder \"023\" oder \"TG05\"",
  "total": "Zahl NACH dem Schrägstrich, z. B. \"165\"; null, wenn es keinen Schrägstrich gibt (Promo)",
  "setCode": "Set-Kürzel neben der Nummer, z. B. \"MEW\", \"PAL\", \"SVP\"; null, wenn nicht lesbar",
  "language": "\"de\", \"en\", \"ja\" oder null",
  "confidence": Zahl von 0 bis 1, wie sicher du dir bei Name UND Nummer bist
}
Regeln: Nichts erfinden. Unlesbares als null. Keine Angriffe, KP oder Beschreibungstexte ausgeben.
Bei Spiegelungen/Holo-Effekten trotzdem die Nummer unten genau lesen.
```

#### Zuordnen (Frontend)
- `services/scanService.js` (Frontend) verbindet: Foto verkleinern → `scanApi` → Erkennung prüfen → Kandidaten suchen.
- Kandidaten über den vorhandenen `CatalogService.search`:
  1. `"<name> <number>/<total>"` (nutzt schon `parseQuery`, filtert nach Nummer und offizieller Setgröße),
  2. sonst `"<number>/<total>"`,
  3. sonst `"<name>"`.
  Wenn `setCode` gelesen wurde: Treffer mit passendem Set bevorzugen (TCGdex-Set hat `abbreviation.official`; dafür ggf. `SetService` um das Kürzel erweitern).
- Reine Logik (Ranking, Normalisierung „199“ ↔ „199/165“, Promo ohne `total`) in `domain/scanMatch.js` – mit kleinem Node-Test (`node --input-type=module …` wie bei `parseQuery`).
- Preis: `prices.request([card.id])` und in der Bestätigung anzeigen (wie `cardSheet`). „Trend übernehmen“ setzt den Kaufpreis auf `prices.get(id).trend`.
- Hinzufügen: `collection.setQuantity(card, vorhandeneAnzahl + gewählteAnzahl)` und `collection.update(card.id, { cond, lang, paid })`; danach `ctx.afterChange(false)`.

### 5. Fehlerfälle (alle mit Ausweg)

| Fall | Meldung / Verhalten |
| --- | --- |
| Offline | „Zum Scannen braucht es Internet.“ – Knopf deaktiviert, Hinweis über `describeError` |
| Kamera abgebrochen | nichts tun, keine Meldung |
| Bild zu groß / falsches Format | automatisch verkleinern; wenn trotzdem zu groß: „Foto zu groß – bitte nochmal.“ |
| KI nicht erreichbar / Server-Fehler | „Erkennung gerade nicht möglich.“ + „Nochmal“ + „Manuell suchen“ |
| Tageslimit erreicht (429) | „Tageslimit für Scans erreicht – morgen geht es weiter. Du kannst die Karte so lange über die Suche hinzufügen.“ |
| Nichts / unsicher erkannt (`confidence` < 0,5 oder keine Treffer) | Auswahl bzw. vorausgefüllte Suche + „Nochmal scannen“ |
| Falscher Schlüssel (401) | wie beim Sync: Hinweis mit „Zu ‚Mehr‘“ |

### 6. Tests

- `backend/test/smoke.mjs` um `/scan` erweitern: ohne Schlüssel 401, zu großes Bild 413, ein kleines Testbild (z. B. `backend/test/fixtures/karte.jpg`, eigenes Foto einer Karte) liefert JSON mit `recognized`. Hinweis: Workers AI läuft auch bei `wrangler dev` über Cloudflare (Login nötig).
- Node-Test für `domain/scanMatch.js` (Ranking, Promo, setCode).
- Im Browser in Handygröße (375 × 812, hell und dunkel): kompletter Ablauf, alle Fehlerfälle aus Abschnitt 5 per künstlichem Fehler (z. B. `fetch` kurz überschreiben).
- Checkliste für mich am echten iPhone: Kamera öffnet in Safari **und** als Home-Bildschirm-App, Foto im Hoch- und Querformat, Holo-Karte, Karte in Hülle, Promo ohne Setgröße, englische Karte.

### 7. Abschluss

- `README.md`: Abschnitt „Scannen“ (Ablauf, Tageslimit, Datenschutz-Hinweis: Foto geht zur Erkennung an Cloudflare und wird nicht gespeichert).
- Migration remote einspielen (`npm run db:migrate`), Backend veröffentlichen (`npm run deploy` oder per GitHub Action), Smoke-Test gegen das echte Backend, `?v=` erhöhen, committen und pushen.
- Am Ende kurz berichten: was gebaut, was getestet, was ich am iPhone ausprobieren soll, wie viele Neurons ein Scan im Cloudflare-Dashboard ungefähr verbraucht.

### Abnahmekriterien

- [ ] Vom Antippen von „Scannen“ bis „In Sammlung“ höchstens 3 Tipps, wenn die Karte eindeutig erkannt wird.
- [ ] Glurak-ex 199/165 (151), eine ältere Karte (z. B. Grundset) und eine Promo werden erkannt oder sauber zur Auswahl angeboten.
- [ ] Cardmarket-Trend wird vor dem Hinzufügen angezeigt; „Trend übernehmen“ setzt den Kaufpreis.
- [ ] Keine Karte wird ohne Bestätigung hinzugefügt; vorhandene Karten erhöhen die Anzahl statt doppelt zu erscheinen.
- [ ] Jeder Fehlerfall aus Abschnitt 5 zeigt eine verständliche Meldung mit Ausweg, nichts hängt.
- [ ] Tageslimit greift, Gratis-Tarif wird nie überschritten.
- [ ] Läuft am iPhone in Safari und als Home-Bildschirm-App.
