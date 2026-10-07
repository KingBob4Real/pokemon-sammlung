-- Mehrere Personen: jede Person hat einen eigenen Schlüssel und eine eigene Sammlung.
-- Gespeichert wird nur der SHA-256-Hash des Schlüssels, nie der Schlüssel selbst.
-- Bestehende Daten gehören danach der Person mit der ID „owner“.
CREATE TABLE users (
  id TEXT PRIMARY KEY,            -- kurz, z. B. owner, max
  name TEXT NOT NULL,             -- Anzeigename
  key_hash TEXT NOT NULL UNIQUE,  -- SHA-256 des Schlüssels (hex)
  created INTEGER NOT NULL
);

-- SQLite kann den Primärschlüssel nicht ändern → Tabellen neu anlegen und Daten übernehmen

CREATE TABLE collection_new (
  user_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  qty INTEGER,
  condition TEXT,
  language TEXT,
  paid REAL,
  added INTEGER,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);
INSERT INTO collection_new SELECT 'owner', card_id, qty, condition, language, paid, added, updated, deleted, rev FROM collection;
DROP TABLE collection;
ALTER TABLE collection_new RENAME TO collection;

CREATE TABLE lists_new (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT,
  created INTEGER,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
INSERT INTO lists_new SELECT 'owner', id, name, created, updated, deleted, rev FROM lists;
DROP TABLE lists;
ALTER TABLE lists_new RENAME TO lists;

CREATE TABLE list_items_new (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,               -- <list_id>:<card_id>
  list_id TEXT NOT NULL,
  card_id TEXT NOT NULL,
  added INTEGER,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
INSERT INTO list_items_new SELECT 'owner', id, list_id, card_id, added, updated, deleted, rev FROM list_items;
DROP TABLE list_items;
ALTER TABLE list_items_new RENAME TO list_items;

CREATE INDEX collection_user_rev ON collection (user_id, rev);
CREATE INDEX lists_user_rev ON lists (user_id, rev);
CREATE INDEX list_items_user_rev ON list_items (user_id, rev);
CREATE INDEX list_items_user_list ON list_items (user_id, list_id);
