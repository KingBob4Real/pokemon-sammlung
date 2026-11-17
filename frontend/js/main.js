// Composition Root: hier werden alle Teile erzeugt und verbunden – sonst nirgends.
//   core/      Werkzeuge (DOM, Format, Speicher, HTTP)
//   data/      Zugriff auf externe APIs (TCGdex, eigenes Backend)
//   domain/    reine Fachlogik (Karte, Preis, Sortierung)
//   services/  Anwendungslogik (Sammlung, Listen, Preise, Sync …)
//   ui/        Ansichten und Komponenten
import { APP_VERSION, DEFAULT_BACKEND_URL, IMAGE_MEMORY_MS, IS_DEV, LOG_KEY, OLD_APP_URL, OLD_KEYS, POCKET_SERIES, PRICE_KEEP_MS, PRICE_TTL_MS, PROFILES_KEY, SETS_TTL_MS, storageKeys, SYNC_BATCH, TCGDEX_API } from "./config.js";
import { fetchJson } from "./core/http.js";
import { shrinkPhoto } from "./core/image.js";
import { Log } from "./core/log.js";
import { storage } from "./core/storage.js";
import { ScanApi } from "./data/scanApi.js";
import { AccountApi } from "./data/accountApi.js";
import { LogApi } from "./data/logApi.js";
import { SyncApi } from "./data/syncApi.js";
import { TradeApi } from "./data/tradeApi.js";
import { TcgdexClient } from "./data/tcgdexClient.js";
import { fetchCardmarketPrices } from "./data/cardmarketPrices.js";
import { withEnglishImage } from "./domain/card.js";
import { createSetSorters, createSorters } from "./domain/sorting.js";
import { BackupService } from "./services/backupService.js";
import { CatalogService } from "./services/catalogService.js";
import { CollectionService } from "./services/collectionService.js";
import { EntityStore } from "./services/entityStore.js";
import { HistoryService } from "./services/historyService.js";
import { LegacyImportService } from "./services/legacyImportService.js";
import { ListService } from "./services/listService.js";
import { PriceService } from "./services/priceService.js";
import { ProfileService } from "./services/profileService.js";
import { ScanService } from "./services/scanService.js";
import { SetService } from "./services/setService.js";
import { SyncService } from "./services/syncService.js";
import { TradeDraftService } from "./services/tradeDraftService.js";
import { TradeService } from "./services/tradeService.js";
import { UpdateService } from "./services/updateService.js";
import { App } from "./ui/app.js";
import { useImageMemory } from "./ui/components/cardTile.js";
import { createPrefs } from "./ui/prefs.js";

// Protokoll zuerst – alles danach kann hineinschreiben (Ansehen unter „Mehr“ → „Protokoll“)
const log = new Log(storage, LOG_KEY);
const tcgdex = new TcgdexClient(TCGDEX_API, fetchJson);
const syncApi = new SyncApi(fetchJson);
// Wer sammelt? Jede Person auf dem Gerät hat ihren eigenen Speicher-Platz (siehe config.js)
const profiles = new ProfileService(storage, PROFILES_KEY, storageKeys, new AccountApi(fetchJson), DEFAULT_BACKEND_URL, log);
log.context.person = profiles.active || null;
const STORAGE_KEYS = storageKeys(profiles.slot);
OLD_KEYS.forEach((key) => storage.remove(key)); // Reste früherer Fassungen
useImageMemory(storage, STORAGE_KEYS.images, IMAGE_MEMORY_MS);
const store = new EntityStore(storage, STORAGE_KEYS);
const sets = new SetService(tcgdex, storage, STORAGE_KEYS.sets, SETS_TTL_MS, POCKET_SERIES);
const prices = new PriceService(tcgdex, storage, STORAGE_KEYS.prices, PRICE_TTL_MS, PRICE_KEEP_MS, () => fetchCardmarketPrices(fetchJson));
const collection = new CollectionService(store);
const lists = new ListService(store);
const history = new HistoryService(storage, STORAGE_KEYS.history, collection, prices);
const catalog = new CatalogService(tcgdex, sets);
// Gilt die Anmeldung nicht mehr, meldet der Sync das Gerät selbst neu an – für die Person, der die Daten gehören
const sync = new SyncService(store, syncApi, storage, STORAGE_KEYS.sync, DEFAULT_BACKEND_URL, SYNC_BATCH, { log, relogin: (owner) => profiles.relogin(owner) });
sync.addEventListener("status", () => {
  profiles.remember(sync.config.userId, sync.config.user); // wer angemeldet ist, sagt das Backend
  log.context.person = profiles.active || sync.config.userId || null;
});
const trade = new TradeService(new TradeApi(fetchJson), sync, collection, lists, log);
const tradeDraft = new TradeDraftService(storage, STORAGE_KEYS.trade, collection);
const scanner = new ScanService(new ScanApi(fetchJson), sync, catalog, sets, shrinkPhoto, log);
const legacyImport = new LegacyImportService({ store, collection, lists, fetchJson, oldAppUrl: OLD_APP_URL });
const backup = new BackupService(store, legacyImport);
const sorters = createSorters({ valueOf: (id) => prices.value(id), setOrder: (id) => sets.order(id), dexOf: (id) => prices.get(id)?.dexId });
const setSorters = createSetSorters((id) => prices.value(id));
const updates = new UpdateService(new URL(import.meta.url).searchParams.get("v"), sessionStorage, log); // Version aus main.js?v=…
// Protokoll ans Backend: Warnungen und Fehler von selbst (höchstens einmal pro Minute), alles über „Mehr“ → „Protokoll“
const logApi = new LogApi(fetchJson);
const shipLog = (options) => log.ship((entries) => logApi.send(sync.config, { device: log.device, person: log.context.person, version: APP_VERSION, entries }), options);
const prefs = createPrefs(storage, STORAGE_KEYS.prefs, {
  collectionSort: "newest",
  collectionGroup: "none",
  listsSort: "custom",
  listSort: "order",
  listFilter: "all",
  setFilter: "all",
  scanMode: "single",
  scanLayout: "3x3",
  setSort: "numUp",
});

const app = new App({ store, sets, prices, collection, lists, history, trade, tradeDraft, catalog, sync, scanner, profiles, backup, sorters, setSorters, updates, log, shipLog }, prefs);

// Start ins Protokoll: wer, welcher Speicher-Platz, wie viel liegt hier, was wartet
log.info("app", "Gestartet", {
  version: APP_VERSION,
  stage: IS_DEV ? "dev" : "live",
  person: profiles.active || null,
  slot: profiles.slot || "(erste)",
  sync: sync.enabled ? (sync.config.key.length > 12 ? "session" : "sync_key") : "aus",
  syncUser: sync.config.userId || null,
  lastSync: sync.config.at ? new Date(sync.config.at).toISOString() : null,
  lastError: sync.config.error || null,
  entries: store.snapshot().filter((e) => !e.deleted).length,
  pending: store.pendingCount,
  rev: store.rev,
  online: navigator.onLine,
  homescreen: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
});
if (profiles.active && sync.config.userId && profiles.active !== sync.config.userId) {
  log.error("app", "Aktive Person und Daten auf dem Gerät passen nicht zusammen", { active: profiles.active, syncUser: sync.config.userId });
}
store.addEventListener("storage-error", () => log.error("store", "Gerät kann nicht speichern (Speicher voll oder privater Modus)"));
app.start();

// Wertverlauf: Tageswert merken, sobald alle Preise der Sammlung frisch sind (beim Start oft schon, sonst nach dem Laden)
const recordWorth = () => history.record() && app.refresh();
prices.addEventListener("update", recordWorth);
recordWorth();

// Karten ohne Bild (deutsches fehlt) bekommen das englische, sobald bekannt ist, zu welcher Serie ihr Set gehört
sets.ready.then(() => store.fixCards((card) => withEnglishImage(card, sets.info(card.set)?.serie)) && app.render());

profiles.refreshIfOlder(24 * 60 * 60 * 1000); // Namen und Schlösser: einmal am Tag reicht, die Personenauswahl lädt beim Öffnen frisch

// Lebenszyklus: Sync beim Start, beim Zurückkehren, solange die App offen ist und wenn wieder online.
// Was ein anderes Gerät geändert hat, kommt nur mit einem Abgleich hier an – ohne die Abfragen unten sah ein
// offener Tab am PC Abgehaktes vom Handy erst nach dem Neuladen.
sync.run();
updates.reloadIfUpdated();
// Abholen beim Zurückkommen (Tab, App, auch nur Klick ins Browserfenster) und alle 30 s, solange die App sichtbar ist.
// Ein Abgleich ohne Neues liest im Backend kaum Zeilen (Index auf Person + Stand).
const PULL_GAP_MS = 5_000;
const PULL_EVERY_MS = 30_000;
window.addEventListener("focus", () => sync.pull(PULL_GAP_MS));
// Bei einem Fehler wartet der Sync selbst immer länger bis zum nächsten Versuch – das Intervall drängelt nicht dazwischen.
setInterval(() => !document.hidden && !sync.config.error && sync.pull(PULL_GAP_MS), PULL_EVERY_MS);
// Nach einer neuen Version höchstens einmal pro Minute schauen – kurz zu Cardmarket und zurück soll nicht jedes Mal
// index.html laden. So kommen Updates auch in der iPhone-App vom Home-Bildschirm an.
const RETURN_CHECK_MS = 60_000;
let lastCheck = Date.now();
document.addEventListener("visibilitychange", async () => {
  // Weg von der App: Wartendes jetzt hochladen, im Hintergrund hält das Handy Zeitgeber an
  if (document.hidden) return sync.flush();
  if (Date.now() - lastCheck >= RETURN_CHECK_MS) {
    lastCheck = Date.now();
    if (await updates.reloadIfUpdated()) return;
  }
  sync.pull(PULL_GAP_MS);
});
window.addEventListener("pagehide", () => sync.flush()); // Tab zu oder App beendet (ältere Safari melden nur das)
window.addEventListener("online", () => {
  log.info("app", "Wieder online", { pending: store.pendingCount });
  sync.run();
  prices.resume();
});
window.addEventListener("offline", () => log.info("app", "Offline", { pending: store.pendingCount }));
// Nach jedem Abgleich (und dann höchstens einmal pro Minute) Warnungen und Fehler ans Backend
sync.addEventListener("status", () => sync.state !== "busy" && navigator.onLine && shipLog().catch(() => 0));
// Unerwartete Fehler ins Protokoll (den Hinweis dazu zeigt ui/app.js)
window.addEventListener("error", (e) => log.error("app", "Unerwarteter Fehler", { message: e.message, source: e.filename ? `${e.filename.split("/").pop()}:${e.lineno}` : null, error: e.error }));
window.addEventListener("unhandledrejection", (e) => log.error("app", "Unbehandelter Fehler (Promise)", { error: e.reason }));
if (IS_DEV) document.documentElement.dataset.stage = "dev"; // grauer Kopf statt rot
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch((e) => log.warn("app", "Service Worker nicht registriert – kein Offline-Betrieb", { error: e }));
navigator.storage?.persist?.().then((granted) => !granted && log.info("app", "Browser kann gespeicherte Daten bei Platzmangel löschen (persist abgelehnt)"), () => {});
