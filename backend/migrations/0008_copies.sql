-- Mehrere Exemplare einer Karte mit eigenem Zustand, eigener Sprache und eigenem Kaufpreis, z. B. eins auf Deutsch, eins
-- auf Englisch. JSON-Liste [{ cond, lang, paid }], so lang wie qty. NULL = alle Exemplare gleich (wie bisher: condition,
-- language, paid gelten für alle). condition/language/paid spiegeln immer das erste Exemplar – für Tauschen und ältere Apps.
ALTER TABLE collection ADD COLUMN copies TEXT;
