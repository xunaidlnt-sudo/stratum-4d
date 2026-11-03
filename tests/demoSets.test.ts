import { describe, expect, it } from "vitest";
import { buildSample, SAMPLE_SPECS } from "../src/core/demoSets";
import { DEMO_LINK_RULE } from "../src/core/demo";
import { applyRules } from "../src/core/linking";
import { parseXerTables, xerToSchedule } from "../src/core/xer";

describe("demo sample projects", () => {
  for (const [kind, spec] of Object.entries(SAMPLE_SPECS)) {
    it(`${kind}: imports as a P6 schedule with progress, baseline slip and linked model`, () => {
      const sp = spec();
      const b = buildSample(sp);
      const s = xerToSchedule(parseXerTables(b.xer));
      expect(s.projectCode).toBe(sp.code);
      expect(s.activities.filter((a) => a.type !== "wbs-summary").length).toBe(sp.acts.length);
      for (const a of s.activities) {
        if (a.type === "wbs-summary") continue;
        expect(Number.isFinite(a.start ?? NaN), `${a.code} start`).toBe(true);
        expect(Number.isFinite(a.finish ?? NaN), `${a.code} finish`).toBe(true);
        expect(a.finish! >= a.start!).toBe(true);
      }
      const st = new Set(s.activities.map((a) => a.status));
      expect(st.has("complete") && st.has("in-progress") && st.has("not-started")).toBe(true);
      expect(s.activities.some((a) => a.baselineFinish !== null && a.finish !== null && a.finish > a.baselineFinish)).toBe(true);
      expect(s.relationships.length).toBeGreaterThan(sp.acts.length - 3);
      const links = applyRules([{ ...DEMO_LINK_RULE, profileId: "install" }], b.boxes.map((x) => x.element), s);
      expect(links.length).toBe(b.boxes.length);
    });
  }
});
