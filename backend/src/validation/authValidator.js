// Prüft Anfragen rund ums Anmelden.
const str = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max;

// { id }
export function parseLogin(body) {
  if (!str(body?.id, 1, 40)) return { ok: false, status: 400, error: "Ungültige Anmeldung." };
  return { ok: true, id: body.id };
}

// { name }
export function parseName(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!str(name, 1, 40)) return { ok: false, status: 400, error: "Der Name braucht 1 bis 40 Zeichen." };
  return { ok: true, name };
}
