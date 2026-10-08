import { describeError } from "../core/errors.js";
import { isObj } from "../core/format.js";
import { normalizeKey } from "./syncService.js";

/**
 * Personen auf diesem Gerät – wie Profile bei Netflix: jede mit eigener Sammlung, eigenen Listen und eigenem
 * Sync-Schlüssel. Den Schlüssel gibt jede Person pro Gerät einmal ein, danach reicht Antippen.
 * ponytail: kein Passwort zwischen den Personen – wer das Gerät hat, kann wechseln (wie bei Netflix ohne PIN).
 * Gespeichert: { active, list: [{ id, name }] }. id "" = erste Person (ihre Daten liegen unter den alten Namen).
 * Wechseln heißt: aktive Person merken und die App neu laden – dann startet alles mit deren Daten.
 */
export class ProfileService {
  constructor(storage, storageKey, keysOf, api) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.keysOf = keysOf; // Person → ihre Speicher-Namen (config.js: storageKeys)
    this.api = api;
    const saved = storage.get(storageKey, null);
    this.data = { active: "", list: [], ...(isObj(saved) ? saved : {}) };
  }

  get active() {
    return this.data.active;
  }

  get list() {
    return this.data.list;
  }

  // Name der aktiven Person merken, sobald das Backend ihn beim Sync nennt
  remember(name) {
    if (!name) return;
    const me = this.list.find((p) => p.id === this.active);
    if (me?.name === name) return;
    if (me) me.name = name;
    else this.list.push({ id: this.active, name });
    this.#save();
  }

  // Neue Person mit ihrem Schlüssel prüfen und anlegen → { id } (danach switchTo) oder { error }
  async add(url, key) {
    const normalized = normalizeKey(key);
    if (!normalized) return { error: "Bitte den Sync-Schlüssel eintragen." };
    const known = this.list.find((p) => this.storage.get(this.keysOf(p.id).sync, null)?.key === normalized);
    if (known) return { id: known.id }; // schon auf dem Gerät → einfach dorthin wechseln
    let name;
    try {
      name = (await this.api.sync({ url, key: normalized }, Number.MAX_SAFE_INTEGER, [])).user; // nur prüfen, nichts laden
    } catch (e) {
      const { kind, message } = describeError(e);
      return { error: kind === "auth" ? "Dieser Schlüssel stimmt nicht." : message };
    }
    // Die aktive Person ist noch niemand (Gerät ohne Sync)? Dann wird sie es – sonst ein neuer Platz.
    const unclaimed = !this.list.some((p) => p.id === this.active) && !this.storage.get(this.keysOf(this.active).sync, null)?.key;
    const id = unclaimed ? this.active : `p${Date.now().toString(36)}`;
    this.storage.set(this.keysOf(id).sync, { url, key: normalized, user: name, at: 0, error: "" });
    this.list.push({ id, name });
    this.#save();
    return { id };
  }

  switchTo(id) {
    this.data.active = id;
    this.#save();
  }

  // Person von diesem Gerät entfernen (im Backend bleibt alles). Nicht die gerade aktive.
  remove(id) {
    if (id === this.active) return;
    for (const [name, key] of Object.entries(this.keysOf(id))) if (["entities", "dirty", "rev", "sync", "prefs"].includes(name)) this.storage.remove(key);
    this.data.list = this.list.filter((p) => p.id !== id);
    this.#save();
  }

  #save() {
    this.storage.set(this.storageKey, this.data);
  }
}
