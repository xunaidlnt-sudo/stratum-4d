// MS Project behaviour on top of the Stratum schedule model:
//  - duration text ("5d", "2w", "16h", "3 days?") and predecessor text ("3FS+2d,5SS-1w,7FF+50%");
//  - outline editing (Indent, Outdent, Insert Summary Task). Stratum keeps
//    summary tasks as WBS nodes, so indenting under a plain task turns that
//    task into a summary, as MS Project does;
//  - Project Statistics and the Task Type mapping to P6 duration types.

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
