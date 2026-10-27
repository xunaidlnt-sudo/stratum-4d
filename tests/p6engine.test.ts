import { standardCalendar } from "../src/core/calendar";
import { scheduleCpm } from "../src/core/cpm";
import { levelResources, overloads } from "../src/core/level";
import type { Activity, Relationship, Schedule } from "../src/core/types";

const T = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
const cal = standardCalendar();
const MON = "2026-03-02";
function act(id: string, hours: number, extra: Partial<Activity> = {}): Activity {
  return { id, code: id, name: id, wbsId: null, type: "task", status: "not-started", percentComplete: 0, start: null, finish: null, baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: null, originalDurationHours: hours, remainingDurationHours: hours, critical: false, calendarId: null, codes: {}, ...extra };
}
const rel = (p: string, s: string, type: Relationship["type"] = "FS", lagHours = 0): Relationship => ({ id: `${p}-${s}`, predecessorId: p, successorId: s, type, lagHours });
const sched = (activities: Activity[], relationships: Relationship[], extra: Partial<Schedule> = {}): Schedule => ({ projectId: "p", projectCode: "P", projectName: "P", dataDate: T(`${MON} 08:00`), activities, wbs: [], relationships, calendars: [cal], ...extra });
const get = (s: Schedule, id: string) => s.activities.find((a) => a.id === id)!;

describe("Schedule Options", () => {
  const net = () => sched([act("A", 8), act("B", 24), act("C", 8), act("D", 8)], [rel("A", "B"), rel("A", "C"), rel("B", "D"), rel("C", "D")]);

  it("marks driving relationships and the longest path", () => {
    const r = scheduleCpm(net());
    const s = r.schedule;
    expect(s.relationships.find((x) => x.id === "A-B")!.driving).toBe(true);
    expect(s.relationships.find((x) => x.id === "C-D")!.driving).toBe(false);
    expect(s.relationships.find((x) => x.id === "C-D")!.freeFloatHours).toBe(16);
    expect(["A", "B", "D"].every((id) => get(s, id).longestPath)).toBe(true);
    expect(get(s, "C").longestPath).toBe(false);
  });

  it("uses a float threshold or the longest path for critical", () => {
    expect(get(scheduleCpm(net(), { settings: { criticalFloatHours: 16 } }).schedule, "C").critical).toBe(true);
    const lp = scheduleCpm(net(), { settings: { criticalBy: "longest-path" } }).schedule;
    expect(get(lp, "C").critical).toBe(false);
    expect(get(lp, "B").critical).toBe(true);
  });

  it("makes open ends critical when asked", () => {
    const s = sched([act("A", 8), act("B", 8), act("X", 8)], [rel("A", "B")]);
    expect(get(scheduleCpm(s).schedule, "X").critical).toBe(false);
    expect(get(scheduleCpm(s, { settings: { openEndsCritical: true } }).schedule, "X").critical).toBe(true);
  });

  it("schedules out-of-sequence progress by retained logic or progress override", () => {
    // B started before its predecessor A finished.
    const s = sched(
      [act("A", 40, { status: "in-progress", actualStart: T(`${MON} 08:00`), remainingDurationHours: 32, percentComplete: 20 }), act("B", 16, { status: "in-progress", actualStart: T(`${MON} 08:00`), remainingDurationHours: 8, percentComplete: 50 })],
      [rel("A", "B")],
      { dataDate: T("2026-03-03 08:00") },
    );
    const retained = get(scheduleCpm(s).schedule, "B");
    const override = get(scheduleCpm(s, { settings: { outOfSequence: "progress-override" } }).schedule, "B");
    expect(retained.finish).toBe(T("2026-03-09 17:00")); // waits for A (finishes Fri), then 8 h
    expect(override.finish).toBe(T("2026-03-03 17:00")); // carries on from the data date
  });

  it("numbers multiple float paths to an end activity", () => {
    const s = scheduleCpm(net(), { settings: { floatPaths: { endActivityId: "D", count: 3 } } }).schedule;
    expect(get(s, "B").floatPath).toBe(1);
    expect(get(s, "A").floatPath).toBe(1);
    expect(get(s, "C").floatPath).toBe(2);
  });
});

describe("resource levelling", () => {
  const withRes = (limit: number | undefined) => {
    const s = scheduleCpm(sched([act("A", 16), act("B", 16), act("C", 8)], [rel("A", "C")])).schedule;
    return {
      ...s,
      resources: [{ id: "R", code: "R", name: "Crew", type: "labor" as const, unit: "h", pricePerUnit: 1, maxUnitsPerHour: limit }],
      assignments: ["A", "B"].map((id) => ({ id: `x${id}`, activityId: id, resourceId: "R", budgetQty: 16, actualQty: 0, remainingQty: 16, budgetCost: 16, actualCost: 0, remainingCost: 16 })),
    };
  };

  it("delays parallel work that overloads a resource", () => {
    const s = withRes(1);
    expect(overloads(s)[0].days).toBeGreaterThan(0);
    const r = levelResources(s);
    const a = get(r.schedule, "A");
    const b = get(r.schedule, "B");
    // One of them waits for the other: no overlap.
    expect(Math.max(a.start!, b.start!)).toBeGreaterThanOrEqual(Math.min(a.finish!, b.finish!));
    expect(r.delayed).toBeGreaterThan(0);
    expect(overloads(r.schedule)[0].days).toBe(0);
    // C still follows A.
    expect(get(r.schedule, "C").start!).toBeGreaterThanOrEqual(a.finish!);
  });

  it("does nothing without limits and stays within float when asked", () => {
    expect(levelResources(withRes(undefined)).delayed).toBe(0);
    const r = levelResources(withRes(1), { levelWithinFloat: true });
    expect(r.overloaded.length + r.delayed).toBeGreaterThan(0);
  });
});

describe("project dates", () => {
  it("runs late dates back from Must Finish By", () => {
    const s = sched([act("A", 8), act("B", 8)], [rel("A", "B")], { mustFinishBy: T("2026-03-03 12:00") });
    const r = scheduleCpm(s).schedule;
    expect(get(r, "B").totalFloatHours).toBe(-4);
    expect(get(r, "A").critical).toBe(true);
  });
});

import { claimDigger, claimDiggerCsv } from "../src/core/compare";

describe("Claim Digger", () => {
  it("reports added, deleted and changed activities and relationships", () => {
    const base = scheduleCpm(sched([act("A", 8), act("B", 8), act("C", 8)], [rel("A", "B"), rel("B", "C")])).schedule;
    const cur = scheduleCpm(sched([act("A", 16), act("B", 8), act("D", 8)], [rel("A", "B", "SS", 4), rel("B", "D")])).schedule;
    const r = claimDigger(base, cur);
    expect(r.added.map((x) => x.code)).toEqual(["D"]);
    expect(r.deleted.map((x) => x.code)).toEqual(["C"]);
    const a = r.changed.find((x) => x.code === "A")!;
    expect(a.changes.find((c) => c.field === "Original Duration")).toEqual({ field: "Original Duration", before: "1d", after: "2d" });
    expect(r.relationships.find((x) => x.pred === "A")!.kind).toBe("changed");
    expect(r.relationships.filter((x) => x.kind === "deleted").map((x) => x.succ)).toEqual(["C"]);
    expect(claimDiggerCsv(r).split("\r\n").length).toBeGreaterThan(4);
  });
});

describe("levelling edge cases", () => {
  it("leaves an activity that alone exceeds a limit where logic puts it", () => {
    const s0 = scheduleCpm(sched([act("A", 8)], [])).schedule;
    const s = { ...s0, resources: [{ id: "R", code: "R", name: "R", type: "labor" as const, unit: "h", pricePerUnit: 1, maxUnitsPerHour: 1 }], assignments: [{ id: "x", activityId: "A", resourceId: "R", budgetQty: 16, actualQty: 0, remainingQty: 16, budgetCost: 16, actualCost: 0, remainingCost: 16 }] };
    const t = Date.now();
    const r = levelResources(s);
    expect(Date.now() - t).toBeLessThan(500);
    expect(r.overloaded).toEqual(["A"]);
    expect(get(r.schedule, "A").start).toBe(get(s0, "A").start);
  });
});
