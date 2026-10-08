-- Eigene Abteilungen in der Sammlung (z. B. „Ordner 1“, „Tauschkarten“) und eigene Reihenfolge der Karten.
-- Eine Karte steht in höchstens einer Abteilung. Leer = keine Abteilung bzw. Hinzufüge-Zeitpunkt zählt.
CREATE TABLE sections (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT,
  created INTEGER,
  position REAL,
  updated INTEGER NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX sections_rev ON sections (rev);

ALTER TABLE collection ADD COLUMN section TEXT;
ALTER TABLE collection ADD COLUMN position REAL;
