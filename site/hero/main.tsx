// Landing page hero for miqyaslabs.com: the real Stratum 4D engine playing the
// sample projects in turn (substation, road, solar plant, pipeline, hotel),
// full bleed behind the headline, with product windows in front (built with
// the stageshow kit) that read the same playback date: the activities under
// way and the planned vs earned progress. One clock drives the model, the
// windows and the numbers, so they never disagree. A caption under the
// headline names the project and opens it in the demo.
//
// Bundled by esbuild into site/hero.js and hero.css (see .github/workflows/pages.yml).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Vector3 } from "three";
import { createRoot } from "react-dom/client";
import { DEMO_LINK_RULE } from "../../src/core/demo";
import { applyRules } from "../../src/core/linking";
import { demoProfiles } from "../../src/core/profiles";
import { SAMPLES, type SampleKind } from "../../src/core/samples";
import { activeAt, computeStates, phaseAt, scheduleRange } from "../../src/core/simulation";
import { DEFAULT_SIM_OPTIONS } from "../../src/core/simulation";
import type { Activity, Link, LinkRule, Schedule } from "../../src/core/types";
import { parseXerTables, xerToSchedule } from "../../src/core/xer";
import { Viewer } from "../../src/viewer/Viewer";
import { Bar, Count, Meter, Row, Stage, Text, Window } from "./kit";
import "./hero.css";

const LOOP_MS = 36_000;
const DAY = 86_400_000;
const ORDER: SampleKind[] = ["gis", "road", "solar", "pipeline", "hotel"];

interface Sample {
  kind: SampleKind;
  schedule: Schedule;
  links: Link[];
  ids: string[];
  range: { start: number; finish: number };
  boxes: ReturnType<(typeof SAMPLES)["gis"]["model"]>;
}

const cache = new Map<SampleKind, Sample>();
function loadSample(kind: SampleKind): Sample {
  const hit = cache.get(kind);
  if (hit) return hit;
  const d = SAMPLES[kind];
  const boxes = d.model();
  const els = boxes.map((b) => b.element);
  const schedule = xerToSchedule(parseXerTables(d.xer()));
  const rule: LinkRule = { ...DEMO_LINK_RULE, profileId: "install" };
  const typeOf = new Map(els.map((e) => [e.id, e.ifcType]));
  const codeOf = new Map(schedule.activities.map((a) => [a.id, a.code]));
  const links = applyRules([rule], els, schedule).map((l) => ({ ...l, profileId: d.profileFor(codeOf.get(l.activityId) ?? "", typeOf.get(l.elementId) ?? "") }));
  const s = { kind, schedule, links, ids: els.map((e) => e.id), range: scheduleRange(schedule)!, boxes };
  cache.set(kind, s);
  return s;
}

/** Duration-weighted progress at t: planned on the baseline dates, earned on the current ones. */
function progressAt(s: Schedule, t: number) {
  let w = 0;
  let planned = 0;
  let earned = 0;
  for (const a of s.activities) {
    if (a.type === "wbs-summary") continue;
    const d = Math.max(1, a.originalDurationHours ?? 8);
    w += d;
    planned += d * phaseAt(a, t, "baseline").progress;
    earned += d * phaseAt(a, t, "current").progress;
  }
  return { planned: w ? planned / w : 0, earned: w ? earned / w : 0 };
}

const fmt = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Hero() {
  const [idx, setIdx] = useState(0);
  const kind = ORDER[idx];
  const sample = useMemo(() => loadSample(kind), [kind]);
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [gen, setGen] = useState(0);
  // The poster frame (reduced motion, first paint): mid-project.
  const poster = sample.range.start + (sample.range.finish - sample.range.start) * 0.62;
  const [t, setT] = useState(poster);
  const profiles = useMemo(demoProfiles, []);
  const caption = typeof document !== "undefined" ? document.getElementById("hero-now") : null;

  // One viewer for the page.
  useEffect(() => {
    if (!host.current) return;
    let v: Viewer;
    try {
      v = new Viewer(host.current);
    } catch {
      host.current.classList.add("no-webgl");
      return;
    }
    viewer.current = v;
    v.setTheme("light");
    v.controls.enableZoom = false;
    v.controls.enablePan = false;
    setGen(1);
    return () => v.dispose();
  }, []);

  // Each sample: its model, framed in the right half on desktop, between the copy and the windows on a phone.
  useEffect(() => {
    const v = viewer.current;
    if (!v || !host.current) return;
    v.setObjects(Viewer.demoObjects(sample.boxes), [], true);
    let wasNarrow: boolean | null = null;
    const frame = () => {
      const w = host.current?.clientWidth ?? 0;
      const h = host.current?.clientHeight ?? 0;
      if (!w || !h) return;
      const narrow = w < 820;
      if (narrow !== wasNarrow) {
        wasNarrow = narrow;
        v.camera.clearViewOffset();
        v.flyTo(null, 10, new Vector3(1.15, 0.62, 0.9), narrow ? 2.3 : 1.02);
      }
      v.camera.setViewOffset(w, h, narrow ? 0 : -w * 0.2, narrow ? -h * 0.13 : h * 0.06, w, h);
      v.camera.updateProjectionMatrix();
      v.requestRender();
    };
    const ro = new ResizeObserver(() => requestAnimationFrame(frame));
    ro.observe(host.current);
    frame();
    return () => ro.disconnect();
  }, [sample, gen]);

  // One clock: the date loops through the project, the camera turns slowly; at the end of a loop the next sample comes.
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    let last = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const el = now - t0;
      if (el >= LOOP_MS) {
        setIdx((i) => (i + 1) % ORDER.length);
        return;
      }
      const u = el / LOOP_MS;
      // Ease in and out at the ends, so the empty site and the finished work both hold a moment.
      const k = u < 0.08 ? 0 : u > 0.9 ? 1 : (u - 0.08) / 0.82;
      const date = sample.range.start + (sample.range.finish - sample.range.start) * k;
      viewer.current?.orbit(0.0009);
      if (now - last > 90) {
        last = now;
        setT(date);
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [sample]);

  const active = useMemo(() => activeAt(sample.schedule, t, "current"), [sample, t]);
  // One accent for the work that is changing: not the site-long activities.
  const span = sample.range.finish - sample.range.start;
  const focus = useMemo(() => active.filter((a) => a.start !== null && a.finish !== null && a.finish - a.start < span * 0.4), [active, span]);
  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.applyFrame(computeStates(sample.schedule, sample.links, profiles, sample.ids, t, DEFAULT_SIM_OPTIONS), new Map());
    const want = new Set(focus.map((a) => a.id));
    // The work under way keeps its 4D colours; everything else is ghosted around it.
    v.setFocus(new Set(sample.links.filter((l) => want.has(l.activityId)).map((l) => l.elementId)), { recolor: false });
  }, [sample, profiles, t, focus, gen]);

  const p = progressAt(sample.schedule, t);
  const rows: Activity[] = [...focus].sort((a, b) => (a.start ?? 0) - (b.start ?? 0)).slice(0, 2);
  const day = Math.max(1, Math.round((t - sample.range.start) / DAY) + 1);
  const days = Math.round(span / DAY) + 1;
  const behind = p.earned + 0.004 < p.planned;

  return (
    <>
      <div className="hx-scene" ref={host} aria-hidden />
      <div className="hx-shade" aria-hidden />
      <div className="hx-ui">
        <Stage width={540} height={300} compact={{ below: 600, width: 358, height: 280 }} className="hx-stage" play="loop">
          {(_s, _r, layout) => (
            <>
              <Window title={`${sample.schedule.projectCode} · Activities`} className="hx-win">
                <div className="hx-app">
                  <div className="hx-head">
                    <Text className="hx-date">{fmt(t)}</Text>
                    <span className="hx-day">
                      Day <Count value={day} /> of {days}
                    </span>
                  </div>
                  {rows.map((a) => {
                    const pr = phaseAt(a, t, "current").progress;
                    return (
                      <Row key={a.id} pad={0} className="hx-row" title={<Text className="hx-name">{layout === "compact" && a.name.length > 30 ? `${a.name.slice(0, 29)}…` : a.name}</Text>} subtitle={<Meter value={pr} tone={a.critical ? "danger" : "accent"} className="hx-meter" />}>
                        <span className="hx-pct">
                          <Count value={Math.round(pr * 100)} />%
                        </span>
                      </Row>
                    );
                  })}
                  {Array.from({ length: Math.max(0, 2 - rows.length) }, (_, i) => (
                    <Row key={`f${i}`} pad={0} className="hx-row" title={<Bar w={150 - i * 24} h={8} r={4} tone={2} />} subtitle={<Bar w={110} h={5} r={3} tone={1} />} />
                  ))}
                </div>
              </Window>
              <section className="hx-card" aria-label="Progress">
                <span className="hx-card-k">Earned</span>
                <span className="hx-card-v">
                  <Count value={Math.round(p.earned * 1000) / 10} format={(n) => n.toFixed(1)} />%
                </span>
                <span className="hx-card-sub">
                  Planned {(p.planned * 100).toFixed(1)}% · <b className={behind ? "behind" : "ok"}>{behind ? "behind" : "on plan"}</b>
                </span>
              </section>
            </>
          )}
        </Stage>
      </div>
      {caption &&
        createPortal(
          <span className="hero-now-in">
            Now building: <b>{SAMPLES[kind].label}</b> ·{" "}
            <a href={`demo/?project=${kind}`} style={{ pointerEvents: "auto" }}>
              Open this project in the demo →
            </a>
          </span>,
          caption,
        )}
    </>
  );
}

const el = document.getElementById("hero-live");
if (el) createRoot(el).render(<Hero />);
