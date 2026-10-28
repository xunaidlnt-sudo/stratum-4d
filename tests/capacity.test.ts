import { capacityPlan } from "../src/core/capacity";
import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { parseXer } from "../src/core/xer";

describe("capacity planning", () => {
  it("adds demand across projects and counts each resource's capacity once", () => {
    const a = scheduleCpm(parseXer(demoXer())).schedule;
    const b = { ...a, projectCode: "B" };
    const one = capacityPlan([a], "resource");
    const two = capacityPlan([a, b], "resource");
    expect(one.rows.length).toBeGreaterThan(0);
    const r1 = one.rows[0];
    const r2 = two.rows.find((r) => r.key === r1.key)!;
    expect(r2.demand.reduce((x, y) => x + y, 0)).toBeCloseTo(2 * r1.demand.reduce((x, y) => x + y, 0), 3);
    expect(r2.capacity).toEqual(r1.capacity);
    expect(Object.keys(r2.byProject).sort()).toEqual([a.projectCode, "B"].sort());
  });
});
