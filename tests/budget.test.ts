import { standardCalendar } from "../src/core/calendar";
import { scheduleCpm } from "../src/core/cpm";
import { budgetSummary, DEFAULT_RISK_MATRIX, obsPath, obsTree, riskHeatMap, riskScore, spendingPlanCompare, spendingPlanFromSchedule, wbsObs } from "../src/core/budget";
import type { Activity, Schedule } from "../src/core/types";

const T = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
function act(id: string, hours: number, wbsId: string): Activity {
  return { id, code: id, name: id, wbsId, type: "task", status: "not-started", percentComplete: 0, start: null, finish: null, baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: null, originalDurationHours: hours, remainingDurationHours: hours, critical: false, calendarId: null, codes: {} };
}
const base = (): Schedule =>
  scheduleCpm({
    projectId: "p", projectCode: "P", projectName: "P", dataDate: T("2026-03-02 08:00"), calendars: [standardCalendar()], relationships: [],
    wbs: [{ id: "W1", parentId: null, code: "1", name: "Civil", seq: 0, originalBudget: 1000, obsId: "o2" }, { id: "W2", parentId: "W1", code: "1", name: "Piling", seq: 0, originalBudget: 600 }],
    activities: [act("A", 8 * 40, "W2")],
    resources: [{ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1 }],
    assignments: [{ id: "x", activityId: "A", resourceId: "R", budgetQty: 900, actualQty: 0, remainingQty: 900, budgetCost: 900, actualCost: 0, remainingCost: 900 }],
    obs: [{ id: "o1", parentId: null, name: "Company" }, { id: "o2", parentId: "o1", name: "Civil Manager" }],
    originalBudget: 5000,
    budgetChanges: [
      { id: "c1", wbsId: "W1", date: 0, amount: 200, reason: "Extra piles", responsible: "PM", status: "approved" },
      { id: "c2", wbsId: "W1", date: 0, amount: 50, reason: "Maybe", responsible: "PM", status: "pending" },
    ],
    fundingSources: [{ id: "f", parentId: null, name: "Owner" }],
    funding: [{ id: "fa", wbsId: "W1", sourceId: "f", amount: 700 }],
  }).schedule;

describe("budgets", () => {
  it("adds approved changes, distributes to children and shows funding", () => {
    const b = budgetSummary(base(), "W1");
    expect(b).toMatchObject({ original: 1000, approvedChanges: 200, pendingChanges: 50, current: 1200, proposed: 1250, distributed: 600, undistributed: 600, funded: 700, unfunded: 500, plannedCost: 900 });
    expect(budgetSummary(base(), null).distributed).toBe(1200);
  });

  it("compares the spending plan with planned cost month by month", () => {
    const s = spendingPlanFromSchedule(base(), "W1");
    const rows = spendingPlanCompare(s, "W1");
    expect(rows.length).toBeGreaterThanOrEqual(2); // 40 working days span two or three months
    expect(rows.at(-1)!.cumPlanned).toBeCloseTo(900, 6);
    expect(Math.abs(rows.at(-1)!.variance)).toBeLessThan(2); // seeded from the schedule, rounding only
    const more = { ...s, spendingPlan: s.spendingPlan!.map((r, i) => (i === 0 ? { ...r, spending: r.spending + 100 } : r)) };
    expect(spendingPlanCompare(more, "W1")[0].variance).toBeCloseTo(100, 0);
  });
});

describe("OBS", () => {
  it("builds paths and inherits the responsible manager down the WBS", () => {
    const s = base();
    expect(obsPath(s, "o2")).toBe("Company / Civil Manager");
    expect(wbsObs(s, "W2")).toBe("o2");
    expect(obsTree(s).map((x) => x.depth)).toEqual([0, 1]);
  });
});

describe("risk matrix", () => {
  const m = DEFAULT_RISK_MATRIX;
  const risk = (values: Record<string, string>) => ({ id: "r", values });
  it("scores labels, percentages and impacts in days or money", () => {
    expect(riskScore(risk({ Probability: "High", "Impact (Schedule)": "High" }), m)).toMatchObject({ probability: 3, impact: 3, score: 16, band: "high" });
    expect(riskScore(risk({ Probability: "35%", "Impact (Schedule)": "6" }), m)).toMatchObject({ probability: 2, impact: 1, score: 6, band: "medium" });
    expect(riskScore(risk({ Probability: "VL", "Impact (Cost)": "AED 2,000" }), m)).toMatchObject({ score: 1, band: "low" });
    // The worse of schedule and cost impact counts.
    expect(riskScore(risk({ Probability: "Low", "Impact (Schedule)": "2", "Impact (Cost)": "300000" }), m).impact).toBe(3);
    expect(riskScore(risk({ Probability: "" }), m).score).toBeNull();
  });

  it("counts risks per cell of the heat map", () => {
    const s = { ...base(), registers: { risks: [risk({ Probability: "High", "Impact (Schedule)": "High" }), risk({ Probability: "High", "Impact (Schedule)": "30" }), risk({ Probability: "?" })] } };
    const h = riskHeatMap(s);
    expect(h.counts[3][3]).toBe(2);
    expect(h.unscored).toBe(1);
  });
});
