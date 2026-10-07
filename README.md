# Pokémon-Sammlung

Meine Kartensammlung als iPhone-taugliche Web-App: alle deutschen Karten suchen, Sammlung pflegen, eigene Listen anlegen, Marktwerte sehen. Läuft offline und gleicht sich über ein kleines Cloudflare-Backend zwischen Geräten ab.

- **Suche:** alle deutschen Karten über die [TCGdex-API](https://tcgdex.dev), nach Name (`Glurak`) und/oder Nummer (`199`, `199/165`), oder Set für Set. TCG-Pocket-Karten sind ausgeblendet.
- **Sammlung:** pro Karte Anzahl, Zustand, Sprache und Kaufpreis. Oben Gesamtwert, Bezahlt und Gewinn/Verlust.
- **Listen:** beliebig viele, umbenennen, löschen, sortieren (Reihenfolge, Set & Nummer, Name, Wert), filtern (fehlend/vorhanden). Eine Karte kann in mehreren Listen sein; „vorhanden“ heißt: in der Sammlung.
- **Marktwert:** Cardmarket-Trend aus TCGdex (alle Sprachen & Zustände gemischt), 24 h zwischengespeichert. Der Cardmarket-Link in der Kartenansicht filtert auf deutsche Karten ab Excellent.
- **Alte Checkliste übernehmen:** unter „Mehr“. Jede Gruppe wird eine Liste, abgehakte Karten kommen mit „Mein Preis“ als Kaufpreis in die Sammlung.
- **App & offline:** iPhone: Safari → Teilen → „Zum Home-Bildschirm“. Der Service Worker (`sw.js`) speichert Seite und alle einmal gesehenen Kartenbilder.

## Aufbau

| Datei | Inhalt |
| --- | --- |
| `index.html`, `style.css`, `app.js` | die App (GitHub Pages, kein Build-Schritt) |
| `sw.js`, `manifest.webmanifest`, `icon.png` | Offline-Betrieb und Home-Bildschirm |
| `worker/` | Sync-Backend: Cloudflare Worker + D1-Datenbank |

Alle Daten sind Dokumente (`c:<karte>` Sammlung, `l:<liste>` Liste, `m:<liste>:<karte>` Karte in Liste). Sie liegen im Browser (`localStorage`) und werden mit `POST /sync` abgeglichen; pro Dokument gewinnt die neueste Änderung. Geschützt ist das Backend über einen persönlichen Schlüssel (unter „Mehr“ erzeugen).

Bei Änderungen an `style.css` oder `app.js` die Versionsnummer `?v=` in `index.html` hochzählen, sonst mischt das Handy alte und neue Dateien.

## Backend einrichten (einmalig)

Voraussetzung: kostenloses Cloudflare-Konto. Im Ordner `worker/`:

```bash
npm install
npx wrangler login
npx wrangler d1 create pokemon-sammlung        # ausgegebene database_id in wrangler.toml eintragen
npx wrangler d1 execute pokemon-sammlung --remote --file schema.sql
npx wrangler secret put SYNC_KEY               # Schlüssel aus der App („Mehr“ → „Neuen Schlüssel erzeugen“)
npx wrangler deploy                            # gibt die Backend-Adresse aus (…workers.dev)
node smoke.mjs https://<backend-adresse> <SCHLÜSSEL>
```

Lokal testen: `.dev.vars` mit `SYNC_KEY="TEST-TEST-TEST-TEST-TEST"` anlegen, `npx wrangler d1 execute pokemon-sammlung --local --file schema.sql`, dann `npx wrangler dev` und `node smoke.mjs`.

Kartenbilder und Daten stammen von TCGdex. Fan-Projekt ohne Verbindung zu Nintendo, Creatures, GAME FREAK, The Pokémon Company oder Cardmarket.
