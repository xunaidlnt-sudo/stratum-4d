import { describe, expect, it } from "vitest";
import { expandElements, regionEmpty, regionKey, regionWithGrowth, segmentRegion, splitAt, splitGrid } from "../src/core/motion";

describe("3D subdivision", () => {
  it("splits at chosen positions into uneven parts", () => {
    const s = splitAt("slab", "x", [0.6, 0.3, 0.3, 1.2], "Pour");
    expect(s.map((p) => [p.from, p.to])).toEqual([
      [0, 0.3],
      [0.3, 0.6],
      [0.6, 1],
    ]);
    expect(s[2].name).toBe("Pour 3");
    expect(new Set(s.map((p) => p.id)).size).toBe(3);
  });

  it("splits into a grid of columns, rows and layers", () => {
    const s = splitGrid("wall", 3, 2, 2, "Bay");
    expect(s).toHaveLength(12);
    expect(s[0].box).toEqual({ x: [0, 1 / 3], y: [0, 0.5], z: [0, 0.5] });
    expect(s[0].name).toBe("Bay col 1 · row 1 · layer 1");
    expect(new Set(s.map((p) => p.id)).size).toBe(12);
    // The parts fill the element: their volumes add up to 1.
    const vol = s.reduce((v, p) => v + (p.box!.x[1] - p.box!.x[0]) * (p.box!.y[1] - p.box!.y[0]) * (p.box!.z[1] - p.box!.z[0]), 0);
    expect(vol).toBeCloseTo(1);
    const els = expandElements([{ id: "wall", expressId: 1, name: "Wall", ifcType: "IfcWall", properties: {} }], s);
    expect(els).toHaveLength(12);
    expect(els[5].properties.ParentGlobalId).toBe("wall");
  });

  it("runs growth inside a part on any axis", () => {
    const part = segmentRegion(splitGrid("w", 2, 1, 2)[3]);
    expect(part).toEqual({ x: [0.5, 1], y: [0.5, 1], z: [0, 1] });
    // Bottom-up growth at 50% in the upper layer: the lower half of that layer.
    expect(regionWithGrowth(part, { axis: "y", lo: 0, hi: 0.5 })!.y).toEqual([0.5, 0.75]);
    // A one-axis part grown along another axis keeps both cuts.
    expect(regionWithGrowth({ x: [0, 0.5] }, { axis: "y", lo: 0, hi: 0.4 })).toEqual({ x: [0, 0.5], y: [0, 0.4] });
    expect(regionWithGrowth(null, null)).toBeNull();
    expect(regionEmpty({ y: [0.5, 0.5] })).toBe(true);
    expect(regionKey({ x: [0, 0.5] })).toBe("x0-0.5");
  });
});
