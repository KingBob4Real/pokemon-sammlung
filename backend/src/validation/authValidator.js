// Prüft Anfragen rund ums Anmelden.
const str = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max;

// { id, password? }
export function parseLogin(body) {
  if (!str(body?.id, 1, 40) || (body.password != null && !str(body.password, 0, 100))) return { ok: false, status: 400, error: "Ungültige Anmeldung." };
  return { ok: true, id: body.id, password: body.password || "" };
}

// { password, oldPassword? } – password leer = Passwort entfernen; oldPassword nötig, wenn es schon eins gibt
export function parsePassword(body) {
  const password = body?.password ?? "";
  const oldPassword = body?.oldPassword ?? "";
  if (!str(password, 0, 100) || (password && password.length < 4)) return { ok: false, status: 400, error: "Das Passwort braucht mindestens 4 Zeichen." };
  if (!str(oldPassword, 0, 100)) return { ok: false, status: 400, error: "Ungültiges altes Passwort." };
  return { ok: true, password, oldPassword };
}

// { name }
export function parseName(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!str(name, 1, 40)) return { ok: false, status: 400, error: "Der Name braucht 1 bis 40 Zeichen." };
  return { ok: true, name };
}
