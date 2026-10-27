import { standardCalendar } from "../src/core/calendar";
import { scheduleCpm } from "../src/core/cpm";
import { levelResources, overloads } from "../src/core/level";
import { recalcAssignmentCosts } from "../src/core/ops";
import { costAccountPath, costAccountTotals, costOverTime, curveCumulative, maxUnitsAt, priceAt, resourcesForRole, shiftCapacity, staffRole, STANDARD_CURVES } from "../src/core/resources";
import type { Activity, Assignment, Resource, Schedule } from "../src/core/types";
import { usageSheet } from "../src/core/usage";
import { parseXer } from "../src/core/xer";

const T = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
const cal = standardCalendar();
function act(id: string, hours: number, extra: Partial<Activity> = {}): Activity {
  return { id, code: id, name: id, wbsId: null, type: "task", status: "not-started", percentComplete: 0, start: null, finish: null, baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: null, originalDurationHours: hours, remainingDurationHours: hours, critical: false, calendarId: null, codes: {}, ...extra };
}
const asg = (id: string, activityId: string, resourceId: string, qty: number, extra: Partial<Assignment> = {}): Assignment => ({ id, activityId, resourceId, budgetQty: qty, actualQty: 0, remainingQty: qty, budgetCost: 0, actualCost: 0, remainingCost: qty, ...extra });
const sched = (extra: Partial<Schedule>): Schedule => scheduleCpm({ projectId: "p", projectCode: "P", projectName: "P", dataDate: T("2026-03-02 08:00"), activities: [], wbs: [], relationships: [], calendars: [cal], ...extra }).schedule;

describe("rates over time", () => {
  const r: Resource = { id: "R", code: "R", name: "Fitter", type: "labor", unit: "h", pricePerUnit: 10, rates: [{ from: T("2026-03-04 00:00"), pricePerUnit: 20, maxUnitsPerHour: 2 }] };

  it("picks the rate in force", () => {
    expect(priceAt(r, T("2026-03-02 08:00"))).toBe(10);
    expect(priceAt(r, T("2026-03-05 08:00"))).toBe(20);
    expect(maxUnitsAt(r, T("2026-03-02 08:00"))).toBeUndefined();
    expect(maxUnitsAt(r, T("2026-03-04 08:00"))).toBe(2);
  });

  it("prices each day at its own rate", () => {
    // 40 units over Mon–Fri, evenly by elapsed time: Mon–Tue at 10, Wed–Fri at 20.
    const c = costOverTime(r, 40, T("2026-03-02 00:00"), T("2026-03-07 00:00"));
    expect(c).toBeCloseTo(16 * 10 + 24 * 20, 6);
  });

  it("recalculates assignment costs with rates and role prices", () => {
    const s = sched({
      activities: [act("A", 40)],
      resources: [r],
      roles: [{ id: "ELEC", code: "ELEC", name: "Electrician", pricePerUnit: 7 }],
      assignments: [asg("x1", "A", "R", 40), asg("x2", "A", "", 10, { roleId: "ELEC" })],
    });
    const out = recalcAssignmentCosts(s).schedule.assignments!;
    const a1 = out.find((x) => x.id === "x1")!;
    expect(a1.budgetCost).toBeGreaterThan(400); // part of the work falls after the rise to 20
    expect(a1.budgetCost).toBeLessThan(800);
    expect(out.find((x) => x.id === "x2")!.budgetCost).toBe(70); // unstaffed: priced by the role
  });
});

describe("resource curves", () => {
  it("cumulates from 0 to 1 and front-loads when asked", () => {
    for (const c of STANDARD_CURVES) {
      const F = curveCumulative(c);
      expect(F(0)).toBeCloseTo(0, 9);
      expect(F(1)).toBeCloseTo(1, 9);
    }
    const front = curveCumulative(STANDARD_CURVES.find((c) => c.name === "Front Loaded"));
    const back = curveCumulative(STANDARD_CURVES.find((c) => c.name === "Back Loaded"));
    expect(front(0.5)).toBeGreaterThan(0.6);
    expect(back(0.5)).toBeLessThan(0.4);
    expect(curveCumulative(null)(0.3)).toBeCloseTo(0.3, 9);
  });

  it("spreads usage by the assignment's curve", () => {
    const s = sched({
      activities: [act("A", 80 * 4)], // ~8 weeks
      resources: [{ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1 }],
      assignments: [asg("x", "A", "R", 800)],
    });
    const lin = usageSheet(s, { by: "resource", step: "week", measure: "units" }).rows[0].values;
    const front = usageSheet({ ...s, assignments: [{ ...s.assignments![0], curveId: "std-front" }] }, { by: "resource", step: "week", measure: "units" }).rows[0].values;
    expect(front.reduce((a, b) => a + b, 0)).toBeCloseTo(800, 6);
    expect(front[0]).toBeGreaterThan(lin[0]);
    expect(front[front.length - 1]).toBeLessThan(lin[lin.length - 1]);
  });
});

describe("shifts and levelling", () => {
  it("gives a day's capacity from the shift periods and the calendar", () => {
    // Day shift 2 units 08–12, 1 unit from 12; standard calendar works 08–12 and 13–17.
    const cap = shiftCapacity({ id: "S", name: "S", periods: [{ start: 0, maxUnits: 0 }, { start: 8, maxUnits: 2 }, { start: 12, maxUnits: 1 }] }, cal, T("2026-03-02 00:00"));
    expect(cap).toBe(2 * 4 + 1 * 4);
  });

  it("levels against a shift and against a limit that starts later", () => {
    const base = (res: Resource) =>
      sched({
        activities: [act("A", 16), act("B", 16)],
        resources: [res],
        assignments: [asg("a", "A", "R", 16), asg("b", "B", "R", 16)],
      });
    // A shift of one unit all day: A and B cannot run together.
    const shifted = base({ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1, shiftId: "S" });
    const withShift = { ...shifted, shifts: [{ id: "S", name: "One crew", periods: [{ start: 0, maxUnits: 1 }] }] };
    expect(overloads(withShift)[0].days).toBeGreaterThan(0);
    const r1 = levelResources(withShift);
    expect(r1.delayed).toBeGreaterThan(0);
    expect(overloads(r1.schedule)[0].days).toBe(0);
    // A limit of 2/h from the start: no clash. A limit only from next month: still no clash now, so nothing moves.
    const two = base({ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1, maxUnitsPerHour: 2 });
    expect(levelResources(two).delayed).toBe(0);
    const later = base({ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1, maxUnitsPerHour: 2, rates: [{ from: T("2026-04-01 00:00"), pricePerUnit: 1, maxUnitsPerHour: 1 }] });
    expect(levelResources(later).delayed).toBe(0);
    // A limit of 1/h that applies now forces a delay.
    const now = base({ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1, maxUnitsPerHour: 2, rates: [{ from: T("2026-03-01 00:00"), pricePerUnit: 1, maxUnitsPerHour: 1 }] });
    expect(levelResources(now).delayed).toBeGreaterThan(0);
  });
});

describe("roles", () => {
  it("lists resources for a role and staffs an unstaffed assignment", () => {
    const s = sched({
      activities: [act("A", 8)],
      resources: [
        { id: "R1", code: "R1", name: "Ali", type: "labor", unit: "h", pricePerUnit: 30, roleIds: ["ELEC"] },
        { id: "R2", code: "R2", name: "Ben", type: "labor", unit: "h", pricePerUnit: 25 },
      ],
      roles: [{ id: "ELEC", code: "ELEC", name: "Electrician", pricePerUnit: 20 }],
      assignments: [asg("x", "A", "", 8, { roleId: "ELEC" })],
    });
    expect(resourcesForRole(s, "ELEC").map((r) => r.id)).toEqual(["R1"]);
    const staffed = staffRole(s, "x", "R1").assignments![0];
    expect(staffed.resourceId).toBe("R1");
    expect(staffed.roleId).toBe("ELEC");
    expect(staffed.budgetCost).toBe(240);
  });
});

describe("cost accounts", () => {
  it("rolls assignment and expense costs up the account tree", () => {
    const s = sched({
      activities: [act("A", 8)],
      resources: [{ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1 }],
      costAccounts: [
        { id: "c1", parentId: null, code: "100", name: "Construction" },
        { id: "c2", parentId: "c1", code: "110", name: "Labour" },
        { id: "c3", parentId: "c1", code: "120", name: "Plant" },
      ],
      assignments: [asg("x", "A", "R", 8, { budgetCost: 800, remainingCost: 800, costAccountId: "c2" }), asg("y", "A", "R", 2, { budgetCost: 50, remainingCost: 50 })],
      registers: { expenses: [{ id: "e", values: { "Expense Item": "Crane", "Cost Account": "120", "Budgeted Cost": "1,000", "Actual Cost": "200", "Remaining Cost": "800" } }] } as Schedule["registers"],
    });
    const t = costAccountTotals(s);
    const by = (code: string | null) => t.find((x) => (x.account?.code ?? null) === code)!;
    expect(by("100").budget).toBe(1800);
    expect(by("110").budget).toBe(800);
    expect(by("120").actual).toBe(200);
    expect(by(null).budget).toBe(50); // not booked anywhere
    expect(by("110").depth).toBe(1);
    expect(costAccountPath(s, "c3")).toBe("100.120");
    // A default account takes unbooked costs.
    expect(costAccountTotals({ ...s, defaultCostAccountId: "c3" }).find((x) => x.account?.code === "120")!.budget).toBe(1050);
  });
});

describe("XER import", () => {
  const xer = (tables: Record<string, string[][]>) =>
    ["ERMHDR\t19.12", ...Object.entries(tables).flatMap(([t, [f, ...rows]]) => [`%T\t${t}`, `%F\t${f.join("\t")}`, ...rows.map((r) => `%R\t${r.join("\t")}`)]), "%E"].join("\n");

  it("reads rates over time, roles, curves, cost accounts and role assignments", () => {
    const text = xer({
      PROJECT: [["proj_id", "proj_short_name", "last_recalc_date"], ["1", "P1", "2026-03-02 08:00"]],
      CALENDAR: [["clndr_id", "clndr_name", "default_flag", "day_hr_cnt", "clndr_data"], ["1", "Std", "Y", "8", ""]],
      PROJWBS: [["wbs_id", "proj_id", "parent_wbs_id", "wbs_short_name", "wbs_name", "proj_node_flag", "seq_num"], ["10", "1", "", "P1", "P1", "Y", "0"]],
      TASK: [["task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name", "task_type", "status_code", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "early_start_date", "early_end_date"], ["100", "1", "10", "1", "A100", "Task", "TT_Task", "TK_NotStart", "40", "40", "2026-03-02 08:00", "2026-03-06 17:00"]],
      RSRC: [["rsrc_id", "rsrc_short_name", "rsrc_name", "rsrc_type", "role_id", "level_flag"], ["5", "FIT", "Fitter", "RT_Labor", "7", "Y"]],
      RSRCRATE: [["rsrc_rate_id", "rsrc_id", "max_qty_per_hr", "cost_per_qty", "start_date", "shift_period_id"], ["2", "5", "2", "25", "2026-04-01 00:00", ""], ["1", "5", "1", "20", "2026-01-01 00:00", ""]],
      ROLES: [["role_id", "role_short_name", "role_name"], ["7", "MECH", "Mechanical"]],
      ROLERATE: [["role_rate_id", "role_id", "cost_per_qty"], ["1", "7", "18"]],
      ACCOUNT: [["acct_id", "parent_acct_id", "acct_short_name", "acct_name"], ["50", "", "100", "Direct"], ["51", "50", "110", "Labour"]],
      RSRCCURVDATA: [["curv_id", "curv_name", ...Array.from({ length: 21 }, (_, i) => `pct_usage_${i}`)], ["9", "Ramp", ...Array.from({ length: 21 }, (_, i) => String(i))]],
      TASKRSRC: [
        ["taskrsrc_id", "task_id", "rsrc_id", "role_id", "acct_id", "curv_id", "target_qty", "remain_qty", "target_cost", "remain_cost"],
        ["900", "100", "5", "7", "51", "9", "40", "40", "800", "800"],
        ["901", "100", "", "7", "", "", "10", "10", "180", "180"],
      ],
    });
    const s = parseXer(text);
    const r = s.resources![0];
    expect(r.pricePerUnit).toBe(20);
    expect(r.maxUnitsPerHour).toBe(1);
    expect(r.rates?.map((x) => x.pricePerUnit)).toEqual([20, 25]);
    expect(r.roleIds).toEqual(["7"]);
    expect(s.roles?.[0]).toMatchObject({ code: "MECH", pricePerUnit: 18 });
    expect(s.curves?.[0].values[20]).toBe(20);
    expect(costAccountPath(s, "51")).toBe("100.110");
    const [x, y] = s.assignments!;
    expect(x).toMatchObject({ roleId: "7", curveId: "9", costAccountId: "51" });
    expect(y).toMatchObject({ resourceId: "", roleId: "7" });
  });
});

