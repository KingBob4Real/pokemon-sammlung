// Prüft GET /img?set=SVP&n=175&size=SM – nur Set-Kürzel, Nummer und Größe, keine freie Adresse (kein offener Proxy).
export function parseImageRequest(url) {
  const { searchParams: q } = new URL(url);
  const [set, n, size] = [q.get("set"), q.get("n"), q.get("size")];
  if (!/^[A-Z0-9]{2,6}$/.test(set || "") || !/^[1-9]\d{0,3}$/.test(n || "") || !["SM", "LG"].includes(size)) return null;
  return { set, n, size };
}
