// Training mode UI: the lesson catalogue, the coach card that walks the
// learner through a lesson on the live interface, and the top-bar button.

import { BookOpen, Check, ChevronLeft, ChevronRight, CircleCheck, GraduationCap, Minimize2, Play, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useConfig } from "../../backend/config";
import { useStore } from "../store";
import { bridge, makeCtx, resolve, useTraining, type Ctx, type Lesson, type Step } from "./engine";
import { COURSES, GLOSSARY, LESSONS } from "./lessons";

const SAMPLE = "GIS-220";
const MODE_NAME = { p6: "P6", msp: "Project", "4d": "4D" } as const;

/** The automatic first step: switch layout and load the sample if needed. */
function prepStep(l: Lesson): Step {
  const ready = (c: Ctx) =>
    (!l.needs.sample || c.s.schedule?.projectCode === SAMPLE) && (!l.needs.mode || (c.cfg.mode === l.needs.mode && c.s.view === "workspace"));
  return {
    title: "Get ready",
    task: [l.needs.sample ? "Open the 220 kV GIS sample project" : null, l.needs.mode ? `switch to the ${MODE_NAME[l.needs.mode]} layout` : null].filter(Boolean).join(" and ") || undefined,
    target: l.needs.mode && !l.needs.sample ? ".mode-switch" : undefined,
    done: ready,
    showMe: (c) => {
      if (l.needs.mode) {
        useStore.getState().setView("workspace");
        useConfig.getState().update({ mode: l.needs.mode });
      }
      if (l.needs.sample && c.s.schedule?.projectCode !== SAMPLE) {
        if (c.s.schedule && !window.confirm("Training uses the 220 kV GIS sample project. Open it now? Changes to the open project that you have not committed will be lost.")) return;
        bridge.actions?.loadSample();
      }
    },
    body: () => (
      <>
        <p>{l.summary}</p>
        <p className="tr-learn-head">In this lesson you will:</p>
        <ul>
          {l.learn.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        <p className="muted">
          Press <b>Show me</b> to get set up, or do it yourself. With no project open, the sample is the button in the middle of the screen.
        </p>
      </>
    ),
  };
}

function finishStep(l: Lesson, next: Lesson | undefined): Step {
  return {
    title: "Lesson complete",
    body: () => (
      <>
        <p className="tr-done-big">
          <CircleCheck size={22} aria-hidden /> Well done: <b>{l.title}</b>
        </p>
        <p>You practised:</p>
        <ul>
          {l.learn.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {next ? (
          <p>
            Next up: <b>{next.title}</b> ({next.minutes} min).
          </p>
        ) : (
          <p>That was the last lesson. The glossary in the training catalogue keeps every term for reference.</p>
        )}
      </>
    ),
  };
}

export function TrainingButton({ className = "tb" }: { className?: string }) {
  const open = useTraining((s) => s.openCatalog);
  const lessonId = useTraining((s) => s.lessonId);
  const minimized = useTraining((s) => s.minimized);
  const setMin = useTraining((s) => s.setMinimized);
  const active = !!lessonId;
  return (
    <button
      className={`${className} training-btn ${active ? "on" : ""}`}
      title={active ? "Training mode is on: open the lesson card" : "Training mode: guided lessons for new planners"}
      onClick={() => (active && minimized ? setMin(false) : open(true))}
    >
      <GraduationCap size={16} aria-hidden />
      <span>{active ? "Training" : "Learn"}</span>
    </button>
  );
}

export function TrainingLayer() {
  const catalog = useTraining((s) => s.catalog);
  const lessonId = useTraining((s) => s.lessonId);
  useEffect(() => {
    document.documentElement.classList.toggle("training-on", !!lessonId);
  }, [lessonId]);
  return (
    <>
      {lessonId && <Coach key={lessonId} />}
      {catalog && <Catalog />}
    </>
  );
}

// ---------------------------------------------------------------- coach

function Coach() {
  const t = useTraining();
  const lesson = LESSONS.find((l) => l.id === t.lessonId)!;
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1];
  const steps = useMemo(() => (lesson ? [prepStep(lesson), ...lesson.steps, finishStep(lesson, next)] : []), [lesson, next]);
  const mem = useRef<Record<string, unknown>>({});
  const step = steps[Math.min(t.step, steps.length - 1)];
  const last = t.step >= steps.length - 1;
  const [, tick] = useState(0);
  // Per-step state is keyed by step index so nothing leaks into the next step.
  const [okAt, setOkAt] = useState(-1);
  const [alreadyAt, setAlreadyAt] = useState(-1);
  const [pick, setPick] = useState<{ at: number; i: number } | null>(null);
  const ok = okAt === t.step;
  const already = alreadyAt === t.step;
  const picked = pick && pick.at === t.step ? pick.i : null;
  const setPicked = (i: number) => setPick({ at: t.step, i });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  // Re-render on app changes so live values in the text stay current.
  useEffect(() => useStore.subscribe(() => tick((n) => n + 1)), []);
  useEffect(() => useConfig.subscribe(() => tick((n) => n + 1)), []);

  // Entering a step.
  useEffect(() => {
    step?.enter?.(makeCtx(mem.current));
    if (step?.done?.(makeCtx(mem.current))) {
      setAlreadyAt(t.step);
      setOkAt(t.step);
    }
    if (last) t.finish(lesson.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.step, lesson.id]);

  // Watch for the task being done, and track the target's position.
  useEffect(() => {
    const at = t.step;
    const iv = window.setInterval(() => {
      const el = resolve(step?.target);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((old) => (!r && !old ? old : r && old && r.x === old.x && r.y === old.y && r.width === old.width && r.height === old.height ? old : r));
      if (step?.done && step.done(makeCtx(mem.current))) setOkAt((o) => (o === at ? o : at));
    }, 250);
    return () => window.clearInterval(iv);
  }, [t.step, step]);

  // Done by the learner (not already done on arrival): tick, pause, move on.
  useEffect(() => {
    if (!ok || already || !step?.done) return;
    const tm = window.setTimeout(() => useTraining.getState().go(t.step + 1), 1100);
    return () => window.clearTimeout(tm);
  }, [ok, already, step, t.step]);

  // Place the card beside the highlighted area without covering it.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const m = 14;
    let left = W - cw - 20;
    let top = H - ch - 20;
    if (rect) {
      const fits = (l: number, tp: number) => l >= 8 && tp >= 8 && l + cw <= W - 8 && tp + ch <= H - 8;
      const cy = Math.min(Math.max(8, rect.top), H - ch - 8);
      const cx = Math.min(Math.max(8, rect.left), W - cw - 8);
      const options: [number, number][] = [
        [rect.right + m, cy],
        [rect.left - cw - m, cy],
        [cx, rect.bottom + m],
        [cx, rect.top - ch - m],
      ];
      const hit = options.find(([l, tp]) => fits(l, tp));
      if (hit) [left, top] = hit;
      else {
        // Big targets (the Gantt, the model): sit in the corner furthest from the centre of the target.
        left = rect.left + rect.width / 2 > W / 2 ? 20 : W - cw - 20;
        top = H - ch - 20;
      }
    }
    setPos((p) => (Math.abs(p.left - left) < 1 && Math.abs(p.top - top) < 1 ? p : { left, top }));
  });

  if (!lesson || !step) return null;
  const ctx = makeCtx(mem.current);
  const canNext = !step.quiz ? !step.done || ok || already : picked !== null;
  const progress = ((t.step + (ok ? 1 : 0)) / (steps.length - 1)) * 100;

  if (t.minimized)
    return (
      <button className="tr-pill" onClick={() => t.setMinimized(false)}>
        <GraduationCap size={16} aria-hidden /> {lesson.title} · step {t.step + 1}/{steps.length} <ChevronRight size={14} aria-hidden />
      </button>
    );

  return (
    <>
      {rect && (
        <div
          className="tr-spot"
          style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }}
          aria-hidden
        />
      )}
      <div className="tr-card" ref={cardRef} style={{ left: pos.left, top: pos.top }} role="dialog" aria-label={`Training: ${lesson.title}`}>
        <div className="tr-head">
          <GraduationCap size={16} aria-hidden />
          <span className="tr-lesson">{lesson.title}</span>
          <span className="spacer" />
          <span className="tr-count">
            {t.step + 1} / {steps.length}
          </span>
          <button className="icon-only" title="Minimise" onClick={() => t.setMinimized(true)}>
            <Minimize2 size={14} aria-hidden />
          </button>
          <button className="icon-only" title="All lessons" onClick={() => t.openCatalog(true)}>
            <BookOpen size={14} aria-hidden />
          </button>
          <button className="icon-only" title="Leave training" onClick={t.exit}>
            <X size={15} aria-hidden />
          </button>
        </div>
        <div className="tr-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="tr-body">
          <h3>{step.title}</h3>
          <div className="tr-text">{step.body(ctx)}</div>
          {step.task && (
            <div className={`tr-task ${ok ? "ok" : ""}`}>
              {ok ? <Check size={16} aria-hidden /> : <Sparkles size={16} aria-hidden />}
              <div>
                <b>{ok ? (already ? "Already done" : "Done") : "Your turn"}</b>
                <div>{step.task}</div>
              </div>
            </div>
          )}
          {step.quiz && (
            <div className="tr-quiz">
              <b>{step.quiz.q}</b>
              {step.quiz.options.map((o, i) => (
                <button
                  key={o}
                  className={picked === null ? "" : i === step.quiz!.answer ? "right" : picked === i ? "wrong" : "dim"}
                  onClick={() => picked === null && setPicked(i)}
                  disabled={picked !== null && i !== picked && i !== step.quiz!.answer}
                >
                  {o}
                </button>
              ))}
              {picked !== null && (
                <p className={picked === step.quiz.answer ? "good" : "bad"}>
                  {picked === step.quiz.answer ? "Correct. " : "Not quite. "}
                  {step.quiz.explain}
                </p>
              )}
            </div>
          )}
        </div>
        <div className="tr-foot">
          <button onClick={() => t.go(Math.max(0, t.step - 1))} disabled={t.step === 0} title="Previous step">
            <ChevronLeft size={15} aria-hidden /> Back
          </button>
          <span className="spacer" />
          {step.showMe && !ok && (
            <button onClick={() => step.showMe!(makeCtx(mem.current))} title="Do this step for me">
              <Play size={14} aria-hidden /> Show me
            </button>
          )}
          {last ? (
            <>
              <button onClick={() => (t.exit(), t.openCatalog(true))}>All lessons</button>
              {next && (
                <button className="primary" onClick={() => t.start(next.id)}>
                  Next lesson <ChevronRight size={15} aria-hidden />
                </button>
              )}
              {!next && (
                <button className="primary" onClick={t.exit}>
                  Finish
                </button>
              )}
            </>
          ) : (
            <>
              {step.done && !ok && (
                <button className="link" onClick={() => t.go(t.step + 1)} title="Skip this task">
                  Skip
                </button>
              )}
              <button className="primary" disabled={!canNext} onClick={() => t.go(t.step + 1)}>
                Next <ChevronRight size={15} aria-hidden />
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- catalogue

function Catalog() {
  const t = useTraining();
  // "tours" = hands-on lessons on the live app; "course" = Planning & Controls course; "glossary".
  const [view, setView] = useState<"tours" | "course" | "glossary">("tours");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState(false);
  const total = LESSONS.length;
  const done = LESSONS.filter((l) => t.done[l.id]).length;
  const minutes = LESSONS.reduce((s, l) => s + l.minutes, 0);
  const terms = GLOSSARY.filter((g) => !q || `${g.term} ${g.alt ?? ""} ${g.def}`.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && t.openCatalog(false);
    // The course page asks to close from its own "Back to Stratum" button.
    const m = (e: MessageEvent) => e.origin === location.origin && (e.data as { stratumLearn?: string })?.stratumLearn === "close" && setView("tours");
    window.addEventListener("keydown", k);
    window.addEventListener("message", m);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("message", m);
    };
  }, [t]);
  const go = (v: typeof view, anchor?: string) => {
    setView(v);
    setMenu(false);
    if (anchor) setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ block: "start" }), 30);
  };
  return (
    <div className="learn-shell" role="dialog" aria-label="Stratum Learn">
      <nav className={`learn-side ${menu ? "open" : ""}`} aria-label="Learn navigation">
        <div className="learn-brand">
          <b>STRATUM LEARN</b>
          <span>learning centre</span>
        </div>
        <div className="learn-grp">
          <h5>Using Stratum</h5>
          {COURSES.map((c, i) => {
            const ls = LESSONS.filter((l) => l.course === c);
            const n = ls.filter((l) => t.done[l.id]).length;
            return (
              <button key={c} className={`learn-navi ${view === "tours" ? "" : ""}`} onClick={() => go("tours", `learn-c${i}`)}>
                <span className="ic">{i + 1}</span>
                <span className="lbl">{c}</span>
                <span className={`dot ${n === ls.length ? "done" : ""}`}>{n === ls.length ? "✓" : `${n}/${ls.length}`}</span>
              </button>
            );
          })}
        </div>
        <div className="learn-grp">
          <h5>Planning &amp; Controls</h5>
          <button className={`learn-navi ${view === "course" ? "on" : ""}`} onClick={() => go("course")}>
            <span className="ic">P</span>
            <span className="lbl">Course: 4 levels, 21 lessons</span>
          </button>
        </div>
        <div className="learn-grp">
          <h5>Reference</h5>
          <button className={`learn-navi ${view === "glossary" ? "on" : ""}`} onClick={() => go("glossary")}>
            <span className="ic">A</span>
            <span className="lbl">Glossary ({GLOSSARY.length})</span>
          </button>
          <button className="learn-navi" onClick={() => t.openCatalog(false)}>
            <span className="ic">←</span>
            <span className="lbl">Back to the app</span>
          </button>
        </div>
      </nav>
      <div className="learn-main">
        <header className="learn-top">
          <button className="learn-menubtn" aria-label="Menu" onClick={() => setMenu(!menu)}>
            ☰
          </button>
          <span className="learn-chip">
            <span className="k">App tours</span>
            <span className="v">
              {done} / {total}
            </span>
          </span>
          <div className="learn-prog">
            <div className="lab">
              <span>tours completed</span>
              <span>{Math.round((done / total) * 100)}%</span>
            </div>
            <div className="learn-bar">
              <i style={{ width: `${Math.max(2, (done / total) * 100)}%` }} />
            </div>
          </div>
          <span className="spacer" />
          <button className="learn-btn gh" title="Close (Esc)" onClick={() => t.openCatalog(false)}>
            <X size={15} aria-hidden /> Close
          </button>
        </header>
        {view === "course" ? (
          <iframe className="learn-course" src="./learn/index.html" title="Planning and Controls course" />
        ) : (
          <div className="learn-view">
            {view === "tours" ? (
              <>
                <div className="learn-card accent">
                  <h1>Learn Stratum on the live application</h1>
                  <p className="muted">
                    Each tour opens the 220 kV GIS sample and walks you through the real screens, one step at a time. {total} tours, about {minutes} minutes in all. For planning theory, from CPM to delay analysis, open the Planning &amp; Controls course.
                  </p>
                  <div className="learn-kpis">
                    <div>
                      <span>Tours</span>
                      <b>
                        {done}/{total}
                      </b>
                    </div>
                    <div>
                      <span>Minutes</span>
                      <b>{minutes}</b>
                    </div>
                    <div>
                      <span>Courses</span>
                      <b>{COURSES.length}</b>
                    </div>
                  </div>
                </div>
                <button className="learn-card learn-course-card" onClick={() => go("course")}>
                  <span className="learn-pill l3">Course</span>
                  <h2>Planning &amp; Controls</h2>
                  <p className="muted">Foundations, building the schedule, measure and control, commercial and forensic. 21 lessons with live tools, worked level reviews, a final assessment and a certificate of completion.</p>
                </button>
                {COURSES.map((course, ci) => (
                  <section key={course} id={`learn-c${ci}`} className="learn-card">
                    <h2>
                      {ci + 1}. {course}
                    </h2>
                    <div className="learn-rows">
                      {LESSONS.filter((l) => l.course === course).map((l) => {
                        const isDone = !!t.done[l.id];
                        const current = t.lessonId === l.id;
                        return (
                          <div key={l.id} className={`learn-row ${isDone ? "done" : ""} ${current ? "current" : ""}`}>
                            <span className={`learn-pill ${l.level.toLowerCase()}`}>{l.level}</span>
                            <div className="learn-row-text">
                              <b>{l.title}</b>
                              <span className="muted">{l.summary}</span>
                            </div>
                            <span className="learn-mono">
                              {l.minutes} min · {l.steps.length + 2} steps
                            </span>
                            {isDone && <CircleCheck size={16} className="good" aria-label="Completed" />}
                            <button className={`learn-btn ${current || !isDone ? "" : "sec"}`} onClick={() => (current ? t.openCatalog(false) : t.start(l.id))}>
                              {current ? `Resume (step ${t.step + 1})` : isDone ? "Review" : "Start"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <div className="learn-card learn-foot">
                  <span className="muted">The tour card moves out of the way of what it points at; minimise it to see the whole screen.</span>
                  <span className="spacer" />
                  {done > 0 && (
                    <button className="learn-btn gh" onClick={() => window.confirm("Clear your tour progress?") && t.reset()}>
                      <RotateCcw size={13} aria-hidden /> Reset tours
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="learn-card">
                <h1>Glossary</h1>
                <label className="tr-search">
                  <Search size={14} aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms, e.g. float" autoFocus />
                </label>
                <dl className="tr-glossary learn-gloss">
                  {terms.map((g) => (
                    <div key={g.term}>
                      <dt>
                        {g.term}
                        {g.alt && <span className="muted"> · {g.alt}</span>}
                      </dt>
                      <dd>{g.def}</dd>
                    </div>
                  ))}
                  {!terms.length && <p className="muted">No term matches “{q}”.</p>}
                </dl>
                <p className="muted small">The Planning &amp; Controls course has its own glossary of 69 planning terms.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
