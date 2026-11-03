// 4D presentation tools over the 3D view: Zoom All and standard views,
// section planes and a section box, saved viewpoints, a colour legend, and an
// animation editor with camera, date and view keyframes that exports a video
// or a series of images at a chosen size and frame rate.
//
// One rule holds throughout: the animation drives the same playback date,
// camera and view settings that the user drives by hand, so what you see while
// you edit is what the export renders.

import { ArrowLeftRight, Bookmark, Film, Image as ImageIcon, Maximize, Pause, Play, Plus, Scissors, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { strToU8, zipSync } from "fflate";
import { mergeLinks } from "../core/linking";
import { motionAt } from "../core/motion";
import {
  evalAnimation,
  frameTimes,
  moveKey,
  removeKey,
  scheduleAnimation,
  setKey,
  type Animation4D,
  type Channel,
  type CutPlane,
  type Interpolation,
  type ViewSettings,
  type Viewpoint,
} from "../core/presentation";
import { STATUS_COLORS } from "../core/profiles";
import { uid } from "../core/reporting";
import { computeStates, PLAN_COLORS, scheduleRange, type SimulationOptions } from "../core/simulation";
import type { AppearanceProfile, Link } from "../core/types";
import type { Viewer } from "../viewer/Viewer";
import { download, downloadDataUrl } from "./files";
import { fmtDate, useStore } from "./store";

type Panel = null | "sections" | "views";
const AXIS_NAME = { x: "X", y: "Height", z: "Z" } as const;
const CHANNEL_COLOR: Record<Channel, string> = { camera: "#3b7dd8", time: "#d4a574", view: "#8a5a3b" };
const CHANNEL_NAME: Record<Channel, string> = { camera: "Camera", time: "Date", view: "View" };
export const LINK_PROFILE_KEY = "stratum.linkProfile";

/** Legend rows for the colour mode in use. */
export function legendItems(sim: SimulationOptions, profiles: AppearanceProfile[], links: Link[]): { label: string; color: string }[] {
  if (sim.colorMode === "status")
    return [
      { label: "Not started", color: STATUS_COLORS["not-started"] },
      { label: "In progress", color: STATUS_COLORS["in-progress"] },
      { label: "Critical, in progress", color: STATUS_COLORS.critical },
      { label: "Late against baseline", color: STATUS_COLORS.late },
      { label: "Complete", color: STATUS_COLORS.complete },
    ];
  if (sim.colorMode === "plan-vs-actual")
    return [
      { label: "Ahead of baseline", color: PLAN_COLORS.ahead },
      { label: "On plan", color: PLAN_COLORS.onPlan },
      { label: "Behind baseline", color: PLAN_COLORS.behind },
    ];
  const used = new Set(links.map((l) => l.profileId));
  return profiles.filter((p) => used.has(p.id)).map((p) => ({ label: p.name, color: p.active.color ?? "#9aa5b1" }));
}

/** Date and legend drawn over an exported frame. */
function drawOverlay(g: CanvasRenderingContext2D, _W: number, H: number, o: { date: string | null; title: string | null; items: { label: string; color: string }[] | null }) {
  const k = H / 1080;
  const pad = 28 * k;
  g.textBaseline = "middle";
  if (o.date) {
    g.font = `600 ${30 * k}px Inter, Arial, sans-serif`;
    const lines = o.title ? [o.title, o.date] : [o.date];
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 36 * k;
    const h = lines.length * 42 * k + 16 * k;
    g.fillStyle = "rgba(11,37,69,0.86)";
    g.beginPath();
    g.roundRect(pad, pad, w, h, 10 * k);
    g.fill();
    g.fillStyle = "#fff";
    lines.forEach((l, i) => {
      g.font = `${i === lines.length - 1 ? 700 : 500} ${(i === lines.length - 1 ? 30 : 22) * k}px Inter, Arial, sans-serif`;
      g.fillText(l, pad + 18 * k, pad + 8 * k + 21 * k + i * 42 * k);
    });
  }
  if (o.items?.length) {
    g.font = `500 ${22 * k}px Inter, Arial, sans-serif`;
    const row = 34 * k;
    const w = Math.max(...o.items.map((i) => g.measureText(i.label).width)) + 74 * k;
    const h = o.items.length * row + 20 * k;
    const y0 = H - pad - h;
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.beginPath();
    g.roundRect(pad, y0, w, h, 10 * k);
    g.fill();
    o.items.forEach((it, i) => {
      const y = y0 + 10 * k + row * i + row / 2;
      g.fillStyle = it.color;
      g.fillRect(pad + 16 * k, y - 9 * k, 26 * k, 18 * k);
      g.fillStyle = "#1d2733";
      g.fillText(it.label, pad + 54 * k, y);
    });
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function Present({ getViewer, gen }: { getViewer: () => Viewer | null; gen: number }) {
  const st = useStore();
  const { schedule, view3d, sim, time, links, profiles } = st;
  const [panel, setPanel] = useState<Panel>(null);
  const [editor, setEditor] = useState(false);

  // The live sections follow the store.
  useEffect(() => {
    getViewer()?.setSections(view3d.cuts, view3d.box);
  }, [view3d.cuts, view3d.box, gen, getViewer]);

  // Ctrl+Shift+A: link the selected elements to the selected activity (profile last used in the Selection tab).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "a")) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const s = useStore.getState();
      const act = s.schedule?.activities.find((a) => a.id === s.selectedActivity);
      if (!act || !s.selectedElements.size) {
        s.setStatus("To link: select elements in the 3D view and one activity, then push Ctrl+Shift+A.");
        return;
      }
      e.preventDefault();
      let profileId = "install";
      try {
        profileId = localStorage.getItem(LINK_PROFILE_KEY) || "install";
      } catch {
        /* storage blocked */
      }
      if (!s.profiles.some((p) => p.id === profileId)) profileId = s.profiles[0]?.id ?? "install";
      s.setLinks(mergeLinks(s.links, [...s.selectedElements].map((elementId) => ({ elementId, activityId: act.id, profileId }))));
      s.setStatus(`Linked ${s.selectedElements.size} element(s) to ${act.code} (${s.profiles.find((p) => p.id === profileId)?.name}).`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = (): ViewSettings => ({ ...structuredClone(useStore.getState().view3d), colorMode: useStore.getState().sim.colorMode, dateSource: useStore.getState().sim.dateSource });

  /** Apply view settings (sections, legend, colour mode, dates) to the store. */
  const applyView = (v: ViewSettings) => {
    const s = useStore.getState();
    s.setView3d({ cuts: v.cuts, box: v.box, legend: v.legend });
    const patch: Partial<SimulationOptions> = {};
    if (v.colorMode && v.colorMode !== s.sim.colorMode) patch.colorMode = v.colorMode;
    if (v.dateSource && v.dateSource !== s.sim.dateSource) patch.dateSource = v.dateSource;
    if (Object.keys(patch).length) s.setSim(patch);
  };

  const items = useMemo(() => legendItems(sim, profiles, links), [sim, profiles, links]);
  const v = getViewer();
  if (!v || !schedule) return null;

  return (
    <>
      <div className="pr-dock">
      <div className="pr-bar" role="toolbar" aria-label="3D view">
        <button className="pr-btn" title="Zoom All: show the whole model" onClick={() => v.zoomAll()}>
          <Maximize size={14} aria-hidden /> <span className="pr-txt">Zoom All</span>
        </button>
        <select className="pr-btn" title="Look from a standard direction" value="" onChange={(e) => e.target.value && v.viewFrom(e.target.value as Parameters<Viewer["viewFrom"]>[0])}>
          <option value="">View…</option>
          <option value="iso">Isometric</option>
          <option value="top">Top</option>
          <option value="front">Front</option>
          <option value="back">Back</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>
        <button className={`pr-btn ${panel === "sections" ? "on" : ""}`} title="Section planes and section box" onClick={() => setPanel(panel === "sections" ? null : "sections")}>
          <Scissors size={14} aria-hidden /> <span className="pr-txt">Sections</span>
          {view3d.cuts.some((c) => c.on) || view3d.box?.on ? " •" : ""}
        </button>
        <button className={`pr-btn ${panel === "views" ? "on" : ""}`} title="Saved viewpoints: date, camera and view settings" onClick={() => setPanel(panel === "views" ? null : "views")}>
          <Bookmark size={14} aria-hidden /> <span className="pr-txt">Viewpoints</span>
        </button>
        <button className={`pr-btn ${editor ? "on" : ""}`} title="Animation editor: keyframes and video export" onClick={() => setEditor(!editor)}>
          <Film size={14} aria-hidden /> <span className="pr-txt">Animation</span>
        </button>
      </div>

      {panel === "sections" && <SectionsPanel viewer={v} />}
      {panel === "views" && <ViewpointsPanel viewer={v} current={current} applyView={applyView} />}
      </div>

      {view3d.legend && !editor && items.length > 0 && (
        <div className="pr-legend" aria-label="Legend">
          <b>{fmtDate(time)}</b>
          {items.map((i) => (
            <span key={i.label}>
              <i style={{ background: i.color }} />
              {i.label}
            </span>
          ))}
        </div>
      )}

      {editor && <AnimationEditor viewer={v} current={current} applyView={applyView} onClose={() => setEditor(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- sections

function SectionsPanel({ viewer }: { viewer: Viewer }) {
  const { view3d, setView3d, selectedElements } = useStore();
  const setCut = (id: string, patch: Partial<CutPlane>) => setView3d({ cuts: view3d.cuts.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const add = (axis: CutPlane["axis"]) => setView3d({ cuts: [...view3d.cuts, { id: uid("cut"), axis, pos: axis === "y" ? 0.6 : 0.5, flip: false, on: true }] });
  const box = view3d.box ?? { on: false, min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
  const setBox = (patch: Partial<typeof box>) => setView3d({ box: { ...box, ...patch } });
  const fitToSelection = () => {
    const f = viewer.fractionsOf(selectedElements);
    if (f) setBox({ on: true, min: f.min, max: f.max });
  };
  return (
    <div className="pr-panel" aria-label="Sections">
      <div className="pr-head">
        <b>Section planes</b>
        <span className="spacer" />
        {(["x", "y", "z"] as const).map((a) => (
          <button key={a} className="mini" onClick={() => add(a)} title={`Add a section plane across ${AXIS_NAME[a]}`}>
            <Plus size={12} aria-hidden /> {AXIS_NAME[a]}
          </button>
        ))}
      </div>
      {view3d.cuts.length === 0 && <p className="muted">No section planes. Add one across X, the height or Z.</p>}
      {view3d.cuts.map((c) => (
        <div key={c.id} className="pr-row">
          <input type="checkbox" checked={c.on} onChange={(e) => setCut(c.id, { on: e.target.checked })} aria-label={`Use the ${AXIS_NAME[c.axis]} plane`} />
          <span className="pr-axis">{AXIS_NAME[c.axis]}</span>
          <input type="range" min={0} max={1} step={0.005} value={c.pos} onChange={(e) => setCut(c.id, { pos: Number(e.target.value) })} aria-label={`Position of the ${AXIS_NAME[c.axis]} plane`} />
          <button className={`mini ${c.flip ? "on" : ""}`} title="Keep the other side" onClick={() => setCut(c.id, { flip: !c.flip })}>
            <ArrowLeftRight size={12} aria-hidden />
          </button>
          <button className="mini" title="Remove the plane" onClick={() => setView3d({ cuts: view3d.cuts.filter((x) => x.id !== c.id) })}>
            <X size={12} aria-hidden />
          </button>
        </div>
      ))}
      <div className="pr-head">
        <label className="check">
          <input type="checkbox" checked={box.on} onChange={(e) => setBox({ on: e.target.checked })} /> <b>Section box</b>
        </label>
        <span className="spacer" />
        <button className="mini" disabled={!selectedElements.size} onClick={fitToSelection} title="Put the box around the selected elements">
          Fit to selection
        </button>
      </div>
      {box.on &&
        (["x", "y", "z"] as const).map((a, i) => (
          <div key={a} className="pr-row two">
            <span className="pr-axis">{AXIS_NAME[a]}</span>
            <input type="range" min={0} max={1} step={0.005} value={box.min[i]} aria-label={`${AXIS_NAME[a]} minimum`} onChange={(e) => setBox({ min: box.min.map((x, j) => (j === i ? Number(e.target.value) : x)) as [number, number, number] })} />
            <input type="range" min={0} max={1} step={0.005} value={box.max[i]} aria-label={`${AXIS_NAME[a]} maximum`} onChange={(e) => setBox({ max: box.max.map((x, j) => (j === i ? Number(e.target.value) : x)) as [number, number, number] })} />
          </div>
        ))}
      <div className="pr-head">
        <label className="check">
          <input type="checkbox" checked={!!view3d.legend} onChange={(e) => setView3d({ legend: e.target.checked })} /> Show the legend and date
        </label>
        <span className="spacer" />
        <button className="mini" onClick={() => setView3d({ cuts: [], box: null })} disabled={!view3d.cuts.length && !view3d.box}>
          Clear
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- viewpoints

function ViewpointsPanel({ viewer, current, applyView }: { viewer: Viewer; current: () => ViewSettings; applyView: (v: ViewSettings) => void }) {
  const { presentation, setPresentation, time, setTime, setStatus, schedule } = useStore();
  const list = presentation.viewpoints;
  const put = (viewpoints: Viewpoint[]) => setPresentation({ ...useStore.getState().presentation, viewpoints });
  const save = () => {
    const name = window.prompt("Name of the viewpoint", `Viewpoint ${list.length + 1} – ${fmtDate(time)}`);
    if (!name) return;
    put([...list, { id: uid("vp"), name, time, camera: viewer.getCamera(), view: current(), createdAt: new Date().toISOString() }]);
    setStatus(`Saved viewpoint "${name}".`);
  };
  const activate = (vp: Viewpoint, ms = 900) => {
    if (vp.time !== null) setTime(vp.time);
    applyView(vp.view);
    viewer.setCamera(vp.camera, ms);
  };
  const image = async (vp: Viewpoint) => {
    activate(vp, 0);
    await nextPaint();
    const s = useStore.getState();
    const c = viewer.renderFrame(1920, 1080);
    drawOverlay(c.getContext("2d")!, 1920, 1080, { title: vp.name, date: fmtDate(s.time), items: vp.view.legend ? legendItems(s.sim, s.profiles, s.links) : null });
    downloadDataUrl(`${schedule?.projectCode ?? "stratum"}-${vp.name.replace(/[^\w-]+/g, "_")}.png`, c.toDataURL("image/png"));
  };
  return (
    <div className="pr-panel" aria-label="Viewpoints">
      <div className="pr-head">
        <b>Viewpoints</b>
        <span className="spacer" />
        <button className="mini primary" onClick={save}>
          <Plus size={12} aria-hidden /> Save viewpoint
        </button>
      </div>
      <p className="muted">A viewpoint keeps the date, the camera, the section planes and box, the colour mode and the dates to simulate.</p>
      {list.length === 0 && <p className="muted">No viewpoints yet.</p>}
      <ul className="pr-list">
        {list.map((vp) => (
          <li key={vp.id}>
            <button className="link pr-name" title="Show this viewpoint" onClick={() => activate(vp)} onDoubleClick={() => activate(vp, 0)}>
              {vp.name}
            </button>
            <span className="muted">{vp.time !== null ? fmtDate(vp.time) : "any date"}</span>
            <span className="spacer" />
            <button className="mini" title="Replace with the current view" onClick={() => put(list.map((x) => (x.id === vp.id ? { ...x, time, camera: viewer.getCamera(), view: current() } : x)))}>
              Update
            </button>
            <button
              className="mini"
              title="Rename"
              onClick={() => {
                const name = window.prompt("Name of the viewpoint", vp.name);
                if (name) put(list.map((x) => (x.id === vp.id ? { ...x, name } : x)));
              }}
            >
              Rename
            </button>
            <button className="mini" title="Save as image (1920 × 1080 PNG)" onClick={() => void image(vp)}>
              <ImageIcon size={12} aria-hidden />
            </button>
            <button className="mini" title="Delete" onClick={() => put(list.filter((x) => x.id !== vp.id))}>
              <Trash2 size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- animation editor

interface ExportOptions {
  width: number;
  height: number;
  fps: number;
  format: "video" | "images";
  date: boolean;
  legend: boolean;
  grid: boolean;
}

function AnimationEditor({ viewer, current, applyView, onClose }: { viewer: Viewer; current: () => ViewSettings; applyView: (v: ViewSettings) => void; onClose: () => void }) {
  const { presentation, setPresentation, schedule, sim, setStatus } = useStore();
  const anims = presentation.animations;
  const [selId, setSelId] = useState<string | null>(anims[0]?.id ?? null);
  const anim = anims.find((a) => a.id === selId) ?? anims[0] ?? null;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sel, setSel] = useState<{ ch: Channel; t: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const cancel = useRef(false);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ ch: Channel | "head"; from: number } | null>(null);

  const putAnim = (a: Animation4D) => setPresentation({ ...useStore.getState().presentation, animations: useStore.getState().presentation.animations.map((x) => (x.id === a.id ? a : x)) });

  /** Show the animation at time u: camera, date and view. */
  const show = (a: Animation4D, u: number) => {
    const f = evalAnimation(a, u);
    if (f.camera) viewer.setCamera(f.camera, 0);
    if (f.date !== null) useStore.getState().setTime(f.date);
    if (f.view) applyView(f.view);
  };

  const create = () => {
    if (!schedule) return;
    const range = scheduleRange(schedule, sim.dateSource);
    if (!range) return;
    const a = scheduleAnimation(uid("anim"), `Animation ${anims.length + 1}`, range, viewer.getCamera(), current(), 30);
    setPresentation({ ...presentation, animations: [...anims, a] });
    setSelId(a.id);
    setT(0);
    setStatus("New animation: the whole schedule in 30 s. Move the camera and click the Camera channel to add camera keys.");
  };

  // Preview: play the animation in real time.
  useEffect(() => {
    if (!playing || !anim) return;
    let raf = 0;
    const t0 = performance.now() - t * 1000;
    const step = (now: number) => {
      const u = (now - t0) / 1000;
      if (u >= anim.duration) {
        setT(anim.duration);
        show(anim, anim.duration);
        setPlaying(false);
        return;
      }
      setT(u);
      show(anim, u);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, anim?.id]);

  const timeAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.max(0, Math.min(anim!.duration, ((clientX - r.left) / r.width) * anim!.duration));
  };
  const keysOf = (a: Animation4D, ch: Channel): { t: number }[] => (ch === "camera" ? a.camera : ch === "time" ? a.time : a.view);

  /** Add a key on a channel at time u from the current state of the view. */
  const addKey = (ch: Channel, u: number) => {
    if (!anim) return;
    const s = useStore.getState();
    if (ch === "camera") putAnim({ ...anim, camera: setKey(anim.camera, { t: u, camera: viewer.getCamera(), interp: "smooth" }) });
    if (ch === "time") putAnim({ ...anim, time: setKey(anim.time, { t: u, date: s.time }) });
    if (ch === "view") putAnim({ ...anim, view: setKey(anim.view, { t: u, view: current() }) });
    setSel({ ch, t: u });
  };
  const deleteKey = () => {
    if (!anim || !sel) return;
    const k = sel.ch;
    putAnim({ ...anim, [k]: removeKey(keysOf(anim, k) as never[], sel.t) } as Animation4D);
    setSel(null);
  };

  // Delete removes the selected key while the editor has focus.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      deleteKey();
    }
  };

  const onTrackDown = (ch: Channel | "head") => (e: RPointerEvent) => {
    if (!anim || playing) return;
    const u = timeAt(e.clientX);
    if (ch === "head") {
      drag.current = { ch: "head", from: u };
      setT(u);
      show(anim, u);
    } else {
      // On a key: select it (and drag to move); on empty track: a new key here from the current view.
      const near = keysOf(anim, ch).find((k) => Math.abs(k.t - u) <= anim.duration * 0.012);
      if (near) {
        setSel({ ch, t: near.t });
        setT(near.t);
        show(anim, near.t);
        drag.current = { ch, from: near.t };
      } else {
        setT(u);
        addKey(ch, u);
      }
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onTrackMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || !anim) return;
    const u = timeAt(e.clientX);
    if (d.ch === "head") {
      setT(u);
      show(anim, u);
    } else if (Math.abs(u - d.from) > 1 / 50) {
      putAnim({ ...anim, [d.ch]: moveKey(keysOf(anim, d.ch) as never[], d.from, u, anim.duration) } as Animation4D);
      setSel({ ch: d.ch, t: u });
      drag.current = { ch: d.ch, from: u };
      setT(u);
    }
  };
  const onTrackUp = () => (drag.current = null);

  const selCameraKey = sel?.ch === "camera" && anim ? anim.camera.find((k) => Math.abs(k.t - sel.t) < 1e-6) : undefined;

  const runExport = async (o: ExportOptions) => {
    if (!anim || !schedule) return;
    setExportOpen(false);
    setPlaying(false);
    cancel.current = false;
    const s0 = useStore.getState();
    const ids = s0.elements.map((e) => e.id);
    const times = frameTimes(anim.duration, o.fps);
    const out = document.createElement("canvas");
    out.width = o.width;
    out.height = o.height;
    const g = out.getContext("2d")!;
    viewer.setGridVisible(o.grid);
    const files: Record<string, Uint8Array> = {};
    let rec: MediaRecorder | null = null;
    let track: CanvasCaptureMediaStreamTrack | null = null;
    const chunks: Blob[] = [];
    if (o.format === "video") {
      const stream = out.captureStream(0);
      track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
      const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(o.width * o.height * o.fps * 0.15) });
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.start(500);
    }
    const start = performance.now();
    for (let i = 0; i < times.length; i++) {
      if (cancel.current) break;
      const u = times[i];
      const f = evalAnimation(anim, u);
      const s = useStore.getState();
      const date = f.date ?? s.time;
      const view = f.view ?? current();
      const simV: SimulationOptions = { ...s.sim, colorMode: view.colorMode ?? s.sim.colorMode, dateSource: view.dateSource ?? s.sim.dateSource };
      viewer.applyFrame(computeStates(schedule, s.links, s.profiles, ids, date, simV), motionAt(schedule, s.paths, date, simV.dateSource));
      viewer.setSections(view.cuts, view.box);
      if (f.camera) viewer.setCamera(f.camera, 0);
      const frame = viewer.renderFrame(o.width, o.height);
      g.drawImage(frame, 0, 0);
      drawOverlay(g, o.width, o.height, { title: null, date: o.date ? fmtDate(date) : null, items: o.legend ? legendItems(simV, s.profiles, s.links) : null });
      if (o.format === "video") {
        // The recorder stamps frames as they arrive, so they arrive at the frame rate.
        const due = start + (i * 1000) / o.fps;
        const wait = due - performance.now();
        if (wait > 0) await sleep(wait);
        track!.requestFrame();
        // The canvas is captured when the page paints, so give it one paint for each frame.
        await new Promise((r) => requestAnimationFrame(r));
      } else {
        const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/png"));
        if (blob) files[`frame_${String(i).padStart(5, "0")}.png`] = new Uint8Array(await blob.arrayBuffer());
      }
      if (i % 3 === 0) {
        setProgress({ i: i + 1, n: times.length });
        if (o.format === "images") await sleep(0);
      }
    }
    viewer.setGridVisible(true);
    setProgress(null);
    const name = `${schedule.projectCode}-${anim.name}`.replace(/[^\w-]+/g, "_");
    if (rec) {
      await sleep(1000 / o.fps + 50);
      await new Promise<void>((r) => {
        rec!.onstop = () => r();
        rec!.stop();
      });
      if (!cancel.current) download(`${name}.webm`, new Blob(chunks, { type: "video/webm" }), "video/webm");
    } else if (!cancel.current) {
      files["README.txt"] = strToU8(`${anim.name}: ${times.length} frames at ${o.fps} frames per second, ${o.width} x ${o.height}.\n`);
      download(`${name}-frames.zip`, zipSync(files, { level: 0 }), "application/zip");
    }
    // Put the view back to the editor's playhead.
    show(anim, t);
    setStatus(cancel.current ? "Export cancelled." : `Exported "${anim.name}" (${times.length} frames).`);
  };

  const ticks = anim ? Array.from({ length: Math.floor(anim.duration / (anim.duration > 60 ? 10 : 5)) + 1 }, (_, i) => i * (anim.duration > 60 ? 10 : 5)) : [];
  const pct = (u: number) => `${(u / (anim?.duration || 1)) * 100}%`;
  const dateNow = anim ? evalAnimation(anim, t).date : null;

  return (
    <div className="pr-anim" tabIndex={-1} onKeyDown={onKeyDown} aria-label="Animation editor">
      <div className="pr-anim-head">
        <b>Animation</b>
        <select value={anim?.id ?? ""} onChange={(e) => (setSelId(e.target.value), setT(0), setSel(null))} aria-label="Animation">
          {anims.length === 0 && <option value="">No animations</option>}
          {anims.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button className="mini" onClick={create} title="A new animation of the whole schedule">
          <Plus size={12} aria-hidden /> New
        </button>
        {anim && (
          <>
            <button
              className="mini"
              onClick={() => {
                const name = window.prompt("Name of the animation", anim.name);
                if (name) putAnim({ ...anim, name });
              }}
            >
              Rename
            </button>
            <button
              className="mini"
              title="Delete the animation"
              onClick={() => {
                if (!window.confirm(`Delete the animation "${anim.name}"?`)) return;
                setPresentation({ ...presentation, animations: anims.filter((x) => x.id !== anim.id) });
                setSelId(null);
              }}
            >
              <Trash2 size={12} aria-hidden />
            </button>
            <label className="pr-dur">
              Length
              <input
                type="number"
                min={2}
                max={600}
                value={anim.duration}
                onChange={(e) => {
                  const d = Math.max(2, Math.min(600, Number(e.target.value) || anim.duration));
                  const scale = d / anim.duration;
                  // Stretch the keys with the length, so the animation keeps its shape.
                  putAnim({ ...anim, duration: d, camera: anim.camera.map((k) => ({ ...k, t: k.t * scale })), time: anim.time.map((k) => ({ ...k, t: k.t * scale })), view: anim.view.map((k) => ({ ...k, t: k.t * scale })) });
                  setT(t * scale);
                }}
              />
              s
            </label>
            <span className="spacer" />
            <button className="mini" onClick={() => (t >= anim.duration ? (setT(0), setPlaying(true)) : setPlaying(!playing))} title="Preview">
              {playing ? <Pause size={12} aria-hidden /> : <Play size={12} aria-hidden />} {playing ? "Pause" : "Preview"}
            </button>
            <span className="pr-clock">
              {t.toFixed(1)} s{dateNow !== null ? ` · ${fmtDate(dateNow)}` : ""}
            </span>
            <button className="mini primary" onClick={() => setExportOpen(true)} disabled={!!progress}>
              Export…
            </button>
          </>
        )}
        <button className="mini" onClick={onClose} title="Close the animation editor">
          <X size={12} aria-hidden />
        </button>
      </div>

      {!anim ? (
        <p className="muted pr-empty">Click New to make an animation of the whole schedule. Then add keys: move the camera, change the date or the view, and click in a channel.</p>
      ) : (
        <div className="pr-tracks" onPointerMove={onTrackMove} onPointerUp={onTrackUp}>
          <div className="pr-label" />
          <div className="pr-ruler" ref={track} onPointerDown={onTrackDown("head")}>
            {ticks.map((s) => (
              <span key={s} style={{ left: pct(s) }}>
                {s}s
              </span>
            ))}
          </div>
          {(["camera", "time", "view"] as Channel[]).map((ch) => (
            <div key={ch} className="pr-trackrow">
              <div className="pr-label">
                <i style={{ background: CHANNEL_COLOR[ch] }} />
                {CHANNEL_NAME[ch]}
              </div>
              <div className="pr-track" onPointerDown={onTrackDown(ch)} title={`Click to add a ${CHANNEL_NAME[ch].toLowerCase()} key from the current view; drag a key to move it`}>
                {keysOf(anim, ch).map((k) => (
                  <span key={k.t} className={`pr-key ${sel?.ch === ch && Math.abs(sel.t - k.t) < 1e-6 ? "sel" : ""}`} style={{ left: pct(k.t), background: CHANNEL_COLOR[ch] }} />
                ))}
              </div>
            </div>
          ))}
          <div className="pr-head-line" style={{ left: `calc(84px + (100% - 84px) * ${t / anim.duration})` }} />
        </div>
      )}

      {anim && (
        <div className="pr-anim-foot">
          <button className="mini" onClick={() => addKey("camera", t)}>Key camera</button>
          <button className="mini" onClick={() => addKey("time", t)}>Key date</button>
          <button className="mini" onClick={() => addKey("view", t)}>Key view</button>
          {sel && (
            <>
              <span className="muted">
                {CHANNEL_NAME[sel.ch]} key at {sel.t.toFixed(1)} s
              </span>
              {selCameraKey && (
                <select value={selCameraKey.interp} onChange={(e) => putAnim({ ...anim, camera: anim.camera.map((k) => (k === selCameraKey ? { ...k, interp: e.target.value as Interpolation } : k)) })} aria-label="Camera movement to the next key">
                  <option value="smooth">Smooth</option>
                  <option value="linear">Linear</option>
                  <option value="step">Jump</option>
                </select>
              )}
              <button className="mini" onClick={deleteKey}>
                Remove key
              </button>
            </>
          )}
        </div>
      )}

      {exportOpen && anim && <ExportDialog anim={anim} onCancel={() => setExportOpen(false)} onExport={(o) => void runExport(o)} />}
      {progress && (
        <div className="pr-progress">
          Exporting frame {progress.i} of {progress.n}…
          <progress value={progress.i} max={progress.n} />
          <button className="mini" onClick={() => (cancel.current = true)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

const SIZES: [number, number, string][] = [
  [1280, 720, "1280 × 720 (HD)"],
  [1920, 1080, "1920 × 1080 (Full HD)"],
  [2560, 1440, "2560 × 1440"],
  [3840, 2160, "3840 × 2160 (4K)"],
];

function ExportDialog({ anim, onCancel, onExport }: { anim: Animation4D; onCancel: () => void; onExport: (o: ExportOptions) => void }) {
  const [size, setSize] = useState(1);
  const [o, setO] = useState<Omit<ExportOptions, "width" | "height">>({ fps: 25, format: "video", date: true, legend: true, grid: true });
  const frames = Math.round(anim.duration * o.fps) + 1;
  return (
    <div className="pr-dialog" role="dialog" aria-label="Export animation">
      <h4>Export "{anim.name}"</h4>
      <label>
        Resolution
        <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
          {SIZES.map(([, , l], i) => (
            <option key={l} value={i}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <label>
        Frame rate
        <select value={o.fps} onChange={(e) => setO({ ...o, fps: Number(e.target.value) })}>
          {[15, 25, 30, 60].map((f) => (
            <option key={f} value={f}>
              {f} frames per second
            </option>
          ))}
        </select>
      </label>
      <label>
        Output
        <select value={o.format} onChange={(e) => setO({ ...o, format: e.target.value as ExportOptions["format"] })}>
          <option value="video">Video (WebM)</option>
          <option value="images">Series of images (PNG, in a zip file)</option>
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={o.date} onChange={(e) => setO({ ...o, date: e.target.checked })} /> Show the date
      </label>
      <label className="check">
        <input type="checkbox" checked={o.legend} onChange={(e) => setO({ ...o, legend: e.target.checked })} /> Show the legend
      </label>
      <label className="check">
        <input type="checkbox" checked={o.grid} onChange={(e) => setO({ ...o, grid: e.target.checked })} /> Show the ground grid
      </label>
      <p className="muted">
        {frames} frames. {o.format === "video" ? `The video export takes about ${Math.ceil(anim.duration)} s, the length of the animation.` : "Each frame is one PNG file."} Tip: hold the last view for a few seconds at the end.
      </p>
      <div className="row">
        <span className="spacer" />
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={() => onExport({ ...o, width: SIZES[size][0], height: SIZES[size][1] })}>
          Export
        </button>
      </div>
    </div>
  );
}
