// A folder in Google Drive or OneDrive used as Stratum's shared database.
// Each project is one file; a catalog file lists the projects with a version
// number used to stop one person overwriting another's save; a shared
// settings file holds the EPS, portfolios and enterprise codes.

import type { StratumProject } from "../../core/project";
import type { Dashboard } from "../../core/reporting";
import { ConflictError, type Backend, type ProjectSummary, type SessionUser } from "../types";

export interface CloudFile {
  id: string;
  name: string;
  /** Changes on every write: used for "only write if unchanged". */
  etag: string;
}

export interface CloudFolder {
  id: string;
  name: string;
}

/** What Stratum needs from a cloud drive. */
export interface CloudDrive {
  provider: "gdrive" | "onedrive";
  label: string;
  account(): Promise<{ email: string; name: string }>;
  /** Files directly in a folder. */
  list(folderId: string): Promise<CloudFile[]>;
  find(folderId: string, name: string): Promise<CloudFile | null>;
  read(file: CloudFile): Promise<string>;
  /**
   * Create or replace a file by name. With `ifMatch`, the write fails with
   * PreconditionFailed when the file changed since that etag was read.
   */
  write(folderId: string, name: string, text: string, opts?: { existing?: CloudFile | null; ifMatch?: string }): Promise<CloudFile>;
  remove(file: CloudFile): Promise<void>;
  /** Sub-folders for the folder picker; parent null lists the starting places (My Drive, Shared with me). */
  folders(parent: string | null): Promise<CloudFolder[]>;
  createFolder(parent: string | null, name: string): Promise<CloudFolder>;
}

export class PreconditionFailed extends Error {}

const CATALOG = "stratum-catalog.json";
const SHARED = "stratum-shared.json";
const projectFile = (id: string) => `${id}.stratum.json`;
const dashboardFile = (id: string) => `dashboard-${id}.json`;

interface Catalog {
  format: "stratum-catalog";
  projects: Record<string, ProjectSummary>;
}

/** The Backend for a cloud folder. Email, report schedules and P6 links need the Stratum Server. */
export function cloudBackend(drive: CloudDrive, folder: CloudFolder, user: SessionUser | null): Backend {
  const readCatalog = async (): Promise<{ cat: Catalog; file: CloudFile | null }> => {
    const file = await drive.find(folder.id, CATALOG);
    if (!file) return { cat: { format: "stratum-catalog", projects: {} }, file: null };
    try {
      const cat = JSON.parse(await drive.read(file)) as Catalog;
      return { cat: { format: "stratum-catalog", projects: cat.projects ?? {} }, file };
    } catch {
      return { cat: { format: "stratum-catalog", projects: {} }, file };
    }
  };
  /** Change the catalog with retries: a colleague may update it at the same moment. */
  const updateCatalog = async (fn: (cat: Catalog) => void) => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { cat, file } = await readCatalog();
      fn(cat);
      try {
        await drive.write(folder.id, CATALOG, JSON.stringify(cat, null, 1), { existing: file, ifMatch: file?.etag });
        return cat;
      } catch (e) {
        if (!(e instanceof PreconditionFailed)) throw e;
      }
    }
    throw new Error("The project list in the cloud folder kept changing; try again.");
  };
  const who = user?.name || user?.email || null;
  const unsupported = async (): Promise<never> => {
    throw new Error("Email, report schedules and P6 connections need the Stratum Server or the desktop app; the cloud folder stores projects and dashboards.");
  };
  let sharedCache: { data: Record<string, unknown>; file: CloudFile | null } | null = null;
  const readShared = async () => {
    const file = await drive.find(folder.id, SHARED);
    let data: Record<string, unknown> = {};
    if (file) {
      try {
        data = JSON.parse(await drive.read(file));
      } catch {
        data = {};
      }
    }
    sharedCache = { data, file };
    return sharedCache;
  };

  return {
    kind: "browser",
    label: `${drive.label}: ${folder.name}`,
    caps: { email: false, p6: false, pdf: false, alwaysOn: false, multiUser: true },
    user,
    async listProjects() {
      const { cat } = await readCatalog();
      return Object.values(cat.projects).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    },
    async getProject(id) {
      const { cat } = await readCatalog();
      const file = await drive.find(folder.id, projectFile(id));
      if (!file) return null;
      return { project: JSON.parse(await drive.read(file)) as StratumProject, version: cat.projects[id]?.version ?? 1 };
    },
    async saveProject(id, project, expectedVersion) {
      const { cat } = await readCatalog();
      const cur = cat.projects[id];
      if (cur && expectedVersion !== undefined && cur.version !== expectedVersion) {
        throw new ConflictError(`${cur.updatedBy ?? "Someone"} saved ${cur.code} at ${new Date(cur.updatedAt).toLocaleString()} after you opened it.`, cur.version);
      }
      const existing = await drive.find(folder.id, projectFile(id));
      await drive.write(folder.id, projectFile(id), JSON.stringify(project), { existing });
      const s = project.schedule;
      let version = 1;
      await updateCatalog((c) => {
        version = (c.projects[id]?.version ?? 0) + 1;
        c.projects[id] = { id, code: s?.projectCode ?? "PROJECT", name: s?.projectName ?? "Untitled", dataDate: s?.dataDate ?? null, version, updatedAt: new Date().toISOString(), updatedBy: who };
      });
      return version;
    },
    async deleteProject(id) {
      const file = await drive.find(folder.id, projectFile(id));
      if (file) await drive.remove(file);
      await updateCatalog((c) => void delete c.projects[id]);
    },
    async listDashboards() {
      const files = (await drive.list(folder.id)).filter((f) => f.name.startsWith("dashboard-") && f.name.endsWith(".json"));
      const out: Dashboard[] = [];
      for (const f of files) {
        try {
          out.push(JSON.parse(await drive.read(f)));
        } catch {
          /* skip a damaged file */
        }
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },
    async getDashboard(id) {
      const f = await drive.find(folder.id, dashboardFile(id));
      return f ? (JSON.parse(await drive.read(f)) as Dashboard) : null;
    },
    async saveDashboard(d) {
      const existing = await drive.find(folder.id, dashboardFile(d.id));
      await drive.write(folder.id, dashboardFile(d.id), JSON.stringify({ ...d, updatedAt: new Date().toISOString() }), { existing });
    },
    async deleteDashboard(id) {
      const f = await drive.find(folder.id, dashboardFile(id));
      if (f) await drive.remove(f);
    },
    listSchedules: async () => [],
    saveSchedule: unsupported,
    deleteSchedule: unsupported,
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
    async getShared(key) {
      return (sharedCache ?? (await readShared())).data[key];
    },
    async setShared(key, value) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const cur = await readShared();
        const data = { ...cur.data, [key]: value };
        try {
          const file = await drive.write(folder.id, SHARED, JSON.stringify(data, null, 1), { existing: cur.file, ifMatch: cur.file?.etag });
          sharedCache = { data, file };
          return;
        } catch (e) {
          if (!(e instanceof PreconditionFailed)) throw e;
        }
      }
      throw new Error("The shared settings in the cloud folder kept changing; try again.");
    },
  };
}

/** An in-memory drive, for tests and for trying the cloud flow without an account. */
export function memoryDrive(): CloudDrive & { files: Map<string, { folder: string; name: string; text: string; etag: number }> } {
  const files = new Map<string, { folder: string; name: string; text: string; etag: number }>();
  let n = 0;
  const meta = (id: string): CloudFile => ({ id, name: files.get(id)!.name, etag: String(files.get(id)!.etag) });
  return {
    provider: "gdrive",
    label: "Memory",
    files,
    account: async () => ({ email: "test@example.com", name: "Test" }),
    list: async (folder) => [...files.entries()].filter(([, f]) => f.folder === folder).map(([id]) => meta(id)),
    find: async (folder, name) => {
      const hit = [...files.entries()].find(([, f]) => f.folder === folder && f.name === name);
      return hit ? meta(hit[0]) : null;
    },
    read: async (f) => files.get(f.id)!.text,
    write: async (folder, name, text, opts) => {
      const hit = [...files.entries()].find(([, f]) => f.folder === folder && f.name === name);
      if (opts?.ifMatch !== undefined && hit && String(hit[1].etag) !== opts.ifMatch) throw new PreconditionFailed("changed");
      if (opts?.ifMatch !== undefined && !hit && opts.existing) throw new PreconditionFailed("deleted");
      const id = hit?.[0] ?? `f${++n}`;
      files.set(id, { folder, name, text, etag: (hit?.[1].etag ?? 0) + 1 });
      return meta(id);
    },
    remove: async (f) => void files.delete(f.id),
    folders: async () => [],
    createFolder: async (_p, name) => ({ id: `folder-${name}`, name }),
  };
}
