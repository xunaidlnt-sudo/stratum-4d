import { describe, expect, it } from "vitest";
import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { projectFigures, trackingBands } from "../src/core/tracking";
import { timescaledLayout } from "../src/core/tsld";
import type { Activity, Schedule } from "../src/core/types";
import { projectWebsite } from "../src/core/website";
import { parseXer } from "../src/core/xer";

const T = (s: string) => Date.parse(s.replace(" ", "T") + ":00Z");
function act(id: string, start: string, finish: string, extra: Partial<Activity> = {}): Activity {
  return { id, code: id, name: `Activity ${id}`, wbsId: null, type: "task", status: "not-started", percentComplete: 0, start: T(start), finish: T(finish), baselineStart: null, baselineFinish: null, actualStart: null, actualFinish: null, totalFloatHours: 0, originalDurationHours: 40, remainingDurationHours: 40, critical: false, calendarId: null, codes: {}, ...extra };
}

describe("tracking", () => {
  const demo = scheduleCpm(parseXer(demoXer())).schedule;
  it("summarises a project", () => {
    const f = projectFigures(demo);
    expect(f.code).toBe(demo.projectCode);
    expect(f.activities).toBeGreaterThan(0);
    expect(f.start).not.toBeNull();
    expect(f.finish).toBeGreaterThanOrEqual(f.start!);
    expect(f.earnedPct).toBeGreaterThanOrEqual(0);
  });
  it("groups projects by EPS with totals", () => {
    const a = { ...projectFigures(demo), id: "1", code: "A", eps: ["TAQA | TAQA Transco", "N | North"], bac: 100, earnedPct: 50, start: 10, finish: 50 };
    const b = { ...a, id: "2", code: "B", bac: 300, earnedPct: 10, start: 5, finish: 90 };
    const c = { ...a, id: "3", code: "C", eps: [] };
    const bands = trackingBands([a, b, c], "eps");
    expect(bands.map((x) => x.label)).toEqual(["(no EPS)", "TAQA Transco"]);
    const t = bands[1].total;
    expect([t.bac, t.start, t.finish]).toEqual([400, 5, 90]);
    expect(t.earnedPct).toBeCloseTo(20); // budget weighted
    expect(trackingBands([a, b], "pcode:Region", (id): Record<string, string> => (id === "1" ? { Region: "West" } : {})).map((x) => x.label)).toEqual(["(no code)", "West"]);
  });
});

describe("project web site", () => {
  const s = scheduleCpm(parseXer(demoXer())).schedule;
  it("writes one page per chosen topic with relative links and escaped text", () => {
    const evil: Schedule = { ...s, projectName: `<script>alert(1)</script>`, registers: { documents: [{ id: "d", activityId: s.activities[0].id, values: { Title: "Spec", "Public Location": "javascript:alert(1)" } }] } };
    const files = projectWebsite(evil, { title: "Site", topics: ["activities", "gantt", "documents"] });
    expect(Object.keys(files).sort()).toEqual(["activities.html", "documents.html", "gantt.html", "index.html", "style.css"]);
    for (const f of Object.values(files)) expect(f).not.toContain("<script>");
    expect(files["documents.html"]).not.toContain('href="javascript');
    expect(files["index.html"]).toContain('href="activities.html"');
    expect(files["index.html"]).not.toContain('href="resources.html"');
    expect(files["activities.html"]).toContain(`id="${s.activities[0].code}"`);
    expect(files["gantt.html"]).toContain("<svg");
  });
});

describe("timescaled logic diagram", () => {
  const s: Schedule = {
    projectId: "p",
    projectCode: "P",
    projectName: "P",
    dataDate: T("2026-01-01 08:00"),
    wbs: [],
    activities: [act("A", "2026-01-05 08:00", "2026-01-09 17:00"), act("B", "2026-01-12 08:00", "2026-01-16 17:00"), act("C", "2026-01-06 08:00", "2026-01-20 17:00"), act("D", "2026-01-19 08:00", "2026-01-23 17:00")],
    relationships: [
      { id: "r1", predecessorId: "A", successorId: "B", type: "FS", lagHours: 0 },
      { id: "r2", predecessorId: "C", successorId: "D", type: "SS", lagHours: 0 },
    ],
  };
  it("packs bars into rows and keeps chains on their predecessor's row", () => {
    const L = timescaledLayout(s);
    const row = (id: string) => L.bars.find((b) => b.a.id === id)!.row;
    expect(L.rows).toBe(2);
    expect(row("B")).toBe(row("A"));
    expect(row("C")).not.toBe(row("A"));
    expect(row("D")).toBe(row("A")); // D can't follow C on C's row (overlap), so it takes the first free row
    expect(L.links).toHaveLength(2);
  });
  it("never overlaps bars on a row", () => {
    const demo = scheduleCpm(parseXer(demoXer())).schedule;
    const L = timescaledLayout(demo, { groupByWbs: true });
    const rows = new Map<number, { start: number; finish: number }[]>();
    for (const b of L.bars) (rows.get(b.row) ?? rows.set(b.row, []).get(b.row)!).push(b);
    for (const list of rows.values()) {
      list.sort((a, b) => a.start - b.start);
      for (let i = 1; i < list.length; i++) expect(list[i].start).toBeGreaterThanOrEqual(list[i - 1].finish);
    }
    expect(L.groups.length).toBeGreaterThan(1);
  });
});
