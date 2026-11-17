import { log } from "./log.js";
import { error } from "./responses.js";

// Angemeldete Person je Anfrage – der Router schreibt sie ins Protokoll
export const requestUser = new WeakMap();

export const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

// Art des Schlüssels fürs Protokoll, ohne ihn zu verraten: Sitzung (24 Zeichen) oder Sync-Schlüssel (8)
export const keyKind = (key) => (!key ? "none" : key.replace(/[^A-Za-z0-9]/g, "").length >= 20 ? "session" : "sync_key");

// Lässt nur Anfragen mit „Authorization: Bearer <Schlüssel einer Person>“ durch
// und gibt die Person an den Handler weiter: handler(request, user).
export function requireUser(users, handler) {
  return async (request) => {
    const key = bearer(request);
    const user = await users.findByKey(key);
    if (!user) {
      // Häufigster Grund: die Sitzung des Geräts gibt es nicht mehr (abgemeldet) – die App meldet sich dann neu an
      log("warn", "auth_failed", { path: new URL(request.url).pathname, reason: key ? "unknown_key" : "missing_key", key: keyKind(key) });
      return error(401, "Falscher Sync-Schlüssel");
    }
    requestUser.set(request, user);
    return handler(request, user);
  };
}
