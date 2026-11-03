// Browser-only storage (IndexedDB). Projects, dashboards and schedules are
// kept in this browser. Email and P6 need the desktop app or a server.
//
// The backend is written against a small key-value store (Kv), so the web
// demo can run the same code on a per-session store: IndexedDB under its own
// name, or Cloudflare D1 behind /api/demo (see demo.ts).

import type { StratumProject } from "../core/project";
import { computeNextRun, type Dashboard, type ReportSchedule } from "../core/reporting";
import { ConflictError, NOT_IN_BROWSER, type Backend, type ProjectSummary } from "./types";

const STORES = ["projects", "dashboards", "schedules", "settings"] as const;
export type Store = (typeof STORES)[number];

/** The storage the browser backend needs: get, list, put and delete JSON values by key. */
export interface Kv {
  get<T>(store: Store, key: string): Promise<T | undefined>;
  all<T>(store: Store): Promise<T[]>;
  put(store: Store, key: string, value: unknown): Promise<void>;
  del(store: Store, key: string): Promise<void>;
}

function open(DB: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(DB: string, store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await open(DB);
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => {
      db.close();
      resolve(req ? (req.result as T) : (undefined as T));
    };
    t.onerror = () => reject(t.error);
  });
}

/** IndexedDB under a database name ("stratum-local" for the browser app). */
export function idbKv(DB: string): Kv {
  return {
    get: <T>(store: Store, key: string) => tx<T | undefined>(DB, store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
    all: <T>(store: Store) => tx<T[]>(DB, store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
    put: (store: Store, key: string, value: unknown) => tx<void>(DB, store, "readwrite", (s) => void s.put(value, key)),
    del: (store: Store, key: string) => tx<void>(DB, store, "readwrite", (s) => void s.delete(key)),
  };
}

export interface StoredProjectRecord {
  summary: ProjectSummary;
  project: StratumProject;
}

type StoredProject = StoredProjectRecord;

const unsupported = async (): Promise<never> => {
  throw new Error(NOT_IN_BROWSER);
};

export function browserBackend(kv: Kv = idbKv("stratum-local"), label = "This browser", listSummaries?: () => Promise<ProjectSummary[]>): Backend {
  const { get, all, put, del } = kv;
  return {
    kind: "browser",
    label,
    caps: { email: false, p6: false, pdf: false, alwaysOn: false, multiUser: false },
    user: null,
    async listProjects() {
      const list = listSummaries ? await listSummaries() : (await all<StoredProject>("projects")).map((p) => p.summary);
      return list.sort((a, b) => a.code.localeCompare(b.code));
    },
    async getProject(id) {
      const p = await get<StoredProject>("projects", id);
      return p ? { project: p.project, version: p.summary.version } : null;
    },
    async saveProject(id, project, expectedVersion) {
      const old = await get<StoredProject>("projects", id);
      if (old && expectedVersion !== undefined && old.summary.version !== expectedVersion) {
        throw new ConflictError("This project was saved in another tab. Reload it before saving.", old.summary.version);
      }
      const version = (old?.summary.version ?? 0) + 1;
      const s = project.schedule;
      await put("projects", id, {
        project,
        summary: { id, code: s?.projectCode ?? "PROJECT", name: s?.projectName ?? "Untitled", dataDate: s?.dataDate ?? null, version, updatedAt: new Date().toISOString(), updatedBy: null },
      } satisfies StoredProject);
      return version;
    },
    deleteProject: (id) => del("projects", id),
    async listDashboards() {
      return (await all<Dashboard>("dashboards")).sort((a, b) => a.name.localeCompare(b.name));
    },
    async getDashboard(id) {
      return (await get<Dashboard>("dashboards", id)) ?? null;
    },
    saveDashboard: (d) => put("dashboards", d.id, { ...d, updatedAt: new Date().toISOString() }),
    async deleteDashboard(id) {
      for (const s of await all<ReportSchedule>("schedules")) if (s.dashboardId === id) await del("schedules", s.id);
      await del("dashboards", id);
    },
    listSchedules: () => all<ReportSchedule>("schedules"),
    async saveSchedule(s) {
      const next = { ...s, nextRunAt: s.enabled ? new Date(computeNextRun(s, Date.now())).toISOString() : null };
      await put("schedules", s.id, next);
      return next;
    },
    deleteSchedule: (id) => del("schedules", id),
    runScheduleNow: unsupported,
    listRuns: async () => [],
    getSmtp: async () => null,
    setSmtp: unsupported,
    testSmtp: unsupported,
    getP6: async () => [],
    setP6: unsupported,
    p6Test: unsupported,
    p6Projects: unsupported,
    p6Import: unsupported,
    p6Push: unsupported,
  };
}
