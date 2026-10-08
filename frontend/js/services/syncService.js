import { describeError } from "../core/errors.js";
import { objOr, plural } from "../core/format.js";

// Schlüssel in Form „XXXX-XXXX-…“ bringen (Groß/klein und Leerzeichen egal)
export const normalizeKey = (key) => (String(key).toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g) || []).join("-");

// Wartezeit bis zum nächsten Versuch nach einem vorübergehenden Fehler (Netz weg, Server-Problem)
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000];

/**
 * Gleicht den lokalen Speicher mit dem Backend ab – mit dem Schlüssel einer Person.
 * Zustand: off (nicht eingerichtet), offline, busy, error, pending (Änderungen warten), ok. Meldet "status".
 * Vorübergehende Fehler werden automatisch später nochmal versucht. Lehnt der Server einen einzelnen
 * Eintrag ab, bleibt dieser nur auf dem Gerät und der Rest synchronisiert weiter.
 * Für Hinweise an den Nutzer meldet er "problem" (detail: { kind, message }) – einmal pro neuem Problem.
 */
export class SyncService extends EventTarget {
  #timer = null;
  #busy = false;
  #attempt = 0; // wievielter Fehlversuch in Folge
  #lastProblem = ""; // damit dasselbe Problem nicht bei jedem Versuch gemeldet wird

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
    if (!navigator.onLine) return "offline";
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
    if (!next.url) return "Bitte die Backend-Adresse eintragen.";
    if (!next.key) return "Bitte den Sync-Schlüssel eintragen.";
    if (this.isOtherKey(key)) {
      // Erst prüfen, ob der neue Schlüssel gilt – ein Tippfehler darf das Gerät nicht leeren
      try {
        await this.api.sync(next, 0, []);
      } catch (e) {
        const { kind, message } = describeError(e);
        return kind === "auth" ? "Dieser Schlüssel stimmt nicht – nichts geändert." : `${message} Nichts geändert.`;
      }
      this.store.reset(); // im Backend bleibt alles, das Gerät holt die Daten der neuen Person
      next.user = "";
      next.at = 0;
    }
    this.config = next;
    this.#attempt = 0;
    this.#lastProblem = "";
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
    clearTimeout(this.#timer);
    this.#busy = true;
    this.#notify();
    let rejected = 0;
    try {
      // in Päckchen hochladen, bis nichts mehr wartet
      for (let round = 0; round < 50; round++) {
        const sent = this.store.pendingChanges(this.batchSize);
        let result;
        try {
          result = await this.api.sync(this.config, this.store.rev, sent);
        } catch (e) {
          // Einzelner Eintrag abgelehnt? Diesen zurückhalten und weitermachen, statt alles zu blockieren
          const bad = e.status === 400 && Number.isInteger(e.body?.index) ? sent[e.body.index] : null;
          if (!bad) throw e;
          this.store.markRejected(bad);
          rejected++;
          continue;
        }
        this.store.applySyncResult(sent, result);
        this.config.user = result.user || "";
        this.config.userId = result.userId || "";
        if (!this.store.pendingCount || !sent.length) break;
      }
      this.config.at = Date.now();
      this.config.error = "";
      this.#attempt = 0;
      this.#lastProblem = "";
    } catch (e) {
      const problem = describeError(e);
      if (problem.retry) problem.message += " Neuer Versuch läuft automatisch.";
      this.config.error = problem.message;
      if (problem.message !== this.#lastProblem) this.#report(problem);
      this.#lastProblem = problem.message;
      // vorübergehend? Dann später von selbst nochmal (immer längere Pausen)
      if (problem.retry) this.schedule(RETRY_DELAYS_MS[Math.min(this.#attempt++, RETRY_DELAYS_MS.length - 1)]);
    }
    this.#busy = false;
    this.#save();
    this.#notify();
    if (rejected) {
      this.#report({ kind: "rejected", message: `${plural(rejected, "Eintrag konnte", "Einträge konnten")} nicht synchronisiert werden und ${rejected === 1 ? "bleibt" : "bleiben"} nur auf diesem Gerät.` });
    }
    if (this.store.pendingCount && !this.config.error) this.schedule(); // unterwegs Geändertes nachschieben
  }

  #report(problem) {
    this.dispatchEvent(new CustomEvent("problem", { detail: problem }));
  }

  #save() {
    this.storage.set(this.storageKey, this.config);
  }

  #notify() {
    this.dispatchEvent(new Event("status"));
  }
}
