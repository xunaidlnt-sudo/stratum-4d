// Budgets, funding and spending plans (P6 "Budgets" chapter), the OBS, and
// the probability × impact risk scoring matrix.

import type {
  Activity,
  ObsNode,
  RegisterItem,
  RiskMatrix,
  Schedule,
  WbsNode,
} from "./types";
import { usageSheet } from "./usage";

// ---------------------------------------------------------------- WBS tree helpers

/** Ids of a WBS element and everything under it (null = whole project). */
export function wbsSubtree(
  s: Schedule,
  wbsId: string | null,
): Set<string> | null {
  if (wbsId === null) return null;
  const kids = new Map<string | null, WbsNode[]>();
  for (const w of s.wbs)
    (kids.get(w.parentId) ?? kids.set(w.parentId, []).get(w.parentId)!).push(w);
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    for (const k of kids.get(id) ?? []) walk(k.id);
  };
  walk(wbsId);
  return out;
}

const activitiesUnder = (s: Schedule, wbsId: string | null): Activity[] => {
  const sub = wbsSubtree(s, wbsId);
  return sub
    ? s.activities.filter((a) => a.wbsId !== null && sub.has(a.wbsId))
    : s.activities;
};

const money = (v: string | undefined) => {
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------- budget summary

export interface BudgetSummary {
  original: number;
  approvedChanges: number;
  pendingChanges: number;
  /** Original + approved changes. */
  current: number;
  /** Current + pending changes. */
  proposed: number;
  /** Current budgets of the elements one level down. */
  distributed: number;
  undistributed: number;
  funded: number;
  unfunded: number;
  /** Budgeted cost of the activities (resources and expenses). */
  plannedCost: number;
  spendingPlan: number;
}

export function budgetSummary(
  s: Schedule,
  wbsId: string | null,
): BudgetSummary {
  const node =
    wbsId === null ? null : (s.wbs.find((w) => w.id === wbsId) ?? null);
  const original =
    (wbsId === null ? s.originalBudget : node?.originalBudget) ?? 0;
  const changes = (s.budgetChanges ?? []).filter((c) => c.wbsId === wbsId);
  const approvedChanges = changes
    .filter((c) => c.status === "approved")
    .reduce((t, c) => t + c.amount, 0);
  const pendingChanges = changes
    .filter((c) => c.status === "pending")
    .reduce((t, c) => t + c.amount, 0);
  const current = original + approvedChanges;
  const childCurrent = (w: WbsNode) =>
    (w.originalBudget ?? 0) +
    (s.budgetChanges ?? [])
      .filter((c) => c.wbsId === w.id && c.status === "approved")
      .reduce((t, c) => t + c.amount, 0);
  const distributed = s.wbs
    .filter((w) => w.parentId === wbsId)
    .reduce((t, w) => t + childCurrent(w), 0);
  const funded = (s.funding ?? [])
    .filter((f) => f.wbsId === wbsId)
    .reduce((t, f) => t + f.amount, 0);
  const ids = new Set(activitiesUnder(s, wbsId).map((a) => a.id));
  let plannedCost = 0;
  for (const x of s.assignments ?? [])
    if (ids.has(x.activityId)) plannedCost += x.budgetCost;
  for (const e of s.registers?.expenses ?? [])
    if (e.activityId && ids.has(e.activityId))
      plannedCost += money(e.values["Budgeted Cost"]);
  const spendingPlan = (s.spendingPlan ?? [])
    .filter((r) => r.wbsId === wbsId)
    .reduce((t, r) => t + r.spending, 0);
  return {
    original,
    approvedChanges,
    pendingChanges,
    current,
    proposed: current + pendingChanges,
    distributed,
    undistributed: current - distributed,
    funded,
    unfunded: current - funded,
    plannedCost,
    spendingPlan,
  };
}

// ---------------------------------------------------------------- spending plan vs planned cost

export interface SpendingRow {
  month: string;
  spending: number;
  benefit: number;
  cumSpending: number;
  /** At-completion cost of the activities falling in the month. */
  planned: number;
  cumPlanned: number;
  /** Cumulative spending plan minus cumulative planned cost. */
  variance: number;
}

const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);

export function spendingPlanCompare(
  s: Schedule,
  wbsId: string | null,
): SpendingRow[] {
  const acts = activitiesUnder(s, wbsId);
  const sheet = usageSheet(s, {
    by: "activity",
    step: "month",
    measure: "cost",
    activityIds: new Set(acts.map((a) => a.id)),
  });
  const planned = new Map<string, number>();
  sheet.periods.forEach((p, i) =>
    planned.set(
      monthKey(p.start),
      (planned.get(monthKey(p.start)) ?? 0) + sheet.totals[i],
    ),
  );
  const plan = new Map<string, { spending: number; benefit: number }>();
  for (const r of s.spendingPlan ?? [])
    if (r.wbsId === wbsId)
      plan.set(r.month, { spending: r.spending, benefit: r.benefit ?? 0 });
  const months = [...new Set([...planned.keys(), ...plan.keys()])].sort();
  if (!months.length) return [];
  // Fill gaps so the table reads month by month.
  const all: string[] = [];
  for (let [y, m] = months[0].split("-").map(Number); ; m++) {
    if (m > 12) (y++, (m = 1));
    const k = `${y}-${String(m).padStart(2, "0")}`;
    all.push(k);
    if (k >= months[months.length - 1]) break;
  }
  let cs = 0;
  let cp = 0;
  return all.map((month) => {
    const p = plan.get(month) ?? { spending: 0, benefit: 0 };
    const pl = planned.get(month) ?? 0;
    cs += p.spending;
    cp += pl;
    return {
      month,
      spending: p.spending,
      benefit: p.benefit,
      cumSpending: cs,
      planned: pl,
      cumPlanned: cp,
      variance: cs - cp,
    };
  });
}

/** Seed a spending plan from the planned cost per month (P6 users often start from the schedule). */
export function spendingPlanFromSchedule(
  s: Schedule,
  wbsId: string | null,
): Schedule {
  const rows = spendingPlanCompare({ ...s, spendingPlan: [] }, wbsId);
  const keep = (s.spendingPlan ?? []).filter((r) => r.wbsId !== wbsId);
  return {
    ...s,
    spendingPlan: [
      ...keep,
      ...rows
        .filter((r) => r.planned)
        .map((r) => ({
          wbsId,
          month: r.month,
          spending: Math.round(r.planned),
        })),
    ],
  };
}

// ---------------------------------------------------------------- OBS

const obsMapCache = new WeakMap<ObsNode[], Map<string, ObsNode>>();
export function obsPath(s: Schedule, id: string | null | undefined): string {
  if (!id || !s.obs) return "";
  let m = obsMapCache.get(s.obs);
  if (!m) obsMapCache.set(s.obs, (m = new Map(s.obs.map((o) => [o.id, o]))));
  const parts: string[] = [];
  const seen = new Set<string>();
  for (
    let o = m.get(id);
    o && !seen.has(o.id);
    o = o.parentId ? m.get(o.parentId) : undefined
  )
    (seen.add(o.id), parts.unshift(o.name));
  return parts.join(" / ");
}

/** Responsible manager of a WBS element: its own OBS, else the nearest parent's, else the project's. */
const wbsMapCache = new WeakMap<WbsNode[], Map<string, WbsNode>>();
export function wbsObs(s: Schedule, wbsId: string | null): string | null {
  let m = wbsMapCache.get(s.wbs);
  if (!m) wbsMapCache.set(s.wbs, (m = new Map(s.wbs.map((w) => [w.id, w]))));
  for (
    let w = wbsId ? m.get(wbsId) : undefined;
    w;
    w = w.parentId ? m.get(w.parentId) : undefined
  )
    if (w.obsId) return w.obsId;
  return s.obsId ?? null;
}

/** OBS rows in tree order with depth. */
export function obsTree(s: Schedule): { node: ObsNode; depth: number }[] {
  const list = s.obs ?? [];
  const ids = new Set(list.map((o) => o.id));
  const kids = new Map<string | null, ObsNode[]>();
  for (const o of list) {
    const p = o.parentId && ids.has(o.parentId) ? o.parentId : null;
    (kids.get(p) ?? kids.set(p, []).get(p)!).push(o);
  }
  const out: { node: ObsNode; depth: number }[] = [];
  const walk = (p: string | null, depth: number) => {
    for (const o of (kids.get(p) ?? []).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      out.push({ node: o, depth });
      walk(o.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// ---------------------------------------------------------------- risk scoring

export const DEFAULT_RISK_MATRIX: RiskMatrix = {
  probability: [
    { label: "Very Low", from: 0 },
    { label: "Low", from: 10 },
    { label: "Medium", from: 30 },
    { label: "High", from: 50 },
    { label: "Very High", from: 70 },
  ],
  impact: [
    { label: "Very Low", scheduleDays: 0, cost: 0 },
    { label: "Low", scheduleDays: 5, cost: 10_000 },
    { label: "Medium", scheduleDays: 15, cost: 50_000 },
    { label: "High", scheduleDays: 30, cost: 250_000 },
    { label: "Very High", scheduleDays: 60, cost: 1_000_000 },
  ],
  scores: [
    [1, 2, 3, 4, 5],
    [2, 4, 6, 8, 10],
    [3, 6, 9, 12, 15],
    [4, 8, 12, 16, 20],
    [5, 10, 15, 20, 25],
  ],
  high: 12,
  medium: 5,
};

export const riskMatrixOf = (s: Schedule) =>
  s.riskMatrix ?? DEFAULT_RISK_MATRIX;

/** Level index for a text value: a label ("High"), "H", a level number (1–5) or a percentage ("40%"). */
function levelOf(
  v: string,
  labels: string[],
  pct?: { from: number }[],
): number | null {
  const t = v.trim().toLowerCase();
  if (!t) return null;
  const byLabel = labels.findIndex((l) => l.toLowerCase() === t);
  if (byLabel >= 0) return byLabel;
  const initials = labels.map((l) =>
    l
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toLowerCase(),
  );
  const byInitial = initials.indexOf(t.replace(/[^a-z]/g, ""));
  if (byInitial >= 0 && /^[a-z ]+$/.test(t)) return byInitial;
  const n = Number(t.replace(/[%,\s]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (pct && (t.endsWith("%") || n > labels.length)) {
    let i = 0;
    pct.forEach((p, k) => n >= p.from && (i = k));
    return i;
  }
  return n >= 1 && n <= labels.length ? Math.round(n) - 1 : null;
}

const numIn = (v: string | undefined) => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && /[0-9]/.test(t) ? n : null;
};

export interface RiskScore {
  probability: number | null;
  impact: number | null;
  score: number | null;
  band: "high" | "medium" | "low" | null;
}

export function riskScore(item: RegisterItem, m: RiskMatrix): RiskScore {
  const v = item.values;
  const probability = levelOf(
    v["Probability"] ?? "",
    m.probability.map((p) => p.label),
    m.probability,
  );
  const labels = m.impact.map((i) => i.label);
  const levels: number[] = [];
  // Numbers are compared with the thresholds (days or cost); words are matched to the labels.
  for (const [key, field] of [
    ["Impact (Schedule)", "scheduleDays"],
    ["Impact (Cost)", "cost"],
  ] as const) {
    const raw = v[key] ?? "";
    const n = numIn(raw);
    if (n !== null) {
      let i = 0;
      m.impact.forEach((x, k) => n >= x[field] && (i = k));
      levels.push(i);
    } else {
      const l = levelOf(raw, labels);
      if (l !== null) levels.push(l);
    }
  }
  const impact = levels.length ? Math.max(...levels) : null;
  const score =
    probability !== null && impact !== null
      ? (m.scores[probability]?.[impact] ?? null)
      : null;
  const band =
    score === null
      ? null
      : score >= m.high
        ? "high"
        : score >= m.medium
          ? "medium"
          : "low";
  return { probability, impact, score, band };
}

/** counts[p][i] of risks in each cell of the matrix. */
export function riskHeatMap(s: Schedule): {
  counts: number[][];
  unscored: number;
} {
  const m = riskMatrixOf(s);
  const counts = m.probability.map(() => m.impact.map(() => 0));
  let unscored = 0;
  for (const r of s.registers?.risks ?? []) {
    const x = riskScore(r, m);
    if (x.probability === null || x.impact === null) unscored++;
    else counts[x.probability][x.impact]++;
  }
  return { counts, unscored };
}

// ---------------------------------------------------------------- financial periods

export type FinancialPeriod = NonNullable<Schedule["financialPeriods"]>[number];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** P6 Financial Period Calendar › Batch Create: periods of a week, a month or a quarter between two dates. */
export function batchFinancialPeriods(
  start: number,
  end: number,
  interval: "week" | "month" | "quarter",
  endDay = 0,
): FinancialPeriod[] {
  const out: FinancialPeriod[] = [];
  const DAY = 86_400_000;
  let t = Math.floor(start / DAY) * DAY;
  for (let i = 0; t < end && i < 2000; i++) {
    const d = new Date(t);
    let next: number;
    if (interval === "week") {
      // Weeks end on endDay (0 = Sunday).
      const toEnd = (endDay - d.getUTCDay() + 7) % 7;
      next = t + (toEnd + 1) * DAY;
    } else {
      const months = interval === "month" ? 1 : 3;
      next = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth() +
          months -
          (interval === "quarter" ? d.getUTCMonth() % 3 : 0),
        1,
      );
    }
    const f = new Date(next - DAY);
    const name =
      interval === "week"
        ? `W/E ${String(f.getUTCDate()).padStart(2, "0")}-${MONTHS[f.getUTCMonth()]}-${String(f.getUTCFullYear()).slice(2)}`
        : interval === "month"
          ? `${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`
          : `Q${Math.floor(d.getUTCMonth() / 3) + 1}-${d.getUTCFullYear()}`;
    out.push({ id: `fp-${t}`, name, start: t, finish: next });
    t = next;
  }
  return out;
}

/** The financial period containing a date. */
export const financialPeriodAt = (s: Schedule, t: number) =>
  (s.financialPeriods ?? []).find((p) => p.start <= t && t < p.finish) ?? null;
