// Composition Root: hier werden alle Teile erzeugt und verbunden – sonst nirgends.
//   core/      Werkzeuge (DOM, Format, Speicher, HTTP)
//   data/      Zugriff auf externe APIs (TCGdex, eigenes Backend)
//   domain/    reine Fachlogik (Karte, Preis, Sortierung)
//   services/  Anwendungslogik (Sammlung, Listen, Preise, Sync …)
//   ui/        Ansichten und Komponenten
import { DEFAULT_BACKEND_URL, IS_DEV, OLD_APP_URL, POCKET_SERIES, PRICE_TTL_MS, SETS_TTL_MS, STORAGE_KEYS, SYNC_BATCH, TCGDEX_API } from "./config.js";
import { fetchJson } from "./core/http.js";
import { storage } from "./core/storage.js";
import { SyncApi } from "./data/syncApi.js";
import { TcgdexClient } from "./data/tcgdexClient.js";
import { createSorters } from "./domain/sorting.js";
import { BackupService } from "./services/backupService.js";
import { CatalogService } from "./services/catalogService.js";
import { CollectionService } from "./services/collectionService.js";
import { EntityStore } from "./services/entityStore.js";
import { LegacyImportService } from "./services/legacyImportService.js";
import { ListService } from "./services/listService.js";
import { PriceService } from "./services/priceService.js";
import { SetService } from "./services/setService.js";
import { SyncService } from "./services/syncService.js";
import { UpdateService } from "./services/updateService.js";
import { App } from "./ui/app.js";
import { createPrefs } from "./ui/prefs.js";

const tcgdex = new TcgdexClient(TCGDEX_API, fetchJson);
const store = new EntityStore(storage, STORAGE_KEYS);
const sets = new SetService(tcgdex, storage, STORAGE_KEYS.sets, SETS_TTL_MS, POCKET_SERIES);
const prices = new PriceService(tcgdex, storage, STORAGE_KEYS.prices, PRICE_TTL_MS);
const collection = new CollectionService(store);
const lists = new ListService(store);
const catalog = new CatalogService(tcgdex, sets);
const sync = new SyncService(store, new SyncApi(fetchJson), storage, STORAGE_KEYS.sync, DEFAULT_BACKEND_URL, SYNC_BATCH);
const legacyImport = new LegacyImportService({ store, collection, lists, fetchJson, storage, oldAppUrl: OLD_APP_URL, keys: STORAGE_KEYS });
const backup = new BackupService(store, legacyImport);
const sorters = createSorters({ valueOf: (id) => prices.value(id), setOrder: (id) => sets.order(id), dexOf: (id) => prices.get(id)?.dexId });
const updates = new UpdateService(new URL(import.meta.url).searchParams.get("v")); // Version aus main.js?v=…
const prefs = createPrefs(storage, STORAGE_KEYS.prefs, { collectionSort: "newest", collectionGroup: "none", listsSort: "custom", listSort: "order", listFilter: "all" });

new App({ store, sets, prices, collection, lists, catalog, sync, legacyImport, backup, sorters, updates }, prefs).start();

// Lebenszyklus: Sync beim Start, beim Zurückkehren und wenn wieder online.
// Beim Start und bei jeder Rückkehr in die App nach einer neuen Version schauen – so kommen Updates
// auch in der iPhone-App vom Home-Bildschirm sofort an.
sync.run();
updates.reloadIfUpdated();
document.addEventListener("visibilitychange", async () => {
  if (document.hidden) return;
  if (!(await updates.reloadIfUpdated())) sync.run();
});
window.addEventListener("online", () => {
  sync.run();
  prices.resume();
});
if (IS_DEV) document.documentElement.dataset.stage = "dev"; // grauer Kopf statt rot
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
navigator.storage?.persist?.().catch(() => {});
