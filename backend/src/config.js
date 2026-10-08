// Grenzen des Sync-Endpunkts
export const MAX_CHANGES_PER_REQUEST = 1000;

// Karten-Scanner (Workers AI). Gratis-Tarif: 10.000 Neurons pro Tag für das ganze Cloudflare-Konto,
// also für Live und Dev zusammen. Gemessen: 6,6–9,3 Neurons pro Scan (825 Tokens rein, ~65 raus), höchstens
// 10,3 (825 rein + SCAN_MAX_TOKENS raus). Die Limits stehen in wrangler.toml ([vars] bzw. [env.dev.vars]) und
// sind so gewählt, dass Live + Dev zusammen selbst im schlimmsten Fall unter 10.000 bleiben:
// (900 + 60) × 10,3 ≈ 9.900. Die Werte hier gelten nur, falls dort nichts steht.
export const SCAN_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SCAN_MAX_TOKENS = 100; // die Antwort braucht ~65; mehr kostet nur, wenn das Modell abschweift
export const SCANS_PER_DAY = 50; // pro Person
export const SCANS_PER_DAY_TOTAL = 150; // alle Personen zusammen, pro Datenbank (Live bzw. Dev)
export const MAX_IMAGE_CHARS = 1.5 * 1024 * 1024; // Base64 inkl. „data:image/…“

// Kartenbilder, die es nur bei Limitless TCG gibt (neueste Promos). Deren Speicher schickt keinen CORS-Header,
// darum reicht GET /img sie durch.
export const LIMITLESS_IMAGES = "https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci";
