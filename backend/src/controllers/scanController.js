import { log } from "../http/log.js";
import { error, json } from "../http/responses.js";
import { parseScanRequest } from "../validation/scanValidator.js";

// HTTP-Schicht für den Karten-Scanner: Foto prüfen, erkennen lassen, Antwort bauen. Jede Antwort nennt,
// wie viele Scans heute noch gehen ({ remaining }) – die App zeigt das unter dem Auslöser.
export class ScanController {
  constructor(scanService) {
    this.scanService = scanService;
  }

  async usage(user) {
    return json({ remaining: await this.scanService.remaining(user) });
  }

  async scan(request, user) {
    let body;
    try {
      body = await request.json();
    } catch {
      return error(400, "Kein gültiges JSON");
    }
    const parsed = parseScanRequest(body);
    if (!parsed.ok) return error(parsed.status, parsed.error);
    const result = await this.scanService.scan(user, parsed.image);
    if (result.limited) {
      log("warn", "scan_limited", { user: user.id });
      return error(429, "Tageslimit für Scans erreicht – morgen geht es weiter.", { remaining: 0 });
    }
    if (result.unavailable) {
      log("error", "scan_unavailable", { user: user.id, remaining: result.remaining });
      return error(503, "Erkennung gerade nicht möglich.", { remaining: result.remaining });
    }
    const r = result.recognized ?? {};
    log("info", "scan", { user: user.id, remaining: result.remaining, name: Boolean(r.name), number: Boolean(r.number), setCode: Boolean(r.setCode), confidence: r.confidence ?? null });
    return json(result);
  }
}
