-- Kartendaten pro Person statt für alle gemeinsam: Name, Nummer, Set und Bild schickt jedes Gerät mit; bisher gewann,
-- wer zuletzt schrieb – auch eine veraltete App oder eine andere Person. Jetzt betrifft das nur noch die eigene Sammlung.
-- SQLite kann den Primärschlüssel nicht ändern → Tabelle neu anlegen; jede Person bekommt die Karten, die sie nutzt.
CREATE TABLE cards_new (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,             -- TCGdex-ID, z. B. sv03.5-199
  name TEXT NOT NULL,
  number TEXT NOT NULL,
  set_id TEXT NOT NULL,
  set_name TEXT NOT NULL,
  set_total INTEGER,
  image TEXT,
  PRIMARY KEY (user_id, id)
);
INSERT INTO cards_new
  SELECT u.user_id, k.id, k.name, k.number, k.set_id, k.set_name, k.set_total, k.image
  FROM (SELECT user_id, card_id FROM collection UNION SELECT user_id, card_id FROM list_items) u
  JOIN cards k ON k.id = u.card_id;
DROP TABLE cards;
ALTER TABLE cards_new RENAME TO cards;
