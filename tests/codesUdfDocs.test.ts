import { describe, expect, it } from "vitest";
import { allCodeTypes, codeApplies, mergeSharedCodes } from "../src/core/codes";
import { demoXer } from "../src/core/demo";
import { assignDoc, docActivities, docsOfActivity, docsOfWbs, reviewDoc, unassignDoc } from "../src/core/documents";
import { fieldCtx, fieldsFor } from "../src/core/fields";
import type { Activity, CodeType, Schedule } from "../src/core/types";
import { compileFormula } from "../src/core/udfFormula";
import { decodeXer, parseXer } from "../src/core/xer";
import { exportXer } from "../src/core/xerExport";

function act(id: string, extra: Partial<Activity> = {}): Activity {
  return { id, code: id, name: id, wbsId: null, type: "task", status: "not-started", percentComplete: 0, start: null, finish: null, baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: null, originalDurationHours: 40, remainingDurationHours: 40, critical: false, calendarId: null, codes: {}, ...extra };
}
const sched = (extra: Partial<Schedule> = {}): Schedule => ({ projectId: "p", projectCode: "P", projectName: "P", dataDate: 0, activities: [act("A"), act("B")], wbs: [], relationships: [], ...extra });

describe("global and EPS activity codes", () => {
  const shared: CodeType[] = [
    { name: "Discipline", scope: "global", values: [{ value: "CIV" }] },
    { name: "Area", scope: "eps", epsNode: "TAQA", values: [{ value: "A1" }] },
    { name: "Zone", scope: "eps", epsNode: "OTHER", values: [] },
  ];
  it("applies global codes everywhere and EPS codes under their node", () => {
    const s = sched({ eps: ["L&T | L&T Projects", "TAQA | TAQA Transco"] });
    expect(codeApplies(shared[0], s)).toBe(true);
    expect(codeApplies(shared[1], s)).toBe(true);
    expect(codeApplies(shared[2], s)).toBe(false);
    expect(allCodeTypes(s, shared).map((t) => t.name)).toEqual(["Area", "Discipline"]);
    expect(allCodeTypes(sched(), shared).map((t) => t.name)).toEqual(["Discipline"]);
  });
  it("merges the project's edits back into the shared list", () => {
    const s = sched({ eps: ["TAQA"] });
    const visible = allCodeTypes(s, shared).map((t) => t.name);
    const next = [{ ...shared[0], values: [{ value: "CIV" }, { value: "ELE" }] }, { name: "Phase", values: [] }];
    const out = mergeSharedCodes(shared, visible, next);
    expect(out.map((t) => t.name)).toEqual(["Discipline", "Zone"]); // Area deleted here, Zone untouched, Phase is project-only
    expect(out.find((t) => t.name === "Discipline")!.values).toHaveLength(2);
  });
});

describe("UDF formulas", () => {
  const lookup = (n: string) => (n === "Cost" ? (a: Activity) => Number(a.userFields?.Cost ?? 0) : n === "Days" ? () => 4 : null);
  it("evaluates arithmetic, precedence, brackets and functions", () => {
    const a = act("A", { userFields: { Cost: "1000" } });
    expect(compileFormula("[Cost] * 0.05 + 2", lookup)(a)).toBe(52);
    expect(compileFormula("([Cost] + 200) / [Days]", lookup)(a)).toBe(300);
    expect(compileFormula("max(-[Days], 0) + round(10 / 3, 2)", lookup)(a)).toBeCloseTo(3.33);
    expect(compileFormula("[Cost] / 0", lookup)(a)).toBeNull();
  });
  it("rejects bad formulas with a readable message", () => {
    expect(() => compileFormula("[Nope] * 2", lookup)).toThrow(/Unknown field \[Nope\]/);
    expect(() => compileFormula("(1 + 2", lookup)).toThrow(/Missing \)/);
    expect(() => compileFormula("1 +", lookup)).toThrow(/ends early/);
    expect(() => compileFormula("alert(1)", lookup)).toThrow(/Unexpected/);
  });
  it("adds calculated and rule-based UDF columns", () => {
    const s = sched({
      activities: [act("A", { totalFloatHours: -8, userFields: { Weight: "3" } }), act("B", { totalFloatHours: 80, userFields: { Weight: "5" } })],
      udfDefs: [
        { name: "Weight", type: "number" },
        { name: "Double", type: "number", formula: "[Weight] * 2" },
        { name: "Float flag", type: "indicator", indicatorRule: { field: "Total Float", rules: [{ op: "<", value: 0, color: "Red" }, { op: "<", value: 5, color: "Yellow" }], otherwise: "Green" } },
      ],
    });
    const f = new Map(fieldsFor(s).map((x) => [x.id, x]));
    const c = fieldCtx(s);
    expect(s.activities.map((a) => f.get("user:Double")!.get(a, c))).toEqual([6, 10]);
    expect(s.activities.map((a) => f.get("user:Float flag")!.get(a, c))).toEqual(["Red", "Green"]);
    expect(f.get("user:Double")!.set).toBeUndefined();
  });
  it("writes calculated UDF values and activity notes to XER", () => {
    const base = parseXer(demoXer());
    const a0 = base.activities[0];
    const s: Schedule = { ...base, udfDefs: [{ name: "Days x2", type: "number", formula: "[Original Duration] * 2" }], activities: base.activities.map((a) => (a.id === a0.id ? { ...a, notes: "Crane on site from week 3" } : a)) };
    const back = parseXer(decodeXer(exportXer(s)));
    const b0 = back.activities.find((a) => a.code === a0.code)!;
    expect(Number(b0.userFields?.["Days x2"])).toBeCloseTo(((a0.originalDurationHours ?? 0) / 8) * 2, 1);
    expect(b0.notebook?.Notes).toBe("Crane on site from week 3");
    expect(back.notebookTopics).toContain("Notes");
  });
});

describe("work products and documents", () => {
  const s0 = sched({ wbs: [{ id: "W1", parentId: null, code: "1", name: "Civil", seq: 0 }], activities: [act("A", { wbsId: "W1" }), act("B")], registers: { documents: [{ id: "D1", activityId: "A", values: { Title: "Method statement" } }] } });
  it("assigns a document to several activities and WBS elements", () => {
    let s = assignDoc(s0, "D1", { activityId: "B" });
    s = assignDoc(s, "D1", { activityId: "B" });
    s = assignDoc(s, "D1", { wbsId: "W1" });
    const d = s.registers!.documents![0];
    expect(docActivities(d)).toEqual(["A", "B"]);
    expect(docsOfActivity(s, "B")).toHaveLength(1);
    expect(docsOfWbs(s, "W1")).toHaveLength(1);
    s = unassignDoc(s, "D1", { activityId: "A" });
    expect(docActivities(s.registers!.documents![0])).toEqual(["B"]);
    expect(docsOfWbs(unassignDoc(s, "D1", { wbsId: "W1" }), "W1")).toHaveLength(0);
  });
  it("records reviews and sets the status from the decision", () => {
    const s = reviewDoc(s0, "D1", { by: "Client", decision: "Approved with Comments", comment: "See markups" }, "2026-10-01T10:00:00Z");
    const d = s.registers!.documents![0];
    expect(d.values.Status).toBe("Approved with Comments");
    expect(d.reviews).toEqual([{ at: "2026-10-01T10:00:00Z", by: "Client", decision: "Approved with Comments", comment: "See markups" }]);
  });
});
