import { log } from "../http/log.js";

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
    const writes = changes.length ? [this.revisions.bump(), this.cards.upsertFrom(json, user.id), ...this.tables.map((t) => t.upsert(json, user.id))] : [];
    const reads = this.tables.map((t) => t.changed(since, json, user.id));
    // Ein Batch ist eine Transaktion – und bleibt weit unter den 50 Abfragen pro Aufruf im Gratis-Tarif
    const results = await this.db.batch([...writes, ...reads, this.revisions.current()]);
    const readResults = results.slice(writes.length, writes.length + reads.length);
    const result = {
      user: user.name,
      userId: user.id,
      now: Date.now(), // Uhrzeit des Servers: Geräte mit falsch gehender Uhr gleichen ihre Zeitstempel daran an
      rev: results[results.length - 1].results[0].rev,
      changes: readResults.flatMap((r, i) => r.results.map((row) => this.tables[i].toEntity(row))),
    };
    log("info", "sync", { user: user.id, auth: user.session ? "session" : "sync_key", since, rev: result.rev, ...summary(changes, result.changes) });
    return result;
  }
}

// Fürs Protokoll: wie viel kam, wie viel ging zurück, und wie oft der Server einen neueren Stand behalten hat
// (dann war ein anderes Gerät schneller – „neueste Änderung gewinnt“).
function summary(sent, returned) {
  const sentAt = new Map(sent.map((c) => [`${c.type}:${c.id}`, c.updated]));
  let newerOnServer = 0;
  let fresh = 0;
  for (const e of returned) {
    const at = sentAt.get(`${e.type}:${e.id}`);
    if (at == null) fresh++;
    else if (e.updated > at) newerOnServer++;
  }
  const byType = {};
  for (const c of sent) byType[c.type] = (byType[c.type] ?? 0) + 1;
  return { sent: sent.length, deleted: sent.filter((c) => c.deleted).length, byType, received: fresh, newerOnServer };
}
