import { batchFinancialPeriods } from "../src/core/budget";
import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { wbsPerformance } from "../src/core/evm";
import { fieldCtx, fieldsFor, fieldText } from "../src/core/fields";
import { storePeriodPerformance } from "../src/core/ops";
import type { Schedule } from "../src/core/types";
import { usageSheet } from "../src/core/usage";
import { parseXer } from "../src/core/xer";

const demo = (): Schedule => scheduleCpm(parseXer(demoXer())).schedule;
const D = (s: string) => Date.parse(`${s}T00:00:00Z`);

describe("financial periods", () => {
  it("batch-creates months, quarters and weeks", () => {
    const m = batchFinancialPeriods(D("2026-01-15"), D("2026-04-01"), "month");
    expect(m.map((p) => p.name)).toEqual(["Jan-26", "Feb-26", "Mar-26"]);
    expect(m[1].start).toBe(D("2026-02-01"));
    expect(batchFinancialPeriods(D("2026-01-01"), D("2026-12-31"), "quarter").map((p) => p.name)).toEqual(["Q1-2026", "Q2-2026", "Q3-2026", "Q4-2026"]);
    const w = batchFinancialPeriods(D("2026-03-02"), D("2026-03-16"), "week");
    expect(w[0].name).toBe("W/E 08-Mar-26");
    expect(w[0].finish).toBe(D("2026-03-09"));
  });

  it("names stored periods and steps usage by financial period", () => {
    const s = demo();
    const fp = batchFinancialPeriods(D("2025-01-01"), D("2028-12-31"), "quarter");
    const withFp = { ...s, financialPeriods: fp };
    const stored = storePeriodPerformance(withFp);
    expect(stored.periods!.at(-1)!.name).toMatch(/^Q\d-20\d\d$/);
    const sheet = usageSheet(withFp, { by: "resource", step: "financial", measure: "cost" });
    expect(sheet.periods[0].label).toMatch(/^Q\d-/);
    const monthly = usageSheet(withFp, { by: "resource", step: "month", measure: "cost" });
    expect(sheet.totals.reduce((a, b) => a + b, 0)).toBeCloseTo(monthly.totals.reduce((a, b) => a + b, 0), 2);
  });
});

describe("WBS earned value techniques", () => {
  it("computes performance % by technique and by weighted milestones", () => {
    const s = demo();
    const w = s.wbs.find((x) => s.activities.some((a) => a.wbsId === x.id && a.status === "in-progress"))!;
    const set = (patch: Partial<typeof w>) => ({ ...s, wbs: s.wbs.map((x) => (x.id === w.id ? { ...x, ...patch } : x)) });
    const pct = wbsPerformance(s, w.id);
    const zero = wbsPerformance(set({ evTechnique: "0-100" }), w.id);
    const half = wbsPerformance(set({ evTechnique: "50-50" }), w.id);
    expect(zero).toBeLessThanOrEqual(half);
    expect(pct).toBeGreaterThan(0);
    const ms = wbsPerformance(set({ evTechnique: "wbs-milestones", milestones: [{ id: "1", name: "a", weight: 3, done: true }, { id: "2", name: "b", weight: 1, done: false }] }), w.id);
    expect(ms).toBeCloseTo(0.75, 9);
  });
});

describe("indicator UDFs", () => {
  it("show a coloured flag and accept the colour name", () => {
    const s = { ...demo(), udfDefs: [{ name: "Flag", type: "indicator" as const }] };
    const f = fieldsFor(s).find((x) => x.id === "user:Flag")!;
    const c = fieldCtx(s);
    const a = s.activities[0];
    const patch = f.set!(a, "green", c)!;
    expect(patch.userFields).toEqual({ Flag: "Green" });
    expect(fieldText(f, { ...a, ...patch }, c)).toBe("🟢");
    expect(f.set!(a, "", c)!.userFields).toEqual({});
  });
});
