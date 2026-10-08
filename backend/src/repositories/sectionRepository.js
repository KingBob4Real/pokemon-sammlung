import { CURRENT_REV_SQL } from "./revisionRepository.js";

// Abteilungen der Sammlung pro Person (Tabelle sections). Änderungsart „section“, id = Abteilungs-ID.

const UPSERT = `
  INSERT INTO sections (user_id, id, name, created, position, updated, deleted, rev)
  SELECT ?2, value ->> 'id', value ->> '$.data.name', value ->> '$.data.created', value ->> '$.data.position',
         value ->> 'updated', value ->> 'deleted', ${CURRENT_REV_SQL}
  FROM json_each(?1)
  WHERE value ->> 'type' = 'section'
  ON CONFLICT (user_id, id) DO UPDATE SET
    name = excluded.name, created = excluded.created, position = excluded.position,
    updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > sections.updated`;

const CHANGED = `
  SELECT id, name, created, position, updated, deleted
  FROM sections
  WHERE user_id = ?3
    AND (rev > ?1 OR id IN (SELECT value ->> 'id' FROM json_each(?2) WHERE value ->> 'type' = 'section'))`;

export class SectionRepository {
  type = "section";

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
