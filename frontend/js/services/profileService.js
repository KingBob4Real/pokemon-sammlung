import { PERSONAL_KEYS } from "../config.js";
import { describeError } from "../core/errors.js";
import { isObj } from "../core/format.js";
import { silentLog } from "../core/log.js";

/**
 * „Wer sammelt?“ – wie die Profilauswahl bei Netflix. Die Personen kommen vom Backend, sind also auf jedem
 * Gerät da. Antippen meldet dieses Gerät an (eigene Sitzung, kein Sync-Schlüssel nötig), ohne Passwort.
 * Jede Person hat auf dem Gerät eigene Daten (eigener Speicher-Platz); wer zuerst da war, behält die bisherigen ("").
 * Gespeichert: { active: Person-ID, slots: { Person-ID: Speicher-Platz }, people: [{ id, name }] }
 * Wechseln = Person merken und die App neu laden, damit alles mit deren Daten startet.
 */
export class ProfileService {
  constructor(storage, storageKey, keysOf, api, url, log = silentLog) {
    this.storage = storage;
    this.log = log;
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

  // Liste vom Backend holen (Namen); offline bleibt die gespeicherte. Läuft schon eine Anfrage, gilt deren Ergebnis.
  refresh() {
    this.#refreshing ??= this.api
      .people(this.url)
      .then(
        ({ people }) => ((this.data.people = people), (this.data.at = Date.now()), this.#save(), true),
        (e) => (this.log.warn("profile", "Personenliste nicht abrufbar", { status: e?.status ?? null, message: e?.message }), false)
      )
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
      this.log.info("profile", "Person vom Sync übernommen", { person: id, slot: this.data.slots[id] || "(erste)" });
    }
    const person = this.people.find((p) => p.id === id);
    if (person && name && person.name !== name) {
      person.name = name;
      changed = true;
    }
    if (changed) this.#save();
  }

  // Zu einer Person wechseln → {} (geklappt, App neu laden) | { error }
  async choose(id) {
    const person = this.people.find((p) => p.id === id);
    if (!person) return { error: "Diese Person gibt es nicht mehr." };
    const slot = this.#slotFor(id);
    const saved = this.storage.get(this.keysOf(slot).sync, null);
    // Schon angemeldet → einfach wechseln (geht auch offline). Gilt die Anmeldung nicht mehr, meldet der Sync neu an.
    if (!saved?.key) {
      try {
        const { token, user } = await this.api.login(this.url, id);
        this.storage.set(this.keysOf(slot).sync, { at: 0, ...saved, url: this.url, key: token, user: user.name, userId: user.id, error: "" });
        this.log.info("profile", "Angemeldet", { person: id, slot: slot || "(erste)" });
      } catch (e) {
        const { kind, message } = describeError(e);
        this.log.warn("profile", "Anmelden fehlgeschlagen", { person: id, kind, status: e.status ?? null });
        if (kind === "offline") return { error: "Zum Anmelden braucht es Internet." };
        // 404 bringt eine verständliche Meldung vom Backend mit („Diese Person gibt es nicht.“)
        return { error: (e.status >= 400 && e.status < 500 && e.body?.error) || message };
      }
    }
    this.log.info("profile", "Person gewechselt", { from: this.active || null, to: id, slot: slot || "(erste)", loggedIn: Boolean(saved?.key) });
    this.data.slots[id] = slot;
    this.data.active = id;
    this.#save();
    return {};
  }

  /**
   * Anmeldung dieses Geräts erneuern, weil die alte nicht mehr gilt (z. B. Sitzung im Backend beendet). Ohne Passwort,
   * nur mit der Person. ownerId: wem die Daten auf dem Gerät gehören (sagt der Sync) – sonst die aktive Person.
   * → { key, user, userId } | null (keine Person bekannt). Netzfehler und 404 (Person gelöscht) werden geworfen.
   */
  async relogin(ownerId) {
    const id = ownerId || this.active;
    if (!id) return null;
    const { token, user } = await this.api.login(this.url, id, "relogin");
    this.log.info("profile", "Neue Sitzung für dieses Gerät", { person: user.id });
    return { key: token, user: user.name, userId: user.id };
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
    await this.api.logout(this.credentials()).catch((e) => this.log.warn("profile", "Abmelden im Backend fehlgeschlagen", { status: e?.status ?? null }));
    this.log.info("profile", "Abgemeldet – Daten der Person vom Gerät entfernt", { person: this.active, slot: this.slot || "(erste)" });
    for (const k of PERSONAL_KEYS) this.storage.remove(keys[k]);
    delete this.data.slots[this.active];
    this.data.active = "";
    this.#save();
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
      this.log.warn("profile", "Konto-Aktion fehlgeschlagen", { status: e.status ?? null, message: e.body?.error ?? e.message });
      // 400/401 bringen eine verständliche Meldung vom Backend mit
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
