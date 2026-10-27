// Personen (Tabelle users) und ihre Geräte-Sitzungen (Tabelle sessions).
// Gespeichert sind nur Hashes: vom Sync-Schlüssel und von Sitzungen.

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

  // → [{ id, name }] in der Reihenfolge, in der die Personen angelegt wurden
  async all() {
    const { results } = await this.db.prepare("SELECT id, name FROM users ORDER BY created").all();
    return results;
  }

  // → { id, name }
  find(id) {
    return this.db.prepare("SELECT id, name FROM users WHERE id = ?1").bind(id).first();
  }

  rename(id, name) {
    return this.db.prepare("UPDATE users SET name = ?2 WHERE id = ?1").bind(id, name).run();
  }

  // Abmelden: genau diese Sitzung beenden
  endSession(tokenHash) {
    return this.db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
  }

  // Sitzung für dieses Gerät anlegen
  startSession(id, tokenHash, now) {
    return this.db.prepare("INSERT INTO sessions (token_hash, user_id, created) VALUES (?1, ?2, ?3)").bind(tokenHash, id, now).run();
  }
}
