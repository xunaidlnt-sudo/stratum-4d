// Resource levelling (P6 Level Resources, F10). After CPM, activities are
// placed one at a time in priority order; each starts at the earliest
// working day where its logic is met and every resource with a limit has
// room for it. Work already under way keeps its dates and is loaded first.
//
// Usage is counted per calendar day: an assignment's remaining units are
// spread evenly over the activity's remaining working hours, and a
// resource's capacity on a day is its max units per hour in force that day
// (rates over time) times the hours worked, or its shift's limits by period.

import { addWorkHours, nextWorkStart, standardCalendar, workHoursBetween } from "./calendar";
import { resourceDependentCalendars } from "./cpm";
import { maxUnitsAt, shiftCapacity } from "./resources";
import type { Activity, Calendar, LevelingOptions, Relationship, Resource, Schedule } from "./types";

const DAY = 86_400_000;

export const DEFAULT_LEVELING: LevelingOptions = { preserveFinish: false, levelWithinFloat: false, priority: "late-start", resourceIds: null };

export const LEVEL_PRIORITY_FIELDS: [string, string][] = [
  ["leveling-priority", "Activity Leveling Priority"],
  ["total-float", "Total Float"],
  ["late-start", "Late Start"],
  ["early-start", "Early Start"],
  ["late-finish", "Late Finish"],
  ["early-finish", "Early Finish"],
  ["original-duration", "Original Duration"],
  ["remaining-duration", "Remaining Duration"],
  ["project-priority", "Project Leveling Priority"],
  ["activity-id", "Activity ID"],
  ["msp-priority", "Priority (MS Project, higher first)"],
];

/** P6's default: Total Float ascending. */
export const DEFAULT_LEVEL_PRIORITIES = [{ field: "total-float" }];

/** Compare two activities by the levelling priorities (lower sorts first, i.e. is placed first). */
export function levelingComparator(o: Partial<LevelingOptions>, s: Schedule): (x: Activity, y: Activity) => number {
  const list = o.priorities?.length ? o.priorities : [{ field: o.priority ?? "late-start" }];
  const projPri = (a: Activity) => (a.projectId && s.projects?.find((p) => p.key === a.projectId)?.rest.strategicPriority) || s.strategicPriority || 500;
  const val = (a: Activity, f: string): number | string => {
    if (f.startsWith("code:")) return a.codes[f.slice(5)] ?? "\uffff";
    if (f.startsWith("udf:")) {
      const v = a.userFields?.[f.slice(4)] ?? "";
      return v !== "" && Number.isFinite(Number(v)) ? Number(v) : v || "\uffff";
    }
    switch (f) {
      case "total-float":
        return a.totalFloatHours ?? Infinity;
      case "late-start":
        return a.lateStart ?? a.start ?? 0;
      case "early-start":
        return a.start ?? 0;
      case "late-finish":
        return a.lateFinish ?? a.finish ?? 0;
      case "early-finish":
        return a.finish ?? 0;
      case "leveling-priority":
        return a.levelingPriority ?? 3;
      case "msp-priority":
        // MS Project priority 0-1000: higher goes first, so sort on its complement.
        return 1000 - (a.priority ?? 500);
      case "original-duration":
        return a.originalDurationHours ?? 0;
      case "remaining-duration":
        return a.remainingDurationHours ?? 0;
      case "project-priority":
        return projPri(a);
      default:
        return a.code;
    }
  };
  return (x, y) => {
    for (const p of list) {
      const a = val(x, p.field);
      const b = val(y, p.field);
      const d = typeof a === "number" && typeof b === "number" ? (a === b ? 0 : a < b ? -1 : 1) : String(a).localeCompare(String(b), undefined, { numeric: true });
      if (d) return p.desc ? -d : d;
    }
    return x.code.localeCompare(y.code, undefined, { numeric: true });
  };
}

export interface LevelResult {
  schedule: Schedule;
  delayed: number;
  /** Activities left overloaded (could not move within the allowed window). */
  overloaded: string[];
  projectFinish: number;
  warnings: string[];
}

export function levelResources(input: Schedule, options: Partial<LevelingOptions> = {}): LevelResult {
  const o = { ...DEFAULT_LEVELING, ...(input.levelingOptions ?? {}), ...options };
  const s: Schedule = { ...input, activities: input.activities.map((a) => ({ ...a, leveledDelayHours: null })) };
  const warnings: string[] = [];
  const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
  const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0] || standardCalendar();
  const rdCal = resourceDependentCalendars(s, cals);
  const calOf = (a: Activity): Calendar => rdCal.get(a.id) ?? ((a.calendarId && cals.get(a.calendarId)) || def);
  const dd = s.dataDate ?? Date.now();

  // Resources with a limit take part.
  const limits = new Map<string, number>();
  const resById = new Map<string, Resource>();
  const shifts = new Map((s.shifts ?? []).map((x) => [x.id, x]));
  for (const r of s.resources ?? []) {
    const hasLimit = (r.maxUnitsPerHour ?? 0) > 0 || (r.rates ?? []).some((x) => (x.maxUnitsPerHour ?? 0) > 0) || !!(r.shiftId && shifts.has(r.shiftId));
    if (r.type === "material" || !hasLimit) continue;
    if (o.resourceIds && !o.resourceIds.includes(r.id)) continue;
    limits.set(r.id, r.maxUnitsPerHour ?? 0);
    resById.set(r.id, r);
  }
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const projectFinish0 = s.activities.reduce((m, a) => Math.max(m, a.finish ?? -Infinity), -Infinity);
  if (!limits.size) return { schedule: s, delayed: 0, overloaded: [], projectFinish: projectFinish0, warnings: ["No resource has a max units per hour, so there is nothing to level. Set limits in the Resources window."] };

  // Demand: units per working hour per limited resource, for each activity.
  const demand = new Map<string, [string, number][]>();
  for (const x of s.assignments ?? []) {
    const lim = limits.get(x.resourceId);
    const a = byId.get(x.activityId);
    if (lim === undefined || !a || a.status === "complete") continue;
    const hours = Math.max(1e-6, a.remainingDurationHours ?? a.originalDurationHours ?? 0);
    if (hours <= 1e-6 || x.remainingQty <= 0) continue;
    (demand.get(a.id) ?? demand.set(a.id, []).get(a.id)!).push([x.resourceId, x.remainingQty / hours]);
  }

  // usage[resource][day] = units used that day; cap[resource][day] computed from the default calendar.
  const usage = new Map<string, Map<number, number>>([...limits.keys()].map((k) => [k, new Map()]));
  // Capacity on a day: the shift's units by period if the resource has one, else the max units in force that day.
  const capCache = new Map<string, number>();
  const capOn = (rid: string, day: number) => {
    const k = `${rid}|${day}`;
    const hit = capCache.get(k);
    if (hit !== undefined) return hit;
    const r = resById.get(rid)!;
    const sh = r.shiftId ? shifts.get(r.shiftId) : undefined;
    const rc = (r.calendarId && cals.get(r.calendarId)) || def;
    const v = sh ? shiftCapacity(sh, rc, day) : (maxUnitsAt(r, day) ?? 0) * workHoursBetween(rc, day, day + DAY);
    capCache.set(k, v);
    return v;
  };
  const spread = (a: Activity, start: number, finish: number, fn: (day: number, hours: number) => boolean | void) => {
    const cal = calOf(a);
    for (let day = Math.floor(start / DAY) * DAY; day < finish; day += DAY) {
      const h = workHoursBetween(cal, Math.max(start, day), Math.min(finish, day + DAY));
      if (h > 0 && fn(day, h) === false) return false;
    }
    return true;
  };
  /** An activity that alone needs more than a limit can never fit; P6 leaves it where logic puts it. */
  const tooBig = (a: Activity, start: number, finish: number) => {
    const dem = demand.get(a.id);
    if (!dem) return false;
    return !(spread(a, start, finish, (day, h) => {
      for (const [rid, rate] of dem) if (rate * h > capOn(rid, day) + 1e-6 && capOn(rid, day) > 0) return false;
    }) as boolean);
  };
  const fits = (a: Activity, start: number, finish: number) => {
    const dem = demand.get(a.id);
    if (!dem) return true;
    return spread(a, start, finish, (day, h) => {
      for (const [rid, rate] of dem) if ((usage.get(rid)!.get(day) ?? 0) + rate * h > capOn(rid, day) + 1e-6) return false;
    }) as boolean;
  };
  const book = (a: Activity, start: number, finish: number) => {
    const dem = demand.get(a.id);
    if (!dem) return;
    spread(a, start, finish, (day, h) => {
      for (const [rid, rate] of dem) usage.get(rid)!.set(day, (usage.get(rid)!.get(day) ?? 0) + rate * h);
    });
  };

  // Logic, for placing successors after their (possibly delayed) predecessors.
  const work = s.activities.filter((a) => a.type !== "loe" && a.type !== "wbs-summary");
  const ids = new Set(work.map((a) => a.id));
  const preds = new Map<string, Relationship[]>();
  const succs = new Map<string, Relationship[]>();
  const indeg = new Map(work.map((a) => [a.id, 0]));
  for (const r of s.relationships) {
    if (!ids.has(r.predecessorId) || !ids.has(r.successorId)) continue;
    (preds.get(r.successorId) ?? preds.set(r.successorId, []).get(r.successorId)!).push(r);
    (succs.get(r.predecessorId) ?? succs.set(r.predecessorId, []).get(r.predecessorId)!).push(r);
    indeg.set(r.successorId, indeg.get(r.successorId)! + 1);
  }

  const cmp = levelingComparator(o, s);
  const before = (x: Activity, y: Activity) => (x.start ?? 0) - (y.start ?? 0) || cmp(x, y);

  // Ready list kept sorted; small schedules make a heap unnecessary.
  const ready = work.filter((a) => indeg.get(a.id) === 0).sort(before);
  const placed = new Map<string, { start: number; finish: number }>();
  let delayed = 0;
  const overloaded: string[] = [];
  const limitEnd = o.preserveFinish ? projectFinish0 : Infinity;
  const horizon = (projectFinish0 > -Infinity ? projectFinish0 : dd) + 3 * 365 * DAY;

  while (ready.length) {
    const a = ready.shift()!;
    const cal = calOf(a);
    const dur = Math.max(0, a.status === "complete" ? 0 : a.remainingDurationHours ?? a.originalDurationHours ?? 0);
    let start = a.start ?? dd;
    let finish = a.finish ?? start;
    const fixed = a.status === "complete" || (a.actualStart !== null && a.status === "in-progress");
    if (!fixed) {
      // Earliest start from already placed predecessors.
      let bound = a.start ?? dd;
      for (const r of preds.get(a.id) ?? []) {
        const p = placed.get(r.predecessorId);
        const pa = byId.get(r.predecessorId)!;
        if (!p) continue;
        const pc = calOf(pa);
        if (r.type === "FS") bound = Math.max(bound, addWorkHours(pc, p.finish, r.lagHours));
        else if (r.type === "SS") bound = Math.max(bound, addWorkHours(pc, p.start, r.lagHours));
        else if (r.type === "FF") bound = Math.max(bound, addWorkHours(pc, p.finish, r.lagHours) - (finish - start));
        else bound = Math.max(bound, addWorkHours(pc, p.start, r.lagHours) - (finish - start));
      }
      const s0 = dur > 0 ? nextWorkStart(cal, bound) : bound;
      start = s0;
      finish = addWorkHours(cal, start, dur);
      const latest = o.levelWithinFloat && a.lateStart != null ? a.lateStart : Infinity;
      const alone = tooBig(a, start, finish);
      let ok = alone || fits(a, start, finish);
      while (!ok) {
        const next = nextWorkStart(cal, Math.floor(start / DAY) * DAY + DAY);
        const nf = addWorkHours(cal, next, dur);
        if (next > latest || nf > limitEnd || next > horizon) break;
        start = next;
        finish = nf;
        ok = fits(a, start, finish);
      }
      if (alone) overloaded.push(a.code);
      if (!ok) {
        // Could not fit within the window: keep the earliest logic-driven dates and report it.
        start = s0;
        finish = addWorkHours(cal, s0, dur);
        overloaded.push(a.code);
      }
      if (start > (a.start ?? start) + 1) {
        delayed++;
        a.leveledDelayHours = Math.round(workHoursBetween(cal, a.start ?? start, start) * 100) / 100;
      }
      a.start = start;
      a.finish = finish;
      if (a.lateFinish != null) a.totalFloatHours = Math.round((a.lateFinish >= finish ? workHoursBetween(cal, finish, a.lateFinish) : -workHoursBetween(cal, a.lateFinish, finish)) * 100) / 100;
      a.critical = (a.totalFloatHours ?? 1) <= 0;
    }
    if (a.status !== "complete") book(a, a.actualStart !== null && a.status === "in-progress" ? Math.max(dd, start) : start, finish);
    placed.set(a.id, { start, finish });
    for (const r of succs.get(a.id) ?? []) {
      const n = indeg.get(r.successorId)! - 1;
      indeg.set(r.successorId, n);
      if (n === 0) {
        const q = byId.get(r.successorId)!;
        // Insert keeping the order (successor's early start moves with its predecessors).
        let i = ready.findIndex((x) => before(q, x) < 0);
        if (i < 0) i = ready.length;
        ready.splice(i, 0, q);
      }
    }
  }
  if (placed.size < work.length) warnings.push("Some activities sit on a logic loop and were not levelled.");
  if (overloaded.length) warnings.push(`${overloaded.length} activities stay overloaded: ${overloaded.slice(0, 6).join(", ")}${overloaded.length > 6 ? "…" : ""}. Either one of them alone needs more than a resource's limit, or it could not move ${o.levelWithinFloat ? "within its float" : o.preserveFinish ? "without delaying the finish" : "far enough"}.`);
  const projectFinish = s.activities.reduce((m, a) => Math.max(m, a.finish ?? -Infinity), -Infinity);
  return { schedule: s, delayed, overloaded, projectFinish, warnings };
}

/** Peak usage over capacity per resource, for the levelling report. */
export function overloads(s: Schedule): { resourceId: string; peak: number; capacity: number; days: number }[] {
  const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
  const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0] || standardCalendar();
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const out: { resourceId: string; peak: number; capacity: number; days: number }[] = [];
  const shifts = new Map((s.shifts ?? []).map((x) => [x.id, x]));
  for (const r of s.resources ?? []) {
    const sh = r.shiftId ? shifts.get(r.shiftId) : undefined;
    if (r.type === "material" || !(sh || r.maxUnitsPerHour || (r.rates ?? []).some((x) => x.maxUnitsPerHour))) continue;
    const use = new Map<number, number>();
    for (const x of s.assignments ?? []) {
      if (x.resourceId !== r.id) continue;
      const a = byId.get(x.activityId);
      if (!a || a.status === "complete" || a.start === null || a.finish === null) continue;
      const cal = (a.calendarId && cals.get(a.calendarId)) || def;
      const from = a.status === "in-progress" ? Math.max(s.dataDate ?? a.start, a.start) : a.start;
      const hours = Math.max(1e-6, workHoursBetween(cal, from, a.finish));
      const rate = x.remainingQty / hours;
      for (let day = Math.floor(from / DAY) * DAY; day < a.finish; day += DAY) {
        const h = workHoursBetween(cal, Math.max(from, day), Math.min(a.finish, day + DAY));
        if (h > 0) use.set(day, (use.get(day) ?? 0) + rate * h);
      }
    }
    let peak = 0;
    let days = 0;
    let capacity = 0;
    for (const [day, u] of use) {
      const rc = (r.calendarId && cals.get(r.calendarId)) || def;
      const cap = sh ? shiftCapacity(sh, rc, day) : (maxUnitsAt(r, day) ?? 0) * workHoursBetween(rc, day, day + DAY);
      capacity = Math.max(capacity, cap);
      if (u > cap + 1e-6) days++;
      peak = Math.max(peak, u);
    }
    out.push({ resourceId: r.id, peak: Math.round(peak * 100) / 100, capacity: Math.round(capacity * 100) / 100, days });
  }
  return out;
}
