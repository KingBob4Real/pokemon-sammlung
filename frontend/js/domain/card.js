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

// Gespeicherte Karte ohne Bild → mit englischem Bild (oder null, wenn nichts zu tun ist)
export const withEnglishImage = (card, serie) => (card.img || !serie ? null : { ...card, img: englishImage(serie, card.set, card.num) });

// „199/165“ wie auf der Karte; Promos ohne Setgröße nur „023“
export const cardNumber = (card) => (card.total ? `${card.num}/${String(card.total).padStart(3, "0")}` : card.num);

export const cardImage = (card, size) => (card.img ? `${card.img}/${size}.webp` : null);
