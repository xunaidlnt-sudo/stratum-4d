import { describe, expect, it } from "vitest";
import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { formatMspDuration, indentRows, insertSummary, mspRows, outdentRows, outlineNumbers, parseMspDuration, parseMspPredecessors, projectStatistics, rowNumbers, setPredecessorsFromText } from "../src/core/msp";
import { parseMspdi } from "../src/core/mspdi";
import { writeMspdi } from "../src/core/mspdiWrite";
import type { Schedule } from "../src/core/types";
import { parseXer } from "../src/core/xer";

const demo = (): Schedule => scheduleCpm(parseXer(demoXer())).schedule;

describe("MS Project duration and predecessor text", () => {
  it("reads durations the way MS Project does", () => {
    expect(parseMspDuration("5d", 8)).toEqual({ hours: 40, estimated: false });
    expect(parseMspDuration("2 wks", 8)?.hours).toBe(80);
    expect(parseMspDuration("16h", 8)?.hours).toBe(16);
    expect(parseMspDuration("3", 8)?.hours).toBe(24);
    expect(parseMspDuration("1 mon", 8)?.hours).toBe(160);
    expect(parseMspDuration("4 days?", 8)).toEqual({ hours: 32, estimated: true });
    expect(parseMspDuration("abc", 8)).toBeNull();
    expect(formatMspDuration(8, 8)).toBe("1 day");
    expect(formatMspDuration(0, 8)).toBe("0 days");
    expect(formatMspDuration(20, 8, true)).toBe("2.5 days?");
  });

  it("reads predecessor text with types and lags", () => {
    expect(parseMspPredecessors("3, 5SS+2d, 7FF-1w, 9SF+50%", 8)).toEqual([
      { row: 3, type: "FS", lagHours: 0 },
      { row: 5, type: "SS", lagHours: 16 },
      { row: 7, type: "FF", lagHours: -40 },
      { row: 9, type: "SF", lagHours: 0, lagPercent: 50 },
    ]);
    expect(() => parseMspPredecessors("x3", 8)).toThrow();
    expect(() => parseMspPredecessors("3FS+2q", 8)).toThrow();
  });

  it("sets predecessors from the cell and refuses summary rows", () => {
    const s = demo();
    const rows = mspRows(s);
    const { byRow, byId } = rowNumbers(rows);
    const acts = rows.filter((r) => r.kind === "activity");
    const target = acts[3].id;
    const p1 = byId.get(acts[0].id)!;
    const out = setPredecessorsFromText(s, target, `${p1}SS+1d`, byRow, 8);
    const preds = out.relationships.filter((r) => r.successorId === target);
    expect(preds).toHaveLength(1);
    expect(preds[0]).toMatchObject({ predecessorId: acts[0].id, type: "SS", lagHours: 8 });
    const wbsRow = rows.findIndex((r) => r.kind === "wbs") + 1;
    if (wbsRow > 0) expect(() => setPredecessorsFromText(s, target, String(wbsRow), byRow, 8)).toThrow(/summary/);
  });
});

describe("outline editing", () => {
  it("indents under a task, turning it into a summary, and outdents back", () => {
    const s = demo();
    const rows = mspRows(s);
    // Two tasks next to each other at the same level.
    const k = rows.findIndex((r, i) => i > 0 && r.kind === "activity" && rows[i - 1].kind === "activity" && rows[i - 1].depth === r.depth);
    expect(k).toBeGreaterThan(0);
    const me = rows[k];
    const above = rows[k - 1];
    const r = indentRows(s, [me.id]);
    expect(r.moved).toBe(1);
    expect(r.schedule.activities.some((a) => a.id === above.id)).toBe(false);
    const summary = r.schedule.wbs.find((w) => w.name === (above as { activity: { name: string } }).activity.name)!;
    expect(r.schedule.activities.find((a) => a.id === me.id)!.wbsId).toBe(summary.id);
    const o = outdentRows(r.schedule, [me.id]);
    expect(o.schedule.activities.find((a) => a.id === me.id)!.wbsId).toBe(summary.parentId);
  });

  it("inserts a summary task over the selection and numbers the outline", () => {
    const s = demo();
    const acts = s.activities.slice(0, 2).map((a) => a.id);
    const { schedule, wbsId } = insertSummary(s, acts);
    expect(schedule.activities.filter((a) => a.wbsId === wbsId)).toHaveLength(2);
    const nums = outlineNumbers(mspRows(schedule));
    expect(nums.get(wbsId)).toMatch(/^\d+(\.\d+)*$/);
  });
});

describe("task mode, deadlines and inactive tasks in CPM", () => {
  it("keeps a manual task's dates, flags a missed deadline and ignores inactive tasks", () => {
    const s = demo();
    const rel = s.relationships[0];
    const succ = s.activities.find((a) => a.id === rel.successorId)!;
    const pred = s.activities.find((a) => a.id === rel.predecessorId)!;
    const early = succ.start! - 30 * 86_400_000;
    const manual = scheduleCpm({ ...s, activities: s.activities.map((a) => (a.id === succ.id ? { ...a, taskMode: "manual" as const, status: "not-started" as const, actualStart: null, actualFinish: null, percentComplete: 0, start: early, finish: early + 86_400_000 } : a)) }).schedule;
    expect(manual.activities.find((a) => a.id === succ.id)!.start).toBe(early);

    const dl = pred.finish! - 5 * 86_400_000;
    const late = scheduleCpm({ ...s, activities: s.activities.map((a) => (a.id === pred.id ? { ...a, deadline: dl } : a)) }).schedule;
    const p = late.activities.find((a) => a.id === pred.id)!;
    if (p.status !== "complete") expect(p.totalFloatHours!).toBeLessThan(0);

    const before = s.activities.find((a) => a.id === succ.id)!;
    const off = scheduleCpm({ ...s, activities: s.activities.map((a) => (a.id === succ.id ? { ...a, inactive: true } : a)) }).schedule;
    expect(off.activities.find((a) => a.id === succ.id)!.start).toBe(before.start);
  });
});

describe("MSPDI writer", () => {
  it("round-trips tasks, summaries, links, resources, assignments, calendars and baselines", () => {
    const s0 = demo();
    const s: Schedule = {
      ...s0,
      baselines: [{ id: "b1", name: "Baseline 1", createdAt: "", dataDate: null, dates: Object.fromEntries(s0.activities.map((a) => [a.code, [a.start, a.finish]])) }],
      activities: s0.activities.map((a, i) => (i === 0 ? { ...a, deadline: Date.UTC(2030, 0, 1), priority: 800, notes: "Check <access> & permits", taskMode: "manual" as const } : a)),
    };
    const xml = writeMspdi(s);
    expect(xml.startsWith("<?xml")).toBe(true);
    const back = parseMspdi(xml);
    const acts = s.activities.filter((a) => a.type !== "wbs-summary");
    expect(back.activities).toHaveLength(acts.length);
    expect(back.wbs).toHaveLength(s.wbs.length);
    expect(back.relationships).toHaveLength(s.relationships.length);
    expect(back.resources?.length).toBe(s.resources?.length);
    expect(back.assignments?.length).toBe(s.assignments?.length);
    expect(back.calendars?.length).toBe(s.calendars?.length);
    const byName = new Map(back.activities.map((a) => [a.name, a]));
    for (const a of acts) {
      const b = byName.get(a.name)!;
      expect(b.start).toBe(a.start);
      expect(b.finish).toBe(a.finish);
      expect(b.baselineFinish).toBe(a.baselineFinish);
      expect(b.originalDurationHours).toBeCloseTo(a.type === "milestone" || a.type === "finish-milestone" ? 0 : a.originalDurationHours ?? 0, 1);
    }
    const first = byName.get(acts[0].name)!;
    expect(first).toMatchObject({ deadline: Date.UTC(2030, 0, 1), priority: 800, notes: "Check <access> & permits", taskMode: "manual" });
    expect(back.baselines?.[0].name).toBe("Baseline 1");
    // Calendar weeks and holidays survive.
    const c0 = s.calendars![0];
    const c1 = back.calendars![0];
    expect(c1.week).toEqual(c0.week);
    expect([...c1.holidays].sort()).toEqual([...new Set(c0.holidays)].sort());
    // Writing the re-read schedule keeps MS Project UIDs stable.
    expect(writeMspdi(back).match(/<UID>\d+<\/UID>/g)).toEqual(xml.match(/<UID>\d+<\/UID>/g));
  });

  it("reports project statistics", () => {
    const st = projectStatistics(demo());
    expect(st.current.start).not.toBeNull();
    expect(st.percentComplete).toBeGreaterThanOrEqual(0);
    expect(st.durationDays.current).toBeGreaterThan(0);
  });
});

describe("sheet cell editing", () => {
  it("edits duration, start, finish, % complete and resource names the MS Project way", async () => {
    const { cellCtx, editTaskCell, parseMspDateText, parseResourceNames } = await import("../src/core/msp");
    expect(parseMspDateText("Mon 02/03/26")).toBe(Date.UTC(2026, 2, 2));
    expect(parseMspDateText("2026-03-02")).toBe(Date.UTC(2026, 2, 2));
    expect(parseMspDateText("2 Mar 2026")).toBe(Date.UTC(2026, 2, 2));
    expect(parseMspDateText("31/02/26")).toBeNull();
    expect(parseResourceNames("Electrician[50%], Crane")).toEqual([{ name: "Electrician", units: 0.5 }, { name: "Crane", units: 1 }]);

    const s = demo();
    const a = s.activities.find((x) => x.status === "not-started" && x.type === "task")!;
    const c = cellCtx(s, new Map());
    let t = editTaskCell(s, a.id, "duration", "3d", c);
    let b = t.activities.find((x) => x.id === a.id)!;
    expect(b.originalDurationHours).toBe(3 * c.hpd);
    t = editTaskCell(s, a.id, "duration", "0d", c);
    expect(t.activities.find((x) => x.id === a.id)!.type).toBe("milestone");

    const day = Date.UTC(2031, 0, 6); // a Monday
    t = editTaskCell(s, a.id, "start", "06/01/31", c);
    b = t.activities.find((x) => x.id === a.id)!;
    expect(b.constraint).toMatchObject({ type: "start-on-or-after" });
    expect(b.start! >= day).toBe(true);
    t = editTaskCell(t, a.id, "finish", "08/01/31", c);
    b = t.activities.find((x) => x.id === a.id)!;
    expect(b.originalDurationHours).toBeCloseTo(3 * c.hpd, 1);

    t = editTaskCell(s, a.id, "pct", "100", c);
    expect(t.activities.find((x) => x.id === a.id)!.status).toBe("complete");

    t = editTaskCell(s, a.id, "res", "Brand new crew[50%]", c);
    const r = t.resources!.find((x) => x.name === "Brand new crew")!;
    const asg = t.assignments!.filter((x) => x.activityId === a.id);
    expect(asg).toHaveLength(1);
    expect(asg[0]).toMatchObject({ resourceId: r.id, units: 0.5 });
    expect(() => editTaskCell(s, a.id, "duration", "lots", c)).toThrow();
  });
});
