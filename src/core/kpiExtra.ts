// More schedule KPIs for dashboards: execution indices used with P6
// (BEI, CPLI, earned schedule SPI(t) and its finish forecast, Percent Plan
// Complete, on-time starts and finishes) and the DCMA 14-point schedule
// health checks (missing logic, leads, lags, relationship types, hard
// constraints, high and negative float, long durations, invalid dates).
// Thresholds follow the DCMA guideline; they flag what to review, they are
// not pass/fail rules.

import { evm, sCurves } from "./evm";
import type { Activity, Schedule } from "./types";

const DAY = 86_400_000;

export type ExtraMetric =
  | "bei"
  | "cpli"
  | "spiT"
  | "esFinish"
  | "ppc"
  | "startsOnTime"
  | "finishesOnTime"
  | "missingLogic"
  | "leads"
  | "lags"
  | "fsPct"
  | "hardConstraints"
  | "highFloat"
  | "negFloat"
  | "longDuration"
  | "invalidDates";

export interface ExtraKpiDef {
  label: string;
  group: "Execution" | "Schedule health (DCMA)";
  hint: string;
  needsBaseline?: boolean;
}

export const EXTRA_KPIS: Record<ExtraMetric, ExtraKpiDef> = {
  bei: { label: "Baseline Execution Index (BEI)", group: "Execution", hint: "Activities completed ÷ activities the baseline planned to finish by the data date. 1.00 is on plan; DCMA flags below 0.95.", needsBaseline: true },
  cpli: { label: "Critical Path Length Index (CPLI)", group: "Execution", hint: "(Remaining critical path length + float to the baseline finish) ÷ remaining critical path length. Below 0.95 the finish is hard to hold.", needsBaseline: true },
  spiT: { label: "SPI(t) – earned schedule", group: "Execution", hint: "Earned schedule ÷ actual time. Like SPI but in time units, and it stays meaningful late in the project.", needsBaseline: true },
  esFinish: { label: "Finish forecast by earned schedule", group: "Execution", hint: "Start + planned duration ÷ SPI(t): the finish if the schedule efficiency to date continues.", needsBaseline: true },
  ppc: { label: "Percent Plan Complete (PPC)", group: "Execution", hint: "Of the activities the baseline planned to finish in the period, the share that did. Green from 90%, red below 75% (Last Planner convention).", needsBaseline: true },
  startsOnTime: { label: "Starts on time", group: "Execution", hint: "Started activities whose actual start was no later than the baseline start (one day of tolerance).", needsBaseline: true },
  finishesOnTime: { label: "Finishes on time", group: "Execution", hint: "Completed activities whose actual finish was no later than the baseline finish (one day of tolerance).", needsBaseline: true },
  missingLogic: { label: "Missing logic", group: "Schedule health (DCMA)", hint: "Open activities without a predecessor or a successor. DCMA: at most 5%." },
  leads: { label: "Leads (negative lags)", group: "Schedule health (DCMA)", hint: "Relationships with a negative lag. DCMA: none." },
  lags: { label: "Relationships with lags", group: "Schedule health (DCMA)", hint: "Relationships with a positive lag. DCMA: at most 5%." },
  fsPct: { label: "Finish-to-start relationships", group: "Schedule health (DCMA)", hint: "Share of relationships that are FS. DCMA: at least 90%." },
  hardConstraints: { label: "Hard constraints", group: "Schedule health (DCMA)", hint: "Open activities with a mandatory start or finish. DCMA: at most 5%." },
  highFloat: { label: "High float (> 44 days)", group: "Schedule health (DCMA)", hint: "Open activities with more than 44 working days of total float, often a sign of missing logic. DCMA: at most 5%." },
  negFloat: { label: "Negative float", group: "Schedule health (DCMA)", hint: "Open activities with negative total float: the plan cannot meet a constraint or the deadline. DCMA: none." },
  longDuration: { label: "Long durations (> 44 days)", group: "Schedule health (DCMA)", hint: "Open activities with more than 44 working days remaining; break them down. DCMA: at most 5%." },
  invalidDates: { label: "Invalid dates", group: "Schedule health (DCMA)", hint: "Actual dates after the data date, or forecast dates before it. DCMA: none." },
};

export const EXTRA_METRICS = Object.keys(EXTRA_KPIS) as ExtraMetric[];
export const isExtraMetric = (m: string): m is ExtraMetric => m in EXTRA_KPIS;

interface Out {
  label: string;
  value: string;
  raw: number | null;
  tone?: "good" | "bad";
  hint?: string;
}

const fmtDay = (t: number | null) => {
  if (t === null || !Number.isFinite(t)) return "–";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};
const pct = (n: number, of: number) => (of ? (n / of) * 100 : null);
const work = (s: Schedule) => s.activities.filter((a) => a.type !== "wbs-summary" && a.type !== "loe");
const isMs = (a: Activity) => a.type === "milestone" || a.type === "finish-milestone";

/** Earned schedule from the cost (or hours) S-curve: time at which planned value equalled today's earned value. */
export function earnedSchedule(s: Schedule): { es: number; at: number; spiT: number | null; start: number; plannedDuration: number } | null {
  const measure = evm(s, "cost").bac > 0 ? "cost" : "hours";
  const pts = sCurves(s, measure, 1);
  if (pts.length < 2 || s.dataDate === null) return null;
  const t0 = pts[0].t;
  const ev = [...pts].reverse().find((p) => p.ev !== null)?.ev ?? 0;
  let es = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (ev >= b.pv) es = b.t - t0;
    else if (ev >= a.pv) {
      es = a.t - t0 + (b.pv > a.pv ? ((ev - a.pv) / (b.pv - a.pv)) * (b.t - a.t) : 0);
      break;
    }
  }
  const at = s.dataDate - t0;
  const pvEnd = pts[pts.length - 1].pv;
  const endIdx = pts.findIndex((p) => p.pv >= pvEnd);
  const plannedDuration = pts[endIdx].t - t0;
  return { es, at, spiT: at > 0 ? es / at : null, start: t0, plannedDuration };
}

export function extraKpi(s: Schedule, metric: ExtraMetric, opts: { days?: number } = {}): Out {
  const def = EXTRA_KPIS[metric];
  const dd = s.dataDate ?? Date.now();
  const cal = (s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0];
  const hpd = cal?.hoursPerDay || 8;
  const acts = work(s);
  const open = acts.filter((a) => a.status !== "complete");
  const ratio = (v: number | null, good: number, bad: number): Out => ({ label: def.label, value: v === null ? "–" : v.toFixed(2), raw: v, tone: v === null ? undefined : v >= good ? "good" : v < bad ? "bad" : undefined, hint: def.hint });
  const share = (n: number, of: number, max: number, unit = "of open activities"): Out => {
    const p = pct(n, of);
    return { label: def.label, value: p === null ? "–" : `${n} (${p.toFixed(1)}%)`, raw: p, tone: p === null ? undefined : p <= max ? "good" : "bad", hint: `${def.hint} ${n} ${unit}.` };
  };
  const count = (n: number): Out => ({ label: def.label, value: String(n), raw: n, tone: n ? "bad" : "good", hint: def.hint });

  switch (metric) {
    case "bei": {
      const due = acts.filter((a) => a.baselineFinish !== null && a.baselineFinish <= dd).length;
      const done = acts.filter((a) => a.status === "complete").length;
      return ratio(due ? done / due : null, 0.95, 0.9);
    }
    case "cpli": {
      const finish = Math.max(...open.map((a) => a.finish ?? -Infinity));
      const target = s.mustFinishBy ?? Math.max(...acts.map((a) => a.baselineFinish ?? -Infinity));
      if (!Number.isFinite(finish) || !Number.isFinite(target)) return ratio(null, 1, 0.95);
      const cpl = (finish - dd) / DAY;
      const tf = (target - finish) / DAY;
      return ratio(cpl > 0 ? (cpl + tf) / cpl : null, 1, 0.95);
    }
    case "spiT":
      return ratio(earnedSchedule(s)?.spiT ?? null, 1, 0.95);
    case "esFinish": {
      const e = earnedSchedule(s);
      const f = e && e.spiT ? e.start + e.plannedDuration / e.spiT : null;
      const bl = Math.max(...acts.map((a) => a.baselineFinish ?? -Infinity));
      return { label: def.label, value: fmtDay(f), raw: f, tone: f === null || !Number.isFinite(bl) ? undefined : f <= bl + DAY ? "good" : "bad", hint: def.hint };
    }
    case "ppc": {
      const days = opts.days ?? 7;
      const planned = acts.filter((a) => a.baselineFinish !== null && a.baselineFinish > dd - days * DAY && a.baselineFinish <= dd);
      const done = planned.filter((a) => a.status === "complete").length;
      const p = pct(done, planned.length);
      return { label: `${def.label}, last ${days} days`, value: p === null ? "–" : `${p.toFixed(0)}%`, raw: p, tone: p === null ? undefined : p >= 90 ? "good" : p < 75 ? "bad" : undefined, hint: `${def.hint} ${done} of ${planned.length} planned.` };
    }
    case "startsOnTime": {
      const st = acts.filter((a) => a.actualStart !== null && a.baselineStart !== null);
      const ok = st.filter((a) => a.actualStart! <= a.baselineStart! + DAY).length;
      const p = pct(ok, st.length);
      return { label: def.label, value: p === null ? "–" : `${p.toFixed(0)}%`, raw: p, tone: p === null ? undefined : p >= 90 ? "good" : p < 75 ? "bad" : undefined, hint: `${def.hint} ${ok} of ${st.length}.` };
    }
    case "finishesOnTime": {
      const fi = acts.filter((a) => a.actualFinish !== null && a.baselineFinish !== null);
      const ok = fi.filter((a) => a.actualFinish! <= a.baselineFinish! + DAY).length;
      const p = pct(ok, fi.length);
      return { label: def.label, value: p === null ? "–" : `${p.toFixed(0)}%`, raw: p, tone: p === null ? undefined : p >= 90 ? "good" : p < 75 ? "bad" : undefined, hint: `${def.hint} ${ok} of ${fi.length}.` };
    }
    case "missingLogic": {
      const ids = new Set(acts.map((a) => a.id));
      const hasPred = new Set(s.relationships.filter((r) => ids.has(r.predecessorId)).map((r) => r.successorId));
      const hasSucc = new Set(s.relationships.filter((r) => ids.has(r.successorId)).map((r) => r.predecessorId));
      const n = open.filter((a) => !hasPred.has(a.id) || !hasSucc.has(a.id)).length;
      return share(n, open.length, 5);
    }
    case "leads":
      return count(s.relationships.filter((r) => r.lagHours < 0).length);
    case "lags":
      return share(s.relationships.filter((r) => r.lagHours > 0).length, s.relationships.length, 5, "of relationships");
    case "fsPct": {
      const n = s.relationships.filter((r) => r.type === "FS").length;
      const p = pct(n, s.relationships.length);
      return { label: def.label, value: p === null ? "–" : `${p.toFixed(1)}%`, raw: p, tone: p === null ? undefined : p >= 90 ? "good" : "bad", hint: `${def.hint} ${n} of ${s.relationships.length}.` };
    }
    case "hardConstraints":
      return share(open.filter((a) => a.constraint?.type === "mandatory-start" || a.constraint?.type === "mandatory-finish").length, open.length, 5);
    case "highFloat":
      return share(open.filter((a) => a.totalFloatHours !== null && a.totalFloatHours / hpd > 44).length, open.length, 5);
    case "negFloat":
      return count(open.filter((a) => a.totalFloatHours !== null && a.totalFloatHours < 0).length);
    case "longDuration":
      return share(open.filter((a) => !isMs(a) && (a.remainingDurationHours ?? a.originalDurationHours ?? 0) / hpd > 44).length, open.length, 5);
    case "invalidDates":
      return count(acts.filter((a) => (a.actualStart !== null && a.actualStart > dd + 60_000) || (a.actualFinish !== null && a.actualFinish > dd + 60_000) || (a.status === "not-started" && a.start !== null && a.start < dd - 60_000) || (a.status !== "complete" && a.finish !== null && a.finish < dd - 60_000)).length);
  }
}
