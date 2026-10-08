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

// pokemontcg.io führt manche Sets unter anderem Namen (McDonald's, Best of Game, EX-Trainer-Kits, HGSS-Promos …)
// ponytail: von Hand gepflegt – neue Lücken findet ein Abgleich aller Sets (siehe README „Suche“)
const PTCGIO_SETS = {
  "sm7.5": "sm75",
  "swsh4.5sv": "swsh45sv",
  "swsh12.5gg": "swsh12pt5gg",
  ...Object.fromEntries(["2011bw", "2012bw", "2014xy", "2015xy", "2016xy", "2017sm", "2018sm", "2019sm", "2021swsh", "2022swsh"].map((id) => [id, `mcd${id.slice(2, 4)}`])),
  bog: "bp",
  "tk-ex-latia": "tk1a",
  "tk-ex-latio": "tk1b",
  "tk-ex-p": "tk2a",
  "tk-ex-m": "tk2b",
  hgssp: "hsp",
};
// Sets, für die Limitless TCG Bilder hat, die sonst fehlen (TCGdex-Set → Kürzel bei Limitless). Weitere hier eintragen.
const LIMITLESS_SETS = { svp: "SVP", mep: "MEP", mee: "MEE", sve: "SVE", "30th-c": "30C" };

// Alle Bildquellen einer Karte in der Reihenfolge, in der die App sie probiert – egal, ob die Kachel mit dem deutschen
// oder englischen TCGdex-Bild startet (die API meldet nicht jedes vorhandene Bild):
//   TCGdex deutsch → TCGdex englisch → Limitless (über imageProxy = GET /img des Backends, Limitless schickt keinen
//   CORS-Header) → pokemontcg.io (Shiny Vault, Trainer-Galerien … – fehlt dort etwas, kommt eine Kartenrückseite, darum zuletzt)
export function imageSources(src, imageProxy = null) {
  const t = src.match(/^https:\/\/assets\.tcgdex\.net\/(?:de|en)\/([^/]+)\/([^/]+)\/([^/]+)\/(low|high)\.webp$/);
  if (!t) return [src];
  const [, serie, set, num, size] = t;
  const n = num.replace(/^0+(?=\d)/, ""); // pokemontcg.io: „85“, Limitless: „085“
  const code = imageProxy && /^\d+$/.test(n) && LIMITLESS_SETS[set];
  return [
    `https://assets.tcgdex.net/de/${serie}/${set}/${num}/${size}.webp`,
    `https://assets.tcgdex.net/en/${serie}/${set}/${num}/${size}.webp`,
    code && `${imageProxy}?set=${code}&n=${n.padStart(3, "0")}&size=${size === "high" ? "LG" : "SM"}`,
    `https://images.pokemontcg.io/${PTCGIO_SETS[set] || set}/${n.replace(/^H0(?=\d)/, "H")}${size === "high" ? "_hires" : ""}.png`, // e-Card „H01“ → „H1“
  ].filter(Boolean);
}

// Bild lädt nicht → nächste noch nicht probierte Quelle. first: Adresse, mit der das Bild gestartet ist; tried: alle bisher
// probierten Adressen. null = keine weitere Quelle (Platzhalter).
export const nextImage = (first, tried, imageProxy = null) => imageSources(first, imageProxy).find((u) => !tried.includes(u)) ?? null;

// Gespeicherte Karte ohne Bild → mit englischem Bild (oder null, wenn nichts zu tun ist)
export const withEnglishImage = (card, serie) => (card.img || !serie ? null : { ...card, img: englishImage(serie, card.set, card.num) });

// „199/165“ wie auf der Karte; Promos ohne Setgröße nur „023“
export const cardNumber = (card) => (card.total ? `${card.num}/${String(card.total).padStart(3, "0")}` : card.num);

export const cardImage = (card, size) => (card.img ? `${card.img}/${size}.webp` : null);
