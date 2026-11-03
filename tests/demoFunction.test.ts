import { beforeAll, describe, expect, it } from "vitest";
import initSqlJs, { type Database } from "sql.js";
import { onRequest } from "../functions/api/demo/[[path]]";

// A small D1 look-alike on sql.js, enough for the demo store.
function d1(db: Database) {
  const stmt = (sql: string, binds: unknown[] = []) => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    run: async () => void db.run(sql, binds as never[]),
    first: async <T>() => {
      const s = db.prepare(sql);
      s.bind(binds as never[]);
      const r = s.step() ? (s.getAsObject() as T) : null;
      s.free();
      return r;
    },
    all: async <T>() => {
      const s = db.prepare(sql);
      s.bind(binds as never[]);
      const rows: T[] = [];
      while (s.step()) rows.push(s.getAsObject() as T);
      s.free();
      return { results: rows };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (list: { run: () => Promise<void> }[]) => {
      for (const s of list) await s.run();
    },
    exec: async (sql: string) => db.exec(sql),
  };
}

let env: { DB: ReturnType<typeof d1> };
const A = "a".repeat(32);
const B = "b".repeat(32);
const call = async (method: string, path: string, sid: string | null, body?: unknown) => {
  const res = await onRequest({
    request: new Request(`https://x/api/demo/${path}`, { method, headers: sid ? { "X-Demo-Session": sid } : {}, body: body === undefined ? undefined : JSON.stringify(body) }),
    env: env as never,
    params: { path: path.split("?")[0].split("/") },
  });
  const t = await res.text();
  return { status: res.status, body: t ? (() => { try { return JSON.parse(t); } catch { return t; } })() : null };
};

describe("demo session store (Pages Function)", () => {
  beforeAll(async () => {
    const SQL = await initSqlJs();
    env = { DB: d1(new SQL.Database()) };
  });

  it("answers health and refuses requests without a session", async () => {
    expect((await call("GET", "health", null)).body).toEqual({ ok: true });
    expect((await call("GET", "kv/projects", null)).status).toBe(400);
  });

  it("keeps each session's data apart", async () => {
    await call("PUT", "kv/projects/p1", A, { summary: { id: "p1", code: "GIS" }, project: { x: 1 } });
    await call("PUT", "kv/projects/p2", A, { summary: { id: "p2", code: "PV" }, project: { x: 2 } });
    expect((await call("GET", "kv/projects?field=summary", A)).body.map((s: { code: string }) => s.code).sort()).toEqual(["GIS", "PV"]);
    expect((await call("GET", "kv/projects", B)).body).toEqual([]);
    expect((await call("GET", "kv/projects/p1", A)).body.project).toEqual({ x: 1 });
    expect((await call("GET", "kv/projects/p1", B)).status).toBe(404);
  });

  it("updates, deletes and ends a session", async () => {
    await call("PUT", "kv/projects/p1", A, { summary: { id: "p1", code: "GIS-2" }, project: { x: 9 } });
    expect((await call("GET", "kv/projects/p1", A)).body.summary.code).toBe("GIS-2");
    await call("DELETE", "kv/projects/p2", A);
    expect((await call("GET", "kv/projects", A)).body).toHaveLength(1);
    await call("DELETE", "session", A);
    expect((await call("GET", "kv/projects", A)).body).toEqual([]);
  });

  it("rejects unknown stores, bad JSON and oversize values", async () => {
    expect((await call("GET", "kv/secrets", A)).status).toBe(404);
    const bad = await onRequest({ request: new Request("https://x/api/demo/kv/projects/k", { method: "PUT", headers: { "X-Demo-Session": A }, body: "{nope" }), env: env as never, params: { path: ["kv", "projects", "k"] } });
    expect(bad.status).toBe(400);
    expect((await call("PUT", "kv/projects/big", A, { s: "x".repeat(1_600_000) })).status).toBe(413);
  });
});
