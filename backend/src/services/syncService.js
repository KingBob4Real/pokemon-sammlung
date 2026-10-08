/**
 * Abgleich zwischen einem Gerät und der Datenbank – immer nur mit den Daten der angemeldeten Person.
 *
 * Jede synchronisierte Tabelle ist ein Repository mit:
 *   type                            – Änderungsart, z. B. "collection"
 *   upsert(changesJson, userId)     – schreibt Änderungen dieser Art (neueste gewinnt)
 *   changed(since, json, userId)    – liest alles mit rev > since plus den Server-Stand der geschickten Einträge
 *   toEntity(row)                   – Zeile → Änderung fürs Gerät
 * Eine neue Datenart = neues Repository in index.js eintragen; hier ändert sich nichts.
 */
export class SyncService {
  constructor(db, revisions, cards, tables) {
    this.db = db;
    this.revisions = revisions;
    this.cards = cards;
    this.tables = tables;
  }

  async sync(user, since, changes) {
    const json = JSON.stringify(changes);
    const writes = changes.length ? [this.revisions.bump(), this.cards.upsertFrom(json), ...this.tables.map((t) => t.upsert(json, user.id))] : [];
    const reads = this.tables.map((t) => t.changed(since, json, user.id));
    // Ein Batch ist eine Transaktion – und bleibt weit unter den 50 Abfragen pro Aufruf im Gratis-Tarif
    const results = await this.db.batch([...writes, ...reads, this.revisions.current()]);
    const readResults = results.slice(writes.length, writes.length + reads.length);
    return {
      user: user.name,
      userId: user.id,
      rev: results[results.length - 1].results[0].rev,
      changes: readResults.flatMap((r, i) => r.results.map((row) => this.tables[i].toEntity(row))),
    };
  }
}
