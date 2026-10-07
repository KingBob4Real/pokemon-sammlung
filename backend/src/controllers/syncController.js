import { error, json } from "../http/responses.js";
import { parseSyncRequest } from "../validation/changeValidator.js";

// HTTP-Schicht für den Abgleich: Anfrage lesen und prüfen, Service aufrufen, Antwort bauen.
export class SyncController {
  constructor(syncService) {
    this.syncService = syncService;
  }

  async sync(request) {
    let body;
    try {
      body = await request.json();
    } catch {
      return error(400, "Kein gültiges JSON");
    }
    const parsed = parseSyncRequest(body);
    if (!parsed.ok) return error(parsed.status, parsed.error);
    return json(await this.syncService.sync(parsed.since, parsed.changes));
  }
}
