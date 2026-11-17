import { log } from "../http/log.js";
import { error, json } from "../http/responses.js";
import { parseSyncRequest } from "../validation/changeValidator.js";

// HTTP-Schicht für den Abgleich: Anfrage lesen und prüfen, Service aufrufen, Antwort bauen.
export class SyncController {
  constructor(syncService) {
    this.syncService = syncService;
  }

  async sync(request, user) {
    let body;
    try {
      body = await request.json();
    } catch {
      log("warn", "sync_rejected", { user: user.id, reason: "kein JSON" });
      return error(400, "Kein gültiges JSON");
    }
    const parsed = parseSyncRequest(body);
    if (!parsed.ok) {
      // Welcher Eintrag, welches Feld – damit sich im Protokoll findet, warum ein Gerät etwas nicht hochbekommt
      const bad = parsed.index != null ? body.changes[parsed.index] : null;
      log("warn", "sync_rejected", { user: user.id, status: parsed.status, reason: parsed.reason ?? parsed.error, index: parsed.index ?? null, type: bad?.type ?? null, id: typeof bad?.id === "string" ? bad.id.slice(0, 120) : null });
      // index: welche Änderung abgelehnt wurde – das Gerät hält genau diese zurück und synchronisiert den Rest
      return error(parsed.status, parsed.error, parsed.index != null ? { index: parsed.index, reason: parsed.reason } : {});
    }
    return json(await this.syncService.sync(user, parsed.since, parsed.changes));
  }
}
