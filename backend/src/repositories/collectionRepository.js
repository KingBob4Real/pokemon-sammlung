import { CARD_COLUMNS, cardFromRow } from "./cardRepository.js";
import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Sammlung pro Person (Tabelle collection). Änderungsart „collection“, id = Karten-ID.
// section = Ordner (Tabelle sections), position = eigene Reihenfolge (Drag & Drop),
// cm_low/cm_low_at = selbst eingetragener Cardmarket-Preis „ab“ (DE/EN, ab Excellent) und wann.
// ponytail: eine noch nicht aktualisierte App schickt section/position/cm_low nicht mit und setzt sie so zurück –
// sie lädt sich beim Öffnen aber sofort neu, das Fenster ist klein.

const UPSERT = `
  INSERT INTO collection (user_id, card_id, qty, condition, language, paid, added, section, position, cm_low, cm_low_at, updated, deleted, rev)
  SELECT ?2, value ->> 'id', value ->> '$.data.qty', value ->> '$.data.cond', value ->> '$.data.lang',
         value ->> '$.data.paid', value ->> '$.data.added', value ->> '$.data.section', value ->> '$.data.position',
         value ->> '$.data.cmLow', value ->> '$.data.cmLowAt',
         value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'collection'
  ON CONFLICT (user_id, card_id) DO UPDATE SET
    qty = excluded.qty, condition = excluded.condition, language = excluded.language, paid = excluded.paid,
    added = excluded.added, section = excluded.section, position = excluded.position, cm_low = excluded.cm_low, cm_low_at = excluded.cm_low_at,
    updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > collection.updated`;

const CHANGED = `
  SELECT c.card_id AS id, c.qty, c.condition, c.language, c.paid, c.added, c.section, c.position, c.cm_low, c.cm_low_at, c.updated, c.deleted, ${CARD_COLUMNS}
  FROM collection c LEFT JOIN cards k ON k.id = c.card_id
  WHERE c.user_id = ?3
    AND (c.rev > ?1 OR c.card_id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'collection'))`;

export class CollectionRepository {
  type = "collection";

  constructor(db) {
    this.db = db;
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
        : { qty: row.qty, cond: row.condition, lang: row.language, paid: row.paid, added: row.added, section: row.section, position: row.position, cmLow: row.cm_low, cmLowAt: row.cm_low_at, card: cardFromRow(row) },
    };
  }
}
