// Server-Stand (rev): steigt bei jeder Anfrage mit Änderungen um 1.
// Geräte merken sich den letzten Stand und holen beim nächsten Mal nur, was neuer ist.
export class RevisionRepository {
  constructor(db) {
    this.db = db;
  }

  bump() {
    return this.db.prepare("INSERT INTO meta (k, v) VALUES ('rev', 1) ON CONFLICT (k) DO UPDATE SET v = v + 1");
  }

  current() {
    return this.db.prepare("SELECT COALESCE((SELECT v FROM meta WHERE k = 'rev'), 0) AS rev");
  }
}

// Für die Upserts: alle in einem Batch geschriebenen Zeilen bekommen den neuen Stand
export const CURRENT_REV_SQL = "(SELECT v FROM meta WHERE k = 'rev')";
