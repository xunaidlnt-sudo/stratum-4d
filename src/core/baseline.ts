// Assign a baseline from another schedule, as P6's Assign Baselines does:
// each current activity takes the baseline schedule's planned start and
// finish for the same Activity ID. Activities added since the baseline
// keep no baseline dates, so they never look "on plan" by accident.

import type { Schedule } from "./types";

export interface AssignResult {
  schedule: Schedule;
  matched: number;
  missing: string[];
  /** Activity IDs in the baseline that no longer exist. */
  dropped: string[];
}

export function assignBaseline(current: Schedule, baseline: Schedule, name?: string): AssignResult {
  const byCode = new Map(baseline.activities.map((a) => [a.code, a]));
  const seen = new Set<string>();
  const missing: string[] = [];
  let matched = 0;
  const activities = current.activities.map((a) => {
    const b = byCode.get(a.code);
    if (!b) {
      missing.push(a.code);
      return { ...a, baselineStart: null, baselineFinish: null };
    }
    seen.add(a.code);
    matched++;
    // A baseline file normally has no progress, so its start/finish are its plan.
    return { ...a, baselineStart: b.actualStart ?? b.start ?? b.baselineStart, baselineFinish: b.actualFinish ?? b.finish ?? b.baselineFinish };
  });
  const dropped = baseline.activities.filter((a) => !seen.has(a.code) && a.type !== "wbs-summary").map((a) => a.code);
  return {
    schedule: {
      ...current,
      activities,
      baselineInfo: {
        name: name ?? `${baseline.projectCode} – ${baseline.projectName}`,
        dataDate: baseline.dataDate,
        assignedAt: new Date().toISOString(),
        matched,
        missing: missing.length,
      },
    },
    matched,
    missing,
    dropped,
  };
}
