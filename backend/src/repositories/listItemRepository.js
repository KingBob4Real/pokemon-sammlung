import { CARD_COLUMNS, cardFromRow } from "./cardRepository.js";
import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Karten in Listen (Tabelle list_items). Änderungsart „listItem“, id = <list_id>:<card_id>.
// list_id und card_id kommen aus der id – so klappt es auch bei gelöschten Einträgen ohne Daten.

const ID = "value ->> 'id'";
const UPSERT = `
  INSERT INTO list_items (id, list_id, card_id, added, updated, deleted, rev)
  SELECT ${ID}, substr(${ID}, 1, instr(${ID}, ':') - 1), substr(${ID}, instr(${ID}, ':') + 1),
         value ->> '$.data.added', value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'listItem'
  ON CONFLICT (id) DO UPDATE SET
    added = excluded.added, updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > list_items.updated`;

const CHANGED = `
  SELECT i.id, i.list_id, i.added, i.updated, i.deleted, ${CARD_COLUMNS}
  FROM list_items i LEFT JOIN cards k ON k.id = i.card_id
  WHERE i.rev > ?1 OR i.id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'listItem')`;

export class ListItemRepository {
  type = "listItem";

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
      data: row.deleted ? null : { list: row.list_id, card: cardFromRow(row), added: row.added },
    };
  }
}
