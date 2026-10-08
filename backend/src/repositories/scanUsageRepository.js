// Scans pro Person und Tag (Tabelle scan_usage).
export class ScanUsageRepository {
  constructor(db) {
    this.db = db;
  }

  // → { mine, total }: Scans dieser Person und aller Personen an diesem Tag
  async today(userId, day) {
    const row = await this.db
      .prepare("SELECT COALESCE(SUM(count), 0) AS total, COALESCE(SUM(CASE WHEN user_id = ?1 THEN count END), 0) AS mine FROM scan_usage WHERE day = ?2")
      .bind(userId, day)
      .first();
    return { mine: row.mine, total: row.total };
  }

  add(userId, day) {
    return this.db.prepare("INSERT INTO scan_usage (user_id, day, count) VALUES (?1, ?2, 1) ON CONFLICT (user_id, day) DO UPDATE SET count = count + 1").bind(userId, day).run();
  }
}
