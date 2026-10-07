// Feste Einstellungen der App an einer Stelle.

export const TCGDEX_API = "https://api.tcgdex.net/v2";
export const OLD_APP_URL = "https://kingbob4real.github.io/pokemon-karten-checkliste/";
// Adresse des Cloudflare-Backends (unter „Mehr“ änderbar)
export const DEFAULT_BACKEND_URL = "https://pokemon-sammlung.pokemon-sammlung-backend.workers.dev";
export const CARDMARKET_FILTER = "language=3&minCondition=3"; // nur deutsche Karten ab Excellent

const DAY_MS = 24 * 60 * 60 * 1000;
export const PRICE_TTL_MS = DAY_MS;
export const SETS_TTL_MS = 7 * DAY_MS;
export const RELOAD_AFTER_HIDDEN_MS = 60 * 60 * 1000; // iPhone-App hat keinen Neu-laden-Knopf
export const SEARCH_LIMIT = 120;
export const SYNC_BATCH = 500;
export const POCKET_SERIES = "tcgp"; // TCG Pocket = digitale Karten, ausblenden

export const STORAGE_KEYS = {
  entities: "ps.entities.v1",
  dirty: "ps.dirty.v1",
  rev: "ps.rev.v1",
  sync: "ps.sync.v1",
  prices: "ps.prices.v1",
  sets: "ps.sets.v2", // v2: mit Serie für englische Ersatzbilder
  prefs: "ps.prefs.v1",
  // von der alten Checkliste (gleiche Domain, im selben Browser lesbar)
  legacyOwned: "pkc.owned.v1",
  legacyPrices: "pkc.ownPrices.v1",
};

export const ENTITY_TYPES = ["collection", "list", "listItem"];
export const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];
export const LANGUAGES = ["Deutsch", "Englisch", "Japanisch", "Französisch", "Italienisch", "Spanisch", "Andere"];
