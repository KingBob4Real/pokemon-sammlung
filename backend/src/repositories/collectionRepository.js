import { CARD_COLUMNS, cardFromRow } from "./cardRepository.js";
import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Meine Sammlung (Tabelle collection). Änderungsart „collection“, id = Karten-ID.

const UPSERT = `
  INSERT INTO collection (card_id, qty, condition, language, paid, added, updated, deleted, rev)
  SELECT value ->> 'id', value ->> '$.data.qty', value ->> '$.data.cond', value ->> '$.data.lang',
         value ->> '$.data.paid', value ->> '$.data.added', value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'collection'
  ON CONFLICT (card_id) DO UPDATE SET
    qty = excluded.qty, condition = excluded.condition, language = excluded.language, paid = excluded.paid,
    added = excluded.added, updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > collection.updated`;

const CHANGED = `
  SELECT c.card_id AS id, c.qty, c.condition, c.language, c.paid, c.added, c.updated, c.deleted, ${CARD_COLUMNS}
  FROM collection c LEFT JOIN cards k ON k.id = c.card_id
  WHERE c.rev > ?1 OR c.card_id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'collection')`;

export class CollectionRepository {
  type = "collection";

  constructor(db) {
    this.db = db;
  }

  upsert(changesJson) {
    return this.db.prepare(UPSERT).bind(changesJson);
  }

  changed(since, changesJson) {
    return this.db.prepare(CHANGED).bind(since, changesJson);
  }

  toEntity(row) {
    return {
      type: this.type,
      id: row.id,
      updated: row.updated,
      deleted: row.deleted,
      data: row.deleted
        ? null
        : { qty: row.qty, cond: row.condition, lang: row.language, paid: row.paid, added: row.added, card: cardFromRow(row) },
    };
  }
}
