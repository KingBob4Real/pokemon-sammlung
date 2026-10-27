// Zugriff aufs eigene Backend für „Wer sammelt?“: Personen, Anmelden, Name.
const base = (url) => url.replace(/\/+$/, "");

export class AccountApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { people: [{ id, name }] }
  people(url) {
    return this.fetchJson(`${base(url)}/people`);
  }

  // → { token, user: { id, name } }
  login(url, id) {
    return this.#post(url, "/login", { id });
  }

  // beendet die Sitzung dieses Geräts (mit dem Sync-Schlüssel: nichts zu beenden)
  logout({ url, key }) {
    return this.#post(url, "/logout", {}, key);
  }

  rename({ url, key }, name) {
    return this.#post(url, "/me/name", { name }, key);
  }

  #post(url, path, payload, key) {
    return this.fetchJson(`${base(url)}${path}`, {
      method: "POST",
      headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
}
