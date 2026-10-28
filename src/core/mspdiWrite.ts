// Microsoft Project XML (MSPDI) writer: File › Save As › XML in MS Project
// opens what this writes. Summary tasks come from the WBS, in outline order;
// elements follow the order of Microsoft's MSPDI schema, which MS Project
// checks when it opens a file.

import { buildGanttRows } from "./wbs";
import type { Activity, Calendar, ConstraintType, RelationshipType, Schedule } from "./types";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pad = (n: number) => String(n).padStart(2, "0");
/** UTC wall time, as the reader takes it. */
export function mspDate(t: number | null | undefined): string {
  if (t === null || t === undefined) return "";
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}
/** Working hours as an MSPDI duration ("PT40H0M0S"). */
export function mspDuration(hours: number | null | undefined): string {
  const h = Math.max(0, hours ?? 0);
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return `PT${whole + (min === 60 ? 1 : 0)}H${min === 60 ? 0 : min}M0S`;
}
const hm = (h: number) => `${pad(Math.floor(h))}:${pad(Math.round((h % 1) * 60))}:00`;
const b = (v: boolean | undefined) => (v ? "1" : "0");

const LINK: Record<RelationshipType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const CONSTRAINT: Record<ConstraintType, number> = {
  "as-late-as-possible": 1,
  "start-on": 2,
  "mandatory-start": 2,
  "finish-on": 3,
  "mandatory-finish": 3,
  "start-on-or-after": 4,
  "start-on-or-before": 5,
  "finish-on-or-after": 6,
  "finish-on-or-before": 7,
};
const TASK_TYPE = (a: Activity) => (a.durationType === "fixed-duration-units" || a.durationType === "fixed-duration-units-time" ? 1 : a.durationType === "fixed-units" ? 2 : 0);

class Xml {
  out: string[] = [];
  private depth = 0;
  open(tag: string) {
    this.out.push(`${"  ".repeat(this.depth)}<${tag}>`);
    this.depth++;
  }
  close(tag: string) {
    this.depth--;
    this.out.push(`${"  ".repeat(this.depth)}</${tag}>`);
  }
  el(tag: string, v: string | number | null | undefined) {
    if (v === null || v === undefined || v === "") return;
    this.out.push(`${"  ".repeat(this.depth)}<${tag}>${esc(String(v))}</${tag}>`);
  }
}

/** Consecutive days folded into [from, to] ranges. */
function ranges(days: number[]): [number, number][] {
  const sorted = [...new Set(days)].sort((x, y) => x - y);
  const out: [number, number][] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && d - last[1] <= 86_400_000) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

function writeCalendar(x: Xml, c: Calendar, uidOf: Map<string, number>) {
  x.open("Calendar");
  x.el("UID", uidOf.get(c.id)!);
  x.el("Name", c.name);
  x.el("IsBaseCalendar", 1);
  x.el("BaseCalendarUID", -1);
  x.open("WeekDays");
  for (let d = 0; d < 7; d++) {
    x.open("WeekDay");
    x.el("DayType", d + 1);
    x.el("DayWorking", b(c.week[d].length > 0));
    if (c.week[d].length) {
      x.open("WorkingTimes");
      for (const [f, t] of c.week[d]) {
        x.open("WorkingTime");
        x.el("FromTime", hm(f));
        x.el("ToTime", hm(t >= 24 ? 0 : t));
        x.close("WorkingTime");
      }
      x.close("WorkingTimes");
    }
    x.close("WeekDay");
  }
  // Exceptions in the DayType 0 form every MS Project version reads.
  for (const [f, t] of ranges(c.holidays)) {
    x.open("WeekDay");
    x.el("DayType", 0);
    x.el("DayWorking", 0);
    x.open("TimePeriod");
    x.el("FromDate", mspDate(f));
    x.el("ToDate", mspDate(t + 86_340_000));
    x.close("TimePeriod");
    x.close("WeekDay");
  }
  for (const w of c.workdays ?? []) {
    x.open("WeekDay");
    x.el("DayType", 0);
    x.el("DayWorking", 1);
    x.open("TimePeriod");
    x.el("FromDate", mspDate(w.date));
    x.el("ToDate", mspDate(w.date + 86_340_000));
    x.close("TimePeriod");
    x.open("WorkingTimes");
    for (const [f, t] of w.spans) {
      x.open("WorkingTime");
      x.el("FromTime", hm(f));
      x.el("ToTime", hm(t >= 24 ? 0 : t));
      x.close("WorkingTime");
    }
    x.close("WorkingTimes");
    x.close("WeekDay");
  }
  x.close("WeekDays");
  x.close("Calendar");
}

/** Allocates MS Project UIDs, keeping the ones a schedule read from MSPDI already had. */
function uidAllocator(start = 1) {
  const used = new Set<number>();
  let next = start;
  return {
    claim(n: number | null | undefined) {
      if (n === null || n === undefined || !Number.isInteger(n) || n <= 0 || used.has(n)) return null;
      used.add(n);
      return n;
    },
    fresh() {
      while (used.has(next)) next++;
      used.add(next);
      return next;
    },
  };
}
const numeric = (id: string, prefix = "") => (id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)) ? Number(id.slice(prefix.length)) : null);

export function writeMspdi(s: Schedule): string {
  const x = new Xml();
  const cals = s.calendars ?? [];
  const calUid = new Map(cals.map((c, i) => [c.id, i + 1]));
  const defCal = (s.defaultCalendarId && calUid.get(s.defaultCalendarId)) || (cals.length ? 1 : null);
  const hpd = (cals.find((c) => c.id === s.defaultCalendarId) ?? cals[0])?.hoursPerDay || 8;
  const rows = buildGanttRows(s, "current");
  const acts = s.activities.filter((a) => a.type !== "wbs-summary");

  // Task UIDs: keep MS Project's own where the schedule came from MSPDI.
  const ua = uidAllocator();
  const taskUid = new Map<string, number>();
  const fromMsp = s.sourceFormat === "mspdi";
  for (const r of rows) {
    const n = r.kind === "wbs" ? (fromMsp ? numeric(r.id, "w") : null) : (r.activity.mspUid ?? (fromMsp ? numeric(r.id) : null));
    const got = ua.claim(n);
    if (got !== null) taskUid.set(r.id, got);
  }
  for (const r of rows) if (!taskUid.has(r.id)) taskUid.set(r.id, ua.fresh());
  const rowsSet = new Set(rows.map((r) => r.id));
  for (const a of acts) if (!rowsSet.has(a.id)) taskUid.set(a.id, ua.fresh());

  const start = Math.min(...acts.map((a) => a.start ?? Infinity));
  const finish = Math.max(...acts.map((a) => a.finish ?? -Infinity));
  const relsBySucc = new Map<string, typeof s.relationships>();
  for (const r of s.relationships) (relsBySucc.get(r.successorId) ?? relsBySucc.set(r.successorId, []).get(r.successorId)!).push(r);

  // Stored baselines named "Baseline 1" … "Baseline 10" go out as MS Project's numbered baselines.
  const numbered = new Map<number, Map<string, [number | null, number | null]>>();
  for (const bl of s.baselines ?? []) {
    const m = /^Baseline\s+(\d{1,2})$/i.exec(bl.name.trim());
    if (m && +m[1] >= 1 && +m[1] <= 10) numbered.set(+m[1], new Map(Object.entries(bl.dates)));
  }

  x.out.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  x.out.push('<Project xmlns="http://schemas.microsoft.com/project">');
  x.el("SaveVersion", 14);
  x.el("Name", `${s.projectCode}.xml`);
  x.el("Title", s.projectName);
  x.el("ScheduleFromStart", b(s.scheduleFrom !== "finish"));
  x.el("StartDate", mspDate(s.plannedStart ?? (Number.isFinite(start) ? start : s.dataDate)));
  x.el("FinishDate", mspDate(s.mustFinishBy ?? (Number.isFinite(finish) ? finish : null)));
  x.el("CalendarUID", defCal);
  x.el("MinutesPerDay", Math.round(hpd * 60));
  x.el("MinutesPerWeek", Math.round(hpd * 60 * 5));
  x.el("DaysPerMonth", 20);
  x.el("StatusDate", mspDate(s.dataDate));
  x.el("CurrentDate", mspDate(s.dataDate));
  x.el("NewTasksAreManual", b(s.newTaskMode === "manual"));

  x.open("Calendars");
  for (const c of cals) writeCalendar(x, c, calUid);
  x.close("Calendars");

  x.open("Tasks");
  // Task 0: the project summary task.
  x.open("Task");
  x.el("UID", 0);
  x.el("ID", 0);
  x.el("Name", s.projectName);
  x.el("Type", 1);
  x.el("IsNull", 0);
  x.el("OutlineNumber", 0);
  x.el("OutlineLevel", 0);
  if (Number.isFinite(start)) x.el("Start", mspDate(start));
  if (Number.isFinite(finish)) x.el("Finish", mspDate(finish));
  x.el("Summary", 1);
  x.close("Task");

  const counters: number[] = [];
  rows.forEach((r, i) => {
    counters.length = r.depth + 1;
    counters[r.depth] = (counters[r.depth] ?? 0) + 1;
    for (let k = 0; k < r.depth; k++) counters[k] ??= 1;
    const outline = counters.join(".");
    x.open("Task");
    x.el("UID", taskUid.get(r.id)!);
    x.el("ID", i + 1);
    if (r.kind === "wbs") {
      const w = s.wbs.find((n) => n.id === r.id)!;
      x.el("Name", w.name);
      x.el("Active", 1);
      x.el("Manual", 0);
      x.el("Type", 1);
      x.el("IsNull", 0);
      x.el("WBS", w.code || outline);
      x.el("OutlineNumber", outline);
      x.el("OutlineLevel", r.depth + 1);
      x.el("Priority", 500);
      x.el("Start", mspDate(r.start));
      x.el("Finish", mspDate(r.finish));
      x.el("Summary", 1);
      x.close("Task");
      return;
    }
    const a = r.activity;
    const ms = a.type === "milestone" || a.type === "finish-milestone";
    const od = ms ? 0 : (a.originalDurationHours ?? 0);
    const rd = ms ? 0 : (a.remainingDurationHours ?? od);
    x.el("Name", a.name);
    x.el("Active", b(!a.inactive));
    x.el("Manual", b(a.taskMode === "manual"));
    x.el("Type", TASK_TYPE(a));
    x.el("IsNull", 0);
    x.el("WBS", outline);
    x.el("OutlineNumber", outline);
    x.el("OutlineLevel", r.depth + 1);
    x.el("Priority", a.priority ?? 500);
    x.el("Start", mspDate(a.start));
    x.el("Finish", mspDate(a.finish));
    x.el("Duration", mspDuration(od));
    if (a.taskMode === "manual") {
      x.el("ManualStart", mspDate(a.start));
      x.el("ManualFinish", mspDate(a.finish));
      x.el("ManualDuration", mspDuration(od));
    }
    x.el("DurationFormat", a.estimated ? 39 : 7);
    x.el("Estimated", b(a.estimated));
    x.el("Milestone", b(ms));
    x.el("Summary", 0);
    x.el("Critical", b(a.critical));
    x.el("EarlyStart", mspDate(a.start));
    x.el("EarlyFinish", mspDate(a.finish));
    x.el("LateStart", mspDate(a.lateStart));
    x.el("LateFinish", mspDate(a.lateFinish));
    if (a.freeFloatHours != null) x.el("FreeSlack", Math.round(a.freeFloatHours * 600));
    if (a.totalFloatHours != null) x.el("TotalSlack", Math.round(a.totalFloatHours * 600));
    x.el("PercentComplete", Math.round(a.percentComplete));
    x.el("ActualStart", mspDate(a.actualStart));
    x.el("ActualFinish", mspDate(a.actualFinish));
    x.el("ActualDuration", mspDuration(Math.max(0, od - rd)));
    x.el("RemainingDuration", mspDuration(rd));
    const c = a.constraint;
    x.el("ConstraintType", c ? CONSTRAINT[c.type] : 0);
    x.el("CalendarUID", a.calendarId && calUid.has(a.calendarId) ? calUid.get(a.calendarId)! : -1);
    if (c?.date != null) x.el("ConstraintDate", mspDate(c.date));
    x.el("Deadline", mspDate(a.deadline));
    x.el("Notes", a.notes);
    x.el("HideBar", b(a.hideBar));
    if (a.physicalPercent !== undefined) x.el("PhysicalPercentComplete", Math.round(a.physicalPercent));
    for (const rel of relsBySucc.get(a.id) ?? []) {
      const p = taskUid.get(rel.predecessorId);
      if (p === undefined) continue;
      x.open("PredecessorLink");
      x.el("PredecessorUID", p);
      x.el("Type", LINK[rel.type]);
      x.el("CrossProject", 0);
      x.el("LinkLag", Math.round(rel.lagHours * 600));
      x.el("LagFormat", 7);
      x.close("PredecessorLink");
    }
    const baselines: [number, number | null, number | null][] = [];
    if (a.baselineStart !== null || a.baselineFinish !== null) baselines.push([0, a.baselineStart, a.baselineFinish]);
    for (const [n, dates] of [...numbered].sort((p, q) => p[0] - q[0])) {
      const d = dates.get(a.code);
      if (d) baselines.push([n, d[0], d[1]]);
    }
    for (const [n, bs, bf] of baselines) {
      x.open("Baseline");
      x.el("Number", n);
      x.el("Start", mspDate(bs));
      x.el("Finish", mspDate(bf));
      x.close("Baseline");
    }
    x.close("Task");
  });
  x.close("Tasks");

  // Resources
  const ru = uidAllocator();
  const resUid = new Map<string, number>();
  const res = s.resources ?? [];
  for (const r of res) {
    const got = ru.claim(fromMsp ? numeric(r.id) : null);
    if (got !== null) resUid.set(r.id, got);
  }
  for (const r of res) if (!resUid.has(r.id)) resUid.set(r.id, ru.fresh());
  x.open("Resources");
  x.open("Resource");
  x.el("UID", 0);
  x.el("ID", 0);
  x.el("Type", 1);
  x.el("IsNull", 0);
  x.close("Resource");
  res.forEach((r, i) => {
    x.open("Resource");
    x.el("UID", resUid.get(r.id)!);
    x.el("ID", i + 1);
    x.el("Name", r.name);
    x.el("Type", r.type === "material" ? 0 : 1);
    x.el("IsNull", 0);
    x.el("Initials", r.code);
    if (r.type === "material") x.el("MaterialLabel", r.unit);
    x.el("Group", r.group);
    x.el("EmailAddress", r.email);
    x.el("MaxUnits", r.type === "material" ? undefined : (r.maxUnitsPerHour ?? 1));
    x.el("AccrueAt", r.accrueAt === "start" ? 1 : r.accrueAt === "end" ? 2 : 3);
    x.el("StandardRate", r.pricePerUnit);
    x.el("StandardRateFormat", r.type === "material" ? 7 : 2);
    x.el("OvertimeRate", r.overtimeRate ?? 0);
    x.el("OvertimeRateFormat", 2);
    x.el("CostPerUse", r.costPerUse ?? 0);
    if (r.calendarId && calUid.has(r.calendarId)) x.el("CalendarUID", calUid.get(r.calendarId)!);
    x.close("Resource");
  });
  x.close("Resources");

  // Assignments
  const actById = new Map(acts.map((a) => [a.id, a]));
  x.open("Assignments");
  let au = 1;
  for (const as of s.assignments ?? []) {
    const a = actById.get(as.activityId);
    const ruid = resUid.get(as.resourceId);
    const tuid = taskUid.get(as.activityId);
    if (!a || ruid === undefined || tuid === undefined) continue;
    const od = a.originalDurationHours ?? 0;
    const units = as.units ?? (od > 0 ? Math.round((as.budgetQty / od) * 100) / 100 : 1);
    x.open("Assignment");
    x.el("UID", au++);
    x.el("TaskUID", tuid);
    x.el("ResourceUID", ruid);
    x.el("ActualCost", as.actualCost);
    x.el("ActualWork", mspDuration(as.actualQty));
    x.el("Cost", as.actualCost + as.remainingCost);
    x.el("Finish", mspDate(a.finish));
    x.el("RemainingCost", as.remainingCost);
    x.el("RemainingWork", mspDuration(as.remainingQty));
    x.el("Start", mspDate(a.start));
    x.el("Units", units);
    x.el("Work", mspDuration(as.budgetQty));
    x.close("Assignment");
  }
  x.close("Assignments");
  x.out.push("</Project>");
  return x.out.join("\n") + "\n";
}
