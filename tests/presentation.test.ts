import { describe, expect, it } from "vitest";
import { cameraAt, dateAt, evalAnimation, frameTimes, moveKey, normalizePresentation, removeKey, scheduleAnimation, setKey, viewAt, type CameraKey } from "../src/core/presentation";
import { parseProject, serializeProject } from "../src/core/project";
import { DEFAULT_PROFILES } from "../src/core/profiles";
import { PLAN_COLORS, planVsActual } from "../src/core/simulation";
import type { Activity } from "../src/core/types";

const DAY = 86_400_000;
const cam = (x: number): CameraKey["camera"] => ({ pos: [x, 10, 0], target: [0, 0, 0], fov: 45 });

describe("animation keyframes", () => {
  it("interpolates the date linearly and holds it outside the keys", () => {
    const keys = [
      { t: 2, date: 0 },
      { t: 12, date: 10 * DAY },
    ];
    expect(dateAt(keys, 0)).toBe(0);
    expect(dateAt(keys, 7)).toBe(5 * DAY);
    expect(dateAt(keys, 20)).toBe(10 * DAY);
    expect(dateAt([], 3)).toBeNull();
  });

  it("moves the camera by the key's interpolation", () => {
    const keys: CameraKey[] = [
      { t: 0, camera: cam(0), interp: "linear" },
      { t: 10, camera: cam(10), interp: "step" },
      { t: 20, camera: cam(30), interp: "smooth" },
    ];
    expect(cameraAt(keys, 5)!.pos[0]).toBeCloseTo(5);
    // Step: hold until the next key.
    expect(cameraAt(keys, 15)!.pos[0]).toBe(10);
    expect(cameraAt(keys, 25)!.pos[0]).toBe(30);
  });

  it("passes a smooth camera through every key", () => {
    const keys: CameraKey[] = [0, 5, 10, 15].map((t, i) => ({ t, camera: cam([0, 4, 6, 20][i]), interp: "smooth" }));
    for (const k of keys) expect(cameraAt(keys, k.t)!.pos[0]).toBeCloseTo(k.camera.pos[0]);
    const mid = cameraAt(keys, 7.5)!.pos[0];
    expect(mid).toBeGreaterThan(4);
    expect(mid).toBeLessThan(6);
  });

  it("holds view settings until the next view key", () => {
    const keys = [
      { t: 0, view: { cuts: [], box: null, colorMode: "profile" as const } },
      { t: 5, view: { cuts: [], box: null, colorMode: "status" as const } },
    ];
    expect(viewAt(keys, 4.9)!.colorMode).toBe("profile");
    expect(viewAt(keys, 5)!.colorMode).toBe("status");
  });

  it("adds, replaces, moves and removes keys", () => {
    let k = setKey([{ t: 1, date: 1 }], { t: 3, date: 3 });
    k = setKey(k, { t: 1.005, date: 9 });
    expect(k.map((x) => x.date)).toEqual([9, 3]);
    k = moveKey(k, 3, 50, 30);
    expect(k[1].t).toBe(30);
    expect(removeKey(k, 30)).toHaveLength(1);
  });

  it("makes a whole-schedule animation that holds at both ends", () => {
    const a = scheduleAnimation("a", "Tour", { start: 0, finish: 100 * DAY }, cam(1), { cuts: [], box: null }, 30);
    expect(evalAnimation(a, 1).date).toBe(0);
    expect(evalAnimation(a, 15).date).toBeCloseTo(50 * DAY);
    expect(evalAnimation(a, 29).date).toBe(100 * DAY);
    expect(evalAnimation(a, 15).camera!.pos[0]).toBe(1);
  });

  it("gives one frame time per frame, ending on the duration", () => {
    const f = frameTimes(2, 25);
    expect(f).toHaveLength(51);
    expect(f[0]).toBe(0);
    expect(f[50]).toBe(2);
  });
});

describe("project file", () => {
  it("keeps viewpoints and animations", () => {
    const presentation = {
      viewpoints: [{ id: "v", name: "Hall", time: 5, camera: cam(2), view: { cuts: [{ id: "c", axis: "y" as const, pos: 0.4, flip: false, on: true }], box: null }, createdAt: "" }],
      animations: [scheduleAnimation("a", "Tour", { start: 0, finish: DAY }, cam(1), { cuts: [], box: null })],
    };
    const text = serializeProject({ modelFileName: null, schedule: null, links: [], rules: [], profiles: DEFAULT_PROFILES, presentation });
    const p = parseProject(text);
    expect(p.presentation).toEqual(presentation);
    expect(normalizePresentation(undefined)).toEqual({ viewpoints: [], animations: [] });
  });
});

describe("planned vs actual", () => {
  const install = DEFAULT_PROFILES.find((p) => p.id === "install")!;
  const act = (start: number, finish: number, bs: number, bf: number) => ({ start, finish, baselineStart: bs, baselineFinish: bf }) as Activity;

  it("is blue on plan, green ahead and red behind", () => {
    expect(planVsActual(act(0, 10 * DAY, 0, 10 * DAY), install, 5 * DAY).color).toBe(PLAN_COLORS.onPlan);
    expect(planVsActual(act(0, 10 * DAY, 2 * DAY, 12 * DAY), install, 5 * DAY).color).toBe(PLAN_COLORS.ahead);
    expect(planVsActual(act(4 * DAY, 14 * DAY, 0, 10 * DAY), install, 5 * DAY).color).toBe(PLAN_COLORS.behind);
  });

  it("shows work the baseline has built but the current schedule has not, in red", () => {
    const s = planVsActual(act(20 * DAY, 30 * DAY, 0, 10 * DAY), install, 12 * DAY);
    expect(s.visible).toBe(true);
    expect(s.color).toBe(PLAN_COLORS.behind);
  });

  it("uses the profile when both are before or both are after", () => {
    expect(planVsActual(act(0, DAY, 0, DAY), install, -DAY).visible).toBe(false);
    expect(planVsActual(act(0, DAY, 0, DAY), install, 2 * DAY)).toMatchObject({ visible: true, color: null });
  });
});
