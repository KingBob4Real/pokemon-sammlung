-- Eigene Reihenfolge per Drag & Drop: Position von Listen und von Karten in Listen.
-- Kommazahl, damit beim Verschieben nur der verschobene Eintrag eine neue Position braucht
-- (Mitte zwischen den Nachbarn). Leer = Erstell- bzw. Hinzufüge-Zeitpunkt zählt.
ALTER TABLE lists ADD COLUMN position REAL;
ALTER TABLE list_items ADD COLUMN position REAL;
