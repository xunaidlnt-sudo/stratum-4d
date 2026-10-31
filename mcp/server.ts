// Stratum 4D MCP server: lets an AI assistant (Claude Desktop, Claude Code or
// any MCP client) work with Stratum schedules over stdio.
//
// It opens P6 XER, Microsoft Project XML and .stratum.json files, and the
// projects in the Stratum 4D desktop database. It reads activities, runs the
// scheduler, reports KPIs, the critical path and schedule checks, compares two
// schedules, records progress and exports XER / MS Project XML / CSV / Stratum
// files. Everything runs on this machine; nothing is sent anywhere.
//
// Build: npm run build:mcp  →  mcp/dist/stratum-mcp.cjs   (see mcp/README.md)

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { claimDigger } from "../src/core/compare";
import { scheduleCpm, ScheduleLoopError } from "../src/core/cpm";
import { kpi } from "../src/core/dashboardData";
import { kpiActivities } from "../src/core/drill";
import { EXTRA_KPIS } from "../src/core/kpiExtra";
import { cellCtx, editTaskCell, mspRows, rowNumbers } from "../src/core/msp";
import { parseMspdi } from "../src/core/mspdi";
import { writeMspdi } from "../src/core/mspdiWrite";
import { checkSchedule, updateProgress } from "../src/core/ops";
import { parseProject, serializeProject, type StratumProject } from "../src/core/project";
import type { KpiMetric } from "../src/core/reporting";
import type { Activity, Schedule } from "../src/core/types";
import { decodeXer, parseXer } from "../src/core/xer";
import { exportCsv, exportXer } from "../src/core/xerExport";
import { Repository } from "../src/services/repo";
import { openSqlite } from "../src/services/sql";

const DAY = 86_400_000;
const VERSION = "0.10.1";

// ---------------------------------------------------------------- open schedules

interface Open {
  handle: string;
  schedule: Schedule;
  source: string;
  /** The whole Stratum project when it came from a .stratum.json file or the database (keeps model links). */
  project?: StratumProject;
  dbId?: string;
  dbVersion?: number;
  changed: boolean;
}
const open = new Map<string, Open>();
let seq = 0;

function remember(o: Omit<Open, "handle" | "changed">): Open {
  const handle = `s${++seq}`;
  const v = { ...o, handle, changed: false };
  open.set(handle, v);
  return v;
}
function get(handle: string): Open {
  const o = open.get(handle);
  if (!o) throw new Error(`No open schedule "${handle}". Use open_file or open_project first; list_open shows what is open.`);
  return o;
}

function readScheduleFile(file: string): { schedule: Schedule; project?: StratumProject } {
  const abs = path.resolve(file.replace(/^~(?=$|\/|\\)/, os.homedir()));
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
  const ext = path.extname(abs).toLowerCase();
  const bytes = fs.readFileSync(abs);
  if (ext === ".xer") return { schedule: parseXer(decodeXer(new Uint8Array(bytes))) };
  if (ext === ".xml") return { schedule: parseMspdi(bytes.toString("utf8")) };
  if (ext === ".json" || abs.endsWith(".stratum.json")) {
    const project = parseProject(bytes.toString("utf8"));
    if (!project.schedule) throw new Error("This Stratum project file has no schedule.");
    return { schedule: project.schedule, project };
  }
  throw new Error(`Cannot read "${ext}" files. Use .xer (P6), .xml (MS Project XML) or .stratum.json.`);
}

// ---------------------------------------------------------------- desktop database

/** Where the Stratum 4D desktop app keeps its database (override with STRATUM_DB). */
function defaultDb(): string {
  if (process.env.STRATUM_DB) return process.env.STRATUM_DB;
  const home = os.homedir();
  const base =
    process.platform === "win32"
      ? (process.env.APPDATA ?? path.join(home, "AppData", "Roaming"))
      : process.platform === "darwin"
        ? path.join(home, "Library", "Application Support")
        : (process.env.XDG_CONFIG_HOME ?? path.join(home, ".config"));
  return path.join(base, "Stratum 4D", "stratum.db");
}
async function withRepo<T>(fn: (r: Repository) => Promise<T>, write = false): Promise<T> {
  const file = defaultDb();
  if (!fs.existsSync(file)) throw new Error(`No Stratum database at ${file}. Open the desktop app once, or set STRATUM_DB to the database file.`);
  const repo = new Repository(await openSqlite(file, { wasmDir: __dirname, readOnly: !write }));
  try {
    return await fn(repo);
  } finally {
    await repo.close();
  }
}

// ---------------------------------------------------------------- formatting

const fmt = (t: number | null | undefined) => (t === null || t === undefined ? null : new Date(t).toISOString().slice(0, 10));
const hpdOf = (s: Schedule) => ((s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0])?.hoursPerDay || 8;
const days = (h: number | null | undefined, hpd: number) => (h === null || h === undefined ? null : Math.round((h / hpd) * 10) / 10);
const wbsPath = (s: Schedule) => {
  const byId = new Map(s.wbs.map((w) => [w.id, w]));
  const memo = new Map<string, string>();
  const name = (id: string | null): string => {
    if (!id) return "";
    if (memo.has(id)) return memo.get(id)!;
    const w = byId.get(id);
    const v = !w ? "" : [name(w.parentId), w.name].filter(Boolean).join(" › ");
    memo.set(id, v);
    return v;
  };
  return name;
};
function row(s: Schedule, a: Activity, wbs: (id: string | null) => string) {
  const hpd = hpdOf(s);
  return {
    id: a.code,
    name: a.name,
    wbs: wbs(a.wbsId),
    type: a.type,
    status: a.status,
    percentComplete: Math.round(a.percentComplete * 10) / 10,
    start: fmt(a.start),
    finish: fmt(a.finish),
    actualStart: fmt(a.actualStart),
    actualFinish: fmt(a.actualFinish),
    baselineStart: fmt(a.baselineStart),
    baselineFinish: fmt(a.baselineFinish),
    originalDurationDays: days(a.originalDurationHours, hpd),
    remainingDurationDays: days(a.remainingDurationHours, hpd),
    totalFloatDays: days(a.totalFloatHours, hpd),
    critical: a.critical,
  };
}
function summary(o: Open) {
  const s = o.schedule;
  const acts = s.activities.filter((a) => a.type !== "wbs-summary");
  const starts = acts.map((a) => a.start).filter((x): x is number => x !== null);
  const finishes = acts.map((a) => a.finish).filter((x): x is number => x !== null);
  return {
    handle: o.handle,
    source: o.source,
    project: { code: s.projectCode, name: s.projectName },
    dataDate: fmt(s.dataDate),
    start: fmt(starts.length ? Math.min(...starts) : null),
    finish: fmt(finishes.length ? Math.max(...finishes) : null),
    activities: acts.length,
    wbsNodes: s.wbs.length,
    relationships: s.relationships.length,
    resources: s.resources?.length ?? 0,
    assignments: s.assignments?.length ?? 0,
    status: { notStarted: acts.filter((a) => a.status === "not-started").length, inProgress: acts.filter((a) => a.status === "in-progress").length, complete: acts.filter((a) => a.status === "complete").length },
    critical: acts.filter((a) => a.critical && a.status !== "complete").length,
    hasBaseline: acts.some((a) => a.baselineFinish !== null),
    modelLinks: o.project?.links.length ?? 0,
    unsavedChanges: o.changed,
  };
}
const text = (v: unknown) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }] });
const fail = (e: unknown) => ({ content: [{ type: "text" as const, text: (e as Error).message ?? String(e) }], isError: true });
const tool = <A,>(fn: (a: A) => unknown | Promise<unknown>) => async (a: A) => {
  try {
    return text(await fn(a));
  } catch (e) {
    return fail(e);
  }
};
const parseDate = (v: string) => {
  const t = Date.parse(/T/.test(v) ? v : `${v}T00:00:00Z`);
  if (!Number.isFinite(t)) throw new Error(`"${v}" is not a date. Use YYYY-MM-DD.`);
  return t;
};

// ---------------------------------------------------------------- server

const server = new McpServer({ name: "stratum-4d", version: VERSION });
const handle = z.string().describe("Handle of an open schedule, e.g. s1 (from open_file, open_project or list_open)");

server.registerTool(
  "open_file",
  { description: "Open a schedule file: Primavera P6 .xer, Microsoft Project .xml (MSPDI) or a Stratum .stratum.json project. Returns a handle and a summary.", inputSchema: { path: z.string().describe("Path to the file") } },
  tool(({ path: p }: { path: string }) => {
    const r = readScheduleFile(p);
    return summary(remember({ schedule: r.schedule, project: r.project, source: path.resolve(p) }));
  }),
);

server.registerTool(
  "list_projects",
  { description: "List the projects saved in the Stratum 4D desktop database on this computer (STRATUM_DB overrides the location).", inputSchema: {} },
  tool(() => withRepo(async (r) => (await r.listProjects()).map((p) => ({ id: p.id, code: p.code, name: p.name, dataDate: fmt(p.dataDate), version: p.version, updatedAt: p.updatedAt })))),
);

server.registerTool(
  "open_project",
  { description: "Open a project from the Stratum 4D desktop database by its id (see list_projects).", inputSchema: { id: z.string() } },
  tool(({ id }: { id: string }) =>
    withRepo(async (r) => {
      const got = await r.getProject(id);
      if (!got?.project.schedule) throw new Error(`No project with id "${id}" (or it has no schedule).`);
      return summary(remember({ schedule: got.project.schedule, project: got.project, source: `database:${id}`, dbId: id, dbVersion: got.version }));
    }),
  ),
);

server.registerTool("list_open", { description: "List the schedules open in this session.", inputSchema: {} }, tool(() => [...open.values()].map(summary)));

server.registerTool("summary", { description: "Summary of an open schedule: dates, counts, status, critical activities, baseline.", inputSchema: { handle } }, tool(({ handle: h }: { handle: string }) => summary(get(h))));

server.registerTool(
  "list_activities",
  {
    description: "List activities with filters. Dates are YYYY-MM-DD; durations and float are in working days.",
    inputSchema: {
      handle,
      text: z.string().optional().describe("Matches Activity ID, name or WBS"),
      status: z.enum(["not-started", "in-progress", "complete", "open"]).optional(),
      criticalOnly: z.boolean().optional(),
      startsBefore: z.string().optional(),
      finishesAfter: z.string().optional(),
      maxFloatDays: z.number().optional(),
      sortBy: z.enum(["start", "finish", "float", "id"]).optional(),
      limit: z.number().int().min(1).max(500).optional().describe("Default 50"),
    },
  },
  tool((a: { handle: string; text?: string; status?: string; criticalOnly?: boolean; startsBefore?: string; finishesAfter?: string; maxFloatDays?: number; sortBy?: string; limit?: number }) => {
    const s = get(a.handle).schedule;
    const wbs = wbsPath(s);
    const hpd = hpdOf(s);
    const q = a.text?.toLowerCase();
    const sb = a.startsBefore ? parseDate(a.startsBefore) : null;
    const fa = a.finishesAfter ? parseDate(a.finishesAfter) : null;
    let list = s.activities.filter((x) => x.type !== "wbs-summary");
    if (q) list = list.filter((x) => x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q) || wbs(x.wbsId).toLowerCase().includes(q));
    if (a.status === "open") list = list.filter((x) => x.status !== "complete");
    else if (a.status) list = list.filter((x) => x.status === a.status);
    if (a.criticalOnly) list = list.filter((x) => x.critical);
    if (sb !== null) list = list.filter((x) => x.start !== null && x.start < sb);
    if (fa !== null) list = list.filter((x) => x.finish !== null && x.finish > fa);
    if (a.maxFloatDays !== undefined) list = list.filter((x) => x.totalFloatHours !== null && x.totalFloatHours / hpd <= a.maxFloatDays!);
    const key = a.sortBy ?? "start";
    list.sort((x, y) => (key === "id" ? x.code.localeCompare(y.code) : key === "finish" ? (x.finish ?? 0) - (y.finish ?? 0) : key === "float" ? (x.totalFloatHours ?? Infinity) - (y.totalFloatHours ?? Infinity) : (x.start ?? 0) - (y.start ?? 0)));
    const limit = a.limit ?? 50;
    return { total: list.length, shown: Math.min(limit, list.length), activities: list.slice(0, limit).map((x) => row(s, x, wbs)) };
  }),
);

server.registerTool(
  "get_activity",
  { description: "Full detail of one activity by Activity ID: dates, durations, float, predecessors, successors, resources, notes.", inputSchema: { handle, id: z.string().describe("Activity ID (P6) or task code") } },
  tool(({ handle: h, id }: { handle: string; id: string }) => {
    const s = get(h).schedule;
    const a = s.activities.find((x) => x.code === id) ?? s.activities.find((x) => x.code.toLowerCase() === id.toLowerCase());
    if (!a) throw new Error(`No activity "${id}".`);
    const byId = new Map(s.activities.map((x) => [x.id, x]));
    const hpd = hpdOf(s);
    const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
    return {
      ...row(s, a, wbsPath(s)),
      constraint: a.constraint ? { type: a.constraint.type, date: fmt(a.constraint.date) } : null,
      freeFloatDays: days(a.freeFloatHours, hpd),
      lateStart: fmt(a.lateStart),
      lateFinish: fmt(a.lateFinish),
      predecessors: s.relationships.filter((r) => r.successorId === a.id).map((r) => ({ id: byId.get(r.predecessorId)?.code, name: byId.get(r.predecessorId)?.name, type: r.type, lagDays: days(r.lagHours, hpd), driving: !!r.driving })),
      successors: s.relationships.filter((r) => r.predecessorId === a.id).map((r) => ({ id: byId.get(r.successorId)?.code, name: byId.get(r.successorId)?.name, type: r.type, lagDays: days(r.lagHours, hpd) })),
      resources: (s.assignments ?? []).filter((x) => x.activityId === a.id).map((x) => ({ resource: res.get(x.resourceId)?.name ?? x.resourceId, budgetQty: x.budgetQty, actualQty: x.actualQty, remainingQty: x.remainingQty, budgetCost: x.budgetCost, actualCost: x.actualCost })),
      codes: a.codes,
      userFields: a.userFields ?? {},
      notes: a.notes ?? "",
    };
  }),
);

server.registerTool(
  "schedule",
  { description: "Run the CPM scheduler (F9): recalculates early/late dates, float and the critical path, from the data date or a new one.", inputSchema: { handle, dataDate: z.string().optional().describe("New data date, YYYY-MM-DD (optional)") } },
  tool(({ handle: h, dataDate }: { handle: string; dataDate?: string }) => {
    const o = get(h);
    const prevFinish = Math.max(...o.schedule.activities.map((a) => a.finish ?? -Infinity));
    try {
      const r = scheduleCpm(o.schedule, dataDate ? { dataDate: parseDate(dataDate) } : {});
      o.schedule = r.schedule;
      o.changed = true;
      return { projectFinish: fmt(r.projectFinish), previousFinish: Number.isFinite(prevFinish) ? fmt(prevFinish) : null, slipDays: Number.isFinite(prevFinish) ? Math.round((r.projectFinish - prevFinish) / DAY) : null, criticalActivities: r.criticalPath.length, warnings: r.warnings.slice(0, 40), moreWarnings: Math.max(0, r.warnings.length - 40) };
    } catch (e) {
      if (e instanceof ScheduleLoopError) throw new Error(`The logic has a loop: ${e.activityCodes.join(", ")}`);
      throw e;
    }
  }),
);

server.registerTool(
  "critical_path",
  { description: "The open critical activities in date order (longest path when available).", inputSchema: { handle, limit: z.number().int().min(1).max(500).optional() } },
  tool(({ handle: h, limit }: { handle: string; limit?: number }) => {
    const s = get(h).schedule;
    const wbs = wbsPath(s);
    const lp = s.activities.some((a) => a.longestPath);
    const list = s.activities.filter((a) => a.type !== "wbs-summary" && a.status !== "complete" && (lp ? a.longestPath : a.critical)).sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
    return { basis: lp ? "longest path" : "total float <= 0", count: list.length, activities: list.slice(0, limit ?? 100).map((x) => row(s, x, wbs)) };
  }),
);

const KPI_NAMES: KpiMetric[] = ["finish", "finishVariance", "dataDate", "percentComplete", "spi", "cpi", "bac", "eac", "vac", "ev", "ac", "activities", "critical", "late", "startingSoon", "actualPct", "blPlanPct", "sai", "blFinish", "remainingDuration", ...(Object.keys(EXTRA_KPIS) as KpiMetric[])];
server.registerTool(
  "kpis",
  { description: `Project KPIs (schedule and cost performance, DCMA-style health). Metrics: ${KPI_NAMES.join(", ")}. Omit metrics for a standard set.`, inputSchema: { handle, metrics: z.array(z.string()).optional() } },
  tool(({ handle: h, metrics }: { handle: string; metrics?: string[] }) => {
    const s = get(h).schedule;
    const want = (metrics?.length ? metrics : ["finish", "finishVariance", "percentComplete", "spi", "cpi", "critical", "late", "bei", "missingLogic", "negFloat", "hardConstraints"]) as KpiMetric[];
    return want.map((m) => {
      if (!KPI_NAMES.includes(m)) return { metric: m, error: "unknown metric" };
      const v = kpi(s, m);
      return { metric: m, label: v.label, value: v.value, raw: v.raw, ...(v.hint ? { hint: v.hint } : {}) };
    });
  }),
);

server.registerTool(
  "kpi_activities",
  { description: "The activities behind a count KPI (e.g. late, critical, missingLogic, negFloat, bei).", inputSchema: { handle, metric: z.string(), limit: z.number().int().min(1).max(500).optional() } },
  tool(({ handle: h, metric, limit }: { handle: string; metric: string; limit?: number }) => {
    const s = get(h).schedule;
    const r = kpiActivities(s, metric as KpiMetric);
    if (!r) throw new Error(`"${metric}" is not a count of activities.`);
    const wbs = wbsPath(s);
    return { title: r.title, count: r.rows.length, activities: r.rows.slice(0, limit ?? 100).map((x) => row(s, x, wbs)) };
  }),
);

server.registerTool(
  "check_schedule",
  { description: "Schedule quality check (P6 Check Schedule / DCMA 14-point style): missing logic, constraints, negative float, long durations, invalid dates and more.", inputSchema: { handle } },
  tool(({ handle: h }: { handle: string }) => {
    const r = checkSchedule(get(h).schedule);
    return { checked: r.checked, metrics: r.metrics };
  }),
);

server.registerTool(
  "compare",
  { description: "Compare two open schedules (e.g. last month's and this month's update): added, deleted and changed activities, logic changes and finish movement.", inputSchema: { base: handle.describe("Earlier schedule"), current: handle.describe("Later schedule"), limit: z.number().int().min(1).max(500).optional() } },
  tool(({ base, current, limit }: { base: string; current: string; limit?: number }) => {
    const r = claimDigger(get(base).schedule, get(current).schedule);
    const cut = <T,>(xs: T[]) => xs.slice(0, limit ?? 100);
    return { ...r, ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k, Array.isArray(v) ? cut(v) : v])) };
  }),
);

server.registerTool(
  "lookahead",
  { description: "Activities to start or finish in the next N days from the data date (a look-ahead schedule).", inputSchema: { handle, days: z.number().int().min(1).max(365).optional().describe("Default 21") } },
  tool(({ handle: h, days: n }: { handle: string; days?: number }) => {
    const s = get(h).schedule;
    const dd = s.dataDate ?? Date.now();
    const end = dd + (n ?? 21) * DAY;
    const wbs = wbsPath(s);
    const list = s.activities.filter((a) => a.type !== "wbs-summary" && a.status !== "complete" && ((a.start !== null && a.start <= end) || (a.finish !== null && a.finish <= end))).sort((x, y) => (x.start ?? 0) - (y.start ?? 0));
    return { from: fmt(dd), to: fmt(end), count: list.length, activities: list.slice(0, 200).map((x) => row(s, x, wbs)) };
  }),
);

server.registerTool(
  "update_activity",
  {
    description: "Record progress or change one activity. Run schedule afterwards to move the dates. Dates YYYY-MM-DD; durations in working days.",
    inputSchema: {
      handle,
      id: z.string(),
      percentComplete: z.number().min(0).max(100).optional(),
      actualStart: z.string().optional(),
      actualFinish: z.string().optional(),
      durationDays: z.number().min(0).optional(),
      remainingDays: z.number().min(0).optional(),
      notes: z.string().optional(),
    },
  },
  tool((a: { handle: string; id: string; percentComplete?: number; actualStart?: string; actualFinish?: string; durationDays?: number; remainingDays?: number; notes?: string }) => {
    const o = get(a.handle);
    const act = o.schedule.activities.find((x) => x.code === a.id);
    if (!act) throw new Error(`No activity "${a.id}".`);
    const ctx = cellCtx(o.schedule, rowNumbers(mspRows(o.schedule)).byRow);
    const ddmmyyyy = (v: string) => {
      const d = new Date(parseDate(v));
      return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
    };
    let s = o.schedule;
    if (a.durationDays !== undefined) s = editTaskCell(s, act.id, "duration", `${a.durationDays}d`, ctx);
    if (a.actualStart) s = editTaskCell(s, act.id, "actualStart", ddmmyyyy(a.actualStart), ctx);
    if (a.percentComplete !== undefined) s = editTaskCell(s, act.id, "pct", String(a.percentComplete), ctx);
    if (a.actualFinish) s = editTaskCell(s, act.id, "actualFinish", ddmmyyyy(a.actualFinish), ctx);
    if (a.remainingDays !== undefined) s = editTaskCell(s, act.id, "remDuration", `${a.remainingDays}d`, ctx);
    if (a.notes !== undefined) s = editTaskCell(s, act.id, "notes", a.notes, ctx);
    o.schedule = s;
    o.changed = true;
    return row(s, s.activities.find((x) => x.id === act.id)!, wbsPath(s));
  }),
);

server.registerTool(
  "update_progress",
  { description: "P6 Update Progress: move the data date and record progress as planned for everything (or the given Activity IDs) up to it. Then run schedule.", inputSchema: { handle, dataDate: z.string(), ids: z.array(z.string()).optional() } },
  tool(({ handle: h, dataDate, ids }: { handle: string; dataDate: string; ids?: string[] }) => {
    const o = get(h);
    const want = ids ? new Set(ids) : null;
    const r = updateProgress(o.schedule, parseDate(dataDate), want ? o.schedule.activities.filter((a) => want.has(a.code)).map((a) => a.id) : undefined);
    o.schedule = r.schedule;
    o.changed = true;
    return { dataDate, started: r.started, finished: r.finished, progressed: r.progressed };
  }),
);

server.registerTool(
  "export",
  { description: "Write an open schedule to a file: xer (P6), mspdi (MS Project XML), csv, or stratum (.stratum.json, keeps model links).", inputSchema: { handle, format: z.enum(["xer", "mspdi", "csv", "stratum"]), path: z.string().describe("Output file path") } },
  tool(({ handle: h, format, path: p }: { handle: string; format: "xer" | "mspdi" | "csv" | "stratum"; path: string }) => {
    const o = get(h);
    const abs = path.resolve(p.replace(/^~(?=$|\/|\\)/, os.homedir()));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (format === "xer") fs.writeFileSync(abs, exportXer(o.schedule));
    else if (format === "mspdi") fs.writeFileSync(abs, writeMspdi(o.schedule), "utf8");
    else if (format === "csv") fs.writeFileSync(abs, exportCsv(o.schedule), "utf8");
    else {
      const pr = o.project;
      fs.writeFileSync(abs, serializeProject({ modelFileName: pr?.modelFileName ?? null, schedule: o.schedule, links: pr?.links ?? [], rules: pr?.rules ?? [], profiles: pr?.profiles ?? [], segments: pr?.segments, groups: pr?.groups, paths: pr?.paths }), "utf8");
    }
    return { written: abs, bytes: fs.statSync(abs).size };
  }),
);

server.registerTool(
  "save_project",
  {
    description: "Save an open schedule back to the Stratum 4D desktop database. Projects opened from the database are saved as a new version (refused if someone saved in the meantime); others are added as new projects. Close the desktop app first.",
    inputSchema: { handle },
  },
  tool(({ handle: h }: { handle: string }) =>
    withRepo(async (r) => {
      const o = get(h);
      const pr = o.project;
      const body = parseProject(serializeProject({ modelFileName: pr?.modelFileName ?? null, schedule: o.schedule, links: pr?.links ?? [], rules: pr?.rules ?? [], profiles: pr?.profiles ?? [], segments: pr?.segments, groups: pr?.groups, paths: pr?.paths }));
      const id = o.dbId ?? `mcp-${Date.now().toString(36)}`;
      const version = await r.saveProject(id, body, { expectedVersion: o.dbVersion, user: "Stratum MCP" });
      o.dbId = id;
      o.dbVersion = version;
      o.changed = false;
      return { id, version };
    }, true),
  ),
);

server.registerTool("close", { description: "Close an open schedule (unsaved changes are lost).", inputSchema: { handle } }, tool(({ handle: h }: { handle: string }) => ({ closed: open.delete(h) })));

async function main() {
  await server.connect(new StdioServerTransport());
}
main().catch((e) => {
  process.stderr.write(`Stratum MCP server failed: ${(e as Error).message}\n`);
  process.exit(1);
});
