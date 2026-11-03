import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { demoXer } from "../src/core/demo";
import { parseXer } from "../src/core/xer";
import { buildServer } from "../src/server/app";
import { StratumApi } from "../src/services/api";
import { AuditLog, auditCsv } from "../src/services/audit";
import { Repository } from "../src/services/repo";
import { aesBox } from "../src/services/secrets";
import { openPostgres, openSqlite, type SqlDriver } from "../src/services/sql";

const SECRET = "security-test-secret-0123456789";
const PG_URL = process.env.STRATUM_TEST_PG ?? "postgres://postgres@127.0.0.1:55432/stratum_test";

const made: string[] = [];
afterAll(async () => {
  if (!made.length) return;
  const d = await openPostgres(PG_URL);
  for (const m of made) await d.exec(`drop schema if exists ${m} cascade`);
  await d.close();
});

/** A fresh schema of its own, so this file does not touch the tables other test files use. */
async function pg(): Promise<SqlDriver | null> {
  try {
    const admin = await openPostgres(PG_URL);
    const schema = `sec_${Math.random().toString(36).slice(2, 10)}`;
    await admin.exec(`create schema ${schema}`);
    made.push(schema);
    await admin.close();
    return await openPostgres(`${PG_URL}${PG_URL.includes("?") ? "&" : "?"}options=${encodeURIComponent(`-c search_path=${schema}`)}`);
  } catch {
    return null;
  }
}

const drivers: [string, () => Promise<SqlDriver | null>][] = [
  ["SQLite", () => openSqlite(null)],
  ["PostgreSQL", pg],
];

afterEach(() => {
  vi.useRealTimers();
});

describe.each(drivers)("audit log on %s", (_name, open) => {
  it("chains entries and refuses edits", async () => {
    const db = await open();
    if (!db) return console.warn("PostgreSQL not reachable; skipping");
    const log = new AuditLog(db, SECRET);
    await log.migrate();
    for (let i = 0; i < 5; i++) await log.append({ actor: "a@co.com", action: "project.save", target: `p${i}`, detail: { version: i + 1 } });
    const v = await log.verify();
    expect(v).toMatchObject({ ok: true, checked: 5, head: { seq: 5 } });
    const [newest] = await log.list({ limit: 1 });
    expect(newest.seq).toBe(5);
    expect(newest.prevHash).toBe((await log.list({ before: 5, limit: 1 }))[0].hash);

    await expect(db.exec("update audit_log set actor = 'someone-else' where seq = 3")).rejects.toThrow(/append-only/);
    await expect(db.exec("delete from audit_log where seq = 2")).rejects.toThrow(/retention/);
    await expect(db.exec("delete from audit_log")).rejects.toThrow();
    expect((await log.verify()).ok).toBe(true);

    // The same log read with another secret does not verify: the hash is keyed.
    expect((await new AuditLog(db, "another-secret-0123456789").verify()).ok).toBe(false);
    await db.close();
  });

  it("detects a change made around the triggers", async () => {
    const db = await open();
    if (!db) return;
    const log = new AuditLog(db, SECRET);
    await log.migrate();
    for (let i = 0; i < 4; i++) await log.append({ actor: "a@co.com", action: "user.update", target: `u${i}`, detail: { role: "planner" } });
    // Someone with full database access removes the guard and edits an entry.
    if (db.dialect === "sqlite") await db.exec("drop trigger audit_log_no_update");
    else await db.exec("drop trigger audit_log_guard on audit_log");
    await db.exec(`update audit_log set detail = '{"role":"admin"}' where seq = 2`);
    expect(await log.verify()).toMatchObject({ ok: false, brokenAt: 2, reason: expect.stringMatching(/changed/) });
    await db.close();
  });

  it("detects a removed entry", async () => {
    const db = await open();
    if (!db) return;
    const log = new AuditLog(db, SECRET);
    await log.migrate();
    for (let i = 0; i < 4; i++) await log.append({ actor: "a@co.com", action: "login.ok" });
    if (db.dialect === "sqlite") await db.exec("drop trigger audit_log_no_delete");
    else await db.exec("drop trigger audit_log_guard on audit_log");
    await db.exec("delete from audit_log where seq = 3");
    expect(await log.verify()).toMatchObject({ ok: false, brokenAt: 3, reason: expect.stringMatching(/missing/) });
    await db.close();
  });

  it("removes old entries by retention and still verifies", async () => {
    const db = await open();
    if (!db) return;
    const log = new AuditLog(db, SECRET);
    await log.migrate();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() - 400 * 86_400_000));
    for (let i = 0; i < 3; i++) await log.append({ actor: "old@co.com", action: "login.ok" });
    vi.useRealTimers();
    for (let i = 0; i < 2; i++) await log.append({ actor: "new@co.com", action: "login.ok" });
    await expect(log.truncate(10, "admin@co.com")).rejects.toThrow(/30 days/);
    const cp = await log.truncate(365, "admin@co.com");
    expect(cp).toMatchObject({ cutSeq: 3, removed: 3, days: 365 });
    expect(cp!.lastRemovedHash).toBe(cp!.firstKeptPrevHash);
    const v = await log.verify();
    expect(v).toMatchObject({ ok: true, checked: 3, anchoredOn: cp!.id });
    const left = await log.list();
    expect(left.map((e) => e.seq)).toEqual([6, 5, 4]);
    expect(left[0].action).toBe("audit.retention");
    // Checkpoints cannot be changed or removed, and entries after the cut stay protected.
    await expect(db.exec("delete from audit_checkpoints")).rejects.toThrow();
    await expect(db.exec("delete from audit_log where seq = 4")).rejects.toThrow();
    expect(auditCsv(left).split("\n")[0]).toBe("seq,at,actor,action,target,ip,detail,prev_hash,hash");
    await db.close();
  });
});

const project = () => ({ format: "stratum-project", version: 2, savedAt: "", modelFileName: null, schedule: parseXer(demoXer()), links: [], rules: [], profiles: [] });

describe.each(drivers)("Stratum Server security on %s", (_name, open) => {
  it("locks sign-in, ends sessions on change, guards the last admin, and needs approval for P6", async () => {
    const db = await open();
    if (!db) return;
    const repo = new Repository(db);
    await repo.migrate();
    const api = new StratumApi({ repo, box: aesBox(SECRET), renderPdf: null });
    const pushed: string[] = [];
    api.p6Push = async (conn, s) => (pushed.push(`${conn}:${s.projectCode}`), { updated: s.activities.length, skipped: [] });
    const { app, audit } = await buildServer({ repo, api, jwtSecret: SECRET, lockout: { attempts: 3, minutes: 15 } });
    const call = async (method: string, url: string, token?: string, payload?: unknown, ip = "10.0.0.1") => {
      const r = await app.inject({ method: method as "GET", url, remoteAddress: ip, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: payload as object });
      return { status: r.statusCode, body: r.body && r.headers["content-type"]?.toString().includes("json") ? JSON.parse(r.body) : r.body, headers: r.headers };
    };
    const login = async (email: string, password: string, ip?: string) => (await call("POST", "/api/login", undefined, { email, password }, ip)).body.token as string;

    const admin = (await call("POST", "/api/setup", undefined, { email: "admin@co.com", name: "Admin", password: "correct horse" })).body.token as string;
    const res = await call("GET", "/api/me", admin);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");

    // Lockout: 3 wrong passwords from one address lock that address for this account.
    for (let i = 0; i < 3; i++) expect((await call("POST", "/api/login", undefined, { email: "admin@co.com", password: "wrong" })).status).toBe(401);
    const locked = await call("POST", "/api/login", undefined, { email: "admin@co.com", password: "correct horse" });
    expect(locked.status).toBe(429);
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);
    // Another address can still sign in until the per-account limit (twice as many) is reached.
    expect(await login("admin@co.com", "correct horse", "10.0.0.2")).toBeTruthy();

    // The last admin cannot be demoted or removed.
    const me = (await call("GET", "/api/me", admin)).body.sub as string;
    expect((await call("PUT", `/api/users/${me}`, admin, { email: "admin@co.com", name: "Admin", role: "planner" })).body.error).toMatch(/only admin/);

    // A role change applies at once and ends the user's sessions.
    await call("PUT", "/api/users/u-plan", admin, { email: "plan@co.com", name: "Planner", role: "planner", password: "planner-pass", reason: "New planner" }, "10.0.0.2");
    const planner = await login("plan@co.com", "planner-pass", "10.0.0.3");
    expect((await call("PUT", "/api/projects/p1", planner, { project: project() })).status).toBe(200);
    await call("PUT", "/api/users/u-plan", admin, { email: "plan@co.com", name: "Planner", role: "viewer", reason: "Moved to site" }, "10.0.0.2");
    expect((await call("GET", "/api/projects", planner)).status).toBe(401);
    const viewer = await login("plan@co.com", "planner-pass", "10.0.0.3");
    expect((await call("PUT", "/api/projects/p1", viewer, { project: project() })).status).toBe(403);
    await call("PUT", "/api/users/u-plan", admin, { email: "plan@co.com", name: "Planner", role: "planner", reason: "Back on the project" }, "10.0.0.2");
    const planner2 = await login("plan@co.com", "planner-pass", "10.0.0.3");

    // P6 push: a planner's push waits; the admin reviews and approves exactly that content.
    await call("PUT", "/api/settings/p6", admin, [{ id: "c1", name: "Company P6", kind: "eppm", url: "https://p6.example.com/p6ws/restapi", username: "u", password: "p" }]);
    const s = parseXer(demoXer());
    const ask = await call("POST", "/api/p6/c1/push", planner2, { schedule: s, note: "Week 44 update" });
    expect(ask.body).toMatchObject({ updated: 0, pendingApproval: expect.any(String) });
    expect(pushed).toEqual([]);
    const id = ask.body.pendingApproval as string;
    expect((await call("POST", `/api/approvals/${id}/approve`, planner2)).status).toBe(403);
    const review = (await call("GET", `/api/approvals/${id}`, admin)).body;
    expect(review).toMatchObject({ status: "pending", requestedBy: "plan@co.com", summary: { projectCode: s.projectCode, activities: s.activities.length } });
    expect(review.payload).toBeUndefined();
    expect((await call("POST", `/api/approvals/${id}/reject`, admin, {})).status).toBe(400);
    const ok = await call("POST", `/api/approvals/${id}/approve`, admin, { reason: "Checked" });
    expect(ok.body).toMatchObject({ status: "approved", result: { updated: s.activities.length } });
    expect(pushed).toEqual([`c1:${s.projectCode}`]);
    expect((await call("POST", `/api/approvals/${id}/approve`, admin)).status).toBe(409);

    // A request changed after it was made cannot be approved.
    const ask2 = (await call("POST", "/api/p6/c1/push", planner2, { schedule: s })).body.pendingApproval as string;
    await db.exec("update approvals set payload = ? where id = ?", [JSON.stringify({ connectionId: "c1", schedule: { ...s, projectCode: "OTHER" } }), ask2]);
    expect((await call("POST", `/api/approvals/${ask2}/approve`, admin)).status).toBe(409);
    expect(pushed).toHaveLength(1);
    // The requester can withdraw their own request.
    expect((await call("POST", `/api/approvals/${ask2}/reject`, planner2, {})).body.status).toBe("rejected");

    // Two-person rule: an admin's own request needs another admin.
    expect((await call("PUT", "/api/security", planner2, { p6Approval: "off" })).status).toBe(403);
    await call("PUT", "/api/security", admin, { p6Approval: "two-person" });
    const ask3 = (await call("POST", "/api/p6/c1/push", admin, { schedule: s })).body.pendingApproval as string;
    expect((await call("POST", `/api/approvals/${ask3}/approve`, admin)).body.error).toMatch(/other than the requester/);
    await call("PUT", "/api/users/u-adm2", admin, { email: "second@co.com", name: "Second", role: "admin", password: "second-pass" }, "10.0.0.2");
    const second = await login("second@co.com", "second-pass", "10.0.0.4");
    expect((await call("POST", `/api/approvals/${ask3}/approve`, second)).body.status).toBe("approved");
    expect(pushed).toHaveLength(2);
    expect((await call("PUT", "/api/security", admin, { auditDays: 5 })).status).toBe(400);

    // Everything above is in the audit log, it verifies, and secrets are not in it.
    expect((await call("GET", "/api/audit", planner2)).status).toBe(403);
    const entries = (await call("GET", "/api/audit?limit=500", admin)).body as { action: string; detail: Record<string, unknown>; ip: string }[];
    const actions = entries.map((e) => e.action);
    for (const a of ["setup.admin", "login.failed", "login.locked", "login.ok", "user.create", "user.update", "project.save", "settings.p6", "approval.request", "approval.approve", "approval.tampered", "approval.reject", "p6.push", "security.policy"]) expect(actions).toContain(a);
    expect(entries.find((e) => e.action === "user.update")?.detail.reason).toBeTruthy();
    expect(entries.find((e) => e.action === "login.failed")?.ip).toBe("10.0.0.1");
    expect(JSON.stringify(entries)).not.toContain("planner-pass");
    expect(JSON.stringify(entries)).not.toMatch(/"password":"p"/);
    expect((await call("GET", "/api/audit/verify", admin)).body).toMatchObject({ ok: true });
    const csv = await call("GET", "/api/audit/export.csv", admin);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(String(csv.body).split("\n").length).toBeGreaterThan(entries.length);
    expect((await audit.verify()).ok).toBe(true);
    await app.close();
    await db.close();
  });
});
