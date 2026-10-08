// Personen (Tabelle users) und ihre Geräte-Sitzungen (Tabelle sessions).
// Gespeichert sind nur Hashes: vom Sync-Schlüssel, von Sitzungen und vom Passwort.

// Schlüssel → Hash (hex). Wird auch vom Skript zum Anlegen neuer Personen benutzt.
export async function hashKey(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  // Sync-Schlüssel oder Sitzung → { id, name, session } oder null (session = Hash der Sitzung, beim Schlüssel null)
  async findByKey(key) {
    if (!key || key.length > 200) return null;
    return this.db
      .prepare(
        `SELECT id, name, NULL AS session FROM users WHERE key_hash = ?1
         UNION ALL SELECT u.id, u.name, s.token_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1
         LIMIT 1`
      )
      .bind(await hashKey(key))
      .first();
  }

  // → [{ id, name, locked }] in der Reihenfolge, in der die Personen angelegt wurden
  async all() {
    const { results } = await this.db.prepare("SELECT id, name, password_hash IS NOT NULL AS locked FROM users ORDER BY created").all();
    return results.map((r) => ({ id: r.id, name: r.name, locked: Boolean(r.locked) }));
  }

  // → { id, name, password_hash, failed_logins, failed_at, sessions } (sessions = Anzahl angemeldeter Geräte)
  find(id) {
    return this.db
      .prepare("SELECT id, name, password_hash, failed_logins, failed_at, (SELECT COUNT(*) FROM sessions WHERE user_id = ?1) AS sessions FROM users WHERE id = ?1")
      .bind(id)
      .first();
  }

  rename(id, name) {
    return this.db.prepare("UPDATE users SET name = ?2 WHERE id = ?1").bind(id, name).run();
  }

  // Neues Passwort (oder null = keins) und alle anderen Sitzungen dieser Person beenden
  setPassword(id, passwordHash, keepSession) {
    return this.db.batch([
      this.db.prepare("UPDATE users SET password_hash = ?2, failed_logins = 0 WHERE id = ?1").bind(id, passwordHash),
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?1 AND token_hash IS NOT ?2").bind(id, keepSession),
    ]);
  }

  loginFailed(id, now) {
    return this.db.prepare("UPDATE users SET failed_logins = failed_logins + 1, failed_at = ?2 WHERE id = ?1").bind(id, now).run();
  }

  // Anmeldung geklappt: Fehlversuche vergessen, Sitzung für dieses Gerät anlegen
  startSession(id, tokenHash, now) {
    return this.db.batch([
      this.db.prepare("UPDATE users SET failed_logins = 0 WHERE id = ?1").bind(id),
      this.db.prepare("INSERT INTO sessions (token_hash, user_id, created) VALUES (?1, ?2, ?3)").bind(tokenHash, id, now),
    ]);
  }
}
