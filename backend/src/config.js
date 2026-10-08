// Grenzen des Sync-Endpunkts
export const MAX_CHANGES_PER_REQUEST = 1000;

// Karten-Scanner (Workers AI). Gratis-Tarif: 10.000 Neurons pro Tag für das ganze Cloudflare-Konto,
// also für Live und Dev zusammen. Ein Scan kostet gemessen ~7 Neurons (≈ 1.400 Scans/Tag); beide Limits
// zusammen (2 × 150 Scans) bleiben selbst bei doppeltem Verbrauch unter einem Drittel davon.
export const SCAN_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SCANS_PER_DAY = 50; // pro Person
export const SCANS_PER_DAY_TOTAL = 150; // alle Personen zusammen, pro Datenbank (Live bzw. Dev)
export const MAX_IMAGE_CHARS = 1.5 * 1024 * 1024; // Base64 inkl. „data:image/…“
