import { describe, expect, it } from "vitest";
import { standardCalendar } from "../src/core/calendar";
import { scheduleCpm } from "../src/core/cpm";
import { levelingComparator, levelResources } from "../src/core/level";
import { recalcAssignmentCosts } from "../src/core/ops";
import { priceAt } from "../src/core/resources";
import type {
  Activity,
  Assignment,
  Calendar,
  Resource,
  Schedule,
} from "../src/core/types";

const T = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
const cal = standardCalendar();
// Four-day week, Mon-Thu 08-17 with lunch: 32 h/week.
const fourDay: Calendar = {
  ...standardCalendar("4d", "4-day"),
  week: [
    [],
    [
      [8, 12],
      [13, 17],
    ],
    [
      [8, 12],
      [13, 17],
    ],
    [
      [8, 12],
      [13, 17],
    ],
    [
      [8, 12],
      [13, 17],
    ],
    [],
    [],
  ],
};
function act(
  id: string,
  hours: number,
  extra: Partial<Activity> = {},
): Activity {
  return {
    id,
    code: id,
    name: id,
    wbsId: null,
    type: "task",
    status: "not-started",
    percentComplete: 0,
    start: null,
    finish: null,
    baselineStart: null,
    baselineFinish: null,
    actualStart: null,
    actualFinish: null,
    totalFloatHours: null,
    originalDurationHours: hours,
    remainingDurationHours: hours,
    critical: false,
    calendarId: null,
    codes: {},
    ...extra,
  };
}
const asg = (
  id: string,
  activityId: string,
  resourceId: string,
  qty: number,
  extra: Partial<Assignment> = {},
): Assignment => ({
  id,
  activityId,
  resourceId,
  budgetQty: qty,
  actualQty: 0,
  remainingQty: qty,
  budgetCost: 0,
  actualCost: 0,
  remainingCost: 0,
  ...extra,
});
const base = (extra: Partial<Schedule>): Schedule => ({
  projectId: "p",
  projectCode: "P",
  projectName: "P",
  dataDate: T("2026-03-02 08:00"),
  activities: [],
  wbs: [],
  relationships: [],
  calendars: [cal, fourDay],
  defaultCalendarId: "std",
  ...extra,
});

describe("rate types and rate source", () => {
  const r: Resource = {
    id: "R",
    code: "R",
    name: "Crane",
    type: "equipment",
    unit: "h",
    pricePerUnit: 100,
    prices: [100, 150, 200, 0, 0],
    roleIds: ["OP"],
  };
  it("picks Price/Unit 1-5", () => {
    expect(priceAt(r, 0)).toBe(100);
    expect(priceAt(r, 0, 2)).toBe(150);
    expect(priceAt(r, 0, 3)).toBe(200);
    expect(priceAt(r, 0, 4)).toBe(0);
  });
  it("dated rates carry their own five prices", () => {
    const rr: Resource = {
      ...r,
      rates: [
        {
          from: T("2026-04-01 00:00"),
          pricePerUnit: 110,
          prices: [110, 170, 0, 0, 0],
        },
      ],
    };
    expect(priceAt(rr, T("2026-03-10 00:00"), 2)).toBe(150);
    expect(priceAt(rr, T("2026-04-10 00:00"), 2)).toBe(170);
  });
  it("recalculates by rate type, role source and override", () => {
    const s = scheduleCpm(
      base({
        activities: [act("A", 8)],
        resources: [r],
        roles: [
          {
            id: "OP",
            code: "OP",
            name: "Operator",
            pricePerUnit: 60,
            prices: [60, 75, 0, 0, 0],
          },
        ],
        assignments: [
          asg("1", "A", "R", 10, { rateType: 2 }),
          asg("2", "A", "R", 10, {
            rateSource: "role",
            rateType: 2,
            roleId: "OP",
          }),
          asg("3", "A", "R", 10, { rateSource: "override", priceOverride: 42 }),
        ],
      }),
    ).schedule;
    const out = recalcAssignmentCosts(s).schedule.assignments!;
    expect(out.map((x) => x.budgetCost)).toEqual([1500, 750, 420]);
  });
});

describe("resource-dependent activities", () => {
  const crew: Resource = {
    id: "C",
    code: "C",
    name: "Crew",
    type: "labor",
    unit: "h",
    pricePerUnit: 1,
    calendarId: "4d",
  };
  it("use the driving resource's calendar", () => {
    const mk = (type: Activity["type"]) =>
      scheduleCpm(
        base({
          activities: [act("A", 40, { type })],
          resources: [crew],
          assignments: [asg("x", "A", "C", 40)],
        }),
      ).schedule.activities[0];
    const task = mk("task");
    const rd = mk("resource-dependent");
    expect(new Date(task.finish!).toISOString()).toBe(
      "2026-03-06T17:00:00.000Z",
    ); // Mon-Fri
    expect(new Date(rd.finish!).toISOString()).toBe("2026-03-09T17:00:00.000Z"); // Mon-Thu, then next Mon
  });
  it("ignore assignments that don't drive dates", () => {
    const a = scheduleCpm(
      base({
        activities: [act("A", 40, { type: "resource-dependent" })],
        resources: [crew],
        assignments: [asg("x", "A", "C", 40, { drivesDates: false })],
      }),
    ).schedule.activities[0];
    expect(new Date(a.finish!).toISOString()).toBe("2026-03-06T17:00:00.000Z");
  });
});

describe("levelling priorities", () => {
  it("compares field by field, ascending or descending", () => {
    const s = base({});
    const a = act("A", 8, { levelingPriority: 1, totalFloatHours: 50 });
    const b = act("B", 8, { levelingPriority: 3, totalFloatHours: 0 });
    const c = act("C", 8, {
      levelingPriority: 1,
      totalFloatHours: 10,
      codes: { Zone: "Z2" },
    });
    const sort = (pr: { field: string; desc?: boolean }[]) =>
      [a, b, c]
        .sort(levelingComparator({ priorities: pr }, s))
        .map((x) => x.id);
    expect(sort([{ field: "total-float" }])).toEqual(["B", "C", "A"]);
    expect(
      sort([{ field: "leveling-priority" }, { field: "total-float" }]),
    ).toEqual(["C", "A", "B"]);
    expect(
      sort([
        { field: "leveling-priority" },
        { field: "total-float", desc: true },
      ]),
    ).toEqual(["A", "C", "B"]);
    expect(sort([{ field: "code:Zone" }])).toEqual(["C", "A", "B"]);
  });
  it("decide which activity levelling places first", () => {
    const r: Resource = {
      id: "R",
      code: "R",
      name: "R",
      type: "labor",
      unit: "h",
      pricePerUnit: 1,
      maxUnitsPerHour: 1,
    };
    const s = scheduleCpm(
      base({
        activities: [act("A", 8), act("B", 8, { levelingPriority: 1 })],
        resources: [r],
        assignments: [asg("1", "A", "R", 8), asg("2", "B", "R", 8)],
      }),
    ).schedule;
    const byPri = levelResources(s, {
      priorities: [{ field: "leveling-priority" }],
    }).schedule.activities;
    expect(byPri.find((x) => x.id === "B")!.start).toBeLessThan(
      byPri.find((x) => x.id === "A")!.start!,
    );
    const byId = levelResources(s, { priorities: [{ field: "activity-id" }] })
      .schedule.activities;
    expect(byId.find((x) => x.id === "A")!.start).toBeLessThan(
      byId.find((x) => x.id === "B")!.start!,
    );
  });
});
