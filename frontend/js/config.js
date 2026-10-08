// Feste Einstellungen der App an einer Stelle.

export const TCGDEX_API = "https://api.tcgdex.net/v2";
// Dev-Stufe: der develop-Branch liegt unter …/dev/ (siehe .github/workflows/pages.yml) – eigenes Backend, eigener Speicher.
export const IS_DEV = location.pathname.includes("/dev/");
export const OLD_APP_URL = "https://kingbob4real.github.io/pokemon-karten-checkliste/";
// Adresse des Cloudflare-Backends (unter „Mehr“ änderbar)
export const DEFAULT_BACKEND_URL = `https://pokemon-sammlung${IS_DEV ? "-dev" : ""}.pokemon-sammlung-backend.workers.dev`;
// Cardmarket-Link: Angebote in der Sprache der Karte ab Zustand Excellent (Cardmarkets Nummern der Sprachen)
export const CARDMARKET_LANGUAGES = { Deutsch: 3, Englisch: 1, Französisch: 2, Spanisch: 4, Italienisch: 5, Japanisch: 7 };
export const CARDMARKET_MIN_CONDITION = 3; // Excellent

const DAY_MS = 24 * 60 * 60 * 1000;
export const PRICE_TTL_MS = DAY_MS;
export const SETS_TTL_MS = 7 * DAY_MS;
export const SEARCH_LIMIT = 120;
export const SYNC_BATCH = 500;
export const POCKET_SERIES = "tcgp"; // TCG Pocket = digitale Karten, ausblenden

const P = IS_DEV ? "ps-dev." : "ps."; // gleiche Domain → Dev und Live trennen sich nur über den Namen
export const STORAGE_KEYS = {
  entities: `${P}entities.v1`,
  dirty: `${P}dirty.v1`,
  rev: `${P}rev.v1`,
  sync: `${P}sync.v1`,
  prices: `${P}prices.v2`, // v2: mit Pokédex-Nummer
  sets: `${P}sets.v3`, // v3: deutsche + englische Sets, Serie für jedes Set (englische Ersatzbilder)
  prefs: `${P}prefs.v1`,
  // von der alten Checkliste (gleiche Domain, im selben Browser lesbar)
  legacyOwned: "pkc.owned.v1",
  legacyPrices: "pkc.ownPrices.v1",
};

export const ENTITY_TYPES = ["collection", "list", "listItem"];
export const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];
export const LANGUAGES = ["Deutsch", "Englisch", "Japanisch", "Französisch", "Italienisch", "Spanisch", "Andere"];
