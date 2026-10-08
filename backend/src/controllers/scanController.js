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
    if (result.limited) return error(429, "Tageslimit für Scans erreicht – morgen geht es weiter.", { remaining: 0 });
    if (result.unavailable) return error(503, "Erkennung gerade nicht möglich.", { remaining: result.remaining });
    return json(result);
  }
}
