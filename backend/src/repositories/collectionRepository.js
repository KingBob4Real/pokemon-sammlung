import { CARD_COLUMNS, cardFromRow } from "./cardRepository.js";
import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Sammlung pro Person (Tabelle collection). Änderungsart „collection“, id = Karten-ID.
// section = Ordner (Tabelle sections), position = eigene Reihenfolge (Drag & Drop),
// trade = Tauschen (null = automatisch, wenn doppelt; true = anbieten; false = behalten).
// ponytail: eine noch nicht aktualisierte App schickt section/position/trade nicht mit und setzt sie so zurück –
// sie lädt sich beim Öffnen aber sofort neu, das Fenster ist klein.

const UPSERT = `
  INSERT INTO collection (user_id, card_id, qty, condition, language, paid, added, section, position, trade, updated, deleted, rev)
  SELECT ?2, value ->> 'id', value ->> '$.data.qty', value ->> '$.data.cond', value ->> '$.data.lang',
         value ->> '$.data.paid', value ->> '$.data.added', value ->> '$.data.section', value ->> '$.data.position',
         value ->> '$.data.trade', value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'collection'
  ON CONFLICT (user_id, card_id) DO UPDATE SET
    qty = excluded.qty, condition = excluded.condition, language = excluded.language, paid = excluded.paid,
    added = excluded.added, section = excluded.section, position = excluded.position, trade = excluded.trade,
    updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > collection.updated`;

// Zwei Teile statt „rev > ?1 OR id IN (…)“: so liest die Datenbank nur Geändertes (Index auf Person + Stand) und die
// gerade gesendeten Einträge (Primärschlüssel) – mit OR las sie bei jedem Sync alle Zeilen der Person (D1 zählt gelesene Zeilen).
const ROWS = `
  SELECT c.card_id AS id, c.qty, c.condition, c.language, c.paid, c.added, c.section, c.position, c.trade, c.updated, c.deleted, ${CARD_COLUMNS}
  FROM collection c LEFT JOIN cards k ON k.id = c.card_id`;
const CHANGED = `
  ${ROWS} WHERE c.user_id = ?3 AND c.rev > ?1
  UNION
  ${ROWS} WHERE c.user_id = ?3 AND c.card_id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'collection')`;

// Tauschen: was die anderen anbieten – selbst markiert (trade = 1) oder automatisch, wenn doppelt (trade leer);
// trade = 0 heißt behalten, auch wenn doppelt. Gelöschte und Anzahl 0 zählen nicht.
const OFFERS = `
  SELECT c.user_id, c.qty, c.condition, c.language, ${CARD_COLUMNS}
  FROM collection c JOIN cards k ON k.id = c.card_id
  WHERE c.user_id != ?1 AND c.deleted = 0 AND c.qty > 0 AND (c.trade = 1 OR (c.trade IS NULL AND c.qty > 1))`;

export class CollectionRepository {
  type = "collection";

  constructor(db) {
    this.db = db;
  }

  // → [{ userId, card, qty, cond, lang }] aller außer exceptUserId
  async offers(exceptUserId) {
    const { results } = await this.db.prepare(OFFERS).bind(exceptUserId).all();
    return results.map((r) => ({ userId: r.user_id, card: cardFromRow(r), qty: r.qty, cond: r.condition, lang: r.language }));
  }

  upsert(changesJson, userId) {
    return this.db.prepare(UPSERT).bind(changesJson, userId);
  }

  changed(since, changesJson, userId) {
    return this.db.prepare(CHANGED).bind(since, changesJson, userId);
  }

  toEntity(row) {
    return {
      type: this.type,
      id: row.id,
      updated: row.updated,
      deleted: row.deleted,
      data: row.deleted
        ? null
        : { qty: row.qty, cond: row.condition, lang: row.language, paid: row.paid, added: row.added, section: row.section, position: row.position, trade: row.trade == null ? null : Boolean(row.trade), card: cardFromRow(row) },
    };
  }
}
