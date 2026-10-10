// Composition Root: hier werden alle Teile erzeugt und verbunden – sonst nirgends.
//   core/      Werkzeuge (DOM, Format, Speicher, HTTP)
//   data/      Zugriff auf externe APIs (TCGdex, eigenes Backend)
//   domain/    reine Fachlogik (Karte, Preis, Sortierung)
//   services/  Anwendungslogik (Sammlung, Listen, Preise, Sync …)
//   ui/        Ansichten und Komponenten
import { DEFAULT_BACKEND_URL, IMAGE_MEMORY_MS, IS_DEV, OLD_APP_URL, OLD_KEYS, POCKET_SERIES, PRICE_KEEP_MS, PRICE_TTL_MS, PROFILES_KEY, SETS_TTL_MS, storageKeys, SYNC_BATCH, TCGDEX_API } from "./config.js";
import { fetchJson } from "./core/http.js";
import { shrinkPhoto } from "./core/image.js";
import { storage } from "./core/storage.js";
import { ScanApi } from "./data/scanApi.js";
import { AccountApi } from "./data/accountApi.js";
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

const tcgdex = new TcgdexClient(TCGDEX_API, fetchJson);
const syncApi = new SyncApi(fetchJson);
// Wer sammelt? Jede Person auf dem Gerät hat ihren eigenen Speicher-Platz (siehe config.js)
const profiles = new ProfileService(storage, PROFILES_KEY, storageKeys, new AccountApi(fetchJson), DEFAULT_BACKEND_URL);
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
const sync = new SyncService(store, syncApi, storage, STORAGE_KEYS.sync, DEFAULT_BACKEND_URL, SYNC_BATCH);
sync.addEventListener("status", () => profiles.remember(sync.config.userId, sync.config.user)); // wer angemeldet ist, sagt das Backend
const trade = new TradeService(new TradeApi(fetchJson), sync, collection, lists);
const tradeDraft = new TradeDraftService(storage, STORAGE_KEYS.trade, collection);
const scanner = new ScanService(new ScanApi(fetchJson), sync, catalog, sets, shrinkPhoto);
const legacyImport = new LegacyImportService({ store, collection, lists, fetchJson, storage, oldAppUrl: OLD_APP_URL, keys: STORAGE_KEYS });
const backup = new BackupService(store, legacyImport);
const sorters = createSorters({ valueOf: (id) => prices.value(id), setOrder: (id) => sets.order(id), dexOf: (id) => prices.get(id)?.dexId });
const setSorters = createSetSorters((id) => prices.value(id));
const updates = new UpdateService(new URL(import.meta.url).searchParams.get("v")); // Version aus main.js?v=…
const prefs = createPrefs(storage, STORAGE_KEYS.prefs, { collectionSort: "newest", collectionGroup: "none", listsSort: "custom", listSort: "order", listFilter: "all", setFilter: "all", scanMode: "single", scanLayout: "3x3", setSort: "numUp" });

const app = new App({ store, sets, prices, collection, lists, history, trade, tradeDraft, catalog, sync, scanner, profiles, legacyImport, backup, sorters, setSorters, updates }, prefs);
app.start();

// Wertverlauf: Tageswert merken, sobald alle Preise der Sammlung frisch sind (beim Start oft schon, sonst nach dem Laden)
const recordWorth = () => history.record() && app.refresh();
prices.addEventListener("update", recordWorth);
recordWorth();

// Karten ohne Bild (deutsches fehlt) bekommen das englische, sobald bekannt ist, zu welcher Serie ihr Set gehört
sets.ready.then(() => store.fixCards((card) => withEnglishImage(card, sets.info(card.set)?.serie)) && app.render());

profiles.refresh(); // Namen und Schlösser aktuell halten

// Lebenszyklus: Sync beim Start, beim Zurückkehren und wenn wieder online.
// Beim Start und bei jeder Rückkehr in die App nach einer neuen Version schauen – so kommen Updates
// auch in der iPhone-App vom Home-Bildschirm sofort an.
sync.run();
updates.reloadIfUpdated();
// Höchstens einmal pro Minute – kurz zu Cardmarket und zurück soll nicht jedes Mal zwei Anfragen kosten.
// Eigene Änderungen lädt der Sync ohnehin sofort hoch (store „change“).
const RETURN_CHECK_MS = 60_000;
let lastCheck = Date.now();
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || Date.now() - lastCheck < RETURN_CHECK_MS) return;
  lastCheck = Date.now();
  if (!(await updates.reloadIfUpdated())) sync.run();
});
window.addEventListener("online", () => {
  sync.run();
  prices.resume();
});
if (IS_DEV) document.documentElement.dataset.stage = "dev"; // grauer Kopf statt rot
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
navigator.storage?.persist?.().catch(() => {});
