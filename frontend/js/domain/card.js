// Eine Karte, wie die App sie speichert: { id, name, num, set, setName, total, img }

// TCGdex-IDs sind „<set>-<nummer>“, z. B. sv03.5-199
export const setIdOf = (c) => c.id.slice(0, c.id.length - String(c.localId).length - 1);

// Fehlt das deutsche Bild (ältere Sets, manche Promos), gibt es fast immer das englische
const englishImage = (serie, setId, localId) => (serie ? `https://assets.tcgdex.net/en/${serie}/${setId}/${localId}` : null);

// TCGdex-Karte (kurz oder voll) → gespeicherte Karte. setInfo(id) liefert { name, official, serie } oder null.
export function toCard(c, setInfo) {
  const setId = c.set?.id || setIdOf(c);
  const s = setInfo(setId);
  return {
    id: c.id,
    name: c.name,
    num: String(c.localId),
    set: setId,
    setName: c.set?.name || s?.name || setId,
    total: c.set?.cardCount?.official || s?.official || null,
    img: c.image || englishImage(c.set?.serie?.id || s?.serie, setId, c.localId),
  };
}

// pokemontcg.io führt manche Sets unter anderem Namen
const PTCGIO_SETS = { "sm7.5": "sm75", "swsh4.5sv": "swsh45sv", "swsh12.5gg": "swsh12pt5gg" };
// Sets mit Bildern, die es nur bei Limitless TCG gibt (deren Kürzel) – neueste Promos. Weitere hier eintragen.
const LIMITLESS_SETS = { svp: "SVP", mep: "MEP" };
const ptcgio = (set, n, size) => `https://images.pokemontcg.io/${PTCGIO_SETS[set] || set}/${n}${size === "high" ? "_hires" : ""}.png`;

// Bild lädt nicht → nächste Quelle: TCGdex deutsch → englisch → pokemontcg.io (Shiny Vault, Trainer-Galerien, Galarian
// Gallery, Drachenwandel …). Für die Promo-Sets oben vorher Limitless über imageProxy (GET /img des Backends, weil Limitless
// keinen CORS-Header schickt) – pokemontcg.io antwortet bei fehlenden Karten mit einer Kartenrückseite statt einem Fehler,
// danach ginge es nicht weiter. null = keine weitere Quelle.
export function nextImage(src, imageProxy = null) {
  if (src.startsWith("https://assets.tcgdex.net/de/")) return src.replace("/de/", "/en/");
  const t = src.match(/^https:\/\/assets\.tcgdex\.net\/en\/[^/]+\/([^/]+)\/([^/]+)\/(low|high)\.webp$/);
  if (t) {
    const [, set, num, size] = t;
    const n = num.replace(/^0+(?=\d)/, ""); // „085“ heißt dort „85“
    return LIMITLESS_SETS[set] && imageProxy && /^\d+$/.test(n) ? `${imageProxy}?set=${LIMITLESS_SETS[set]}&n=${n}&size=${size === "high" ? "LG" : "SM"}` : ptcgio(set, n, size);
  }
  if (!imageProxy || !src.startsWith(`${imageProxy}?`)) return null;
  const q = new URL(src).searchParams; // Limitless hatte es nicht → pokemontcg.io
  const set = Object.keys(LIMITLESS_SETS).find((k) => LIMITLESS_SETS[k] === q.get("set"));
  return set ? ptcgio(set, q.get("n"), q.get("size") === "LG" ? "high" : "low") : null;
}

// Gespeicherte Karte ohne Bild → mit englischem Bild (oder null, wenn nichts zu tun ist)
export const withEnglishImage = (card, serie) => (card.img || !serie ? null : { ...card, img: englishImage(serie, card.set, card.num) });

// „199/165“ wie auf der Karte; Promos ohne Setgröße nur „023“
export const cardNumber = (card) => (card.total ? `${card.num}/${String(card.total).padStart(3, "0")}` : card.num);

export const cardImage = (card, size) => (card.img ? `${card.img}/${size}.webp` : null);
