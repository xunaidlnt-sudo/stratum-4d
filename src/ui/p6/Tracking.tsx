// P6 Tracking window: project-level layouts across a portfolio. Project Table
// (figures grouped by EPS or a project code, with band totals), Project Gantt
// (one bar per project against its baseline finish) and Project Bar Chart
// (one figure compared across projects). Layouts are saved per user.

import { useEffect, useMemo, useState } from "react";
import { useConfig } from "../../backend/config";
import type { ProjectSummary } from "../../backend/types";
import { fmtMoney } from "../../core/fields";
import { projectFigures, TRACKING_METRICS, trackingBands, type ProjectFigures, type TrackingGroup } from "../../core/tracking";
import { fmtDate, useStore } from "../store";
import { loadPortfolios } from "./EnterpriseProjects";

type View = "table" | "gantt" | "bars";
interface TrackingLayout {
  name: string;
  view: View;
  group: TrackingGroup;
  metric: keyof ProjectFigures;
  portfolio: string;
}

const KEY = "stratum.tracking.v1";
const STOCK: TrackingLayout[] = [
  { name: "Project Table by EPS", view: "table", group: "eps", metric: "earnedPct", portfolio: "" },
  { name: "Project Gantt by EPS", view: "gantt", group: "eps", metric: "earnedPct", portfolio: "" },
  { name: "Project Bar Chart – % Complete", view: "bars", group: "none", metric: "earnedPct", portfolio: "" },
  { name: "Project Bar Chart – Finish Variance", view: "bars", group: "none", metric: "finishVarianceDays", portfolio: "" },
];
function loadLayouts(): TrackingLayout[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}
function saveLayouts(l: TrackingLayout[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    /* private window */
  }
}

const pct = (v: number) => `${Math.round(v * 10) / 10}%`;
const ratio = (v: number | null) => (v === null ? "" : v.toFixed(2));
function fmtMetric(v: unknown, kind: (typeof TRACKING_METRICS)[number][2]): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return kind === "money" ? fmtMoney(n) : kind === "pct" ? pct(n) : kind === "ratio" ? ratio(n) : kind === "days" ? `${Math.round(n * 10) / 10} d` : String(n);
}

export function TrackingWindow({ onDashboards }: { onDashboards?: () => void }) {
  const backend = useConfig((c) => c.backend);
  const open = useStore((s) => s.schedule);
  const currentId = useStore((s) => s.currentProjectId);
  const [saved, setSaved] = useState(loadLayouts);
  const [lay, setLay] = useState<TrackingLayout>(saved[0] ?? STOCK[0]);
  const [figs, setFigs] = useState<ProjectFigures[] | null>(null);
  const [codes, setCodes] = useState<Record<string, Record<string, string>>>({});
  const [msg, setMsg] = useState("Loading projects…");
  const portfolios = loadPortfolios();

  useEffect(() => {
    let live = true;
    (async () => {
      setMsg("Loading projects…");
      const pf = portfolios.find((p) => p.id === lay.portfolio);
      const rows = (await backend.listProjects().catch(() => [] as ProjectSummary[])).filter((r) => !pf || pf.projectIds.includes(r.id));
      const out: ProjectFigures[] = [];
      const pc: Record<string, Record<string, string>> = {};
      for (const r of rows) {
        const s = r.id === currentId && open ? open : (await backend.getProject(r.id).catch(() => null))?.project.schedule;
        if (!s) continue;
        out.push(projectFigures(s, r.id));
        pc[r.id] = s.projectCodes ?? {};
      }
      if (!rows.length && open && !pf) {
        out.push(projectFigures(open, open.projectId));
        pc[open.projectId] = open.projectCodes ?? {};
      }
      if (!live) return;
      setFigs(out);
      setCodes(pc);
      setMsg(`${out.length} project${out.length === 1 ? "" : "s"}${pf ? ` in ${pf.name}` : ""}`);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, lay.portfolio, open, currentId]);

  const codeTypes = useMemo(() => [...new Set(Object.values(codes).flatMap((c) => Object.keys(c)))].sort(), [codes]);
  const bands = useMemo(() => (figs ? trackingBands(figs, lay.group, (id) => codes[id] ?? {}) : []), [figs, lay.group, codes]);
  const set = (p: Partial<TrackingLayout>) => setLay({ ...lay, ...p });
  const all = [...STOCK, ...saved];
  const saveAs = () => {
    const name = window.prompt("Save tracking layout as", lay.name);
    if (!name?.trim()) return;
    const next = [...saved.filter((x) => x.name !== name.trim()), { ...lay, name: name.trim() }];
    saveLayouts(next);
    setSaved(next);
    set({ name: name.trim() });
  };

  return (
    <div className="p6-win">
      <div className="p6-win-bar" style={{ flexWrap: "wrap" }}>
        <label className="row" style={{ gap: 4 }}>
          Layout
          <select value={lay.name} onChange={(e) => setLay(all.find((x) => x.name === e.target.value) ?? lay)}>
            {all.map((x) => (
              <option key={x.name}>{x.name}</option>
            ))}
            {!all.some((x) => x.name === lay.name) && <option>{lay.name}</option>}
          </select>
        </label>
        <button onClick={saveAs}>Save As…</button>
        {saved.some((x) => x.name === lay.name) && (
          <button
            onClick={() => {
              const next = saved.filter((x) => x.name !== lay.name);
              saveLayouts(next);
              setSaved(next);
              setLay(STOCK[0]);
            }}
          >
            Delete
          </button>
        )}
        <span className="p6-sep" />
        <select aria-label="View" value={lay.view} onChange={(e) => set({ view: e.target.value as View })}>
          <option value="table">Project Table</option>
          <option value="gantt">Project Gantt</option>
          <option value="bars">Project Bar Chart</option>
        </select>
        <select aria-label="Group by" value={lay.group} onChange={(e) => set({ group: e.target.value as TrackingGroup })}>
          <option value="none">No grouping</option>
          <option value="eps">Group by EPS</option>
          {codeTypes.map((c) => (
            <option key={c} value={`pcode:${c}`}>
              Group by {c}
            </option>
          ))}
        </select>
        {lay.view === "bars" && (
          <select aria-label="Figure" value={lay.metric} onChange={(e) => set({ metric: e.target.value as keyof ProjectFigures })}>
            {TRACKING_METRICS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        )}
        <select aria-label="Portfolio" value={lay.portfolio} onChange={(e) => set({ portfolio: e.target.value })}>
          <option value="">All projects</option>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <span className="muted small">{msg}</span>
        {onDashboards && <button onClick={onDashboards}>Dashboards…</button>}
      </div>
      <div className="p6-win-body">
        {!figs ? (
          <p className="muted">Loading…</p>
        ) : !figs.length ? (
          <p className="muted">No projects to track. Save projects to the database (File › Commit) or create a portfolio.</p>
        ) : lay.view === "table" ? (
          <ProjectTable bands={bands} grouped={lay.group !== "none"} />
        ) : lay.view === "gantt" ? (
          <ProjectGantt bands={bands} grouped={lay.group !== "none"} />
        ) : (
          <ProjectBars bands={bands} metric={lay.metric} grouped={lay.group !== "none"} />
        )}
      </div>
    </div>
  );
}

function ProjectTable({ bands, grouped }: { bands: ReturnType<typeof trackingBands>; grouped: boolean }) {
  const head = ["Project ID", "Project Name", "Data Date", "Start", "Finish", "Baseline Finish", "Finish Variance", "Planned %", "Performance %", "Budget (BAC)", "Actual Cost", "EAC", "SPI", "CPI", "Activities", "Critical", "Lowest Float"];
  return (
    <table className="p6-grid sticky">
      <thead>
        <tr>
          {head.map((h) => (
            <td key={h}>{h}</td>
          ))}
        </tr>
      </thead>
      <tbody>
        {bands.map((b) => [
          grouped && (
            <tr key={`b-${b.key}`} className="p6-band-row">
              <td colSpan={3}>
                <b>{b.label}</b>
              </td>
              <td>{fmtDate(b.total.start)}</td>
              <td>{fmtDate(b.total.finish)}</td>
              <td colSpan={3} />
              <td className="num">{pct(b.total.earnedPct)}</td>
              <td className="num">{fmtMoney(b.total.bac)}</td>
              <td className="num">{fmtMoney(b.total.ac)}</td>
              <td className="num">{fmtMoney(b.total.eac)}</td>
              <td colSpan={2} />
              <td className="num">{b.total.activities}</td>
              <td className="num">{b.total.critical}</td>
              <td />
            </tr>
          ),
          ...b.projects.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td>{fmtDate(p.dataDate)}</td>
              <td>{fmtDate(p.start)}</td>
              <td>{fmtDate(p.finish)}</td>
              <td>{fmtDate(p.baselineFinish)}</td>
              <td className={`num ${p.finishVarianceDays !== null && p.finishVarianceDays < 0 ? "bad" : ""}`}>{p.finishVarianceDays === null ? "" : `${p.finishVarianceDays} d`}</td>
              <td className="num">{pct(p.plannedPct)}</td>
              <td className="num">{pct(p.earnedPct)}</td>
              <td className="num">{fmtMoney(p.bac)}</td>
              <td className="num">{fmtMoney(p.ac)}</td>
              <td className="num">{fmtMoney(p.eac)}</td>
              <td className={`num ${p.spi !== null && p.spi < 0.95 ? "bad" : ""}`}>{ratio(p.spi)}</td>
              <td className={`num ${p.cpi !== null && p.cpi < 0.95 ? "bad" : ""}`}>{ratio(p.cpi)}</td>
              <td className="num">{p.activities}</td>
              <td className="num">{p.critical}</td>
              <td className={`num ${p.minFloatDays !== null && p.minFloatDays < 0 ? "bad" : ""}`}>{p.minFloatDays === null ? "" : `${p.minFloatDays} d`}</td>
            </tr>
          )),
        ])}
      </tbody>
    </table>
  );
}

function ProjectGantt({ bands, grouped }: { bands: ReturnType<typeof trackingBands>; grouped: boolean }) {
  const all = bands.flatMap((b) => b.projects);
  const times = all.flatMap((p) => [p.start, p.finish, p.baselineFinish, p.dataDate]).filter((x): x is number => x !== null);
  if (!times.length) return <p className="muted">No dates to draw. Schedule the projects first.</p>;
  const lo = Math.min(...times);
  const hi = Math.max(...times);
  const span = Math.max(1, hi - lo);
  const W = 900;
  const x = (t: number) => ((t - lo) / span) * W;
  const years: number[] = [];
  for (let y = new Date(lo).getUTCFullYear(); Date.UTC(y, 0, 1) <= hi; y++) if (Date.UTC(y, 0, 1) >= lo) years.push(y);
  const rowH = 22;
  const rows: ({ kind: "band"; label: string } | { kind: "p"; p: ProjectFigures })[] = bands.flatMap((b) => [...(grouped ? [{ kind: "band" as const, label: b.label }] : []), ...b.projects.map((p) => ({ kind: "p" as const, p }))]);
  return (
    <div className="p6-track-gantt">
      <table className="p6-grid">
        <thead>
          <tr>
            <td style={{ width: 110 }}>Project ID</td>
            <td style={{ width: 260 }}>Project Name</td>
            <td>
              <svg width={W} height={18} role="img" aria-label="Timescale">
                {years.map((y) => (
                  <g key={y}>
                    <line x1={x(Date.UTC(y, 0, 1))} x2={x(Date.UTC(y, 0, 1))} y1={0} y2={18} stroke="currentColor" opacity={0.3} />
                    <text x={x(Date.UTC(y, 0, 1)) + 3} y={13} fontSize={11} fill="currentColor">
                      {y}
                    </text>
                  </g>
                ))}
              </svg>
            </td>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            r.kind === "band" ? (
              <tr key={`b${i}`} className="p6-band-row">
                <td colSpan={3}>
                  <b>{r.label}</b>
                </td>
              </tr>
            ) : (
              <tr key={r.p.id}>
                <td>{r.p.code}</td>
                <td>{r.p.name}</td>
                <td>
                  <svg width={W} height={rowH} role="img" aria-label={`${r.p.code} ${fmtDate(r.p.start)} to ${fmtDate(r.p.finish)}`}>
                    <title>{`${r.p.code}: ${fmtDate(r.p.start)} – ${fmtDate(r.p.finish)}${r.p.baselineFinish ? `, baseline finish ${fmtDate(r.p.baselineFinish)}` : ""}, ${pct(r.p.earnedPct)} complete`}</title>
                    {r.p.start !== null && r.p.finish !== null && (
                      <>
                        <rect x={x(r.p.start)} y={4} width={Math.max(2, x(r.p.finish) - x(r.p.start))} height={9} rx={2} fill="var(--accent)" opacity={0.35} />
                        <rect x={x(r.p.start)} y={4} width={Math.max(0, (x(r.p.finish) - x(r.p.start)) * (r.p.earnedPct / 100))} height={9} rx={2} fill="var(--accent)" />
                      </>
                    )}
                    {r.p.baselineFinish !== null && <path d={`M${x(r.p.baselineFinish)} 13 l-4 6 h8 z`} fill="#c49a00" />}
                    {r.p.dataDate !== null && <line x1={x(r.p.dataDate)} x2={x(r.p.dataDate)} y1={0} y2={rowH} stroke="#c4321f" strokeDasharray="3 2" />}
                  </svg>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <p className="muted small">Bar: start to finish, dark part = performance % complete. Yellow marker: baseline finish. Dashed red line: the project's data date.</p>
    </div>
  );
}

function ProjectBars({ bands, metric, grouped }: { bands: ReturnType<typeof trackingBands>; metric: keyof ProjectFigures; grouped: boolean }) {
  const def = TRACKING_METRICS.find((m) => m[0] === metric) ?? TRACKING_METRICS[0];
  const all = bands.flatMap((b) => b.projects.map((p) => ({ p, band: b.label })));
  const vals = all.map(({ p }) => Number(p[metric] ?? 0));
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const W = 520;
  const zero = ((0 - min) / Math.max(1e-9, max - min)) * W;
  const scale = (v: number) => (v / Math.max(1e-9, max - min)) * W;
  return (
    <table className="p6-grid">
      <thead>
        <tr>
          {grouped && <td>Group</td>}
          <td>Project ID</td>
          <td>Project Name</td>
          <td>{def[1]}</td>
          <td style={{ width: W + 10 }} />
        </tr>
      </thead>
      <tbody>
        {all.map(({ p, band }, i) => {
          const v = Number(p[metric] ?? 0);
          const missing = p[metric] === null;
          const w = Math.abs(scale(v));
          return (
            <tr key={p.id}>
              {grouped && <td>{i === 0 || all[i - 1].band !== band ? band : ""}</td>}
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td className="num">{fmtMetric(p[metric], def[2])}</td>
              <td>
                {!missing && (
                  <svg width={W + 10} height={16} role="img" aria-label={`${p.code} ${fmtMetric(p[metric], def[2])}`}>
                    <rect x={v < 0 ? zero - w : zero} y={3} width={Math.max(1, w)} height={10} rx={2} fill={v < 0 ? "#c4321f" : "var(--accent)"} />
                    {min < 0 && <line x1={zero} x2={zero} y1={0} y2={16} stroke="currentColor" opacity={0.4} />}
                  </svg>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
