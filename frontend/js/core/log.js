/**
 * Protokoll der App: was passiert ist (Start, Sync, Anmelden, Fehler …), damit sich Probleme im Nachhinein finden lassen.
 *   log.info("sync", "Abgleich", { sent: 3 }) · log.warn(…) · log.error(…)
 * Liegt im localStorage als Ringpuffer (die ältesten fliegen raus) und geht zusätzlich in die Konsole.
 * Ansehen, kopieren und ans Backend schicken unter „Mehr“ → „Protokoll“. Warnungen und Fehler schickt die App von selbst
 * ans Backend (ship), dort stehen sie in den Cloudflare-Logs neben denen der anderen Geräte.
 * Nie Schlüssel, Sitzungen, Fotos oder ganze Datensätze protokollieren – nur IDs, Zahlen und Gründe.
 */
const MAX_ENTRIES = 400;
const MAX_MESSAGE = 300;
const MAX_DATA = 600;
const SHIP_GAP_MS = 60_000; // Warnungen/Fehler höchstens einmal pro Minute hochschicken
const SHIP_BATCH = 50;

// Fehlerobjekte lesbar machen (JSON.stringify(Error) ergibt „{}“)
const plain = (value) => {
  if (value instanceof Error) return { name: value.name, message: value.message, status: value.status, stack: String(value.stack || "").split("\n").slice(0, 4).join(" | ") };
  return value;
};

function clip(data) {
  if (data == null) return undefined;
  try {
    const json = JSON.stringify(plain(data), (k, v) => plain(v));
    return json.length <= MAX_DATA ? JSON.parse(json) : `${json.slice(0, MAX_DATA)}…`;
  } catch {
    return String(data).slice(0, MAX_DATA);
  }
}

export class Log {
  #entries;
  #seq;
  #shipped;
  #shipping = null;
  #lastShip = 0;
  context = {}; // { person } – steht bei jedem Eintrag dabei

  constructor(storage, key, { max = MAX_ENTRIES, out = globalThis.console, now = () => Date.now() } = {}) {
    this.storage = storage;
    this.key = key;
    this.max = max;
    this.out = out;
    this.now = now;
    const saved = storage.get(key, null);
    this.#entries = Array.isArray(saved?.entries) ? saved.entries.slice(-max) : [];
    this.#seq = Number.isSafeInteger(saved?.seq) ? saved.seq : 0;
    this.#shipped = Number.isSafeInteger(saved?.shipped) ? saved.shipped : 0;
    this.device = typeof saved?.device === "string" ? saved.device : Math.random().toString(36).slice(2, 10);
  }

  info(area, message, data) {
    this.#add("info", area, message, data);
  }

  warn(area, message, data) {
    this.#add("warn", area, message, data);
  }

  error(area, message, data) {
    this.#add("error", area, message, data);
  }

  // neueste zuletzt
  entries() {
    return [...this.#entries];
  }

  clear() {
    this.#entries = [];
    this.#shipped = this.#seq;
    this.#persist();
  }

  // Als Text zum Kopieren/Teilen: Kopf mit Gerät, dann eine Zeile pro Eintrag
  text(header = {}) {
    const head = Object.entries({ device: this.device, ...header }).map(([k, v]) => `${k}: ${v}`).join(" · ");
    const lines = this.#entries.map((e) => `${new Date(e.t).toISOString()} ${e.l.toUpperCase().padEnd(5)} [${e.a}]${e.p ? ` (${e.p})` : ""} ${e.m}${e.d === undefined ? "" : ` ${JSON.stringify(e.d)}`}`);
    return [head, ...lines].join("\n");
  }

  /**
   * Warnungen und Fehler, die noch nicht beim Backend sind, hochschicken: send(entries) → Promise.
   * all: alles (auch info), z. B. über den Knopf unter „Mehr“. Klappt es nicht, bleibt es für den nächsten Versuch.
   * → Anzahl geschickt (0 = nichts zu tun oder zu früh)
   */
  async ship(send, { all = false, force = false } = {}) {
    if (this.#shipping) return this.#shipping;
    if (!force && this.now() - this.#lastShip < SHIP_GAP_MS) return 0;
    const due = all ? this.#entries.slice(-100) : this.#entries.filter((e) => e.s > this.#shipped && e.l !== "info").slice(-SHIP_BATCH);
    if (!due.length) return 0;
    this.#lastShip = this.now();
    this.#shipping = send(due)
      .then(() => {
        this.#shipped = Math.max(this.#shipped, due[due.length - 1].s);
        this.#persist();
        return due.length;
      })
      .finally(() => (this.#shipping = null));
    return this.#shipping;
  }

  #add(level, area, message, data) {
    const entry = { s: ++this.#seq, t: this.now(), l: level, a: String(area), m: String(message).slice(0, MAX_MESSAGE) };
    const d = clip(data);
    if (d !== undefined) entry.d = d;
    if (this.context.person) entry.p = this.context.person;
    this.#entries.push(entry);
    if (this.#entries.length > this.max) this.#entries.splice(0, this.#entries.length - this.max);
    this.#persist();
    try {
      this.out?.[level === "info" ? "log" : level]?.(`[${entry.a}] ${entry.m}`, ...(d === undefined ? [] : [d]));
    } catch {
      /* Konsole fehlt: egal */
    }
  }

  #persist() {
    // ponytail: schlägt Speichern fehl (voll), geht nur das Protokoll verloren – die App läuft weiter
    this.storage.set(this.key, { device: this.device, seq: this.#seq, shipped: this.#shipped, entries: this.#entries });
  }
}

// Ersatz, wo kein Protokoll übergeben wird (z. B. in Tests)
export const silentLog = { info() {}, warn() {}, error() {}, context: {} };
