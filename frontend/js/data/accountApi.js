// Zugriff aufs eigene Backend für „Wer sammelt?“: Personen, Anmelden, Passwort, Name.
const base = (url) => url.replace(/\/+$/, "");

export class AccountApi {
  constructor(fetchJson) {
    this.fetchJson = fetchJson;
  }

  // → { people: [{ id, name, locked }] }
  people(url) {
    return this.fetchJson(`${base(url)}/people`);
  }

  // → { token, user: { id, name }, firstLogin }; Fehler 401 (Passwort falsch/fehlt), 429 (zu viele Versuche)
  login(url, id, password) {
    return this.#post(url, "/login", { id, password });
  }

  // password leer = entfernen; oldPassword nötig, wenn es schon eins gibt
  setPassword({ url, key }, password, oldPassword) {
    return this.#post(url, "/me/password", { password, oldPassword }, key);
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
