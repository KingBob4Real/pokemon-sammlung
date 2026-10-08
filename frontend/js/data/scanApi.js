// Zugriff auf das eigene Cloudflare-Backend: POST /scan (Karten-Scanner).
export class ScanApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // image: "data:image/jpeg;base64,…" → { recognized: { name, number, total, setCode, language, confidence } }
  scan({ url, key }, image) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/scan`, {
      timeout: 30000,
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image }),
    });
  }
}
