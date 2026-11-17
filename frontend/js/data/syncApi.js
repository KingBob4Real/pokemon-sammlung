// Zugriff auf das eigene Cloudflare-Backend: POST /sync.

// keepalive: Anfrage läuft weiter, auch wenn die App gerade in den Hintergrund geht. Browser erlauben dafür nur kleine
// Anfragen (64 KiB für alle zusammen) – größere gehen normal raus.
const KEEPALIVE_MAX_BYTES = 60_000;

export class SyncApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { rev, changes: [{ type, id, data, updated, deleted }] }
  async sync({ url, key }, since, changes, { keepalive = false } = {}) {
    const body = JSON.stringify({ since, changes });
    const send = (keepalive) =>
      this.fetchJson(`${url.replace(/\/+$/, "")}/sync`, {
        timeout: 20000,
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        keepalive,
      });
    if (!keepalive || new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) return send(false);
    try {
      return await send(true);
    } catch (e) {
      // Manche Browser lehnen keepalive mit CORS-Vorabanfrage (wegen Authorization) ab → dann eben normal
      if (e instanceof TypeError) return send(false);
      throw e;
    }
  }
}
