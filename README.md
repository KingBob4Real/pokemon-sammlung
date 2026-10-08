# Pokémon-Sammlung

Kartensammlung als iPhone-taugliche Web-App: alle deutschen und englischen Karten suchen und scannen, Sammlung pflegen, eigene Listen anlegen, Marktwerte sehen. Läuft offline und gleicht sich über ein kleines Cloudflare-Backend zwischen Geräten ab. Mehrere Personen, jede mit eigenem Schlüssel und eigener Sammlung.

- **Suche:** alle Karten auf Deutsch und Englisch über die [TCGdex-API](https://tcgdex.dev), nach Name (`Glurak` oder `Charizard`) und/oder Nummer (`199`, `199/165`), oder Set für Set – Set-Namen findet die Suche auch (`Erhabene Helden`, `Evolving Skies`). Sets, die es nur auf Englisch gibt (z. B. Gym Heroes, McDonald's), sind dabei und als „nur Englisch“ markiert. Gibt es eine Karte in beiden Sprachen, gewinnt die deutsche. TCG-Pocket-Karten sind ausgeblendet. Fehlt das deutsche Bild (ältere Sets, manche Promos), kommt das englische – auch bei schon gespeicherten Karten (wird beim Start nachgetragen); hat TCGdex gar keins (Shiny Vault, Trainer-Galerien, Galarian Gallery, Drachenwandel …), kommt es von [pokemontcg.io](https://pokemontcg.io) (`nextImage` in `domain/card.js`).
- **Wer sammelt?** Profilauswahl wie bei Netflix: alle Personen (Lukas, Lucas, Tim) sind auf jedem Gerät da, Antippen meldet an – kein Sync-Schlüssel nötig. Beim ersten Mal kann jede Person ein Passwort festlegen; dann wird es bei jedem Wechsel zu ihr abgefragt, ändern oder entfernen geht nur mit dem alten (unter „Mehr“, dort auch den Namen ändern). Neues Passwort = alle anderen Geräte dieser Person abgemeldet. 5 falsche Versuche → 15 Minuten Pause. Jede Person hat auf dem Gerät eigene Daten; Wechsel über das Rund-Symbol oben rechts. Ohne Passwort kann jeder mit der App-Adresse eine Person antippen – gewollt, die App ist nur für uns.
- **Sammlung:** pro Karte Anzahl, Zustand, Sprache, Kaufpreis und Abteilung. Sortieren nach zuletzt hinzugefügt, **eigener Reihenfolge** (gedrückt halten und ziehen), Set & Nummer, Pokédex, Wert, Name. Gruppieren nach **eigenen Abteilungen** (z. B. „Ordner 1“, „Tauschkarten“; anlegen mit „+ Neue Abteilung“, umbenennen/löschen über „⋯“ am Abschnitt – beim Löschen bleiben die Karten), Set oder Liste. „Aus der Sammlung entfernen“ in der Kartenansicht.
- **Mehrere Karten auf einmal** (Sammlung, Liste, Suche): „Auswählen“, Karten antippen (in der Suche auch über mehrere Suchen), unten „Alle“ und ein Menü: zur Sammlung, zu einer Liste oder „Neue Liste …“; in der Sammlung außerdem in eine Abteilung und „Entfernen“ (mit „Rückgängig“), in einer Liste „Entfernen“ aus der Liste. Oben Gesamtwert, Bezahlt und Gewinn/Verlust. Sortieren und gruppieren nach Set oder Liste. „+ Karten hinzufügen“: suchen oder Set öffnen und Karten einfach antippen.
- **Listen:** beliebig viele, umbenennen, löschen, sortieren (Dropdown) und per Gedrückt-halten-und-ziehen umordnen – die Listen selbst und die Karten darin. Karten sortieren auch nach Pokédex (hält Entwicklungsreihen zusammen), Set & Nummer, Name, Wert; filtern (fehlend/vorhanden). „+ Hinzufügen“ wie bei der Sammlung; „Auswählen“ markiert mehrere Karten für „Hab ich“ (in die Sammlung) oder „Entfernen“. Haken an einer Karte = in der Sammlung.
- **Updates:** Die App prüft beim Öffnen und bei jeder Rückkehr, ob es eine neue Version gibt, und lädt dann neu – auch als iPhone-App vom Home-Bildschirm.
- **Marktwert:** Cardmarket-Trend aus TCGdex (alle Sprachen & Zustände gemischt), 24 h zwischengespeichert. Der Cardmarket-Link in der Kartenansicht filtert auf die Sprache der Karte (Deutsch, Englisch …) ab Excellent.
- **Alte Checkliste übernehmen:** unter „Mehr“. Jede Gruppe wird eine Liste, abgehakte Karten kommen mit „Mein Preis“ als Kaufpreis in die Sammlung.
- **App & offline:** iPhone: Safari → Teilen → „Zum Home-Bildschirm“. Der Service Worker speichert App und alle einmal gesehenen Kartenbilder.
- **Fehler:** verständliche Hinweise unten statt Pop-ups (`core/errors.js` übersetzt Fehler, `ui/components/toast.js` zeigt sie). Sync versucht es bei Netz-/Server-Problemen automatisch erneut (10 s → 5 min), zeigt „Offline“ an und hält einzelne abgelehnte Einträge zurück, statt alles zu blockieren. Ein falscher Schlüssel leert nie das Gerät. Kann das Gerät nicht speichern, bietet die App sofort einen Export an. Suche, Sets und Preise haben „Nochmal“.
- **Scannen:** Karte fotografieren, die App erkennt sie und zeigt sie mit Cardmarket-Preis – ein Tipp, und sie ist in der Sammlung (siehe [Scannen](#scannen)).

## Aufbau

```
frontend/                  App für GitHub Pages (ES-Module, kein Build-Schritt)
  index.html, sw.js, manifest.webmanifest, icon.png, css/
  js/main.js               Composition Root: erzeugt und verbindet alle Teile
  js/config.js             feste Einstellungen
  js/core/                 Werkzeuge: DOM, Formatieren, Speicher, HTTP, Dateien
  js/data/                 Zugriff auf externe APIs: TCGdex, eigenes Backend
  js/domain/               reine Fachlogik: Karte, Preis, Sortierung, Scan-Zuordnung
  js/services/             Anwendungslogik: lokaler Speicher, Sammlung, Listen, Preise, Sets, Katalog, Sync, Scanner, Sicherung, Import
  js/ui/                   App-Hülle, Router, Komponenten, Ansichten
  test/                    Tests ohne Netz: node frontend/test/<scan|catalog|profiles|collection>.test.mjs
backend/                   Cloudflare Worker + D1-Datenbank
  src/index.js             Composition Root
  src/http/                Router, Antworten (CORS), Schlüssel-Prüfung
  src/controllers/         HTTP ↔ Service
  src/services/            Abgleich-Logik, Karten-Scanner (Workers AI)
  src/repositories/        SQL pro Tabelle
  src/validation/          Prüfung eingehender Daten
  migrations/              Datenbank-Schema
  scripts/                 Personen anlegen, Listen der alten Checkliste übernehmen
  test/smoke.mjs           Test gegen ein laufendes Backend (inkl. Trennung zwischen Personen und Scan)
.github/workflows/pages.yml    veröffentlicht frontend/ von main und develop auf GitHub Pages
.github/workflows/backend.yml  veröffentlicht backend/ von main bzw. develop bei Cloudflare (Migrationen + Worker)
```

Erweitern: neue Ansicht → Datei in `ui/views/` und in `ui/app.js` eintragen. Neue Datenart → Repository in `backend/src/repositories/`, Regel in `validation/changeValidator.js`, Eintrag in `backend/src/index.js` und `ENTITY_TYPES` im Frontend; die Sync-Logik bleibt unverändert.

## Live & Dev (Branches)

| Branch | App | Backend + Datenbank |
| --- | --- | --- |
| `main` – nur Fertiges, Getestetes | <https://pokekiste.app/> | `pokemon-sammlung` |
| `develop` – in Arbeit, zum Testen | <https://pokekiste.app/dev/> (grauer Kopf, „· DEV“) | `pokemon-sammlung-dev` |

Domain `pokekiste.app` (bei Cloudflare gekauft): DNS bei Cloudflare – `CNAME @` und `CNAME www` → `kingbob4real.github.io`, **nur DNS** (graue Wolke, sonst bekommt GitHub kein Zertifikat); in GitHub unter Settings → Pages als Custom domain eingetragen. Die alte github.io-Adresse leitet automatisch weiter.

Ablauf: auf `develop` arbeiten und pushen → in der Dev-App testen → fertig: `develop` in `main` mergen und pushen → live.

```bash
git switch develop                     # arbeiten, committen, git push
git switch main && git merge develop && git push && git switch develop   # Release
```

Die Dev-App hat eigene Daten (eigene Datenbank, eigener Speicher im Browser) – Testen dort berührt die echte Sammlung nie. Echte Daten zum Testen: in der Live-App unter „Mehr“ exportieren, in der Dev-App importieren. Personen für Dev: `npm run user:add -- "<Name>" --id <id> --key-file ../.keys/<id>.txt --env dev` (gleicher Schlüssel wie live). Alle anderen Befehle mit `--env dev` bzw. `npm run … -- --env dev`.

## Scannen

„📷 Scannen“ in der Sammlung und bei „+ Karten hinzufügen“ öffnet die Kamera mit einem Rahmen in Kartenform (`ui/components/camera.js`). Aufgenommen wird nur der Bereich im Rahmen – die Karte ist groß im Bild, Name und Nummer gut lesbar. Ohne Kamerazugriff (oder per „Foto wählen“) geht es über die Foto-App / Mediathek. Die App verkleinert das Foto (1024 px, JPEG) und schickt es an `POST /scan` → das Backend lässt Name, Nummer, Setgröße und Set-Kürzel von Workers AI lesen (`@cf/google/gemma-4-26b-a4b-it`, ohne „Nachdenken“) → die App sucht die Karte im Katalog auf Deutsch und Englisch (`domain/scanMatch.js`: der Name zählt am meisten, weil die KI die winzige Nummer alter Karten manchmal mit der Pokédex-Nummer verwechselt); englische Karte erkannt → Sprache „Englisch“ vorausgewählt. Eindeutig: Bestätigung mit Preis, Anzahl, Zustand, Sprache, Kaufpreis („Trend übernehmen“) und Listen, dann „In Sammlung“ bzw. „Anzahl erhöhen“ und direkt „Nächste Karte scannen“. Mehrere passen: Auswahl. Nichts erkannt: Suche, vorausgefüllt mit dem Gelesenen.

- **Tageslimit:** 50 Scans pro Person, 150 für alle zusammen (pro Datenbank, also Live und Dev getrennt), Zähler in `scan_usage`. Ein Scan kostet gemessen ~7 Neurons, der Gratis-Tarif hat 10.000 pro Tag für das ganze Cloudflare-Konto – beide Limits zusammen nutzen höchstens ein Fünftel davon. Werte in `backend/src/config.js`.
- **Datenschutz:** Das Foto geht nur zur Erkennung an Cloudflare Workers AI und wird nirgends gespeichert – weder auf dem Gerät noch in der Datenbank.
- Scannen braucht Internet und einen Sync-Schlüssel (das Backend zählt pro Person).
- **Was wurde gelesen?** Jeder Scan schreibt das Erkannte (Name, Nummer, Kürzel – kein Foto) ins Log: Cloudflare-Dashboard → Workers → `pokemon-sammlung(-dev)` → Logs (3 Tage).

## Datenbank (Cloudflare D1, SQLite)

| Tabelle | Inhalt |
| --- | --- |
| `cards` | Kartendaten: Name, Nummer, Set, Bild |
| `collection` | meine Sammlung: Anzahl, Zustand, Sprache, Kaufpreis |
| `lists` | eigene Listen |
| `list_items` | welche Karte in welcher Liste |
| `users` | Personen: Name und SHA-256-Hash ihres Schlüssels |
| `scan_usage` | Scans pro Person und Tag (fürs Tageslimit) |
| `sections` | eigene Abteilungen der Sammlung (Name, Position); in `collection` dazu `section` und `position` (eigene Reihenfolge) |
| `sessions` | angemeldete Geräte (Hash der Sitzung → Person); dazu in `users`: Passwort-Hash (PBKDF2), Fehlversuche |

Sammlung, Listen und Listeneinträge gehören je einer Person (`user_id`). Jede Zeile hat `updated` (neueste Änderung gewinnt), `deleted` und `rev` (Server-Stand). Ein Gerät schickt `POST /sync` mit seinen Änderungen, seinem letzten Stand und dem Schlüssel der Person und bekommt alles Neue dieser Person zurück. Gratis-Tarif: 500 MB pro Datenbank, 7 Tage Wiederherstellung (Time Travel).

## Personen & Schlüssel

Schlüssel liegen nur lokal in `.keys/<id>.txt` (nicht in Git); in der Datenbank steht nur ihr Hash. In der App meldet man sich per Antippen an („Wer sammelt?“); der Schlüssel ist der Notfall-Zugang unter „Mehr“ → „Speichern & synchronisieren“. Neue Personen erscheinen automatisch in der Auswahl. Im Ordner `backend/`:

```bash
npm run user:add -- "Max"                      # neue Person, Schlüssel in .keys/max.txt
npm run user:add -- "Max" --id max             # gleiche ID nochmal = neuer Schlüssel (alter ist ungültig, Daten bleiben)
npm run user:list
# Passwort vergessen? Zurücksetzen (Person ist danach wieder ohne Passwort; mit --env dev für Dev):
npx wrangler d1 execute DB --remote --command "UPDATE users SET password_hash = NULL, failed_logins = 0 WHERE id = 'lucas'"
node scripts/import-legacy-lists.mjs <backend-adresse> ../.keys/<id>.txt   # Listen der alten Checkliste für diese Person
```

Bei Änderungen an `frontend/css/style.css` oder `frontend/js/main.js` die Versionsnummer `?v=` in `index.html` hochzählen.

## Backend automatisch veröffentlichen (GitHub Action)

Jeder Push mit Änderungen in `backend/` spielt neue Datenbank-Migrationen ein und veröffentlicht den Worker (`main` → live, `develop` → Dev). Dafür braucht GitHub einmalig einen Cloudflare-API-Token:

1. Cloudflare-Dashboard → oben rechts Profil → **My Profile → API Tokens → Create Token**.
2. Vorlage **„Edit Cloudflare Workers“** → **Use template**.
3. Unter *Permissions* eine Zeile hinzufügen: **Account · D1 · Edit**.
4. *Account Resources*: dein Konto; *Zone Resources*: **All zones** (oder egal, Zonen werden nicht gebraucht) → **Continue to summary → Create Token** → Token kopieren (wird nur einmal angezeigt).
5. GitHub → Repo **pokemon-sammlung → Settings → Secrets and variables → Actions → New repository secret**: Name `CLOUDFLARE_API_TOKEN`, Wert = Token.
6. Testen: **Actions → „Backend zu Cloudflare“ → Run workflow**.

Ohne Secret läuft der Workflow durch, warnt nur und veröffentlicht nichts. Von Hand geht es weiterhin mit `npm run db:migrate` und `npm run deploy` im Ordner `backend/`.

## Backend einrichten (einmalig)

Voraussetzung: kostenloses Cloudflare-Konto. Im Ordner `backend/`:

```bash
npm install
npx wrangler login
npx wrangler d1 create pokemon-sammlung        # ausgegebene database_id in wrangler.toml eintragen
npm run db:migrate
npm run deploy                                 # gibt die Backend-Adresse aus (…workers.dev)
npm run user:add -- "Dein Name" --id owner
node test/smoke.mjs https://<backend-adresse> "$(cat ../.keys/owner.txt)"
```

Lokal: `npm run db:migrate:local`, `node scripts/add-user.mjs "Test A" --local` (und „Test B“), `npm run dev`, dann `node test/smoke.mjs http://127.0.0.1:8787 <Schlüssel A> <Schlüssel B>`. Frontend: im Ordner `frontend/` z. B. `python -m http.server`.

Kartenbilder und Daten stammen von TCGdex. Fan-Projekt ohne Verbindung zu Nintendo, Creatures, GAME FREAK, The Pokémon Company oder Cardmarket.
