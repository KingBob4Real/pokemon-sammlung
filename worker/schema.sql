-- Alle Daten der App als Dokumente: Sammlung (card), Listen (list) und Listeneinträge (member).
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  data TEXT,                         -- JSON
  updated INTEGER NOT NULL,          -- Zeitstempel vom Gerät, neueste Änderung gewinnt
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL               -- Server-Zähler: Geräte holen alles mit rev > ihrem letzten Stand
);
CREATE INDEX IF NOT EXISTS docs_rev ON docs (rev);

CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER NOT NULL);
