-- „Wer sammelt?“: anmelden per Antippen (optional mit Passwort) statt mit dem Sync-Schlüssel.
-- Jedes Gerät bekommt eine eigene Sitzung; ein neues Passwort meldet die anderen Geräte dieser Person ab.
-- Der Sync-Schlüssel bleibt gültig (Notfall-Zugang, z. B. wenn das Passwort vergessen ist).
ALTER TABLE users ADD COLUMN password_hash TEXT;              -- pbkdf2$<runden>$<salz>$<hash>, NULL = ohne Passwort
ALTER TABLE users ADD COLUMN failed_logins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN failed_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 der Sitzung (wie beim Schlüssel: nur der Hash wird gespeichert)
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);
