// Stratum's database: projects, dashboards, report schedules, run history,
// settings and (on the server) users. Same schema on SQLite and PostgreSQL;
// project and dashboard bodies are stored as JSON text.

import type { StratumProject } from "../core/project";
import type { Dashboard, ReportRun, ReportSchedule } from "../core/reporting";
import type { SqlDriver } from "./sql";

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  dataDate: number | null;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: "admin" | "planner" | "viewer";
  passwordHash: string;
  /** Raised on a password or role change; sessions signed with an older value stop working. */
  tokenVersion?: number;
}

/** A change that waits for a person to approve it before it runs (for example a push to P6). */
export interface ApprovalRecord {
  id: string;
  kind: "p6.push";
  status: "pending" | "approved" | "rejected" | "failed";
  /** Short description shown in the queue. */
  title: string;
  /** What runs on approval. Its SHA-256 is recorded in the audit log, so the approver approves exactly this. */
  payload: unknown;
  payloadHash: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string;
  result: unknown;
}

export class VersionConflictError extends Error {
  constructor(public current: number) {
    super(`This project was saved by someone else in the meantime (now version ${current}). Reload it before saving.`);
  }
}

const SCHEMA = [
  `create table if not exists projects (
     id text primary key, code text not null, name text not null, data_date bigint,
     body text not null, version integer not null default 1,
     updated_at text not null, updated_by text)`,
  `create table if not exists dashboards (id text primary key, name text not null, project_id text, body text not null, updated_at text not null)`,
  `create table if not exists schedules (
     id text primary key, name text not null, dashboard_id text not null, body text not null,
     enabled integer not null default 1, next_run_at text, last_run_at text)`,
  `create table if not exists runs (id text primary key, schedule_id text not null, at text not null, status text not null, message text not null, manual integer not null default 0)`,
  `create table if not exists settings (key text primary key, value text not null)`,
  `create table if not exists users (id text primary key, email text unique not null, name text not null, role text not null, password_hash text not null)`,
  `create table if not exists approvals (
     id text primary key, kind text not null, status text not null, title text not null, payload text not null, payload_hash text not null,
     requested_by text not null, requested_at text not null, decided_by text, decided_at text, reason text not null, result text)`,
];

export class Repository {
  constructor(private db: SqlDriver) {}

  get dialect() {
    return this.db.dialect;
  }

  async migrate() {
    for (const sql of SCHEMA) await this.db.exec(sql);
    // Columns added after the first release.
    if (this.db.dialect === "postgres") await this.db.exec("alter table users add column if not exists token_version integer not null default 0");
    else {
      const cols = await this.db.query<{ name: string }>("pragma table_info(users)");
      if (!cols.some((c) => c.name === "token_version")) await this.db.exec("alter table users add column token_version integer not null default 0");
    }
  }

  /** The driver, for modules that keep their own tables (the audit log). */
  get driver() {
    return this.db;
  }

  async close() {
    await this.db.close();
  }

  // ---- projects

  async listProjects(): Promise<ProjectSummary[]> {
    const rows = await this.db.query<Record<string, unknown>>("select id, code, name, data_date, version, updated_at, updated_by from projects order by code");
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      dataDate: r.data_date === null || r.data_date === undefined ? null : Number(r.data_date),
      version: Number(r.version),
      updatedAt: String(r.updated_at),
      updatedBy: (r.updated_by as string) ?? null,
    }));
  }

  async getProject(id: string): Promise<{ project: StratumProject; version: number } | null> {
    const [r] = await this.db.query<{ body: string; version: number }>("select body, version from projects where id = ?", [id]);
    return r ? { project: JSON.parse(r.body), version: Number(r.version) } : null;
  }

  /**
   * Insert or update. Pass the version you loaded as `expectedVersion` to
   * guard against overwriting a teammate's save; omit it to force.
   */
  async saveProject(id: string, project: StratumProject, opts: { expectedVersion?: number; user?: string } = {}): Promise<number> {
    const s = project.schedule;
    const existing = await this.db.query<{ version: number }>("select version from projects where id = ?", [id]);
    const now = new Date().toISOString();
    const body = JSON.stringify(project);
    if (!existing.length) {
      await this.db.exec("insert into projects (id, code, name, data_date, body, version, updated_at, updated_by) values (?, ?, ?, ?, ?, 1, ?, ?)", [
        id,
        s?.projectCode ?? "PROJECT",
        s?.projectName ?? "Untitled",
        s?.dataDate ?? null,
        body,
        now,
        opts.user ?? null,
      ]);
      return 1;
    }
    const current = Number(existing[0].version);
    if (opts.expectedVersion !== undefined && opts.expectedVersion !== current) throw new VersionConflictError(current);
    const next = current + 1;
    await this.db.exec("update projects set code = ?, name = ?, data_date = ?, body = ?, version = ?, updated_at = ?, updated_by = ? where id = ?", [
      s?.projectCode ?? "PROJECT",
      s?.projectName ?? "Untitled",
      s?.dataDate ?? null,
      body,
      next,
      now,
      opts.user ?? null,
      id,
    ]);
    return next;
  }

  async deleteProject(id: string) {
    await this.db.exec("delete from projects where id = ?", [id]);
  }

  // ---- dashboards

  async listDashboards(): Promise<Dashboard[]> {
    const rows = await this.db.query<{ body: string }>("select body from dashboards order by name");
    return rows.map((r) => JSON.parse(r.body));
  }

  async getDashboard(id: string): Promise<Dashboard | null> {
    const [r] = await this.db.query<{ body: string }>("select body from dashboards where id = ?", [id]);
    return r ? JSON.parse(r.body) : null;
  }

  async saveDashboard(d: Dashboard) {
    const body = JSON.stringify({ ...d, updatedAt: new Date().toISOString() });
    const exists = (await this.db.query("select 1 from dashboards where id = ?", [d.id])).length > 0;
    if (exists) await this.db.exec("update dashboards set name = ?, project_id = ?, body = ?, updated_at = ? where id = ?", [d.name, d.projectId, body, new Date().toISOString(), d.id]);
    else await this.db.exec("insert into dashboards (id, name, project_id, body, updated_at) values (?, ?, ?, ?, ?)", [d.id, d.name, d.projectId, body, new Date().toISOString()]);
  }

  async deleteDashboard(id: string) {
    await this.db.exec("delete from dashboards where id = ?", [id]);
  }

  // ---- report schedules

  async listSchedules(): Promise<ReportSchedule[]> {
    const rows = await this.db.query<{ body: string }>("select body from schedules order by name");
    return rows.map((r) => JSON.parse(r.body));
  }

  async getSchedule(id: string): Promise<ReportSchedule | null> {
    const [r] = await this.db.query<{ body: string }>("select body from schedules where id = ?", [id]);
    return r ? JSON.parse(r.body) : null;
  }

  async saveSchedule(s: ReportSchedule) {
    const body = JSON.stringify(s);
    const exists = (await this.db.query("select 1 from schedules where id = ?", [s.id])).length > 0;
    if (exists)
      await this.db.exec("update schedules set name = ?, dashboard_id = ?, body = ?, enabled = ?, next_run_at = ?, last_run_at = ? where id = ?", [
        s.name,
        s.dashboardId,
        body,
        s.enabled ? 1 : 0,
        s.nextRunAt,
        s.lastRunAt,
        s.id,
      ]);
    else
      await this.db.exec("insert into schedules (id, name, dashboard_id, body, enabled, next_run_at, last_run_at) values (?, ?, ?, ?, ?, ?, ?)", [
        s.id,
        s.name,
        s.dashboardId,
        body,
        s.enabled ? 1 : 0,
        s.nextRunAt,
        s.lastRunAt,
      ]);
  }

  async deleteSchedule(id: string) {
    await this.db.exec("delete from schedules where id = ?", [id]);
    await this.db.exec("delete from runs where schedule_id = ?", [id]);
  }

  /** Enabled schedules whose next run is at or before `now`. */
  async dueSchedules(now: Date): Promise<ReportSchedule[]> {
    const rows = await this.db.query<{ body: string }>("select body from schedules where enabled = 1 and next_run_at is not null and next_run_at <= ?", [now.toISOString()]);
    return rows.map((r) => JSON.parse(r.body));
  }

  async addRun(run: ReportRun) {
    await this.db.exec("insert into runs (id, schedule_id, at, status, message, manual) values (?, ?, ?, ?, ?, ?)", [run.id, run.scheduleId, run.at, run.status, run.message, run.manual ? 1 : 0]);
  }

  async listRuns(scheduleId?: string, limit = 50): Promise<ReportRun[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      scheduleId ? "select * from runs where schedule_id = ? order by at desc limit ?" : "select * from runs order by at desc limit ?",
      scheduleId ? [scheduleId, limit] : [limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      scheduleId: String(r.schedule_id),
      at: String(r.at),
      status: r.status as ReportRun["status"],
      message: String(r.message),
      manual: Number(r.manual) === 1,
    }));
  }

  // ---- settings (JSON values)

  async getSetting<T>(key: string): Promise<T | null> {
    const [r] = await this.db.query<{ value: string }>("select value from settings where key = ?", [key]);
    return r ? (JSON.parse(r.value) as T) : null;
  }

  async setSetting(key: string, value: unknown) {
    const v = JSON.stringify(value);
    const exists = (await this.db.query("select 1 from settings where key = ?", [key])).length > 0;
    if (exists) await this.db.exec("update settings set value = ? where key = ?", [v, key]);
    else await this.db.exec("insert into settings (key, value) values (?, ?)", [key, v]);
  }

  // ---- users (server)

  async countUsers(): Promise<number> {
    const [r] = await this.db.query<{ n: number | string }>("select count(*) as n from users");
    return Number(r?.n ?? 0);
  }

  private user(r: Record<string, unknown>): UserRecord {
    return { id: String(r.id), email: String(r.email), name: String(r.name), role: r.role as UserRecord["role"], passwordHash: String(r.password_hash), tokenVersion: Number(r.token_version ?? 0) };
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const [r] = await this.db.query<Record<string, unknown>>("select * from users where lower(email) = lower(?)", [email]);
    return r ? this.user(r) : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const [r] = await this.db.query<Record<string, unknown>>("select * from users where id = ?", [id]);
    return r ? this.user(r) : null;
  }

  async listUsers(): Promise<Omit<UserRecord, "passwordHash" | "tokenVersion">[]> {
    const rows = await this.db.query<Record<string, string>>("select id, email, name, role from users order by email");
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, role: r.role as UserRecord["role"] }));
  }

  async countAdmins(): Promise<number> {
    const [r] = await this.db.query<{ n: number | string }>("select count(*) as n from users where role = 'admin'");
    return Number(r?.n ?? 0);
  }

  async saveUser(u: UserRecord) {
    const exists = (await this.db.query("select 1 from users where id = ?", [u.id])).length > 0;
    if (exists) await this.db.exec("update users set email = ?, name = ?, role = ?, password_hash = ?, token_version = ? where id = ?", [u.email, u.name, u.role, u.passwordHash, u.tokenVersion ?? 0, u.id]);
    else await this.db.exec("insert into users (id, email, name, role, password_hash, token_version) values (?, ?, ?, ?, ?, ?)", [u.id, u.email, u.name, u.role, u.passwordHash, u.tokenVersion ?? 0]);
  }

  async deleteUser(id: string) {
    await this.db.exec("delete from users where id = ?", [id]);
  }

  // ---- approvals (server)

  private approval(r: Record<string, unknown>): ApprovalRecord {
    return {
      id: String(r.id),
      kind: r.kind as ApprovalRecord["kind"],
      status: r.status as ApprovalRecord["status"],
      title: String(r.title),
      payload: JSON.parse(String(r.payload)),
      payloadHash: String(r.payload_hash),
      requestedBy: String(r.requested_by),
      requestedAt: String(r.requested_at),
      decidedBy: (r.decided_by as string) ?? null,
      decidedAt: (r.decided_at as string) ?? null,
      reason: String(r.reason ?? ""),
      result: r.result ? JSON.parse(String(r.result)) : null,
    };
  }

  async addApproval(a: ApprovalRecord) {
    await this.db.exec("insert into approvals (id, kind, status, title, payload, payload_hash, requested_by, requested_at, decided_by, decided_at, reason, result) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [
      a.id,
      a.kind,
      a.status,
      a.title,
      JSON.stringify(a.payload),
      a.payloadHash,
      a.requestedBy,
      a.requestedAt,
      a.decidedBy,
      a.decidedAt,
      a.reason,
      a.result === null ? null : JSON.stringify(a.result),
    ]);
  }

  async getApproval(id: string): Promise<ApprovalRecord | null> {
    const [r] = await this.db.query<Record<string, unknown>>("select * from approvals where id = ?", [id]);
    return r ? this.approval(r) : null;
  }

  /** Newest first, without the payloads (they can be whole schedules). */
  async listApprovals(status?: ApprovalRecord["status"], limit = 100): Promise<Omit<ApprovalRecord, "payload">[]> {
    const rows = await this.db.query<Record<string, unknown>>(
      `select id, kind, status, title, '' as payload, payload_hash, requested_by, requested_at, decided_by, decided_at, reason, result from approvals ${status ? "where status = ?" : ""} order by requested_at desc limit ?`,
      status ? [status, limit] : [limit],
    );
    return rows.map((r) => {
      const { payload: _p, ...rest } = this.approval({ ...r, payload: "null" });
      return rest;
    });
  }

  /**
   * Moves a request on to its decision, only if it is still in the state `from`
   * (pending, or approved while it runs). The update is conditional, so two
   * people deciding at once cannot both win. Returns false when it lost.
   */
  async decideApproval(id: string, status: Exclude<ApprovalRecord["status"], "pending">, by: string, reason: string, result: unknown = null, from: ApprovalRecord["status"] = "pending"): Promise<boolean> {
    const stamp = `${new Date().toISOString()}#${Math.random().toString(36).slice(2, 10)}`;
    await this.db.exec("update approvals set status = ?, decided_by = ?, decided_at = ?, reason = ?, result = ? where id = ? and status = ?", [
      status,
      by,
      stamp,
      reason,
      result === null ? null : JSON.stringify(result),
      id,
      from,
    ]);
    const [r] = await this.db.query<{ decided_at: string; status: string }>("select decided_at, status from approvals where id = ?", [id]);
    if (r?.decided_at !== stamp || r.status !== status) return false;
    await this.db.exec("update approvals set decided_at = ? where id = ? and decided_at = ?", [stamp.split("#")[0], id, stamp]);
    return true;
  }
}
