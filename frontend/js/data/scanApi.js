// Zugriff auf das eigene Cloudflare-Backend: POST /scan (Karten-Scanner), GET /scan/usage (übrige Scans heute).
export class ScanApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { remaining }
  usage({ url, key }) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/scan/usage`, { headers: { Authorization: `Bearer ${key}` } });
  }

  // image: "data:image/jpeg;base64,…" → { recognized: { name, number, total, setCode, language, confidence }, remaining }
  scan({ url, key }, image) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/scan`, {
      timeout: 30000,
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
  }
}
