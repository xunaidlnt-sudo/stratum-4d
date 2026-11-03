// Teardown mode for the 4D view (after the "teardown" approach to machine
// explainers): one input drives everything, here the playback date. At that
// date the work under way opens up (focus with an accent, the rest ghosted),
// the model can be pulled apart by storey or from the centre, cut with a
// section plane, and a live panel reads the same date: day of the project,
// planned and earned progress, the activities under way with their progress
// and the elements in place. Left alone, the tour plays the schedule, frames
// each new piece of work and turns around it; any click, drag, wheel or key
// hands control back, and 25 s of quiet hands it to the tour again.
//
// The panel is drawn on its own canvas, so a recorded video can carry it.

import { Boxes, Clapperboard, Crosshair, Layers3, Scissors, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { activeAt, phaseAt, scheduleRange } from "../core/simulation";
import type { Activity, Schedule } from "../core/types";
import type { ExplodeMode, Viewer } from "../viewer/Viewer";
import { useStore } from "./store";

const DAY = 86_400_000;
const IDLE_MS = 25_000;
const SHOT_MS = 7_000;

/** The live panel's canvas, for the video recorder (null while teardown is off). */
export const teardownHud: { canvas: HTMLCanvasElement | null } = { canvas: null };

interface HudData {
  date: number;
  day: number;
  days: number;
  planned: number;
  earned: number;
  active: { code: string; name: string; progress: number; critical: boolean }[];
  activeCount: number;
  placed: number;
  total: number;
  mode: string;
}

const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Duration-weighted share of work done by t: planned on the baseline dates, earned on the current ones. */
function progressAt(s: Schedule, t: number) {
  let w = 0;
  let planned = 0;
  let earned = 0;
  for (const a of s.activities) {
    if (a.type === "wbs-summary") continue;
    const d = Math.max(1, a.originalDurationHours ?? 8);
    w += d;
    planned += d * phaseAt(a, t, "baseline").progress;
    // Earned: the recorded progress up to the data date, the plan after it.
    const actual = s.dataDate !== null && t >= s.dataDate ? a.percentComplete / 100 : phaseAt(a, t, "current").progress;
    earned += d * Math.max(actual, s.dataDate !== null && t > s.dataDate ? phaseAt(a, t, "current").progress : 0);
  }
  return { planned: w ? planned / w : 0, earned: w ? earned / w : 0 };
}

function drawHud(c: HTMLCanvasElement, d: HudData) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = 320;
  const rows = Math.min(4, d.active.length);
  const H = 196 + rows * 34 + (d.activeCount > rows ? 18 : 0);
  if (c.width !== W * dpr || c.height !== H * dpr) {
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
  }
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  // Light card, one accent: the work under way.
  g.fillStyle = "rgba(255,255,255,0.93)";
  g.strokeStyle = "rgba(11,37,69,0.18)";
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(0.5, 0.5, W - 1, H - 1, 10);
  g.fill();
  g.stroke();
  const ink = "#0b2545";
  const muted = "#5d6b7a";
  const accent = "#e10600";
  g.fillStyle = muted;
  g.font = "600 11px Inter, system-ui, sans-serif";
  g.fillText(d.mode.toUpperCase(), 16, 22);
  g.fillStyle = ink;
  g.font = "700 22px Montserrat, Inter, sans-serif";
  g.fillText(fmt(d.date), 16, 50);
  g.fillStyle = muted;
  g.font = "13px Inter, system-ui, sans-serif";
  g.fillText(`Day ${d.day} of ${d.days}`, 16, 70);
  // Progress bars: planned (baseline) and earned.
  const bar = (y: number, label: string, v: number, color: string) => {
    g.fillStyle = muted;
    g.font = "12px Inter, system-ui, sans-serif";
    g.fillText(label, 16, y);
    g.textAlign = "right";
    g.fillStyle = ink;
    g.font = "600 12px Inter, system-ui, sans-serif";
    g.fillText(`${(v * 100).toFixed(1)}%`, W - 16, y);
    g.textAlign = "left";
    g.fillStyle = "#e6eaef";
    g.fillRect(16, y + 6, W - 32, 6);
    g.fillStyle = color;
    g.fillRect(16, y + 6, (W - 32) * Math.max(0, Math.min(1, v)), 6);
  };
  bar(96, "Planned (baseline)", d.planned, "#9aa5b1");
  bar(126, "Earned", d.earned, d.earned + 0.005 < d.planned ? "#d97706" : "#31752f");
  g.fillStyle = muted;
  g.font = "12px Inter, system-ui, sans-serif";
  g.fillText(`Elements in place: ${d.placed} of ${d.total}`, 16, 160);
  g.fillStyle = ink;
  g.font = "600 12px Inter, system-ui, sans-serif";
  g.fillText(d.activeCount ? `Under way (${d.activeCount})` : "No work under way", 16, 184);
  d.active.slice(0, rows).forEach((a, i) => {
    const y = 204 + i * 34;
    g.fillStyle = a.critical ? accent : ink;
    g.font = "600 12px Inter, system-ui, sans-serif";
    const name = `${a.code}  ${a.name}`;
    g.fillText(name.length > 42 ? `${name.slice(0, 41)}…` : name, 16, y);
    g.fillStyle = "#e6eaef";
    g.fillRect(16, y + 7, W - 70, 5);
    g.fillStyle = a.critical ? accent : "#355b7d";
    g.fillRect(16, y + 7, (W - 70) * a.progress, 5);
    g.fillStyle = muted;
    g.font = "11px Inter, system-ui, sans-serif";
    g.textAlign = "right";
    g.fillText(`${Math.round(a.progress * 100)}%`, W - 16, y + 13);
    g.textAlign = "left";
  });
  if (d.activeCount > rows) {
    g.fillStyle = muted;
    g.font = "11px Inter, system-ui, sans-serif";
    g.fillText(`+${d.activeCount - rows} more`, 16, H - 10);
  }
}

export function Teardown({ getViewer, gen, onRecord, recording }: { getViewer: () => Viewer | null; gen: number; onRecord: () => void; recording: boolean }) {
  const schedule = useStore((s) => s.schedule);
  const elements = useStore((s) => s.elements);
  const links = useStore((s) => s.links);
  const time = useStore((s) => s.time);
  const sim = useStore((s) => s.sim);
  const playing = useStore((s) => s.playing);
  const [open, setOpen] = useState(false);
  const [explode, setExplode] = useState(0);
  const [mode, setMode] = useState<ExplodeMode>("storeys");
  const [cut, setCut] = useState<{ axis: "x" | "y" | "z"; pos: number; flip: boolean } | null>(null);
  const [focus, setFocus] = useState(false);
  const [tour, setTour] = useState(false);
  const [paused, setPaused] = useState(false);
  const hudRef = useRef<HTMLCanvasElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Storeys, bottom first, from the Storey property of each element.
  const groups = useMemo(() => {
    const v = getViewer();
    const by = new Map<string, string[]>();
    for (const e of elements) {
      const k = e.properties.Storey ?? e.properties.storey ?? "";
      (by.get(k) ?? by.set(k, []).get(k)!).push(e.id);
    }
    const order = [...by.entries()].map(([k, ids]) => ({ k, ids, y: v ? v.boxOf(ids).min.y : 0 })).sort((a, b) => a.y - b.y);
    const out = new Map<string, number>();
    order.forEach((o, i) => o.ids.forEach((id) => out.set(id, i)));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, gen]);

  // Activities under way at the playback date, and their elements.
  const active = useMemo(() => (schedule ? activeAt(schedule, time, sim.dateSource) : []), [schedule, time, sim.dateSource]);
  const activeKey = active.map((a) => a.id).join(",");
  const focusIds = useMemo(() => {
    // One accent for the work that is changing now: activities that run for most of the
    // project (site facilities, supervision, temporary works) do not take it.
    const range = schedule ? scheduleRange(schedule, sim.dateSource) : null;
    const span = range ? range.finish - range.start : Infinity;
    const want = new Set(active.filter((a) => a.start === null || a.finish === null || a.finish - a.start < span * 0.4).map((a) => a.id));
    return new Set(links.filter((l) => want.has(l.activityId)).map((l) => l.elementId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, links]);

  // Viewer state follows the controls.
  useEffect(() => {
    const v = getViewer();
    if (!v) return;
    v.setExplode(open ? explode : 0, mode, groups);
  }, [open, explode, mode, groups, gen, getViewer]);
  // Keep the whole (exploded) model in view once the slider settles.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => getViewer()?.flyTo(null, 700), 350);
    return () => clearTimeout(t);
  }, [open, explode, mode, getViewer]);
  useEffect(() => {
    getViewer()?.setCut(open && cut ? cut : null);
  }, [open, cut, gen, getViewer]);
  useEffect(() => {
    getViewer()?.setFocus(open && focus ? focusIds : null);
  }, [open, focus, focusIds, gen, getViewer]);
  useEffect(
    () => () => {
      const v = getViewer();
      v?.setExplode(0, "storeys");
      v?.setCut(null);
      v?.setFocus(null);
    },
    [getViewer],
  );

  // Live panel from the same date that drives the model.
  useEffect(() => {
    const c = hudRef.current;
    teardownHud.canvas = open ? c : null;
    if (!open || !c || !schedule) return;
    const range = scheduleRange(schedule, sim.dateSource);
    if (!range) return;
    const p = progressAt(schedule, time);
    const linked = new Map<string, Activity>();
    const byId = new Map(schedule.activities.map((a) => [a.id, a]));
    for (const l of links) {
      const a = byId.get(l.activityId);
      if (a) linked.set(l.elementId, a);
    }
    let placed = 0;
    for (const [, a] of linked) if (phaseAt(a, time, sim.dateSource).phase === "after") placed++;
    const list = [...active].sort((x, y) => Number(y.critical) - Number(x.critical) || phaseAt(y, time, sim.dateSource).progress - phaseAt(x, time, sim.dateSource).progress);
    drawHud(c, {
      date: time,
      day: Math.max(1, Math.round((time - range.start) / DAY) + 1),
      days: Math.max(1, Math.round((range.finish - range.start) / DAY) + 1),
      planned: p.planned,
      earned: p.earned,
      active: list.map((a) => ({ code: a.code, name: a.name, progress: phaseAt(a, time, sim.dateSource).progress, critical: a.critical })),
      activeCount: list.length,
      placed,
      total: linked.size,
      mode: tour ? (paused ? "Tour paused · you have control" : "Tour") : schedule.projectName.length > 42 ? `${schedule.projectName.slice(0, 41)}…` : schedule.projectName,
    });
  }, [open, schedule, time, sim.dateSource, active, links, tour, paused]);
  useEffect(() => () => void (teardownHud.canvas = null), []);

  // Auto tour: play, frame each new piece of work, turn slowly; user input hands control back.
  useEffect(() => {
    if (!open || !tour || paused) return;
    const v = getViewer();
    if (!v) return;
    const st = useStore.getState();
    if (!st.playing) st.setPlaying(true);
    let last = performance.now();
    let lastShot = 0;
    let raf = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (now - lastShot > SHOT_MS) {
        lastShot = now;
        const ids = [...(getFocusIds.current ?? [])];
        v.flyTo(ids.length ? ids : null, 1800);
      }
      v.orbit(dt * 0.12);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [open, tour, paused, getViewer]);
  const getFocusIds = useRef<Set<string>>(focusIds);
  getFocusIds.current = focusIds;

  useEffect(() => {
    if (!open || !tour) return;
    const v = getViewer();
    const el = v?.canvas;
    if (!el) return;
    const take = () => {
      setPaused(true);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => setPaused(false), IDLE_MS);
    };
    el.addEventListener("pointerdown", take);
    el.addEventListener("wheel", take, { passive: true });
    window.addEventListener("keydown", take);
    return () => {
      el.removeEventListener("pointerdown", take);
      el.removeEventListener("wheel", take);
      window.removeEventListener("keydown", take);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [open, tour, getViewer, gen]);

  // A tour ends with the schedule.
  useEffect(() => {
    if (tour && !playing && !recording) setTour(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (!schedule || !elements.length) return null;
  return (
    <>
      <div className={`td-panel ${open ? "open" : ""}`}>
        <button className={`td-toggle ${open ? "on" : ""}`} onClick={() => setOpen(!open)} title="Teardown: explode, cut, focus on the work under way, live panel and tour">
          <Layers3 size={15} aria-hidden /> Teardown
        </button>
        {open && (
          <div className="td-body">
            <label className="td-row" title="Pull the model apart by storey, or from the centre">
              <Boxes size={14} aria-hidden />
              <span>Explode</span>
              <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} aria-label="Explode" />
              <select value={mode} onChange={(e) => setMode(e.target.value as ExplodeMode)} aria-label="Explode by">
                <option value="storeys">By storey</option>
                <option value="radial">From centre</option>
              </select>
            </label>
            <div className="td-row" title="Section cut through the model">
              <Scissors size={14} aria-hidden />
              <span>Cut</span>
              {(["x", "y", "z"] as const).map((ax) => (
                <button key={ax} className={cut?.axis === ax ? "on" : ""} onClick={() => setCut(cut?.axis === ax ? null : { axis: ax, pos: cut?.pos ?? 0.5, flip: cut?.flip ?? false })} aria-pressed={cut?.axis === ax}>
                  {ax === "y" ? "Plan" : ax.toUpperCase()}
                </button>
              ))}
              {cut && (
                <>
                  <input type="range" min={0} max={1} step={0.005} value={cut.pos} onChange={(e) => setCut({ ...cut, pos: Number(e.target.value) })} aria-label="Cut position" />
                  <button onClick={() => setCut({ ...cut, flip: !cut.flip })} title="Keep the other side">
                    ⇄
                  </button>
                </>
              )}
            </div>
            <label className="td-row" title="The elements of the activities under way in red; the rest ghosted">
              <Crosshair size={14} aria-hidden />
              <span>Work under way</span>
              <input type="checkbox" checked={focus} onChange={(e) => setFocus(e.target.checked)} />
            </label>
            <div className="td-row">
              <Sparkles size={14} aria-hidden />
              <button className={tour ? "on" : ""} onClick={() => (setPaused(false), setTour(!tour), !tour && useStore.getState().setPlaying(true))} title="Plays the schedule and frames each new piece of work. Any click, drag or key gives you control; after 25 s it carries on.">
                {tour ? "Stop tour" : "Start tour"}
              </button>
              <button
                className={recording ? "danger" : ""}
                onClick={() => {
                  if (!recording) {
                    setFocus(true);
                    setPaused(false);
                    setTour(true);
                  }
                  onRecord();
                }}
                title="Record the tour with the live panel as a video"
              >
                <Clapperboard size={14} aria-hidden /> {recording ? "Stop" : "Record tour"}
              </button>
            </div>
          </div>
        )}
      </div>
      <canvas ref={hudRef} className="td-hud" style={{ display: open ? "block" : "none" }} aria-label="Live panel" />
    </>
  );
}
