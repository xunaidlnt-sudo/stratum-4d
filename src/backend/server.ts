import { ConflictError, type Backend, type SessionUser } from "./types";

/** Settings > Security on Stratum Server. */
export interface SecurityPolicy {
  p6Approval: "off" | "admin" | "two-person";
  auditDays: number;
}
export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  ip: string;
  prevHash: string;
  hash: string;
}
export interface AuditVerify {
  ok: boolean;
  checked: number;
  brokenAt?: number;
  reason?: string;
  head?: { seq: number; hash: string };
  checkpoints: { id: number; at: string; cutSeq: number; removed: number; days: number }[];
}
export interface AisocConfig {
  enabled: boolean;
  consoleUrl: string;
  ingestUrl: string;
  tenantId: string;
  token: string;
  forward: "security" | "all";
  connectorId: string;
  status?: { enabled: boolean; queued: number; sent: number; dropped: number; lastSentAt: string | null; lastError: string | null; lastErrorAt: string | null };
}
export interface Approval {
  id: string;
  kind: string;
  status: "pending" | "approved" | "rejected" | "failed";
  title: string;
  payloadHash: string;
  requestedBy: string;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  reason: string;
  result: unknown;
  summary?: { projectCode: string; projectName: string; dataDate: number | null; activities: number; started: number; finished: number } | null;
}

export interface ServerStatus {
  needsSetup: boolean;
  pdf: boolean;
  server: true;
}

const clean = (url: string) => url.replace(/\/+$/, "");

async function request<T>(base: string, method: string, path: string, token: string | null, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${clean(base)}${path}`, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`Cannot reach the Stratum Server at ${base}. Check the address and your network.`);
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 409 && data?.version !== undefined) throw new ConflictError(data.error, data.version);
  if (!res.ok) {
    const err = new Error(data?.error ?? `Server error ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const serverStatus = (base: string) => request<ServerStatus>(base, "GET", "/api/status", null);
export const serverLogin = (base: string, email: string, password: string) =>
  request<{ token: string; user: SessionUser }>(base, "POST", "/api/login", null, { email, password });
export const serverSetup = (base: string, email: string, name: string, password: string) =>
  request<{ token: string; user: SessionUser }>(base, "POST", "/api/setup", null, { email, name, password });

export function serverBackend(base: string, token: string, user: SessionUser | null, pdf = true): Backend & {
  base: string;
  token: string;
  listUsers(): Promise<SessionUser[]>;
  saveUser(id: string, u: { email: string; name: string; role: string; password?: string; reason?: string }): Promise<void>;
  deleteUser(id: string): Promise<void>;
  getSecurity(): Promise<SecurityPolicy>;
  setSecurity(p: Partial<SecurityPolicy>): Promise<SecurityPolicy>;
  listApprovals(status?: Approval["status"]): Promise<Approval[]>;
  getApproval(id: string): Promise<Approval>;
  decideApproval(id: string, approve: boolean, reason?: string): Promise<{ status: string; result?: unknown }>;
  listAudit(o?: { before?: number; action?: string; actor?: string; limit?: number }): Promise<AuditEntry[]>;
  verifyAudit(): Promise<AuditVerify>;
  exportAudit(): Promise<Blob>;
  getAisoc(): Promise<AisocConfig>;
  setAisoc(c: Partial<AisocConfig>): Promise<AisocConfig>;
  testAisoc(c: Partial<AisocConfig>): Promise<{ ok: boolean; message: string }>;
  flushAisoc(): Promise<NonNullable<AisocConfig["status"]>>;
} {
  const r = <T>(method: string, path: string, body?: unknown) => request<T>(base, method, path, token, body);
  return {
    kind: "server",
    base,
    token,
    label: `Stratum Server (${clean(base)})`,
    caps: { email: true, p6: true, pdf, alwaysOn: true, multiUser: true },
    user,
    listProjects: () => r("GET", "/api/projects"),
    getProject: (id) => r<{ project: never; version: number }>("GET", `/api/projects/${encodeURIComponent(id)}`).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    saveProject: async (id, project, expectedVersion) => (await r<{ version: number }>("PUT", `/api/projects/${encodeURIComponent(id)}`, { project, expectedVersion })).version,
    deleteProject: async (id) => void (await r("DELETE", `/api/projects/${encodeURIComponent(id)}`)),
    listDashboards: () => r("GET", "/api/dashboards"),
    getDashboard: (id) => r<never>("GET", `/api/dashboards/${encodeURIComponent(id)}`).catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    saveDashboard: async (d) => void (await r("PUT", `/api/dashboards/${encodeURIComponent(d.id)}`, d)),
    deleteDashboard: async (id) => void (await r("DELETE", `/api/dashboards/${encodeURIComponent(id)}`)),
    listSchedules: () => r("GET", "/api/schedules"),
    saveSchedule: (s) => r("PUT", `/api/schedules/${encodeURIComponent(s.id)}`, s),
    deleteSchedule: async (id) => void (await r("DELETE", `/api/schedules/${encodeURIComponent(id)}`)),
    runScheduleNow: (id) => r("POST", `/api/schedules/${encodeURIComponent(id)}/run`),
    listRuns: (id) => r("GET", id ? `/api/schedules/${encodeURIComponent(id)}/runs` : "/api/runs"),
    getSmtp: async () => {
      const s = await r<Record<string, unknown>>("GET", "/api/settings/smtp");
      return s && Object.keys(s).length ? (s as never) : null;
    },
    setSmtp: async (s) => void (await r("PUT", "/api/settings/smtp", s)),
    testSmtp: async (smtp, to) => (await r<{ message: string }>("POST", "/api/settings/smtp/test", { smtp, to })).message,
    getP6: () => r("GET", "/api/settings/p6"),
    setP6: async (l) => void (await r("PUT", "/api/settings/p6", l)),
    p6Test: (connection) => r("POST", "/api/p6/test", { connection }),
    p6Projects: (id) => r("GET", `/api/p6/${encodeURIComponent(id)}/projects`),
    p6Import: (id, objectId) => r("POST", `/api/p6/${encodeURIComponent(id)}/import`, { objectId }),
    p6Push: (id, schedule) => r("POST", `/api/p6/${encodeURIComponent(id)}/push`, { schedule }),
    listUsers: () => r("GET", "/api/users"),
    saveUser: async (id, u) => void (await r("PUT", `/api/users/${encodeURIComponent(id)}`, u)),
    deleteUser: async (id) => void (await r("DELETE", `/api/users/${encodeURIComponent(id)}`)),
    getSecurity: () => r("GET", "/api/security"),
    setSecurity: (p) => r("PUT", "/api/security", p),
    listApprovals: (status) => r("GET", `/api/approvals${status ? `?status=${status}` : ""}`),
    getApproval: (id) => r("GET", `/api/approvals/${encodeURIComponent(id)}`),
    decideApproval: (id, approve, reason) => r("POST", `/api/approvals/${encodeURIComponent(id)}/${approve ? "approve" : "reject"}`, { reason }),
    listAudit: (o = {}) => {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") q.set(k, String(v));
      return r("GET", `/api/audit${q.size ? `?${q}` : ""}`);
    },
    verifyAudit: () => r("GET", "/api/audit/verify"),
    getAisoc: () => r("GET", "/api/aisoc"),
    setAisoc: (c) => r("PUT", "/api/aisoc", c),
    testAisoc: (c) => r("POST", "/api/aisoc/test", c),
    flushAisoc: () => r("POST", "/api/aisoc/flush"),
    exportAudit: async () => {
      const res = await fetch(`${clean(base)}/api/audit/export.csv`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      return res.blob();
    },
  };
}
