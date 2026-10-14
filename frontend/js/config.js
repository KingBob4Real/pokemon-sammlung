// Feste Einstellungen der App an einer Stelle.

// Version der App (steht unter „Mehr“). Bei jedem Release hochzählen: Fix → hinten +1 (0.0.2), Feature → Mitte +1 und
// hinten 0 (0.1.0), großer Umbau → vorne +1, Rest 0 (1.0.0). Das technische ?v= in index.html setzt der Pages-Workflow selbst.
export const APP_VERSION = "0.0.1";

export const TCGDEX_API = "https://api.tcgdex.net/v2";
// Dev-Stufe: der develop-Branch liegt unter …/dev/ (siehe .github/workflows/pages.yml) – eigenes Backend, eigener Speicher.
export const IS_DEV = location.pathname.includes("/dev/");
export const OLD_APP_URL = "https://kingbob4real.github.io/pokemon-karten-checkliste/";
// Adresse des Cloudflare-Backends (fest, in der App nicht sichtbar). Lokal (localhost) das Backend aus `npm run dev`.
const LOCAL = ["localhost", "127.0.0.1"].includes(location.hostname);
export const DEFAULT_BACKEND_URL = LOCAL ? "http://127.0.0.1:8787" : `https://pokemon-sammlung${IS_DEV ? "-dev" : ""}.pokemon-sammlung-backend.workers.dev`;
// Kartenbilder von Limitless reicht das Backend durch (domain/card.js → nextImage)
export const IMAGE_PROXY = `${DEFAULT_BACKEND_URL}/img`;
// Cardmarket-Link: Angebote in der Sprache der Karte ab Zustand Excellent (Cardmarkets Nummern der Sprachen)
export const CARDMARKET_LANGUAGES = { Deutsch: 3, Englisch: 1, Französisch: 2, Spanisch: 4, Italienisch: 5, Japanisch: 7 };
export const CARDMARKET_MIN_CONDITION = 3; // Excellent

const DAY_MS = 24 * 60 * 60 * 1000;
export const PRICE_TTL_MS = DAY_MS;
export const PRICE_KEEP_MS = 30 * DAY_MS; // älter fliegt beim Speichern raus (services/priceService.js)
export const SETS_TTL_MS = 7 * DAY_MS;
export const IMAGE_MEMORY_MS = 30 * DAY_MS; // Bild-Ersatz merken, danach neu probieren (TCGdex reicht selten Bilder nach)
export const SEARCH_LIMIT = 120;
export const SYNC_BATCH = 500;
export const MAX_COPIES = 100; // einzeln erfasste Exemplare einer Karte – wie MAX_COPIES im Backend
export const POCKET_SERIES = "tcgp"; // TCG Pocket = digitale Karten, ausblenden

const P = IS_DEV ? "ps-dev." : "ps."; // gleiche Domain → Dev und Live trennen sich nur über den Namen
export const PROFILES_KEY = `${P}profiles.v2`; // „Wer sammelt?“ auf diesem Gerät (services/profileService.js)

// Speicher-Namen, die einer Person allein gehören – beim Abmelden fliegen genau diese vom Gerät (services/profileService.js)
export const PERSONAL_KEYS = ["entities", "dirty", "base", "rev", "sync", "prefs", "history", "trade"];

// Speicher-Namen für eine Person: Sammlung, Listen, Sync-Schlüssel, Einstellungen und Wertverlauf gehören ihr allein,
// Preise, Sets und Bild-Ersatz teilen sich alle. Person "" = die erste – ihre Daten bleiben unter den bisherigen Namen.
export function storageKeys(profile = "") {
  const own = profile ? `${P}${profile}.` : P;
  return {
    entities: `${own}entities.v1`,
    dirty: `${own}dirty.v1`,
    base: `${own}base.v1`, // Stand vor eigenen, noch nicht hochgeladenen Änderungen (services/entityStore.js, Zusammenführen)
    rev: `${own}rev.v1`,
    sync: `${own}sync.v1`,
    prefs: `${own}prefs.v1`,
    history: `${own}history.v1`, // Wertverlauf der Sammlung (services/historyService.js)
    trade: `${own}trade.v1`, // Tauschrechner: was ich gebe / bekomme (services/tradeDraftService.js)
    prices: `${P}prices.v4`, // v4: englischer Preis, wo der deutsche fehlt (v3: Ø 7 Tage, v2: Pokédex-Nummer)
    sets: `${P}sets.v4`, // v4: Kartenzahl = Deutsch oder Englisch, was mehr hat (v3: deutsche + englische Sets, Serie je Set)
    images: `${P}images.v1`, // Karten-ID + Größe → Bild-Adresse, die geklappt hat, oder "" (ui/components/cardTile.js)
    // von der alten Checkliste (gleiche Domain, im selben Browser lesbar)
    legacyOwned: "pkc.owned.v1",
    legacyPrices: "pkc.ownPrices.v1",
  };
}

// Frühere Fassungen von Preisen und Sets – wurden beim Hochzählen nie gelöscht und belegen sonst für immer Platz
export const OLD_KEYS = ["prices.v1", "prices.v2", "prices.v3", "sets.v1", "sets.v2", "sets.v3"].map((k) => P + k);

export const ENTITY_TYPES = ["collection", "list", "listItem", "section"];
export const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Good", "Light Played", "Played", "Poor"];
export const LANGUAGES = ["Deutsch", "Englisch", "Japanisch", "Französisch", "Italienisch", "Spanisch", "Andere"];
