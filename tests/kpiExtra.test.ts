import { describe, expect, it } from "vitest";
import { scheduleCpm } from "../src/core/cpm";
import { kpi } from "../src/core/dashboardData";
import { demoXer } from "../src/core/demo";
import { earnedSchedule, EXTRA_METRICS, extraKpi } from "../src/core/kpiExtra";
import type { Activity, Schedule } from "../src/core/types";
import { parseXer } from "../src/core/xer";

const T = (s: string) => Date.parse(`${s}T08:00:00Z`);
function act(id: string, extra: Partial<Activity>): Activity {
  return { id, code: id, name: id, wbsId: null, type: "task", status: "not-started", percentComplete: 0, start: null, finish: null, baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: 0, originalDurationHours: 40, remainingDurationHours: 40, critical: false, calendarId: null, codes: {}, ...extra };
}
const base = (acts: Activity[], extra: Partial<Schedule> = {}): Schedule => ({ projectId: "p", projectCode: "P", projectName: "P", dataDate: T("2026-03-10"), activities: acts, wbs: [], relationships: [], ...extra });

describe("execution KPIs", () => {
  it("BEI: completed ÷ planned to finish by the data date", () => {
    const s = base([
      act("A", { status: "complete", baselineFinish: T("2026-03-02"), actualFinish: T("2026-03-03") }),
      act("B", { status: "in-progress", baselineFinish: T("2026-03-05") }),
      act("C", { baselineFinish: T("2026-04-01") }),
    ]);
    expect(extraKpi(s, "bei").raw).toBe(0.5);
    expect(extraKpi(s, "bei").tone).toBe("bad");
  });
  it("PPC over the period and on-time starts", () => {
    const s = base([
      act("A", { status: "complete", baselineStart: T("2026-03-02"), actualStart: T("2026-03-02"), baselineFinish: T("2026-03-06"), actualFinish: T("2026-03-06") }),
      act("B", { status: "in-progress", baselineStart: T("2026-03-02"), actualStart: T("2026-03-05"), baselineFinish: T("2026-03-09") }),
    ]);
    expect(extraKpi(s, "ppc", { days: 7 }).raw).toBe(50);
    expect(extraKpi(s, "startsOnTime").raw).toBe(50);
  });
  it("CPLI: float to the baseline finish over the remaining critical path", () => {
    const s = base([act("A", { status: "in-progress", finish: T("2026-04-09"), baselineFinish: T("2026-04-19") })]);
    // 30 days left, 10 days of float: (30 + 10) / 30
    expect(extraKpi(s, "cpli").raw).toBeCloseTo(40 / 30, 3);
  });
  it("earned schedule on the demo project", () => {
    const s = scheduleCpm(parseXer(demoXer())).schedule;
    const e = earnedSchedule(s)!;
    expect(e.es).toBeGreaterThan(0);
    expect(e.spiT).toBeGreaterThan(0.5);
    expect(e.spiT).toBeLessThan(1.5);
    expect(kpi(s, "spiT").raw).toBeCloseTo(e.spiT!, 6);
  });
});

describe("DCMA checks", () => {
  const s = base(
    [act("A", { totalFloatHours: -8 }), act("B", { totalFloatHours: 400, constraint: { type: "mandatory-finish", date: T("2026-05-01") } }), act("C", { remainingDurationHours: 50 * 8, start: T("2026-03-01") })],
    { relationships: [{ id: "1", predecessorId: "A", successorId: "B", type: "FS", lagHours: -8 }, { id: "2", predecessorId: "B", successorId: "C", type: "SS", lagHours: 16 }] },
  );
  it("counts leads, lags, FS share, constraints, float, durations and invalid dates", () => {
    expect(extraKpi(s, "leads").raw).toBe(1);
    expect(extraKpi(s, "lags").raw).toBe(50);
    expect(extraKpi(s, "fsPct").raw).toBe(50);
    expect(extraKpi(s, "hardConstraints").raw).toBeCloseTo(100 / 3);
    expect(extraKpi(s, "negFloat").raw).toBe(1);
    expect(extraKpi(s, "highFloat").raw).toBeCloseTo(100 / 3);
    expect(extraKpi(s, "longDuration").raw).toBeCloseTo(100 / 3);
    expect(extraKpi(s, "invalidDates").raw).toBe(1); // C not started but forecast to start before the data date
    expect(extraKpi(s, "missingLogic").raw).toBeCloseTo(200 / 3); // A has no predecessor, C no successor
  });
  it("every metric returns a value on a real schedule", () => {
    const d = scheduleCpm(parseXer(demoXer())).schedule;
    for (const m of EXTRA_METRICS) expect(typeof kpi(d, m).value).toBe("string");
  });
});
