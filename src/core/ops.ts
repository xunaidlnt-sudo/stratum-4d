// Schedule operations from P6's Edit and Tools menus: delete, copy/paste,
// renumber, dissolve, link, Update Progress, Global Change, Maintain
// Baselines, Store Period Performance, Recalculate Assignment Costs and
// Check Schedule. Every function returns a new schedule and leaves its input
// untouched, so the caller can keep the old one for undo.

import { addWorkHours, nextWorkStart, standardCalendar, workHoursBetween } from "./calendar";
import { fieldCtx, fieldsFor, filterMatches, type FieldCtx, type FieldDef, type FilterDef } from "./fields";
import type { Activity, Assignment, Calendar, Relationship, RelationshipType, Schedule, StoredBaseline } from "./types";

const DAY = 86_400_000;
export const uid = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function calOf(s: Schedule) {
  const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
  const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0] || standardCalendar();
  return (a: Activity): Calendar => (a.calendarId && cals.get(a.calendarId)) || def;
}

// ---------------------------------------------------------------- delete / copy / paste

export function deleteActivities(s: Schedule, ids: Iterable<string>): Schedule {
  const del = new Set(ids);
  if (!del.size) return s;
  return {
    ...s,
    activities: s.activities.filter((a) => !del.has(a.id)),
    relationships: s.relationships.filter((r) => !del.has(r.predecessorId) && !del.has(r.successorId)),
    assignments: (s.assignments ?? []).filter((x) => !del.has(x.activityId)),
  };
}

export interface Clip {
  activities: Activity[];
  /** Relationships between the copied activities. */
  relationships: Relationship[];
  assignments: Assignment[];
}

export function copyActivities(s: Schedule, ids: Iterable<string>): Clip {
  const set = new Set(ids);
  return {
    activities: s.activities.filter((a) => set.has(a.id)).map((a) => structuredClone(a)),
    relationships: s.relationships.filter((r) => set.has(r.predecessorId) && set.has(r.successorId)).map((r) => ({ ...r })),
    assignments: (s.assignments ?? []).filter((x) => set.has(x.activityId)).map((x) => ({ ...x })),
  };
}

/** The next free Activity ID after `base`, keeping its prefix and number width ("A1030" -> "A1040"). */
export function nextCode(used: Set<string>, base: string | undefined, step = 10): string {
  const m = /^(.*?)(\d+)$/.exec(base ?? "");
  const prefix = m ? m[1] : base ? `${base}-` : "A";
  const width = m ? m[2].length : 4;
  let n = m ? Number(m[2]) + step : step;
  for (let guard = 0; guard < 1_000_000; guard++, n += step) {
    const code = `${prefix}${String(n).padStart(width, "0")}`;
    if (!used.has(code)) return code;
  }
  return `${prefix}${Date.now()}`;
}

/**
 * Paste copied activities into a WBS. Copies get new Activity IDs (the
 * original ID with the next free number), keep their internal links and,
 * when asked, their resource assignments. Progress is cleared, as in P6.
 */
export function pasteActivities(s: Schedule, clip: Clip, opts: { wbsId?: string | null; keepAssignments?: boolean; keepProgress?: boolean } = {}): { schedule: Schedule; ids: string[] } {
  const used = new Set(s.activities.map((a) => a.code));
  const idMap = new Map<string, string>();
  const added: Activity[] = clip.activities.map((a) => {
    const id = uid("act");
    idMap.set(a.id, id);
    const code = nextCode(used, a.code);
    used.add(code);
    const base: Activity = { ...structuredClone(a), id, code, wbsId: opts.wbsId === undefined ? a.wbsId : opts.wbsId };
    if (opts.keepProgress) return base;
    return {
      ...base,
      status: "not-started",
      percentComplete: 0,
      actualStart: null,
      actualFinish: null,
      remainingDurationHours: base.originalDurationHours,
      start: a.status === "not-started" ? a.start : (a.baselineStart ?? a.start),
    };
  });
  const rels = clip.relationships.map((r) => ({ ...r, id: uid("rel"), predecessorId: idMap.get(r.predecessorId)!, successorId: idMap.get(r.successorId)! }));
  const asg = opts.keepAssignments === false ? [] : clip.assignments.map((x) => ({ ...x, id: uid("asg"), activityId: idMap.get(x.activityId)!, actualQty: 0, actualCost: 0, remainingQty: x.budgetQty, remainingCost: x.budgetCost }));
  return {
    schedule: { ...s, activities: [...s.activities, ...added], relationships: [...s.relationships, ...rels], assignments: [...(s.assignments ?? []), ...asg] },
    ids: added.map((a) => a.id),
  };
}

// ---------------------------------------------------------------- renumber / dissolve / link

export interface RenumberOptions {
  prefix: string;
  start: number;
  increment: number;
  /** Zero-pad the number to this many digits (0 = no padding). */
  width?: number;
}

/** Give the activities new IDs in the order given (P6 Renumber Activity IDs). Skips IDs used by other activities. */
export function renumber(s: Schedule, idsInOrder: string[], o: RenumberOptions): { schedule: Schedule; changed: number } {
  const target = new Set(idsInOrder);
  const used = new Set(s.activities.filter((a) => !target.has(a.id)).map((a) => a.code));
  const codeOf = new Map<string, string>();
  let n = o.start;
  for (const id of idsInOrder) {
    let code: string;
    do {
      code = `${o.prefix}${o.width ? String(n).padStart(o.width, "0") : n}`;
      n += Math.max(1, o.increment);
    } while (used.has(code));
    used.add(code);
    codeOf.set(id, code);
  }
  let changed = 0;
  const activities = s.activities.map((a) => {
    const c = codeOf.get(a.id);
    if (c === undefined || c === a.code) return a;
    changed++;
    return { ...a, code: c };
  });
  return { schedule: { ...s, activities }, changed };
}

/**
 * Remove an activity and tie its predecessors straight to its successors
 * (P6 Dissolve). The new link keeps the predecessor's driving end and the
 * successor's driven end, with the two lags and the dissolved activity's
 * duration where it sat between them, so the logic is preserved.
 */
export function dissolve(s: Schedule, ids: Iterable<string>): { schedule: Schedule; added: number } {
  let cur = s;
  let added = 0;
  for (const id of ids) {
    const a = cur.activities.find((x) => x.id === id);
    if (!a) continue;
    const ins = cur.relationships.filter((r) => r.successorId === id);
    const outs = cur.relationships.filter((r) => r.predecessorId === id);
    const dur = a.remainingDurationHours ?? a.originalDurationHours ?? 0;
    const exist = new Set(cur.relationships.map((r) => `${r.predecessorId}>${r.successorId}`));
    const extra: Relationship[] = [];
    for (const i of ins) {
      for (const o of outs) {
        if (i.predecessorId === o.successorId) continue;
        const key = `${i.predecessorId}>${o.successorId}`;
        if (exist.has(key)) continue;
        exist.add(key);
        const type = `${i.type[0]}${o.type[1]}` as RelationshipType;
        // The path ran through the activity from its start (xS in) to its finish (Fx out): carry its duration as lag.
        const through = i.type[1] === "S" && o.type[0] === "F" ? dur : i.type[1] === "F" && o.type[0] === "S" ? -dur : 0;
        extra.push({ id: uid("rel"), predecessorId: i.predecessorId, successorId: o.successorId, type, lagHours: i.lagHours + o.lagHours + Math.max(0, through) });
      }
    }
    added += extra.length;
    cur = deleteActivities({ ...cur, relationships: [...cur.relationships, ...extra] }, [id]);
  }
  return { schedule: cur, added };
}

/** Chain the activities in the order given with one relationship type (P6 Link Activities). */
export function linkActivities(s: Schedule, idsInOrder: string[], type: RelationshipType = "FS", lagHours = 0): { schedule: Schedule; added: number } {
  const exist = new Set(s.relationships.map((r) => `${r.predecessorId}>${r.successorId}`));
  const extra: Relationship[] = [];
  for (let i = 1; i < idsInOrder.length; i++) {
    const p = idsInOrder[i - 1];
    const q = idsInOrder[i];
    if (p === q || exist.has(`${p}>${q}`)) continue;
    exist.add(`${p}>${q}`);
    extra.push({ id: uid("rel"), predecessorId: p, successorId: q, type, lagHours });
  }
  return { schedule: extra.length ? { ...s, relationships: [...s.relationships, ...extra] } : s, added: extra.length };
}

/** Remove every relationship between the given activities. */
export function unlinkActivities(s: Schedule, ids: Iterable<string>): { schedule: Schedule; removed: number } {
  const set = new Set(ids);
  const relationships = s.relationships.filter((r) => !(set.has(r.predecessorId) && set.has(r.successorId)));
  return { schedule: { ...s, relationships }, removed: s.relationships.length - relationships.length };
}

// ---------------------------------------------------------------- Update Progress

/**
 * P6 Update Progress: move the data date and record progress as if the
 * work went to plan. Activities planned to start before the new data date
 * get that actual start; those planned to finish before it get an actual
 * finish. Remaining duration becomes the work left after the new data date.
 */
export function updateProgress(s: Schedule, newDataDate: number, ids?: Iterable<string>): { schedule: Schedule; started: number; finished: number; progressed: number } {
  const only = ids ? new Set(ids) : null;
  const cal = calOf(s);
  let started = 0;
  let finished = 0;
  let progressed = 0;
  const activities = s.activities.map((a) => {
    if (only && !only.has(a.id)) return a;
    if (a.status === "complete" || a.type === "wbs-summary" || a.type === "loe") return a;
    if (a.start === null || a.finish === null || a.start >= newDataDate) return a;
    const c = cal(a);
    const actualStart = a.actualStart ?? a.start;
    if (a.status === "not-started") started++;
    if (a.finish <= newDataDate) {
      finished++;
      return { ...a, status: "complete" as const, actualStart, actualFinish: a.finish, percentComplete: 100, remainingDurationHours: 0, start: actualStart };
    }
    progressed++;
    const remaining = workHoursBetween(c, Math.max(newDataDate, a.start), a.finish);
    const od = a.originalDurationHours ?? remaining;
    const pct = od > 0 ? Math.round(Math.min(99, Math.max(0, ((od - remaining) / od) * 100)) * 10) / 10 : 0;
    return { ...a, status: "in-progress" as const, actualStart, start: actualStart, remainingDurationHours: remaining, percentComplete: Math.max(a.percentComplete, pct) };
  });
  return { schedule: { ...s, activities, dataDate: newDataDate }, started, finished, progressed };
}

/** P6 Apply Actuals for one week, month or a given date: same as Update Progress but for every activity. */
export const applyActuals = (s: Schedule, newDataDate: number) => updateProgress(s, newDataDate);

// ---------------------------------------------------------------- Global Change

export type ChangeOp = "set" | "add" | "subtract" | "multiply" | "divide" | "append" | "prepend";

export interface ChangeRule {
  field: string;
  op: ChangeOp;
  /** Typed value; for durations in days, for dates "2026-03-31" or "31-Mar-26". */
  value: string;
  /** Use another field's value as the operand instead of `value`. */
  fromField?: string;
}

export interface GlobalChangeDef {
  id: string;
  name: string;
  /** Which activities to change; empty rules = all in scope. */
  when: FilterDef;
  then: ChangeRule[];
  else?: ChangeRule[];
}

export interface ChangePreview {
  activityId: string;
  code: string;
  field: string;
  label: string;
  before: string;
  after: string;
}

function parseDate(v: string): number | null {
  const t = Date.parse(v.length <= 10 ? `${v}T00:00:00Z` : v);
  if (Number.isFinite(t)) return t;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(v.trim());
  if (!m) return null;
  const mi = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[2].toLowerCase());
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return mi < 0 ? null : Date.UTC(y, mi, Number(m[1]));
}

function applyRule(r: ChangeRule, f: FieldDef, a: Activity, c: FieldCtx, fields: Map<string, FieldDef>): Partial<Activity> | null {
  if (!f.set) return null;
  const cur = f.get(a, c);
  const operand: string | number | boolean | null = r.fromField ? fields.get(r.fromField)?.get(a, c) ?? null : r.value;
  if (f.type === "date") {
    const base = typeof cur === "number" ? cur : null;
    if (r.op === "set") return f.set(a, typeof operand === "number" ? operand : operand ? parseDate(String(operand)) : null, c);
    // Add/subtract days to a date.
    const n = Number(operand);
    if (base === null || !Number.isFinite(n)) return null;
    return f.set(a, base + (r.op === "subtract" ? -n : n) * DAY, c);
  }
  if (f.type === "duration" || f.type === "number" || f.type === "percent") {
    const base = typeof cur === "number" ? cur : 0;
    const n = Number(operand);
    if (!Number.isFinite(n)) return r.op === "set" && (operand === "" || operand === null) ? f.set(a, null, c) : null;
    const v = r.op === "add" ? base + n : r.op === "subtract" ? base - n : r.op === "multiply" ? base * n : r.op === "divide" ? (n === 0 ? base : base / n) : n;
    return f.set(a, Math.round(v * 1000) / 1000, c);
  }
  const text = operand === null || operand === undefined ? "" : String(operand);
  const now = cur === null || cur === undefined ? "" : String(cur);
  return f.set(a, r.op === "append" ? now + text : r.op === "prepend" ? text + now : text, c);
}

/** Run a Global Change over the activities in scope. Returns the new schedule and a preview of every change. */
export function globalChange(s: Schedule, def: GlobalChangeDef, scope?: Iterable<string>): { schedule: Schedule; changes: ChangePreview[] } {
  const c = fieldCtx(s);
  const all = fieldsFor(s);
  const fields = new Map(all.map((f) => [f.id, f]));
  const only = scope ? new Set(scope) : null;
  const changes: ChangePreview[] = [];
  const activities = s.activities.map((a) => {
    if (only && !only.has(a.id)) return a;
    const rules = filterMatches(def.when, a, fields, c) ? def.then : def.else ?? [];
    if (!rules.length) return a;
    let next = a;
    for (const r of rules) {
      const f = fields.get(r.field);
      if (!f) continue;
      const patch = applyRule(r, f, next, c, fields);
      if (!patch) continue;
      const before = f.text ? f.text(next, c) : String(f.get(next, c) ?? "");
      const after = { ...next, ...patch };
      const now = f.text ? f.text(after, c) : String(f.get(after, c) ?? "");
      if (before === now && JSON.stringify(patch) === "{}") continue;
      next = after;
      changes.push({ activityId: a.id, code: a.code, field: f.id, label: f.label, before, after: now });
    }
    return next;
  });
  return { schedule: changes.length ? { ...s, activities } : s, changes };
}

/** Set one field on many activities to the first activity's value (P6 Fill Down). */
export function fillDown(s: Schedule, idsInOrder: string[], fieldId: string): { schedule: Schedule; changed: number } {
  if (idsInOrder.length < 2) return { schedule: s, changed: 0 };
  const c = fieldCtx(s);
  const f = fieldsFor(s).find((x) => x.id === fieldId);
  if (!f?.set) return { schedule: s, changed: 0 };
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const src = byId.get(idsInOrder[0]);
  if (!src) return { schedule: s, changed: 0 };
  const value = f.get(src, c);
  const rest = new Set(idsInOrder.slice(1));
  let changed = 0;
  const activities = s.activities.map((a) => {
    if (!rest.has(a.id)) return a;
    const patch = f.set!(a, value, c);
    if (!patch) return a;
    changed++;
    return { ...a, ...patch };
  });
  return { schedule: { ...s, activities }, changed };
}

// ---------------------------------------------------------------- baselines

/** Store the current plan as a baseline kept with the project (P6 Maintain Baselines > Add). */
export function storeBaseline(s: Schedule, name: string): { schedule: Schedule; baseline: StoredBaseline } {
  const dates: StoredBaseline["dates"] = {};
  for (const a of s.activities) dates[a.code] = [a.actualStart ?? a.start, a.actualFinish ?? a.finish];
  const baseline: StoredBaseline = { id: uid("bl"), name, createdAt: new Date().toISOString(), dataDate: s.dataDate, dates };
  return { schedule: { ...s, baselines: [...(s.baselines ?? []), baseline] }, baseline };
}

/** Make a stored baseline the project baseline (P6 Assign Baselines > Project Baseline). */
export function useStoredBaseline(s: Schedule, id: string): { schedule: Schedule; matched: number; missing: number } {
  const b = s.baselines?.find((x) => x.id === id);
  if (!b) return { schedule: s, matched: 0, missing: 0 };
  let matched = 0;
  let missing = 0;
  const activities = s.activities.map((a) => {
    const d = b.dates[a.code];
    if (!d) {
      missing++;
      return { ...a, baselineStart: null, baselineFinish: null };
    }
    matched++;
    return { ...a, baselineStart: d[0], baselineFinish: d[1] };
  });
  return {
    schedule: { ...s, activities, baselineInfo: { name: b.name, dataDate: b.dataDate, assignedAt: new Date().toISOString(), matched, missing } },
    matched,
    missing,
  };
}

/** Update a stored baseline from the current plan, keeping its name (P6 Maintain Baselines > Update). */
export function refreshBaseline(s: Schedule, id: string): Schedule {
  const dates: StoredBaseline["dates"] = {};
  for (const a of s.activities) dates[a.code] = [a.actualStart ?? a.start, a.actualFinish ?? a.finish];
  return { ...s, baselines: (s.baselines ?? []).map((b) => (b.id === id ? { ...b, dates, dataDate: s.dataDate, createdAt: new Date().toISOString() } : b)) };
}

export function deleteBaseline(s: Schedule, id: string): Schedule {
  return { ...s, baselines: (s.baselines ?? []).filter((b) => b.id !== id) };
}

export function renameBaseline(s: Schedule, id: string, name: string): Schedule {
  return { ...s, baselines: (s.baselines ?? []).map((b) => (b.id === id ? { ...b, name } : b)) };
}

// ---------------------------------------------------------------- costs and periods

/** Recalculate assignment costs from units and resource prices (P6 Recalculate Assignment Costs). */
export function recalcAssignmentCosts(s: Schedule): { schedule: Schedule; changed: number } {
  const price = new Map((s.resources ?? []).map((r) => [r.id, r.pricePerUnit]));
  let changed = 0;
  const assignments = (s.assignments ?? []).map((x) => {
    const p = price.get(x.resourceId);
    if (p === undefined) return x;
    const next = { ...x, budgetCost: x.budgetQty * p, actualCost: x.actualQty * p, remainingCost: x.remainingQty * p };
    if (next.budgetCost !== x.budgetCost || next.actualCost !== x.actualCost || next.remainingCost !== x.remainingCost) changed++;
    return next;
  });
  return { schedule: { ...s, assignments }, changed };
}

/** Snapshot actuals at the data date (P6 Store Period Performance). */
export function storePeriodPerformance(s: Schedule, name?: string): Schedule {
  const date = s.dataDate ?? Date.now();
  const actuals: Record<string, { pct: number; actualCost: number; actualUnits: number }> = {};
  const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
  for (const a of s.activities) actuals[a.id] = { pct: a.percentComplete, actualCost: 0, actualUnits: 0 };
  for (const x of s.assignments ?? []) {
    const t = actuals[x.activityId];
    if (!t) continue;
    t.actualCost += x.actualCost;
    if (res.get(x.resourceId)?.type === "labor") t.actualUnits += x.actualQty;
  }
  const d = new Date(date);
  const label = name ?? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return { ...s, periods: [...(s.periods ?? []).filter((p) => p.date !== date), { id: uid("per"), date, name: label, actuals }] };
}

// ---------------------------------------------------------------- Check Schedule

export interface CheckMetric {
  id: string;
  name: string;
  description: string;
  /** Count of failing activities (or the index for CPLI / BEI). */
  value: number;
  /** Share of the activities checked, 0–100; null for index metrics. */
  percent: number | null;
  threshold: string;
  pass: boolean;
  activityIds: string[];
}

/**
 * The 14-point schedule assessment from the DCMA, as P6's Check Schedule
 * reports it. Completed activities, LOE and WBS summaries are left out of
 * the logic checks, as the guidance says.
 */
export function checkSchedule(s: Schedule): { checked: number; metrics: CheckMetric[] } {
  const cal = calOf(s);
  const dd = s.dataDate;
  const hpdOf = (a: Activity) => cal(a).hoursPerDay || 8;
  const open = s.activities.filter((a) => a.status !== "complete" && a.type !== "loe" && a.type !== "wbs-summary");
  const n = open.length || 1;
  const openIds = new Set(open.map((a) => a.id));
  const hasPred = new Set<string>();
  const hasSucc = new Set<string>();
  for (const r of s.relationships) {
    hasPred.add(r.successorId);
    hasSucc.add(r.predecessorId);
  }
  const rels = s.relationships.filter((r) => openIds.has(r.predecessorId) || openIds.has(r.successorId));
  const relN = rels.length || 1;
  const pct = (k: number, of: number) => Math.round((k / of) * 1000) / 10;
  const metric = (id: string, name: string, description: string, ids: string[], of: number, limit: number, threshold: string): CheckMetric => ({
    id,
    name,
    description,
    value: ids.length,
    percent: pct(ids.length, of),
    threshold,
    pass: pct(ids.length, of) <= limit,
    activityIds: ids,
  });
  const isMs = (a: Activity) => a.type === "milestone" || a.type === "finish-milestone";

  const missingLogic = open.filter((a) => !(hasPred.has(a.id) && hasSucc.has(a.id))).map((a) => a.id);
  const leads = rels.filter((r) => r.lagHours < 0);
  const lags = rels.filter((r) => r.lagHours > 0);
  const nonFs = rels.filter((r) => r.type !== "FS");
  const hard = new Set(["start-on", "finish-on", "mandatory-start", "mandatory-finish", "start-on-or-before", "finish-on-or-before"]);
  const hardC = open.filter((a) => a.constraint && hard.has(a.constraint.type)).map((a) => a.id);
  const highFloat = open.filter((a) => a.totalFloatHours !== null && a.totalFloatHours / hpdOf(a) > 44).map((a) => a.id);
  const negFloat = open.filter((a) => a.totalFloatHours !== null && a.totalFloatHours < 0).map((a) => a.id);
  const highDur = open.filter((a) => !isMs(a) && (a.remainingDurationHours ?? a.originalDurationHours ?? 0) / hpdOf(a) > 44).map((a) => a.id);
  const invalid =
    dd === null
      ? []
      : s.activities
          .filter((a) => (a.actualStart !== null && a.actualStart > dd) || (a.actualFinish !== null && a.actualFinish > dd) || (a.status !== "complete" && a.finish !== null && a.finish < dd) || (a.status === "not-started" && a.start !== null && a.start < dd))
          .map((a) => a.id);
  const withRes = new Set((s.assignments ?? []).map((x) => x.activityId));
  const noRes = (s.resources?.length ? open.filter((a) => !isMs(a) && !withRes.has(a.id)) : []).map((a) => a.id);
  const blDue = dd === null ? [] : s.activities.filter((a) => a.baselineFinish !== null && a.baselineFinish <= dd && a.type !== "wbs-summary");
  const missed = blDue.filter((a) => a.status !== "complete" || (a.actualFinish !== null && a.baselineFinish !== null && a.actualFinish > a.baselineFinish + DAY / 2)).map((a) => a.id);

  // CPLI = (critical path length + total float of the finish) / critical path length.
  const finish = s.activities.reduce((m, a) => Math.max(m, a.finish ?? -Infinity), -Infinity);
  const minFloat = open.reduce((m, a) => (a.totalFloatHours === null ? m : Math.min(m, a.totalFloatHours)), Infinity);
  const remainingDays = dd !== null && Number.isFinite(finish) ? Math.max(1, (finish - dd) / DAY) : 1;
  const tfDays = Number.isFinite(minFloat) ? minFloat / ((s.calendars?.find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0])?.hoursPerDay || 8) : 0;
  const cpli = Math.round(((remainingDays + tfDays) / remainingDays) * 100) / 100;
  const bei = blDue.length ? Math.round((s.activities.filter((a) => a.status === "complete" && a.baselineFinish !== null && dd !== null && a.baselineFinish <= dd).length / blDue.length) * 100) / 100 : 1;
  const criticalOk = s.activities.some((a) => a.critical && a.status !== "complete");

  const metrics: CheckMetric[] = [
    metric("logic", "Missing Logic", "Open activities without a predecessor or a successor.", missingLogic, n, 5, "≤ 5%"),
    { ...metric("leads", "Leads", "Relationships with negative lag.", leads.map((r) => r.successorId), relN, 0, "0%"), pass: leads.length === 0 },
    metric("lags", "Lags", "Relationships with positive lag.", lags.map((r) => r.successorId), relN, 5, "≤ 5%"),
    { ...metric("relTypes", "Relationship Types", "Relationships that are not Finish-to-Start (at least 90% should be FS).", nonFs.map((r) => r.successorId), relN, 10, "≥ 90% FS") },
    metric("hardConstraints", "Hard Constraints", "Activities with constraints that stop logic driving the dates.", hardC, n, 5, "≤ 5%"),
    metric("highFloat", "High Float", "Activities with more than 44 working days of total float.", highFloat, n, 5, "≤ 5%"),
    { ...metric("negFloat", "Negative Float", "Activities with negative total float.", negFloat, n, 0, "0%"), pass: negFloat.length === 0 },
    metric("highDuration", "High Duration", "Activities with more than 44 working days remaining.", highDur, n, 5, "≤ 5%"),
    { ...metric("invalidDates", "Invalid Dates", "Actual dates after the data date, or forecast dates before it.", invalid, s.activities.length || 1, 0, "0%"), pass: invalid.length === 0 },
    metric("resources", "Resources", "Activities with duration but no resource or cost loading.", noRes, n, 100, "Report"),
    metric("missed", "Missed Activities", "Activities due by the baseline that finished late or are not finished.", missed, blDue.length || 1, 5, "≤ 5%"),
    { id: "criticalPath", name: "Critical Path Test", description: "A continuous critical path exists to the project finish.", value: criticalOk ? 1 : 0, percent: null, threshold: "Pass", pass: criticalOk, activityIds: [] },
    { id: "cpli", name: "CPLI", description: "Critical Path Length Index: (remaining length + total float) / remaining length.", value: cpli, percent: null, threshold: "≥ 0.95", pass: cpli >= 0.95, activityIds: [] },
    { id: "bei", name: "BEI", description: "Baseline Execution Index: activities finished / activities due by the baseline.", value: bei, percent: null, threshold: "≥ 0.95", pass: bei >= 0.95, activityIds: [] },
  ];
  return { checked: open.length, metrics };
}

/** Move a start to the next working moment on the activity's calendar. */
export function snapStart(s: Schedule, a: Activity, t: number): number {
  return nextWorkStart(calOf(s)(a), t);
}

/** Finish for a start plus a duration in hours on the activity's calendar. */
export function finishFor(s: Schedule, a: Activity, start: number, hours: number): number {
  return addWorkHours(calOf(s)(a), start, hours);
}

// ---------------------------------------------------------------- steps

/** Weighted % complete of an activity's steps (P6 physical % from steps). */
export function stepsPercent(steps: { weight: number; pct: number }[]): number {
  const w = steps.reduce((t, x) => t + Math.max(0, x.weight), 0);
  if (!w) return steps.length ? steps.reduce((t, x) => t + x.pct, 0) / steps.length : 0;
  return Math.round((steps.reduce((t, x) => t + Math.max(0, x.weight) * x.pct, 0) / w) * 10) / 10;
}
