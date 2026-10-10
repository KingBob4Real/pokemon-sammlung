import { objOr } from "../core/format.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 730; // höchstens 2 Jahre

// Tag in Ortszeit, z. B. „2026-10-10“
export const dayOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Wertverlauf der Sammlung: einmal pro Tag Gesamtwert und Kartenzahl, { "2026-10-10": { worth, count } }.
 * Pro Person auf dem Gerät, höchstens 2 Jahre. Neue Karten erhöhen den Wert auch – er ist kein Gewinn.
 * ponytail: nicht synchronisiert (bräuchte Tabelle, Backend und Prüfung) – jedes Gerät, das die Sammlung öffnet,
 * schreibt seinen eigenen Verlauf.
 */
export class HistoryService {
  constructor(storage, storageKey, collection, prices) {
    this.storage = storage;
    this.storageKey = storageKey;
    this.collection = collection;
    this.prices = prices;
    this.days = objOr(storage.get(storageKey, {}));
  }

  // Heutigen Wert merken – erst wenn jede Karte der Sammlung einen frischen Preis hat, sonst landen halbe Summen im
  // Verlauf. Der erste vollständige Wert des Tages zählt. → true, wenn gespeichert
  record(now = Date.now()) {
    const day = dayOf(now);
    if (this.days[day]) return false;
    const entries = this.collection.entries();
    if (!entries.length || !entries.every((e) => this.prices.isFresh(e.card.id, now))) return false;
    const s = this.collection.summary((id) => this.prices.value(id), entries);
    this.days[day] = { worth: Math.round(s.worth * 100) / 100, count: s.count };
    const oldest = dayOf(now - KEEP_DAYS * DAY_MS);
    for (const d of Object.keys(this.days)) if (d < oldest) delete this.days[d];
    this.storage.set(this.storageKey, this.days);
    return true;
  }

  // [{ day, worth, count }], ältester Tag zuerst
  series() {
    return Object.keys(this.days)
      .sort()
      .map((day) => ({ day, ...this.days[day] }));
  }

  // Änderung in den letzten n Tagen: neuester Wert minus dem letzten von vor n Tagen (oder früher); null = Verlauf zu kurz
  change(days, now = Date.now()) {
    const all = this.series();
    const limit = dayOf(now - days * DAY_MS);
    const base = all.findLast((e) => e.day <= limit);
    return base ? all.at(-1).worth - base.worth : null;
  }
}
