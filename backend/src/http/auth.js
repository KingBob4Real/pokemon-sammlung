import { error } from "./responses.js";

// Lässt nur Anfragen mit „Authorization: Bearer <Schlüssel einer Person>“ durch
// und gibt die Person an den Handler weiter: handler(request, user).
export function requireUser(users, handler) {
  return async (request) => {
    const key = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const user = await users.findByKey(key);
    return user ? handler(request, user) : error(401, "Falscher Sync-Schlüssel");
  };
}
