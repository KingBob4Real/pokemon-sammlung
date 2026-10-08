# Prompt: Karten-Scanner ausbauen (Limit, fehlende Bilder, Serien-Scan, ganze Seite)

> **So benutzt du diesen Prompt:** Alles ab „## Auftrag“ in eine neue Sitzung mit einer Coding-KI kopieren (z. B. Claude Code im Ordner `pokemon-sammlung`). Die KI soll zuerst die genannten Dateien lesen, die offenen Fragen in Teil A **beantworten** und vor dem Bauen kurz bestätigen lassen, welche Varianten aus Teil B umgesetzt werden.

---

## Auftrag

Meine App **Pokémon-Sammlung** (pokekiste.app, Ordner `pokemon-sammlung`) hat einen Karten-Scanner. Ich will ihn ausbauen:

1. **Limit verstehen und lockern:** Was genau ist das Tageslimit beim Scannen, warum gibt es das, welche Limits hat Cloudflare – und geht es auch ohne Limit?
2. **Fehlende Bilder:** Einige SVP-Promos haben immer noch kein Bild. Beheben.
3. **Mehrere Karten ohne jedes Mal ein neues Foto:** Serien-Scan, bei dem die Kamera offen bleibt und ich nur die Karten wechsle.
4. **Ganze Seite auf einmal:** Ich fotografiere eine volle Sammelordner-Seite (z. B. 3 × 3 Karten) und die App versucht, **alle** Karten darauf zu erkennen.

Alles auf **Deutsch**, **fürs iPhone** (Safari und Home-Bildschirm-App), **kostenlos** wo möglich – wenn etwas Geld kostet, vorher klar sagen, wie viel.

### 1. Erst lesen

- `README.md` – Abschnitte „Scannen“, „Live & Dev“, Datenbank, Backend veröffentlichen
- Frontend: `frontend/js/ui/components/camera.js` (Live-Kamera mit Rahmen), `ui/components/scanSheet.js` (Ablauf im Dialog), `services/scanService.js` (Zuordnung), `domain/scanMatch.js` (Ranking), `core/image.js` (`shrinkPhoto`, `coverCrop`), `domain/card.js` (`nextImage` = Bild-Ersatzquellen), `ui/app.js` (`#onImageError`), `sw.js` (Bild-Cache)
- Backend: `backend/src/config.js` (Limits, Modell), `services/scanService.js` (Prompt, `toRecognized`, Tageslimit), `repositories/scanUsageRepository.js`, `controllers/scanController.js`, `wrangler.toml`, `test/smoke.mjs`
- Tests: `frontend/test/*.test.mjs`, `backend/test/smoke.mjs`

### 2. So läuft die Foto-Funktion heute (Stand des Codes – bitte gegenprüfen)

1. „📷 Scannen“ → **Live-Kamera** (`getUserMedia`, Rückkamera, ideal 1920 × 1080) mit Rahmen in Kartenform (63 : 88). Ohne Kamerazugriff: „Foto wählen“ über die Foto-App/Mediathek.
2. Auslöser → nur der **Bereich im Rahmen** (+ 6 % Rand) wird aus dem Videobild geschnitten (`coverCrop`), dann auf **max. 1024 px** verkleinert, JPEG 0,8 (~100 KB).
3. `POST /scan` an den Cloudflare Worker (mit Sitzung/Sync-Schlüssel der Person). Das Backend prüft: nur JPEG/PNG, **max. 1,5 MB** (Base64), dann das **Tageslimit**.
4. **Workers AI**, Modell `@cf/google/gemma-4-26b-a4b-it`, ohne „Nachdenken“ (`chat_template_kwargs.enable_thinking: false`), `max_tokens 200`, `temperature 0`. Der Prompt fragt Name, Sammlernummer, Setgröße, Set-Kürzel, Sprache, Sicherheit als JSON. Gemessen **~7 Neurons pro Scan**, ~1,5 s. Das Foto wird nicht gespeichert; ins Log geht nur das Gelesene.
5. Die App sucht die Karte im Katalog (TCGdex, Deutsch **und** Englisch). Ranking: Name > Nummer > Set-Kürzel > Setgröße (unpassende Setgröße zählt dagegen). Eindeutig → Bestätigung mit Cardmarket-Preis; mehrere → Auswahl; nichts → vorausgefüllte Suche. Danach „Nächste Karte scannen“ (öffnet die Kamera neu).

### 3. Limits heute

**In der App** (`backend/src/config.js`):
- `SCANS_PER_DAY = 50` pro Person, `SCANS_PER_DAY_TOTAL = 150` für alle zusammen – **pro Datenbank**, also Live und Dev getrennt. Gezählt in Tabelle `scan_usage` (Tag in UTC), auch fehlgeschlagene Versuche.
- Grund: Der Gratis-Tarif von Workers AI hat **10.000 Neurons pro Tag für das ganze Cloudflare-Konto** (Live + Dev zusammen). Beide Limits zusammen = max. 300 Scans ≈ 2.100 Neurons – weit darunter.

**Bei Cloudflare** (Gratis-Tarif „Workers Free“, Stand Oktober 2026 – bitte in der Cloudflare-Doku nachprüfen, Zahlen ändern sich):
- **Workers AI:** 10.000 Neurons/Tag gratis, Reset 00:00 UTC. Im Gratis-Tarif gibt es **keine Überziehung** – darüber schlagen Anfragen mit Fehler fehl. Mit **Workers Paid** (mind. 5 US-$/Monat) kostet es darüber **0,011 US-$ je 1.000 Neurons** (≈ 0,00008 $ pro Scan, 1.000 Scans ≈ 8 Cent).
- **Workers:** 100.000 Anfragen/Tag, **10 ms CPU-Zeit pro Anfrage** (Warten auf die KI zählt nicht als CPU; das Passwort-Hashing im Login ist bewusst auf ~4 ms ausgelegt).
- **D1 (Datenbank):** 5 Mio. gelesene Zeilen/Tag, 100.000 geschriebene Zeilen/Tag, 5 GB Speicher gesamt.
- **Workers Logs:** im Gratis-Tarif 3 Tage Aufbewahrung.
- Eigene Grenze der App: Foto max. 1,5 MB Base64, Zeitlimit 30 s.

### 4. Teil A – Fragen beantworten (bevor gebaut wird)

1. Erkläre mir in einfachen Worten: Was ist ein Neuron, wie viele Scans gehen am Tag theoretisch, wie viele erlauben meine Limits, was passiert beim Erreichen?
2. **Geht es ohne Limit?** Zeig die Varianten mit Kosten:
   - a) Limits innerhalb des Gratis-Tarifs **anheben** (z. B. 300 pro Person, 1.000 gesamt – rechne nach, dass Live + Dev zusammen sicher unter 10.000 Neurons bleiben, mit Puffer für teurere Fotos).
   - b) **Workers Paid** (5 $/Monat) und das Limit nur noch als Schutz gegen Fehler/Missbrauch (z. B. 2.000/Tag) – was kostet das realistisch bei uns 3?
   - c) Ganz ohne Limit – Risiken (Endlosschleife, geklauter Login) und warum ein großzügiger Schutz trotzdem sinnvoll ist.
   Empfiehl eine Variante. Limits sollen über `wrangler.toml` (`[vars]`, getrennt für Live und Dev) einstellbar sein statt fest im Code.
3. **Neurons pro Scan messen** – nicht schätzen: Die KI-Antwort enthält `usage.neurons`; kurz ins Log schreiben oder einmalig mit einem Testbild messen. Für Serien- und Seiten-Scan (Teil B) ebenfalls.

### 5. Teil B – Bauen

#### B1. Limit
- Limits aus `[vars]` lesen (Fallback auf die heutigen Werte), gewählte Variante aus A umsetzen.
- In der App anzeigen, wie viele Scans heute noch gehen (z. B. klein unter dem Auslöser: „Noch 43 Scans heute“). Dafür liefert `/scan` (und ein leichter `GET /scan/usage`) `{ remaining }` mit.
- Meldung bei erreichtem Limit bleibt verständlich und mit Ausweg („über die Suche hinzufügen“).

#### B2. Fehlende SVP-Bilder
Stand heute: Von 198 SVP-Promos haben **22 kein Bild bei TCGdex** (weder Deutsch noch Englisch). Die App fällt dann auf pokemontcg.io zurück (`nextImage` in `domain/card.js`) – dort gibt es aber nur 4 davon. **Es fehlen: 175, 176, 204–205, 208–212, 216–224** (neueste Promos).
- Gefunden: **Limitless TCG** hat sie, z. B. `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/SVP/SVP_175_R_EN_LG.png` (Muster `tpci/<SET>/<SET>_<Nummer>_R_EN_LG.png`, Nummer ohne führende Nullen). **Aber: kein CORS-Header** – die Kacheln laden Bilder mit `crossorigin="anonymous"`, das schlägt dann fehl.
- Lösung finden und umsetzen, z. B.: für diese Quelle das `crossorigin`-Attribut weglassen (reine Anzeige braucht es nicht; prüfen, wofür es heute gebraucht wird) **oder** ein kleiner Bild-Durchreicher im Worker (zählt Anfragen, Cache-Header setzen). Nutzungsbedingungen von Limitless kurz prüfen.
- Die Ersatzkette in `nextImage` um die neue Quelle erweitern (TCGdex deutsch → englisch → pokemontcg.io → Limitless), Service Worker cacht die neue Quelle auch offline.
- Danach einmal **alle Sets** durchprüfen (Skript wie beim letzten Mal: alle Karten ohne Bild in allen Quellen) und berichten, was noch fehlt.

#### B3. Serien-Scan (mehrere Karten, Kamera bleibt offen)
- Neuer Modus in der Kamera („Serie“): Die Kamera bleibt offen; ich halte eine Karte nach der anderen in den Rahmen.
- **Auslösen:** per Tipp **oder automatisch**, sobald eine Karte ruhig im Rahmen liegt (z. B. kleines Vorschaubild alle 300 ms vergleichen; erst auslösen, wenn sich ~0,7 s kaum etwas ändert **und** sich das Bild deutlich vom zuletzt gescannten unterscheidet – sonst wird dieselbe Karte doppelt gezählt). Kurzes Vibrieren/Blitzen als Rückmeldung.
- Erkannte Karten landen in einer **Liste unten** (Bild, Name, Nummer, Preis, Anzahl ±, löschen). Bei Unsicherheit: Karte markieren und später auflösen (Auswahl wie heute).
- Am Ende **ein** Knopf: „12 Karten in die Sammlung“ (optional Zustand/Sprache für alle, Abteilung/Liste wählen – es gibt schon Abteilungen und Listen).
- Jede Karte zählt als ein Scan. Läuft das Limit während der Serie ab: anhalten, Liste bleibt, verständliche Meldung.

#### B4. Ganze Seite fotografieren (alle Karten erkennen)
Zuerst **testen, was zuverlässig ist**, dann bauen. Zu vergleichen:
- a) **Ein Foto, ein KI-Aufruf:** Prompt bittet um eine JSON-**Liste** aller Karten (mit Position: Zeile/Spalte). Vorsicht: Das Modell rechnet das Bild intern stark herunter (~600 Prompt-Tokens für ein 1024-px-Bild) – auf einer ganzen Seite ist jede Karte nur noch klein, die winzigen Nummern sind dann kaum lesbar.
- b) **Raster in der App:** Ich wähle das Layout (3 × 3 Standard-Ordnerseite, 2 × 2, 4 × 3 …), richte die Seite im Rahmen aus, die App schneidet das **hochaufgelöste** Foto in Einzelkarten und schickt jede einzeln an `/scan` (z. B. 3 parallel). Zählt als 9 Scans, ~63 Neurons.
- c) **Zweistufig:** KI liefert erst die Kartenpositionen (Rechtecke), die App schneidet aus und lässt jede einzeln lesen.
Mit **echten Fotos** testen (ganze Seite, mit Hüllen/Spiegelungen) und die Trefferquote je Variante berichten. Meine Vermutung: b) ist am zuverlässigsten und einfach – a) als Option „automatisch“, falls gut genug.
- Ergebnis wie beim Serien-Scan: Liste aller erkannten Karten mit Ausschnitt-Vorschau, unsichere markiert, leere Fächer ignorieren, „Alle in die Sammlung“.

### 6. Regeln (wie im ganzen Projekt)

- Aufbau wie im Projekt (SOLID): Backend `http/ → controllers/ → services/ → repositories/`, Prüfung in `validation/`; Frontend `core/`, `data/`, `domain/` (reine Logik), `services/`, `ui/`. Verbunden wird nur in `main.js` bzw. `backend/src/index.js`.
- **Kein Build-Schritt, keine neuen Abhängigkeiten** im Frontend; im Backend nur Bordmittel von Cloudflare.
- Fehler verständlich und **immer mit Ausweg** (nichts hängt), Meldungen im Dialog statt `alert`.
- Handy zuerst: große Tipp-Flächen, Daumen-Reichweite unten, Safe-Area, `font-size: 16px` in Feldern, Animationen aus bei „Bewegung reduzieren“, Kamera wird immer freigegeben (auch beim Schließen/Wechsel).
- Keine Fotos speichern. Kommentare und Texte auf Deutsch. Nach Änderungen `?v=` in `frontend/index.html` hochzählen.
- **Release-Ablauf:** auf `develop` arbeiten → Dev-Backend (`--env dev`) migrieren/veröffentlichen → auf `pokekiste.app/dev/` testen → erst auf meinen Wunsch live (Backend zuerst, dann `develop` in `main`).
- Reine Logik (Raster-Zuschnitt, Bildvergleich für Auto-Auslösen, Limit-Rechnung) mit kleinen Node-Tests in `frontend/test/` bzw. im Smoke-Test.

### 7. Abschluss

- README aktualisieren (Scannen: Limits, Serien-Scan, Seiten-Scan, Bildquellen).
- Kurz berichten: Antworten aus Teil A, was gebaut wurde, gemessene Neurons pro Einzel-/Serien-/Seiten-Scan, Trefferquote beim Seiten-Scan je Variante, welche Bilder noch fehlen, was ich am iPhone ausprobieren soll.

### Abnahmekriterien

- [ ] Ich verstehe, was das Limit ist, warum es da ist und was „ohne Limit“ kosten würde; die gewählte Variante ist umgesetzt und per `wrangler.toml` einstellbar.
- [ ] Die App zeigt, wie viele Scans heute noch gehen.
- [ ] SVP 175, 176, 204–224 haben ein Bild (oder es ist begründet, warum nicht).
- [ ] Serien-Scan: 10 Karten nacheinander ohne neues Foto, keine Doppelten, am Ende mit einem Tipp in die Sammlung.
- [ ] Seiten-Scan: Eine volle 3 × 3-Seite liefert alle 9 Karten (unsichere markiert), leere Fächer werden ignoriert.
- [ ] Gratis-Tarif wird mit den gewählten Limits nie überschritten (oder die Kosten sind vorher bestätigt).
- [ ] Läuft am iPhone in Safari und als Home-Bildschirm-App; Kamera wird immer freigegeben.
