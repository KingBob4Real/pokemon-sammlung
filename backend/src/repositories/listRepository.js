import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Eigene Listen (Tabelle lists). Änderungsart „list“, id = Listen-ID.

const UPSERT = `
  INSERT INTO lists (id, name, created, updated, deleted, rev)
  SELECT value ->> 'id', value ->> '$.data.name', value ->> '$.data.created', value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'list'
  ON CONFLICT (id) DO UPDATE SET
    name = excluded.name, created = excluded.created, updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > lists.updated`;

const CHANGED = `
  SELECT id, name, created, updated, deleted
  FROM lists
  WHERE rev > ?1 OR id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'list')`;

export class ListRepository {
  type = "list";

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
      data: row.deleted ? null : { name: row.name, created: row.created },
    };
  }
}
