import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { scheduleCpm } from "../src/core/cpm";
import { demoXer } from "../src/core/demo";
import { BUILTIN_TEMPLATES } from "../src/core/reporting";
import { dashboardToPptx } from "../src/services/pptx";
import { parseXer } from "../src/core/xer";

const s = scheduleCpm(parseXer(demoXer())).schedule;

describe("dashboard to PowerPoint", () => {
  for (const t of BUILTIN_TEMPLATES)
    it(`exports "${t.name}" with native charts and tables`, async () => {
      const d = t.make(null);
      const bytes = await dashboardToPptx({ dashboard: d, scheduleFor: () => s });
      const files = unzipSync(bytes);
      const names = Object.keys(files);
      const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
      expect(slides.length).toBeGreaterThan(1);
      const charts = names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
      const embedded = names.filter((n) => n.startsWith("ppt/embeddings/"));
      const hasTable = slides.some((n) => strFromU8(files[n]).includes("<a:tbl>"));
      // Every chart carries its data workbook, so PowerPoint can edit it.
      expect(embedded.length).toBeGreaterThanOrEqual(charts.length);
      for (const c of charts) expect(strFromU8(files[c])).toContain("c:externalData");
      expect(charts.length + (hasTable ? 1 : 0)).toBeGreaterThan(0);
      if (t.id === "status") require("fs").writeFileSync("/tmp/claude-0/-home-user/4f532d61-7388-5726-a8f7-8e653fd293d0/scratchpad/sample.pptx", bytes);
    });
});
