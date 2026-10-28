import { describe, expect, it } from "vitest";
import { scheduleCpm } from "../src/core/cpm";
import { applyBaseline, baselineOptions, baselineReady, dashboardReadiness, widgetNeedsBaseline } from "../src/core/dashboardBaseline";
import { demoXer } from "../src/core/demo";
import type { Schedule } from "../src/core/types";
import { parseXer } from "../src/core/xer";

const base = scheduleCpm(parseXer(demoXer())).schedule;
const noBl: Schedule = { ...base, activities: base.activities.map((a) => ({ ...a, baselineStart: null, baselineFinish: null })) };
const stored = (s: Schedule, id: string, shiftDays: number): Schedule => ({
  ...s,
  baselines: [...(s.baselines ?? []), { id, name: `BL ${id}`, createdAt: "2026-01-01", dataDate: s.dataDate, dates: Object.fromEntries(s.activities.map((a) => [a.code, [a.start === null ? null : a.start + shiftDays * 86_400_000, a.finish === null ? null : a.finish + shiftDays * 86_400_000]])) }],
});

describe("dashboard baselines", () => {
  it("lists the project baseline and stored baselines with coverage", () => {
    const s = stored(noBl, "b1", 0);
    const o = baselineOptions(s);
    expect(o.map((x) => x.id)).toEqual([null, "b1"]);
    expect(o[0].coverage).toBe(0);
    expect(o[1].coverage).toBe(1);
  });
  it("applies a stored baseline's dates to the activities", () => {
    const s = applyBaseline(stored(noBl, "b1", 10), "b1");
    const a = s.activities.find((x) => x.start !== null)!;
    expect(a.baselineStart).toBe(a.start! + 10 * 86_400_000);
    expect(applyBaseline(noBl, null)).toBe(noBl);
    expect(applyBaseline(noBl, "missing")).toBe(noBl);
  });
  it("requires a baseline before baseline KPIs are trusted", () => {
    const c0 = dashboardReadiness(noBl, null);
    expect(c0.find((c) => c.id === "baseline")!.ok).toBe(false);
    expect(baselineReady(c0)).toBe(false);
    const c1 = dashboardReadiness(stored(noBl, "b1", 0), "b1");
    expect(c1.find((c) => c.id === "baseline")!.ok).toBe(true);
    expect(c1.find((c) => c.id === "scheduled")!.ok).toBe(true);
    expect(baselineReady(c1)).toBe(true);
    expect(baselineReady(dashboardReadiness({ ...stored(noBl, "b1", 0), dataDate: null }, "b1"))).toBe(false);
  });
  it("knows which widgets compare against the baseline", () => {
    expect(widgetNeedsBaseline({ id: "", kind: "kpi", title: "", w: 3, h: 1, metric: "spi" })).toBe(true);
    expect(widgetNeedsBaseline({ id: "", kind: "kpi", title: "", w: 3, h: 1, metric: "percentComplete" })).toBe(false);
    expect(widgetNeedsBaseline({ id: "", kind: "scurve", title: "", w: 3, h: 1 })).toBe(true);
    expect(widgetNeedsBaseline({ id: "", kind: "table", title: "", w: 3, h: 1 })).toBe(false);
  });
});
