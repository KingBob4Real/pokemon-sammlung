import { error } from "./responses.js";

// Lässt nur Anfragen mit „Authorization: Bearer <SYNC_KEY>“ durch. Vergleich in konstanter Zeit.
export function requireKey(key, handler) {
  return (request) => (isAuthorized(request, key) ? handler(request) : error(401, "Falscher Sync-Schlüssel"));
}

function isAuthorized(request, key) {
  if (!key) return false;
  const enc = new TextEncoder();
  const got = enc.encode(request.headers.get("Authorization") || "");
  const want = enc.encode(`Bearer ${key}`);
  return got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}
