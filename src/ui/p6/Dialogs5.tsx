// OBS, Budgets (budget log, funding, spending plan) and the risk scoring
// matrix with its heat map, from P6's Budgets and Risks chapters.

import { useMemo, useState } from "react";
import { budgetSummary, obsPath, obsTree, riskHeatMap, riskMatrixOf, spendingPlanCompare, spendingPlanFromSchedule, wbsObs } from "../../core/budget";
import { uid } from "../../core/ops";
import type { BudgetChange, FundingSource, ObsNode, RiskMatrix, Schedule } from "../../core/types";
import { useStore } from "../store";
import { useP6 } from "./commands";
import { close, Shell } from "./Dialogs";
import { useLayout } from "./layout";

const commit = (s: Schedule, label: string) => useStore.getState().commit(s, label);
const money = (v: number) => (Math.round(v) || 0).toLocaleString();
const num = (v: string) => (v.trim() === "" ? 0 : Number(v.replace(/[^0-9.-]/g, "")) || 0);

// ---------------------------------------------------------------- OBS

export function ObsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(null);
  if (!schedule) return null;
  const s = schedule;
  const list = s.obs ?? [];
  const cur = list.find((o) => o.id === sel) ?? null;
  const put = (o: ObsNode) => commit({ ...s, obs: list.map((x) => (x.id === o.id ? o : x)) }, `OBS ${o.id}`);
  const add = (parentId: string | null) => {
    const o: ObsNode = { id: uid("obs"), parentId, name: "New responsible manager" };
    commit({ ...s, obs: [...list, o] }, "Add OBS");
    setSel(o.id);
  };
  const usedBy = (id: string) => s.wbs.filter((w) => w.obsId === id).length + (s.obsId === id ? 1 : 0);
  return (
    <Shell
      title="OBS (Organisational Breakdown Structure)"
      wide
      onClose={close}
      foot={
        <>
          <button onClick={() => add(null)}>Add</button>
          <button disabled={!cur} onClick={() => cur && add(cur.id)}>
            Add child
          </button>
          <button
            disabled={!cur || list.some((o) => o.parentId === cur?.id)}
            title="Delete children first"
            onClick={() => {
              if (!cur || !window.confirm(`Delete ${cur.name}? ${usedBy(cur.id)} WBS elements lose it.`)) return;
              commit({ ...s, obs: list.filter((o) => o.id !== cur.id), obsId: s.obsId === cur.id ? null : s.obsId, wbs: s.wbs.map((w) => (w.obsId === cur.id ? { ...w, obsId: null } : w)) }, "Delete OBS");
              setSel(null);
            }}
          >
            Delete
          </button>
          <span className="spacer" />
          <button onClick={close}>Close</button>
        </>
      }
    >
      <label>
        Project responsible manager
        <select value={s.obsId ?? ""} onChange={(e) => commit({ ...s, obsId: e.target.value || null }, "Project OBS")}>
          <option value="">–</option>
          {obsTree(s).map(({ node, depth }) => (
            <option key={node.id} value={node.id}>
              {" ".repeat(depth * 2)}
              {node.name}
            </option>
          ))}
        </select>
      </label>
      {list.length ? (
        <div className="p6-scroll" style={{ marginTop: 10 }}>
          <table className="p6-grid">
            <thead>
              <tr>
                <td>OBS Name</td>
                <td>Description</td>
                <td>WBS assigned</td>
              </tr>
            </thead>
            <tbody>
              {obsTree(s).map(({ node, depth }) => (
                <tr key={node.id} className={sel === node.id ? "on" : ""} onClick={() => setSel(node.id)}>
                  <td style={{ paddingLeft: 6 + depth * 14 }}>{sel === node.id ? <input className="cell" value={node.name} onChange={(e) => put({ ...node, name: e.target.value })} /> : node.name}</td>
                  <td>{sel === node.id ? <input className="cell" value={node.description ?? ""} onChange={(e) => put({ ...node, description: e.target.value })} /> : node.description}</td>
                  <td className="num">{usedBy(node.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">The OBS lists the people or departments responsible for the work. Assign them to WBS elements in the WBS window; activities show their manager in the Responsible Manager column.</p>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- Budgets

let budgetTarget: string | null = null;
export const openBudgets = (wbsId: string | null) => {
  budgetTarget = wbsId;
  useP6.getState().open("budgets");
};

type BudgetTab = "summary" | "log" | "funding" | "spending";

export function BudgetsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [node, setNode] = useState<string | null>(budgetTarget);
  const [tab, setTab] = useState<BudgetTab>("summary");
  const rows = useMemo(() => (schedule ? spendingPlanCompare(schedule, node) : []), [schedule, node]);
  if (!schedule) return null;
  const s = schedule;
  const sum = budgetSummary(s, node);
  const w = node ? s.wbs.find((x) => x.id === node) ?? null : null;
  const label = w ? `${w.code} ${w.name}` : `${s.projectCode} (project)`;
  const changes = (s.budgetChanges ?? []).filter((c) => c.wbsId === node);
  const putChange = (c: BudgetChange) => commit({ ...s, budgetChanges: (s.budgetChanges ?? []).map((x) => (x.id === c.id ? c : x)) }, `Budget change ${c.id}`);
  const funds = (s.funding ?? []).filter((f) => f.wbsId === node);
  const sources = s.fundingSources ?? [];
  const setOriginal = (v: number) => (node ? commit({ ...s, wbs: s.wbs.map((x) => (x.id === node ? { ...x, originalBudget: v } : x)) }, `WBS budget ${node}`) : commit({ ...s, originalBudget: v }, "Project budget"));
  const setPlan = (month: string, spending: number, benefit?: number) => {
    const rest = (s.spendingPlan ?? []).filter((r) => !(r.wbsId === node && r.month === month));
    const old = (s.spendingPlan ?? []).find((r) => r.wbsId === node && r.month === month);
    commit({ ...s, spendingPlan: [...rest, { wbsId: node, month, spending, benefit: benefit ?? old?.benefit }] }, `Spending plan ${month}`);
  };
  const stat: [string, number, string?][] = [
    ["Original budget", sum.original],
    ["Approved changes", sum.approvedChanges],
    ["Current budget", sum.current, "original + approved changes"],
    ["Pending changes", sum.pendingChanges],
    ["Proposed budget", sum.proposed, "current + pending"],
    ["Distributed", sum.distributed, "current budgets one level down"],
    ["Undistributed", sum.undistributed],
    ["Funded", sum.funded],
    ["Unfunded", sum.unfunded],
    ["Budgeted cost (activities)", sum.plannedCost],
    ["Total spending plan", sum.spendingPlan],
  ];
  return (
    <Shell title="Budgets" wide onClose={close}>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 260px" }}>
          WBS element
          <select value={node ?? ""} onChange={(e) => setNode(e.target.value || null)}>
            <option value="">{s.projectCode} (whole project)</option>
            {s.wbs.slice(0, 3000).map((x) => (
              <option key={x.id} value={x.id}>
                {x.code} {x.name}
              </option>
            ))}
          </select>
        </label>
        <span className="muted small" style={{ alignSelf: "end" }}>
          Responsible manager: {obsPath(s, node ? wbsObs(s, node) : s.obsId) || "–"}
        </span>
      </div>
      <div className="p6-tabs" role="tablist" style={{ marginTop: 8 }}>
        {(
          [
            ["summary", "Summary"],
            ["log", "Budget Log"],
            ["funding", "Funding"],
            ["spending", "Spending Plan"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "summary" && (
        <div className="stack">
          <label style={{ maxWidth: 260 }}>
            Original budget of {label}
            <input type="number" min={0} value={(node ? w?.originalBudget : s.originalBudget) ?? ""} placeholder="0" onChange={(e) => setOriginal(Math.max(0, Number(e.target.value) || 0))} />
          </label>
          <table className="p6-grid" style={{ maxWidth: 520 }}>
            <tbody>
              {stat.map(([k, v, hint]) => (
                <tr key={k} title={hint}>
                  <td>{k}</td>
                  <td className={`num ${v < 0 ? "neg" : ""}`}>{money(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === "log" && (
        <div className="stack">
          <div className="row">
            <button onClick={() => commit({ ...s, budgetChanges: [...(s.budgetChanges ?? []), { id: uid("bc"), wbsId: node, date: s.dataDate ?? Date.now(), amount: 0, reason: "", responsible: "", status: "pending" }] }, "Add budget change")}>Add change</button>
          </div>
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Date</td>
                <td>Amount</td>
                <td>Reason</td>
                <td>Responsible</td>
                <td>Status</td>
                <td />
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td>
                    <input type="date" value={new Date(c.date).toISOString().slice(0, 10)} onChange={(e) => e.target.value && putChange({ ...c, date: Date.parse(`${e.target.value}T00:00:00Z`) })} />
                  </td>
                  <td>
                    <input className="cell num" value={c.amount} onChange={(e) => putChange({ ...c, amount: num(e.target.value) })} style={{ width: 110 }} />
                  </td>
                  <td>
                    <input className="cell" value={c.reason} onChange={(e) => putChange({ ...c, reason: e.target.value })} />
                  </td>
                  <td>
                    <input className="cell" value={c.responsible} onChange={(e) => putChange({ ...c, responsible: e.target.value })} />
                  </td>
                  <td>
                    <select value={c.status} onChange={(e) => putChange({ ...c, status: e.target.value as BudgetChange["status"] })}>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="not-approved">Not approved</option>
                    </select>
                  </td>
                  <td>
                    <button className="link" onClick={() => commit({ ...s, budgetChanges: (s.budgetChanges ?? []).filter((x) => x.id !== c.id) }, "Delete budget change")}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!changes.length && <p className="muted small">No changes logged for {label}. Approved changes add to the current budget; pending ones only to the proposed budget.</p>}
        </div>
      )}
      {tab === "funding" && (
        <div className="grid2" style={{ alignItems: "start" }}>
          <div className="stack">
            <h4>Funding sources (enterprise)</h4>
            <table className="p6-grid">
              <tbody>
                {sources.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <input className="cell" value={f.name} onChange={(e) => commit({ ...s, fundingSources: sources.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)) }, `Funding source ${f.id}`)} />
                    </td>
                    <td>
                      <button
                        className="link"
                        onClick={() => window.confirm(`Delete ${f.name} and its funding?`) && commit({ ...s, fundingSources: sources.filter((x) => x.id !== f.id), funding: (s.funding ?? []).filter((x) => x.sourceId !== f.id) }, "Delete funding source")}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button onClick={() => commit({ ...s, fundingSources: [...sources, { id: uid("fund"), parentId: null, name: `Source ${sources.length + 1}` } as FundingSource] }, "Add funding source")}>Add source</button>
            </div>
          </div>
          <div className="stack">
            <h4>Funding of {label}</h4>
            <table className="p6-grid">
              <thead>
                <tr>
                  <td>Source</td>
                  <td>Amount</td>
                  <td>Fund share</td>
                  <td />
                </tr>
              </thead>
              <tbody>
                {funds.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <select value={f.sourceId} onChange={(e) => commit({ ...s, funding: (s.funding ?? []).map((x) => (x.id === f.id ? { ...x, sourceId: e.target.value } : x)) }, `Funding ${f.id}`)}>
                        {sources.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="cell num" value={f.amount} onChange={(e) => commit({ ...s, funding: (s.funding ?? []).map((x) => (x.id === f.id ? { ...x, amount: num(e.target.value) } : x)) }, `Funding ${f.id}`)} style={{ width: 110 }} />
                    </td>
                    <td className="num">{sum.current ? `${Math.round((f.amount / sum.current) * 100)}%` : "–"}</td>
                    <td>
                      <button className="link" onClick={() => commit({ ...s, funding: (s.funding ?? []).filter((x) => x.id !== f.id) }, "Delete funding")}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button disabled={!sources.length} onClick={() => commit({ ...s, funding: [...(s.funding ?? []), { id: uid("pf"), wbsId: node, sourceId: sources[0].id, amount: Math.max(0, sum.unfunded) }] }, "Add funding")}>
                Assign funding
              </button>
              <span className="muted small">Unfunded: {money(sum.unfunded)}</span>
            </div>
          </div>
        </div>
      )}
      {tab === "spending" && (
        <div className="stack">
          <div className="row">
            <button onClick={() => (!(s.spendingPlan ?? []).some((r) => r.wbsId === node) || window.confirm("Replace the spending plan with the planned cost per month?")) && commit(spendingPlanFromSchedule(s, node), "Spending plan from schedule")}>
              Fill from schedule cost
            </button>
            <span className="muted small">Type a month&apos;s spending to change it. Variance = cumulative spending plan − cumulative at-completion cost.</span>
          </div>
          {rows.length ? (
            <>
              <SpendingChart rows={rows} />
              <div className="p6-scroll" style={{ maxHeight: 300 }}>
                <table className="p6-grid sticky">
                  <thead>
                    <tr>
                      <td>Month</td>
                      <td>Spending plan</td>
                      <td>Benefit plan</td>
                      <td title="Actual + remaining cost of the activities in the month">At-completion cost</td>
                      <td>Cum. spending</td>
                      <td>Cum. at completion</td>
                      <td>Variance</td>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.month}>
                        <td>{r.month}</td>
                        <td>
                          <input className="cell num" value={r.spending || ""} placeholder="0" onChange={(e) => setPlan(r.month, num(e.target.value))} style={{ width: 100 }} />
                        </td>
                        <td>
                          <input className="cell num" value={r.benefit || ""} placeholder="0" onChange={(e) => setPlan(r.month, r.spending, num(e.target.value))} style={{ width: 100 }} />
                        </td>
                        <td className="num">{money(r.planned)}</td>
                        <td className="num">{money(r.cumSpending)}</td>
                        <td className="num">{money(r.cumPlanned)}</td>
                        <td className={`num ${r.variance < 0 ? "neg" : ""}`}>{money(r.variance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted">No costs or spending plan for {label} yet.</p>
          )}
        </div>
      )}
    </Shell>
  );
}

/** Cumulative spending plan vs cumulative planned cost, one axis. */
function SpendingChart({ rows }: { rows: ReturnType<typeof spendingPlanCompare> }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 150;
  const pad = { l: 8, r: 8, t: 10, b: 18 };
  const max = Math.max(1, ...rows.map((r) => Math.max(r.cumSpending, r.cumPlanned)));
  const x = (i: number) => pad.l + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => H - pad.b - (v / max) * (H - pad.t - pad.b);
  const line = (k: "cumSpending" | "cumPlanned") => rows.map((r, i) => `${x(i)},${y(r[k])}`).join(" ");
  const h = hover !== null ? rows[hover] : null;
  return (
    <div className="spend-chart">
      <div className="spend-legend">
        <span>
          <i style={{ background: "var(--accent)" }} /> Cumulative spending plan
        </span>
        <span>
          <i style={{ background: "var(--p6-remaining, #2e8540)" }} /> Cumulative at-completion cost
        </span>
        {h && (
          <span className="muted">
            {h.month}: plan {money(h.cumSpending)} · planned {money(h.cumPlanned)}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative spending plan against planned cost" onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line, #ccc)" />
        <polyline fill="none" stroke="var(--p6-remaining, #2e8540)" strokeWidth={2} points={line("cumPlanned")} />
        <polyline fill="none" stroke="var(--accent)" strokeWidth={2} points={line("cumSpending")} />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--muted, #888)" strokeDasharray="3 3" />}
        {rows.map((r, i) => (
          <rect key={r.month} x={x(i) - (W / rows.length) / 2} y={0} width={W / rows.length} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        <text x={pad.l} y={H - 4} fontSize={10} fill="currentColor">
          {rows[0].month}
        </text>
        <text x={W - pad.r} y={H - 4} fontSize={10} textAnchor="end" fill="currentColor">
          {rows[rows.length - 1].month}
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- Risk scoring matrix

export function RiskMatrixDialog() {
  const schedule = useStore((s) => s.schedule);
  if (!schedule) return null;
  const s = schedule;
  const m = riskMatrixOf(s);
  const put = (x: RiskMatrix) => commit({ ...s, riskMatrix: x }, "Risk matrix");
  const heat = riskHeatMap(s);
  const band = (v: number) => (v >= m.high ? "high" : v >= m.medium ? "medium" : "low");
  const P = m.probability.length;
  return (
    <Shell title="Risk Scoring Matrix" wide onClose={close}>
      <p className="muted small">
        A risk&apos;s score is the cell where its probability meets its impact (the worse of schedule and cost). Probability can be typed as a label (High), its initials (H), a level (1–{P}) or a percentage. Impact can be a label or a number of days / an amount.
      </p>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="stack">
          <h4>Scores (click a number to change it)</h4>
          <table className="p6-grid risk-matrix">
            <tbody>
              {[...m.probability].reverse().map((p, ri) => {
                const pi = P - 1 - ri;
                return (
                  <tr key={p.label}>
                    <td className="muted small">{p.label}</td>
                    {m.impact.map((imp, ii) => (
                      <td key={imp.label} className={`risk-cell ${band(m.scores[pi][ii])}`}>
                        <input
                          className="cell num"
                          aria-label={`Score for ${p.label} probability and ${imp.label} impact`}
                          value={m.scores[pi][ii]}
                          onChange={(e) => put({ ...m, scores: m.scores.map((row, a) => (a === pi ? row.map((v, b) => (b === ii ? Number(e.target.value) || 0 : v)) : row)) })}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td />
                {m.impact.map((imp) => (
                  <td key={imp.label} className="muted small" style={{ textAlign: "center" }}>
                    {imp.label}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <div className="grid2">
            <label>
              High from score
              <input type="number" value={m.high} onChange={(e) => put({ ...m, high: Number(e.target.value) || 0 })} />
            </label>
            <label>
              Medium from score
              <input type="number" value={m.medium} onChange={(e) => put({ ...m, medium: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <div className="row">
            <button disabled={!s.riskMatrix} onClick={() => commit({ ...s, riskMatrix: undefined }, "Default risk matrix")}>
              Reset to default
            </button>
          </div>
        </div>
        <div className="stack">
          <h4>Heat map: risks in each cell</h4>
          <table className="p6-grid risk-matrix">
            <tbody>
              {[...m.probability].reverse().map((p, ri) => {
                const pi = P - 1 - ri;
                return (
                  <tr key={p.label}>
                    <td className="muted small">{p.label}</td>
                    {m.impact.map((imp, ii) => (
                      <td key={imp.label} className={`risk-cell ${band(m.scores[pi][ii])}`} title={`${heat.counts[pi][ii]} risk(s): ${p.label} probability, ${imp.label} impact (score ${m.scores[pi][ii]})`}>
                        <b>{heat.counts[pi][ii] || ""}</b>
                      </td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td />
                {m.impact.map((imp) => (
                  <td key={imp.label} className="muted small" style={{ textAlign: "center" }}>
                    {imp.label}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="muted small">
            {(s.registers?.risks ?? []).length} risks, {heat.unscored} not scored. Rows: probability. Columns: impact.
          </p>
          <h4>Thresholds</h4>
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Level</td>
                <td>Probability from %</td>
                <td>Impact from days</td>
                <td>Impact from cost</td>
              </tr>
            </thead>
            <tbody>
              {m.probability.map((p, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="cell"
                      value={p.label}
                      onChange={(e) => put({ ...m, probability: m.probability.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)), impact: m.impact.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })}
                    />
                  </td>
                  <td>
                    <input className="cell num" value={p.from} onChange={(e) => put({ ...m, probability: m.probability.map((x, k) => (k === i ? { ...x, from: num(e.target.value) } : x)) })} />
                  </td>
                  <td>
                    <input className="cell num" value={m.impact[i]?.scheduleDays ?? 0} onChange={(e) => put({ ...m, impact: m.impact.map((x, k) => (k === i ? { ...x, scheduleDays: num(e.target.value) } : x)) })} />
                  </td>
                  <td>
                    <input className="cell num" value={m.impact[i]?.cost ?? 0} onChange={(e) => put({ ...m, impact: m.impact.map((x, k) => (k === i ? { ...x, cost: num(e.target.value) } : x)) })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  );
}


// ---------------------------------------------------------------- Gantt curtains and text attachments

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const fromIso = (v: string) => Date.parse(`${v}T00:00:00Z`);

/** Section of Bar Chart Options: curtains and text attachments. */
export function CurtainsAndTexts() {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const bars = useLayout((s) => s.layout.bars);
  const L = useLayout.getState();
  const dd = schedule?.dataDate ?? Date.now();
  const day = Math.floor(dd / 86_400_000) * 86_400_000;
  const curtains = bars.curtains ?? [];
  const texts = bars.texts ?? [];
  const code = (id: string | null) => (id ? schedule?.activities.find((a) => a.id === id)?.code ?? "?" : "");
  return (
    <>
      <h4>Curtains</h4>
      {curtains.length > 0 && (
        <table className="p6-grid">
          <thead>
            <tr>
              <td>Show</td>
              <td>From</td>
              <td>To</td>
              <td>Label</td>
              <td>Colour</td>
              <td />
            </tr>
          </thead>
          <tbody>
            {curtains.map((c, i) => {
              const put = (patch: Partial<typeof c>) => L.setBars({ curtains: curtains.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              return (
                <tr key={c.id}>
                  <td>
                    <input type="checkbox" checked={c.show} onChange={(e) => put({ show: e.target.checked })} aria-label="Show curtain" />
                  </td>
                  <td>
                    <input type="date" value={isoDay(c.start)} onChange={(e) => e.target.value && put({ start: fromIso(e.target.value) })} />
                  </td>
                  <td>
                    <input type="date" value={isoDay(c.finish - 1)} onChange={(e) => e.target.value && put({ finish: fromIso(e.target.value) + 86_400_000 })} />
                  </td>
                  <td>
                    <input value={c.label ?? ""} placeholder="e.g. Shutdown" onChange={(e) => put({ label: e.target.value })} />
                  </td>
                  <td>
                    <input type="color" value={c.color} onChange={(e) => put({ color: e.target.value })} />
                  </td>
                  <td>
                    <button className="link" onClick={() => L.setBars({ curtains: curtains.filter((_, k) => k !== i) })}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="row">
        <button onClick={() => L.setBars({ curtains: [...curtains, { id: uid("curtain"), start: day, finish: day + 7 * 86_400_000, color: "#d4a017", label: "", show: true }] })}>Add curtain</button>
        <span className="muted small">Shades a date range over the bar chart, e.g. a shutdown or Ramadan working hours.</span>
      </div>
      <h4>Text attachments</h4>
      {texts.length > 0 && (
        <table className="p6-grid">
          <thead>
            <tr>
              <td>Show</td>
              <td>Date</td>
              <td>Activity row</td>
              <td>Text</td>
              <td>Colour</td>
              <td />
            </tr>
          </thead>
          <tbody>
            {texts.map((t, i) => {
              const put = (patch: Partial<typeof t>) => L.setBars({ texts: texts.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
              return (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" checked={t.show} onChange={(e) => put({ show: e.target.checked })} aria-label="Show text" />
                  </td>
                  <td>
                    <input type="date" value={isoDay(t.date)} onChange={(e) => e.target.value && put({ date: fromIso(e.target.value) })} />
                  </td>
                  <td>
                    {t.activityId ? code(t.activityId) : <span className="muted">top</span>}{" "}
                    <button className="link" disabled={!selected} onClick={() => put({ activityId: selected })} title="Attach to the selected activity">
                      use selected
                    </button>
                  </td>
                  <td>
                    <input value={t.text} onChange={(e) => put({ text: e.target.value })} />
                  </td>
                  <td>
                    <input type="color" value={t.color} onChange={(e) => put({ color: e.target.value })} />
                  </td>
                  <td>
                    <button className="link" onClick={() => L.setBars({ texts: texts.filter((_, k) => k !== i) })}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="row">
        <button onClick={() => L.setBars({ texts: [...texts, { id: uid("text"), date: day, activityId: selected, text: "Note", color: "#0b2545", show: true }] })}>Add text</button>
        <span className="muted small">Pins a note to a date, on the selected activity&apos;s row (or the top).</span>
      </div>
    </>
  );
}
