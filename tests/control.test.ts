import { assignBaseline } from "../src/core/baseline";
import { controlFigures, controlRows } from "../src/core/dashboardData";
import { adaptToFields, eppmCurveDashboard, eppmSummaryDashboard } from "../src/core/reporting";
import type { Activity, Schedule } from "../src/core/types";

const t = (x: string) => Date.parse(x + "T00:00:00Z");
const a = (code: string, wbsId: string, s: string, f: string, pct: number, hours: number, extra: Partial<Activity> = {}): Activity => ({
  id: code, code, name: code, wbsId, type: "task", status: pct >= 100 ? "complete" : pct > 0 ? "in-progress" : "not-started", percentComplete: pct,
  start: t(s), finish: t(f), baselineStart: t(s), baselineFinish: t(f), actualStart: pct > 0 ? t(s) : null, actualFinish: pct >= 100 ? t(f) : null,
  totalFloatHours: 0, originalDurationHours: hours, remainingDurationHours: hours, critical: false, calendarId: null, codes: {}, ...extra,
});
const sixDay = { id: "c", name: "6-day", hoursPerDay: 8, holidays: [], week: [[], [[8, 16]], [[8, 16]], [[8, 16]], [[8, 16]], [[8, 16]], [[8, 16]]] as [number, number][][] };
const base: Schedule = {
  projectId: "p", projectCode: "P", projectName: "Project", dataDate: t("2026-10-15"),
  wbs: [{ id: "E", parentId: null, code: "E", name: "Engineering", seq: 1 }, { id: "C", parentId: null, code: "C", name: "Construction", seq: 2 }],
  activities: [a("E1", "E", "2026-09-01", "2026-10-31", 50, 100), a("C1", "C", "2026-10-01", "2026-11-30", 10, 300)],
  relationships: [], calendars: [sixDay], defaultCalendarId: "c",
};

describe("assign baseline", () => {
  it("takes planned dates by Activity ID and clears them for new activities", () => {
    const bl: Schedule = { ...base, dataDate: t("2026-08-01"), activities: [a("E1", "E", "2026-08-15", "2026-10-15", 0, 100)] };
    const r = assignBaseline(base, bl, "Contract baseline");
    expect(r.matched).toBe(1);
    expect(r.missing).toEqual(["C1"]);
    const e = r.schedule.activities.find((x) => x.code === "E1")!;
    expect([e.baselineStart, e.baselineFinish]).toEqual([t("2026-08-15"), t("2026-10-15")]);
    expect(r.schedule.activities.find((x) => x.code === "C1")!.baselineFinish).toBeNull();
    expect(r.schedule.baselineInfo).toMatchObject({ name: "Contract baseline", matched: 1, missing: 1 });
  });
});

describe("project control figures", () => {
  it("reports weighted actual, month figures and durations", () => {
    const c = controlFigures(base, "duration");
    // Weights 100 h and 300 h: actual = (0.5×100 + 0.1×300) / 400 = 20%.
    expect(c.actualPct).toBeCloseTo(20, 5);
    expect(c.blUtm).toBeGreaterThan(c.blPlanPct);
    expect(c.sai).toBeCloseTo(c.actualPct / c.blUtm, 5);
    expect(c.estUtm).toBeGreaterThanOrEqual(c.estFtm);
    expect(c.estDuration).toBeCloseTo((t("2026-11-30") - t("2026-09-01")) / (30.4375 * 86_400_000), 5);
  });
  it("gives duration variance in work-week days", () => {
    const late = { ...base, activities: base.activities.map((x) => (x.code === "C1" ? { ...x, finish: t("2026-12-14") } : x)) };
    const r = controlRows(late, { dimension: "wbs1", basis: "duration" });
    // 30-Nov-26 → 14-Dec-26: 14 calendar days; the 6-day week has Sundays off, so 12 working days.
    expect(r.rows.find((x) => x.label === "Construction")!.durationVariance).toBe(12);
    expect(controlRows(late, { dimension: "wbs1", basis: "duration", days: "calendar" }).rows.find((x) => x.label === "Construction")!.durationVariance).toBe(14);
  });
});

describe("EPPM templates", () => {
  it("point slicers and the control table at the project's own fields", () => {
    const d = adaptToFields(eppmCurveDashboard(null), ["wbs1", "wbs2", "user:Discipline", "user:Work Package", "user:Domain"]);
    expect(d.widgets.filter((w) => w.kind === "slicer").map((w) => w.dimension)).toEqual(["user:Discipline", "user:Work Package", "wbs2", "user:Domain"]);
    const s = adaptToFields(eppmSummaryDashboard(null), ["user:Discipline"]);
    expect(s.widgets.find((w) => w.kind === "controltable")!.dimension).toBe("user:Discipline");
  });
});
