// Stratum Server: the shared, multi-user database host.
//
//   - Users with roles (admin / planner / viewer), bcrypt passwords, JWT sessions.
//   - REST API over the StratumApi service layer.
//   - Serves the web app, so the team just opens the server's address.
//   - Runs report schedules every minute and renders PDFs with headless Chromium.
//
// Security controls (see docs/SECURITY.md):
//   - Tamper-evident audit log of every sign-in and every change (services/audit).
//   - Sign-in lockout after repeated wrong passwords.
//   - The role is read from the database on each request, and a password or role
//     change ends the user's other sessions.
//   - The last admin cannot be removed or demoted.
//   - Pushes to P6 wait for an admin's approval (policy in Settings > Security).

import bcrypt from "bcryptjs";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { uid, type P6Connection, type SmtpSettings } from "../core/reporting";
import type { Schedule } from "../core/types";
import { StratumApi } from "../services/api";
import { AuditLog, auditCsv, canonical } from "../services/audit";
import { Repository, VersionConflictError, type ApprovalRecord, type UserRecord } from "../services/repo";

export type Role = UserRecord["role"];

export interface ServerOptions {
  repo: Repository;
  api: StratumApi;
  jwtSecret: string;
  staticDir?: string | null;
  /** Lifetime of a login session. */
  sessionHours?: number;
  log?: boolean;
  /** Defaults to an audit log in the same database, keyed from jwtSecret. */
  audit?: AuditLog;
  /** Wrong passwords before a sign-in is locked, and for how long. */
  lockout?: { attempts: number; minutes: number };
}

/** Settings > Security. */
export interface SecurityPolicy {
  /** "off": push at once. "admin": planners ask, admins push. "two-person": everyone asks, someone else approves. */
  p6Approval: "off" | "admin" | "two-person";
  /** Remove audit entries older than this many days (0 keeps them all; at least 30). */
  auditDays: number;
}
export const DEFAULT_POLICY: SecurityPolicy = { p6Approval: "admin", auditDays: 0 };

interface Claims {
  sub: string;
  email: string;
  name: string;
  role: Role;
  /** Token version of the user when the session was signed. */
  tv?: number;
  /** Render tokens can only read. */
  scope?: "render";
}

const RANK: Record<Role, number> = { viewer: 0, planner: 1, admin: 2 };
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Counts wrong passwords per address and per account. */
class Throttle {
  private fails = new Map<string, { n: number; first: number; until: number }>();
  constructor(
    private attempts: number,
    private ms: number,
  ) {}
  /** Milliseconds left on a lock, or 0. */
  locked(keys: string[]): number {
    const now = Date.now();
    let left = 0;
    for (const k of keys) {
      const f = this.fails.get(k);
      if (f && f.until > now) left = Math.max(left, f.until - now);
    }
    return left;
  }
  /** Records a failure; returns true when this failure locks the key. */
  fail(keys: string[], limits: number[]): boolean {
    const now = Date.now();
    let lockedNow = false;
    keys.forEach((k, i) => {
      let f = this.fails.get(k);
      if (!f || now - f.first > this.ms) f = { n: 0, first: now, until: 0 };
      f.n++;
      if (f.n >= limits[i]) {
        f.until = now + this.ms;
        lockedNow = true;
      }
      this.fails.set(k, f);
    });
    if (this.fails.size > 10_000) for (const [k, f] of this.fails) if (now - f.first > this.ms && f.until < now) this.fails.delete(k);
    return lockedNow;
  }
  clear(keys: string[]) {
    for (const k of keys) this.fails.delete(k);
  }
  get limit() {
    return this.attempts;
  }
}

export async function buildServer(o: ServerOptions) {
  const app = Fastify({ logger: o.log ?? false, bodyLimit: 200 * 1024 * 1024, trustProxy: process.env.STRATUM_TRUST_PROXY === "1" });
  const { api, repo } = o;
  const audit = o.audit ?? new AuditLog(repo.driver, o.jwtSecret);
  await audit.migrate();
  const lock = o.lockout ?? { attempts: 5, minutes: 15 };
  const throttle = new Throttle(lock.attempts, lock.minutes * 60_000);

  const sign = (c: Claims, hours: number) => jwt.sign(c, o.jwtSecret, { expiresIn: `${hours}h` });
  const session = (u: UserRecord) => ({
    token: sign({ sub: u.id, email: u.email, name: u.name, role: u.role, tv: u.tokenVersion ?? 0 }, o.sessionHours ?? 12),
    user: { id: u.id, email: u.email, name: u.name, role: u.role },
  });

  const auth = (min: Role) => async (req: FastifyRequest, reply: FastifyReply) => {
    const h = req.headers.authorization ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : "";
    let c: Claims;
    try {
      c = jwt.verify(token, o.jwtSecret) as Claims;
    } catch {
      return reply.code(401).send({ error: "Please sign in" });
    }
    if (c.scope === "render" && req.method !== "GET") return reply.code(401).send({ error: "Please sign in" });
    // The server's own PDF renderer: read-only, and not a user.
    if (!(c.scope === "render" && c.sub === "system")) {
      const u = await repo.getUserById(c.sub);
      if (!u) return reply.code(401).send({ error: "Please sign in" });
      if (c.scope !== "render" && (c.tv ?? 0) !== (u.tokenVersion ?? 0)) return reply.code(401).send({ error: "Your session ended because your account changed. Please sign in again." });
      // The role in the database wins, so a role change applies at once.
      c = { ...c, email: u.email, name: u.name, role: c.scope === "render" ? "viewer" : u.role };
    }
    if (RANK[c.role] < RANK[min]) return reply.code(403).send({ error: `Needs ${min} access` });
    (req as FastifyRequest & { user: Claims }).user = c;
  };
  const userOf = (req: FastifyRequest) => (req as FastifyRequest & { user: Claims }).user;
  const log = (req: FastifyRequest, action: string, target = "", detail: Record<string, unknown> = {}, actor?: string) =>
    audit.append({ actor: actor ?? (req as FastifyRequest & { user?: Claims }).user?.email ?? "anonymous", action, target, detail, ip: req.ip });

  const policy = async (): Promise<SecurityPolicy> => ({ ...DEFAULT_POLICY, ...((await repo.getSetting<Partial<SecurityPolicy>>("security")) ?? {}) });

  // The desktop app (app:// origin) and other front ends call the API directly.
  // Auth is a bearer token, never a cookie, so allowing any origin is safe here.
  app.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/api/")) return;
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
    reply.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    if (req.method === "OPTIONS") return reply.code(204).send();
  });
  app.addHook("onSend", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (req.protocol === "https") reply.header("Strict-Transport-Security", "max-age=31536000");
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof VersionConflictError) return reply.code(409).send({ error: err.message, version: err.current });
    const code = (err as { statusCode?: number }).statusCode;
    reply.code(code && code >= 400 && code < 600 ? code : 400).send({ error: err.message });
  });

  // ---- setup and sessions
  app.get("/api/health", async () => ({ ok: true }));
  app.get("/api/status", async () => ({ needsSetup: (await repo.countUsers()) === 0, pdf: api.canRenderPdf, server: true }));

  app.post<{ Body: { email: string; name: string; password: string } }>("/api/setup", async (req, reply) => {
    if ((await repo.countUsers()) > 0) return reply.code(409).send({ error: "Already set up" });
    const { email, name, password } = req.body ?? ({} as never);
    if (!email || !password || password.length < 8) return reply.code(400).send({ error: "Email and a password of at least 8 characters are required" });
    const u: UserRecord = { id: uid("usr"), email, name: name || email, role: "admin", passwordHash: await bcrypt.hash(password, 10), tokenVersion: 0 };
    await repo.saveUser(u);
    await log(req, "setup.admin", u.email, { userId: u.id }, u.email);
    return session(u);
  });

  app.post<{ Body: { email: string; password: string } }>("/api/login", async (req, reply) => {
    const email = String(req.body?.email ?? "")
      .trim()
      .toLowerCase()
      .slice(0, 200);
    const keys = [`ip:${req.ip}|${email}`, `acct:${email}`];
    const left = throttle.locked(keys);
    if (left) {
      reply.header("Retry-After", String(Math.ceil(left / 1000)));
      return reply.code(429).send({ error: `Too many wrong passwords. Try again in ${Math.ceil(left / 60_000)} minutes.` });
    }
    const u = await repo.getUserByEmail(email);
    if (!u || !(await bcrypt.compare(req.body?.password ?? "", u.passwordHash))) {
      // Per address the limit is the setting; per account it is twice that, so one address cannot lock everyone out quickly.
      const lockedNow = throttle.fail(keys, [throttle.limit, throttle.limit * 2]);
      await log(req, lockedNow ? "login.locked" : "login.failed", email, { known: !!u }, email || "anonymous");
      return reply.code(401).send({ error: "Wrong email or password" });
    }
    throttle.clear(keys);
    await log(req, "login.ok", u.email, {}, u.email);
    return session(u);
  });

  app.get("/api/me", { preHandler: auth("viewer") }, async (req) => userOf(req));

  // ---- users (admin)
  app.get("/api/users", { preHandler: auth("admin") }, async () => repo.listUsers());
  app.put<{ Params: { id: string }; Body: { email: string; name: string; role: Role; password?: string; reason?: string } }>("/api/users/:id", { preHandler: auth("admin") }, async (req) => {
    const b = req.body;
    if (!["admin", "planner", "viewer"].includes(b.role)) throw new Error("Invalid role");
    const old = await repo.getUserById(req.params.id);
    if (!old && !b.password) throw new Error("A password is required for a new user");
    if (b.password && b.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (old?.role === "admin" && b.role !== "admin" && (await repo.countAdmins()) <= 1) throw new Error("This is the only admin. Make another user an admin first.");
    const roleChanged = !!old && old.role !== b.role;
    const passwordChanged = !!b.password;
    await repo.saveUser({
      id: req.params.id,
      email: b.email,
      name: b.name || b.email,
      role: b.role,
      passwordHash: b.password ? await bcrypt.hash(b.password, 10) : old!.passwordHash,
      // A new password or role ends the user's other sessions.
      tokenVersion: (old?.tokenVersion ?? 0) + (old && (roleChanged || passwordChanged) ? 1 : 0),
    });
    await log(req, old ? "user.update" : "user.create", b.email, {
      userId: req.params.id,
      ...(old ? { from: { email: old.email, role: old.role } } : {}),
      role: b.role,
      passwordChanged,
      reason: String(b.reason ?? "").slice(0, 500),
    });
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/users/:id", { preHandler: auth("admin") }, async (req) => {
    if (userOf(req).sub === req.params.id) throw new Error("You cannot delete your own account");
    const old = await repo.getUserById(req.params.id);
    if (old?.role === "admin" && (await repo.countAdmins()) <= 1) throw new Error("This is the only admin.");
    await repo.deleteUser(req.params.id);
    await log(req, "user.delete", old?.email ?? req.params.id, { userId: req.params.id, role: old?.role });
    return { ok: true };
  });

  // ---- projects
  app.get("/api/projects", { preHandler: auth("viewer") }, async () => api.listProjects());
  app.get<{ Params: { id: string } }>("/api/projects/:id", { preHandler: auth("viewer") }, async (req, reply) => {
    const p = await api.getProject(req.params.id);
    return p ?? reply.code(404).send({ error: "Project not found" });
  });
  app.put<{ Params: { id: string }; Body: { project: never; expectedVersion?: number } }>("/api/projects/:id", { preHandler: auth("planner") }, async (req) => {
    const version = await api.saveProject(req.params.id, req.body.project, req.body.expectedVersion, userOf(req).email);
    const s = (req.body.project as { schedule?: Schedule } | undefined)?.schedule;
    await log(req, "project.save", req.params.id, { version, code: s?.projectCode, activities: s?.activities?.length ?? 0, sha256: sha256(JSON.stringify(req.body.project ?? null)) });
    return { version };
  });
  app.delete<{ Params: { id: string } }>("/api/projects/:id", { preHandler: auth("planner") }, async (req) => {
    const p = await api.getProject(req.params.id);
    await api.deleteProject(req.params.id);
    await log(req, "project.delete", req.params.id, { code: p?.project.schedule?.projectCode, version: p?.version });
    return { ok: true };
  });

  // ---- dashboards
  app.get("/api/dashboards", { preHandler: auth("viewer") }, async () => api.listDashboards());
  app.get<{ Params: { id: string } }>("/api/dashboards/:id", { preHandler: auth("viewer") }, async (req, reply) => (await api.getDashboard(req.params.id)) ?? reply.code(404).send({ error: "Not found" }));
  app.put<{ Params: { id: string }; Body: never }>("/api/dashboards/:id", { preHandler: auth("planner") }, async (req) => {
    await api.saveDashboard({ ...(req.body as object), id: req.params.id } as never);
    await log(req, "dashboard.save", req.params.id, { name: (req.body as { name?: string })?.name });
    return { ok: true };
  });
  app.delete<{ Params: { id: string } }>("/api/dashboards/:id", { preHandler: auth("planner") }, async (req) => {
    await api.deleteDashboard(req.params.id);
    await log(req, "dashboard.delete", req.params.id);
    return { ok: true };
  });

  // ---- report schedules
  app.get("/api/schedules", { preHandler: auth("viewer") }, async () => api.listSchedules());
  app.put<{ Params: { id: string }; Body: never }>("/api/schedules/:id", { preHandler: auth("planner") }, async (req) => {
    const r = await api.saveSchedule({ ...(req.body as object), id: req.params.id } as never);
    const b = req.body as { name?: string; recipients?: string[]; enabled?: boolean };
    await log(req, "report.save", req.params.id, { name: b?.name, recipients: b?.recipients, enabled: b?.enabled });
    return r;
  });
  app.delete<{ Params: { id: string } }>("/api/schedules/:id", { preHandler: auth("planner") }, async (req) => {
    await api.deleteSchedule(req.params.id);
    await log(req, "report.delete", req.params.id);
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/api/schedules/:id/run", { preHandler: auth("planner") }, async (req) => {
    const r = await api.runScheduleNow(req.params.id);
    await log(req, "report.run", req.params.id, { status: (r as { status?: string })?.status });
    return r;
  });
  app.get<{ Params: { id: string } }>("/api/schedules/:id/runs", { preHandler: auth("viewer") }, async (req) => api.listRuns(req.params.id));
  app.get("/api/runs", { preHandler: auth("viewer") }, async () => api.listRuns());

  // ---- settings (admin). Secrets never go into the audit log: only whether they changed.
  app.get("/api/settings/smtp", { preHandler: auth("admin") }, async () => (await api.getSmtp()) ?? {});
  app.put<{ Body: never }>("/api/settings/smtp", { preHandler: auth("admin") }, async (req) => {
    const s = req.body as SmtpSettings;
    await api.setSmtp(s);
    await log(req, "settings.smtp", s?.host ?? "", { port: s?.port, user: s?.user, from: s?.from, passwordChanged: !!s?.password && s.password !== "••••••••" });
    return { ok: true };
  });
  app.post<{ Body: { smtp: never; to?: string } }>("/api/settings/smtp/test", { preHandler: auth("admin") }, async (req) => ({ message: await api.testSmtp(req.body.smtp, req.body.to) }));
  app.get("/api/settings/p6", { preHandler: auth("planner") }, async () => api.getP6());
  app.put<{ Body: never }>("/api/settings/p6", { preHandler: auth("admin") }, async (req) => {
    const list = (req.body ?? []) as P6Connection[];
    await api.setP6(list as never);
    await log(req, "settings.p6", "", { connections: list.map((c) => ({ id: c.id, name: c.name, kind: c.kind })) });
    return { ok: true };
  });
  app.get<{ Params: { key: string } }>("/api/settings/general/:key", { preHandler: auth("viewer") }, async (req) => ({ value: await api.getSetting(req.params.key) }));
  app.put<{ Params: { key: string }; Body: { value: unknown } }>("/api/settings/general/:key", { preHandler: auth("admin") }, async (req, reply) => {
    if (req.params.key === "security") return reply.code(400).send({ error: "Use /api/security" });
    await api.setSetting(req.params.key, req.body.value);
    await log(req, "settings.general", req.params.key, { sha256: sha256(canonical(req.body.value ?? null)) });
    return { ok: true };
  });

  // ---- security policy (admin)
  app.get("/api/security", { preHandler: auth("planner") }, async () => policy());
  app.put<{ Body: Partial<SecurityPolicy> }>("/api/security", { preHandler: auth("admin") }, async (req) => {
    const old = await policy();
    const b = req.body ?? {};
    const next: SecurityPolicy = {
      p6Approval: b.p6Approval && ["off", "admin", "two-person"].includes(b.p6Approval) ? b.p6Approval : old.p6Approval,
      auditDays: b.auditDays === undefined ? old.auditDays : Math.round(Number(b.auditDays)),
    };
    if (next.auditDays !== 0 && !(next.auditDays >= 30)) throw new Error("Keep audit entries for at least 30 days, or 0 to keep them all");
    await repo.setSetting("security", next);
    await log(req, "security.policy", "", { from: old, to: next });
    return next;
  });

  // ---- P6
  app.post<{ Body: { connection: never } }>("/api/p6/test", { preHandler: auth("planner") }, async (req) => api.p6Test(req.body.connection));
  app.get<{ Params: { conn: string } }>("/api/p6/:conn/projects", { preHandler: auth("planner") }, async (req) => api.p6Projects(req.params.conn));
  app.post<{ Params: { conn: string }; Body: { objectId: string } }>("/api/p6/:conn/import", { preHandler: auth("planner") }, async (req) => {
    const s = await api.p6Import(req.params.conn, req.body.objectId);
    await log(req, "p6.import", req.params.conn, { objectId: req.body.objectId, code: s.projectCode, activities: s.activities.length });
    return s;
  });

  /** Runs a push and records it. */
  const runPush = async (req: FastifyRequest, conn: string, schedule: Schedule, approvalId?: string) => {
    const r = await api.p6Push(conn, schedule);
    await log(req, "p6.push", conn, { code: schedule.projectCode, updated: r.updated, skipped: r.skipped.length, approvalId, sha256: sha256(canonical(schedule)) });
    return r;
  };

  app.post<{ Params: { conn: string }; Body: { schedule: Schedule; note?: string } }>("/api/p6/:conn/push", { preHandler: auth("planner") }, async (req) => {
    const u = userOf(req);
    const pol = (await policy()).p6Approval;
    const schedule = req.body.schedule;
    if (pol === "off" || (pol === "admin" && u.role === "admin")) return runPush(req, req.params.conn, schedule);
    // Ask for approval. The approver sees what will be sent and approves exactly that (its SHA-256 is in the audit log).
    const conns = await api.getP6();
    const c = conns.find((x) => x.id === req.params.conn);
    if (!c) throw new Error("Unknown P6 connection");
    const payload = { connectionId: req.params.conn, schedule };
    const a: ApprovalRecord = {
      id: uid("apr"),
      kind: "p6.push",
      status: "pending",
      title: `Send progress for ${schedule.projectCode} (${schedule.activities.length} activities) to ${c.name}`,
      payload,
      payloadHash: sha256(canonical(payload)),
      requestedBy: u.email,
      requestedAt: new Date().toISOString(),
      decidedBy: null,
      decidedAt: null,
      reason: String(req.body.note ?? "").slice(0, 500),
      result: null,
    };
    await repo.addApproval(a);
    await log(req, "approval.request", a.id, { kind: a.kind, title: a.title, sha256: a.payloadHash, policy: pol });
    return { updated: 0, skipped: [], pendingApproval: a.id };
  });

  // ---- approvals
  app.get<{ Querystring: { status?: ApprovalRecord["status"] } }>("/api/approvals", { preHandler: auth("planner") }, async (req) => repo.listApprovals(req.query.status));
  app.get<{ Params: { id: string } }>("/api/approvals/:id", { preHandler: auth("planner") }, async (req, reply) => {
    const a = await repo.getApproval(req.params.id);
    if (!a) return reply.code(404).send({ error: "Not found" });
    const { payload, ...rest } = a;
    const s = (payload as { schedule?: Schedule }).schedule;
    // What the approver needs to judge the change, not the whole schedule.
    const started = s?.activities.filter((x) => x.actualStart).length ?? 0;
    const finished = s?.activities.filter((x) => x.actualFinish).length ?? 0;
    return { ...rest, summary: s ? { projectCode: s.projectCode, projectName: s.projectName, dataDate: s.dataDate, activities: s.activities.length, started, finished } : null };
  });
  const decide = (status: "approved" | "rejected") =>
    app.post<{ Params: { id: string }; Body: { reason?: string } }>(`/api/approvals/:id/${status === "approved" ? "approve" : "reject"}`, { preHandler: auth("planner") }, async (req, reply) => {
      const u = userOf(req);
      const a = await repo.getApproval(req.params.id);
      if (!a) return reply.code(404).send({ error: "Not found" });
      if (a.status !== "pending") return reply.code(409).send({ error: `Already ${a.status}` });
      const own = a.requestedBy.toLowerCase() === u.email.toLowerCase();
      const reason = String(req.body?.reason ?? "").slice(0, 500);
      // A requester may withdraw their own request; only an admin decides one, and never their own under the two-person rule.
      if (status === "approved" || !own) {
        if (u.role !== "admin") return reply.code(403).send({ error: "Needs admin access" });
        if (own && (await policy()).p6Approval === "two-person") return reply.code(403).send({ error: "Someone other than the requester must approve this" });
      }
      if (status === "rejected" && !own && !reason) return reply.code(400).send({ error: "Give a reason for the rejection" });
      // Rejecting is always safe; approving needs the content to be what was asked for.
      if (status === "approved" && sha256(canonical(a.payload)) !== a.payloadHash) {
        await log(req, "approval.tampered", a.id, { expected: a.payloadHash });
        return reply.code(409).send({ error: "This request was changed after it was made. It cannot be approved." });
      }
      if (!(await repo.decideApproval(a.id, status, u.email, reason || (own ? "Withdrawn by the requester" : "")))) return reply.code(409).send({ error: "Someone else decided this request first" });
      await log(req, status === "approved" ? "approval.approve" : "approval.reject", a.id, { kind: a.kind, requestedBy: a.requestedBy, sha256: a.payloadHash, reason });
      if (status === "rejected") return { status };
      const p = a.payload as { connectionId: string; schedule: Schedule };
      try {
        const result = await runPush(req, p.connectionId, p.schedule, a.id);
        await repo.decideApproval(a.id, "approved", u.email, reason, result, "approved");
        return { status, result };
      } catch (e) {
        await repo.decideApproval(a.id, "failed", u.email, (e as Error).message, null, "approved");
        await log(req, "approval.failed", a.id, { error: (e as Error).message });
        return reply.code(502).send({ error: `Approved, but the push failed: ${(e as Error).message}` });
      }
    });
  decide("approved");
  decide("rejected");

  // ---- audit log (admin)
  app.get<{ Querystring: { limit?: string; before?: string; action?: string; actor?: string } }>("/api/audit", { preHandler: auth("admin") }, async (req) =>
    audit.list({ limit: Number(req.query.limit ?? 100), before: req.query.before ? Number(req.query.before) : undefined, action: req.query.action, actor: req.query.actor }),
  );
  app.get("/api/audit/verify", { preHandler: auth("admin") }, async (req) => {
    const r = await audit.verify();
    await log(req, "audit.verify", "", { ok: r.ok, checked: r.checked, brokenAt: r.brokenAt });
    return { ...r, checkpoints: await audit.checkpoints() };
  });
  app.get("/api/audit/export.csv", { preHandler: auth("admin") }, async (req, reply) => {
    const all = [];
    for (let before: number | undefined; ; ) {
      const page = await audit.list({ limit: 1000, before });
      all.push(...page);
      if (page.length < 1000) break;
      before = page[page.length - 1].seq;
    }
    await log(req, "audit.export", "", { entries: all.length });
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="stratum-audit-${new Date().toISOString().slice(0, 10)}.csv"`);
    return auditCsv(all.reverse());
  });

  // ---- render tokens (used by the PDF renderer; also lets a user preview a report)
  app.post<{ Body: { dashboardId: string } }>("/api/render-token", { preHandler: auth("viewer") }, async (req) => {
    const u = userOf(req);
    return { token: sign({ sub: u.sub, email: u.email, name: u.name, role: "viewer", scope: "render" }, 0.25) };
  });

  // ---- web app
  if (o.staticDir && fs.existsSync(path.join(o.staticDir, "index.html"))) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, { root: path.resolve(o.staticDir), index: ["index.html"] });
  }

  /** A render token for the server's own PDF renderer. */
  const internalRenderToken = () => sign({ sub: "system", email: "system@stratum", name: "Report renderer", role: "viewer", scope: "render" }, 0.25);

  /** Daily: apply the retention policy and write the head of the chain to the server log. */
  const auditMaintenance = async (out: (m: string) => void = console.log) => {
    const pol = await policy();
    if (pol.auditDays >= 30) {
      const cp = await audit.truncate(pol.auditDays, "system@stratum");
      if (cp) out(`[stratum] audit retention: removed ${cp.removed} entries older than ${pol.auditDays} days (checkpoint ${cp.id})`);
    }
    const v = await audit.verify();
    out(v.ok ? `[stratum] audit log verified: ${v.checked} entries, head ${v.head ? `${v.head.seq} ${v.head.hash}` : "empty"}` : `[stratum] AUDIT LOG BROKEN at entry ${v.brokenAt}: ${v.reason}`);
    return v;
  };

  // Returned in a wrapper: a Fastify instance is "thenable", so awaiting it directly would start it.
  return { app, internalRenderToken, audit, auditMaintenance };
}
