import { describeError } from "../core/errors.js";
import { isObj } from "../core/format.js";

/**
 * „Wer sammelt?“ – wie die Profilauswahl bei Netflix. Die Personen kommen vom Backend, sind also auf jedem
 * Gerät da. Antippen meldet dieses Gerät an (eigene Sitzung, kein Sync-Schlüssel nötig). Hat eine Person ein
 * Passwort, wird es bei jedem Wechsel zu ihr abgefragt (wie die PIN bei Netflix).
 * ponytail: ohne Passwort kann jeder mit der App-Adresse eine Person antippen – gewollt, „nur für uns 3“.
 * Jede Person hat auf dem Gerät eigene Daten (eigener Speicher-Platz); wer zuerst da war, behält die bisherigen ("").
 * Gespeichert: { active: Person-ID, slots: { Person-ID: Speicher-Platz }, people: [{ id, name, locked }] }
 * Wechseln = Person merken und die App neu laden, damit alles mit deren Daten startet.
 */
export class ProfileService {
  constructor(storage, storageKey, keysOf, api, url) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.keysOf = keysOf; // Speicher-Platz → Speicher-Namen (config.js: storageKeys)
    this.api = api;
    this.url = url;
    const saved = storage.get(storageKey, null);
    this.data = { active: "", slots: {}, people: [], ...(isObj(saved) ? saved : {}) };
  }

  get active() {
    return this.data.active;
  }

  // Speicher-Platz der aktiven Person
  get slot() {
    return this.data.slots[this.active] ?? "";
  }

  get people() {
    return this.data.people;
  }

  // Liste vom Backend holen (Namen, Schloss); offline bleibt die gespeicherte
  async refresh() {
    try {
      this.data.people = (await this.api.people(this.url)).people;
      this.#save();
      return true;
    } catch {
      return false;
    }
  }

  // Sync nennt, wer angemeldet ist – so kennt auch ein Gerät mit altem Sync-Schlüssel „seine“ Person
  remember(id, name) {
    if (!id) return;
    let changed = false;
    if (!this.active) {
      this.data.active = id;
      this.data.slots[id] ??= "";
      changed = true;
    }
    const person = this.people.find((p) => p.id === id);
    if (person && name && person.name !== name) {
      person.name = name;
      changed = true;
    }
    if (changed) this.#save();
  }

  // Zu einer Person wechseln → { firstLogin } (geklappt, App neu laden) | { needPassword } | { error }
  async choose(id, password = "") {
    const person = this.people.find((p) => p.id === id);
    if (!person) return { error: "Diese Person gibt es nicht mehr." };
    const slot = this.#slotFor(id);
    const saved = this.storage.get(this.keysOf(slot).sync, null);
    // Schon angemeldet und ohne Passwort → einfach wechseln (geht auch offline)
    let firstLogin = false;
    if (person.locked || !saved?.key) {
      if (person.locked && !password) return { needPassword: true };
      try {
        const { token, user, firstLogin: first } = await this.api.login(this.url, id, password);
        firstLogin = Boolean(first);
        this.storage.set(this.keysOf(slot).sync, { at: 0, ...saved, url: this.url, key: token, user: user.name, userId: user.id, error: "" });
      } catch (e) {
        const { kind, message } = describeError(e);
        if (kind === "offline") return { error: "Zum Anmelden braucht es Internet." };
        return { error: e.status === 401 || e.status === 429 ? e.body?.error || "Falsches Passwort." : message };
      }
    }
    this.data.slots[id] = slot;
    this.data.active = id;
    this.#save();
    return { firstLogin };
  }

  // Anmeldung der aktiven Person auf diesem Gerät: { url, key }
  credentials() {
    const saved = this.storage.get(this.keysOf(this.slot).sync, null);
    return { url: saved?.url || this.url, key: saved?.key || "" };
  }

  // Passwort festlegen, ändern oder entfernen (leer) – ändern und entfernen nur mit dem alten.
  // Andere Geräte dieser Person werden dabei abgemeldet. → {} | { error }
  async setPassword(password, oldPassword = "") {
    return this.#account(() => this.api.setPassword(this.credentials(), password, oldPassword));
  }

  // → { name } | { error }
  async rename(name) {
    return this.#account(() => this.api.rename(this.credentials(), name));
  }

  async #account(call) {
    try {
      const result = await call();
      await this.refresh();
      return result;
    } catch (e) {
      // 400/401/429 bringen eine verständliche Meldung vom Backend mit („Falsches Passwort.“ …)
      return { error: (e.status >= 400 && e.status < 500 && e.body?.error) || describeError(e).message };
    }
  }

  // Wer zum ersten Mal auf dem Gerät ist, bekommt einen eigenen Platz – oder den bisherigen, falls der frei ist
  #slotFor(id) {
    if (id in this.data.slots) return this.data.slots[id];
    const legacyTaken = Object.values(this.data.slots).includes("") || this.storage.get(this.keysOf("").sync, null)?.key;
    return legacyTaken ? id : "";
  }

  #save() {
    this.storage.set(this.storageKey, this.data);
  }
}
