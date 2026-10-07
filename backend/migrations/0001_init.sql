-- Datenbank der Pokémon-Sammlung (Cloudflare D1 = SQLite).
-- Jede synchronisierte Tabelle hat updated (Zeitstempel vom Gerät, neueste Änderung gewinnt),
-- deleted (gelöscht, bleibt als Markierung für andere Geräte) und rev (Server-Stand fürs Abholen).

-- Stammdaten der Karten aus TCGdex. Sammlung und Listen verweisen nur per card_id hierauf.
CREATE TABLE cards (
  id TEXT PRIMARY KEY,          -- TCGdex-ID, z. B. sv03.5-199
  name TEXT NOT NULL,           -- deutscher Name
  number TEXT NOT NULL,         -- Nummer im Set, z. B. 199
  set_id TEXT NOT NULL,         -- z. B. sv03.5
  set_name TEXT NOT NULL,       -- z. B. 151
  set_total INTEGER,            -- offizielle Setgröße, bei Promos NULL
  image TEXT                    -- Bild-Adresse ohne Endung (…/low.webp, …/high.webp)
);

-- Meine Sammlung: ein Eintrag pro Karte. Anzahl 0 = nicht (mehr) vorhanden, Angaben bleiben erhalten.
CREATE TABLE collection (
  card_id TEXT PRIMARY KEY,
  qty INTEGER,
  condition TEXT,               -- Mint, Near Mint, Excellent …
  language TEXT,                -- Deutsch, Englisch …
  paid REAL,                    -- Kaufpreis pro Stück in €
  added INTEGER,                -- wann hinzugefügt (ms)
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL
);

-- Eigene Listen (Wunschliste, Checklisten …)
CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  name TEXT,
  created INTEGER,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL
);

-- Welche Karte steht in welcher Liste. id = <list_id>:<card_id>
CREATE TABLE list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  added INTEGER,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL
);

CREATE INDEX collection_rev ON collection (rev);
CREATE INDEX lists_rev ON lists (rev);
CREATE INDEX list_items_rev ON list_items (rev);
CREATE INDEX list_items_list ON list_items (list_id);

-- Zähler für den Server-Stand (rev)
CREATE TABLE meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
