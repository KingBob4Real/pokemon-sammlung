# Prompt: MEP und Klassische Sammlung finden, Ordner und Mehrfach-Auswahl in der Sammlung, Cardmarket-Preis „ab“

> **So benutzt du diesen Prompt:** Alles ab „## Auftrag“ in eine neue Sitzung mit einer Coding-KI kopieren (z. B. Claude Code im Ordner `pokemon-sammlung`). Die KI soll zuerst die Ursachen bestätigen (Teil A), dann bauen (Teil B: Erkennen und Suche, Teil C: Sammlung, Teil D: Preis). Die offenen Fragen in Teil C und D vor dem Bauen mit mir klären.

---

## Auftrag

Meine App **Pokémon-Sammlung** (pokekiste.app, Ordner `pokemon-sammlung`) hat zwei Baustellen:

**1. Karten werden nicht gefunden.** Viele Karten aus zwei Sets werden **weder vom Scanner erkannt noch über die Suche gefunden**:

- **MEP Black Star Promos** (Mega-Entwicklung-Promos), z. B. **Mega-Dragoran-ex** (MEP 091)
- **30 Jahre: Klassische Sammlung**, z. B. **Palkia** (bei Limitless „Palkia LV.X“, 30C CC12)

Bitte Ursachen bestätigen, beheben und prüfen, welche anderen Sets dasselbe Problem haben (Teile A und B).

**2. Sammlung aufräumen.** In der Sammlung will ich Karten **so auswählen wie oben in der Suche** und sie dann in **Ordner** einsortieren (statt in „Abteilungen“) oder **mehrere auf einmal löschen** (Teil C).

**3. Richtiger Preis.** Der Wert einer Karte soll sich am **Cardmarket-Preis „ab“** orientieren, und zwar nur für Angebote auf **Deutsch oder Englisch** im Zustand **mindestens Excellent** (Teil D).

Alles auf **Deutsch**, **fürs iPhone**, ohne neue Abhängigkeiten.

### 1. Erst lesen

- `README.md`: Abschnitte „Suche“, „Scannen“, „Sammlung“, „Mehrere Karten auf einmal“ und Datenbank
- Frontend (Erkennen): `js/data/tcgdexClient.js`, `js/services/catalogService.js` (`parseQuery`, `#search`, `#byCode`), `js/services/scanService.js` (`match`, `CODE_LOOKUPS`), `js/domain/scanMatch.js` (`scanQueries`, `matchScore`, `rankMatches`), `js/domain/card.js` (`LIMITLESS_30C`, `imageSources`)
- Frontend (Sammlung): `js/ui/views/collectionView.js`, `js/ui/views/searchView.js`, `js/ui/components/selection.js`, `js/ui/components/searchPanel.js`, `js/ui/components/cardSheet.js`, `js/ui/components/scanBatch.js`, `js/services/collectionService.js` (Abteilungen = Art „section“), `js/ui/router.js`, `js/ui/views/listView.js` (als Vorbild für eine eigene Ordner-Seite)
- Frontend (Preis): `js/domain/price.js` (`toPrice`, `marketValue`, `cardmarketUrl`), `js/services/priceService.js`, `js/config.js` (`CARDMARKET_LANGUAGES`, `CARDMARKET_MIN_CONDITION`, `PRICE_TTL_MS`), `js/ui/components/cardSheet.js` (Preis-Kacheln), `js/ui/components/scanSheet.js` („Trend übernehmen“), `js/domain/sorting.js` (Sortieren nach Wert)
- Backend: `backend/src/services/scanService.js` (Prompt, `toRecognized`), `repositories/sectionRepository.js`, `validation/changeValidator.js`, Migration `0006_sections.sql`
- Tests: `frontend/test/scan.test.mjs`, `frontend/test/catalog.test.mjs`, `frontend/test/collection.test.mjs`

### 2. Was ich schon herausgefunden habe (Stand 08.10.2026, bitte gegenprüfen)

**MEP, Beispiel Mega-Dragoran-ex**
- Bei TCGdex hat MEP **englisch 112 Karten, deutsch nur 80**. Auf Deutsch fehlen u. a. 005, 006, 018, 019, 028, 068, 078, 086, **089–110**, 120 und „Museum“. `GET /v2/de/cards/mep-091` → 404, englisch heißt sie „Mega Dragonite ex“.
- **Suche „Dragoran“** findet sie deshalb nie: Deutsch fehlt die Karte, Englisch kennt den deutschen Namen nicht.
- **Scanner:** liest vermutlich `{ name: "Mega-Dragoran-ex", number: "091", total: null, setCode: "MEP" }`. `scanQueries` macht daraus „Mega-Dragoran-ex 91“ (leer), „91“ (Nummern-Suche, „enthält“ → 170+ Karten aus allen Sets, langsam) und „Mega-Dragoran-ex“ (leer). Das **Set-Kürzel wird nicht als Suche genutzt**, obwohl `CatalogService` „MEP 91“ schon direkt im Set nachschlagen kann (`#byCode`). Im Ranking bekommt MEP den Kürzel-Bonus nur, wenn es unter den ersten `CODE_LOOKUPS` = 8 Sets landet.
- Funktioniert (getestet): Pokédex-Nummer als Brücke. Deutsche Karte „Dragoran“ hat `dexId: [149]`, und `GET /v2/en/cards?dexId=eq:149` liefert u. a. `mep-091`.

**30 Jahre: Klassische Sammlung, Beispiel Palkia**
- Bei TCGdex ist das Set `30th-c` mit Nummern **001–030** (Palkia = **022**). Auf der Karte steht aber vermutlich **„CC12“** (so führt Limitless sie, Set 30C). Die Zuordnung CC ↔ TCGdex-Nummer gibt es schon, aber nur für Bilder: `LIMITLESS_30C` in `domain/card.js`.
- Das Kürzel **30C** gehört bei TCGdex zu **zwei** Sets: `30th-c` (Klassische Sammlung, 30 Karten) und `30th` („30 Jahre“, 161 Karten, dort ist Palkia **020**, eine andere Karte).
- **Scanner:** Nummer „CC12“ ist keine Zahl → `scanQueries` sucht nur nach dem Namen; `matchScore` vergleicht „CC12“ mit „022“ → kein Treffer. Das Kürzel 30C passt auf beide Sets, also gewinnt eventuell die falsche Palkia (30th-020) oder es bleibt eine unsichere Auswahl. Liest die KI „Palkia LV.X“, passt der Name nur teilweise (TCGdex: „Palkia“).
- **Suche** „CC12“ oder „30C CC12“ geht nicht: `parseQuery` erkennt nur Ziffern als Nummer.

### 3. Teil A: bestätigen (kurz)

1. Mit echten Fotos von Mega-Dragoran-ex und Palkia (Klassische Sammlung) scannen und im Cloudflare-Log nachsehen, **was die KI gelesen hat** (Name, Nummer, Kürzel). Stimmt die Vermutung „CC12“ / „MEP 091“? Steht auf deutschen MEP-Karten noch etwas wie „DE“ neben dem Kürzel?
2. Kleines Skript (nicht in die App): Für **alle Sets** deutsche gegen englische Kartenzahl bei TCGdex vergleichen und auflisten, wo Deutsch Karten fehlen. Ebenso alle Sets, deren Kürzel bei TCGdex mehrfach vorkommt, und alle Sets mit Buchstaben-Nummern auf der Karte, die TCGdex anders nummeriert.

### 4. Teil B: beheben

1. **Set-Kürzel + Nummer zuerst:** Hat der Scan ein Kürzel und eine Nummer, ist „KÜRZEL Nummer“ die erste Anfrage in `scanQueries` (genau die Karte im Set, kein Durchsuchen aller Sets).
2. **Deutscher Name für Karten, die es bei TCGdex nur auf Englisch gibt:** Findet die Namenssuche auf Deutsch nichts oder nur wenig, über die Pokédex-Nummer englische Karten nachladen (deutsche Karte mit dem Namen → `dexId` → `/en/cards?dexId=eq:…`). Gilt für Suche **und** Scanner. „Mega-“ und „-ex“ dabei wie heute behandeln. Ergebnis in der App mit deutschem Namen anzeigen, wo möglich.
3. **Klassische Sammlung:** Die CC-Zuordnung aus `LIMITLESS_30C` auch rückwärts nutzen: „CC12“ (+ Kürzel 30C) → `30th-c-022`. Im Scanner (`scanQueries`/`matchScore`) und in der Suche (`parseQuery`: „CC12“, „30C CC12“). Bei Kürzel 30C mit CC-Nummer nur `30th-c` zählen, nicht `30th`. Die Liste dafür nur an einer Stelle pflegen.
4. **Namen mit Zusatz:** „Palkia LV.X“ soll „Palkia“ voll treffen (Zusätze wie „LV.X“, „LEGENDE“, „TURBO“ beim Vergleich tolerieren, ohne dass „Pikachu“ plötzlich „Pikachu & Zekrom GX“ gleichwertig trifft).
5. Was Teil A sonst noch findet: berichten und, wenn es mit denselben Mitteln geht, mit beheben.

### 5. Teil C: Sammlung – auswählen, in Ordner sortieren, mehrere löschen

**Stand heute (laut Code, schon live, bitte gegenprüfen):**
- In der Sammlung gibt es schon „Auswählen“ (`selection.js`, `collectionView.js`). Unten erscheint dann eine Leiste mit „Alle“, dem Menü „Einsortieren …“ (Abteilung oder Liste), „Entfernen“ (mit „Rückgängig“) und „Fertig“.
- In der **Suche** sitzt „Auswählen“ **oben direkt neben dem Suchfeld**. In der **Sammlung** steht es erst unter der Statistik und den Knöpfen „+ Karten hinzufügen“/„Scannen“, neben dem Filterfeld. Am iPhone übersieht man es leicht; ich habe es nicht gefunden. Bitte am iPhone-Format (375 px) prüfen, ob es sichtbar und gut bedienbar ist.
- „Abteilungen“: in `collectionService.js` als Art „section“ (eine Karte liegt in höchstens einer), Gruppieren „Nach Abteilung“, „+ Neue Abteilung“, „⋯“ am Abschnitt zum Umbenennen/Löschen; im Backend Tabelle `sections` und `collection.section`. Beim Speichern im Serien-/Seiten-Scan (`scanBatch.js`) wählt man auch eine Abteilung.

**Was ich will:**
1. **Auswählen wie in der Suche:** „Auswählen“ steht in der Sammlung **oben** und ist ohne Scrollen sichtbar, genau wie in der Suche. Karten antippen → Leiste unten: Anzahl, „Alle“, „In Ordner …“, „Entfernen“, „Fertig“. Gleiches Verhalten in der Sammlung und in einem geöffneten Ordner.
2. **Ordner statt Abteilungen:**
   - Das Wort „Abteilung“ verschwindet überall: Texte, Gruppieren, Scan-Speichern, README. Es heißt „Ordner“.
   - Ordner sind **eigene Seiten**: In der Sammlung oben eine Übersicht der Ordner (Name, Kartenzahl, Wert) und „Ohne Ordner“. Antippen öffnet den Ordner (z. B. `#ordner/<id>`) mit seinen Karten, Sortieren, Filter und Auswählen. Am einfachsten wohl über die bestehende Sammlungs-Ansicht mit Ordner-Filter statt einer zweiten Kopie.
   - Ordner anlegen („+ Neuer Ordner“, auch direkt im Menü „In Ordner …“), umbenennen, löschen. Beim Löschen bleiben die Karten in der Sammlung, nur ohne Ordner.
   - In der Kartenansicht (`cardSheet.js`) sehe und ändere ich den Ordner der Karte.
   - **Bestehende Abteilungen werden ohne Datenverlust zu Ordnern.** Wenn möglich bleibt das Datenmodell (`section`, Tabelle `sections`) gleich und nur die Oberfläche ändert sich, dann braucht es keine Migration und keinen Backend-Release. Umbenennen im Code nur, wenn es einen echten Grund gibt.
3. **Mehrere auf einmal löschen:** Das gibt es schon („Entfernen“ mit „Rückgängig“). Es muss auch in einem geöffneten Ordner gehen. Dort braucht es **zwei klar getrennte** Aktionen: „Aus dem Ordner nehmen“ (Karte bleibt in der Sammlung) und „Aus der Sammlung löschen“. Ab 10 Karten fragt die App vor dem Löschen kurz nach. „Rückgängig“ bleibt.

**Vor dem Bauen mit mir klären:** Sollen Ordner wie echte Sammelordner **Seiten mit Fächern** haben (z. B. 3 × 3, Karte liegt auf Seite 2, Fach 5, passend zum Seiten-Scan)? Wenn ich nichts anderes sage: **nein**. Die Karten liegen dann in der eigenen Reihenfolge, die es schon gibt (gedrückt halten und ziehen).

### 6. Teil D: Preis = Cardmarket „ab“, Deutsch/Englisch, ab Excellent

**Stand heute (laut Code, bitte gegenprüfen):**
- Die Preise kommen von TCGdex (`pricing.cardmarket`, Cardmarket-Preisliste, 24 h zwischengespeichert). **Marktwert = Trend**, sonst Ø 30 Tage, sonst „ab“ (`marketValue` in `domain/price.js`). Daraus werden Gesamtwert, Gewinn/Verlust, Sortieren nach Wert, die Preise im Scan und „Trend übernehmen“ beim Kaufpreis berechnet.
- Diese Werte **mischen alle Sprachen und Zustände**. Das „ab“ (`low`) ist oft eine beschädigte oder japanische Karte. Beispiel `sv03.5-199` heute: ab 109,98 €, Trend 402,61 €.
- **Mein Beispiel, Mew-ex aus „30 Jahre“ (30C 158, TCGdex `30th-158`, Cardmarket-Produkt 907762):** Die App zeigt **19,18 €** (Trend), auf Cardmarket kostet sie **ab 39 €** (Deutsch/Englisch, ab Excellent). TCGdex liefert dazu (Stand 08.10.2026): Trend 19,18 · ab 35 · Ø 83,34 · Ø 1 Tag 55,40 · Ø 7 Tage 59,90 · Ø 30 Tage 79,79. Der Trend liegt also **unter jedem echten Angebot**; bei neuen Sets ist er offenbar unbrauchbar. Auch das ungefilterte „ab“ (35 €) ist zu niedrig, weil es andere Sprachen oder schlechtere Zustände enthält.
- Nur der **Link** zu Cardmarket in der Kartenansicht filtert schon richtig (Sprache der Karte, `minCondition=3` = Excellent, `cardmarketUrl`).

**Was ich will:**
- Der Wert einer Karte ist der **günstigste Cardmarket-Preis („ab“) für Deutsch oder Englisch, Zustand Excellent oder besser**.
- **Dieser Wert ersetzt den Trend komplett.** Die Sammlung zeigt ihn an, und die App rechnet nur mit ihm: Kachel, Kartenansicht, Marktwert/Gesamtwert oben in der Sammlung, Gewinn/Verlust, Werte in Listen und Ordnern, Sortieren nach Wert, Scan-Bestätigung und Serien-Liste. `marketValue` liefert genau diesen Wert. Der Hinweis unter „Marktwert“ heißt nicht mehr „Cardmarket-Trend“, sondern z. B. „Cardmarket ab · DE/EN · ab EX“. Aus „Trend übernehmen“ wird „Preis übernehmen“ (übernimmt diesen Wert).
- **Trend und Ø 30 Tage fließen nirgends mehr in eine Rechnung ein.** Höchstens stehen sie klein als Zusatzinfo in der Kartenansicht.
- In der Kartenansicht steht beim Preis, wofür er gilt (z. B. „ab 312,00 € · DE/EN · ab EX“), mit Stand-Datum.
- Gibt es keinen solchen Preis (kein Angebot oder keine Daten), wird **nicht** auf den Trend ausgewichen. Die Karte gilt dann wie heute als „ohne Preis“ (zählt nicht zum Gesamtwert, „X ohne Preis“ oben) und zeigt „–“. Der gefilterte Cardmarket-Link bleibt der Ausweg.

**Zuerst klären, woher dieser Preis kommen kann, und mir die Wege mit Aufwand und Kosten zeigen, bevor gebaut wird:**
- a) **Öffentliche Cardmarket-Preisliste / TCGdex:** Gibt es dort einen Wert wie „Low Ex+“ (ab Excellent)? Nach Sprache gefiltert ist dort vermutlich nichts. Ist „ab Excellent, alle Sprachen“ eine brauchbare Näherung?
- b) **Cardmarket-API** (Angebote je Produkt mit Filter Sprache + Mindestzustand): Bekomme ich als Privatperson überhaupt Zugang? Welche Grenzen gelten für Anfragen pro Tag? Wenn ja: nur über das Backend (Schlüssel als Worker-Secret, nie im Frontend), Ergebnis je Karte 24 h zwischenspeichern, nur Karten aus Sammlung und Listen abfragen, nicht jede Suche.
- c) **Cardmarket-Seite auslesen:** nur, wenn die Nutzungsbedingungen das erlauben. Sonst nicht bauen und mir sagen, warum.
- d) Wenn nichts davon geht: die beste „ab“-Näherung aus a), also nie den Trend, und ein schneller Weg, den „ab“-Preis selbst einzutragen (über den gefilterten Link in der Kartenansicht). Ein selbst eingetragener Preis zählt dann wie der Cardmarket-Wert.
Den Weg mit dem besten Verhältnis aus Genauigkeit und Aufwand empfehlen und kostenlos bleiben, wenn es irgendwie geht.

### 7. Regeln (wie im ganzen Projekt)

- Aufbau beibehalten: reine Logik in `domain/`, Netz in `data/`, Abläufe in `services/`; verbunden wird nur in `main.js`.
- Keine neuen Abhängigkeiten, kein Build-Schritt. Kommentare und Texte auf Deutsch. Nach Änderungen `?v=` in `frontend/index.html` hochzählen.
- Zusätzliche TCGdex-Anfragen sparsam: nur, wenn die normale Suche nichts findet; Ergebnisse cachen wie die bestehende Suche.
- Tests ohne Netz in `frontend/test/scan.test.mjs` und `catalog.test.mjs`: Mega-Dragoran-ex (MEP 091, nur englisch), Palkia CC12 → `30th-c-022` (nicht `30th-020`), Suche „Dragoran“, „CC12“, „30C CC12“, „MEP 91“. In `collection.test.mjs`: Karten in einen Ordner legen und herausnehmen, Ordner löschen (Karten bleiben), mehrere löschen und rückgängig machen. Für den Preis (`price.test.mjs` o. ä.): `marketValue` = „ab DE/EN ab EX“; ohne diesen Preis `null`, auch wenn ein Trend da ist.
- Handy zuerst: große Tipp-Flächen, Leiste unten in Daumen-Reichweite und über der Safe-Area, Meldungen im Dialog statt `alert`/`prompt`, wo es schon so gelöst ist.
- Sync: Ordner und Ordner-Zuordnung gleichen sich wie heute die Abteilungen zwischen Geräten ab; das mit zwei Geräten bzw. zwei Browsern prüfen.
- **Release-Ablauf:** auf `develop` arbeiten → auf `pokekiste.app/dev/` testen → erst auf meinen Wunsch live (falls doch das Backend geändert wird: Backend zuerst).

### 8. Abschluss

- README („Suche“, „Scannen“, „Sammlung“, „Mehrere Karten auf einmal“, „Marktwert“) anpassen, „Abteilung“ → „Ordner“.
- Berichten: was die KI bei den Testfotos gelesen hat, was geändert wurde, Liste der Sets mit fehlenden deutschen Karten / doppelten Kürzeln, ob für die Ordner Backend oder Datenbank geändert wurden, woher der Preis jetzt kommt (und wie genau er ist), was ich am iPhone ausprobieren soll.

### Abnahmekriterien

- [ ] Scan von Mega-Dragoran-ex (MEP 091) → direkt die richtige Karte mit Preis.
- [ ] Scan von Palkia aus der Klassischen Sammlung → `30th-c-022`, nicht die Palkia aus „30 Jahre“.
- [ ] Suche „Dragoran“ findet Mega-Dragoran-ex; „CC12“, „30C CC12“ und „MEP 91“ finden genau die Karte.
- [ ] Die anderen fehlenden MEP-Karten (089–110 usw.) und alle 30 Karten der Klassischen Sammlung sind per Suche und Scan auffindbar.
- [ ] In der Sammlung ist „Auswählen“ am iPhone ohne Scrollen sichtbar, wie in der Suche.
- [ ] Ausgewählte Karten lassen sich mit zwei Tipps in einen (auch neuen) Ordner legen.
- [ ] Ordner-Übersicht in der Sammlung; ein Ordner öffnet sich als eigene Seite mit Sortieren, Filter und Auswählen.
- [ ] Meine bisherigen Abteilungen sind als Ordner da, keine Karte hat ihre Zuordnung verloren; „Abteilung“ steht nirgends mehr.
- [ ] Mehrere Karten auf einmal löschen geht in der Sammlung und im Ordner, mit „Rückgängig“; im Ordner ist „Aus dem Ordner nehmen“ klar vom Löschen getrennt.
- [ ] Ordner gleichen sich zwischen Geräten ab.
- [ ] Der Wert in der Sammlung ist der Cardmarket-„ab“-Preis für Deutsch/Englisch ab Excellent (Stichprobe: Mew-ex `30th-158` ≈ 39 € statt 19,18 €, dazu 4 weitere Karten mit dem gefilterten Link vergleichen), nicht der Trend. Marktwert oben, Gewinn/Verlust, Listen, Ordner und Sortieren rechnen nur damit; ohne diesen Preis gilt die Karte als „ohne Preis“.
- [ ] Tests laufen ohne Netz durch.
