// P6 Tracking: project-level figures for every project in a portfolio, for
// the Project Table, Project Gantt and Project Bar Chart tracking layouts.

import { evm } from "./evm";
import { epsNode } from "./multiproject";
import type { Schedule } from "./types";

const DAY = 86_400_000;

export interface ProjectFigures {
  id: string;
  code: string;
  name: string;
  eps: string[];
  dataDate: number | null;
  start: number | null;
  finish: number | null;
  baselineFinish: number | null;
  /** Finish variance in days (baseline − current); negative is late. */
  finishVarianceDays: number | null;
  activities: number;
  critical: number;
  complete: number;
  minFloatDays: number | null;
  plannedPct: number;
  earnedPct: number;
  bac: number;
  ac: number;
  eac: number;
  spi: number | null;
  cpi: number | null;
}

export function projectFigures(s: Schedule, id = s.projectId): ProjectFigures {
  const acts = s.activities.filter((a) => a.type !== "wbs-summary");
  let start = Infinity;
  let finish = -Infinity;
  let blFinish = -Infinity;
  let minFloat = Infinity;
  for (const a of acts) {
    const st = a.actualStart ?? a.start;
    const fi = a.actualFinish ?? a.finish;
    if (st !== null) start = Math.min(start, st);
    if (fi !== null) finish = Math.max(finish, fi);
    if (a.baselineFinish !== null) blFinish = Math.max(blFinish, a.baselineFinish);
    if (a.status !== "complete" && a.totalFloatHours !== null) minFloat = Math.min(minFloat, a.totalFloatHours);
  }
  const cal = (s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0];
  const hpd = cal?.hoursPerDay || 8;
  const m = evm(s, "cost");
  const f = Number.isFinite(finish) ? finish : null;
  const b = Number.isFinite(blFinish) ? blFinish : null;
  return {
    id,
    code: s.projectCode,
    name: s.projectName,
    eps: s.eps ?? [],
    dataDate: s.dataDate,
    start: Number.isFinite(start) ? start : null,
    finish: f,
    baselineFinish: b,
    finishVarianceDays: f !== null && b !== null ? Math.round((b - f) / DAY) : null,
    activities: acts.length,
    critical: acts.filter((a) => a.critical && a.status !== "complete").length,
    complete: acts.filter((a) => a.status === "complete").length,
    minFloatDays: Number.isFinite(minFloat) ? Math.round((minFloat / hpd) * 10) / 10 : null,
    plannedPct: m.plannedPct,
    earnedPct: m.earnedPct,
    bac: m.bac,
    ac: m.ac,
    eac: m.eac,
    spi: m.spi,
    cpi: m.cpi,
  };
}

export type TrackingGroup = "none" | "eps" | `pcode:${string}`;

export interface TrackingBand {
  key: string;
  label: string;
  projects: ProjectFigures[];
  /** Roll-up: earliest start, latest finish, sums of money, weighted percent. */
  total: Pick<ProjectFigures, "start" | "finish" | "bac" | "ac" | "eac" | "activities" | "critical"> & { earnedPct: number };
}

/** Projects grouped into bands (top EPS node, or a project code), each with totals. */
export function trackingBands(list: ProjectFigures[], group: TrackingGroup, codesOf: (id: string) => Record<string, string> = () => ({})): TrackingBand[] {
  const keyOf = (p: ProjectFigures): [string, string] => {
    if (group === "eps") {
      const top = p.eps[0];
      return top ? [epsNode(top).id, epsNode(top).name] : ["", "(no EPS)"];
    }
    if (group.startsWith("pcode:")) {
      const v = codesOf(p.id)[group.slice(6)] ?? "";
      return [v, v || "(no code)"];
    }
    return ["all", "All projects"];
  };
  const map = new Map<string, TrackingBand>();
  for (const p of list) {
    const [k, label] = keyOf(p);
    const b = map.get(k) ?? map.set(k, { key: k, label, projects: [], total: { start: null, finish: null, bac: 0, ac: 0, eac: 0, activities: 0, critical: 0, earnedPct: 0 } }).get(k)!;
    b.projects.push(p);
  }
  for (const b of map.values()) {
    const t = b.total;
    for (const p of b.projects) {
      if (p.start !== null) t.start = t.start === null ? p.start : Math.min(t.start, p.start);
      if (p.finish !== null) t.finish = t.finish === null ? p.finish : Math.max(t.finish, p.finish);
      t.bac += p.bac;
      t.ac += p.ac;
      t.eac += p.eac;
      t.activities += p.activities;
      t.critical += p.critical;
    }
    // Budget-weighted earned percent; plain average when there is no budget.
    t.earnedPct = t.bac > 0 ? b.projects.reduce((x, p) => x + p.earnedPct * p.bac, 0) / t.bac : b.projects.reduce((x, p) => x + p.earnedPct, 0) / Math.max(1, b.projects.length);
    b.projects.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
  }
  return [...map.values()].sort((x, y) => x.label.localeCompare(y.label));
}

export const TRACKING_METRICS: [keyof ProjectFigures, string, "money" | "pct" | "days" | "ratio" | "count"][] = [
  ["earnedPct", "Performance % Complete", "pct"],
  ["plannedPct", "Planned % Complete", "pct"],
  ["bac", "Budget at Completion", "money"],
  ["ac", "Actual Cost", "money"],
  ["eac", "Estimate at Completion", "money"],
  ["spi", "Schedule Performance Index", "ratio"],
  ["cpi", "Cost Performance Index", "ratio"],
  ["finishVarianceDays", "Finish Variance (days)", "days"],
  ["minFloatDays", "Lowest Total Float (days)", "days"],
  ["critical", "Critical Activities (open)", "count"],
];
