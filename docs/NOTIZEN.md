# Notizen

Recherche, Messwerte und Regeln hinter den Entscheidungen – zum Nachschlagen. Was die App kann und wie man sie betreibt, steht in der [README](../README.md).

## Preise: Quellen und Grenzen

### Woher die Preise kommen, was gespeichert wird

- Cardmarket-Werte über TCGdex: Ø 7 Tage (sonst Ø 30 Tage). Hat der deutsche TCGdex-Datensatz keinen Preis (z. B. McDonald's, Celebrations Klassische Kollektion, MEP), zählt der englische; die App merkt sich das (`en: true`) und fragt am nächsten Tag gleich dort (die Seltenheit bleibt deutsch).
- Gespeichert werden außerdem „ab“ (`low`) und Ø 1 Tag für den Tauschrechner. Preise gelten 24 h.
- **Tägliche Preisliste:** Der Pages-Workflow holt jeden Tag Cardmarkets öffentliche Preisliste und legt sie als `data/cardmarket-prices.json` neben die App (nicht in Git): `products` = alle Einzelkarten (~560 KB gezippt), `prices` = die selbst zugeordneten Karten (siehe unten). Die App lädt sie einmal pro Sitzung. Ist sie älter als 2 Tage (Pages-Lauf ausgefallen) oder fehlt sie (lokal), fragt die App wie früher jede Karte bei TCGdex. Die Werte sind dieselben – TCGdex holt sie auch aus dieser Liste, nur einen Tag später.

### Karten ohne Cardmarket-Zuordnung (♀, ♂, ◇, δ, ’, „-EX“)

- TCGdex ordnet solche Karten oft keinem Cardmarket-Produkt zu (geprüft 10.10.2026: z. B. fast alle Nidorans, Plasma Freeze 14 von 122, Team Up 11 von 196 Karten) – dann gibt es dort in keiner Sprache einen Preis.
- `scripts/cardmarket.mjs` ordnet sie selbst zu: Set → Cardmarket-Erweiterung über die Karten, die TCGdex schon kennt, dann Name + Attacken/Fähigkeiten in Cardmarkets Produktliste. Doppeldrucke (normal/Full Art) nur, wenn eindeutig – lieber kein Preis als ein falscher.
- Die Zuordnung steht in `scripts/cardmarket-map.json`. Nach neuen Sets `node scripts/cardmarket.mjs map` ausführen (prüft nur neue Sets) und committen.

### Warum keine Sammel-Abfrage, warum kein „ab“ nach Sprache und Zustand

- **Keine Sammel-Abfrage bei TCGdex** (geprüft 10.10.2026): `pricing` gibt es nur an der einzelnen Karte (`/v2/<de|en>/cards/<id>`); Set- und Listen-Endpunkte liefern nur Kurzdaten, die GraphQL-Schnittstelle kennt kein `pricing` (auch nicht in `variants_detailed`). Darum fragt nur eine neue Karte TCGdex, danach gilt die Tagesliste.
- **Trend und „ab“ zählen nicht:** Der Trend liegt bei neuen Sets oft unter jedem Angebot, „ab“ mischt beschädigte und fremdsprachige Karten (Mew-ex 30th-158: Trend 19 €, ab 35 €, Ø 7 Tage 60 €, Ø 30 Tage 80 €).
- **Kein Preis nach Sprache/Zustand:** TCGdex liefert pro Karte nur `low`, `avg`, `trend`, `avg1`, `avg7`, `avg30` (plus Holo), ohne Sprache oder Zustand; die Sprache in der Adresse ändert nur die Kartentexte (geprüft 10.10.2026, Glurak-ex 151 199: auf de/en/fr gleich). Kostenlos gibt es das nirgends als Daten (Stand 08.10.2026, erneut geprüft 14.10.2026: Preisliste ohne Sprache/Zustand, die Cardmarket-API nimmt keine Anträge an, cardmarket.com blockt automatische Abrufe) – darum der gefilterte Cardmarket-Link und „Eigener Preis“ im Tauschrechner.

## Kartenbilder: die Quellen-Kette

### Reihenfolge, Durchreicher, Lücken

- Lädt ein Bild nicht, probiert die App der Reihe nach (`imageSources` in `domain/card.js`):
  1. TCGdex deutsch
  2. TCGdex englisch
  3. [Limitless TCG](https://limitlesstcg.com) – neueste Promos SVP/MEP/MEE/SVE, 30 Jahre inkl. Mew B/G/R, Klassische Sammlung, Celebrations Klassische Kollektion
  4. TCGplayer – McDonald's 2014/15/17/18/23/24, Trainer-Kits DP/HGSS, My First Battle, Icognito-Buchstaben, MEP 093/102–110, SVP 190–192 …
  5. [pokemontcg.io](https://pokemontcg.io) – Shiny Vault, Trainer-Galerien, McDonald's 2011/12/16/19/21/22, EX-Trainer-Kits, Glänzende Legenden …
- Welche Adresse geklappt hat (oder „keine“), merkt sich die App 30 Tage; die große Größe nutzt gleich die Quelle der kleinen.
- Limitless und TCGplayer schicken keinen CORS-Header, darum laufen beide über `GET /img` des Backends; für TCGplayer holt das Backend die Produktnummer aus der TCGdex-Karte (`/img?card=2014xy-1`).
- TCGdex meldet nicht jedes vorhandene Bild (MEP 033 gibt es nur als deutsche Datei, die Mew B/G/R gar nicht, obwohl gemeldet) – darum werden immer beide Sprachen probiert. pokemontcg.io kommt zuletzt, weil es bei fehlenden Karten eine Kartenrückseite schickt, die als geladen zählt.
- Ganz ohne Bild sind noch ~55 Karten (Stand 09.10.2026): SM-Trainer-Kits (Wolwerock, Alola-Raichu), drei Karten aus dem HS-Trainer-Kit Garados, Yellow-A-Alternates (`xya`), My First Battle 33/34, MEP 120 – dort stehen Name und Nummer.

## Karten nur auf Englisch & Nachdrucke

### Deutsche Namen für englische Karten, Nummern der Nachdrucke

- **Nur auf Englisch bei TCGdex** (Stand 08.10.2026 u. a. MEP 005/006/018/019/028/068/078/086/089–110/120, 28 SVP-Promos, alle XY-, SW- und HGSS-Promos, Drachengruft, Celebrations Klassische Kollektion): Der deutsche Name findet sie über die Pokédex-Nummer (`Dragoran` → deutsche Karte → `dexId` 149 → `/en/cards?dexId=eq:149` → u. a. MEP 091), angezeigt mit deutschem Namen, wenn es das Set auf Deutsch gibt. Das kostet nur drei Anfragen mehr, wenn der Name auf Englisch nichts findet. `MEP 91` schlägt direkt im Set nach und nimmt die englische Karte, wenn die deutsche fehlt.
- **Nachdrucke mit der Nummer des Originals:** „30 Jahre: Klassische Sammlung“ (Palkia LV.X **106/106** = TCGdex `30th-c-022`) und „Celebrations: Klassische Kollektion“ (Glurak **4/102** = `cel25cc-CC002`) zählt TCGdex neu durch. Die Zuordnung steht in einer Tabelle in `domain/card.js` (von den Kartenbildern abgelesen) und gilt für Anzeige, Suche und Scanner.
- **Kürzel:** doppelt ist nur `30C` (`30th-c` Klassische Sammlung und `30th` „30 Jahre“). Buchstaben-Nummern, die TCGdex anders zählt als die Karte: `30th-c` (001–030) und `cel25cc` (CC001–CC025). Alle anderen (TG, GG, SV, RC, SL, H, AR, BW, XY, SM, SWSH …) stehen bei TCGdex so wie auf der Karte.

### Lücken bei TCGdex: Karten, die es nur auf Englisch gibt (Stand 08.10.2026)

Abgleich aller Sets Deutsch gegen Englisch (`/v2/<de|en>/sets/<id>`):

| Set | EN | DE | fehlt auf Deutsch |
| --- | --- | --- | --- |
| `mep` MEP Black Star Promos | 112 | 80 | 005, 006, 018, 019, 028, 068, 078, 086, 089–110 (u. a. 091 Mega-Dragoran-ex, 096–098 Lavados/Arktos/Zapdos), 120, „Museum“ |
| `svp` SVP Black Star Promos | 226 | 198 | 023, 024, 040, 041, 061, 062, 085, 093, 094, 102, 119, 120, 137, 138, 155, 158, 185, 186, 190–192, 199, 200, 213–215, 225, 500 |
| `basep` Wizards Black Star Promos | 53 | 24 | 29 Karten (7, 8, 10–13, 15–20, 27, 28, 34, 40–53) |
| `smp` SM-Promos | 248 | 240 | SM04, SM108–SM114 |
| `swshp` SWSH-Promos | 307 | 301 | SWSH074, 075, 177, 303–305 |
| `bwp`, `xyp`, `hgssp`, `dv1`, `xya`, `cel25cc` | 101, 216, 25, 21, 6, 25 | 0 | alle (Set gibt es auf Deutsch, aber ohne Karten) |

## Scanner im Detail

### Erkennung, Auto-Auslöser, Seiten

- Die App verkleinert das Foto (1024 px, JPEG) und schickt es an `POST /scan`. Das Backend lässt Workers AI (`@cf/google/gemma-4-26b-a4b-it`, ohne „Nachdenken“) Name, Nummer, Setgröße und Set-Kürzel lesen.
- Die App sucht die Karte auf Deutsch und Englisch (`domain/scanMatch.js`): mit Kürzel zuerst „KÜRZEL Nummer“, dann Name + Nummer, Nummer, Name, bis ein Treffer eindeutig ist. Der Name zählt viel, weil die KI die winzige Nummer alter Karten manchmal mit der Pokédex-Nummer verwechselt; Zusätze wie „LV.X“, „LEGENDE“, „TURBO“ stören nicht.
- Die KI meldet das runde Jubiläums-Logo (`stamp`: 25 oder 30) – so trennt der Scanner Nachdruck und Original (Grundset-Glurak 4/102).
- **Auto-Auslöser** (`AutoShutter` in `core/image.js`): alle 300 ms ein Vorschaubild (24 × 32 Graustufen) vergleichen, leere Fläche ignorieren, nicht dieselbe Karte nochmal. Was beim Öffnen schon im Rahmen liegt, zählt als gesehen. Dreimal hintereinander nichts erkannt → Automatik pausiert.
- **Seite:** Die App schneidet das Foto in Fächer (`gridCells`, 3 % Rand) und lässt jedes einzeln lesen (3 gleichzeitig).
- **Was wurde gelesen?** Jeder Scan schreibt das Erkannte (kein Foto), die verbrauchten Neurons und die übrigen Scans ins Log: Cloudflare-Dashboard → Workers → `pokemon-sammlung(-dev)` → Logs (3 Tage).

### Warum ein Tageslimit – die Rechnung

- Der Gratis-Tarif von Workers AI hat 10.000 Neurons pro Tag für das ganze Cloudflare-Konto (Live + Dev zusammen, Reset 00:00 UTC); darüber schlagen Anfragen fehl.
- Ein Scan kostet gemessen 6,6–9,4 Neurons (825 Tokens rein, ~65 raus), höchstens 10,3 (`max_tokens` 100). (900 + 60) × 10,3 ≈ 9.900 – passt selbst im schlimmsten Fall. Eine Serie von 10 Karten ≈ 88 Neurons, eine 3 × 3-Seite ≈ 66–78.
- Einstellbar in `backend/wrangler.toml` (`SCANS_PER_DAY`, `SCANS_PER_DAY_TOTAL` unter `[vars]` bzw. `[env.dev.vars]`), Zähler in `scan_usage` (Tag in UTC). Jede Karte und jedes Fach ist ein Scan, auch fehlgeschlagene.
- Ohne Limit ginge es nur mit Workers Paid (5 $/Monat, darüber 0,011 $ je 1.000 Neurons ≈ 0,0001 $ pro Scan).

### Wie gut er ist – Testergebnisse

- Einzelkarten 11/11 richtig.
- Ganze Seite bei 4K-Kamerabild 42/43 Karten richtig (die eine falsche Nummer landet als „unsicher“), 0 von 6 leeren Fächern falsch erkannt. Bei 1080p sind die Nummern auf einer ganzen Seite unzuverlässig – darum fragt die Kamera 4K an.
- Ein KI-Aufruf für die ganze Seite (JSON-Liste) traf nur 1 von 25 Nummern; KI-Rechtecke statt Raster brachten nichts.
- Die Testbilder waren künstlich (Kartenbilder mit Hülle, Spiegelung, schief) – echte Fotos können anders ausfallen.

## Tauschen: Technik

- `GET /trade` (nur angemeldet) → `{ people: [{ id, name, offers: [{ card, qty, cond, lang }], missing: [card] }] }` für jede andere Person. Angebote = `collection` mit `trade = 1` oder (`trade` leer und `qty > 1`); fehlend = Karten aus ihren Listen, die nicht in ihrer Sammlung sind. Gelöschte Zeilen und Listen zählen nicht. Nur lesen, keine eigene Tabelle (`CollectionRepository.offers`, `ListItemRepository.missing`, `services/tradeService.js`). Tauschen pro Karte steht in `collection.trade` (Migration `0007_trade.sql`; leer = wenn doppelt).
- Abgleich in der App per Karten-ID (`domain/trade.js`) – die Sprache zählt nicht. Alle Listen zählen als Wunschliste. Jeder pflegt seine Sammlung selbst.
- Alle angemeldeten Personen sehen Angebote und Listen der anderen, ohne Einstellung (die App ist nur für uns, Namen sind ohnehin öffentlich).
- Braucht Internet; offline ein Hinweis (mit dem letzten Stand, falls schon geladen). Die letzte Antwort bleibt nur im Speicher, nicht auf dem Gerät.
- Warum es kein „ab“ nach Sprache und Zustand gibt: [Preise](#preise-quellen-und-grenzen).

## Sammlung: Exemplare und „Meine Sets“

- **Exemplare einzeln** (ab 2 Stück): Bezahlt, Gewinn/Verlust und „Ohne Kaufpreis“ rechnen dann pro Exemplar.
- Scannen legt neue Exemplare mit den Angaben vom Scan an (gescannte englische Karte = englisches Exemplar), statt die vorhandenen zu überschreiben.
- Sind alle wieder gleich, speichert die App nur die Anzahl. Gespeichert in `copies` (nur, wenn sie sich unterscheiden; höchstens 100); Zustand/Sprache/Kaufpreis der Karte = erstes Exemplar – das nutzen Tauschen und der Cardmarket-Link.
- **Meine Sets** (Suche ohne Eingabe): gezählt wird offline aus der Sammlung, aus derselben Quelle wie „x von y“ in der Set-Ansicht (`collection.countBySet()`, `sets.info(id).total` = deutsche Karten plus die, die TCGdex nur auf Englisch hat, z. B. MEP 112 statt 80).
- Bei Jumbo, MFB, SM-Trainer-Kit u. a. listet TCGdex weniger Karten, als das Set hat – gezählt wird das Set.

## Speicher: Messwerte und Entscheidungen

- **Speichern pro Änderung** (`#persist` in `services/entityStore.js`, alles neu als JSON): 0,2 ms bei 115 Einträgen, 0,7 ms bei 456, 2,6 ms bei 1.000, 14 ms bei 2.000 (Median, Desktop-Chrome; iPhone geschätzt doppelt so lang). Unter ~16 ms bleibt es bis grob 1.500 Einträge pro Person – gebündeltes Speichern lohnt erst darüber.
- **Gelöschte Einträge** bleiben auch nach dem Sync liegen: Ohne sie holt eine ältere Sicherung Gelöschtes zurück aufs Gerät und lädt es hoch, bis der nächste Sync es wieder löscht. Der Platzgewinn wäre klein.
- Eng wird es erst bei mehreren tausend Karten pro Person; dann wäre IndexedDB der nächste Schritt.
- **App-Dateien „Speicher zuerst“:** Ein normaler Start fragt nur `index.html` übers Netz (gemessen: 2 statt 63 Anfragen an die eigene Seite) und startet bei schlechtem Empfang nach 3 s aus dem Speicher.

## Abhängigkeiten und Ersatz (Stand 14.10.2026)

- **TCGdex** (Suche, Kartendaten, Bilder, erste Preise): Daten und Server sind Open Source (MIT, [tcgdex/cards-database](https://github.com/tcgdex/cards-database), mit Dockerfile). Notfalls selbst betreiben – nicht auf Cloudflare Workers (braucht Docker, also einen eigenen Server). Gesehene Bilder und die Sammlung selbst hat die App ohnehin offline.
- **pokemontcg.io** (letzte Bildquelle): Nachfolger ist Scrydex (kostenpflichtig), die alte API soll eingestellt werden – fällt sie weg, fehlen nur ein paar Bilder.
- **Cardmarket-Preisliste**: öffentliche Datei, täglich vom Pages-Workflow geholt; fällt sie aus, fragt die App TCGdex (siehe oben).
- **Workers AI** (Scanner): Gratis-Tarif mit Tageslimit; ohne Scanner geht alles andere weiter.
