import { describe, expect, it } from "vitest";
import { scheduleCpm } from "../src/core/cpm";
import { kpi } from "../src/core/dashboardData";
import { demoXer } from "../src/core/demo";
import { kpiActivities } from "../src/core/drill";
import { parseXer } from "../src/core/xer";

const s = scheduleCpm(parseXer(demoXer())).schedule;

describe("KPI drill-down", () => {
  it("lists exactly the activities a count KPI counts", () => {
    for (const m of ["critical", "late", "negFloat", "hardConstraints", "invalidDates", "leads"] as const) {
      const d = kpiActivities(s, m)!;
      const k = kpi(s, m);
      if (m === "leads") expect(d.rows.length).toBeLessThanOrEqual(k.raw!);
      else expect(d.rows.length).toBe(k.raw);
    }
  });
  it("lists missing-logic activities consistent with the percentage", () => {
    const d = kpiActivities(s, "missingLogic")!;
    const open = s.activities.filter((a) => a.type !== "wbs-summary" && a.type !== "loe" && a.status !== "complete").length;
    expect((d.rows.length / open) * 100).toBeCloseTo(kpi(s, "missingLogic").raw!, 6);
  });
  it("returns null for figures that are not activity counts", () => {
    expect(kpiActivities(s, "spi")).toBeNull();
    expect(kpiActivities(s, "bac")).toBeNull();
  });
});
