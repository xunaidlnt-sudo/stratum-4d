// The MS Project sheet: fields (columns), tables (Entry, Schedule, Tracking,
// Cost, Variance, Work, Summary) and the rows shown after filter, group and
// sort. Pure functions, so the Gantt Chart, Task Sheet and Task Usage views
// share them.

import { WEEKDAYS } from "../../core/dates";
import { formatMspDuration, formatMspPredecessor, missedDeadline, mspTaskType, outlineNumbers, type MspCell } from "../../core/msp";
import { buildGanttRows, type GanttRow } from "../../core/wbs";
import type { Activity, Relationship, Schedule } from "../../core/types";
import type { CustomFilter, MspFilter, MspGroup, MspSort, MspTable } from "./state";

const DAY = 86_400_000;

export const mspDateText = (t: number | null | undefined) => {
  if (t === null || t === undefined) return "NA";
  const d = new Date(t);
  return `${WEEKDAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${String(d.getUTCFullYear()).slice(2)}`;
};
const money = (v: number | null | undefined, cur: string) => (v === null || v === undefined ? "" : `${cur}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const hrs = (v: number | null | undefined) => (v === null || v === undefined ? "" : `${Math.round(v * 100) / 100} hrs`);

/** Figures rolled up for a row: tasks have their own, summaries sum the tasks below them. */
export interface RowFigures {
  start: number | null;
  finish: number | null;
  durationH: number;
  pct: number;
  cost: number;
  baselineCost: number;
  actualCost: number;
  remainingCost: number;
  work: number;
  baselineWork: number;
  actualWork: number;
  remainingWork: number;
  baselineStart: number | null;
  baselineFinish: number | null;
  actualStart: number | null;
  actualFinish: number | null;
  /** Earned value: budgeted cost of work scheduled (to the status date) and performed. */
  bcws: number;
  bcwp: number;
}

export type SheetRow =
  | { kind: "project"; key: string; depth: 0; id: null; fig: RowFigures; name: string }
  | { kind: "wbs"; key: string; depth: number; id: string; fig: RowFigures; name: string; collapsed: boolean }
  | { kind: "group"; key: string; depth: 0; id: null; fig: RowFigures; name: string }
  | { kind: "task"; key: string; depth: number; id: string; fig: RowFigures; a: Activity };

export interface SheetCtx {
  s: Schedule;
  hpd: number;
  /** Row number (ID column) of every task and summary, in outline order. */
  rowNo: Map<string, number>;
  outline: Map<string, string>;
  preds: Map<string, Relationship[]>;
  succs: Map<string, Relationship[]>;
  resNames: Map<string, string>;
  cur: string;
  calName: Map<string, string>;
}

export interface Field {
  key: string;
  label: string;
  width: number;
  align?: "right" | "center";
  /** Cell text for a row. */
  text: (r: SheetRow, c: SheetCtx) => string;
  /** Editable on tasks through editTaskCell. */
  edit?: MspCell;
  /** Editable on summary rows (name only). */
  editSummary?: boolean;
  /** Custom field (UDF) name, for custom field columns. */
  udf?: string;
}

/** A column for a custom field (Project › Custom Fields). */
export const udfField = (name: string): Field => ({ key: `udf:${name}`, label: name, width: 110, udf: name, text: (r) => (r.kind === "task" ? (r.a.userFields?.[name] ?? "") : "") });
export const fieldFor = (key: string): Field | undefined => (key.startsWith("udf:") ? udfField(key.slice(4)) : FIELD.get(key));

const dur = (h: number | null | undefined, c: SheetCtx, est = false) => formatMspDuration(h ?? 0, c.hpd, est);
const daysVar = (a: number | null | undefined, b: number | null | undefined, c: SheetCtx) => (a == null || b == null ? "0 days" : formatMspDuration(((a - b) / DAY) * (5 / 7) * c.hpd, c.hpd).replace(/^-?0 days$/, "0 days"));
const task = (r: SheetRow) => (r.kind === "task" ? r.a : null);
const CONSTRAINT_NAMES: Record<string, string> = {
  "start-on-or-after": "Start No Earlier Than",
  "start-on-or-before": "Start No Later Than",
  "finish-on-or-after": "Finish No Earlier Than",
  "finish-on-or-before": "Finish No Later Than",
  "start-on": "Must Start On",
  "finish-on": "Must Finish On",
  "mandatory-start": "Must Start On",
  "mandatory-finish": "Must Finish On",
  "as-late-as-possible": "As Late As Possible",
};

export const FIELDS: Field[] = [
  { key: "id", label: "ID", width: 38, align: "right", text: (r, c) => (r.kind === "project" ? "0" : r.id ? String(c.rowNo.get(r.id) ?? "") : "") },
  { key: "ind", label: "ⓘ", width: 26, align: "center", text: () => "" },
  { key: "mode", label: "Task Mode", width: 34, align: "center", text: (r) => (task(r)?.taskMode === "manual" ? "Manually Scheduled" : "Auto Scheduled"), edit: "mode" },
  { key: "name", label: "Task Name", width: 260, text: (r) => (r.kind === "task" ? r.a.name : r.name), edit: "name", editSummary: true },
  {
    key: "duration",
    label: "Duration",
    width: 76,
    text: (r, c) => (r.kind === "task" ? dur((r.a.type === "milestone" || r.a.type === "finish-milestone") ? 0 : r.a.originalDurationHours, c, r.a.estimated) : r.fig.start !== null ? dur(r.fig.durationH, c) : ""),
    edit: "duration",
  },
  { key: "start", label: "Start", width: 96, text: (r) => mspDateText(r.fig.start), edit: "start" },
  { key: "finish", label: "Finish", width: 96, text: (r) => mspDateText(r.fig.finish), edit: "finish" },
  { key: "pred", label: "Predecessors", width: 100, text: (r, c) => (r.kind === "task" ? (c.preds.get(r.a.id) ?? []).map((x) => (c.rowNo.has(x.predecessorId) ? formatMspPredecessor(x, c.rowNo.get(x.predecessorId)!, c.hpd) : "")).filter(Boolean).join(",") : ""), edit: "pred" },
  { key: "succ", label: "Successors", width: 100, text: (r, c) => (r.kind === "task" ? (c.succs.get(r.a.id) ?? []).map((x) => (c.rowNo.has(x.successorId) ? formatMspPredecessor({ ...x, predecessorId: x.successorId }, c.rowNo.get(x.successorId)!, c.hpd) : "")).filter(Boolean).join(",") : "") },
  { key: "res", label: "Resource Names", width: 150, text: (r, c) => (r.kind === "task" ? (c.resNames.get(r.a.id) ?? "") : ""), edit: "res" },
  { key: "pct", label: "% Comp.", width: 62, align: "right", text: (r) => `${Math.round(r.kind === "task" ? r.a.percentComplete : r.fig.pct)}%`, edit: "pct" },
  { key: "physPct", label: "Phys. % Comp.", width: 70, align: "right", text: (r) => (r.kind === "task" ? `${Math.round(r.a.physicalPercent ?? 0)}%` : "") },
  { key: "actualStart", label: "Act. Start", width: 96, text: (r) => mspDateText(r.fig.actualStart), edit: "actualStart" },
  { key: "actualFinish", label: "Act. Finish", width: 96, text: (r) => mspDateText(r.fig.actualFinish), edit: "actualFinish" },
  { key: "actualDur", label: "Act. Dur.", width: 72, text: (r, c) => (r.kind === "task" ? dur(Math.max(0, (r.a.originalDurationHours ?? 0) - (r.a.status === "not-started" ? r.a.originalDurationHours ?? 0 : r.a.remainingDurationHours ?? 0)), c) : dur((r.fig.durationH * r.fig.pct) / 100, c)) },
  { key: "remDur", label: "Rem. Dur.", width: 72, text: (r, c) => (r.kind === "task" ? dur(r.a.status === "complete" ? 0 : (r.a.remainingDurationHours ?? r.a.originalDurationHours), c) : dur((r.fig.durationH * (100 - r.fig.pct)) / 100, c)), edit: "remDuration" },
  { key: "lateStart", label: "Late Start", width: 96, text: (r) => (task(r) ? mspDateText(task(r)!.lateStart) : "") },
  { key: "lateFinish", label: "Late Finish", width: 96, text: (r) => (task(r) ? mspDateText(task(r)!.lateFinish) : "") },
  { key: "freeSlack", label: "Free Slack", width: 74, text: (r, c) => (task(r) ? dur(task(r)!.freeFloatHours ?? 0, c) : "") },
  { key: "totalSlack", label: "Total Slack", width: 74, text: (r, c) => (task(r) ? dur(task(r)!.totalFloatHours ?? 0, c) : "") },
  { key: "baselineStart", label: "Baseline Start", width: 96, text: (r) => mspDateText(r.fig.baselineStart) },
  { key: "baselineFinish", label: "Baseline Finish", width: 96, text: (r) => mspDateText(r.fig.baselineFinish) },
  { key: "startVar", label: "Start Var.", width: 72, text: (r, c) => daysVar(r.fig.start, r.fig.baselineStart, c) },
  { key: "finishVar", label: "Finish Var.", width: 72, text: (r, c) => daysVar(r.fig.finish, r.fig.baselineFinish, c) },
  { key: "cost", label: "Total Cost", width: 96, align: "right", text: (r, c) => money(r.fig.cost, c.cur) },
  { key: "baselineCost", label: "Baseline", width: 96, align: "right", text: (r, c) => money(r.fig.baselineCost, c.cur) },
  { key: "costVar", label: "Variance", width: 90, align: "right", text: (r, c) => money(r.fig.cost - r.fig.baselineCost, c.cur) },
  { key: "actualCost", label: "Actual", width: 90, align: "right", text: (r, c) => money(r.fig.actualCost, c.cur) },
  { key: "remainingCost", label: "Remaining", width: 90, align: "right", text: (r, c) => money(r.fig.remainingCost, c.cur) },
  { key: "work", label: "Work", width: 80, align: "right", text: (r) => hrs(r.fig.work) },
  { key: "baselineWork", label: "Baseline Work", width: 86, align: "right", text: (r) => hrs(r.fig.baselineWork) },
  { key: "workVar", label: "Work Variance", width: 86, align: "right", text: (r) => hrs(r.fig.work - r.fig.baselineWork) },
  { key: "actualWork", label: "Actual Work", width: 80, align: "right", text: (r) => hrs(r.fig.actualWork) },
  { key: "remainingWork", label: "Remaining Work", width: 90, align: "right", text: (r) => hrs(r.fig.remainingWork) },
  { key: "pctWork", label: "% W. Comp.", width: 70, align: "right", text: (r) => `${r.fig.work > 0 ? Math.round((r.fig.actualWork / r.fig.work) * 100) : 0}%` },
  { key: "deadline", label: "Deadline", width: 96, text: (r) => (task(r) ? mspDateText(task(r)!.deadline) : ""), edit: "deadline" },
  { key: "priority", label: "Priority", width: 56, align: "right", text: (r) => (task(r) ? String(task(r)!.priority ?? 500) : "500"), edit: "priority" },
  { key: "constraintType", label: "Constraint Type", width: 140, text: (r) => (task(r) ? (task(r)!.constraint ? CONSTRAINT_NAMES[task(r)!.constraint!.type] : "As Soon As Possible") : "") },
  { key: "constraintDate", label: "Constraint Date", width: 96, text: (r) => (task(r) ? mspDateText(task(r)!.constraint?.date) : "") },
  { key: "critical", label: "Critical", width: 56, text: (r) => (task(r) ? (task(r)!.critical ? "Yes" : "No") : "") },
  { key: "type", label: "Type", width: 96, text: (r) => (task(r) ? { "fixed-units": "Fixed Units", "fixed-duration": "Fixed Duration", "fixed-work": "Fixed Work" }[mspTaskType(task(r)!)] : "") },
  { key: "outline", label: "Outline Number", width: 70, text: (r, c) => (r.id ? (c.outline.get(r.id) ?? "") : r.kind === "project" ? "0" : "") },
  { key: "wbs", label: "WBS", width: 70, text: (r, c) => (r.id ? (c.outline.get(r.id) ?? "") : "") },
  { key: "code", label: "Activity ID", width: 90, text: (r) => (task(r)?.code ?? "") },
  { key: "calendar", label: "Task Calendar", width: 110, text: (r, c) => (task(r)?.calendarId ? (c.calName.get(task(r)!.calendarId!) ?? "") : task(r) ? "None" : "") },
  { key: "notes", label: "Notes", width: 180, text: (r) => (task(r)?.notes ?? "").replace(/\s+/g, " "), edit: "notes" },
  { key: "uid", label: "Unique ID", width: 64, align: "right", text: (r) => (task(r) ? String(task(r)!.mspUid ?? "") : "") },
  { key: "active", label: "Active", width: 50, text: (r) => (task(r) ? (task(r)!.inactive ? "No" : "Yes") : "") },
  { key: "bcws", label: "BCWS", width: 90, align: "right", text: (r, c) => money(r.fig.bcws, c.cur) },
  { key: "bcwp", label: "BCWP", width: 90, align: "right", text: (r, c) => money(r.fig.bcwp, c.cur) },
  { key: "acwp", label: "ACWP", width: 90, align: "right", text: (r, c) => money(r.fig.actualCost, c.cur) },
  { key: "sv", label: "SV", width: 86, align: "right", text: (r, c) => money(r.fig.bcwp - r.fig.bcws, c.cur) },
  { key: "cv", label: "CV", width: 86, align: "right", text: (r, c) => money(r.fig.bcwp - r.fig.actualCost, c.cur) },
  { key: "eac", label: "EAC", width: 96, align: "right", text: (r, c) => money(r.fig.bcwp > 0 ? (r.fig.baselineCost * r.fig.actualCost) / r.fig.bcwp : r.fig.cost, c.cur) },
  { key: "bac", label: "BAC", width: 96, align: "right", text: (r, c) => money(r.fig.baselineCost, c.cur) },
  { key: "vac", label: "VAC", width: 90, align: "right", text: (r, c) => money(r.fig.baselineCost - (r.fig.bcwp > 0 ? (r.fig.baselineCost * r.fig.actualCost) / r.fig.bcwp : r.fig.cost), c.cur) },
];
export const FIELD = new Map(FIELDS.map((f) => [f.key, f]));

export const TABLES: Record<MspTable, { label: string; cols: string[] }> = {
  entry: { label: "Entry", cols: ["id", "ind", "mode", "name", "duration", "start", "finish", "pred", "res"] },
  schedule: { label: "Schedule", cols: ["id", "name", "start", "finish", "lateStart", "lateFinish", "freeSlack", "totalSlack"] },
  tracking: { label: "Tracking", cols: ["id", "name", "actualStart", "actualFinish", "pct", "physPct", "actualDur", "remDur", "actualCost", "actualWork"] },
  cost: { label: "Cost", cols: ["id", "name", "cost", "baselineCost", "costVar", "actualCost", "remainingCost"] },
  variance: { label: "Variance", cols: ["id", "name", "start", "finish", "baselineStart", "baselineFinish", "startVar", "finishVar"] },
  work: { label: "Work", cols: ["id", "name", "work", "baselineWork", "workVar", "actualWork", "remainingWork", "pctWork"] },
  summary: { label: "Summary", cols: ["id", "name", "duration", "start", "finish", "pct", "cost", "work"] },
  earned: { label: "Earned Value", cols: ["id", "name", "bcws", "bcwp", "acwp", "sv", "cv", "eac", "bac", "vac"] },
};

export function sheetCtx(s: Schedule, fullRows: GanttRow[], cur: string): SheetCtx {
  const rowNo = new Map<string, number>();
  fullRows.forEach((r, i) => rowNo.set(r.id, i + 1));
  const preds = new Map<string, Relationship[]>();
  const succs = new Map<string, Relationship[]>();
  for (const r of s.relationships) {
    (preds.get(r.successorId) ?? preds.set(r.successorId, []).get(r.successorId)!).push(r);
    (succs.get(r.predecessorId) ?? succs.set(r.predecessorId, []).get(r.predecessorId)!).push(r);
  }
  const resName = new Map((s.resources ?? []).map((r) => [r.id, r]));
  const resNames = new Map<string, string>();
  for (const x of s.assignments ?? []) {
    const r = resName.get(x.resourceId);
    if (!r) continue;
    const label = x.units !== undefined && Math.abs(x.units - 1) > 1e-9 ? `${r.name}[${Math.round(x.units * 100)}%]` : r.name;
    resNames.set(x.activityId, resNames.has(x.activityId) ? `${resNames.get(x.activityId)},${label}` : label);
  }
  const cal = (s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0];
  return { s, hpd: cal?.hoursPerDay || 8, rowNo, outline: outlineNumbers(fullRows), preds, succs, resNames, cur: s.projectSettings?.currency ?? cur, calName: new Map((s.calendars ?? []).map((c) => [c.id, c.name])) };
}

function taskFigures(a: Activity, asg: Map<string, { cost: number; bc: number; ac: number; rc: number; work: number; bw: number; aw: number; rw: number }>, dd: number | null): RowFigures {
  const x = asg.get(a.id) ?? { cost: 0, bc: 0, ac: 0, rc: 0, work: 0, bw: 0, aw: 0, rw: 0 };
  // Planned share of the budget by the status date, on the baseline dates (current dates when there is no baseline).
  const bs = a.baselineStart ?? a.start;
  const bf = a.baselineFinish ?? a.finish;
  const planned = dd === null || bs === null || bf === null ? 0 : dd <= bs ? 0 : dd >= bf ? 1 : (dd - bs) / Math.max(1, bf - bs);
  return {
    bcws: x.bc * planned,
    bcwp: (x.bc * a.percentComplete) / 100,
    start: a.start,
    finish: a.finish,
    durationH: a.originalDurationHours ?? 0,
    pct: a.percentComplete,
    cost: x.cost,
    baselineCost: x.bc,
    actualCost: x.ac,
    remainingCost: x.rc,
    work: x.work,
    baselineWork: x.bw,
    actualWork: x.aw,
    remainingWork: x.rw,
    baselineStart: a.baselineStart,
    baselineFinish: a.baselineFinish,
    actualStart: a.actualStart,
    actualFinish: a.actualFinish,
  };
}

function rollup(list: RowFigures[], hpd: number): RowFigures {
  const min = (k: keyof RowFigures) => {
    const v = list.map((f) => f[k] as number | null).filter((x): x is number => x !== null);
    return v.length ? Math.min(...v) : null;
  };
  const max = (k: keyof RowFigures) => {
    const v = list.map((f) => f[k] as number | null).filter((x): x is number => x !== null);
    return v.length ? Math.max(...v) : null;
  };
  const sum = (k: keyof RowFigures) => list.reduce((t, f) => t + ((f[k] as number) || 0), 0);
  const start = min("start");
  const finish = max("finish");
  const od = sum("durationH");
  const done = list.reduce((t, f) => t + (f.durationH * f.pct) / 100, 0);
  const allDone = list.length > 0 && list.every((f) => f.actualFinish !== null);
  return {
    start,
    finish,
    // Summary duration is its working span, roughly the calendar span less weekends.
    durationH: start !== null && finish !== null ? Math.round(((finish - start) / DAY) * (5 / 7)) * hpd : 0,
    pct: od > 0 ? (done / od) * 100 : 0,
    cost: sum("cost"),
    baselineCost: sum("baselineCost"),
    actualCost: sum("actualCost"),
    remainingCost: sum("remainingCost"),
    work: sum("work"),
    baselineWork: sum("baselineWork"),
    actualWork: sum("actualWork"),
    remainingWork: sum("remainingWork"),
    baselineStart: min("baselineStart"),
    baselineFinish: max("baselineFinish"),
    actualStart: min("actualStart"),
    actualFinish: allDone ? max("actualFinish") : null,
    bcws: sum("bcws"),
    bcwp: sum("bcwp"),
  };
}

export function passesMspFilter(a: Activity, f: MspFilter, dd: number | null, range: [number, number] | null): boolean {
  switch (f) {
    case "all":
      return true;
    case "active":
      return !a.inactive;
    case "completed":
      return a.status === "complete";
    case "incomplete":
      return a.status !== "complete";
    case "critical":
      return a.critical;
    case "late":
      return dd !== null && a.status !== "complete" && ((a.finish !== null && a.finish < dd) || (a.start !== null && a.start < dd && a.status === "not-started"));
    case "milestones":
      return a.type === "milestone" || a.type === "finish-milestone";
    case "summary":
      return false;
    case "manual":
      return a.taskMode === "manual";
    case "deadline":
      return a.deadline != null;
    case "slipping":
      return a.baselineFinish !== null && a.finish !== null && a.finish > a.baselineFinish + DAY / 2 && a.status !== "complete";
    case "date-range":
      return !range || (a.start !== null && a.finish !== null && a.start <= range[1] && a.finish >= range[0]);
  }
}

export const FILTER_NAMES: [MspFilter, string][] = [
  ["all", "[No Filter]"],
  ["active", "Active Tasks"],
  ["completed", "Completed Tasks"],
  ["critical", "Critical"],
  ["date-range", "Date Range…"],
  ["incomplete", "Incomplete Tasks"],
  ["late", "Late Tasks"],
  ["manual", "Manually Scheduled Tasks"],
  ["milestones", "Milestones"],
  ["slipping", "Slipping Tasks"],
  ["summary", "Summary Tasks"],
  ["deadline", "Tasks with Deadlines"],
];
export const GROUP_NAMES: [MspGroup, string][] = [
  ["none", "[No Group]"],
  ["task-mode", "Auto Scheduled v.s. Manually Scheduled"],
  ["critical", "Critical"],
  ["duration", "Duration"],
  ["milestones", "Milestones"],
  ["priority", "Priority"],
  ["resource", "Resource"],
  ["status", "Status"],
];
export const SORT_NAMES: [MspSort, string][] = [
  ["id", "by ID"],
  ["start", "by Start Date"],
  ["finish", "by Finish Date"],
  ["priority", "by Priority"],
  ["duration", "by Duration"],
  ["name", "by Task Name"],
  ["cost", "by Cost"],
];

export interface RowOptions {
  collapsed: Set<string>;
  filter: MspFilter;
  dateRange: [number, number] | null;
  group: MspGroup;
  sort: { by: MspSort; desc: boolean };
  projectSummary: boolean;
  summaryTasks: boolean;
  custom?: CustomFilter | null;
}

const DATE_RE = /^[A-Za-z]{3} (\d{2})\/(\d{2})\/(\d{2})$/;
/** A cell's value for comparing: dates and numbers as numbers, the rest as lower-case text. */
function comparable(text: string): number | string {
  const d = DATE_RE.exec(text);
  if (d) return Date.UTC(2000 + +d[3], +d[2] - 1, +d[1]);
  const n = Number(text.replace(/[^\d.\-]/g, ""));
  return /\d/.test(text) && /^[^A-Za-z]*\d[^A-Za-z]*(days?|hrs?|%)?\??$/.test(text.trim()) && Number.isFinite(n) ? n : text.toLowerCase();
}
const valueOf = (v: string): number | string => {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(v.trim());
  if (dmy) return Date.UTC(dmy[3].length === 2 ? 2000 + +dmy[3] : +dmy[3], +dmy[2] - 1, +dmy[1]);
  return comparable(v);
};

/** Whether a task row passes a custom filter. Rows are evaluated left to right, "and" before "or" as MS Project does. */
export function passesCustom(r: SheetRow, f: CustomFilter, c: SheetCtx): boolean {
  if (!f.rows.length) return true;
  const test = (row: CustomFilter["rows"][number]) => {
    const field = fieldFor(row.field);
    if (!field) return true;
    const raw = field.text(r, c);
    const a = comparable(raw);
    const b = valueOf(row.value);
    switch (row.test) {
      case "contains":
        return raw.toLowerCase().includes(row.value.toLowerCase());
      case "not-contains":
        return !raw.toLowerCase().includes(row.value.toLowerCase());
      case "eq":
        return a === b || raw.toLowerCase() === row.value.toLowerCase();
      case "ne":
        return !(a === b || raw.toLowerCase() === row.value.toLowerCase());
      case "within": {
        const b2 = valueOf(row.value2 ?? "");
        return a >= b && a <= b2;
      }
      default:
        if (typeof a !== typeof b) return false;
        return row.test === "gt" ? a > b : row.test === "ge" ? a >= b : row.test === "lt" ? a < b : a <= b;
    }
  };
  // OR splits the rows into groups; each group is an AND.
  let any = false;
  let cur = true;
  f.rows.forEach((row, i) => {
    if (i > 0 && row.join === "or") {
      any ||= cur;
      cur = true;
    }
    cur &&= test(row);
  });
  return any || cur;
}

/** Rows of the sheet after filter, group and sort. fullRows is the outline (for IDs). */
export function sheetRows(s: Schedule, fullRows: GanttRow[], c: SheetCtx, o: RowOptions): SheetRow[] {
  const asg = new Map<string, { cost: number; bc: number; ac: number; rc: number; work: number; bw: number; aw: number; rw: number }>();
  const labour = new Set((s.resources ?? []).filter((r) => r.type !== "material").map((r) => r.id));
  for (const x of s.assignments ?? []) {
    const cur = asg.get(x.activityId) ?? { cost: 0, bc: 0, ac: 0, rc: 0, work: 0, bw: 0, aw: 0, rw: 0 };
    cur.cost += x.actualCost + x.remainingCost;
    cur.bc += x.budgetCost;
    cur.ac += x.actualCost;
    cur.rc += x.remainingCost;
    if (labour.has(x.resourceId)) {
      cur.work += x.actualQty + x.remainingQty;
      cur.bw += x.budgetQty;
      cur.aw += x.actualQty;
      cur.rw += x.remainingQty;
    }
    asg.set(x.activityId, cur);
  }
  const dd = s.dataDate;
  const shown = o.custom ? (a: Activity) => passesCustom({ kind: "task", key: a.id, depth: 0, id: a.id, fig: figOf.get(a.id)!, a }, o.custom!, c) : (a: Activity) => passesMspFilter(a, o.filter, dd, o.dateRange);
  const figOf = new Map<string, RowFigures>();
  for (const r of fullRows) if (r.kind === "activity") figOf.set(r.id, taskFigures(r.activity, asg, dd));
  const sortKey = (a: Activity): number | string => {
    const f = figOf.get(a.id)!;
    switch (o.sort.by) {
      case "start":
        return a.start ?? 0;
      case "finish":
        return a.finish ?? 0;
      case "priority":
        return a.priority ?? 500;
      case "duration":
        return a.originalDurationHours ?? 0;
      case "name":
        return a.name.toLowerCase();
      case "cost":
        return f.cost;
      default:
        return c.rowNo.get(a.id) ?? 0;
    }
  };
  const cmp = (x: Activity, y: Activity) => {
    const p = sortKey(x);
    const q = sortKey(y);
    const d = typeof p === "string" ? p.localeCompare(q as string) : (p as number) - (q as number);
    return (o.sort.desc ? -d : d) || (c.rowNo.get(x.id) ?? 0) - (c.rowNo.get(y.id) ?? 0);
  };
  const out: SheetRow[] = [];
  const allTasks = fullRows.filter((r): r is Extract<GanttRow, { kind: "activity" }> => r.kind === "activity").map((r) => r.activity);

  if (o.group !== "none" || !o.summaryTasks || o.filter === "summary") {
    if (o.filter === "summary") {
      // Summary Tasks filter: the outline of summaries only.
      for (const r of fullRows) if (r.kind === "wbs") out.push({ kind: "wbs", key: r.id, depth: r.depth, id: r.id, fig: figFromWbs(r, fullRows, figOf, c.hpd), name: r.label.replace(/^\S+\s/, ""), collapsed: false });
      return withProject(out, allTasks, figOf, c, o);
    }
    const tasks = allTasks.filter(shown).sort(cmp);
    if (o.group === "none") {
      for (const a of tasks) out.push({ kind: "task", key: a.id, depth: 0, id: a.id, fig: figOf.get(a.id)!, a });
      return withProject(out, allTasks, figOf, c, o);
    }
    const groups = new Map<string, Activity[]>();
    for (const a of tasks) for (const g of groupKeys(a, o.group, c)) (groups.get(g) ?? groups.set(g, []).get(g)!).push(a);
    for (const [g, list] of [...groups].sort((p, q) => p[0].localeCompare(q[0], undefined, { numeric: true }))) {
      out.push({ kind: "group", key: `g:${g}`, depth: 0, id: null, fig: rollup(list.map((a) => figOf.get(a.id)!), c.hpd), name: g.replace(/^\d+\s/, "") });
      for (const a of list) out.push({ kind: "task", key: `${g}:${a.id}`, depth: 1, id: a.id, fig: figOf.get(a.id)!, a });
    }
    return withProject(out, allTasks, figOf, c, o);
  }

  // Outline view: keep summaries that have something shown below them; sort tasks within each summary.
  const keepWbs = new Set<string>();
  if ((o.filter !== "all" || !!o.custom)) {
    const parent = new Map(s.wbs.map((w) => [w.id, w.parentId]));
    for (const a of allTasks) if (shown(a)) for (let w = a.wbsId, g = 0; w && g < 64; w = parent.get(w) ?? null, g++) keepWbs.add(w);
  }
  let skipDepth = Infinity;
  let run: Activity[] = [];
  let runDepth = 0;
  const flush = () => {
    if (o.sort.by !== "id" || o.sort.desc) run.sort(cmp);
    for (const a of run) out.push({ kind: "task", key: a.id, depth: runDepth, id: a.id, fig: figOf.get(a.id)!, a });
    run = [];
  };
  for (const r of fullRows) {
    if (r.depth > skipDepth) continue;
    skipDepth = Infinity;
    if (r.kind === "wbs") {
      flush();
      if ((o.filter !== "all" || !!o.custom) && !keepWbs.has(r.id)) {
        skipDepth = r.depth;
        continue;
      }
      const collapsed = o.collapsed.has(r.id);
      out.push({ kind: "wbs", key: r.id, depth: r.depth, id: r.id, fig: figFromWbs(r, fullRows, figOf, c.hpd), name: r.label.replace(/^\S+\s/, ""), collapsed });
      if (collapsed) skipDepth = r.depth;
    } else if (shown(r.activity)) {
      if (run.length && runDepth !== r.depth) flush();
      runDepth = r.depth;
      run.push(r.activity);
    }
  }
  flush();
  return withProject(out, allTasks, figOf, c, o);
}

const figCache = new WeakMap<GanttRow[], Map<string, RowFigures>>();
function figFromWbs(r: Extract<GanttRow, { kind: "wbs" }>, fullRows: GanttRow[], figOf: Map<string, RowFigures>, hpd: number): RowFigures {
  let cache = figCache.get(fullRows);
  if (!cache) {
    cache = new Map();
    // One pass: a stack of open summaries collects the task figures below them.
    const stack: { id: string; depth: number; list: RowFigures[] }[] = [];
    const close = (depth: number) => {
      while (stack.length && stack[stack.length - 1].depth >= depth) {
        const top = stack.pop()!;
        cache!.set(top.id, rollup(top.list, hpd));
      }
    };
    for (const x of fullRows) {
      close(x.depth);
      if (x.kind === "wbs") stack.push({ id: x.id, depth: x.depth, list: [] });
      else for (const st of stack) st.list.push(figOf.get(x.id)!);
    }
    close(-1);
    figCache.set(fullRows, cache);
  }
  return cache.get(r.id) ?? rollup([], hpd);
}

function withProject(out: SheetRow[], tasks: Activity[], figOf: Map<string, RowFigures>, c: SheetCtx, o: RowOptions): SheetRow[] {
  if (!o.projectSummary) return out;
  return [{ kind: "project", key: "project", depth: 0, id: null, fig: rollup(tasks.map((a) => figOf.get(a.id)!), c.hpd), name: c.s.projectName }, ...out.map((r) => ({ ...r, depth: r.depth + 1 }) as SheetRow)];
}

function groupKeys(a: Activity, g: MspGroup, c: SheetCtx): string[] {
  switch (g) {
    case "critical":
      return [a.critical ? "1 Critical: Yes" : "2 Critical: No"];
    case "milestones":
      return [a.type === "milestone" || a.type === "finish-milestone" ? "1 Milestone: Yes" : "2 Milestone: No"];
    case "status":
      return [a.status === "complete" ? "3 Complete" : a.status === "in-progress" ? "2 On Schedule / In Progress" : "1 Future Task"];
    case "priority":
      return [`${String(1000 - (a.priority ?? 500)).padStart(4, "0")} Priority: ${a.priority ?? 500}`];
    case "duration": {
      const d = Math.round((a.originalDurationHours ?? 0) / c.hpd);
      return [`${String(d).padStart(5, "0")} Duration: ${d} day${d === 1 ? "" : "s"}`];
    }
    case "task-mode":
      return [a.taskMode === "manual" ? "2 Manually Scheduled" : "1 Auto Scheduled"];
    case "resource": {
      const n = c.resNames.get(a.id);
      return n ? n.split(",").map((x) => `1 ${x.replace(/\[.*\]$/, "")}`) : ["2 No Resource Assigned"];
    }
    default:
      return [""];
  }
}

/** Indicator glyphs for a task: done, missed deadline, notes, constraint, manual, inactive. */
export function indicators(a: Activity): { glyph: string; title: string; cls?: string }[] {
  const out: { glyph: string; title: string; cls?: string }[] = [];
  if (a.status === "complete") out.push({ glyph: "✔", title: `This task was completed on ${mspDateText(a.actualFinish)}.`, cls: "ok" });
  if (missedDeadline(a)) out.push({ glyph: "◆", title: `This task finishes on ${mspDateText(a.finish)} which is later than its Deadline on ${mspDateText(a.deadline)}.`, cls: "bad" });
  else if (a.constraint && a.constraint.type !== "as-late-as-possible") out.push({ glyph: "▦", title: `This task has a '${CONSTRAINT_NAMES[a.constraint.type]}' constraint on ${mspDateText(a.constraint.date)}.`, cls: a.totalFloatHours !== null && a.totalFloatHours < 0 ? "bad" : "" });
  if (a.notes) out.push({ glyph: "🗒", title: a.notes.slice(0, 200) });
  if (a.inactive) out.push({ glyph: "⊘", title: "This task is inactive." });
  return out;
}

export { buildGanttRows };
