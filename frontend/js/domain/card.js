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
  "sm3.5": "sm35",
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
const LIMITLESS_SETS = { svp: "SVP", mep: "MEP", mee: "MEE", sve: "SVE", "30th-c": "30C", "30th": "30C", cel25cc: "CEL" };
// Nachdrucke mit der Nummer des Originals auf der Karte (Palkia LV.X: „106/106“) – TCGdex zählt sie neu durch (001–030 bzw.
// CC001–CC025, in der Reihenfolge dieser Nummern). Stelle = TCGdex-Nummer − 1. Abgelesen von den Kartenbildern.
//   30th-c: „30 Jahre: Klassische Sammlung“, dazu die Nummer bei Limitless (Set 30C, CC1–CC30, andere Reihenfolge)
//   cel25cc: „Celebrations: Klassische Kollektion“
const CLASSIC_30C = "4/102:CC2 5/109:CC8 11/113:CC11 11/101:CC20 18/132:CC3 19/109:CC9 25/111:CC5 33/181:CC25 41/122:CC22 43/146:CC13 47/127:CC14 50/185:CC27 57/111:CC24 58/102:CC1 69/132:CC4 85/124:CC19 89/149:CC23 94/102:CC15 99/102:CC16 100/102:CC17 101/101:CC18 106/106:CC12 106/160:CC21 106/105:CC6 108/115:CC10 114/264:CC28 123/172:CC29 138/202:CC26 149/147:CC7 203/193:CC30"
  .split(" ")
  .map((s) => s.split(":"));
const PRINTED = {
  "30th-c": CLASSIC_30C.map(([printed]) => printed),
  cel25cc: "2/102 4/102 15/102 73/102 8/82 15/82 15/132 24 20/111 66/64 9/95 86/109 88/92 93/101 17/17 15/106 109/111 145/147 107/123 113/114 114/114 54/99 97/146 76/108 60/145".split(" "),
};
const indexOf = (num) => parseInt(String(num).replace(/^\D+/, ""), 10) - 1; // „022“, „CC012“ → 21
// Rundes Jubiläums-Logo (Pikachu mit „25“/„30“) auf den Karten dieser Sets – unterscheidet Nachdruck und Original
export const STAMPS = { "30th-c": 30, "30th": 30, cel25cc: 25 };

// Nummer wie auf der Karte, wenn TCGdex anders zählt („106/106“), sonst null
export const printedNumber = (card) => PRINTED[card.set]?.[indexOf(card.num)] ?? null;

// TCGdex-IDs der Nachdrucke mit dieser Nummer (und Setgröße, falls bekannt): 106, 106 → ["30th-c-022"]
export function reprintIds(number, total = null) {
  return Object.entries(PRINTED).flatMap(([set, list]) =>
    list.flatMap((p, i) => {
      const [n, t] = p.split("/").map(Number);
      return n === number && (!total || t === total) ? [`${set}-${set === "cel25cc" ? "CC" : ""}${String(i + 1).padStart(3, "0")}`] : [];
    })
  );
}

// „CC12“ (Nummer bei Limitless) → „30th-c-022“, sonst null
export function classicId(cc) {
  const i = CLASSIC_30C.findIndex(([, c]) => c === String(cc).toUpperCase());
  return i < 0 ? null : `30th-c-${String(i + 1).padStart(3, "0")}`;
}

// Nummer bei Limitless: dreistellig („085“), Klassische Sammlung „CC12“ (andere Reihenfolge), Celebrations „CC1“,
// 30 Jahre „B“/„G“/„R“ (die drei Mew); sonst null (z. B. MEP „Museum“)
const limitlessNumber = (set, n) =>
  set === "30th-c" ? CLASSIC_30C[n - 1]?.[1] : /^\d+$/.test(n) ? n.padStart(3, "0") : /^(CC\d+|[A-Z])$/.test(n) ? n.replace(/^CC0*/, "CC") : null;

// Alle Bildquellen einer Karte in der Reihenfolge, in der die App sie probiert – egal, ob die Kachel mit dem deutschen
// oder englischen TCGdex-Bild startet (die API meldet nicht jedes vorhandene Bild):
//   TCGdex deutsch → TCGdex englisch → Limitless → TCGplayer (beide über imageProxy = GET /img des Backends, sie schicken
//   keinen CORS-Header; TCGplayer: McDonald's, Trainer-Kits, Celebrations Klassische Kollektion …) → pokemontcg.io
//   (Shiny Vault, Trainer-Galerien … – fehlt dort etwas, kommt eine Kartenrückseite, die als geladen zählt, darum zuletzt)
export function imageSources(src, imageProxy = null) {
  const t = src.match(/^https:\/\/assets\.tcgdex\.net\/(?:de|en)\/([^/]+)\/([^/]+)\/([^/]+)\/(low|high)\.webp$/);
  if (!t) return [src];
  const [, serie, set, num, size] = t;
  const n = num.replace(/^0+(?=\d)/, ""); // pokemontcg.io: „85“, Limitless: „085“
  const sz = size === "high" ? "LG" : "SM";
  const code = imageProxy && LIMITLESS_SETS[set];
  const ln = code && limitlessNumber(set, n);
  return [
    `https://assets.tcgdex.net/de/${serie}/${set}/${num}/${size}.webp`,
    `https://assets.tcgdex.net/en/${serie}/${set}/${num}/${size}.webp`,
    ln && `${imageProxy}?set=${code}&n=${ln}&size=${sz}`,
    imageProxy && `${imageProxy}?card=${encodeURIComponent(`${set}-${num}`)}&size=${sz}`,
    `https://images.pokemontcg.io/${PTCGIO_SETS[set] || set}/${n.replace(/^H0(?=\d)/, "H")}${size === "high" ? "_hires" : ""}.png`, // e-Card „H01“ → „H1“
  ].filter(Boolean);
}

// Bild lädt nicht → nächste noch nicht probierte Quelle. first: Adresse, mit der das Bild gestartet ist; tried: alle bisher
// probierten Adressen. null = keine weitere Quelle (Platzhalter).
export const nextImage = (first, tried, imageProxy = null) => imageSources(first, imageProxy).find((u) => !tried.includes(u)) ?? null;

// Gespeicherte Karte ohne Bild → mit englischem Bild (oder null, wenn nichts zu tun ist)
export const withEnglishImage = (card, serie) => (card.img || !serie ? null : { ...card, img: englishImage(serie, card.set, card.num) });

// „199/165“ wie auf der Karte; Promos ohne Setgröße nur „023“; Nachdrucke mit der Nummer des Originals
export const cardNumber = (card) => printedNumber(card) ?? (card.total ? `${card.num}/${String(card.total).padStart(3, "0")}` : card.num);

// Name auf Deutsch für Karten, die TCGdex nur auf Englisch hat: englischen Pokémon-Namen ersetzen, Schreibweise wie bei
// TCGdex („Mega Dragonite ex“ → „Mega-Dragoran-ex“, „Mega Charizard X ex“ → „Mega-Glurak X-ex“)
export const germanName = (name, enBase, deBase) => (enBase && deBase && name.includes(enBase) ? name.replace(enBase, deBase).replace(/^Mega /, "Mega-").replace(/ ex$/, "-ex") : name);

// Pokémon-Name ohne „Mega-“ und Zusatz: „Mega-Dragoran-ex“ → „Dragoran“
export const pokemonName = (name) => name.trim().replace(/^mega[\s-]+/i, "").replace(/[\s-]+(ex|gx|v|vmax|vstar)$/i, "");

export const cardImage = (card, size) => (card.img ? `${card.img}/${size}.webp` : null);
