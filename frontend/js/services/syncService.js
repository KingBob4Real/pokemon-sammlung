import { describeError } from "../core/errors.js";
import { objOr, plural } from "../core/format.js";
import { silentLog } from "../core/log.js";

// Schlüssel in Form „XXXX-XXXX-…“ bringen (Groß/klein und Leerzeichen egal)
export const normalizeKey = (key) => (String(key).toUpperCase().replace(/[^A-Z0-9]/g, "").match(/.{1,4}/g) || []).join("-");

// Wartezeit bis zum nächsten Versuch nach einem vorübergehenden Fehler (Netz weg, Server-Problem)
const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000];
const CLOCK_NOTE_MS = 60_000; // geht die Uhr des Geräts mehr als 1 min falsch, steht es im Protokoll

/**
 * Gleicht den lokalen Speicher mit dem Backend ab – mit der Anmeldung (Sitzung oder Sync-Schlüssel) einer Person.
 * Zustand: off (nicht eingerichtet), offline, busy, error, pending (Änderungen warten), ok. Meldet "status".
 * Vorübergehende Fehler werden automatisch später nochmal versucht. Lehnt der Server einen einzelnen
 * Eintrag ab, bleibt dieser nur auf dem Gerät und der Rest synchronisiert weiter.
 * Gilt die Anmeldung nicht mehr (401, z. B. Sitzung im Backend beendet), meldet sich das Gerät selbst neu an (relogin) –
 * ohne das hing ein abgemeldetes Gerät für immer fest und lud nichts mehr hoch.
 * Für Hinweise an den Nutzer meldet er "problem" (detail: { kind, message }) – einmal pro neuem Problem.
 */
export class SyncService extends EventTarget {
  #timer = null;
  #busy = false;
  #attempt = 0; // wievielter Fehlversuch in Folge
  #lastProblem = ""; // damit dasselbe Problem nicht bei jedem Versuch gemeldet wird
  #lastContact = 0; // wann zuletzt eine Anfrage rausging – jeder Abgleich holt auch ab, was andere Geräte geändert haben
  #relogging = null;

  /**
   * relogin(ownerId) → { key, user, userId } | null: neue Anmeldung für die Person, der die Daten gehören
   * (services/profileService.js). log: Protokoll (core/log.js).
   */
  constructor(store, api, storage, storageKey, defaultUrl, batchSize, { log = silentLog, relogin = null } = {}) {
    super();
    this.store = store;
    this.api = api;
    this.storage = storage;
    this.storageKey = storageKey;
    this.batchSize = batchSize;
    this.log = log;
    this.relogin = relogin;
    this.config = { url: "", key: "", user: "", at: 0, error: "", offset: 0, ...objOr(storage.get(storageKey, {})) };
    this.config.url = defaultUrl; // fest – die Adresse ist in der App nicht mehr einstellbar
    store.clockOffset = Number.isSafeInteger(this.config.offset) ? this.config.offset : 0;
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
  async configure(key) {
    const next = { ...this.config, key: normalizeKey(key), error: "" };
    if (!next.key) return "Bitte den Sync-Schlüssel eintragen.";
    if (this.isOtherKey(key)) {
      // Erst prüfen, ob der neue Schlüssel gilt – ein Tippfehler darf das Gerät nicht leeren
      try {
        await this.api.sync(next, 0, []);
      } catch (e) {
        const { kind, message } = describeError(e);
        this.log.warn("sync", "Sync-Schlüssel abgelehnt", { kind, status: e.status ?? null });
        return kind === "auth" ? "Dieser Schlüssel stimmt nicht – nichts geändert." : `${message} Nichts geändert.`;
      }
      this.log.info("sync", "Sync-Schlüssel gewechselt – Daten der neuen Person werden geholt", { pending: this.store.pendingCount });
      this.store.reset(); // im Backend bleibt alles, das Gerät holt die Daten der neuen Person; Nicht-Hochgeladenes geht mit
      next.user = "";
      next.userId = "";
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

  // Abholen, was andere Geräte geändert haben – außer die letzte Anfrage ist kürzer als minGap her
  // (Fokus und Sichtbarkeit melden sich oft kurz nacheinander).
  pull(minGap = 0) {
    if (this.#busy || Date.now() - this.#lastContact < minGap) return;
    return this.run();
  }

  // App geht in den Hintergrund (Handy gesperrt, Tab gewechselt): Wartendes sofort hochladen statt nach der kurzen
  // Pause von schedule() – im Hintergrund hält das Handy Zeitgeber an, die Änderung käme sonst erst beim nächsten
  // Öffnen an und die anderen Geräte sähen sie so lange nicht.
  flush() {
    if (!this.store.pendingCount) return;
    return this.run({ background: true });
  }

  // background: läuft beim Verlassen der App – Anfragen mit keepalive, Probleme erst beim nächsten Mal melden
  async run({ background = false } = {}) {
    if (!this.enabled || this.#busy || !navigator.onLine) return this.#notify();
    clearTimeout(this.#timer);
    this.#busy = true;
    this.#notify();
    const started = Date.now();
    const stats = { sent: 0, received: 0 };
    const wasBroken = Boolean(this.config.error);
    let rejected = 0;
    const request = (changes) => this.#request(changes, { keepalive: background }, stats);
    try {
      // Wartet etwas? Dann erst abholen: Was andere Geräte an denselben Einträgen geändert haben, führt der Speicher
      // Feld für Feld mit den eigenen Änderungen zusammen – sonst überschriebe der ganze Eintrag von hier deren Felder.
      // ponytail: ändert ein anderes Gerät genau zwischen Abholen und Hochladen, gewinnt wieder der ganze Eintrag
      if (this.store.pendingCount) this.store.applySyncResult([], await request([]));
      // in Päckchen hochladen, bis nichts mehr wartet
      for (let round = 0; round < 50; round++) {
        const sent = this.store.pendingChanges(this.batchSize);
        let result;
        try {
          result = await request(sent);
        } catch (e) {
          // Einzelner Eintrag abgelehnt? Diesen zurückhalten und weitermachen, statt alles zu blockieren
          const bad = e.status === 400 && Number.isInteger(e.body?.index) ? sent[e.body.index] : null;
          if (!bad) throw e;
          this.log.warn("sync", "Eintrag vom Server abgelehnt – bleibt nur auf diesem Gerät", { type: bad.type, id: bad.id, reason: e.body?.reason ?? e.body?.error ?? null });
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
      // Ruhige Abholungen ohne Neues nicht protokollieren (alle 30 s), alles andere schon
      if (stats.sent || stats.received || wasBroken || background) {
        this.log.info("sync", wasBroken ? "Abgleich klappt wieder" : "Abgleich", { ...stats, rejected, pending: this.store.pendingCount, rev: this.store.rev, ms: Date.now() - started, background });
      }
    } catch (e) {
      const problem = describeError(e);
      if (problem.retry) problem.message += " Neuer Versuch läuft automatisch.";
      this.config.error = problem.message;
      this.log[problem.retry ? "warn" : "error"]("sync", "Abgleich fehlgeschlagen", {
        kind: problem.kind,
        status: e.status ?? null,
        message: e.body?.error ?? e.message,
        attempt: this.#attempt + 1,
        pending: this.store.pendingCount,
        background,
      });
      // im Hintergrund nicht melden (z. B. Netz beim Sperren schon weg) – der nächste Versuch meldet es, falls es bleibt
      if (!background && problem.message !== this.#lastProblem) {
        this.#report(problem);
        this.#lastProblem = problem.message;
      }
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

  /**
   * Anfrage mit der Anmeldung dieses Geräts: fn(config) → Promise. Gilt die Anmeldung nicht mehr (401), meldet sich das
   * Gerät neu an und versucht es genau einmal nochmal. Auch für Scanner und Tauschen.
   */
  async call(fn) {
    try {
      return await fn(this.config);
    } catch (e) {
      if (e.status !== 401 || !(await this.#relogin())) throw e;
      return fn(this.config);
    }
  }

  /**
   * „Stand dieses Geräts auf alle Geräte übertragen“: Danach hat der Server genau, was hier ist – was es hier nicht gibt,
   * wird dort gelöscht. Die anderen Geräte holen es beim nächsten Abgleich. fromRescue: vorher den Stand von vor der
   * letzten Reparatur der Anmeldung zurückholen (EntityStore.saveRescue). → null wenn alles oben ist, sonst der Grund.
   */
  async takeOver({ fromRescue = false } = {}) {
    if (!this.enabled) return "Erst unter „Wer sammelt?“ anmelden.";
    if (!navigator.onLine) return describeError(null).message;
    if (this.#busy) return "Gerade läuft ein Abgleich – bitte gleich nochmal.";
    this.#busy = true;
    let counts;
    try {
      const all = await this.call((config) => this.api.sync(config, 0, []));
      counts = this.store.takeOver(all.changes, { fromRescue });
      this.log.warn("sync", "Stand dieses Geräts wird auf alle Geräte übertragen", { ...counts, fromRescue });
    } catch (e) {
      const { message } = describeError(e);
      this.log.error("sync", "Übertragen fehlgeschlagen", { status: e.status ?? null, message: e.body?.error ?? e.message });
      return message;
    } finally {
      this.#busy = false;
    }
    await this.run();
    if (this.config.error) return this.config.error;
    if (this.store.pendingCount) return `${plural(this.store.pendingCount, "Eintrag wartet", "Einträge warten")} noch aufs Hochladen.`;
    this.store.dropRescue();
    this.log.info("sync", "Übertragen fertig", counts);
    return null;
  }

  // Neu anmelden, höchstens einmal gleichzeitig (Sync, Scanner und Tauschen können zugleich auf 401 stoßen)
  #relogin() {
    this.#relogging ??= this.#renewLogin().finally(() => (this.#relogging = null));
    return this.#relogging;
  }

  // → true, wenn die neue Anmeldung gilt. Netzprobleme werden weitergeworfen (dann später nochmal).
  async #renewLogin() {
    if (!this.relogin) return false;
    const owner = this.config.userId || "";
    this.log.warn("auth", "Anmeldung ungültig (401) – melde dieses Gerät neu an", { person: owner || null, pending: this.store.pendingCount });
    // Was hier noch nicht oben ist, vorher sichern: bringt der nächste Abgleich Änderungen anderer Geräte mit, lässt sich
    // der Stand von vorher unter „Mehr“ trotzdem noch auf alle Geräte übertragen
    if (this.store.pendingCount && this.store.saveRescue()) this.log.info("store", "Stand vor der Reparatur gesichert", { pending: this.store.pendingCount });
    let fresh;
    try {
      fresh = await this.relogin(owner);
    } catch (e) {
      const problem = describeError(e);
      this.log.error("auth", "Neu anmelden fehlgeschlagen", { kind: problem.kind, status: e.status ?? null, message: e.body?.error ?? e.message });
      if (problem.retry) throw e;
      return false;
    }
    if (!fresh?.key) {
      this.log.error("auth", "Neu anmelden nicht möglich – unbekannt, wem die Daten gehören", { person: owner || null });
      return false;
    }
    if (owner && fresh.userId && fresh.userId !== owner) {
      // nie die Daten einer Person unter einer anderen hochladen
      this.log.error("auth", "Neue Anmeldung gehört einer anderen Person – nicht übernommen", { expected: owner, got: fresh.userId });
      return false;
    }
    this.config = { ...this.config, key: fresh.key, user: fresh.user || this.config.user, userId: fresh.userId || owner, error: "" };
    this.#save();
    this.log.info("auth", "Gerät neu angemeldet", { person: this.config.userId });
    return true;
  }

  // Ein Abgleich; nebenbei die Uhr des Geräts an der des Servers messen (Mitte zwischen Senden und Antwort)
  async #request(changes, opts, stats) {
    let sentAt = 0;
    const result = await this.call((config) => {
      sentAt = this.#lastContact = Date.now();
      return this.api.sync(config, this.store.rev, changes, opts);
    });
    if (Number.isSafeInteger(result?.now)) {
      const offset = Math.round(result.now - (sentAt + Date.now()) / 2);
      if (Math.abs(offset) > CLOCK_NOTE_MS && Math.abs(offset - this.store.clockOffset) > CLOCK_NOTE_MS) this.log.info("sync", "Uhr des Geräts geht falsch – Zeitstempel werden angeglichen", { offsetSeconds: Math.round(offset / 1000) });
      this.store.clockOffset = this.config.offset = offset;
    }
    if (stats) {
      const sentKeys = new Set(changes.map((c) => `${c.type}:${c.id}`));
      stats.sent += changes.length;
      stats.received += (result?.changes || []).filter((e) => !sentKeys.has(`${e.type}:${e.id}`)).length;
    }
    return result;
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
