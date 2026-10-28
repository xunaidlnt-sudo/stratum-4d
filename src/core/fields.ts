// The activity fields P6 shows as columns, filters on, groups and sorts by,
// and changes with Global Change. One registry drives all of them so a field
// behaves the same everywhere.

import { compileFormula, indicatorFromRule, type FieldLookup } from "./udfFormula";
import { obsPath, wbsObs } from "./budget";
import { projectCodeOf } from "./multiproject";
import { workHoursBetween } from "./calendar";
import { monthShort } from "./dates";
import type { Activity, Calendar, Schedule } from "./types";

const LEVEL_PRIORITY_LABELS = ["Top", "High", "Normal", "Low", "Lowest"];

export type FieldType = "text" | "number" | "duration" | "date" | "percent" | "bool" | "enum";

export interface FieldCtx {
  s: Schedule;
  hpd: number;
  cal: (a: Activity) => Calendar | undefined;
  wbs: Map<string, { code: string; name: string; parentId: string | null }>;
  wbsPath: (id: string | null) => string;
  calName: Map<string, string>;
  preds: Map<string, string[]>;
  succs: Map<string, string[]>;
  resNames: Map<string, string[]>;
  cost: Map<string, { budget: number; actual: number; remaining: number; budgetUnits: number; actualUnits: number; remainingUnits: number }>;
  /** Dates of the 2nd and 3rd comparison baselines by Activity ID. */
  bl2: Record<string, [number | null, number | null]> | null;
  bl3: Record<string, [number | null, number | null]> | null;
}

export interface FieldDef {
  id: string;
  label: string;
  group: string;
  type: FieldType;
  /** Default column width at 12 px text. */
  width: number;
  align?: "right" | "center";
  /** Raw value for filtering and sorting (dates as ms, durations as days, percents 0–100). */
  get: (a: Activity, c: FieldCtx) => string | number | boolean | null;
  /** Display text; defaults to a formatted `get`. */
  text?: (a: Activity, c: FieldCtx) => string;
  /** Write a value typed by the user (days for durations, ms for dates). Omitted = read-only. */
  set?: (a: Activity, v: string | number | boolean | null, c: FieldCtx) => Partial<Activity> | null;
  options?: string[];
}

const DAY = 86_400_000;
export type DateFormat = "dd-Mmm-yy" | "dd-Mmm-yyyy" | "dd/mm/yyyy" | "mm/dd/yyyy" | "yyyy-mm-dd";

/** P6 User Preferences that change how values read: date format, time units and decimals. */
export const displayPrefs: { dateFormat: DateFormat; showTime: boolean; durationUnit: "d" | "h"; decimals: number; currency: string; currencyDecimals: number } = {
  dateFormat: "dd-Mmm-yy",
  showTime: false,
  durationUnit: "d",
  decimals: 1,
  currency: "",
  currencyDecimals: 0,
};

/** A cost in the user's currency (P6 User Preferences › Currency). */
export function fmtMoney(v: number): string {
  const n = v.toLocaleString(undefined, { minimumFractionDigits: displayPrefs.currencyDecimals, maximumFractionDigits: displayPrefs.currencyDecimals });
  return displayPrefs.currency ? `${displayPrefs.currency} ${n}` : n;
}
export function setDisplayPrefs(p: Partial<typeof displayPrefs>) {
  Object.assign(displayPrefs, p);
}

const pad = (n: number) => String(n).padStart(2, "0");
export const fmtDay = (t: number | null | undefined) => {
  if (t === null || t === undefined || !Number.isFinite(t)) return "";
  const d = new Date(t);
  const dd = pad(d.getUTCDate());
  const mm = pad(d.getUTCMonth() + 1);
  const y = String(d.getUTCFullYear());
  const date =
    displayPrefs.dateFormat === "dd-Mmm-yyyy"
      ? `${dd}-${monthShort(d)}-${y}`
      : displayPrefs.dateFormat === "dd/mm/yyyy"
        ? `${dd}/${mm}/${y}`
        : displayPrefs.dateFormat === "mm/dd/yyyy"
          ? `${mm}/${dd}/${y}`
          : displayPrefs.dateFormat === "yyyy-mm-dd"
            ? `${y}-${mm}-${dd}`
            : `${dd}-${monthShort(d)}-${y.slice(2)}`;
  return displayPrefs.showTime ? `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
};
const r1 = (v: number) => {
  const k = 10 ** displayPrefs.decimals;
  return Math.round(v * k) / k;
};
/** Working hours shown in the preferred unit (days or hours). */
const toDays = (h: number | null | undefined, hpd: number) => (h === null || h === undefined ? null : r1(displayPrefs.durationUnit === "h" ? h : h / hpd));
/** A typed duration back to working hours. */
const fromUnit = (v: number, hpd: number) => (displayPrefs.durationUnit === "h" ? v : v * hpd);
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

const TYPE_LABEL: Record<Activity["type"], string> = {
  task: "Task Dependent",
  "resource-dependent": "Resource Dependent",
  loe: "Level of Effort",
  milestone: "Start Milestone",
  "finish-milestone": "Finish Milestone",
  "wbs-summary": "WBS Summary",
};
const STATUS_LABEL: Record<Activity["status"], string> = { "not-started": "Not Started", "in-progress": "In Progress", complete: "Completed" };
const CONSTRAINT_LABEL: Record<string, string> = {
  "start-on-or-after": "Start On or After",
  "start-on-or-before": "Start On or Before",
  "finish-on-or-after": "Finish On or After",
  "finish-on-or-before": "Finish On or Before",
  "start-on": "Start On",
  "finish-on": "Finish On",
  "mandatory-start": "Mandatory Start",
  "mandatory-finish": "Mandatory Finish",
  "as-late-as-possible": "As Late As Possible",
};

export function fieldCtx(s: Schedule): FieldCtx {
  const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
  const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0];
  const hpd = def?.hoursPerDay ?? 8;
  const wbs = new Map(s.wbs.map((w) => [w.id, { code: w.code, name: w.name, parentId: w.parentId }]));
  const pathCache = new Map<string, string>();
  const wbsPath = (id: string | null): string => {
    if (!id) return "";
    const hit = pathCache.get(id);
    if (hit !== undefined) return hit;
    const w = wbs.get(id);
    const p = w ? (w.parentId ? `${wbsPath(w.parentId)}.${w.code}` : w.code) : "";
    pathCache.set(id, p);
    return p;
  };
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const r of s.relationships) {
    const p = byId.get(r.predecessorId);
    const q = byId.get(r.successorId);
    if (!p || !q) continue;
    const lag = r.lagHours ? ` ${r.lagHours > 0 ? "+" : ""}${toDays(r.lagHours, hpd)}${displayPrefs.durationUnit}` : "";
    (preds.get(q.id) ?? preds.set(q.id, []).get(q.id)!).push(`${p.code}${r.type === "FS" && !lag ? "" : `: ${r.type}${lag}`}`);
    (succs.get(p.id) ?? succs.set(p.id, []).get(p.id)!).push(`${q.code}${r.type === "FS" && !lag ? "" : `: ${r.type}${lag}`}`);
  }
  const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
  const resNames = new Map<string, string[]>();
  const cost = new Map<string, { budget: number; actual: number; remaining: number; budgetUnits: number; actualUnits: number; remainingUnits: number }>();
  for (const x of s.assignments ?? []) {
    const r = res.get(x.resourceId);
    if (r) (resNames.get(x.activityId) ?? resNames.set(x.activityId, []).get(x.activityId)!).push(r.code || r.name);
    const c = cost.get(x.activityId) ?? { budget: 0, actual: 0, remaining: 0, budgetUnits: 0, actualUnits: 0, remainingUnits: 0 };
    c.budget += x.budgetCost;
    c.actual += x.actualCost;
    c.remaining += x.remainingCost;
    if (r?.type === "labor") {
      c.budgetUnits += x.budgetQty;
      c.actualUnits += x.actualQty;
      c.remainingUnits += x.remainingQty;
    }
    cost.set(x.activityId, c);
  }
  // Expenses (P6 Expenses window) add to the activity's costs.
  const money = (v: string | undefined) => {
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  for (const x of s.registers?.expenses ?? []) {
    if (!x.activityId) continue;
    const c = cost.get(x.activityId) ?? { budget: 0, actual: 0, remaining: 0, budgetUnits: 0, actualUnits: 0, remainingUnits: 0 };
    c.budget += money(x.values["Budgeted Cost"]);
    c.actual += money(x.values["Actual Cost"]);
    c.remaining += money(x.values["Remaining Cost"]);
    cost.set(x.activityId, c);
  }
  const blDates = (id: string | null | undefined) => (id ? s.baselines?.find((b) => b.id === id)?.dates ?? null : null);
  return {
    s,
    hpd,
    bl2: blDates(s.compareBaselines?.bl2),
    bl3: blDates(s.compareBaselines?.bl3),
    cal: (a) => (a.calendarId && cals.get(a.calendarId)) || def,
    wbs,
    wbsPath,
    calName: new Map((s.calendars ?? []).map((c) => [c.id, c.name])),
    preds,
    succs,
    resNames,
    cost,
  };
}

const daysField = (id: string, label: string, width: number, get: (a: Activity) => number | null, set?: (a: Activity, h: number | null) => Partial<Activity> | null): FieldDef => ({
  id,
  label,
  group: "Durations",
  type: "duration",
  width,
  align: "right",
  get: (a, c) => toDays(get(a), c.hpd),
  set: set ? (a, v, c) => set(a, num(v) === null ? null : fromUnit(Math.max(0, Number(v)), c.hpd)) : undefined,
});

const dateField = (id: string, label: string, get: (a: Activity) => number | null, set?: (a: Activity, t: number | null) => Partial<Activity> | null, actualMark?: (a: Activity) => boolean): FieldDef => ({
  id,
  label,
  group: "Dates",
  type: "date",
  width: 84,
  get: (a) => get(a),
  text: (a) => {
    const t = get(a);
    return t === null ? "" : `${fmtDay(t)}${actualMark?.(a) ? " A" : ""}`;
  },
  set: set ? (a, v) => set(a, v === null || v === "" ? null : Number(v)) : undefined,
});

const costOf = (k: "budget" | "actual" | "remaining" | "budgetUnits" | "actualUnits" | "remainingUnits") => (a: Activity, c: FieldCtx) => {
  const v = c.cost.get(a.id)?.[k];
  return v === undefined ? null : Math.round(v * 100) / 100;
};

/** Built-in fields. Activity codes and user fields are added per schedule by `fieldsFor`. */
export const BASE_FIELDS: FieldDef[] = [
  { id: "code", label: "Activity ID", group: "General", type: "text", width: 96, get: (a) => a.code, set: (_a, v) => (String(v ?? "").trim() ? { code: String(v).trim() } : null) },
  { id: "name", label: "Activity Name", group: "General", type: "text", width: 230, get: (a) => a.name, set: (_a, v) => ({ name: String(v ?? "") }) },
  { id: "wbs", label: "WBS", group: "General", type: "text", width: 90, get: (a, c) => c.wbsPath(a.wbsId) },
  { id: "project", label: "Project ID", group: "General", type: "text", width: 90, get: (a, c) => projectCodeOf(c.s, a) },
  { id: "obs", label: "Responsible Manager", group: "General", type: "text", width: 140, get: (a, c) => obsPath(c.s, wbsObs(c.s, a.wbsId)).split(" / ").pop() ?? "" },
  { id: "wbsName", label: "WBS Name", group: "General", type: "text", width: 150, get: (a, c) => (a.wbsId ? c.wbs.get(a.wbsId)?.name ?? "" : "") },
  {
    id: "type",
    label: "Activity Type",
    group: "General",
    type: "enum",
    width: 110,
    options: Object.values(TYPE_LABEL),
    get: (a) => TYPE_LABEL[a.type],
    set: (_a, v) => {
      const k = (Object.keys(TYPE_LABEL) as Activity["type"][]).find((t) => TYPE_LABEL[t] === v);
      return k ? { type: k } : null;
    },
  },
  {
    id: "levelPriority",
    label: "Activity Leveling Priority",
    group: "General",
    type: "enum",
    width: 90,
    options: LEVEL_PRIORITY_LABELS,
    get: (a) => LEVEL_PRIORITY_LABELS[(a.levelingPriority ?? 3) - 1],
    set: (_a, v) => {
      const i = LEVEL_PRIORITY_LABELS.indexOf(String(v));
      return i < 0 ? null : { levelingPriority: i === 2 ? undefined : ((i + 1) as Activity["levelingPriority"]) };
    },
  },
  {
    id: "status",
    label: "Activity Status",
    group: "Status",
    type: "enum",
    width: 92,
    options: Object.values(STATUS_LABEL),
    get: (a) => STATUS_LABEL[a.status],
  },
  { id: "calendar", label: "Calendar", group: "General", type: "text", width: 120, get: (a, c) => (a.calendarId ? c.calName.get(a.calendarId) ?? "" : "Project default") },
  daysField("od", "Original Duration", 64, (a) => a.originalDurationHours, (a, h) => ({ originalDurationHours: h, ...(a.status === "not-started" ? { remainingDurationHours: h } : {}) })),
  daysField("rd", "Remaining Duration", 74, (a) => a.remainingDurationHours, (a, h) => (a.status === "complete" ? null : { remainingDurationHours: h })),
  {
    id: "ad",
    label: "Actual Duration",
    group: "Durations",
    type: "duration",
    width: 62,
    align: "right",
    get: (a, c) => {
      if (a.actualStart === null) return 0;
      const cal = c.cal(a);
      const end = a.actualFinish ?? c.s.dataDate ?? a.actualStart;
      return cal ? toDays(workHoursBetween(cal, a.actualStart, Math.max(a.actualStart, end)), c.hpd) : null;
    },
  },
  {
    id: "acd",
    label: "At Completion Duration",
    group: "Durations",
    type: "duration",
    width: 74,
    align: "right",
    get: (a, c) => {
      const cal = c.cal(a);
      if (!cal || a.start === null || a.finish === null) return toDays(a.originalDurationHours, c.hpd);
      return toDays(workHoursBetween(cal, a.start, a.finish), c.hpd);
    },
  },
  {
    id: "pct",
    label: "Schedule % Complete",
    group: "Status",
    type: "percent",
    width: 66,
    align: "right",
    get: (a) => Math.round(a.percentComplete * 10) / 10,
    text: (a) => `${Math.round(a.percentComplete)}%`,
    set: (a, v) => {
      const p = Math.min(100, Math.max(0, Number(v)));
      if (!Number.isFinite(p)) return null;
      if (p >= 100) return { percentComplete: 100, status: "complete", remainingDurationHours: 0, actualStart: a.actualStart ?? a.start, actualFinish: a.actualFinish ?? a.finish };
      if (p > 0) return { percentComplete: p, status: "in-progress", actualStart: a.actualStart ?? a.start, actualFinish: null };
      return { percentComplete: 0 };
    },
  },
  {
    id: "durPct",
    label: "Duration % Complete",
    group: "Status",
    type: "percent",
    width: 66,
    align: "right",
    get: (a) => {
      const od = a.originalDurationHours ?? 0;
      if (a.status === "complete") return 100;
      if (!od) return 0;
      return Math.round(Math.max(0, Math.min(100, ((od - (a.remainingDurationHours ?? od)) / od) * 100)) * 10) / 10;
    },
    text: (a) => {
      const od = a.originalDurationHours ?? 0;
      if (a.status === "complete") return "100%";
      return od ? `${Math.round(Math.max(0, Math.min(100, ((od - (a.remainingDurationHours ?? od)) / od) * 100)))}%` : "0%";
    },
  },
  dateField("start", "Start", (a) => a.start, (a, t) => (a.status === "not-started" ? { start: t } : { actualStart: t, start: t }), (a) => a.actualStart !== null && a.status !== "not-started"),
  dateField("finish", "Finish", (a) => a.finish, (a, t) => (a.status === "complete" ? { actualFinish: t, finish: t } : null), (a) => a.status === "complete"),
  dateField("actualStart", "Actual Start", (a) => a.actualStart, (a, t) => (t === null ? { actualStart: null, status: "not-started", percentComplete: 0 } : { actualStart: t, status: a.status === "not-started" ? "in-progress" : a.status })),
  dateField("actualFinish", "Actual Finish", (a) => a.actualFinish, (a, t) =>
    t === null ? { actualFinish: null, status: a.actualStart !== null ? "in-progress" : "not-started" } : { actualFinish: t, actualStart: a.actualStart ?? a.start, status: "complete", percentComplete: 100, remainingDurationHours: 0 },
  ),
  dateField("expectedFinish", "Expected Finish", (a) => a.expectedFinish ?? null, (_a, t) => ({ expectedFinish: t })),
  dateField("suspendDate", "Suspend Date", (a) => a.suspendDate ?? null, (a, t) => (a.status === "in-progress" || t === null ? { suspendDate: t } : null)),
  dateField("resumeDate", "Resume Date", (a) => a.resumeDate ?? null, (a, t) => (a.suspendDate != null || t === null ? { resumeDate: t } : null)),
  dateField("earlyStart", "Early Start", (a) => (a.status === "complete" ? null : a.start)),
  dateField("earlyFinish", "Early Finish", (a) => (a.status === "complete" ? null : a.finish)),
  dateField("lateStart", "Late Start", (a) => a.lateStart ?? null),
  dateField("lateFinish", "Late Finish", (a) => a.lateFinish ?? null),
  dateField("blStart", "BL Project Start", (a) => a.baselineStart),
  dateField("blFinish", "BL Project Finish", (a) => a.baselineFinish),
  { id: "bl2Start", label: "BL2 Start", group: "Dates", type: "date", width: 84, get: (a, c) => c.bl2?.[a.code]?.[0] ?? null },
  { id: "bl2Finish", label: "BL2 Finish", group: "Dates", type: "date", width: 84, get: (a, c) => c.bl2?.[a.code]?.[1] ?? null },
  { id: "bl3Start", label: "BL3 Start", group: "Dates", type: "date", width: 84, get: (a, c) => c.bl3?.[a.code]?.[0] ?? null },
  { id: "bl3Finish", label: "BL3 Finish", group: "Dates", type: "date", width: 84, get: (a, c) => c.bl3?.[a.code]?.[1] ?? null },
  {
    id: "startVar",
    label: "Variance - BL Project Start Date",
    group: "Dates",
    type: "duration",
    width: 78,
    align: "right",
    get: (a) => (a.start === null || a.baselineStart === null ? null : r1((a.baselineStart - a.start) / DAY)),
  },
  {
    id: "finishVar",
    label: "Variance - BL Project Finish Date",
    group: "Dates",
    type: "duration",
    width: 78,
    align: "right",
    get: (a) => (a.finish === null || a.baselineFinish === null ? null : r1((a.baselineFinish - a.finish) / DAY)),
  },
  {
    id: "tf",
    label: "Total Float",
    group: "Float",
    type: "duration",
    width: 52,
    align: "right",
    get: (a, c) => toDays(a.totalFloatHours, c.hpd),
  },
  { id: "ff", label: "Free Float", group: "Float", type: "duration", width: 52, align: "right", get: (a, c) => toDays(a.freeFloatHours, c.hpd) },
  { id: "critical", label: "Critical", group: "Float", type: "bool", width: 56, align: "center", get: (a) => a.critical, text: (a) => (a.critical ? "Yes" : "") },
  { id: "longestPath", label: "Longest Path", group: "Float", type: "bool", width: 60, align: "center", get: (a) => !!a.longestPath, text: (a) => (a.longestPath ? "Yes" : "") },
  { id: "floatPath", label: "Float Path", group: "Float", type: "number", width: 50, align: "right", get: (a) => a.floatPath ?? null },
  { id: "floatPathOrder", label: "Float Path Order", group: "Float", type: "number", width: 60, align: "right", get: (a) => a.floatPathOrder ?? null },
  {
    id: "constraint",
    label: "Primary Constraint",
    group: "Dates",
    type: "enum",
    width: 120,
    options: ["", ...Object.values(CONSTRAINT_LABEL)],
    get: (a) => (a.constraint ? CONSTRAINT_LABEL[a.constraint.type] ?? a.constraint.type : ""),
    set: (a, v) => {
      if (!v) return { constraint: null };
      const k = Object.keys(CONSTRAINT_LABEL).find((x) => CONSTRAINT_LABEL[x] === v);
      return k ? { constraint: { type: k as NonNullable<Activity["constraint"]>["type"], date: a.constraint?.date ?? a.start } } : null;
    },
  },
  dateField("constraintDate", "Primary Constraint Date", (a) => a.constraint?.date ?? null, (a, t) => (a.constraint ? { constraint: { ...a.constraint, date: t } } : null)),
  {
    id: "constraint2",
    label: "Secondary Constraint",
    group: "Dates",
    type: "enum",
    width: 120,
    options: ["", ...Object.values(CONSTRAINT_LABEL)],
    get: (a) => (a.secondaryConstraint ? CONSTRAINT_LABEL[a.secondaryConstraint.type] ?? a.secondaryConstraint.type : ""),
    set: (a, v) => {
      if (!v) return { secondaryConstraint: null };
      const k = Object.keys(CONSTRAINT_LABEL).find((x) => CONSTRAINT_LABEL[x] === v);
      return k ? { secondaryConstraint: { type: k as NonNullable<Activity["constraint"]>["type"], date: a.secondaryConstraint?.date ?? a.finish } } : null;
    },
  },
  dateField("constraint2Date", "Secondary Constraint Date", (a) => a.secondaryConstraint?.date ?? null, (a, t) => (a.secondaryConstraint ? { secondaryConstraint: { ...a.secondaryConstraint, date: t } } : null)),
  {
    id: "leveledDelay",
    label: "Leveling Delay",
    group: "Durations",
    type: "duration",
    width: 62,
    align: "right",
    get: (a, c) => toDays(a.leveledDelayHours, c.hpd),
  },
  { id: "preds", label: "Predecessors", group: "Relationships", type: "text", width: 140, get: (a, c) => (c.preds.get(a.id) ?? []).join(", ") },
  { id: "succs", label: "Successors", group: "Relationships", type: "text", width: 140, get: (a, c) => (c.succs.get(a.id) ?? []).join(", ") },
  { id: "resources", label: "Resources", group: "Costs", type: "text", width: 140, get: (a, c) => (c.resNames.get(a.id) ?? []).join(", ") },
  { id: "budgetCost", label: "Budgeted Total Cost", group: "Costs", type: "number", width: 96, align: "right", get: costOf("budget") },
  { id: "actualCost", label: "Actual Total Cost", group: "Costs", type: "number", width: 92, align: "right", get: costOf("actual") },
  { id: "remainingCost", label: "Remaining Total Cost", group: "Costs", type: "number", width: 96, align: "right", get: costOf("remaining") },
  {
    id: "atCompletionCost",
    label: "At Completion Total Cost",
    group: "Costs",
    type: "number",
    width: 100,
    align: "right",
    get: (a, c) => {
      const x = c.cost.get(a.id);
      return x ? Math.round((x.actual + x.remaining) * 100) / 100 : null;
    },
  },
  { id: "budgetUnits", label: "Budgeted Labor Units", group: "Units", type: "number", width: 92, align: "right", get: costOf("budgetUnits") },
  { id: "actualUnits", label: "Actual Labor Units", group: "Units", type: "number", width: 88, align: "right", get: costOf("actualUnits") },
  { id: "remainingUnits", label: "Remaining Labor Units", group: "Units", type: "number", width: 92, align: "right", get: costOf("remainingUnits") },
  { id: "notes", label: "Notebook", group: "General", type: "text", width: 160, get: (a) => a.notes ?? "", set: (_a, v) => ({ notes: String(v ?? "") || undefined }) },
  {
    id: "physicalPct",
    label: "Physical % Complete",
    group: "Status",
    type: "percent",
    width: 66,
    align: "right",
    get: (a) => (a.physicalPercent === undefined ? null : Math.round(a.physicalPercent * 10) / 10),
    text: (a) => (a.physicalPercent === undefined ? "" : `${Math.round(a.physicalPercent)}%`),
    set: (_a, v) => {
      const p = Number(v);
      return Number.isFinite(p) ? { physicalPercent: Math.min(100, Math.max(0, p)) } : null;
    },
  },
  {
    id: "pctType",
    label: "Percent Complete Type",
    group: "Status",
    type: "enum",
    width: 92,
    options: ["Duration", "Physical", "Units"],
    get: (a) => (a.pctType === "physical" ? "Physical" : a.pctType === "units" ? "Units" : "Duration"),
    set: (_a, v) => ({ pctType: v === "Physical" ? "physical" : v === "Units" ? "units" : "duration" }),
  },
  {
    id: "durationType",
    label: "Duration Type",
    group: "General",
    type: "enum",
    width: 150,
    options: ["Fixed Duration and Units/Time", "Fixed Duration and Units", "Fixed Units", "Fixed Units/Time"],
    get: (a) =>
      ({ "fixed-duration-units-time": "Fixed Duration and Units/Time", "fixed-duration-units": "Fixed Duration and Units", "fixed-units": "Fixed Units", "fixed-units-time": "Fixed Units/Time" })[a.durationType ?? "fixed-duration-units-time"],
    set: (_a, v) => {
      const m: Record<string, Activity["durationType"]> = { "Fixed Duration and Units/Time": "fixed-duration-units-time", "Fixed Duration and Units": "fixed-duration-units", "Fixed Units": "fixed-units", "Fixed Units/Time": "fixed-units-time" };
      return m[String(v)] ? { durationType: m[String(v)] } : null;
    },
  },
  { id: "steps", label: "Steps", group: "Status", type: "number", width: 46, align: "right", get: (a) => (a.steps?.length ? a.steps.length : null) },
];

/** P6 indicator UDFs: a coloured flag per activity. */
export const INDICATORS: Record<string, string> = { Red: "🔴", Yellow: "🟡", Green: "🟢", Blue: "🔵" };
function indicatorField(k: string): FieldDef {
  return {
    id: `user:${k}`,
    label: k,
    group: "User Defined Fields",
    type: "enum",
    width: 70,
    align: "center",
    options: ["", ...Object.keys(INDICATORS)],
    get: (a) => a.userFields?.[k] ?? "",
    text: (a) => INDICATORS[a.userFields?.[k] ?? ""] ?? "",
    set: (a, v) => {
      const next = { ...(a.userFields ?? {}) };
      const key = Object.keys(INDICATORS).find((x) => x.toLowerCase() === String(v ?? "").toLowerCase());
      if (!key) delete next[k];
      else next[k] = key;
      return { userFields: next };
    },
  };
}

/** All fields for a schedule: built-ins plus its activity codes and user-defined fields. */
export function fieldsFor(s: Schedule | null): FieldDef[] {
  if (!s) return BASE_FIELDS;
  const codes = new Set<string>();
  const udfs = new Set<string>();
  for (const a of s.activities) {
    for (const k in a.codes) codes.add(k);
    for (const k in a.userFields ?? {}) udfs.add(k);
  }
  // Defined in the dictionaries even if no activity uses them yet.
  for (const t of s.codeTypes ?? []) codes.add(t.name);
  for (const u of s.udfDefs ?? []) udfs.add(u.name);
  const codeFields: FieldDef[] = [...codes].sort().map((k) => ({
    id: `code:${k}`,
    label: k,
    group: "Activity Codes",
    type: "text",
    width: 110,
    get: (a) => a.codes[k] ?? "",
    set: (a, v) => {
      const next = { ...a.codes };
      if (v === null || v === "") delete next[k];
      else next[k] = String(v);
      return { codes: next };
    },
  }));
  const udfType = new Map((s.udfDefs ?? []).map((u) => [u.name, u.type]));
  const udfFields: FieldDef[] = [...udfs].sort().map((k) => udfType.get(k) === "indicator" ? indicatorField(k) : ({
    id: `user:${k}`,
    label: k,
    group: "User Defined Fields",
    type: "text",
    width: 110,
    get: (a) => a.userFields?.[k] ?? "",
    set: (a, v) => {
      const next = { ...(a.userFields ?? {}) };
      if (v === null || v === "") delete next[k];
      else next[k] = String(v);
      return { userFields: next };
    },
  }));
  // Formula and rule-based UDFs read the other columns (not each other) and are read-only.
  const plain = [...BASE_FIELDS, ...codeFields, ...udfFields];
  const byLabel = new Map(plain.map((f) => [f.label.toLowerCase(), f]));
  const lookup: FieldLookup = (name) => {
    const f = byLabel.get(name.toLowerCase());
    if (!f) return null;
    return (a, k) => {
      const v = f.get(a, k as FieldCtx);
      if (v === null || v === "" || typeof v === "boolean") return v === true ? 1 : v === false ? 0 : null;
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
  };
  const computed = new Map<string, FieldDef>();
  for (const u of s.udfDefs ?? []) {
    try {
      if (u.formula && (u.type === "number" || u.type === "cost")) {
        const calc = compileFormula(u.formula, lookup);
        computed.set(u.name, {
          id: `user:${u.name}`,
          label: u.name,
          group: u.type === "cost" ? "Costs" : "User Defined Fields",
          type: "number",
          width: 110,
          align: "right",
          get: (a, c) => {
            const v = calc(a, c);
            return v === null ? null : Math.round(v * 100) / 100;
          },
        });
      } else if (u.type === "indicator" && u.indicatorRule?.field) {
        const color = indicatorFromRule(u.indicatorRule, lookup);
        computed.set(u.name, { ...indicatorField(u.name), get: (a, c) => color(a, c), text: (a, c) => INDICATORS[color(a, c)] ?? "", set: undefined });
      }
    } catch {
      /* an invalid formula leaves the field as a plain value column; the UDF dialog shows the error */
    }
  }
  return computed.size ? plain.map((f) => (f.id.startsWith("user:") && computed.get(f.label)) || f) : plain;
}

export function fieldText(f: FieldDef, a: Activity, c: FieldCtx): string {
  if (f.text) return f.text(a, c);
  const v = f.get(a, c);
  if (v === null || v === undefined) return "";
  if (f.type === "date") return fmtDay(v as number);
  if (f.type === "bool") return v ? "Yes" : "";
  if (f.type === "percent") return `${v}%`;
  if (f.type === "number" && f.group === "Costs") return fmtMoney(Number(v));
  if (f.type === "number") return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

// ---------------------------------------------------------------- filters

export type FilterOp = "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "contains" | "notContains" | "startsWith" | "empty" | "notEmpty" | "isTrue" | "isFalse";

export interface FilterRule {
  field: string;
  op: FilterOp;
  value?: string;
}

export interface FilterDef {
  id: string;
  name: string;
  match: "all" | "any";
  rules: FilterRule[];
}

export const OP_LABEL: Record<FilterOp, string> = {
  eq: "equals",
  ne: "is not equal to",
  lt: "is less than",
  le: "is less than or equal to",
  gt: "is greater than",
  ge: "is greater than or equal to",
  contains: "contains",
  notContains: "does not contain",
  startsWith: "starts with",
  empty: "is empty",
  notEmpty: "is not empty",
  isTrue: "is true",
  isFalse: "is false",
};

/** Parse a value typed in a filter for comparison with a field of the given type. */
function coerce(f: FieldDef, raw: string | undefined, c?: FieldCtx): string | number | null {
  if (raw === undefined || raw === "") return null;
  if (f.type === "date") {
    // Relative to the data date, as P6 lookahead filters are: "DD", "DD+14", "DD-7" (days).
    const rel = /^\s*dd\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*d?)?\s*$/i.exec(raw);
    if (rel && c?.s.dataDate != null) return c.s.dataDate + (rel[1] === "-" ? -1 : 1) * Number(rel[2] ?? 0) * DAY;
    const t = Date.parse(raw.length <= 10 ? `${raw}T00:00:00Z` : raw);
    if (Number.isFinite(t)) return t;
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(raw.trim());
    if (m) {
      const mi = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
      const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
      if (mi >= 0) return Date.UTC(y, mi, Number(m[1]));
    }
    return null;
  }
  if (f.type === "number" || f.type === "duration" || f.type === "percent") {
    const n = Number(raw.replace(/[%,\s]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return raw.toLowerCase();
}

export function ruleMatches(rule: FilterRule, a: Activity, f: FieldDef | undefined, c: FieldCtx): boolean {
  if (!f) return true;
  const v = f.get(a, c);
  const isEmpty = v === null || v === undefined || v === "";
  switch (rule.op) {
    case "empty":
      return isEmpty;
    case "notEmpty":
      return !isEmpty;
    case "isTrue":
      return v === true || v === "Yes";
    case "isFalse":
      return !(v === true || v === "Yes");
  }
  const want = coerce(f, rule.value, c);
  if (want === null) return true;
  if (isEmpty) return rule.op === "ne" || rule.op === "notContains";
  const have = typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : String(v).toLowerCase();
  if (f.type === "date" && typeof have === "number" && typeof want === "number") {
    // Compare by calendar day.
    const hd = Math.floor(have / DAY);
    const wd = Math.floor(want / DAY);
    return cmp(rule.op, hd, wd);
  }
  if (typeof have === "number" && typeof want === "number") return cmp(rule.op, have, want);
  const hs = String(have);
  const ws = String(want);
  switch (rule.op) {
    case "contains":
      return hs.includes(ws);
    case "notContains":
      return !hs.includes(ws);
    case "startsWith":
      return hs.startsWith(ws);
    default:
      return cmp(rule.op, hs, ws);
  }
}

function cmp(op: FilterOp, x: number | string, y: number | string): boolean {
  switch (op) {
    case "eq":
      return x === y;
    case "ne":
      return x !== y;
    case "lt":
      return x < y;
    case "le":
      return x <= y;
    case "gt":
      return x > y;
    case "ge":
      return x >= y;
    case "contains":
      return String(x).includes(String(y));
    case "notContains":
      return !String(x).includes(String(y));
    case "startsWith":
      return String(x).startsWith(String(y));
    default:
      return true;
  }
}

export function filterMatches(def: FilterDef, a: Activity, fields: Map<string, FieldDef>, c: FieldCtx): boolean {
  if (!def.rules.length) return true;
  return def.match === "all" ? def.rules.every((r) => ruleMatches(r, a, fields.get(r.field), c)) : def.rules.some((r) => ruleMatches(r, a, fields.get(r.field), c));
}

/** P6's default filters. */
export const STANDARD_FILTERS: FilterDef[] = [
  { id: "critical", name: "Critical", match: "all", rules: [{ field: "critical", op: "isTrue" }] },
  { id: "longestPath", name: "Longest Path", match: "all", rules: [{ field: "longestPath", op: "isTrue" }] },
  {
    id: "lookahead2",
    name: "Lookahead – next 2 weeks",
    match: "all",
    rules: [
      { field: "start", op: "le", value: "DD+14" },
      { field: "finish", op: "ge", value: "DD" },
      { field: "status", op: "ne", value: "Completed" },
    ],
  },
  {
    id: "lookahead6",
    name: "Lookahead – next 6 weeks",
    match: "all",
    rules: [
      { field: "start", op: "le", value: "DD+42" },
      { field: "finish", op: "ge", value: "DD" },
      { field: "status", op: "ne", value: "Completed" },
    ],
  },
  { id: "negFloat", name: "Negative Float", match: "all", rules: [{ field: "tf", op: "lt", value: "0" }] },
  { id: "notStarted", name: "Not Started", match: "all", rules: [{ field: "status", op: "eq", value: "Not Started" }] },
  { id: "inProgress", name: "In Progress", match: "all", rules: [{ field: "status", op: "eq", value: "In Progress" }] },
  { id: "completed", name: "Completed", match: "all", rules: [{ field: "status", op: "eq", value: "Completed" }] },
  { id: "milestones", name: "Milestones", match: "any", rules: [{ field: "type", op: "eq", value: "Start Milestone" }, { field: "type", op: "eq", value: "Finish Milestone" }] },
  { id: "noPred", name: "Activities without Predecessors", match: "all", rules: [{ field: "preds", op: "empty" }] },
  { id: "noSucc", name: "Activities without Successors", match: "all", rules: [{ field: "succs", op: "empty" }] },
  { id: "constraints", name: "Activities with Constraints", match: "all", rules: [{ field: "constraint", op: "notEmpty" }] },
  { id: "late", name: "Late against Baseline", match: "all", rules: [{ field: "finishVar", op: "lt", value: "0" }] },
  { id: "loe", name: "Level of Effort Activities", match: "all", rules: [{ field: "type", op: "eq", value: "Level of Effort" }] },
];
