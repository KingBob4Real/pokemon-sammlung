import { hashKey } from "../repositories/userRepository.js";

const ROUNDS = 20000; // PBKDF2: ~4 ms – passt in die 10 ms Rechenzeit des Gratis-Tarifs
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const random = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
// Sitzung im selben Format wie ein Sync-Schlüssel (XXXX-XXXX-…), nur länger: 24 Zeichen = 120 Bit.
// So behandelt die App sie überall gleich (z. B. das Feld „Sync-Schlüssel“ unter „Mehr“).
const KEY_CHARS = "ABCDEFGHJKMNPQRSTVWXYZ0123456789";
const newSession = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => KEY_CHARS[b & 31]).join("").match(/.{4}/g).join("-");

async function pbkdf2(password, salt, rounds) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: rounds }, key, 256));
}

export async function hashPassword(password) {
  const salt = random(16);
  return `pbkdf2$${ROUNDS}$${salt}$${await pbkdf2(password, salt, ROUNDS)}`;
}

export async function verifyPassword(password, stored) {
  const [, rounds, salt, hash] = String(stored).split("$");
  return (await pbkdf2(password, salt, Number(rounds))) === hash;
}

/**
 * „Wer sammelt?“: Personen auflisten, per Antippen anmelden (mit Passwort, falls gesetzt),
 * Passwort und Namen ändern. Eine Anmeldung = eine Sitzung für ein Gerät; sie gilt wie der Sync-Schlüssel.
 */
export class AuthService {
  constructor(users) {
    this.users = users;
  }

  people() {
    return this.users.all();
  }

  // Passwort der Person prüfen (mit Sperre nach zu vielen Fehlversuchen) → null wenn ok, sonst { status, error }
  async #check(user, password, now) {
    if (!user.password_hash) return null;
    if (user.failed_logins >= MAX_FAILS && now - user.failed_at < LOCK_MS) return { status: 429, error: "Zu viele falsche Versuche – in 15 Minuten nochmal." };
    if (!password) return { status: 401, error: "Passwort fehlt." };
    if (await verifyPassword(password, user.password_hash)) return null;
    await this.users.loginFailed(user.id, now);
    return { status: 401, error: "Falsches Passwort." };
  }

  // → { token, user: { id, name }, firstLogin } | { status, error }
  // firstLogin: noch nie per Antippen angemeldet und ohne Passwort → die App bietet an, eins festzulegen
  async login(id, password, now = Date.now()) {
    const user = await this.users.find(id);
    if (!user) return { status: 404, error: "Diese Person gibt es nicht." };
    const denied = await this.#check(user, password, now);
    if (denied) return denied;
    const token = newSession();
    await this.users.startSession(id, await hashKey(token), now);
    return { token, user: { id: user.id, name: user.name }, firstLogin: !user.password_hash && !user.sessions };
  }

  // Passwort festlegen, ändern oder entfernen (leer). Gibt es schon eins, nur mit dem alten.
  // Andere Geräte dieser Person werden abgemeldet, dieses bleibt angemeldet. → null | { status, error }
  async setPassword(user, password, oldPassword, now = Date.now()) {
    const denied = await this.#check(await this.users.find(user.id), oldPassword, now);
    if (denied) return denied.error === "Passwort fehlt." ? { status: 401, error: "Bitte das bisherige Passwort angeben." } : denied;
    await this.users.setPassword(user.id, password ? await hashPassword(password) : null, user.session);
    return null;
  }

  rename(user, name) {
    return this.users.rename(user.id, name);
  }
}
