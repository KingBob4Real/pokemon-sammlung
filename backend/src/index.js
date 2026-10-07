// Einstieg des Cloudflare Workers: setzt die Teile zusammen (Composition Root).
//   http/          Router, Antworten, Schlüssel-Prüfung
//   controllers/   HTTP ↔ Service
//   services/      Abgleich-Logik
//   repositories/  SQL pro Tabelle
//   validation/    Prüfung eingehender Daten
import { SyncController } from "./controllers/syncController.js";
import { requireKey } from "./http/auth.js";
import { json } from "./http/responses.js";
import { Router } from "./http/router.js";
import { CardRepository } from "./repositories/cardRepository.js";
import { CollectionRepository } from "./repositories/collectionRepository.js";
import { ListItemRepository } from "./repositories/listItemRepository.js";
import { ListRepository } from "./repositories/listRepository.js";
import { RevisionRepository } from "./repositories/revisionRepository.js";
import { SyncService } from "./services/syncService.js";

export function createApp(env) {
  const db = env.DB;
  const syncService = new SyncService(db, new RevisionRepository(db), new CardRepository(db), [
    new CollectionRepository(db),
    new ListRepository(db),
    new ListItemRepository(db),
  ]);
  const syncController = new SyncController(syncService);

  return new Router()
    .get("/", () => json({ ok: true, app: "pokemon-sammlung" }))
    .post("/sync", requireKey(env.SYNC_KEY, (request) => syncController.sync(request)));
}

export default {
  fetch(request, env) {
    return createApp(env).handle(request);
  },
};
