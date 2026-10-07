# Pokémon-Sammlung

Meine Kartensammlung als iPhone-taugliche Web-App: alle deutschen Karten suchen, Sammlung pflegen, eigene Listen anlegen, Marktwerte sehen. Läuft offline und gleicht sich über ein kleines Cloudflare-Backend zwischen Geräten ab.

- **Suche:** alle deutschen Karten über die [TCGdex-API](https://tcgdex.dev), nach Name (`Glurak`) und/oder Nummer (`199`, `199/165`), oder Set für Set. TCG-Pocket-Karten sind ausgeblendet.
- **Sammlung:** pro Karte Anzahl, Zustand, Sprache und Kaufpreis. Oben Gesamtwert, Bezahlt und Gewinn/Verlust.
- **Listen:** beliebig viele, umbenennen, löschen, sortieren (Reihenfolge, Set & Nummer, Name, Wert), filtern (fehlend/vorhanden). „Vorhanden“ heißt: in der Sammlung.
- **Marktwert:** Cardmarket-Trend aus TCGdex (alle Sprachen & Zustände gemischt), 24 h zwischengespeichert. Der Cardmarket-Link in der Kartenansicht filtert auf deutsche Karten ab Excellent.
- **Alte Checkliste übernehmen:** unter „Mehr“. Jede Gruppe wird eine Liste, abgehakte Karten kommen mit „Mein Preis“ als Kaufpreis in die Sammlung.
- **App & offline:** iPhone: Safari → Teilen → „Zum Home-Bildschirm“. Der Service Worker speichert App und alle einmal gesehenen Kartenbilder.

## Aufbau

```
frontend/                  App für GitHub Pages (ES-Module, kein Build-Schritt)
  index.html, sw.js, manifest.webmanifest, icon.png, css/
  js/main.js               Composition Root: erzeugt und verbindet alle Teile
  js/config.js             feste Einstellungen
  js/core/                 Werkzeuge: DOM, Formatieren, Speicher, HTTP, Dateien
  js/data/                 Zugriff auf externe APIs: TCGdex, eigenes Backend
  js/domain/               reine Fachlogik: Karte, Preis, Sortierung
  js/services/             Anwendungslogik: lokaler Speicher, Sammlung, Listen, Preise, Sets, Katalog, Sync, Sicherung, Import
  js/ui/                   App-Hülle, Router, Komponenten, Ansichten
backend/                   Cloudflare Worker + D1-Datenbank
  src/index.js             Composition Root
  src/http/                Router, Antworten (CORS), Schlüssel-Prüfung
  src/controllers/         HTTP ↔ Service
  src/services/            Abgleich-Logik
  src/repositories/        SQL pro Tabelle
  src/validation/          Prüfung eingehender Daten
  migrations/              Datenbank-Schema
  test/smoke.mjs           Test gegen ein laufendes Backend
.github/workflows/pages.yml  veröffentlicht frontend/ bei jedem Push
```

Erweitern: neue Ansicht → Datei in `ui/views/` und in `ui/app.js` eintragen. Neue Datenart → Repository in `backend/src/repositories/`, Regel in `validation/changeValidator.js`, Eintrag in `backend/src/index.js` und `ENTITY_TYPES` im Frontend; die Sync-Logik bleibt unverändert.

## Datenbank (Cloudflare D1, SQLite)

| Tabelle | Inhalt |
| --- | --- |
| `cards` | Kartendaten: Name, Nummer, Set, Bild |
| `collection` | meine Sammlung: Anzahl, Zustand, Sprache, Kaufpreis |
| `lists` | eigene Listen |
| `list_items` | welche Karte in welcher Liste |

Jede Zeile hat `updated` (neueste Änderung gewinnt), `deleted` und `rev` (Server-Stand). Ein Gerät schickt `POST /sync` mit seinen Änderungen und seinem letzten Stand und bekommt alles Neue zurück. Geschützt über einen persönlichen Schlüssel (`SYNC_KEY`). Gratis-Tarif: 500 MB pro Datenbank, 7 Tage Wiederherstellung (Time Travel).

Bei Änderungen an `frontend/css/style.css` oder `frontend/js/main.js` die Versionsnummer `?v=` in `index.html` hochzählen.

## Backend einrichten (einmalig)

Voraussetzung: kostenloses Cloudflare-Konto. Im Ordner `backend/`:

```bash
npm install
npx wrangler login
npx wrangler d1 create pokemon-sammlung        # ausgegebene database_id in wrangler.toml eintragen
npm run db:migrate
npx wrangler secret put SYNC_KEY               # Schlüssel z. B. aus der App („Mehr“ → „Neuen Schlüssel erzeugen“)
npm run deploy                                 # gibt die Backend-Adresse aus (…workers.dev)
node test/smoke.mjs https://<backend-adresse> <SCHLÜSSEL>
```

Lokal: `.dev.vars` mit `SYNC_KEY="TEST-TEST-TEST-TEST-TEST"` anlegen, `npm run db:migrate:local`, `npm run dev`, dann `npm run test:smoke`. Frontend: im Ordner `frontend/` z. B. `python -m http.server`.

Kartenbilder und Daten stammen von TCGdex. Fan-Projekt ohne Verbindung zu Nintendo, Creatures, GAME FREAK, The Pokémon Company oder Cardmarket.
