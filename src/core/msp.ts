// MS Project behaviour on top of the Stratum schedule model:
//  - duration text ("5d", "2w", "16h", "3 days?") and predecessor text ("3FS+2d,5SS-1w,7FF+50%");
//  - outline editing (Indent, Outdent, Insert Summary Task). Stratum keeps
//    summary tasks as WBS nodes, so indenting under a plain task turns that
//    task into a summary, as MS Project does;
//  - Project Statistics and the Task Type mapping to P6 duration types.

import { addWorkHours, nextWorkStart, prevWorkEnd, standardCalendar, workHoursBetween } from "./calendar";
import { uid } from "./ops";
import { buildGanttRows, type GanttRow } from "./wbs";
import type { Activity, Relationship, RelationshipType, Schedule, WbsNode } from "./types";

const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------- durations

export interface DurationText {
  hours: number;
  estimated: boolean;
}

/** MS Project's duration words: "0 days", "1 day", "2.5 days", "1 wk", "2 mons" … plus "?" when estimated. */
export function formatMspDuration(hours: number | null | undefined, hpd: number, estimated = false, unit: "d" | "h" | "w" = "d"): string {
  if (hours === null || hours === undefined) return "";
  const q = estimated ? "?" : "";
  if (unit === "h") return `${round(hours)} hr${round(hours) === 1 ? "" : "s"}${q}`;
  if (unit === "w") {
    const w = round(hours / (hpd * 5));
    return `${w} wk${w === 1 ? "" : "s"}${q}`;
  }
  const d = round(hours / hpd);
  return `${d} day${d === 1 ? "" : "s"}${q}`;
}

const UNITS: [RegExp, (hpd: number) => number][] = [
  [/^(m|min|mins|minute|minutes)$/, () => 1 / 60],
  [/^(h|hr|hrs|hour|hours)$/, () => 1],
  [/^(d|dy|dys|day|days)$/, (hpd) => hpd],
  [/^(w|wk|wks|week|weeks)$/, (hpd) => hpd * 5],
  [/^(mo|mon|mons|month|months)$/, (hpd) => hpd * 20],
];

/** Read what a planner types in the Duration column. A bare number is in days. Returns null when it cannot be read. */
export function parseMspDuration(text: string, hpd: number): DurationText | null {
  const t = text.trim().toLowerCase();
  const m = /^(-?\d+(?:\.\d+)?)\s*(e?)([a-z]*)\s*(\??)$/.exec(t);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 0) return null;
  const word = m[3] || "d";
  const u = UNITS.find(([re]) => re.test(word));
  if (!u) return null;
  // Elapsed units ("ed", "ew") run round the clock; held here as working hours of the same length.
  const per = m[2] ? (word.startsWith("h") ? 1 : u[1](hpd) * (24 / hpd)) : u[1](hpd);
  return { hours: round(n * per, 4), estimated: m[4] === "?" };
}

// ---------------------------------------------------------------- predecessors

const LAG_UNIT = /^([+-])\s*(\d+(?:\.\d+)?)\s*(%|[a-z]*)$/;

/** One predecessor as MS Project writes it: "3", "3SS", "3FS+2 days", "3FF-1 wk", "3SS+50%". */
export function formatMspPredecessor(r: Relationship, rowNo: number, hpd: number): string {
  const lag = r.lagHours ? `${r.lagHours > 0 ? "+" : "-"}${formatMspDuration(Math.abs(r.lagHours), hpd)}` : "";
  return r.type === "FS" && !lag ? String(rowNo) : `${rowNo}${r.type}${lag}`;
}

export interface ParsedPredecessor {
  row: number;
  type: RelationshipType;
  lagHours: number;
  /** Lag given as a % of the predecessor's duration (resolved by the caller when it knows the duration). */
  lagPercent?: number;
}

/** Read a Predecessors cell. Throws with a message MS Project would show when a part cannot be read. */
export function parseMspPredecessors(text: string, hpd: number): ParsedPredecessor[] {
  const out: ParsedPredecessor[] = [];
  for (const raw of text.split(/[,;]/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = /^(\d+)\s*(FS|SS|FF|SF)?\s*(.*)$/i.exec(part);
    if (!m) throw new Error(`"${part}" is not a valid predecessor. Use a task ID, e.g. 3, 3SS or 3FS+2d.`);
    const type = ((m[2] ?? "FS").toUpperCase() as RelationshipType) ?? "FS";
    const rest = m[3].replace(/\s+/g, "").toLowerCase();
    let lagHours = 0;
    let lagPercent: number | undefined;
    if (rest) {
      const l = LAG_UNIT.exec(rest);
      if (!l) throw new Error(`"${part}": the lag must look like +2d, -1w or +50%.`);
      const sign = l[1] === "-" ? -1 : 1;
      if (l[3] === "%") lagPercent = sign * Number(l[2]);
      else {
        const d = parseMspDuration(`${l[2]}${l[3]}`, hpd);
        if (!d) throw new Error(`"${part}": the lag unit is not recognised.`);
        lagHours = sign * d.hours;
      }
    }
    out.push({ row: Number(m[1]), type, lagHours, ...(lagPercent !== undefined ? { lagPercent } : {}) });
  }
  return out;
}

/**
 * Replace a task's predecessors from Predecessors-cell text. rowIds maps the
 * row number shown in the sheet to the activity id. Links to summary rows
 * are refused, since Stratum links tasks only.
 */
export function setPredecessorsFromText(s: Schedule, activityId: string, text: string, rowIds: Map<number, string>, hpd: number): Schedule {
  const parsed = parseMspPredecessors(text, hpd);
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  const keep = s.relationships.filter((r) => r.successorId !== activityId);
  const old = new Map(s.relationships.filter((r) => r.successorId === activityId).map((r) => [r.predecessorId, r]));
  const added: Relationship[] = [];
  for (const p of parsed) {
    const pid = rowIds.get(p.row);
    if (!pid) throw new Error(`There is no task ${p.row}.`);
    const pred = acts.get(pid);
    if (!pred) throw new Error(`Row ${p.row} is a summary task. Link the tasks under it instead.`);
    if (pid === activityId) throw new Error("A task cannot be its own predecessor.");
    if (added.some((r) => r.predecessorId === pid)) throw new Error(`Task ${p.row} is listed twice.`);
    const lagHours = p.lagPercent !== undefined ? round(((pred.originalDurationHours ?? 0) * p.lagPercent) / 100) : p.lagHours;
    const prev = old.get(pid);
    added.push({ ...(prev ?? {}), id: prev?.id ?? uid("rel"), predecessorId: pid, successorId: activityId, type: p.type, lagHours });
  }
  return { ...s, relationships: [...keep, ...added] };
}

// ---------------------------------------------------------------- outline

/** Row numbers as MS Project shows them (the ID column): every visible summary and task, in outline order. */
export function mspRows(s: Schedule): GanttRow[] {
  return buildGanttRows(s, "current");
}

export function rowNumbers(rows: GanttRow[]): { byId: Map<string, number>; byRow: Map<number, string> } {
  const byId = new Map<string, number>();
  const byRow = new Map<number, string>();
  rows.forEach((r, i) => {
    byId.set(r.id, i + 1);
    byRow.set(i + 1, r.id);
  });
  return { byId, byRow };
}

/** Turn a task into a summary (WBS node) in its place; its links and assignments go, since summaries hold neither here. */
function taskToSummary(s: Schedule, a: Activity): { schedule: Schedule; wbsId: string; dropped: number } {
  const wbsId = uid("wbs");
  const seqs = s.wbs.filter((w) => w.parentId === a.wbsId).map((w) => w.seq);
  const node: WbsNode = { id: wbsId, parentId: a.wbsId, code: a.code, name: a.name, seq: seqs.length ? Math.min(...seqs) - 1 : 0 };
  const rels = s.relationships.filter((r) => r.predecessorId !== a.id && r.successorId !== a.id);
  const asg = (s.assignments ?? []).filter((x) => x.activityId !== a.id);
  const dropped = s.relationships.length - rels.length + ((s.assignments ?? []).length - asg.length);
  return {
    schedule: { ...s, wbs: [...s.wbs, node], activities: s.activities.filter((x) => x.id !== a.id), relationships: rels, assignments: asg },
    wbsId,
    dropped,
  };
}

export interface OutlineResult {
  schedule: Schedule;
  moved: number;
  /** Links and assignments removed from tasks that became summaries. */
  dropped: number;
  message?: string;
}

/**
 * Indent (Alt+Shift+Right): each selected row becomes a child of the nearest
 * row above it at the same outline level. When that row is a task it becomes a summary.
 */
export function indentRows(s: Schedule, ids: string[]): OutlineResult {
  let cur = s;
  let moved = 0;
  let dropped = 0;
  for (const id of ids) {
    const rows = mspRows(cur);
    const i = rows.findIndex((r) => r.id === id);
    if (i <= 0) continue;
    const me = rows[i];
    let j = i - 1;
    while (j >= 0 && rows[j].depth > me.depth) j--;
    if (j < 0 || rows[j].depth < me.depth) continue; // first child already: nothing to indent under
    const above = rows[j];
    let parentId: string;
    if (above.kind === "activity") {
      if (ids.includes(above.id)) continue;
      const t = taskToSummary(cur, above.activity);
      cur = t.schedule;
      parentId = t.wbsId;
      dropped += t.dropped;
    } else parentId = above.id;
    if (me.kind === "activity") cur = { ...cur, activities: cur.activities.map((a) => (a.id === id ? { ...a, wbsId: parentId } : a)) };
    else {
      const seq = Math.max(0, ...cur.wbs.filter((w) => w.parentId === parentId).map((w) => w.seq + 1));
      cur = { ...cur, wbs: cur.wbs.map((w) => (w.id === id ? { ...w, parentId, seq } : w)) };
    }
    moved++;
  }
  return { schedule: cur, moved, dropped, message: moved ? undefined : "Nothing to indent under: the task is already the first at its level." };
}

/** Outdent (Alt+Shift+Left): each selected row moves up one outline level, next to its old summary. */
export function outdentRows(s: Schedule, ids: string[]): OutlineResult {
  let cur = s;
  let moved = 0;
  for (const id of ids) {
    const wbs = new Map(cur.wbs.map((w) => [w.id, w]));
    const a = cur.activities.find((x) => x.id === id);
    if (a) {
      if (!a.wbsId) continue;
      cur = { ...cur, activities: cur.activities.map((x) => (x.id === id ? { ...x, wbsId: wbs.get(a.wbsId!)?.parentId ?? null } : x)) };
      moved++;
      continue;
    }
    const w = wbs.get(id);
    if (!w || !w.parentId) continue;
    const parent = wbs.get(w.parentId);
    cur = { ...cur, wbs: cur.wbs.map((x) => (x.id === id ? { ...x, parentId: parent?.parentId ?? null, seq: (parent?.seq ?? 0) + 0.5 } : x)) };
    moved++;
  }
  return { schedule: cur, moved, dropped: 0, message: moved ? undefined : "The task is already at the top outline level." };
}

/** Insert Summary Task: a new summary at the first selected row, holding the selected rows. */
export function insertSummary(s: Schedule, ids: string[], name = "<New Summary Task>"): { schedule: Schedule; wbsId: string } {
  const rows = mspRows(s);
  const first = rows.find((r) => ids.includes(r.id));
  const parentId = !first ? null : first.kind === "activity" ? first.activity.wbsId : (s.wbs.find((w) => w.id === first.id)?.parentId ?? null);
  const wbsId = uid("wbs");
  const sibling = first && first.kind === "wbs" ? s.wbs.find((w) => w.id === first.id) : undefined;
  const seq = sibling ? sibling.seq - 0.5 : Math.max(0, ...s.wbs.filter((w) => w.parentId === parentId).map((w) => w.seq + 1));
  const used = new Set(s.wbs.map((w) => w.code));
  let n = s.wbs.length + 1;
  while (used.has(`S${n}`)) n++;
  const node: WbsNode = { id: wbsId, parentId, code: `S${n}`, name, seq };
  const pick = new Set(ids);
  return {
    schedule: {
      ...s,
      wbs: [...s.wbs.map((w) => (pick.has(w.id) ? { ...w, parentId: wbsId } : w)), node],
      activities: s.activities.map((a) => (pick.has(a.id) ? { ...a, wbsId } : a)),
    },
    wbsId,
  };
}

/** Outline numbers (1, 1.1, 1.1.2 …) for every row, as in MS Project's Outline Number field. */
export function outlineNumbers(rows: GanttRow[]): Map<string, string> {
  const out = new Map<string, string>();
  const counters: number[] = [];
  for (const r of rows) {
    counters.length = r.depth + 1;
    counters[r.depth] = (counters[r.depth] ?? 0) + 1;
    for (let i = 0; i < r.depth; i++) counters[i] ??= 1;
    out.set(r.id, counters.join("."));
  }
  return out;
}

// ---------------------------------------------------------------- task type

export type MspTaskType = "fixed-units" | "fixed-duration" | "fixed-work";

/** MS Project Task Type ⇄ P6 Duration Type (the mapping P6 uses when it imports MS Project files). */
export const mspTaskType = (a: Activity): MspTaskType =>
  a.durationType === "fixed-duration-units" || a.durationType === "fixed-duration-units-time" ? "fixed-duration" : a.durationType === "fixed-units" ? "fixed-work" : "fixed-units";
export const durationTypeOf = (t: MspTaskType): Activity["durationType"] => (t === "fixed-duration" ? "fixed-duration-units" : t === "fixed-work" ? "fixed-units" : "fixed-units-time");

// ---------------------------------------------------------------- statistics

export interface ProjectStatistics {
  current: { start: number | null; finish: number | null };
  baseline: { start: number | null; finish: number | null };
  actual: { start: number | null; finish: number | null };
  variance: { startDays: number | null; finishDays: number | null };
  durationDays: { current: number; baseline: number | null; actual: number; remaining: number };
  work: { current: number; baseline: number; actual: number; remaining: number };
  cost: { current: number; baseline: number; actual: number; remaining: number };
  percentComplete: number;
  workPercentComplete: number;
}

const DAY = 86_400_000;
const minOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== null && x !== undefined);
  return v.length ? Math.min(...v) : null;
};
const maxOf = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x !== null && x !== undefined);
  return v.length ? Math.max(...v) : null;
};

/** Project › Project Information › Statistics. Durations in working days on the project calendar. */
export function projectStatistics(s: Schedule): ProjectStatistics {
  const acts = s.activities.filter((a) => a.type !== "wbs-summary" && !a.inactive);
  const start = minOf(acts.map((a) => a.start));
  const finish = maxOf(acts.map((a) => a.finish));
  const bs = minOf(acts.map((a) => a.baselineStart));
  const bf = maxOf(acts.map((a) => a.baselineFinish));
  const as = minOf(acts.map((a) => a.actualStart));
  const af = acts.length && acts.every((a) => a.actualFinish !== null) ? maxOf(acts.map((a) => a.actualFinish)) : null;
  const workDays = (a: number | null, b: number | null) => (a === null || b === null ? null : round(((b - a) / DAY) * (5 / 7), 1));
  const dur = workDays(start, finish) ?? 0;
  // Duration-weighted % complete, as MS Project rolls it up to the project summary task.
  const od = acts.reduce((t, a) => t + (a.originalDurationHours ?? 0), 0);
  const done = acts.reduce((t, a) => t + ((a.originalDurationHours ?? 0) * a.percentComplete) / 100, 0);
  const pct = od > 0 ? Math.round((done / od) * 100) : 0;
  const asg = s.assignments ?? [];
  const labour = new Set((s.resources ?? []).filter((r) => r.type !== "material").map((r) => r.id));
  const w = asg.filter((x) => labour.has(x.resourceId));
  const work = { current: round(w.reduce((t, x) => t + x.actualQty + x.remainingQty, 0)), baseline: round(w.reduce((t, x) => t + x.budgetQty, 0)), actual: round(w.reduce((t, x) => t + x.actualQty, 0)), remaining: round(w.reduce((t, x) => t + x.remainingQty, 0)) };
  const cost = { current: round(asg.reduce((t, x) => t + x.actualCost + x.remainingCost, 0)), baseline: round(asg.reduce((t, x) => t + x.budgetCost, 0)), actual: round(asg.reduce((t, x) => t + x.actualCost, 0)), remaining: round(asg.reduce((t, x) => t + x.remainingCost, 0)) };
  return {
    current: { start, finish },
    baseline: { start: bs, finish: bf },
    actual: { start: as, finish: af },
    variance: { startDays: workDays(bs, start), finishDays: workDays(bf, finish) },
    durationDays: { current: dur, baseline: workDays(bs, bf), actual: round((dur * pct) / 100, 1), remaining: round((dur * (100 - pct)) / 100, 1) },
    work,
    cost,
    percentComplete: pct,
    workPercentComplete: work.current > 0 ? Math.round((work.actual / work.current) * 100) : 0,
  };
}

/** Tasks that finish after their deadline (the red deadline indicator). */
export const missedDeadline = (a: Activity) => a.deadline != null && a.finish !== null && a.finish > a.deadline + 60_000;

/** Hours per day of the project calendar. */
export const projectHpd = (s: Schedule) => ((s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0])?.hoursPerDay || 8;

// ---------------------------------------------------------------- cell editing

const MONTHS3 = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Dates as typed in MS Project: "Mon 02/03/26", "02/03/2026" (day first), "2026-03-02", "2 Mar 26". UTC midnight; null when unreadable. */
export function parseMspDateText(text: string): number | null {
  const t = text.trim().replace(/^[a-z]{3,9}\.?\s+/i, "");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    const d = Date.UTC(y, +m[2] - 1, +m[1]);
    return new Date(d).getUTCDate() === +m[1] ? d : null;
  }
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{2}|\d{4})$/i.exec(t);
  if (m) {
    const mo = MONTHS3.indexOf(m[2].toLowerCase());
    if (mo < 0) return null;
    return Date.UTC(m[3].length === 2 ? 2000 + +m[3] : +m[3], mo, +m[1]);
  }
  return null;
}

/** "Electrician[50%], Crane" → names with units (1 = 100%). */
export function parseResourceNames(text: string): { name: string; units: number }[] {
  return text
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = /^(.*?)\s*\[\s*(\d+(?:\.\d+)?)\s*%?\s*\]$/.exec(p);
      return m ? { name: m[1].trim(), units: Number(m[2]) / 100 } : { name: p, units: 1 };
    });
}

export type MspCell = "name" | "duration" | "start" | "finish" | "pred" | "res" | "pct" | "mode" | "actualStart" | "actualFinish" | "deadline" | "priority" | "notes" | "remDuration";

export interface CellCtx {
  hpd: number;
  /** Row number shown in the ID column → row id. */
  rowIds: Map<number, string>;
  /** Working-time helpers on the task's calendar. */
  snap: (a: Activity, t: number) => number;
  finishFor: (a: Activity, start: number, hours: number) => number;
  hoursBetween: (a: Activity, from: number, to: number) => number;
  /** End of the working day that contains (or precedes) the given date. */
  endOfDay: (a: Activity, day: number) => number;
}

/** Cell-edit context on the schedule's calendars. */
export function cellCtx(s: Schedule, rowIds: Map<number, string>): CellCtx {
  const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
  const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0] || standardCalendar();
  const cal = (a: Activity) => (a.calendarId && cals.get(a.calendarId)) || def;
  return {
    hpd: def.hoursPerDay || 8,
    rowIds,
    snap: (a, t) => nextWorkStart(cal(a), t),
    finishFor: (a, t, h) => addWorkHours(cal(a), t, h),
    hoursBetween: (a, x, y) => workHoursBetween(cal(a), x, y),
    endOfDay: (a, day) => prevWorkEnd(cal(a), Date.UTC(new Date(day).getUTCFullYear(), new Date(day).getUTCMonth(), new Date(day).getUTCDate() + 1)),
  };
}

const ms = (a: Activity) => a.type === "milestone" || a.type === "finish-milestone";

/**
 * Apply what was typed into a sheet cell, the way MS Project reacts:
 * typing a Start on an auto task sets a Start No Earlier Than constraint,
 * a Finish changes the duration, a 0 duration makes a milestone. Throws
 * with a message for text it cannot read.
 */
export function editTaskCell(s: Schedule, id: string, cell: MspCell, text: string, c: CellCtx): Schedule {
  const a0 = s.activities.find((x) => x.id === id);
  if (!a0) return s;
  const put = (patch: Partial<Activity>): Schedule => ({ ...s, activities: s.activities.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const date = (v: string, clear = false) => {
    if (clear && !v.trim()) return null;
    const d = parseMspDateText(v);
    if (d === null) throw new Error(`"${v}" is not a date. Type it as dd/mm/yy.`);
    return d;
  };
  const manual = a0.taskMode === "manual";
  switch (cell) {
    case "name":
      return put({ name: text.trim() || a0.name });
    case "duration":
    case "remDuration": {
      const d = parseMspDuration(text, c.hpd);
      if (!d) throw new Error(`"${text}" is not a duration. Use e.g. 5d, 2w or 16h.`);
      if (cell === "remDuration") return put({ remainingDurationHours: d.hours });
      const toMs = d.hours === 0 && !ms(a0);
      const fromMs = d.hours > 0 && ms(a0);
      const type = toMs ? "milestone" : fromMs ? "task" : a0.type;
      const done = a0.status === "not-started" ? 0 : Math.max(0, (a0.originalDurationHours ?? 0) - (a0.remainingDurationHours ?? 0));
      const start = a0.actualStart ?? a0.start;
      return put({
        type,
        originalDurationHours: d.hours,
        remainingDurationHours: Math.max(0, d.hours - done),
        estimated: d.estimated,
        ...(start !== null ? { finish: c.finishFor(a0, start, d.hours) } : {}),
      });
    }
    case "start": {
      const t = c.snap(a0, date(text)!);
      const dur = ms(a0) ? 0 : (a0.originalDurationHours ?? 0);
      const finish = c.finishFor(a0, t, dur);
      if (manual || a0.status !== "not-started") return put(a0.status !== "not-started" ? { actualStart: t, start: t } : { start: t, finish });
      return put({ start: t, finish, constraint: { type: "start-on-or-after", date: t } });
    }
    case "finish": {
      const day = date(text)!;
      const start = a0.actualStart ?? a0.start;
      if (start === null) throw new Error("Give the task a start first.");
      if (ms(a0)) return put({ start: c.endOfDay(a0, day), finish: c.endOfDay(a0, day) });
      // A finish typed as a date means the end of that working day.
      const end = c.endOfDay(a0, day);
      if (end <= start) throw new Error("The finish must be after the start.");
      const hours = Math.round(c.hoursBetween(a0, start, end) * 100) / 100;
      const done = a0.status === "not-started" ? 0 : Math.max(0, (a0.originalDurationHours ?? 0) - (a0.remainingDurationHours ?? 0));
      return put({ finish: end, originalDurationHours: hours, remainingDurationHours: Math.max(0, hours - done), estimated: false });
    }
    case "pred":
      return setPredecessorsFromText(s, id, text, c.rowIds, c.hpd);
    case "res":
      return setResourceNames(s, id, text, c.hpd);
    case "pct": {
      const p = Number(text.replace("%", "").trim());
      if (!Number.isFinite(p) || p < 0 || p > 100) throw new Error("% Complete is a number from 0 to 100.");
      const start = a0.actualStart ?? (p > 0 ? a0.start : null);
      return put({
        percentComplete: p,
        status: p >= 100 ? "complete" : p > 0 ? "in-progress" : "not-started",
        actualStart: p > 0 ? start : null,
        actualFinish: p >= 100 ? (a0.actualFinish ?? a0.finish) : null,
        remainingDurationHours: Math.round((a0.originalDurationHours ?? 0) * (1 - p / 100) * 100) / 100,
      });
    }
    case "mode":
      return put({ taskMode: /man/i.test(text) ? "manual" : "auto" });
    case "actualStart": {
      const t = date(text, true);
      if (t === null) return put({ actualStart: null, status: "not-started", percentComplete: 0, actualFinish: null });
      return put({ actualStart: t, start: t, status: a0.status === "not-started" ? "in-progress" : a0.status });
    }
    case "actualFinish": {
      const t = date(text, true);
      if (t === null) return put({ actualFinish: null, status: a0.actualStart !== null ? "in-progress" : "not-started", percentComplete: Math.min(a0.percentComplete, 99) });
      return put({ actualFinish: t, finish: t, actualStart: a0.actualStart ?? a0.start, status: "complete", percentComplete: 100, remainingDurationHours: 0 });
    }
    case "deadline":
      return put({ deadline: date(text, true) });
    case "priority": {
      const p = Math.round(Number(text));
      if (!Number.isFinite(p) || p < 0 || p > 1000) throw new Error("Priority is a whole number from 0 to 1000.");
      return put({ priority: p });
    }
    case "notes":
      return put({ notes: text });
  }
}

/** Resource Names cell: assign by name (creating resources MS Project would add), keep existing assignments, drop the rest. */
export function setResourceNames(s: Schedule, activityId: string, text: string, hpd: number): Schedule {
  const a = s.activities.find((x) => x.id === activityId);
  if (!a) return s;
  const wanted = parseResourceNames(text);
  const resources = [...(s.resources ?? [])];
  const keep = (s.assignments ?? []).filter((x) => x.activityId !== activityId);
  const mine = (s.assignments ?? []).filter((x) => x.activityId === activityId);
  const hours = ms(a) ? 0 : (a.originalDurationHours ?? hpd);
  const out = [...keep];
  for (const w of wanted) {
    let r = resources.find((x) => x.name.toLowerCase() === w.name.toLowerCase() || x.code.toLowerCase() === w.name.toLowerCase());
    if (!r) {
      r = { id: uid("res"), code: w.name.slice(0, 20), name: w.name, type: "labor", unit: "h", pricePerUnit: 0 };
      resources.push(r);
    }
    const prev = mine.find((x) => x.resourceId === r!.id);
    const qty = r.type === "material" ? (prev?.budgetQty ?? w.units) : Math.round(w.units * hours * 100) / 100;
    const price = r.pricePerUnit;
    if (prev) {
      const sameUnits = prev.units === undefined ? w.units === 1 : Math.abs(prev.units - w.units) < 1e-9;
      out.push(sameUnits ? prev : { ...prev, units: w.units, budgetQty: qty, remainingQty: Math.max(0, qty - prev.actualQty), budgetCost: qty * price, remainingCost: Math.max(0, qty - prev.actualQty) * price });
    } else out.push({ id: uid("asg"), activityId, resourceId: r.id, units: w.units, budgetQty: qty, actualQty: 0, remainingQty: qty, budgetCost: qty * price, actualCost: 0, remainingCost: qty * price });
  }
  return { ...s, resources, assignments: out };
}

/** A new task as MS Project adds it in the blank row: 1 day?, estimated, at the project start, in the given summary. */
export function newMspTask(s: Schedule, name: string, wbsId: string | null, hpd: number, snapStart: (t: number) => number): Activity {
  const used = new Set(s.activities.map((a) => a.code));
  let n = s.activities.length + 1;
  while (used.has(`T${n}`)) n++;
  const start = snapStart(s.plannedStart ?? s.dataDate ?? Date.now());
  const manual = s.newTaskMode === "manual";
  return {
    id: uid("t"),
    code: `T${n}`,
    name,
    wbsId,
    type: "task",
    status: "not-started",
    percentComplete: 0,
    start,
    finish: start,
    baselineStart: null,
    baselineFinish: null,
    actualStart: null,
    actualFinish: null,
    totalFloatHours: null,
    originalDurationHours: hpd,
    remainingDurationHours: hpd,
    critical: false,
    calendarId: null,
    codes: {},
    estimated: true,
    ...(manual ? { taskMode: "manual" as const } : {}),
  };
}

// ---------------------------------------------------------------- timephased work

const DAY_MS = 86_400_000;
const dayStartOf = (t: number) => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate());

/** Working hours of each day an activity spans, on its calendar (between its start and finish). */
function activityDays(a: Activity, calOf: (a: Activity) => import("./types").Calendar): [number, number][] {
  if (a.start === null || a.finish === null) return [];
  const out: [number, number][] = [];
  const cal = calOf(a);
  for (let d = dayStartOf(a.start); d <= a.finish && out.length < 3700; d += DAY_MS) {
    const from = Math.max(a.start, d);
    const to = Math.min(a.finish, d + DAY_MS);
    if (to <= from) continue;
    const h = workHoursBetween(cal, from, to);
    if (h > 0) out.push([d, h]);
  }
  // A milestone or a zero-length task still books its work on its day.
  if (!out.length) out.push([dayStartOf(a.start), 0]);
  return out;
}

/**
 * Work per assignment per day, spread flat over the working hours of the
 * activity (MS Project's Flat work contour). Labour in hours, material in its units.
 */
export function dailyWork(s: Schedule): Map<string, Map<number, number>> {
  const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
  const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0] || standardCalendar();
  const calOf = (a: Activity) => (a.calendarId && cals.get(a.calendarId)) || def;
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  const daysOf = new Map<string, [number, number][]>();
  const out = new Map<string, Map<number, number>>();
  for (const x of s.assignments ?? []) {
    const a = acts.get(x.activityId);
    if (!a || a.inactive) continue;
    let days = daysOf.get(a.id);
    if (!days) daysOf.set(a.id, (days = activityDays(a, calOf)));
    const total = days.reduce((t, [, h]) => t + h, 0);
    const qty = x.actualQty + x.remainingQty || x.budgetQty;
    const m = new Map<number, number>();
    for (const [d, h] of days) m.set(d, total > 0 ? (qty * h) / total : qty / days.length);
    out.set(x.id, m);
  }
  return out;
}

/** Days on which a labour resource is booked beyond its maximum units (in hours per day on the project calendar). */
export function overallocations(s: Schedule, daily = dailyWork(s)): Map<string, number[]> {
  const cal = (s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0];
  const hpd = cal?.hoursPerDay || 8;
  const res = new Map((s.resources ?? []).filter((r) => r.type !== "material").map((r) => [r.id, r]));
  const load = new Map<string, Map<number, number>>();
  for (const x of s.assignments ?? []) {
    if (!res.has(x.resourceId)) continue;
    const m = load.get(x.resourceId) ?? new Map<number, number>();
    for (const [d, h] of daily.get(x.id) ?? []) m.set(d, (m.get(d) ?? 0) + h);
    load.set(x.resourceId, m);
  }
  const out = new Map<string, number[]>();
  for (const [rid, m] of load) {
    const max = (res.get(rid)!.maxUnitsPerHour ?? 1) * hpd;
    const days = [...m].filter(([, h]) => h > max + 0.01).map(([d]) => d).sort((p, q) => p - q);
    if (days.length) out.set(rid, days);
  }
  return out;
}

// ---------------------------------------------------------------- recurring tasks

export interface RecurrenceDef {
  name: string;
  hours: number;
  pattern: "daily" | "weekly" | "monthly";
  /** Every n days / weeks / months. */
  every: number;
  /** Weekly: days of the week (0 = Sunday). */
  weekdays?: number[];
  /** Monthly: day of the month. */
  dayOfMonth?: number;
  start: number;
  /** End after this many occurrences, or on this date. */
  count?: number;
  end?: number;
  /** Summary the recurring task goes under. */
  parentWbsId: string | null;
}

/**
 * Insert Recurring Task: a summary task holding one task per occurrence,
 * each held to its date by a Start No Earlier Than constraint, as MS Project
 * does. Occurrences on nonworking days move to the next working time.
 */
export function insertRecurring(s: Schedule, d: RecurrenceDef): { schedule: Schedule; wbsId: string; added: number } {
  const c = cellCtx(s, new Map());
  const probe = { calendarId: null } as Activity;
  const dates: number[] = [];
  const limit = Math.min(d.count ?? 500, 500);
  const endBy = d.end ?? Infinity;
  const day0 = Date.UTC(new Date(d.start).getUTCFullYear(), new Date(d.start).getUTCMonth(), new Date(d.start).getUTCDate());
  const every = Math.max(1, Math.round(d.every));
  if (d.pattern === "daily") for (let t = day0; dates.length < limit && t <= endBy; t += every * DAY_MS) dates.push(t);
  else if (d.pattern === "weekly") {
    const days = d.weekdays?.length ? [...d.weekdays].sort() : [new Date(day0).getUTCDay()];
    const week0 = day0 - new Date(day0).getUTCDay() * DAY_MS;
    for (let w = week0; dates.length < limit && w <= endBy; w += every * 7 * DAY_MS) for (const k of days) if (w + k * DAY_MS >= day0 && w + k * DAY_MS <= endBy && dates.length < limit) dates.push(w + k * DAY_MS);
  } else {
    const dom = d.dayOfMonth ?? new Date(day0).getUTCDate();
    for (let m = 0; dates.length < limit; m += every) {
      const y = new Date(day0).getUTCFullYear();
      const mo = new Date(day0).getUTCMonth() + m;
      const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
      const t = Date.UTC(y, mo, Math.min(dom, last));
      if (t > endBy) break;
      if (t >= day0) dates.push(t);
    }
  }
  const wbsId = uid("wbs");
  const seq = Math.max(0, ...s.wbs.filter((w) => w.parentId === d.parentWbsId).map((w) => w.seq + 1));
  const used = new Set(s.activities.map((a) => a.code));
  let n = s.activities.length + 1;
  const acts: Activity[] = dates.map((t, i) => {
    while (used.has(`T${n}`)) n++;
    used.add(`T${n}`);
    const start = c.snap(probe, t + 8 * 3_600_000);
    const ms = d.hours === 0;
    return {
      id: uid("t"),
      code: `T${n}`,
      name: `${d.name} ${i + 1}`,
      wbsId,
      type: ms ? "milestone" : "task",
      status: "not-started",
      percentComplete: 0,
      start,
      finish: ms ? start : c.finishFor(probe, start, d.hours),
      baselineStart: null,
      baselineFinish: null,
      actualStart: null,
      actualFinish: null,
      totalFloatHours: null,
      originalDurationHours: d.hours,
      remainingDurationHours: d.hours,
      critical: false,
      calendarId: null,
      codes: {},
      constraint: { type: "start-on-or-after", date: start },
    };
  });
  return {
    schedule: { ...s, wbs: [...s.wbs, { id: wbsId, parentId: d.parentWbsId, code: `R${s.wbs.length + 1}`, name: d.name, seq }], activities: [...s.activities, ...acts] },
    wbsId,
    added: acts.length,
  };
}

// ---------------------------------------------------------------- task path

/** Format › Task Path: predecessors, driving predecessors and successors of a task, all the way back or forward. */
export function taskPath(s: Schedule, id: string): { predecessors: Set<string>; driving: Set<string>; successors: Set<string> } {
  const preds = new Map<string, typeof s.relationships>();
  const succs = new Map<string, typeof s.relationships>();
  for (const r of s.relationships) {
    (preds.get(r.successorId) ?? preds.set(r.successorId, []).get(r.successorId)!).push(r);
    (succs.get(r.predecessorId) ?? succs.set(r.predecessorId, []).get(r.predecessorId)!).push(r);
  }
  const walk = (start: string, next: (x: string) => string[]) => {
    const seen = new Set<string>();
    const stack = [...next(start)];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x) || x === start) continue;
      seen.add(x);
      stack.push(...next(x));
    }
    return seen;
  };
  return {
    predecessors: walk(id, (x) => (preds.get(x) ?? []).map((r) => r.predecessorId)),
    driving: walk(id, (x) => (preds.get(x) ?? []).filter((r) => r.driving).map((r) => r.predecessorId)),
    successors: walk(id, (x) => (succs.get(x) ?? []).map((r) => r.successorId)),
  };
}
