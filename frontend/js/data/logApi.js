// Protokoll des Geräts ans eigene Backend: POST /log. Dort landet es in den Cloudflare-Logs (event = "device").
// Geht auch mit ungültiger Anmeldung – dann sagt nur "person", wer das Gerät zu sein glaubt.
export class LogApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  send({ url, key }, { device, person, version, entries }) {
    return this.fetchJson(`${url.replace(/\/+$/, "")}/log`, {
      timeout: 15000,
      method: "POST",
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify({ device, person, version, ua: navigator.userAgent.slice(0, 200), entries }),
    });
  }
}
