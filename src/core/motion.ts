// Element motion and partial display: equipment paths, directional growth,
// and splitting elements into segments (pours, bays).

import { phaseAt } from "./simulation";
import type { DateSource, ElementGroup, ElementSegment, GrowthDirection, ModelElement, MotionPath, Schedule } from "./types";

export type Vec3 = [number, number, number];

/** Part of an element's bounding box to show, as fractions along one axis. */
export interface Clip {
  axis: "x" | "y" | "z";
  lo: number;
  hi: number;
}

export interface Motion {
  offset: Vec3;
  /** Rotation around the vertical axis, radians. */
  yaw: number;
}

function length(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

/** Point and heading at fraction p (0..1) of the path's length. */
export function pointAlong(points: Vec3[], p: number): { point: Vec3; yaw: number } {
  if (points.length === 0) return { point: [0, 0, 0], yaw: 0 };
  if (points.length === 1) return { point: points[0], yaw: 0 };
  const segs = points.slice(1).map((b, i) => length(points[i], b));
  const total = segs.reduce((t, x) => t + x, 0);
  let target = Math.min(1, Math.max(0, p)) * total;
  for (let i = 0; i < segs.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (target <= segs[i] || i === segs.length - 1) {
      const f = segs[i] > 0 ? Math.min(1, target / segs[i]) : 0;
      return {
        point: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f],
        yaw: Math.atan2(b[0] - a[0], b[2] - a[2]),
      };
    }
    target -= segs[i];
  }
  return { point: points[points.length - 1], yaw: 0 };
}

/** Where each path-driven element is at time t, as an offset from its modelled position. */
export function motionAt(schedule: Schedule, paths: MotionPath[], t: number, source: DateSource = "current"): Map<string, Motion> {
  const acts = new Map(schedule.activities.map((a) => [a.id, a]));
  const out = new Map<string, Motion>();
  for (const path of paths) {
    const act = acts.get(path.activityId);
    if (!act || path.points.length < 2) continue;
    const { phase, progress } = phaseAt(act, t, source);
    const p = phase === "before" ? 0 : phase === "after" ? 1 : progress;
    const start = pointAlong(path.points, 0);
    const now = pointAlong(path.points, p);
    const motion: Motion = {
      offset: [now.point[0] - start.point[0], now.point[1] - start.point[1], now.point[2] - start.point[2]],
      yaw: path.orient ? now.yaw - start.yaw : 0,
    };
    for (const id of path.elementIds) out.set(id, motion);
  }
  return out;
}

/**
 * Directional growth: the visible part of an element at task progress p.
 * In Stratum's model space +Y is up and -Z is south, so "south-north" grows
 * from the low-Z side.
 */
export function growthClip(direction: GrowthDirection | undefined, p: number): Clip | null {
  const q = Math.min(1, Math.max(0, p));
  switch (direction) {
    case "bottom-up":
      return { axis: "y", lo: 0, hi: q };
    case "top-down":
      return { axis: "y", lo: 1 - q, hi: 1 };
    case "west-east":
      return { axis: "x", lo: 0, hi: q };
    case "east-west":
      return { axis: "x", lo: 1 - q, hi: 1 };
    case "south-north":
      return { axis: "z", lo: 0, hi: q };
    case "north-south":
      return { axis: "z", lo: 1 - q, hi: 1 };
    default:
      return null;
  }
}

/** Growth inside a segment: map the growth fraction into the segment's own range. */
export function combineClips(segment: Clip | null, growth: Clip | null): Clip | null {
  if (!segment) return growth;
  if (!growth) return segment;
  if (growth.axis !== segment.axis) return segment; // different axes: keep the segment cut (one clip axis per element)
  const span = segment.hi - segment.lo;
  return { axis: segment.axis, lo: segment.lo + growth.lo * span, hi: segment.lo + growth.hi * span };
}

/** The part of an element that is drawn: a range (fractions 0..1) on any of the three axes. */
export type Region = Partial<Record<Clip["axis"], [number, number]>>;

export function segmentRegion(s: Pick<ElementSegment, "axis" | "from" | "to" | "box">): Region {
  return s.box ? { x: [...s.box.x], y: [...s.box.y], z: [...s.box.z] } : { [s.axis]: [s.from, s.to] };
}

/** A segment's region narrowed by growth: growth runs inside the segment on its own axis. */
export function regionWithGrowth(region: Region | null, growth: Clip | null): Region | null {
  if (!growth) return region;
  const r: Region = { ...(region ?? {}) };
  const [a, b] = r[growth.axis] ?? [0, 1];
  const span = b - a;
  r[growth.axis] = [a + growth.lo * span, a + growth.hi * span];
  return r;
}

export function regionKey(r: Region | null): string {
  if (!r) return "";
  const f = (x: number) => Math.round(x * 1000) / 1000;
  return (["x", "y", "z"] as const).map((a) => (r[a] ? `${a}${f(r[a]![0])}-${f(r[a]![1])}` : "")).join("");
}

export function regionEmpty(r: Region | null): boolean {
  return !!r && (["x", "y", "z"] as const).some((a) => r[a] !== undefined && r[a]![1] - r[a]![0] <= 1e-4);
}

/** Split one element at chosen positions along an axis (fractions 0..1); the parts can be uneven. */
export function splitAt(parentId: string, axis: Clip["axis"], cuts: number[], label = "Part"): ElementSegment[] {
  const at = [...new Set(cuts.filter((c) => c > 0.001 && c < 0.999).map((c) => Math.round(c * 1000) / 1000))].sort((a, b) => a - b);
  const edges = [0, ...at, 1];
  return edges.slice(1).map((to, i) => ({ id: `${parentId}#${axis}@${edges[i]}-${to}`, parentId, name: `${label} ${i + 1}`, axis, from: edges[i], to }));
}

/** Split one element into a grid: columns along X, rows along Z and layers up the height. */
export function splitGrid(parentId: string, nx: number, nz: number, ny: number, label = "Part"): ElementSegment[] {
  const c = (n: number) => Math.max(1, Math.min(20, Math.round(n)));
  const [X, Z, Y] = [c(nx), c(nz), c(ny)];
  const out: ElementSegment[] = [];
  for (let k = 0; k < Y; k++)
    for (let j = 0; j < Z; j++)
      for (let i = 0; i < X; i++) {
        const box = { x: [i / X, (i + 1) / X] as [number, number], y: [k / Y, (k + 1) / Y] as [number, number], z: [j / Z, (j + 1) / Z] as [number, number] };
        const name = [X > 1 ? `col ${i + 1}` : "", Z > 1 ? `row ${j + 1}` : "", Y > 1 ? `layer ${k + 1}` : ""].filter(Boolean).join(" · ");
        out.push({ id: `${parentId}#g${i + 1}.${j + 1}.${k + 1}of${X}x${Z}x${Y}`, parentId, name: `${label} ${name}`, axis: "x", from: box.x[0], to: box.x[1], box });
      }
  return out;
}

/** Split one element into n equal segments along an axis. */
export function splitElement(parentId: string, axis: Clip["axis"], n: number, label = "Part"): ElementSegment[] {
  const k = Math.max(2, Math.min(50, Math.round(n)));
  return Array.from({ length: k }, (_, i) => ({
    id: `${parentId}#${axis}${i + 1}of${k}`,
    parentId,
    name: `${label} ${i + 1}`,
    axis,
    from: i / k,
    to: (i + 1) / k,
  }));
}

/**
 * The element list the rest of the app works with: split parents are replaced
 * by their segments, and group membership is exposed as a "Group" property so
 * rules and selection-by-property can use it.
 */
export function expandElements(elements: ModelElement[], segments: ElementSegment[], groups: ElementGroup[] = []): ModelElement[] {
  const byParent = new Map<string, ElementSegment[]>();
  for (const s of segments) (byParent.get(s.parentId) ?? byParent.set(s.parentId, []).get(s.parentId)!).push(s);
  const groupNames = new Map<string, string[]>();
  for (const g of groups) for (const id of g.elementIds) (groupNames.get(id) ?? groupNames.set(id, []).get(id)!).push(g.name);
  const withGroup = (e: ModelElement): ModelElement => {
    const names = groupNames.get(e.id);
    return names ? { ...e, properties: { ...e.properties, Group: names.join(", ") } } : e;
  };
  const out: ModelElement[] = [];
  for (const e of elements) {
    const segs = byParent.get(e.id);
    if (!segs) {
      out.push(withGroup(e));
      continue;
    }
    for (const s of segs) {
      out.push(withGroup({ ...e, id: s.id, name: `${e.name} – ${s.name}`, properties: { ...e.properties, Segment: s.name, ParentGlobalId: e.id } }));
    }
  }
  return out;
}
