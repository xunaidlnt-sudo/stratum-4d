// Resource details from P6's resource chapters: rates over time, shifts,
// resource curves, roles and cost accounts.

import { workHoursBetween } from "./calendar";
import type { Assignment, Calendar, CostAccount, Resource, ResourceCurve, Role, Schedule, Shift } from "./types";

const DAY = 86_400_000;

// ---------------------------------------------------------------- rates over time

/** Price per unit in force at time t (latest rate starting on or before t). */
export function priceAt(r: Resource | Role | undefined, t: number): number {
  if (!r) return 0;
  const rates = "rates" in r && r.rates?.length ? [...r.rates].sort((a, b) => a.from - b.from) : null;
  if (!rates) return r.pricePerUnit;
  let p = r.pricePerUnit;
  for (const x of rates) if (x.from <= t) p = x.pricePerUnit;
  return p;
}

/** Max units per hour in force at time t (rates first, then the resource's own limit). */
export function maxUnitsAt(r: Resource, t: number): number | undefined {
  let m = r.maxUnitsPerHour;
  for (const x of [...(r.rates ?? [])].sort((a, b) => a.from - b.from)) if (x.from <= t && x.maxUnitsPerHour !== undefined) m = x.maxUnitsPerHour;
  return m;
}

// ---------------------------------------------------------------- shifts

/** Units a shift allows on one day: max units of each period × hours worked in it on the calendar. */
export function shiftCapacity(shift: Shift, cal: Calendar, day: number): number {
  const ps = [...shift.periods].sort((a, b) => a.start - b.start);
  let total = 0;
  ps.forEach((p, i) => {
    const from = day + p.start * 3_600_000;
    const to = day + (i + 1 < ps.length ? ps[i + 1].start : 24) * 3_600_000;
    total += p.maxUnits * workHoursBetween(cal, from, to);
  });
  return total;
}

// ---------------------------------------------------------------- resource curves

const flat = (v: number) => Array.from({ length: 21 }, () => v);
/** P6's standard curves (21 points from 0% to 100% of the duration). */
export const STANDARD_CURVES: ResourceCurve[] = [
  { id: "std-linear", name: "Linear", values: flat(5) },
  { id: "std-bell", name: "Bell Shaped", values: [0, 0.5, 1.5, 3, 5, 7, 9, 10.5, 11.5, 12, 12, 12, 11.5, 10.5, 9, 7, 5, 3, 1.5, 0.5, 0].map((v) => v) },
  { id: "std-front", name: "Front Loaded", values: [10, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5] },
  { id: "std-back", name: "Back Loaded", values: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10] },
  { id: "std-early", name: "Early Peak", values: [0, 3, 7, 11, 14, 14, 12, 10, 8, 6.5, 5, 4, 3, 2.5, 2, 1.5, 1, 0.7, 0.4, 0.2, 0] },
  { id: "std-late", name: "Late Peak", values: [0, 0.2, 0.4, 0.7, 1, 1.5, 2, 2.5, 3, 4, 5, 6.5, 8, 10, 12, 14, 14, 11, 7, 3, 0] },
  { id: "std-double", name: "Double Peak", values: [0, 3, 7, 10, 11, 10, 7, 4, 2.5, 2, 2, 2, 2.5, 4, 7, 10, 11, 10, 7, 3, 0] },
  { id: "std-three", name: "Three Step", values: [3, 3, 3, 3, 3, 3, 3, 5, 5, 5, 5, 5, 5, 5, 7, 7, 7, 7, 7, 7, 7] },
];

export const allCurves = (s: Schedule) => [...STANDARD_CURVES, ...(s.curves ?? [])];

/**
 * Cumulative share of the units (0–1) reached at fraction u (0–1) of the
 * duration. Each of the 20 segments carries the mean of its two end points.
 */
export function curveCumulative(curve: ResourceCurve | null | undefined): (u: number) => number {
  if (!curve) return (u) => Math.min(1, Math.max(0, u));
  const v = curve.values.length === 21 ? curve.values : flat(5);
  const seg = Array.from({ length: 20 }, (_, i) => Math.max(0, (v[i] + v[i + 1]) / 2));
  const total = seg.reduce((a, b) => a + b, 0) || 1;
  const cum = [0];
  for (const x of seg) cum.push(cum[cum.length - 1] + x / total);
  return (u) => {
    const x = Math.min(1, Math.max(0, u)) * 20;
    const i = Math.min(19, Math.floor(x));
    return cum[i] + (cum[i + 1] - cum[i]) * (x - i);
  };
}

/** Units of an assignment falling in [a, b) when `qty` is spread over [start, finish) with a curve. */
export function curveShare(qty: number, start: number, finish: number, a: number, b: number, F: (u: number) => number): number {
  const span = finish - start;
  if (span <= 0) return a <= start && start < b ? qty : 0;
  const u0 = (Math.max(a, start) - start) / span;
  const u1 = (Math.min(b, finish) - start) / span;
  return u1 > u0 ? qty * (F(u1) - F(u0)) : 0;
}

// ---------------------------------------------------------------- costs with rates and curves

/** Cost of `qty` units spread over [start, finish) day by day, priced at the rate in force each day. */
export function costOverTime(r: Resource | Role | undefined, qty: number, start: number, finish: number, F: (u: number) => number = (u) => u): number {
  if (!r) return 0;
  if (!("rates" in r) || !r.rates?.length || finish <= start) return qty * priceAt(r, start);
  let cost = 0;
  for (let day = Math.floor(start / DAY) * DAY; day < finish; day += DAY) cost += curveShare(qty, start, finish, day, day + DAY, F) * priceAt(r, Math.max(day, start));
  return cost;
}

// ---------------------------------------------------------------- roles

/** Staff an unstaffed role assignment with a resource (P6 "Assign resources by role"). */
export function staffRole(s: Schedule, assignmentId: string, resourceId: string): Schedule {
  const res = s.resources?.find((r) => r.id === resourceId);
  if (!res) return s;
  return {
    ...s,
    assignments: (s.assignments ?? []).map((x) =>
      x.id === assignmentId ? { ...x, resourceId, budgetCost: x.budgetQty * res.pricePerUnit, remainingCost: x.remainingQty * res.pricePerUnit, actualCost: x.actualQty * res.pricePerUnit } : x,
    ),
  };
}

/** Resources that can fill a role. */
export const resourcesForRole = (s: Schedule, roleId: string) => (s.resources ?? []).filter((r) => r.roleIds?.includes(roleId));

// ---------------------------------------------------------------- cost accounts

export interface CostAccountTotal {
  account: CostAccount | null;
  depth: number;
  budget: number;
  actual: number;
  remaining: number;
}

/** Budget, actual and remaining cost per cost account (rolled up the hierarchy), from assignments and expenses. */
export function costAccountTotals(s: Schedule): CostAccountTotal[] {
  const accts = s.costAccounts ?? [];
  const byCode = new Map(accts.map((a) => [a.code.toLowerCase(), a]));
  const own = new Map<string | null, { budget: number; actual: number; remaining: number }>();
  const add = (id: string | null, b: number, a: number, r: number) => {
    const t = own.get(id) ?? { budget: 0, actual: 0, remaining: 0 };
    t.budget += b;
    t.actual += a;
    t.remaining += r;
    own.set(id, t);
  };
  const def = s.defaultCostAccountId ?? null;
  for (const x of s.assignments ?? []) add(x.costAccountId ?? def, x.budgetCost, x.actualCost, x.remainingCost);
  const money = (v: string | undefined) => {
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };
  for (const e of s.registers?.expenses ?? []) {
    const code = (e.values["Cost Account"] ?? "").trim().toLowerCase();
    add(code ? byCode.get(code)?.id ?? def : def, money(e.values["Budgeted Cost"]), money(e.values["Actual Cost"]), money(e.values["Remaining Cost"]));
  }
  const kids = new Map<string | null, CostAccount[]>();
  for (const a of accts) (kids.get(a.parentId) ?? kids.set(a.parentId, []).get(a.parentId)!).push(a);
  const out: CostAccountTotal[] = [];
  const visit = (parent: string | null, depth: number): { budget: number; actual: number; remaining: number } => {
    const sum = { budget: 0, actual: 0, remaining: 0 };
    for (const a of (kids.get(parent) ?? []).sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }))) {
      const idx = out.length;
      out.push({ account: a, depth, budget: 0, actual: 0, remaining: 0 });
      const sub = visit(a.id, depth + 1);
      const mine = own.get(a.id) ?? { budget: 0, actual: 0, remaining: 0 };
      const t = { budget: sub.budget + mine.budget, actual: sub.actual + mine.actual, remaining: sub.remaining + mine.remaining };
      Object.assign(out[idx], t);
      sum.budget += t.budget;
      sum.actual += t.actual;
      sum.remaining += t.remaining;
    }
    return sum;
  };
  visit(null, 0);
  const none = own.get(null);
  if (none && (none.budget || none.actual || none.remaining)) out.push({ account: null, depth: 0, ...none });
  return out;
}

/** Cost account path code, e.g. "100.120". */
export function costAccountPath(s: Schedule, id: string | null | undefined): string {
  if (!id) return "";
  const m = new Map((s.costAccounts ?? []).map((a) => [a.id, a]));
  const parts: string[] = [];
  for (let a = m.get(id); a; a = a.parentId ? m.get(a.parentId) : undefined) parts.unshift(a.code);
  return parts.join(".");
}

export type { Assignment };
