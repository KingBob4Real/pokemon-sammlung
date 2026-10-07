import { objOr, positive } from "../core/format.js";

/**
 * Übernimmt die alte Karten-Checkliste: jede Gruppe wird eine Liste,
 * abgehakte Karten kommen mit „Mein Preis“ als Kaufpreis in die Sammlung.
 * Mehrfach ausführen ist ok – vorhandene Listen und Einträge werden nicht doppelt angelegt.
 */
export class LegacyImportService {
  constructor({ store, collection, lists, fetchJson, storage, oldAppUrl, keys }) {
    Object.assign(this, { store, collection, lists, fetchJson, storage, oldAppUrl, keys });
  }

  // Gleiche Domain wie die alte Checkliste → im selben Browser direkt lesbar
  readLocal() {
    const owned = this.storage.get(this.keys.legacyOwned, null);
    return Array.isArray(owned) ? { owned, ownPrices: objOr(this.storage.get(this.keys.legacyPrices, {})) } : null;
  }

  async import({ owned, ownPrices }) {
    const old = await this.fetchJson(`${this.oldAppUrl}cards.json`, { timeout: 15000, cache: "no-cache" });
    const ownedIds = new Set(owned);
    const prices = objOr(ownPrices);
    const groups = (old.groups || []).map((g) => g.id);
    const groupName = new Map((old.groups || []).map((g) => [g.id, g.name]));
    const listsBefore = this.lists.all().length;
    const now = Date.now();
    let cards = 0;
    let i = 0;

    this.store.batch(() => {
      for (const line of old.lines || []) {
        const gid = line.group || line.id;
        const listId = `alt-${gid}`;
        // Reihenfolge wie in der alten Checkliste
        this.lists.ensure(listId, groupName.get(gid) || line.name || gid, now + (groups.includes(gid) ? groups.indexOf(gid) : groups.length + i));
        for (const slot of line.slots || []) {
          for (const c of slot.options || []) {
            i++;
            const set = old.sets?.[c.set] || {};
            const card = { id: c.id, name: c.name, num: String(c.number), set: set.id || c.id.split("-")[0], setName: set.name || c.set, total: set.official || null, img: c.image || null };
            this.lists.addIfMissing(listId, card, now + i);
            if (ownedIds.has(c.id) && !this.collection.has(c.id)) {
              this.collection.setQuantity(card, 1);
              const paid = positive(prices[c.id]);
              if (paid != null) this.collection.update(c.id, { paid });
              cards++;
            }
          }
        }
      }
    });
    return { cards, lists: this.lists.all().length - listsBefore };
  }
}
