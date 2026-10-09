// Prüft GET /img?set=SVP&n=033&size=SM (Limitless: Set-Kürzel und Nummer – dreistellig, Klassische Sammlung „CC12“,
// 30 Jahre „B“) bzw. GET /img?card=2014xy-1&size=SM (TCGplayer über die TCGdex-ID) – keine freie Adresse (kein offener Proxy).
export function parseImageRequest(url) {
  const { searchParams: q } = new URL(url);
  const [set, n, card, size] = [q.get("set"), q.get("n"), q.get("card"), q.get("size")];
  if (!["SM", "LG"].includes(size)) return null;
  if (card) return /^[A-Za-z0-9.!%-]{3,40}$/.test(card) ? { card, size } : null;
  if (!/^[A-Z0-9]{2,6}$/.test(set || "") || !/^((CC)?\d{1,4}|[A-Z])$/.test(n || "")) return null;
  return { set, n, size };
}
