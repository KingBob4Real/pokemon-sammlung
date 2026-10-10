import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Listen pro Person (Tabelle lists). Änderungsart „list“, id = Listen-ID.

const UPSERT = `
  INSERT INTO lists (user_id, id, name, created, position, updated, deleted, rev)
  SELECT ?2, value ->> 'id', value ->> '$.data.name', value ->> '$.data.created', value ->> '$.data.position',
         value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'list'
  ON CONFLICT (user_id, id) DO UPDATE SET
    name = excluded.name, created = excluded.created, position = excluded.position,
    updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > lists.updated`;

// Zwei Teile statt „rev > ?1 OR id IN (…)“: so liest die Datenbank nur Geändertes (Index auf Person + Stand) und die
// gerade gesendeten Einträge (Primärschlüssel) – mit OR las sie bei jedem Sync alle Zeilen der Person (D1 zählt gelesene Zeilen).
const ROWS = `SELECT id, name, created, position, updated, deleted FROM lists`;
const CHANGED = `
  ${ROWS} WHERE user_id = ?3 AND rev > ?1
  UNION
  ${ROWS} WHERE user_id = ?3 AND id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'list')`;

export class ListRepository {
  type = "list";

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
      data: row.deleted ? null : { name: row.name, created: row.created, position: row.position },
    };
  }
}
