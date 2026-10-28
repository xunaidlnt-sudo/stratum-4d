// Timescaled Logic Diagram view: bars on a time axis packed into rows, with
// relationship lines, WBS bands, the data date, and a zoom. Click a bar to
// select the activity (Activity Details follows the selection).

import { useMemo, useRef, useState } from "react";
import { timescaledLayout } from "../../core/tsld";
import { fmtDate, useStore } from "../store";

const DAY = 86_400_000;
const ROW = 30;
const HEAD = 34;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function TsldView() {
  const s = useStore((x) => x.schedule);
  const selected = useStore((x) => x.selectedActivity);
  const selectActivity = useStore((x) => x.selectActivity);
  const [pxPerDay, setPx] = useState(6);
  const [byWbs, setByWbs] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [critOnly, setCritOnly] = useState(false);
  const [scrollX, setScrollX] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const only = useMemo(() => (s && critOnly ? new Set(s.activities.filter((a) => a.critical).map((a) => a.id)) : undefined), [s, critOnly]);
  const L = useMemo(() => (s ? timescaledLayout(s, { groupByWbs: byWbs, only, gapMs: (24 / pxPerDay) * DAY }) : null), [s, byWbs, only, pxPerDay]);
  if (!s || !L) return null;
  if (!L.bars.length) return <p className="muted" style={{ padding: 12 }}>No scheduled activities to draw. Schedule the project (F9) first.</p>;
  const t0 = Date.UTC(new Date(L.start).getUTCFullYear(), new Date(L.start).getUTCMonth(), 1);
  const t1 = Math.max(L.finish, s.dataDate ?? L.finish) + 15 * DAY;
  const x = (t: number) => ((t - t0) / DAY) * pxPerDay;
  const W = Math.ceil(x(t1)) + 40;
  const H = HEAD + L.rows * ROW + 10;
  const y = (row: number) => HEAD + row * ROW + 16;
  // Room for each label: up to the next bar on the same row.
  const nextOnRow = new Map<string, number>();
  const byRow = new Map<number, typeof L.bars>();
  for (const b of L.bars) (byRow.get(b.row) ?? byRow.set(b.row, []).get(b.row)!).push(b);
  for (const list of byRow.values()) {
    list.sort((a, b) => a.start - b.start);
    list.forEach((b, i) => nextOnRow.set(b.a.id, i + 1 < list.length ? x(list[i + 1].start) : Infinity));
  }
  const months: number[] = [];
  for (let d = new Date(t0); d.getTime() < t1; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(d.getTime());
  const color = (b: (typeof L.bars)[number]) => (b.a.status === "complete" ? "#6b7682" : b.a.critical ? "#c4321f" : "#2f6fbf");
  return (
    <div className="p6-tsld">
      <div className="p6-win-bar">
        <span className="muted">Timescaled Logic Diagram</span>
        <label className="p6-check">
          <input type="checkbox" checked={byWbs} onChange={(e) => setByWbs(e.target.checked)} /> Group by WBS
        </label>
        <label className="p6-check">
          <input type="checkbox" checked={showLinks} onChange={(e) => setShowLinks(e.target.checked)} /> Relationships
        </label>
        <label className="p6-check">
          <input type="checkbox" checked={critOnly} onChange={(e) => setCritOnly(e.target.checked)} /> Critical only
        </label>
        <label className="row" style={{ gap: 4 }}>
          Zoom
          <select value={pxPerDay} onChange={(e) => setPx(Number(e.target.value))}>
            <option value={1.5}>Quarters</option>
            <option value={3}>Months</option>
            <option value={6}>Weeks</option>
            <option value={14}>Days</option>
          </select>
        </label>
        <span className="spacer" />
        <span className="muted small">
          {L.bars.length} activities on {L.rows} rows · {L.links.length} relationships
        </span>
      </div>
      <div className="p6-tsld-body" ref={box} onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}>
        <svg width={W} height={H} role="img" aria-label="Timescaled logic diagram" style={{ display: "block" }}>
          <defs>
            <marker id="tsld-arrow" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0 0 L6 3 L0 6 z" fill="#5b6673" />
            </marker>
          </defs>
          {L.groups.map((g, i) => (
            <rect key={`g${i}`} x={0} y={HEAD + g.firstRow * ROW} width={W} height={g.rows * ROW} fill={i % 2 ? "var(--surface-2)" : "transparent"} />
          ))}
          {months.map((t) => {
            const d = new Date(t);
            return (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={16} y2={H} stroke="var(--line)" strokeWidth={d.getUTCMonth() === 0 ? 1.2 : 0.6} />
                {(pxPerDay >= 3 || d.getUTCMonth() % 3 === 0) && (
                  <text x={x(t) + 3} y={30} fontSize={10} fill="var(--muted)">
                    {MONTHS[d.getUTCMonth()]}
                  </text>
                )}
                {(d.getUTCMonth() === 0 || t === months[0]) && (
                  <text x={x(t) + 3} y={12} fontSize={11} fontWeight={600} fill="var(--text)">
                    {d.getUTCFullYear()}
                  </text>
                )}
              </g>
            );
          })}
          {showLinks &&
            L.links.map(({ r, from, to }) => {
              const fx = r.type === "SS" || r.type === "SF" ? x(from.start) : x(from.finish);
              const tx = r.type === "FF" || r.type === "SF" ? x(to.finish) : x(to.start);
              const fy = y(from.row);
              const ty = y(to.row);
              const crit = from.a.critical && to.a.critical;
              const mid = fx + 5;
              const d = fy === ty ? `M${fx} ${fy} H${tx}` : `M${fx} ${fy} H${mid} V${ty} H${tx}`;
              return <path key={r.id} d={d} fill="none" stroke={crit ? "#c4321f" : "#7d8794"} strokeWidth={crit ? 1.2 : 0.8} markerEnd="url(#tsld-arrow)" opacity={0.85} />;
            })}
          {L.bars.map((b) => {
            const x1 = x(b.start);
            const x2 = Math.max(x1 + 2, x(b.finish));
            const yy = y(b.row);
            const room = Math.max(40, (nextOnRow.get(b.a.id) ?? Infinity) - x1 - 4);
            const label = `${b.a.code} ${b.a.name}`;
            const chars = Math.floor(room / 5.6);
            const sel = b.a.id === selected;
            return (
              <g key={b.a.id} className="p6-tsld-bar" onClick={() => selectActivity(b.a.id)}>
                <title>{`${b.a.code} ${b.a.name}\n${fmtDate(b.start)} – ${fmtDate(b.finish)}${b.a.totalFloatHours !== null ? `\nTotal float ${Math.round(b.a.totalFloatHours / 8)} d` : ""}`}</title>
                {b.milestone ? (
                  <path d={`M${x1} ${yy - 5} l5 5 l-5 5 l-5 -5 z`} fill={color(b)} stroke={sel ? "#000" : "none"} />
                ) : (
                  <>
                    <rect x={x1} y={yy - 4} width={x2 - x1} height={8} rx={1.5} fill={color(b)} opacity={b.a.status === "in-progress" ? 0.45 : 1} stroke={sel ? "#000" : "none"} strokeWidth={1.5} />
                    {b.a.status === "in-progress" && <rect x={x1} y={yy - 4} width={(x2 - x1) * Math.min(1, b.a.percentComplete / 100)} height={8} rx={1.5} fill={color(b)} />}
                  </>
                )}
                <text x={x1} y={yy - 7} fontSize={10} fill="var(--text)" fontWeight={sel ? 700 : 400}>
                  {label.length > chars ? `${label.slice(0, Math.max(3, chars - 1))}…` : label}
                </text>
              </g>
            );
          })}
          {s.dataDate !== null && <line x1={x(s.dataDate)} x2={x(s.dataDate)} y1={16} y2={H} stroke="#c4321f" strokeDasharray="4 3" />}
          {byWbs &&
            L.groups.map((g, i) => (
              <text key={`gl${i}`} x={scrollX + 6} y={HEAD + g.firstRow * ROW + 11} fontSize={10} fontWeight={600} fill="var(--accent)" style={{ paintOrder: "stroke", stroke: "var(--panel)", strokeWidth: 3 }}>
                {g.label}
              </text>
            ))}
        </svg>
      </div>
    </div>
  );
}
