import { tradeMatches } from "../domain/trade.js";

/**
 * Tauschen mit den anderen in der App: holt Doppelte und Fehlende (GET /trade – braucht Internet und Anmeldung) und
 * gleicht sie mit der eigenen Sammlung und den eigenen Listen ab. Gebucht wird nichts.
 * Die letzte Antwort bleibt nur im Speicher (last), nicht auf dem Gerät. Den Tauschrechner hat services/tradeDraftService.js.
 */
export class TradeService {
  last = null; // { people, at }

  constructor(api, sync, collection, lists) {
    this.api = api;
    this.sync = sync;
    this.collection = collection;
    this.lists = lists;
  }

  async load() {
    const { people } = await this.api.trade(this.sync.config);
    this.last = { people, at: Date.now() };
    return this.last;
  }

  // → { forMe, forThem } für eine Person aus last.people
  matches(person) {
    return tradeMatches(person, this.collection.entries(), this.lists.allItems().map((i) => i.card));
  }
}
