// Formatieren, Parsen und kleine Prüfungen.

const eur0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export const isObj = (x) => x != null && typeof x === "object" && !Array.isArray(x);
export const objOr = (x) => (isObj(x) ? x : {});
export const positive = (x) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : null);

export const fmtEur = (x) => (x == null ? "–" : (x >= 100 ? eur0 : eur2).format(x));
export const fmtSigned = (x) => `${x >= 0 ? "+" : "−"}${fmtEur(Math.abs(x))}`;
export const fmtPriceInput = (x) => (positive(x) == null ? "" : x.toFixed(2).replace(".", ","));
export const fmtDateTime = (ms) => new Date(ms).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
export const fmtDate = (ms) => new Date(ms).toLocaleDateString("de-DE");
export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// klein, ohne Akzente: „Pokémon“ findet man auch mit „pokemon“
export const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Kartennummern: „023“ < „199“ < „TG01“
export const numCmp = (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || String(a).localeCompare(String(b));

// „12,50 €“, „1.234,5“ → Zahl; leer → null; Tippfehler → NaN
export function parseEuro(text) {
  const cleaned = String(text).replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}
