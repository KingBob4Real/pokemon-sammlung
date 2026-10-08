// Prüft GET /img?set=SVP&n=033&size=SM – nur Set-Kürzel, Nummer (wie bei Limitless dreistellig, Klassische Sammlung
// „CC12“) und Größe, keine freie Adresse (kein offener Proxy).
export function parseImageRequest(url) {
  const { searchParams: q } = new URL(url);
  const [set, n, size] = [q.get("set"), q.get("n"), q.get("size")];
  if (!/^[A-Z0-9]{2,6}$/.test(set || "") || !/^(CC)?\d{1,4}$/.test(n || "") || !["SM", "LG"].includes(size)) return null;
  return { set, n, size };
}
