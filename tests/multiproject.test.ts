import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { combineSchedules, epsTree, mergeReflection, parseEps, reflect, reflectionChanges, splitSchedule } from "../src/core/multiproject";
import type { Schedule } from "../src/core/types";
import { parseXer } from "../src/core/xer";

const demo = (code: string): Schedule => {
  const s = parseXer(demoXer());
  return { ...s, projectCode: code, projectName: `Project ${code}` };
};

describe("several projects open together", () => {
  it("combines with a band per project and splits back unchanged", () => {
    const a = demo("A");
    const b = demo("B");
    const c = combineSchedules([{ dbId: "da", schedule: a }, { dbId: "db", schedule: b }]);
    expect(c.activities.length).toBe(a.activities.length + b.activities.length);
    expect(new Set(c.activities.map((x) => x.id)).size).toBe(c.activities.length); // same ids made unique
    expect(c.wbs.filter((w) => w.parentId === null).map((w) => w.code)).toEqual(["A", "B"]);
    const [sa, sb] = splitSchedule(c);
    expect(sa.dbId).toBe("da");
    expect(sa.schedule.activities.map((x) => x.id)).toEqual(a.activities.map((x) => x.id));
    expect(sa.schedule.relationships.length).toBe(a.relationships.length);
    expect(sb.schedule.wbs.map((w) => w.parentId)).toEqual(b.wbs.map((w) => w.parentId));
    expect(sb.schedule.assignments?.length).toBe(b.assignments?.length);
    expect(sa.schedule.sourceXer).toBeTruthy();
    expect(sa.schedule.activities[0].projectId).toBeUndefined();
  });

  it("schedules across projects and keeps cross-project links as external relationships", () => {
    const a = demo("A");
    const b = demo("B");
    const c = combineSchedules([{ dbId: "da", schedule: a }, { dbId: "db", schedule: b }]);
    const lastA = c.activities.filter((x) => x.projectId === "p1").sort((x, y) => (y.finish ?? 0) - (x.finish ?? 0))[0];
    const firstB = c.activities.filter((x) => x.projectId === "p2" && x.status === "not-started")[0];
    const linked = { ...c, relationships: [...c.relationships, { id: "cross", predecessorId: lastA.id, successorId: firstB.id, type: "FS" as const, lagHours: 0 }] };
    const r = scheduleCpm(linked).schedule;
    expect(r.activities.find((x) => x.id === firstB.id)!.start!).toBeGreaterThanOrEqual(r.activities.find((x) => x.id === lastA.id)!.finish!);
    const [sa, sb] = splitSchedule(r);
    expect(sa.schedule.externalRelationships).toEqual([]);
    expect(sb.schedule.externalRelationships).toEqual([{ predecessorProject: "A", predecessorCode: lastA.code, successorId: firstB.id.replace("p2~", ""), type: "FS", lagHours: 0 }]);
    // Opening both again restores the link.
    const again = combineSchedules([{ dbId: "da", schedule: sa.schedule }, { dbId: "db", schedule: sb.schedule }]);
    expect(again.relationships.some((x) => x.predecessorId === lastA.id && x.successorId === firstB.id)).toBe(true);
  });

  it("puts work added in the combined view into the project of its WBS", () => {
    const c = combineSchedules([{ dbId: "da", schedule: demo("A") }, { dbId: "db", schedule: demo("B") }]);
    const wbsB = c.wbs.find((w) => w.id.startsWith("p2~") && !w.id.endsWith("__root"))!;
    const added = { ...c.activities[0], id: "new1", code: "NEW-1", projectId: undefined, wbsId: wbsB.id };
    const [sa, sb] = splitSchedule({ ...c, activities: [...c.activities, added] });
    expect(sb.schedule.activities.some((x) => x.code === "NEW-1")).toBe(true);
    expect(sa.schedule.activities.some((x) => x.code === "NEW-1")).toBe(false);
  });
});

describe("EPS", () => {
  it("builds a tree from project EPS paths", () => {
    const rows = epsTree([
      { id: "1", code: "N-20016", name: "ICAD N", eps: parseEps("Company / Substations") },
      { id: "2", code: "N-19342", name: "Other", eps: ["Company", "Substations"] },
      { id: "3", code: "X", name: "Loose" },
    ]);
    expect(rows.map((r) => `${r.depth}:${r.kind}:${r.id}`)).toEqual(["0:eps:Company", "1:eps:Substations", "2:project:N-19342", "2:project:N-20016", "0:project:X"]);
    expect(rows[1].projectIds.sort()).toEqual(["1", "2"]);
    const coded = epsTree([{ id: "1", code: "LE25M362", name: "NEW 220/33kV ICAD N SUBSTATION", eps: parseEps("NEWEPS | L&T Projects - TAQA") }]);
    expect(coded[0]).toMatchObject({ kind: "eps", id: "NEWEPS", name: "L&T Projects - TAQA" });
    expect(parseEps("A / 220/33kV works > B")).toEqual(["A", "220/33kV works", "B"]);
  });
});

describe("reflections", () => {
  it("reports and merges the changes made in a reflection", () => {
    const src = demo("A");
    const ref = reflect(src, "da");
    expect(ref.projectCode).toBe("A-R");
    const edited: Schedule = {
      ...ref,
      activities: [...ref.activities.slice(1).map((a, i) => (i === 0 ? { ...a, name: "Renamed" } : a)), { ...ref.activities[1], id: "added", code: "NEW" }],
      relationships: ref.relationships.slice(1),
    };
    const ch = reflectionChanges(src, edited);
    expect(ch.added).toEqual(["NEW"]);
    expect(ch.deleted).toEqual([src.activities[0].code]);
    expect(ch.changed).toEqual([{ code: src.activities[1].code, fields: ["name"] }]);
    expect(ch.relationshipsDeleted).toBeGreaterThanOrEqual(1);
    const m = mergeReflection(src, edited).schedule;
    expect(m.projectCode).toBe("A");
    expect(m.reflectionOf).toBeNull();
    expect(m.activities.find((a) => a.code === "NEW")).toBeTruthy();
    expect(m.sourceXer).toBe(src.sourceXer);
  });
});
