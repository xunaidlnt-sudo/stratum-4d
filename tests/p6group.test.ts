import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { fieldCtx, fieldsFor } from "../src/core/fields";
import { buildP6Rows, type RowOptions } from "../src/core/p6rows";
import { parseXer } from "../src/core/xer";

const s = scheduleCpm(parseXer(demoXer())).schedule;
const fields = new Map(fieldsFor(s).map((f) => [f.id, f]));
const c = fieldCtx(s);
const base: RowOptions = { groupBy: "wbs", sort: [{ field: "start" }], filters: [], filterMatch: "all", filterMode: "replace", text: "", collapsed: new Set() };
const rows = (o: Partial<RowOptions>) => buildP6Rows(s, fields, c, { ...base, ...o }).rows;

describe("Group and Sort options", () => {
  it("adds a second group level inside WBS bands", () => {
    const r = rows({ thenBy: ["status"] });
    const statusBands = r.filter((x) => x.kind === "band" && x.id.includes("g:status:"));
    expect(statusBands.length).toBeGreaterThan(0);
    expect(r.filter((x) => x.kind === "activity").length).toBe(s.activities.length);
  });

  it("stops WBS bands at a level and keeps every activity", () => {
    const all = rows({});
    const top = rows({ wbsToLevel: 1 });
    expect(top.filter((x) => x.kind === "band").every((x) => x.depth === 0)).toBe(true);
    expect(top.filter((x) => x.kind === "activity").length).toBe(all.filter((x) => x.kind === "activity").length);
  });

  it("shows summaries only, a grand total and nested field groups", () => {
    expect(rows({ summariesOnly: true }).every((x) => x.kind === "band")).toBe(true);
    const g = rows({ grandTotal: true });
    expect(g[0]).toMatchObject({ kind: "band", id: "grand-total", count: s.activities.length });
    const nested = rows({ groupBy: "status", thenBy: ["type"] });
    expect(nested.some((x) => x.kind === "band" && x.depth === 1)).toBe(true);
  });

  it("labels bands with title, code and name as asked", () => {
    const w = s.wbs[0];
    const band = (o: Partial<RowOptions>) => rows(o).find((x) => x.kind === "band" && x.id === w.id) as { label: string };
    expect(band({}).label).toBe(`${w.code} ${w.name}`);
    expect(band({ label: { title: true, code: true, name: false } }).label).toBe(`WBS: ${w.code}`);
    expect(band({ label: { code: false, name: true } }).label).toBe(w.name);
  });
});
