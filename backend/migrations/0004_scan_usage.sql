-- Karten-Scanner: Scans pro Person und Tag (UTC). Grundlage fürs Tageslimit,
-- damit der Gratis-Tarif von Workers AI nie überschritten wird. Fotos werden nicht gespeichert.
CREATE TABLE scan_usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,              -- z. B. 2026-10-08
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, day)
);
