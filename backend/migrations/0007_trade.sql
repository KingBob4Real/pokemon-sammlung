-- Tauschen pro Karte: NULL = automatisch (wird angeboten, wenn doppelt), 1 = anbieten (auch einzeln), 0 = behalten.
ALTER TABLE collection ADD COLUMN trade INTEGER;
