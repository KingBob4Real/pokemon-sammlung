import { objOr } from "../core/format.js";

// Schlüssel in Form „XXXX-XXXX-…“ bringen (Groß/klein und Leerzeichen egal)
export const normalizeKey = (key) => (String(key).toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g) || []).join("-");

/**
 * Gleicht den lokalen Speicher mit dem Backend ab – mit dem Schlüssel einer Person.
 * Zustand: off (nicht eingerichtet), busy, error, pending (Änderungen warten), ok. Meldet "status".
 */
export class SyncService extends EventTarget {
  #timer = null;
  #busy = false;

  constructor(store, api, storage, storageKey, defaultUrl, batchSize) {
    super();
    this.store = store;
    this.api = api;
    this.storage = storage;
    this.storageKey = storageKey;
    this.batchSize = batchSize;
    this.config = { url: "", key: "", user: "", at: 0, error: "", ...objOr(storage.get(storageKey, {})) };
    if (!this.config.url) this.config.url = defaultUrl;
  }

  get enabled() {
    return Boolean(this.config.url && this.config.key);
  }

  get pendingCount() {
    return this.store.pendingCount;
  }

  get state() {
    if (!this.enabled) return "off";
    if (this.#busy) return "busy";
    if (this.config.error) return "error";
    return this.store.pendingCount ? "pending" : "ok";
  }

  // Wechsel zum Schlüssel einer (womöglich) anderen Person? Dann gehören die Daten auf dem Gerät nicht dazu.
  isOtherKey(key) {
    return Boolean(this.config.key) && normalizeKey(key) !== this.config.key;
  }

  // → null wenn übernommen, sonst der Grund (dann bleibt alles wie es war)
  async configure(url, key) {
    const next = { ...this.config, url: url.trim(), key: normalizeKey(key), error: "" };
    if (this.isOtherKey(key)) {
      // Erst prüfen, ob der neue Schlüssel gilt – ein Tippfehler darf das Gerät nicht leeren
      try {
        await this.api.sync(next, 0, []);
      } catch (e) {
        return e.status === 401 ? "Dieser Schlüssel stimmt nicht – nichts geändert." : "Backend nicht erreichbar – nichts geändert.";
      }
      this.store.reset(); // im Backend bleibt alles, das Gerät holt die Daten der neuen Person
      next.user = "";
      next.at = 0;
    }
    this.config = next;
    this.#save();
    await this.run();
    return null;
  }

  schedule(ms = 1500) {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.run(), ms);
  }

  async run() {
    if (!this.enabled || this.#busy || !navigator.onLine) return this.#notify();
    this.#busy = true;
    this.#notify();
    try {
      // in Päckchen hochladen, bis nichts mehr wartet
      for (let round = 0; round < 50; round++) {
        const sent = this.store.pendingChanges(this.batchSize);
        const result = await this.api.sync(this.config, this.store.rev, sent);
        this.store.applySyncResult(sent, result);
        this.config.user = result.user || "";
        if (!this.store.pendingCount || !sent.length) break;
      }
      this.config.at = Date.now();
      this.config.error = "";
    } catch (e) {
      this.config.error = e.status === 401 ? "Falscher Sync-Schlüssel" : e.status ? `Backend meldet Fehler ${e.status}` : "Backend nicht erreichbar";
    }
    this.#busy = false;
    this.#save();
    this.#notify();
    if (this.store.pendingCount && !this.config.error) this.schedule(); // unterwegs Geändertes nachschieben
  }

  #save() {
    this.storage.set(this.storageKey, this.config);
  }

  #notify() {
    this.dispatchEvent(new Event("status"));
  }
}
