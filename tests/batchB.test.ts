import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { editPeriodActual, setBuckets, storePeriodPerformance, topDownEstimate } from "../src/core/ops";
import type { Schedule } from "../src/core/types";
import { usageSheet } from "../src/core/usage";
import { parseXer } from "../src/core/xer";

const demo = (): Schedule => scheduleCpm(parseXer(demoXer())).schedule;
const M = (y: number, m: number) => Date.UTC(y, m - 1, 1);

describe("future period bucket planning", () => {
  it("puts remaining units in the periods entered", () => {
    const s = demo();
    const x = s.assignments!.find((a) => { const act = s.activities.find((b) => b.id === a.activityId)!; return act.status === "not-started" && a.remainingQty > 0; })!;
    const b = [{ start: M(2027, 1), finish: M(2027, 2), qty: 30 }, { start: M(2027, 3), finish: M(2027, 4), qty: 70 }];
    const s2 = setBuckets(s, x.id, b);
    const y = s2.assignments!.find((a) => a.id === x.id)!;
    expect(y.remainingQty).toBe(100);
    const one = { ...s2, assignments: [y] };
    const sheet = usageSheet(one, { by: "resource", step: "month", measure: "units" });
    const at = (t: number) => sheet.rows[0].values[sheet.periods.findIndex((p) => p.start === t)] ?? 0;
    expect(at(M(2027, 1))).toBeCloseTo(30, 6);
    expect(at(M(2027, 2))).toBeCloseTo(0, 6);
    expect(at(M(2027, 3))).toBeCloseTo(70, 6);
    expect(setBuckets(s2, x.id, []).assignments!.find((a) => a.id === x.id)!.buckets).toBeUndefined();
  });
});

describe("top-down estimation", () => {
  it("spreads total units over WBS by weight and activities by duration", () => {
    const s = { ...demo(), resources: [...(demo().resources ?? []), { id: "TD", code: "TD", name: "Top-down", type: "labor" as const, unit: "h", pricePerUnit: 2 }] };
    const [w1, w2] = s.wbs.filter((w) => s.activities.some((a) => a.wbsId === w.id && a.status !== "complete" && a.type === "task"));
    const r = topDownEstimate(s, { resourceId: "TD", totalUnits: 1000, weights: { [w1.id]: 3, [w2.id]: 1 } });
    const mine = r.schedule.assignments!.filter((x) => x.resourceId === "TD");
    expect(mine.reduce((t, x) => t + x.budgetQty, 0)).toBeCloseTo(1000, 0);
    expect(r.byWbs[w1.id]).toBeCloseTo(750, 6);
    expect(mine.every((x) => Math.abs(x.budgetCost - x.budgetQty * 2) < 0.05)).toBe(true);
    // Running it again updates the same assignments instead of adding more.
    const again = topDownEstimate(r.schedule, { resourceId: "TD", totalUnits: 500, weights: { [w1.id]: 1 } });
    expect(again.schedule.assignments!.filter((x) => x.resourceId === "TD").length).toBe(mine.length);
  });
});

describe("past period editing", () => {
  it("changes stored actuals of one activity in a period", () => {
    const s = storePeriodPerformance(demo());
    const p = s.periods![0];
    const id = Object.keys(p.actuals)[0];
    const e = editPeriodActual(s, p.id, id, { pct: 42 });
    expect(e.periods![0].actuals[id].pct).toBe(42);
    expect(e.periods![0].actuals[id].actualCost).toBe(p.actuals[id].actualCost);
  });
});
