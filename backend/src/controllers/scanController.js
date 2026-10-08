import { error, json } from "../http/responses.js";
import { parseScanRequest } from "../validation/scanValidator.js";

// HTTP-Schicht für den Karten-Scanner: Foto prüfen, erkennen lassen, Antwort bauen.
export class ScanController {
  constructor(scanService) {
    this.scanService = scanService;
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
    if (result.limited) return error(429, "Tageslimit für Scans erreicht – morgen geht es weiter.");
    if (result.unavailable) return error(503, "Erkennung gerade nicht möglich.");
    return json(result);
  }
}
