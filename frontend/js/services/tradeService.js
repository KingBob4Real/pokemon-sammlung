import { silentLog } from "../core/log.js";
import { tradeMatches } from "../domain/trade.js";

/**
 * Tauschen mit den anderen in der App: holt Doppelte und Fehlende (GET /trade – braucht Internet und Anmeldung) und
 * gleicht sie mit der eigenen Sammlung und den eigenen Listen ab. Gebucht wird nichts.
 * Die letzte Antwort bleibt nur im Speicher (last), nicht auf dem Gerät. Den Tauschrechner hat services/tradeDraftService.js.
 */
export class TradeService {
  last = null; // { people, at }

  constructor(api, sync, collection, lists, log = silentLog) {
    this.log = log;
    this.api = api;
    this.sync = sync;
    this.collection = collection;
    this.lists = lists;
  }

  async load() {
    let people;
    try {
      ({ people } = await this.sync.call((config) => this.api.trade(config)));
    } catch (e) {
      this.log.warn("trade", "Tauschdaten nicht abrufbar", { status: e.status ?? null, message: e.body?.error ?? e.message });
      throw e;
    }
    this.log.info("trade", "Tauschdaten geladen", { people: people.length, offers: people.reduce((n, p) => n + p.offers.length, 0), missing: people.reduce((n, p) => n + p.missing.length, 0) });
    this.last = { people, at: Date.now() };
    return this.last;
  }

  // → { forMe, forThem } für eine Person aus last.people
  matches(person) {
    return tradeMatches(person, this.collection.entries(), this.lists.allItems().map((i) => i.card));
  }
}
