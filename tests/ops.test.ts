import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { fieldCtx, fieldsFor, fieldText, filterMatches, STANDARD_FILTERS } from "../src/core/fields";
import {
  checkSchedule,
  copyActivities,
  deleteActivities,
  dissolve,
  fillDown,
  globalChange,
  linkActivities,
  nextCode,
  pasteActivities,
  renumber,
  storeBaseline,
  updateProgress,
  useStoredBaseline,
} from "../src/core/ops";
import type { Schedule } from "../src/core/types";
import { parseXer } from "../src/core/xer";

const demo = (): Schedule => scheduleCpm(parseXer(demoXer())).schedule;
const DAY = 86_400_000;

describe("field registry", () => {
  it("reads and formats every built-in field without throwing", () => {
    const s = demo();
    const c = fieldCtx(s);
    for (const f of fieldsFor(s)) for (const a of s.activities.slice(0, 10)) expect(typeof fieldText(f, a, c)).toBe("string");
  });

  it("writes durations in days and keeps remaining in step before the start", () => {
    const s = demo();
    const c = fieldCtx(s);
    const a = s.activities.find((x) => x.status === "not-started" && x.type === "task")!;
    const od = fieldsFor(s).find((f) => f.id === "od")!;
    const patch = od.set!(a, 12, c)!;
    expect(patch.originalDurationHours).toBe(12 * c.hpd);
    expect(patch.remainingDurationHours).toBe(12 * c.hpd);
  });

  it("standard filters match what they say", () => {
    const s = demo();
    const c = fieldCtx(s);
    const map = new Map(fieldsFor(s).map((f) => [f.id, f]));
    const crit = STANDARD_FILTERS.find((f) => f.id === "critical")!;
    expect(s.activities.filter((a) => filterMatches(crit, a, map, c)).length).toBe(s.activities.filter((a) => a.critical).length);
    const ns = STANDARD_FILTERS.find((f) => f.id === "notStarted")!;
    expect(s.activities.filter((a) => filterMatches(ns, a, map, c)).every((a) => a.status === "not-started")).toBe(true);
  });
});

describe("schedule operations", () => {
  it("copies and pastes with new IDs and internal links", () => {
    const s = demo();
    const r = s.relationships[0];
    const clip = copyActivities(s, [r.predecessorId, r.successorId]);
    const { schedule, ids } = pasteActivities(s, clip);
    expect(ids).toHaveLength(2);
    expect(schedule.activities).toHaveLength(s.activities.length + 2);
    const codes = new Set(schedule.activities.map((a) => a.code));
    expect(codes.size).toBe(schedule.activities.length);
    expect(schedule.relationships.some((x) => x.predecessorId === ids[0] && x.successorId === ids[1])).toBe(true);
    expect(schedule.activities.filter((a) => ids.includes(a.id)).every((a) => a.status === "not-started")).toBe(true);
  });

  it("finds the next free ID with the same prefix", () => {
    expect(nextCode(new Set(["A1010", "A1020"]), "A1010")).toBe("A1030");
    expect(nextCode(new Set(), "CIV-005", 5)).toBe("CIV-010");
  });

  it("renumbers in order and skips IDs in use", () => {
    const s = demo();
    const ids = s.activities.slice(0, 3).map((a) => a.id);
    const { schedule, changed } = renumber(s, ids, { prefix: "X", start: 10, increment: 10 });
    expect(changed).toBe(3);
    expect(schedule.activities.slice(0, 3).map((a) => a.code)).toEqual(["X10", "X20", "X30"]);
  });

  it("dissolves an activity and keeps its logic", () => {
    const s = demo();
    const mid = s.activities.find((a) => s.relationships.some((r) => r.successorId === a.id) && s.relationships.some((r) => r.predecessorId === a.id))!;
    const preds = s.relationships.filter((r) => r.successorId === mid.id).map((r) => r.predecessorId);
    const succs = s.relationships.filter((r) => r.predecessorId === mid.id).map((r) => r.successorId);
    const { schedule } = dissolve(s, [mid.id]);
    expect(schedule.activities.some((a) => a.id === mid.id)).toBe(false);
    for (const p of preds) for (const q of succs) if (p !== q) expect(schedule.relationships.some((r) => r.predecessorId === p && r.successorId === q)).toBe(true);
  });

  it("links selected activities in order without duplicates", () => {
    const s = deleteActivities(demo(), []);
    const ids = s.activities.slice(-3).map((a) => a.id);
    const once = linkActivities(s, ids);
    const twice = linkActivities(once.schedule, ids);
    expect(twice.added).toBe(0);
    expect(once.schedule.relationships.length - s.relationships.length).toBe(once.added);
  });

  it("updates progress to a new data date", () => {
    const s = demo();
    const next = (s.dataDate ?? s.activities[0].start!) + 30 * DAY;
    const r = updateProgress(s, next);
    expect(r.schedule.dataDate).toBe(next);
    for (const a of r.schedule.activities) {
      if (a.finish !== null && a.finish <= next && a.type === "task") expect(a.status).toBe("complete");
      if (a.status === "in-progress") expect(a.actualStart).not.toBeNull();
    }
    expect(r.started + r.finished + r.progressed).toBeGreaterThan(0);
  });

  it("runs a Global Change with a preview", () => {
    const s = demo();
    const { schedule, changes } = globalChange(s, {
      id: "g",
      name: "Add 2 days to critical",
      when: { id: "w", name: "", match: "all", rules: [{ field: "critical", op: "isTrue" }] },
      then: [{ field: "od", op: "add", value: "2" }],
    });
    const crit = s.activities.filter((a) => a.critical && a.originalDurationHours !== null);
    expect(changes.length).toBe(crit.length);
    const a = crit[0];
    const b = schedule.activities.find((x) => x.id === a.id)!;
    expect(b.originalDurationHours! - a.originalDurationHours!).toBeCloseTo(2 * fieldCtx(s).hpd);
  });

  it("fills a field down from the first selected activity", () => {
    const s = demo();
    const ids = s.activities.slice(0, 4).map((a) => a.id);
    const { schedule, changed } = fillDown(s, ids, "name");
    expect(changed).toBe(3);
    expect(new Set(schedule.activities.slice(0, 4).map((a) => a.name)).size).toBe(1);
  });

  it("stores and assigns baselines", () => {
    const s = demo();
    const { schedule, baseline } = storeBaseline(s, "BL1");
    expect(schedule.baselines).toHaveLength(1);
    const moved = { ...schedule, activities: schedule.activities.map((a) => ({ ...a, start: (a.start ?? 0) + DAY })) };
    const r = useStoredBaseline(moved, baseline.id);
    expect(r.matched).toBe(s.activities.length);
    expect(r.schedule.activities[0].baselineStart).toBe(s.activities[0].actualStart ?? s.activities[0].start);
    expect(r.schedule.baselineInfo?.name).toBe("BL1");
  });

  it("checks the schedule with the 14 DCMA metrics", () => {
    const { metrics, checked } = checkSchedule(demo());
    expect(metrics).toHaveLength(14);
    expect(checked).toBeGreaterThan(0);
    expect(metrics.find((m) => m.id === "criticalPath")).toBeTruthy();
  });
});

import { buildP6Rows } from "../src/core/p6rows";

describe("P6 table rows", () => {
  const opts = { groupBy: "wbs", sort: [{ field: "start" }], filters: [], filterMatch: "any" as const, filterMode: "replace" as const, text: "", collapsed: new Set<string>() };
  it("groups by WBS with every activity once", () => {
    const s = demo();
    const c = fieldCtx(s);
    const f = new Map(fieldsFor(s).map((x) => [x.id, x]));
    const { rows, shown } = buildP6Rows(s, f, c, opts);
    expect(rows.filter((r) => r.kind === "activity")).toHaveLength(s.activities.length);
    expect(shown).toBe(s.activities.length);
  });
  it("filters, drops empty bands and groups by a field", () => {
    const s = demo();
    const c = fieldCtx(s);
    const f = new Map(fieldsFor(s).map((x) => [x.id, x]));
    const crit = STANDARD_FILTERS.find((x) => x.id === "critical")!;
    const { rows } = buildP6Rows(s, f, c, { ...opts, filters: [crit] });
    expect(rows.filter((r) => r.kind === "activity").every((r) => r.kind === "activity" && r.activity.critical)).toBe(true);
    expect(rows.filter((r) => r.kind === "band").every((r) => r.kind === "band" && r.count > 0)).toBe(true);
    const byStatus = buildP6Rows(s, f, c, { ...opts, groupBy: "status" });
    expect(byStatus.rows.filter((r) => r.kind === "band").length).toBeGreaterThan(0);
    const sorted = buildP6Rows(s, f, c, { ...opts, groupBy: "none", sort: [{ field: "tf", desc: true }] }).rows.map((r) => (r.kind === "activity" ? r.activity.totalFloatHours : null)).filter((x) => x !== null) as number[];
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1]).toBeGreaterThanOrEqual(sorted[i]);
  });
});

import { networkLayout, traceLogic } from "../src/core/network";
import { usageSheet } from "../src/core/usage";

describe("network, trace and usage", () => {
  it("lays successors right of predecessors", () => {
    const s = demo();
    const n = networkLayout(s);
    expect(n.nodes.size).toBe(s.activities.length);
    for (const r of s.relationships) {
      const p = n.nodes.get(r.predecessorId);
      const q = n.nodes.get(r.successorId);
      if (p && q) expect(q.col).toBeGreaterThan(p.col);
    }
  });
  it("traces logic to a depth", () => {
    const s = demo();
    const r = s.relationships[0];
    const t = traceLogic(s, r.successorId, 1, 0);
    expect(t.has(r.predecessorId)).toBe(true);
  });
  it("spreads usage so period totals equal assignment totals", () => {
    const s = demo();
    const u = usageSheet(s, { by: "resource", step: "month", measure: "units" });
    const sum = u.totals.reduce((a, b) => a + b, 0);
    const acts = new Map(s.activities.map((a) => [a.id, a]));
    const expected = (s.assignments ?? []).reduce((t, x) => {
      const a = acts.get(x.activityId);
      if (!a) return t;
      return t + (a.actualStart !== null ? x.actualQty : 0) + (a.status !== "complete" && a.finish !== null ? x.remainingQty : 0);
    }, 0);
    expect(sum).toBeCloseTo(expected, 3);
  });
});
