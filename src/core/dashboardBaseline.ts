// Baselines and prerequisites for dashboards. A dashboard can compare against
// the project baseline (the baseline dates on the activities) or any baseline
// stored with the project. Many KPIs only mean something once a baseline is
// assigned and the schedule is calculated and progressed, so the checks below
// say what is missing before the numbers are trusted.

import { EXTRA_KPIS, EXTRA_METRICS } from "./kpiExtra";
import type { KpiMetric, Widget } from "./reporting";
import type { Schedule } from "./types";

export interface BaselineOption {
  /** null = the project baseline on the activities. */
  id: string | null;
  name: string;
  dataDate: number | null;
  /** Share of activities (0-1) with baseline dates in this baseline. */
  coverage: number;
}

const work = (s: Schedule) => s.activities.filter((a) => a.type !== "wbs-summary");

export function baselineOptions(s: Schedule): BaselineOption[] {
  const acts = work(s);
  const n = Math.max(1, acts.length);
  const own = acts.filter((a) => a.baselineStart !== null || a.baselineFinish !== null).length;
  return [
    { id: null, name: "Project baseline (as assigned)", dataDate: null, coverage: own / n },
    ...(s.baselines ?? []).map((b) => ({ id: b.id, name: b.name, dataDate: b.dataDate, coverage: acts.filter((a) => b.dates[a.code]).length / n })),
  ];
}

/** The schedule as seen against a stored baseline: its dates replace the activities' baseline dates. */
export function applyBaseline(s: Schedule, baselineId: string | null | undefined): Schedule {
  if (!baselineId) return s;
  const b = (s.baselines ?? []).find((x) => x.id === baselineId);
  if (!b) return s;
  return {
    ...s,
    activities: s.activities.map((a) => {
      const d = b.dates[a.code];
      return { ...a, baselineStart: d?.[0] ?? null, baselineFinish: d?.[1] ?? null };
    }),
  };
}

/** KPI metrics that compare against the baseline. */
export const BASELINE_METRICS = new Set<KpiMetric>([
  ...(["blPlanPct", "blUtm", "gapFtm", "sai", "blStart", "blFinish", "blDuration", "overrun", "finishVariance", "spi", "late"] as KpiMetric[]),
  ...EXTRA_METRICS.filter((m) => EXTRA_KPIS[m].needsBaseline),
]);
/** Widget kinds that draw a baseline plan. */
const BASELINE_KINDS = new Set<Widget["kind"]>(["scurve", "progress", "pscurve"]);

export const widgetNeedsBaseline = (w: Widget) => BASELINE_KINDS.has(w.kind) || (w.kind === "kpi" && !!w.metric && BASELINE_METRICS.has(w.metric)) || (w.kind === "info" && (w.rows ?? []).some((r) => r.metric && BASELINE_METRICS.has(r.metric)));
export const widgetNeedsCosts = (w: Widget) => w.kind === "kpi" && !!w.metric && ["cpi", "bac", "eac", "vac", "ev", "ac"].includes(w.metric);

export interface ReadinessCheck {
  id: "baseline" | "baselineAge" | "dataDate" | "scheduled" | "progress" | "costs" | "logic";
  label: string;
  ok: boolean;
  /** Required checks block baseline KPIs; recommended ones only weaken them. */
  level: "required" | "recommended";
  detail: string;
  /** What to do about it. */
  fix?: string;
}

/** What a dashboard needs before its KPIs give a fair picture. */
export function dashboardReadiness(s: Schedule, baselineId?: string | null): ReadinessCheck[] {
  const acts = work(s);
  const n = acts.length;
  const opt = baselineOptions(s).find((o) => o.id === (baselineId ?? null)) ?? baselineOptions(s)[0];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const scheduled = acts.filter((a) => a.start !== null && a.finish !== null).length;
  // Completed work has no float, so only open activities count.
  const openActs = acts.filter((a) => a.status !== "complete");
  const withFloat = openActs.filter((a) => a.totalFloatHours !== null).length;
  const started = acts.filter((a) => a.actualStart !== null).length;
  const budget = (s.assignments ?? []).reduce((t, x) => t + x.budgetCost, 0);
  const preds = new Set(s.relationships.map((r) => r.successorId));
  const succs = new Set(s.relationships.map((r) => r.predecessorId));
  const open = acts.filter((a) => a.status !== "complete" && (!preds.has(a.id) || !succs.has(a.id))).length;
  const bl = baselineId ? (s.baselines ?? []).find((b) => b.id === baselineId) : null;
  const checks: ReadinessCheck[] = [
    {
      id: "baseline",
      label: "Baseline assigned",
      ok: n > 0 && opt.coverage >= 0.9,
      level: "required",
      detail: n ? `${opt.name}: ${pct(opt.coverage)} of activities have baseline dates.` : "No activities.",
      fix: "Project › Assign Baselines (or Maintain Baselines to store one), then choose it in the dashboard's Baseline step.",
    },
    {
      id: "dataDate",
      label: "Data date set",
      ok: s.dataDate !== null,
      level: "required",
      detail: s.dataDate !== null ? "The data date is set." : "No data date: progress and planned-to-date figures cannot be worked out.",
      fix: "Set the data date in Schedule (F9).",
    },
    {
      id: "scheduled",
      label: "Schedule calculated",
      ok: n > 0 && scheduled === n && withFloat >= openActs.length * 0.9,
      level: "required",
      detail: `${scheduled} of ${n} activities have dates; ${withFloat} of ${openActs.length} open activities have total float.`,
      fix: "Run Schedule (F9).",
    },
    {
      id: "progress",
      label: "Progress updated",
      ok: started > 0 || (s.dataDate !== null && acts.every((a) => (a.start ?? Infinity) >= s.dataDate!)),
      level: "recommended",
      detail: started ? `${started} activities have actual starts.` : "No actual dates yet, so earned progress is zero.",
      fix: "Tools › Update Progress, or enter actuals, then Schedule (F9).",
    },
    {
      id: "costs",
      label: "Costs or resources loaded",
      ok: budget > 0,
      level: "recommended",
      detail: budget > 0 ? "Budgeted cost is loaded." : "No budgeted cost: CPI, EAC and cost S-curves will be empty; progress uses durations instead.",
      fix: "Assign resources with prices, or import a cost-loaded XER.",
    },
    {
      id: "logic",
      label: "Logic complete",
      ok: open <= Math.max(2, n * 0.05),
      level: "recommended",
      detail: `${open} open activit${open === 1 ? "y has" : "ies have"} a missing predecessor or successor.`,
      fix: "Tools › Check Schedule lists them.",
    },
  ];
  if (bl && s.dataDate !== null && bl.dataDate !== null && bl.dataDate > s.dataDate)
    checks.splice(1, 0, { id: "baselineAge", label: "Baseline older than the data date", ok: false, level: "recommended", detail: `${bl.name} was taken at a later data date than the current schedule.`, fix: "Pick an earlier baseline." });
  return checks;
}

/** Ready for baseline KPIs when every required check passes. */
export const baselineReady = (checks: ReadinessCheck[]) => checks.filter((c) => c.level === "required").every((c) => c.ok);
