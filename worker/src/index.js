// Sync-Backend der Pokémon-Sammlung: ein Endpunkt, POST /sync.
// Das Gerät schickt seine Änderungen und seinen letzten Stand (since), zurück kommt alles, was es noch nicht hat.
// Pro Dokument gewinnt die neueste Änderung (updated). Geschützt über den persönlichen Schlüssel SYNC_KEY.

const MAX_CHANGES = 1000;
const KINDS = new Set(["card", "list", "member"]);
const HEADERS = {
  "Access-Control-Allow-Origin": "*", // Schutz läuft über den Schlüssel, nicht über Cookies
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

// Alle Änderungen in einer Anweisung (D1 erlaubt im Gratis-Tarif nur 50 Abfragen pro Aufruf).
const UPSERT = `
  INSERT INTO docs (id, kind, data, updated, deleted, rev)
  SELECT value ->> 'id', value ->> 'kind', value -> 'data', value ->> 'updated', value ->> 'deleted',
         (SELECT v FROM meta WHERE k = 'rev')
  FROM json_each(?1) WHERE true
  ON CONFLICT (id) DO UPDATE SET
    kind = excluded.kind, data = excluded.data, updated = excluded.updated, deleted = excluded.deleted, rev = excluded.rev
  WHERE excluded.updated > docs.updated`;
const BUMP = "INSERT INTO meta (k, v) VALUES ('rev', 1) ON CONFLICT (k) DO UPDATE SET v = v + 1";
// Neues seit dem letzten Stand + der Server-Stand aller geschickten Dokumente (falls dort schon Neueres lag)
const CHANGED = "SELECT id, kind, data, updated, deleted FROM docs WHERE rev > ?1 OR id IN (SELECT value FROM json_each(?2))";
const REV = "SELECT COALESCE((SELECT v FROM meta WHERE k = 'rev'), 0) AS rev";

const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });

function authorized(req, env) {
  if (!env.SYNC_KEY) return false;
  const enc = new TextEncoder();
  const got = enc.encode(req.headers.get("Authorization") || "");
  const want = enc.encode(`Bearer ${env.SYNC_KEY}`);
  return got.byteLength === want.byteLength && crypto.subtle.timingSafeEqual(got, want);
}

function valid(d) {
  return (
    d != null &&
    typeof d.id === "string" &&
    d.id.length > 0 &&
    d.id.length <= 300 &&
    KINDS.has(d.kind) &&
    Number.isSafeInteger(d.updated) &&
    (d.deleted === 0 || d.deleted === 1) &&
    JSON.stringify(d.data ?? null).length <= 20000
  );
}

export default {
  async fetch(req, env) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });
    if (req.method !== "POST" || new URL(req.url).pathname !== "/sync") return json({ error: "Nicht gefunden" }, 404);
    if (!authorized(req, env)) return json({ error: "Falscher Sync-Schlüssel" }, 401);

    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Kein gültiges JSON" }, 400);
    }
    const since = Number.isSafeInteger(body?.since) && body.since >= 0 ? body.since : 0;
    const changes = Array.isArray(body?.changes) ? body.changes : [];
    if (changes.length > MAX_CHANGES) return json({ error: `Höchstens ${MAX_CHANGES} Änderungen pro Anfrage` }, 413);
    if (!changes.every(valid)) return json({ error: "Ungültiges Dokument" }, 400);

    const docs = JSON.stringify(changes.map(({ id, kind, data, updated, deleted }) => ({ id, kind, data: data ?? null, updated, deleted })));
    const ids = JSON.stringify(changes.map((d) => d.id));
    const db = env.DB;
    // batch = eine Transaktion
    const writes = changes.length ? [db.prepare(BUMP), db.prepare(UPSERT).bind(docs)] : [];
    const results = await db.batch([...writes, db.prepare(CHANGED).bind(since, ids), db.prepare(REV)]);
    const [changed, rev] = results.slice(-2);

    return json({
      rev: rev.results[0].rev,
      docs: changed.results.map((r) => ({ ...r, data: r.data == null ? null : JSON.parse(r.data) })),
    });
  },
};
