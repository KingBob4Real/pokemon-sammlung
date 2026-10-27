import { hashKey } from "../repositories/userRepository.js";

// Sitzung im selben Format wie ein Sync-Schlüssel (XXXX-XXXX-…), nur länger: 24 Zeichen = 120 Bit.
// So behandelt die App sie überall gleich (z. B. das Feld „Sync-Schlüssel“ unter „Mehr“).
const KEY_CHARS = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
const newSession = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => KEY_CHARS[b & 31]).join("").match(/.{4}/g).join("-");

/**
 * „Wer sammelt?“: Personen auflisten, per Antippen anmelden, Namen ändern.
 * Eine Anmeldung = eine Sitzung für ein Gerät; sie gilt wie der Sync-Schlüssel.
 */
export class AuthService {
  constructor(users) {
    this.users = users;
  }

  people() {
    return this.users.all();
  }

  // → { token, user: { id, name } } | { status, error }
  // ponytail: ohne Passwort – wer die App öffnet, kann jede Person antippen und übernehmen.
  async login(id, now = Date.now()) {
    const user = await this.users.find(id);
    if (!user) return { status: 404, error: "Diese Person gibt es nicht." };
    const token = newSession();
    await this.users.startSession(id, await hashKey(token), now);
    return { token, user: { id: user.id, name: user.name } };
  }

  // Dieses Gerät abmelden. Mit dem Sync-Schlüssel angemeldet (session = null): nichts zu beenden, der Schlüssel gilt immer.
  async logout(user) {
    if (user.session) await this.users.endSession(user.session);
  }

  rename(user, name) {
    return this.users.rename(user.id, name);
  }
}
