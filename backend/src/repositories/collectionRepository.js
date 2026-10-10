import { CARD_COLUMNS, cardFromRow } from "./cardRepository.js";
import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Sammlung pro Person (Tabelle collection). Änderungsart „collection“, id = Karten-ID.
// section = Ordner (Tabelle sections), position = eigene Reihenfolge (Drag & Drop).
// ponytail: eine noch nicht aktualisierte App schickt section/position nicht mit und setzt sie so zurück –
// sie lädt sich beim Öffnen aber sofort neu, das Fenster ist klein.

const UPSERT = `
  INSERT INTO collection (user_id, card_id, qty, condition, language, paid, added, section, position, updated, deleted, rev)
  SELECT ?2, value ->> 'id', value ->> '$.data.qty', value ->> '$.data.cond', value ->> '$.data.lang',
         value ->> '$.data.paid', value ->> '$.data.added', value ->> '$.data.section', value ->> '$.data.position',
         value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'collection'
  ON CONFLICT (user_id, card_id) DO UPDATE SET
    qty = excluded.qty, condition = excluded.condition, language = excluded.language, paid = excluded.paid,
    added = excluded.added, section = excluded.section, position = excluded.position,
    updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > collection.updated`;

const CHANGED = `
  SELECT c.card_id AS id, c.qty, c.condition, c.language, c.paid, c.added, c.section, c.position, c.updated, c.deleted, ${CARD_COLUMNS}
  FROM collection c LEFT JOIN cards k ON k.id = c.card_id
  WHERE c.user_id = ?3
    AND (c.rev > ?1 OR c.card_id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'collection'))`;

// Tauschen: Karten, die die anderen Personen doppelt haben (Anzahl > 1, nicht gelöscht)
const DUPLICATES = `
  SELECT c.user_id, c.qty, c.condition, c.language, ${CARD_COLUMNS}
  FROM collection c JOIN cards k ON k.id = c.card_id
  WHERE c.user_id != ?1 AND c.deleted = 0 AND c.qty > 1`;

export class CollectionRepository {
  type = "collection";

  constructor(db) {
    this.db = db;
  }

  // → [{ userId, card, qty, cond, lang }] aller außer exceptUserId
  async duplicates(exceptUserId) {
    const { results } = await this.db.prepare(DUPLICATES).bind(exceptUserId).all();
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
        : { qty: row.qty, cond: row.condition, lang: row.language, paid: row.paid, added: row.added, section: row.section, position: row.position, card: cardFromRow(row) },
    };
  }
}
