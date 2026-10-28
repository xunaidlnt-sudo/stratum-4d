import { standardCalendar } from "../src/core/calendar";
import { scheduleCpm } from "../src/core/cpm";
import { levelResources } from "../src/core/level";
import { newActivityDefaults } from "../src/core/ops";
import type { Activity, Schedule } from "../src/core/types";
import { parseXer } from "../src/core/xer";

const T = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
function act(id: string, hours: number, extra: Partial<Activity> = {}): Activity {
  return { id, code: id, name: id, wbsId: null, type: "task", status: "not-started", percentComplete: 0, start: null, finish: null, baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: null, originalDurationHours: hours, remainingDurationHours: hours, critical: false, calendarId: null, codes: {}, ...extra };
}
const base = (extra: Partial<Schedule> = {}): Schedule => ({ projectId: "p", projectCode: "P", projectName: "P", dataDate: T("2026-03-02 08:00"), activities: [act("A1000", 8), act("A1010", 8), act("X5", 8)], wbs: [], relationships: [], calendars: [standardCalendar()], ...extra });

describe("project defaults for new activities", () => {
  it("numbers from the selected activity or after the highest ID with the prefix", () => {
    const s = base();
    expect(newActivityDefaults(s, s.activities[0]).code).toBe("A1020"); // A1010 is taken
    const d = { durationType: "fixed-units" as const, pctType: "physical" as const, activityType: "finish-milestone" as const, calendarId: null, durationDays: 3, idPrefix: "A", idSuffix: 1000, idIncrement: 10, incrementFromSelected: false };
    const r = newActivityDefaults({ ...s, projectDefaults: d }, s.activities[2]);
    expect(r).toMatchObject({ code: "A1020", type: "finish-milestone", pctType: "physical", durationType: "fixed-units", durationDays: 3 });
    expect(newActivityDefaults({ ...s, projectDefaults: { ...d, idPrefix: "CV-", idSuffix: 100 } }, null).code).toBe("CV-100");
  });
});

describe("resource calendars", () => {
  it("level against the resource's own working days", () => {
    // Resource works Mon-Wed only (calendar), limit 1/h; two 16 h tasks must run one after the other on its days.
    const cal3 = { ...standardCalendar("c3", "3-day"), week: [[], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [], [], []] as [number, number][][] };
    const s = scheduleCpm(
      base({
        activities: [act("A", 16), act("B", 16)],
        calendars: [standardCalendar(), cal3],
        resources: [{ id: "R", code: "R", name: "R", type: "labor", unit: "h", pricePerUnit: 1, maxUnitsPerHour: 1, calendarId: "c3" }],
        assignments: ["A", "B"].map((id) => ({ id: `x${id}`, activityId: id, resourceId: "R", budgetQty: 16, actualQty: 0, remainingQty: 16, budgetCost: 16, actualCost: 0, remainingCost: 16 })),
      }),
    ).schedule;
    const r = levelResources(s);
    const b = r.schedule.activities.find((x) => x.id === "B")!;
    const a = r.schedule.activities.find((x) => x.id === "A")!;
    expect(Math.max(a.start!, b.start!)).toBeGreaterThanOrEqual(Math.min(a.finish!, b.finish!));
  });
});

describe("XER codes", () => {
  it("imports project codes, resource codes and resource calendars", () => {
    const xer = (tables: Record<string, string[][]>) => ["ERMHDR\t19.12", ...Object.entries(tables).flatMap(([t, [f, ...rows]]) => [`%T\t${t}`, `%F\t${f.join("\t")}`, ...rows.map((r) => `%R\t${r.join("\t")}`)]), "%E"].join("\n");
    const s = parseXer(
      xer({
        PROJECT: [["proj_id", "proj_short_name", "last_recalc_date", "priority_num"], ["1", "P1", "2026-03-02 08:00", "300"]],
        CALENDAR: [["clndr_id", "clndr_name", "default_flag", "day_hr_cnt", "clndr_data"], ["1", "Std", "Y", "8", ""], ["2", "Night", "N", "8", ""]],
        PROJWBS: [["wbs_id", "proj_id", "parent_wbs_id", "wbs_short_name", "wbs_name", "proj_node_flag", "seq_num"], ["10", "1", "", "P1", "P1", "Y", "0"]],
        TASK: [["task_id", "proj_id", "wbs_id", "clndr_id", "task_code", "task_name", "task_type", "status_code", "target_drtn_hr_cnt", "remain_drtn_hr_cnt"], ["100", "1", "10", "1", "A100", "Task", "TT_Task", "TK_NotStart", "8", "8"]],
        RSRC: [["rsrc_id", "rsrc_short_name", "rsrc_name", "rsrc_type", "clndr_id"], ["5", "FIT", "Fitter", "RT_Labor", "2"]],
        RCATTYPE: [["rsrc_catg_type_id", "rsrc_catg_type"], ["71", "Trade"]],
        RCATVAL: [["rsrc_catg_id", "rsrc_catg_type_id", "rsrc_catg_short_name", "rsrc_catg_name"], ["106", "71", "MECH", "Mechanical"]],
        RSRCRCAT: [["rsrc_id", "rsrc_catg_type_id", "rsrc_catg_id"], ["5", "71", "106"]],
        PCATTYPE: [["proj_catg_type_id", "proj_catg_type"], ["67", "Region"]],
        PCATVAL: [["proj_catg_id", "proj_catg_type_id", "proj_catg_short_name", "proj_catg_name"], ["255", "67", "AUH", "Abu Dhabi"]],
        PROJPCAT: [["proj_id", "proj_catg_type_id", "proj_catg_id"], ["1", "67", "255"]],
      }),
    );
    expect(s.strategicPriority).toBe(300);
    expect(s.resources![0]).toMatchObject({ calendarId: "2", codes: { Trade: "MECH" } });
    expect(s.resourceCodeTypes).toEqual([{ name: "Trade", values: [{ value: "MECH", description: "Mechanical" }] }]);
    expect(s.projectCodes).toEqual({ Region: "AUH" });
    expect(s.projectCodeTypes?.[0].values[0].description).toBe("Abu Dhabi");
  });
});
