// Presentation of the 4D model: saved viewpoints and keyframe animations.
//
// A viewpoint stores the playback date, the camera and the view settings
// (cutting planes, cutting box, colour mode, dates to simulate), so a planner
// can come back to the same picture after the schedule or the model changes.
//
// An animation has three channels of keyframes, as in common 4D tools:
// - camera: where the camera is and what it looks at;
// - time: the playback date at that moment of the video;
// - view: the view settings, held until the next view key.
// Times on the channels are seconds of video.

import type { ColorMode, DateSource } from "./types";

export type Vec3 = [number, number, number];

export interface CameraState {
  pos: Vec3;
  target: Vec3;
  /** Vertical field of view in degrees. */
  fov: number;
}

/** A section plane across one axis; the position is a fraction (0..1) of the model's extent. */
export interface CutPlane {
  id: string;
  axis: "x" | "y" | "z";
  pos: number;
  /** Keep the other side. */
  flip: boolean;
  on: boolean;
}

/** Keep only what is inside a box; corners are fractions (0..1) of the model's extent on each axis. */
export interface CutBox {
  on: boolean;
  min: Vec3;
  max: Vec3;
}

export interface ViewSettings {
  cuts: CutPlane[];
  box: CutBox | null;
  colorMode?: ColorMode;
  dateSource?: DateSource;
  /** Show the colour legend over the 3D view (and in exported videos). */
  legend?: boolean;
}

export interface Viewpoint {
  id: string;
  name: string;
  /** Playback date, or null to keep the date when the viewpoint is activated. */
  time: number | null;
  camera: CameraState;
  view: ViewSettings;
  createdAt: string;
}

export type Interpolation = "smooth" | "linear" | "step";

export interface CameraKey {
  t: number;
  camera: CameraState;
  /** How the camera moves from this key to the next one. */
  interp: Interpolation;
}
export interface TimeKey {
  t: number;
  date: number;
}
export interface ViewKey {
  t: number;
  view: ViewSettings;
}

export interface Animation4D {
  id: string;
  name: string;
  /** Length of the video in seconds. */
  duration: number;
  camera: CameraKey[];
  time: TimeKey[];
  view: ViewKey[];
}

export interface Presentation {
  viewpoints: Viewpoint[];
  animations: Animation4D[];
}

export const EMPTY_PRESENTATION: Presentation = { viewpoints: [], animations: [] };
export const EMPTY_VIEW: ViewSettings = { cuts: [], box: null };

export type Channel = "camera" | "time" | "view";

export interface AnimationFrame {
  camera: CameraState | null;
  date: number | null;
  view: ViewSettings | null;
}

const byT = <K extends { t: number }>(keys: K[]) => [...keys].sort((a, b) => a.t - b.t);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const lerp3 = (a: Vec3, b: Vec3, u: number): Vec3 => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

/** Catmull-Rom through p1..p2 with neighbours p0 and p3, so the camera does not stop at each key. */
function catmull(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, u: number): Vec3 {
  const u2 = u * u;
  const u3 = u2 * u;
  const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])];
}

/** The segment of sorted keys around t: index of the key at or before t, and the fraction to the next. */
function around<K extends { t: number }>(keys: K[], t: number): { i: number; u: number } | null {
  if (!keys.length) return null;
  if (t <= keys[0].t) return { i: 0, u: 0 };
  const last = keys.length - 1;
  if (t >= keys[last].t) return { i: last, u: 0 };
  let i = 0;
  while (i < last && keys[i + 1].t <= t) i++;
  const span = keys[i + 1].t - keys[i].t;
  return { i, u: span > 0 ? (t - keys[i].t) / span : 0 };
}

export function cameraAt(keys: CameraKey[], t: number): CameraState | null {
  const k = byT(keys);
  const a = around(k, t);
  if (!a) return null;
  const { i, u } = a;
  const from = k[i];
  const to = k[i + 1];
  if (!to || u === 0 || from.interp === "step") return structuredClone(from.camera);
  if (from.interp === "linear") {
    return { pos: lerp3(from.camera.pos, to.camera.pos, u), target: lerp3(from.camera.target, to.camera.target, u), fov: lerp(from.camera.fov, to.camera.fov, u) };
  }
  const prev = k[i - 1] ?? from;
  const next = k[i + 2] ?? to;
  return {
    pos: catmull(prev.camera.pos, from.camera.pos, to.camera.pos, next.camera.pos, u),
    target: catmull(prev.camera.target, from.camera.target, to.camera.target, next.camera.target, u),
    fov: lerp(from.camera.fov, to.camera.fov, u),
  };
}

export function dateAt(keys: TimeKey[], t: number): number | null {
  const k = byT(keys);
  const a = around(k, t);
  if (!a) return null;
  const to = k[a.i + 1];
  return to ? lerp(k[a.i].date, to.date, a.u) : k[a.i].date;
}

export function viewAt(keys: ViewKey[], t: number): ViewSettings | null {
  const k = byT(keys);
  let hit: ViewKey | null = null;
  for (const key of k) if (key.t <= t + 1e-9) hit = key;
  return hit ? structuredClone(hit.view) : k.length ? structuredClone(k[0].view) : null;
}

export function evalAnimation(a: Animation4D, t: number): AnimationFrame {
  return { camera: cameraAt(a.camera, t), date: dateAt(a.time, t), view: viewAt(a.view, t) };
}

/** Put a key on a channel at time t, replacing a key that is less than half a frame away. */
export function setKey<K extends { t: number }>(keys: K[], key: K, tolerance = 1 / 50): K[] {
  return byT([...keys.filter((k) => Math.abs(k.t - key.t) > tolerance), key]);
}

export function removeKey<K extends { t: number }>(keys: K[], t: number, tolerance = 1 / 50): K[] {
  return keys.filter((k) => Math.abs(k.t - t) > tolerance);
}

/** Move a key to a new time (clamped to the animation). */
export function moveKey<K extends { t: number }>(keys: K[], from: number, to: number, duration: number): K[] {
  const at = Math.max(0, Math.min(duration, to));
  return byT(keys.map((k) => (Math.abs(k.t - from) < 1e-6 ? { ...k, t: at } : k)));
}

/** A first animation: the whole schedule from start to finish, with the current camera and view. */
export function scheduleAnimation(id: string, name: string, range: { start: number; finish: number }, camera: CameraState, view: ViewSettings, seconds = 30): Animation4D {
  // Two seconds still at each end, so the empty site and the finished work both hold a moment.
  const hold = Math.min(2, seconds / 10);
  return {
    id,
    name,
    duration: seconds,
    camera: [{ t: 0, camera: structuredClone(camera), interp: "smooth" }],
    time: [
      { t: 0, date: range.start },
      { t: hold, date: range.start },
      { t: seconds - hold, date: range.finish },
      { t: seconds, date: range.finish },
    ],
    view: [{ t: 0, view: structuredClone(view) }],
  };
}

/** Video frame times for an export at fps (the last frame lands on the duration). */
export function frameTimes(duration: number, fps: number): number[] {
  const n = Math.max(1, Math.round(duration * fps));
  return Array.from({ length: n + 1 }, (_, i) => Math.min(duration, i / fps));
}

export function normalizePresentation(p: unknown): Presentation {
  const o = (p ?? {}) as Partial<Presentation>;
  return {
    viewpoints: Array.isArray(o.viewpoints) ? o.viewpoints : [],
    animations: Array.isArray(o.animations) ? o.animations : [],
  };
}
