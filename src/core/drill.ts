// Drill-down for dashboard KPIs: the activities behind a figure, so a click on
// "Late against baseline: 12" lists the twelve. Metrics that are not counts of
// activities (SPI, BAC, dates) return null.

import { isLate } from "./dashboardData";
import type { KpiMetric } from "./reporting";
import type { Activity, Schedule } from "./types";

const DAY = 86_400_000;

export function kpiActivities(s: Schedule, metric: KpiMetric, opts: { days?: number } = {}): { title: string; rows: Activity[] } | null {
  const dd = s.dataDate ?? Date.now();
  const acts = s.activities.filter((a) => a.type !== "wbs-summary" && a.type !== "loe");
  const open = acts.filter((a) => a.status !== "complete");
  const cal = (s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0];
  const hpd = cal?.hoursPerDay || 8;
  const ids = new Set(acts.map((a) => a.id));
  switch (metric) {
    case "critical":
      return { title: "Open critical activities", rows: open.filter((a) => a.critical) };
    case "late":
      return { title: "Late against the baseline", rows: acts.filter(isLate) };
    case "startingSoon": {
      const days = opts.days ?? 14;
      return { title: `Starting in the next ${days} days`, rows: acts.filter((a) => a.status === "not-started" && a.start !== null && a.start >= dd && a.start < dd + days * DAY) };
    }
    case "activities":
      return { title: "All activities", rows: acts };
    case "bei":
      return { title: "Due by the data date (baseline) but not complete", rows: acts.filter((a) => a.baselineFinish !== null && a.baselineFinish <= dd && a.status !== "complete") };
    case "ppc": {
      const days = opts.days ?? 7;
      return { title: `Planned to finish in the last ${days} days but not complete`, rows: acts.filter((a) => a.baselineFinish !== null && a.baselineFinish > dd - days * DAY && a.baselineFinish <= dd && a.status !== "complete") };
    }
    case "startsOnTime":
      return { title: "Started later than the baseline start", rows: acts.filter((a) => a.actualStart !== null && a.baselineStart !== null && a.actualStart > a.baselineStart + DAY) };
    case "finishesOnTime":
      return { title: "Finished later than the baseline finish", rows: acts.filter((a) => a.actualFinish !== null && a.baselineFinish !== null && a.actualFinish > a.baselineFinish + DAY) };
    case "missingLogic": {
      const hasPred = new Set(s.relationships.filter((r) => ids.has(r.predecessorId)).map((r) => r.successorId));
      const hasSucc = new Set(s.relationships.filter((r) => ids.has(r.successorId)).map((r) => r.predecessorId));
      return { title: "Open activities missing a predecessor or successor", rows: open.filter((a) => !hasPred.has(a.id) || !hasSucc.has(a.id)) };
    }
    case "leads":
    case "lags": {
      const rels = s.relationships.filter((r) => (metric === "leads" ? r.lagHours < 0 : r.lagHours > 0));
      const succ = new Set(rels.map((r) => r.successorId));
      return { title: metric === "leads" ? "Successors of relationships with a lead" : "Successors of relationships with a lag", rows: acts.filter((a) => succ.has(a.id)) };
    }
    case "fsPct": {
      const succ = new Set(s.relationships.filter((r) => r.type !== "FS").map((r) => r.successorId));
      return { title: "Successors of SS, FF and SF relationships", rows: acts.filter((a) => succ.has(a.id)) };
    }
    case "hardConstraints":
      return { title: "Open activities with a mandatory constraint", rows: open.filter((a) => a.constraint?.type === "mandatory-start" || a.constraint?.type === "mandatory-finish") };
    case "highFloat":
      return { title: "Open activities with more than 44 days of float", rows: open.filter((a) => a.totalFloatHours !== null && a.totalFloatHours / hpd > 44) };
    case "negFloat":
      return { title: "Open activities with negative float", rows: open.filter((a) => a.totalFloatHours !== null && a.totalFloatHours < 0) };
    case "longDuration":
      return { title: "Open activities with more than 44 days remaining", rows: open.filter((a) => a.type !== "milestone" && a.type !== "finish-milestone" && (a.remainingDurationHours ?? a.originalDurationHours ?? 0) / hpd > 44) };
    case "invalidDates":
      return {
        title: "Activities with invalid dates",
        rows: acts.filter((a) => (a.actualStart !== null && a.actualStart > dd + 60_000) || (a.actualFinish !== null && a.actualFinish > dd + 60_000) || (a.status === "not-started" && a.start !== null && a.start < dd - 60_000) || (a.status !== "complete" && a.finish !== null && a.finish < dd - 60_000)),
      };
    case "finishVariance":
    case "finish":
    case "esFinish":
    case "cpli":
      return { title: "Open critical activities (they drive the finish)", rows: open.filter((a) => a.critical) };
    default:
      return null;
  }
}
