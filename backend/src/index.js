// Einstieg des Cloudflare Workers: setzt die Teile zusammen (Composition Root).
//   http/          Router, Antworten, Schlüssel-Prüfung
//   controllers/   HTTP ↔ Service
//   services/      Abgleich-Logik, Karten-Scanner, Anmelden, Tauschen
//   repositories/  SQL pro Tabelle
//   validation/    Prüfung eingehender Daten
import { LIMITLESS_IMAGES, SCAN_MAX_TOKENS, SCAN_MODEL, SCANS_PER_DAY, SCANS_PER_DAY_TOTAL, TCGDEX_API, TCGPLAYER_IMAGES } from "./config.js";
import { AuthController } from "./controllers/authController.js";
import { ImageController } from "./controllers/imageController.js";
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
import { SectionRepository } from "./repositories/sectionRepository.js";
import { UserRepository } from "./repositories/userRepository.js";
import { AuthService } from "./services/authService.js";
import { ScanService } from "./services/scanService.js";
import { SyncService } from "./services/syncService.js";
import { TradeService } from "./services/tradeService.js";

// Zahl aus wrangler.toml ([vars]); fehlt sie oder ist sie ungültig, gilt der Wert aus config.js
const count = (value, fallback) => (parseInt(value, 10) >= 0 ? parseInt(value, 10) : fallback);

export function createApp(env) {
  const db = env.DB;
  const users = new UserRepository(db);
  const collection = new CollectionRepository(db);
  const listItems = new ListItemRepository(db);
  const syncService = new SyncService(db, new RevisionRepository(db), new CardRepository(db), [collection, new ListRepository(db), listItems, new SectionRepository(db)]);
  const tradeService = new TradeService(users, collection, listItems);
  const syncController = new SyncController(syncService);
  const scanService = new ScanService(env.AI, new ScanUsageRepository(db), {
    model: SCAN_MODEL,
    maxTokens: SCAN_MAX_TOKENS,
    perUser: count(env.SCANS_PER_DAY, SCANS_PER_DAY),
    total: count(env.SCANS_PER_DAY_TOTAL, SCANS_PER_DAY_TOTAL),
  });
  const scanController = new ScanController(scanService);
  const authController = new AuthController(new AuthService(users));
  const imageController = new ImageController({ limitless: LIMITLESS_IMAGES, tcgdex: TCGDEX_API, tcgplayer: TCGPLAYER_IMAGES });

  return new Router()
    .get("/", () => json({ ok: true, app: "pokemon-sammlung" }))
    .post("/sync", requireUser(users, (request, user) => syncController.sync(request, user)))
    .post("/scan", requireUser(users, (request, user) => scanController.scan(request, user)))
    .get("/scan/usage", requireUser(users, (request, user) => scanController.usage(user)))
    // Tauschen: Doppelte und fehlende Karten der anderen Personen (nur lesen, nur angemeldet)
    .get("/trade", requireUser(users, async (request, user) => json(await tradeService.forUser(user))))
    // Kartenbilder, die es nur bei Limitless oder TCGplayer gibt (ohne Schlüssel – <img> schickt keinen mit)
    .get("/img", (request) => imageController.image(request))
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
