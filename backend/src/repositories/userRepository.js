// Personen (Tabelle users). Gespeichert ist nur der SHA-256-Hash des Schlüssels.

// Schlüssel → Hash (hex). Wird auch vom Skript zum Anlegen neuer Personen benutzt.
export async function hashKey(key) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class UserRepository {
  constructor(db) {
    this.db = db;
  }

  // → { id, name } oder null
  async findByKey(key) {
    if (!key || key.length > 200) return null;
    return this.db.prepare("SELECT id, name FROM users WHERE key_hash = ?1").bind(await hashKey(key)).first();
  }
}
