// Cloudflare Pages Function: the per-session store of the web demo.
//
// Every visitor's session has its own copy of the sample projects. Values are
// JSON documents in D1 (binding DB), keyed by session, store and key. The
// browser sends its random session id in the X-Demo-Session header. Sessions
// not used for a day are deleted. Limits keep one session small.
//
//   GET    /api/demo/health
//   GET    /api/demo/kv/:store[?field=summary]
//   GET    /api/demo/kv/:store/:key
//   PUT    /api/demo/kv/:store/:key
//   DELETE /api/demo/kv/:store/:key
//   DELETE /api/demo/session

interface D1Result<T> {
  results?: T[];
}
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  run(): Promise<unknown>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
}
interface D1 {
  prepare(sql: string): D1Stmt;
  batch(s: D1Stmt[]): Promise<unknown>;
  exec(sql: string): Promise<unknown>;
}
interface Ctx {
  request: Request;
  env: { DB?: D1 };
  params: { path?: string[] | string };
}

const STORES = new Set(["projects", "dashboards", "schedules", "settings"]);
const MAX_VALUE = 1_500_000;
const MAX_KEYS = 60;
const TTL_MS = 24 * 3600 * 1000;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const text = (msg: string, status: number) => new Response(msg, { status, headers: { "Cache-Control": "no-store" } });

let ready = false;
async function schema(db: D1) {
  if (ready) return;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS demo_sessions (id TEXT PRIMARY KEY, created INTEGER NOT NULL, seen INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS demo_kv (session TEXT NOT NULL, store TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (session, store, key))"),
    db.prepare("CREATE INDEX IF NOT EXISTS demo_sessions_seen ON demo_sessions (seen)"),
  ]);
  ready = true;
}

async function cleanup(db: D1) {
  const cut = Date.now() - TTL_MS;
  await db.batch([
    db.prepare("DELETE FROM demo_kv WHERE session IN (SELECT id FROM demo_sessions WHERE seen < ?)").bind(cut),
    db.prepare("DELETE FROM demo_sessions WHERE seen < ?").bind(cut),
  ]);
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  const db = ctx.env.DB;
  if (!db) return text("The demo database is not configured.", 503);
  const url = new URL(ctx.request.url);
  const parts = (Array.isArray(ctx.params.path) ? ctx.params.path : ctx.params.path ? [ctx.params.path] : []).map(decodeURIComponent);
  const method = ctx.request.method;
  await schema(db);

  if (parts[0] === "health") return json({ ok: true });

  const sid = ctx.request.headers.get("X-Demo-Session") ?? "";
  if (!/^[0-9a-f]{32}$/.test(sid)) return text("Missing or bad session id.", 400);
  const now = Date.now();
  await db.prepare("INSERT INTO demo_sessions (id, created, seen) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET seen = excluded.seen").bind(sid, now, now).run();
  // Old sessions are removed now and then, by the requests of new ones.
  if (Math.random() < 0.05) await cleanup(db);

  if (parts[0] === "session" && method === "DELETE") {
    await db.batch([db.prepare("DELETE FROM demo_kv WHERE session = ?").bind(sid), db.prepare("DELETE FROM demo_sessions WHERE id = ?").bind(sid)]);
    return json({ ok: true });
  }

  if (parts[0] !== "kv" || !STORES.has(parts[1] ?? "")) return text("Not found.", 404);
  const store = parts[1];
  const key = parts[2];

  if (!key) {
    if (method !== "GET") return text("Method not allowed.", 405);
    const field = url.searchParams.get("field");
    if (field && /^[A-Za-z]+$/.test(field)) {
      const r = await db.prepare(`SELECT json_extract(value, '$.${field}') AS v FROM demo_kv WHERE session = ? AND store = ?`).bind(sid, store).all<{ v: string }>();
      return json((r.results ?? []).map((x) => JSON.parse(x.v)));
    }
    const r = await db.prepare("SELECT value FROM demo_kv WHERE session = ? AND store = ?").bind(sid, store).all<{ value: string }>();
    return json((r.results ?? []).map((x) => JSON.parse(x.value)));
  }

  if (method === "GET") {
    const row = await db.prepare("SELECT value FROM demo_kv WHERE session = ? AND store = ? AND key = ?").bind(sid, store, key).first<{ value: string }>();
    return row ? new Response(row.value, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }) : text("Not found.", 404);
  }
  if (method === "PUT") {
    const body = await ctx.request.text();
    if (body.length > MAX_VALUE) return text("This item is too large for the demo (1.5 MB at most).", 413);
    try {
      JSON.parse(body);
    } catch {
      return text("Not JSON.", 400);
    }
    const exists = await db.prepare("SELECT 1 AS x FROM demo_kv WHERE session = ? AND store = ? AND key = ?").bind(sid, store, key).first();
    if (!exists) {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM demo_kv WHERE session = ? AND store = ?").bind(sid, store).first<{ n: number }>();
      if ((n?.n ?? 0) >= MAX_KEYS) return text(`The demo keeps at most ${MAX_KEYS} ${store} per session.`, 409);
    }
    await db
      .prepare("INSERT INTO demo_kv (session, store, key, value, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(session, store, key) DO UPDATE SET value = excluded.value, updated = excluded.updated")
      .bind(sid, store, key, body, now)
      .run();
    return json({ ok: true });
  }
  if (method === "DELETE") {
    await db.prepare("DELETE FROM demo_kv WHERE session = ? AND store = ? AND key = ?").bind(sid, store, key).run();
    return json({ ok: true });
  }
  return text("Method not allowed.", 405);
}
