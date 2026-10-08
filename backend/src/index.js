// Einstieg des Cloudflare Workers: setzt die Teile zusammen (Composition Root).
//   http/          Router, Antworten, Schlüssel-Prüfung
//   controllers/   HTTP ↔ Service
//   services/      Abgleich-Logik, Karten-Scanner, Anmelden
//   repositories/  SQL pro Tabelle
//   validation/    Prüfung eingehender Daten
import { SCAN_MODEL, SCANS_PER_DAY, SCANS_PER_DAY_TOTAL } from "./config.js";
import { AuthController } from "./controllers/authController.js";
import { ScanController } from "./controllers/scanController.js";
import { SyncController } from "./controllers/syncController.js";
import { requireUser } from "./http/auth.js";
import { json } from "./http/responses.js";
import { Router } from "./http/router.js";
import { CardRepository } from "./repositories/cardRepository.js";
import { CollectionRepository } from "./repositories/collectionRepository.js";
import { ListItemRepository } from "./repositories/listItemRepository.js";
import { ListRepository } from "./repositories/listRepository.js";
import { RevisionRepository } from "./repositories/revisionRepository.js";
import { ScanUsageRepository } from "./repositories/scanUsageRepository.js";
import { UserRepository } from "./repositories/userRepository.js";
import { AuthService } from "./services/authService.js";
import { ScanService } from "./services/scanService.js";
import { SyncService } from "./services/syncService.js";

export function createApp(env) {
  const db = env.DB;
  const users = new UserRepository(db);
  const syncService = new SyncService(db, new RevisionRepository(db), new CardRepository(db), [
    new CollectionRepository(db),
    new ListRepository(db),
    new ListItemRepository(db),
  ]);
  const syncController = new SyncController(syncService);
  const scanService = new ScanService(env.AI, new ScanUsageRepository(db), { model: SCAN_MODEL, perUser: SCANS_PER_DAY, total: SCANS_PER_DAY_TOTAL });
  const scanController = new ScanController(scanService);
  const authController = new AuthController(new AuthService(users));

  return new Router()
    .get("/", () => json({ ok: true, app: "pokemon-sammlung" }))
    .post("/sync", requireUser(users, (request, user) => syncController.sync(request, user)))
    .post("/scan", requireUser(users, (request, user) => scanController.scan(request, user)))
    // „Wer sammelt?“: Personen sind öffentlich sichtbar (nur Namen), Anmelden per Antippen oder mit Passwort
    .get("/people", () => authController.people())
    .post("/login", (request) => authController.login(request))
    .post("/me/password", requireUser(users, (request, user) => authController.password(request, user)))
    .post("/me/name", requireUser(users, (request, user) => authController.rename(request, user)));
}

export default {
  fetch(request, env) {
    return createApp(env).handle(request);
  },
};
