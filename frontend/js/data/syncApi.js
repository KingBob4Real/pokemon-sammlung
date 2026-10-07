// Zugriff auf das eigene Cloudflare-Backend: POST /sync.
export class SyncApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { rev, changes: [{ type, id, data, updated, deleted }] }
  sync({ url, key }, since, changes) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/sync`, {
      timeout: 20000,
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ since, changes }),
    });
  }
}
