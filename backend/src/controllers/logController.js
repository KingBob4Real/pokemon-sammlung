import { bearer } from "../http/auth.js";
import { log } from "../http/log.js";
import { error, json } from "../http/responses.js";
import { MAX_LOG_BYTES, parseDeviceLog } from "../validation/logValidator.js";

/**
 * POST /log: Protokoll eines Geräts (Warnungen und Fehler, auf Wunsch alles) ins Protokoll des Backends schreiben –
 * so stehen Handy und Browser nebeneinander in den Cloudflare-Logs (event = "device"). Gespeichert wird nichts.
 * Geht auch ohne gültige Anmeldung: gerade ein Gerät, dessen Anmeldung kaputt ist, soll melden können. Dann steht
 * user = null und person = was das Gerät von sich sagt.
 */
export class LogController {
  constructor(users) {
    this.users = users;
  }

  async device(request) {
    if (Number(request.headers.get("Content-Length") || 0) > MAX_LOG_BYTES) return error(413, "Protokoll zu groß");
    let body;
    try {
      body = await request.json();
    } catch {
      return error(400, "Kein gültiges JSON");
    }
    const parsed = parseDeviceLog(body);
    if (!parsed.ok) return error(parsed.status, parsed.error);
    const key = bearer(request);
    const user = key ? await this.users.findByKey(key) : null;
    for (const e of parsed.entries) {
      log(e.level, "device", { user: user?.id ?? null, person: parsed.person, device: parsed.device, version: parsed.version, ua: parsed.ua, t: e.t, area: e.area, msg: e.msg, data: e.data });
    }
    return json({ ok: true, count: parsed.entries.length });
  }
}
