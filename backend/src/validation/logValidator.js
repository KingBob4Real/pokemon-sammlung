// Prüft das Protokoll, das ein Gerät schickt: { device, person, version, ua, entries: [{ t, l, a, m, d }] }.
// Alles wird gekürzt statt abgelehnt – ein Protokoll soll ankommen, auch wenn ein Eintrag zu lang ist.
export const MAX_LOG_ENTRIES = 100;
export const MAX_LOG_BYTES = 64 * 1024;
const LEVELS = ["info", "warn", "error"];

const text = (v, max) => (typeof v === "string" ? v.slice(0, max) : null);
const small = (v, max) => {
  if (v == null) return null;
  try {
    const s = JSON.stringify(v);
    return s.length <= max ? v : `${s.slice(0, max)}…`;
  } catch {
    return null;
  }
};

export function parseDeviceLog(body) {
  if (!Array.isArray(body?.entries)) return { ok: false, status: 400, error: "entries fehlt" };
  if (body.entries.length > MAX_LOG_ENTRIES) return { ok: false, status: 413, error: `Höchstens ${MAX_LOG_ENTRIES} Einträge pro Anfrage` };
  return {
    ok: true,
    device: text(body.device, 40),
    person: text(body.person, 40),
    version: text(body.version, 20),
    ua: text(body.ua, 200),
    entries: body.entries
      .filter((e) => e && typeof e === "object")
      .map((e) => ({
        t: Number.isSafeInteger(e.t) ? e.t : null,
        level: LEVELS.includes(e.l) ? e.l : "info",
        area: text(e.a, 30),
        msg: text(e.m, 500),
        data: small(e.d, 1000),
      })),
  };
}
