// Stammdaten der Karten. Sammlung und Listen speichern nur die Karten-ID; Name, Set und Bild stehen hier.

// Karten aus allen Änderungen übernehmen, die eine Karte mitbringen (Sammlung, Listeneinträge)
const UPSERT = `
  INSERT INTO cards (id, name, number, set_id, set_name, set_total, image)
  SELECT value ->> '$.data.card.id', value ->> '$.data.card.name', value ->> '$.data.card.num',
         value ->> '$.data.card.set', value ->> '$.data.card.setName', value ->> '$.data.card.total',
         value ->> '$.data.card.img'
  FROM json_each(?1)
  WHERE value ->> '$.data.card.id' IS NOT NULL
  ON CONFLICT (id) DO UPDATE SET
    name = excluded.name, number = excluded.number, set_id = excluded.set_id,
    set_name = excluded.set_name, set_total = excluded.set_total, image = excluded.image`;

// Spalten für „LEFT JOIN cards k“ in anderen Repositories
export const CARD_COLUMNS = `k.id AS card_ref, k.name AS card_name, k.number AS card_number, k.set_id AS card_set,
  k.set_name AS card_set_name, k.set_total AS card_set_total, k.image AS card_image`;

export function cardFromRow(row) {
  if (row.card_ref == null) return null;
  return {
    id: row.card_ref,
    name: row.card_name,
    num: row.card_number,
    set: row.card_set,
    setName: row.card_set_name,
    total: row.card_set_total,
    img: row.card_image,
  };
}

export class CardRepository {
  constructor(db) {
    this.db = db;
  }

  upsertFrom(changesJson) {
    return this.db.prepare(UPSERT).bind(changesJson);
  }
}
