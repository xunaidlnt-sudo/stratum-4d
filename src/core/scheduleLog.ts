// The schedule log P6 writes after F9: settings used, statistics, and the
// activities a planner should look at (out-of-sequence progress, open ends,
// constraints, impossible actual dates, suspended work).

import { DEFAULT_SCHEDULE_OPTIONS } from "./cpm";
import type { Activity, Schedule } from "./types";

export interface LogSection {
  title: string;
  lines: { code?: string; text: string }[];
}

export interface ScheduleLog {
  at: number;
  sections: LogSection[];
}

const fmt = (t: number | null | undefined) => {
  if (t === null || t === undefined) return "—";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};

export function scheduleLog(s: Schedule, warnings: string[] = []): ScheduleLog {
  const o = { ...DEFAULT_SCHEDULE_OPTIONS, ...(s.scheduleOptions ?? {}) };
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const hpd = (s.calendars?.find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0])?.hoursPerDay ?? 8;
  const dd = s.dataDate;
  const work = s.activities.filter((a) => a.type !== "loe" && a.type !== "wbs-summary");
  const start = work.reduce((m, a) => Math.min(m, a.actualStart ?? a.start ?? Infinity), Infinity);
  const finish = work.reduce((m, a) => Math.max(m, a.finish ?? -Infinity), -Infinity);
  const count = (st: Activity["status"]) => work.filter((a) => a.status === st).length;
  const preds = new Map<string, number>();
  const succs = new Map<string, number>();
  for (const r of s.relationships) {
    preds.set(r.successorId, (preds.get(r.successorId) ?? 0) + 1);
    succs.set(r.predecessorId, (succs.get(r.predecessorId) ?? 0) + 1);
  }

  // Out of sequence: started although a finish-to-start predecessor has not finished.
  const oos: LogSection["lines"] = [];
  for (const r of s.relationships) {
    if (r.type !== "FS") continue;
    const p = byId.get(r.predecessorId);
    const q = byId.get(r.successorId);
    if (!p || !q || q.actualStart === null || q.status === "not-started") continue;
    if (p.status !== "complete" || (p.actualFinish !== null && p.actualFinish > q.actualStart)) oos.push({ code: q.code, text: `${q.code} started ${fmt(q.actualStart)} before predecessor ${p.code} ${p.status === "complete" ? `finished ${fmt(p.actualFinish)}` : "finished"}` });
  }
  const noPred = work.filter((a) => a.status !== "complete" && !preds.get(a.id) && a.type !== "milestone").map((a) => ({ code: a.code, text: `${a.code} ${a.name}: no predecessor` }));
  const noSucc = work.filter((a) => a.status !== "complete" && !succs.get(a.id) && a.type !== "finish-milestone").map((a) => ({ code: a.code, text: `${a.code} ${a.name}: no successor` }));
  const constrained = work
    .filter((a) => a.constraint || a.secondaryConstraint)
    .map((a) => ({
      code: a.code,
      text: `${a.code} ${a.name}: ${a.constraint ? `${a.constraint.type} ${fmt(a.constraint.date)}` : ""}${a.secondaryConstraint ? `; ${a.secondaryConstraint.type} ${fmt(a.secondaryConstraint.date)}` : ""}${a.totalFloatHours !== null && a.totalFloatHours < 0 ? ` · total float ${Math.round((a.totalFloatHours / hpd) * 10) / 10}d` : ""}`,
    }));
  const badActuals =
    dd === null
      ? []
      : work
          .filter((a) => (a.actualStart !== null && a.actualStart > dd) || (a.actualFinish !== null && a.actualFinish > dd))
          .map((a) => ({ code: a.code, text: `${a.code}: actual ${a.actualFinish !== null && a.actualFinish > dd ? `finish ${fmt(a.actualFinish)}` : `start ${fmt(a.actualStart)}`} is after the data date ${fmt(dd)}` }));
  const suspended = work.filter((a) => a.suspendDate != null).map((a) => ({ code: a.code, text: `${a.code}: suspended ${fmt(a.suspendDate)}, ${a.resumeDate != null ? `resumes ${fmt(a.resumeDate)}` : "no resume date"}` }));
  const negative = work.filter((a) => a.totalFloatHours !== null && a.totalFloatHours < 0).length;

  const label = (v: string) => v.replace(/-/g, " ");
  const sections: LogSection[] = [
    {
      title: "Scheduling options",
      lines: [
        { text: `Data date ${fmt(dd)}${s.mustFinishBy != null ? `; must finish by ${fmt(s.mustFinishBy)}` : ""}` },
        { text: `Out-of-sequence progress: ${label(o.outOfSequence)}; total float: ${o.floatType} float; critical: ${o.criticalBy === "float" ? `total float ≤ ${Math.round((o.criticalFloatHours / hpd) * 10) / 10}d` : "longest path"}` },
        { text: `SS lag from ${label(o.ssLagFrom)}; open ends critical: ${o.openEndsCritical ? "yes" : "no"}; level when scheduling: ${o.levelWhenScheduling ? "yes" : "no"}; expected finish: ${o.useExpectedFinish ? "used" : "ignored"}` },
      ],
    },
    {
      title: "Statistics",
      lines: [
        { text: `${work.length} activities: ${count("not-started")} not started, ${count("in-progress")} in progress, ${count("complete")} completed; ${s.relationships.length} relationships` },
        { text: `Project start ${fmt(Number.isFinite(start) ? start : null)}, finish ${fmt(Number.isFinite(finish) ? finish : null)}` },
        { text: `${work.filter((a) => a.critical).length} critical, ${work.filter((a) => a.longestPath).length} on the longest path, ${negative} with negative float` },
      ],
    },
    { title: `Out-of-sequence activities (${oos.length})`, lines: oos },
    { title: `Activities without predecessors (${noPred.length})`, lines: noPred },
    { title: `Activities without successors (${noSucc.length})`, lines: noSucc },
    { title: `Constraints (${constrained.length})`, lines: constrained },
    { title: `Actual dates after the data date (${badActuals.length})`, lines: badActuals },
    { title: `Suspended activities (${suspended.length})`, lines: suspended },
    { title: `Other warnings (${warnings.filter((w) => !/no (pre|suc)cessor/.test(w)).length})`, lines: warnings.filter((w) => !/no (pre|suc)cessor/.test(w)).map((w) => ({ text: w })) },
  ];
  return { at: Date.now(), sections };
}

export function scheduleLogText(s: Schedule, log: ScheduleLog): string {
  const out = [`Schedule log – ${s.projectCode} ${s.projectName}`, `Generated ${new Date(log.at).toISOString().replace("T", " ").slice(0, 16)}`, ""];
  for (const sec of log.sections) {
    out.push(sec.title, "-".repeat(sec.title.length));
    if (!sec.lines.length) out.push("  none");
    for (const l of sec.lines) out.push(`  ${l.text}`);
    out.push("");
  }
  return out.join("\r\n");
}
