import { PERSONAL_KEYS } from "../config.js";
import { describeError } from "../core/errors.js";
import { isObj } from "../core/format.js";

/**
 * „Wer sammelt?“ – wie die Profilauswahl bei Netflix. Die Personen kommen vom Backend, sind also auf jedem
 * Gerät da. Antippen + Passwort meldet dieses Gerät an (eigene Sitzung; Schlüssel sieht der Nutzer nie) – einmal pro Person
 * und Gerät, danach wechselt man dort ohne Passwort. Ohne Passwort lehnt das Backend das erste Anmelden ab – die App ist
 * öffentlich. Ist die Anmeldung abgelaufen (Passwort woanders geändert), fragt die App einmal neu; die Daten bleiben.
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

  // Liste vom Backend holen (Namen, Schloss); offline bleibt die gespeicherte. Läuft schon eine Anfrage, gilt deren Ergebnis.
  refresh() {
    this.#refreshing ??= this.api
      .people(this.url)
      .then(({ people }) => ((this.data.people = people), (this.data.at = Date.now()), this.#save(), true), () => false)
      .finally(() => (this.#refreshing = null));
    return this.#refreshing;
  }

  // Beim Start nur, wenn die Liste älter als maxAge ist – die Personenauswahl lädt beim Öffnen ohnehin frisch
  refreshIfOlder(maxAge, now = Date.now()) {
    return now - (this.data.at || 0) > maxAge ? this.refresh() : Promise.resolve(true);
  }

  #refreshing = null;

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

  // Zu einer Person wechseln → {} (geklappt, App neu laden) | { needPassword } | { error }
  // relogin: die Anmeldung dieses Geräts ist abgelaufen (z. B. Passwort woanders geändert) → neu anmelden, Daten bleiben
  async choose(id, password = "", relogin = false) {
    const person = this.people.find((p) => p.id === id);
    if (!person) return { error: "Diese Person gibt es nicht mehr." };
    const slot = this.#slotFor(id);
    const saved = this.storage.get(this.keysOf(slot).sync, null);
    // Auf diesem Gerät schon angemeldet → einfach wechseln, ohne Passwort (geht auch offline)
    if (relogin || !saved?.key) {
      if (person.locked && !password) return { needPassword: true };
      try {
        const { token, user } = await this.api.login(this.url, id, password);
        this.storage.set(this.keysOf(slot).sync, { at: 0, ...saved, url: this.url, key: token, user: user.name, userId: user.id, error: "", loggedOut: false });
        // die alte Sitzung dieses Geräts beenden – sonst sammelt jeder Wechsel zu einer Person mit Passwort eine an
        if (saved?.key) this.api.logout({ url: this.url, key: saved.key }).catch(() => {});
      } catch (e) {
        const { kind, message } = describeError(e);
        if (kind === "offline") return { error: "Zum Anmelden braucht es Internet." };
        // gespeicherte Liste veraltet: die Person hat inzwischen ein Passwort → danach fragen statt Sackgasse
        if (e.status === 401 && !password) {
          person.locked = true;
          this.#save();
          return { needPassword: true };
        }
        // 401/403/429 bringen eine verständliche Meldung vom Backend mit („Falsches Passwort.“, „… hat noch kein Passwort …“)
        return { error: (e.status >= 400 && e.status < 500 && e.body?.error) || message };
      }
    }
    this.data.slots[id] = slot;
    this.data.active = id;
    this.#save();
    return {};
  }

  // Anmeldung der aktiven Person auf diesem Gerät: { url, key }
  credentials() {
    const saved = this.storage.get(this.keysOf(this.slot).sync, null);
    return { url: this.url, key: saved?.key || "" };
  }

  // Auf diesem Gerät abmelden: Sitzung im Backend beenden und die eigenen Daten der Person vom Gerät löschen
  // (im Backend bleibt alles). ponytail: offline bleibt die Sitzung im Backend gültig, das Gerät kennt sie aber nicht mehr.
  async logout() {
    const keys = this.keysOf(this.slot);
    await this.api.logout(this.credentials()).catch(() => {});
    for (const k of PERSONAL_KEYS) this.storage.remove(keys[k]);
    delete this.data.slots[this.active];
    this.data.active = "";
    this.#save();
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
