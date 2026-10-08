-- Selbst eingetragener Cardmarket-Preis „ab“ (Deutsch/Englisch, ab Excellent) pro Karte der Sammlung und wann er eingetragen wurde.
-- Leer = Näherung aus der öffentlichen Cardmarket-Preisliste.
ALTER TABLE collection ADD COLUMN cm_low REAL;
ALTER TABLE collection ADD COLUMN cm_low_at INTEGER;
