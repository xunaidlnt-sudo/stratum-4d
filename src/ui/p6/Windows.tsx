// The other P6 windows opened from the Directory bar (WBS, Resources,
// Assignments, Projects and the project registers), plus the Activity
// Network, Trace Logic and the usage spreadsheets.

import { useEffect, useMemo, useRef, useState } from "react";
import { networkLayout, traceLogic } from "../../core/network";
import { monitorThresholds, THRESHOLD_PARAMETERS, uid } from "../../core/ops";
import { allCurves, costAccountPath, resourcesForRole, staffRole } from "../../core/resources";
import type { Assignment, RegisterItem, RegisterKind, Resource, ResourceType, Schedule, WbsNode } from "../../core/types";
import { usageSheet } from "../../core/usage";
import { fmtNum } from "../charts";
import { fmtDate, useStore } from "../store";
import { useP6 } from "./commands";
import { openRates } from "./Dialogs4";
import { openBudgets } from "./Dialogs5";
import { budgetSummary, obsPath, obsTree, riskMatrixOf, riskScore, wbsObs } from "../../core/budget";

const commit = (s: Schedule, label: string) => useStore.getState().commit(s, label);

// ---------------------------------------------------------------- WBS

export function WbsWindow() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => {
    if (!schedule) return [];
    const kids = new Map<string | null, WbsNode[]>();
    for (const w of schedule.wbs) (kids.get(w.parentId) ?? kids.set(w.parentId, []).get(w.parentId)!).push(w);
    for (const l of kids.values()) l.sort((a, b) => a.seq - b.seq);
    const count = new Map<string, number>();
    for (const a of schedule.activities) if (a.wbsId) count.set(a.wbsId, (count.get(a.wbsId) ?? 0) + 1);
    const out: { w: WbsNode; depth: number; path: string; n: number }[] = [];
    const visit = (p: string | null, depth: number, path: string) => {
      for (const w of kids.get(p) ?? []) {
        const full = path ? `${path}.${w.code}` : w.code;
        out.push({ w, depth, path: full, n: count.get(w.id) ?? 0 });
        visit(w.id, depth + 1, full);
      }
    };
    visit(null, 0, "");
    return out;
  }, [schedule]);
  const budgets = useMemo(() => new Map(schedule && schedule.wbs.length <= 2000 ? schedule.wbs.map((w) => [w.id, budgetSummary(schedule, w.id)]) : []), [schedule]);
  if (!schedule) return <div className="empty">No project open.</div>;
  const s = schedule;
  const obsRows = obsTree(s);
  const obsName = new Map(obsRows.map((o) => [o.node.id, o.node.name]));
  const cur = s.wbs.find((w) => w.id === sel) ?? null;
  const siblings = (w: WbsNode) => s.wbs.filter((x) => x.parentId === w.parentId).sort((a, b) => a.seq - b.seq);
  const setWbs = (wbs: WbsNode[], label: string) => commit({ ...s, wbs }, label);
  const add = (child: boolean) => {
    const parentId = child ? cur?.id ?? null : cur?.parentId ?? null;
    const sib = s.wbs.filter((x) => x.parentId === parentId);
    const w: WbsNode = { id: uid("wbs"), parentId, code: String(sib.length + 1), name: "New WBS", seq: Math.max(0, ...sib.map((x) => x.seq)) + 1 };
    setWbs([...s.wbs, w], "Add WBS");
    setSel(w.id);
  };
  const move = (d: -1 | 1) => {
    if (!cur) return;
    const list = siblings(cur);
    const i = list.findIndex((x) => x.id === cur.id);
    const o = list[i + d];
    if (!o) return;
    setWbs(s.wbs.map((x) => (x.id === cur.id ? { ...x, seq: o.seq } : x.id === o.id ? { ...x, seq: cur.seq } : x)), "Move WBS");
  };
  const indent = () => {
    if (!cur) return;
    const list = siblings(cur);
    const i = list.findIndex((x) => x.id === cur.id);
    const above = list[i - 1];
    if (!above) return;
    setWbs(s.wbs.map((x) => (x.id === cur.id ? { ...x, parentId: above.id, seq: 9999 } : x)), "Indent WBS");
  };
  const outdent = () => {
    if (!cur || !cur.parentId) return;
    const parent = s.wbs.find((x) => x.id === cur.parentId);
    setWbs(s.wbs.map((x) => (x.id === cur.id ? { ...x, parentId: parent?.parentId ?? null, seq: (parent?.seq ?? 0) + 0.5 } : x)), "Outdent WBS");
  };
  const del = () => {
    if (!cur) return;
    const n = s.activities.filter((a) => a.wbsId === cur.id).length;
    const kids = s.wbs.some((x) => x.parentId === cur.id);
    if (kids) return useStore.getState().setStatus("Delete or move the child WBS elements first.");
    if (!window.confirm(`Delete WBS ${cur.code}?${n ? ` Its ${n} activities move to the parent.` : ""}`)) return;
    commit({ ...s, wbs: s.wbs.filter((x) => x.id !== cur.id), activities: s.activities.map((a) => (a.wbsId === cur.id ? { ...a, wbsId: cur.parentId } : a)) }, "Delete WBS");
    setSel(null);
  };
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <button onClick={() => add(false)}>Add</button>
        <button onClick={() => add(true)} disabled={!cur}>
          Add Child
        </button>
        <button onClick={del} disabled={!cur}>
          Delete
        </button>
        <span className="tsep" />
        <button onClick={() => move(-1)} disabled={!cur} title="Move up">
          ▲
        </button>
        <button onClick={() => move(1)} disabled={!cur} title="Move down">
          ▼
        </button>
        <button onClick={outdent} disabled={!cur?.parentId} title="Move left (outdent)">
          ◀
        </button>
        <button onClick={indent} disabled={!cur} title="Move right (indent)">
          ▶
        </button>
        <span className="tsep" />
        <button onClick={() => openBudgets(cur?.id ?? null)}>Budgets…</button>
        <span className="spacer" />
        <span className="muted">{s.wbs.length} WBS elements</span>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky">
          <thead>
            <tr>
              <td>WBS Code</td>
              <td>WBS Name</td>
              <td>Responsible Manager</td>
              <td>Original Budget</td>
              <td>Current Budget</td>
              <td>Planned Cost</td>
              <td>Activities</td>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, depth, path, n }) => (
              <tr key={w.id} className={sel === w.id ? "on" : ""} onClick={() => setSel(w.id)}>
                <td style={{ paddingLeft: 6 + depth * 14 }}>
                  <input className="cell" value={w.code} onChange={(e) => setWbs(s.wbs.map((x) => (x.id === w.id ? { ...x, code: e.target.value } : x)), `WBS code ${w.id}`)} title={path} />
                </td>
                <td>
                  <input className="cell" value={w.name} onChange={(e) => setWbs(s.wbs.map((x) => (x.id === w.id ? { ...x, name: e.target.value } : x)), `WBS name ${w.id}`)} />
                </td>
                <td>
                  <select value={w.obsId ?? ""} onChange={(e) => setWbs(s.wbs.map((x) => (x.id === w.id ? { ...x, obsId: e.target.value || null } : x)), `WBS OBS ${w.id}`)} title={w.obsId ? obsPath(s, w.obsId) : `Inherited: ${obsPath(s, wbsObs(s, w.id)) || "none"}`}>
                    <option value="">{w.obsId ? "–" : `(${obsName.get(wbsObs(s, w.id) ?? "") ?? "–"})`}</option>
                    {obsRows.map(({ node, depth: d }) => (
                      <option key={node.id} value={node.id}>
                        {"\u00a0".repeat(d * 2)}
                        {node.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="cell num" type="number" min={0} value={w.originalBudget ?? ""} placeholder="0" onChange={(e) => setWbs(s.wbs.map((x) => (x.id === w.id ? { ...x, originalBudget: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) } : x)), `WBS budget ${w.id}`)} style={{ width: 100 }} />
                </td>
                <td className="num">{fmtNum(budgets.get(w.id)?.current ?? 0)}</td>
                <td className="num">{fmtNum(budgets.get(w.id)?.plannedCost ?? 0)}</td>
                <td className="num">{n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Resources

export function ResourcesWindow() {
  const schedule = useStore((s) => s.schedule);
  if (!schedule) return <div className="empty">No project open.</div>;
  const s = schedule;
  const res = s.resources ?? [];
  const used = new Map<string, number>();
  for (const x of s.assignments ?? []) used.set(x.resourceId, (used.get(x.resourceId) ?? 0) + 1);
  const set = (id: string, patch: Partial<Resource>) => commit({ ...s, resources: res.map((r) => (r.id === id ? { ...r, ...patch } : r)) }, `Resource ${id}`);
  const roleCode = new Map((s.roles ?? []).map((r) => [r.id, r.code]));
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <button onClick={() => commit({ ...s, resources: [...res, { id: uid("rsrc"), code: `R${res.length + 1}`, name: "New Resource", type: "labor", unit: "h", pricePerUnit: 0 }] }, "Add resource")}>Add</button>
        <span className="spacer" />
        <span className="muted">{res.length} resources</span>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky">
          <thead>
            <tr>
              <td>Resource ID</td>
              <td>Resource Name</td>
              <td>Type</td>
              <td>Unit</td>
              <td>Price / Unit</td>
              <td title="For levelling: how many units can work at once (crew size). Empty = no limit.">Max Units / h</td>
              <td>Shift</td>
              <td>Roles</td>
              <td>Rates</td>
              <td>Assignments</td>
              <td />
            </tr>
          </thead>
          <tbody>
            {res.map((r) => (
              <tr key={r.id}>
                <td>
                  <input className="cell" value={r.code} onChange={(e) => set(r.id, { code: e.target.value })} />
                </td>
                <td>
                  <input className="cell" value={r.name} onChange={(e) => set(r.id, { name: e.target.value })} />
                </td>
                <td>
                  <select value={r.type} onChange={(e) => set(r.id, { type: e.target.value as ResourceType })}>
                    <option value="labor">Labor</option>
                    <option value="equipment">Nonlabor</option>
                    <option value="material">Material</option>
                  </select>
                </td>
                <td>
                  <input className="cell" value={r.unit} onChange={(e) => set(r.id, { unit: e.target.value })} style={{ width: 60 }} />
                </td>
                <td>
                  <input className="cell num" type="number" value={r.pricePerUnit} onChange={(e) => set(r.id, { pricePerUnit: Number(e.target.value) || 0 })} style={{ width: 90 }} />
                </td>
                <td>
                  <input className="cell num" type="number" min={0} step={0.5} placeholder="no limit" value={r.maxUnitsPerHour ?? ""} disabled={r.type === "material"} onChange={(e) => set(r.id, { maxUnitsPerHour: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} style={{ width: 80 }} />
                </td>
                <td>
                  <select value={r.shiftId ?? ""} disabled={r.type === "material"} onChange={(e) => set(r.id, { shiftId: e.target.value || null })}>
                    <option value="">–</option>
                    {(s.shifts ?? []).map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td title={(r.roleIds ?? []).map((id) => roleCode.get(id)).join(", ")}>{(r.roleIds ?? []).map((id) => roleCode.get(id)).filter(Boolean).join(", ") || <span className="muted">–</span>}</td>
                <td>
                  <button className="link" onClick={() => openRates(r.id)}>
                    {r.rates?.length ? `${r.rates.length} rate${r.rates.length > 1 ? "s" : ""}` : "Add…"}
                  </button>
                </td>
                <td className="num">{used.get(r.id) ?? 0}</td>
                <td>
                  <button
                    className="link"
                    onClick={() =>
                      window.confirm(`Delete ${r.code}${used.get(r.id) ? ` and its ${used.get(r.id)} assignments` : ""}?`) &&
                      commit({ ...s, resources: res.filter((x) => x.id !== r.id), assignments: (s.assignments ?? []).filter((x) => x.resourceId !== r.id) }, "Delete resource")
                    }
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Assignments

export function AssignmentsWindow() {
  const schedule = useStore((s) => s.schedule);
  const selectActivity = useStore((s) => s.selectActivity);
  const [q, setQ] = useState("");
  if (!schedule) return <div className="empty">No project open.</div>;
  const s = schedule;
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
  const t = q.trim().toLowerCase();
  const list = (s.assignments ?? []).filter((x) => !t || `${acts.get(x.activityId)?.code} ${acts.get(x.activityId)?.name} ${res.get(x.resourceId)?.code} ${res.get(x.resourceId)?.name}`.toLowerCase().includes(t));
  const roles = new Map((s.roles ?? []).map((r) => [r.id, r]));
  const curves = allCurves(s);
  const accts = s.costAccounts ?? [];
  const patch = (id: string, p: Partial<Assignment>, label: string) => commit({ ...s, assignments: s.assignments!.map((y) => (y.id === id ? { ...y, ...p } : y)) }, label);
  const set = (id: string, k: "budgetQty" | "actualQty" | "remainingQty", v: number) => {
    const x = s.assignments!.find((y) => y.id === id)!;
    const price = res.get(x.resourceId)?.pricePerUnit ?? (x.roleId ? roles.get(x.roleId)?.pricePerUnit : 0) ?? 0;
    const cost = { budgetQty: "budgetCost", actualQty: "actualCost", remainingQty: "remainingCost" }[k];
    commit({ ...s, assignments: s.assignments!.map((y) => (y.id === id ? { ...y, [k]: v, [cost]: v * price } : y)) }, `Assignment ${id}`);
  };
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <input placeholder="Find activity or resource" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="spacer" />
        <span className="muted">{list.length} assignments</span>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky">
          <thead>
            <tr>
              <td>Activity ID</td>
              <td>Activity Name</td>
              <td>Resource ID</td>
              <td>Role</td>
              <td>Curve</td>
              <td>Cost Account</td>
              <td>Budgeted Units</td>
              <td>Actual Units</td>
              <td>Remaining Units</td>
              <td>Budgeted Cost</td>
              <td>Actual Cost</td>
              <td>Start</td>
              <td>Finish</td>
            </tr>
          </thead>
          <tbody>
            {list.slice(0, 3000).map((x) => {
              const a = acts.get(x.activityId);
              return (
                <tr key={x.id}>
                  <td>
                    <button className="link" onClick={() => a && (selectActivity(a.id), useP6.getState().show("activities"))}>
                      {a?.code}
                    </button>
                  </td>
                  <td>{a?.name}</td>
                  <td title={res.get(x.resourceId)?.name ?? "Unstaffed role"}>
                    {x.roleId ? (
                      <select value={x.resourceId} onChange={(e) => (e.target.value ? commit(staffRole(s, x.id, e.target.value), "Staff role") : patch(x.id, { resourceId: "" }, "Unstaff role"))}>
                        <option value="">(unstaffed)</option>
                        {(resourcesForRole(s, x.roleId).length ? resourcesForRole(s, x.roleId) : [...res.values()]).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      res.get(x.resourceId)?.code
                    )}
                  </td>
                  <td>
                    <select value={x.roleId ?? ""} onChange={(e) => patch(x.id, { roleId: e.target.value || null }, `Assignment role ${x.id}`)} disabled={!x.resourceId && !!x.roleId}>
                      <option value="">–</option>
                      {[...roles.values()].map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={x.curveId ?? ""} onChange={(e) => patch(x.id, { curveId: e.target.value || null }, `Assignment curve ${x.id}`)}>
                      <option value="">Linear</option>
                      {curves.filter((c) => c.id !== "std-linear").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={x.costAccountId ?? ""} onChange={(e) => patch(x.id, { costAccountId: e.target.value || null }, `Assignment account ${x.id}`)}>
                      <option value="">–</option>
                      {accts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {costAccountPath(s, c.id)} {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  {(["budgetQty", "actualQty", "remainingQty"] as const).map((k) => (
                    <td key={k}>
                      <input className="cell num" type="number" value={Math.round(x[k] * 100) / 100} onChange={(e) => set(x.id, k, Math.max(0, Number(e.target.value) || 0))} style={{ width: 80 }} />
                    </td>
                  ))}
                  <td className="num">{fmtNum(x.budgetCost)}</td>
                  <td className="num">{fmtNum(x.actualCost)}</td>
                  <td>{fmtDate(a?.start)}</td>
                  <td>{fmtDate(a?.finish)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length > 3000 && <p className="muted">First 3,000 shown; use Find to narrow.</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Projects

export function ProjectsWindow({ onOpen }: { onOpen: () => void }) {
  const schedule = useStore((s) => s.schedule);
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <button onClick={onOpen}>Open Project…</button>
        <button onClick={() => useP6.getState().open("projectInfo")} disabled={!schedule}>
          Project Details…
        </button>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky">
          <thead>
            <tr>
              <td>Project ID</td>
              <td>Project Name</td>
              <td>Data Date</td>
              <td>Start</td>
              <td>Finish</td>
              <td>Activities</td>
              <td>Baseline</td>
            </tr>
          </thead>
          <tbody>
            {schedule ? (
              <tr className="on">
                <td>{schedule.projectCode}</td>
                <td>{schedule.projectName}</td>
                <td>{fmtDate(schedule.dataDate)}</td>
                <td>{fmtDate(schedule.activities.reduce((m, a) => Math.min(m, a.actualStart ?? a.start ?? Infinity), Infinity))}</td>
                <td>{fmtDate(schedule.activities.reduce((m, a) => Math.max(m, a.finish ?? -Infinity), -Infinity))}</td>
                <td className="num">{schedule.activities.length.toLocaleString()}</td>
                <td>{schedule.baselineInfo?.name ?? "as imported"}</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={7} className="muted">
                  No project open.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- registers

export const REGISTER_COLUMNS: Record<RegisterKind, { title: string; cols: string[] }> = {
  issues: { title: "Issues", cols: ["Issue Name", "Priority", "Status", "Responsible", "Date Identified", "Tracking Layout", "Notes"] },
  risks: { title: "Risks", cols: ["Risk ID", "Risk Name", "Category", "Probability", "Impact (Schedule)", "Impact (Cost)", "Response", "Owner", "Status"] },
  documents: { title: "WPs & Docs", cols: ["Title", "Reference No.", "Version", "Status", "Author", "Location / URL", "Deliverable"] },
  expenses: { title: "Expenses", cols: ["Expense Item", "Category", "Vendor", "Budgeted Cost", "Actual Cost", "Remaining Cost", "Accrual Type"] },
  thresholds: { title: "Thresholds", cols: ["Parameter", "Lower Threshold", "Upper Threshold", "WBS", "From Date", "To Date", "Responsible", "Status"] },
};

export function RegisterWindow({ kind }: { kind: RegisterKind }) {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const selectActivity = useStore((s) => s.selectActivity);
  if (!schedule) return <div className="empty">No project open.</div>;
  const s = schedule;
  const def = REGISTER_COLUMNS[kind];
  const items = s.registers?.[kind] ?? [];
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  const put = (list: RegisterItem[], label: string) => commit({ ...s, registers: { ...(s.registers ?? {}), [kind]: list } }, label);
  const usesActivity = kind !== "thresholds";
  const matrix = riskMatrixOf(s);
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <button onClick={() => put([...items, { id: uid(kind), activityId: usesActivity ? selected : null, values: {} }], `Add ${def.title}`)}>Add</button>
        {kind === "risks" && <button onClick={() => useP6.getState().open("riskMatrix")}>Risk Matrix…</button>}
        <span className="muted small">{usesActivity ? "New rows link to the selected activity." : `Parameters: ${Object.keys(THRESHOLD_PARAMETERS).join(", ")} (days or %).`}</span>
        {kind === "thresholds" && (
          <button
            onClick={() => {
              const r = monitorThresholds(s);
              if (r.created) commit(r.schedule, "Monitor thresholds");
              useStore.getState().setStatus(`Thresholds checked against ${r.checked} activity values: ${r.created} new issue${r.created === 1 ? "" : "s"} in the Issues window.`);
            }}
          >
            Monitor
          </button>
        )}
        <span className="spacer" />
        <span className="muted">
          {items.length} {def.title.toLowerCase()}
        </span>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky">
          <thead>
            <tr>
              {def.cols.map((c) => (
                <td key={c}>{c}</td>
              ))}
              {kind === "risks" && (
                <>
                  <td title="Probability × impact from the risk scoring matrix">Score</td>
                  <td>Level</td>
                </>
              )}
              {usesActivity && <td>Activity</td>}
              <td />
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                {def.cols.map((c) => (
                  <td key={c}>
                    <input className="cell" value={it.values[c] ?? ""} onChange={(e) => put(items.map((x) => (x.id === it.id ? { ...x, values: { ...x.values, [c]: e.target.value } } : x)), `${def.title} ${it.id}`)} />
                  </td>
                ))}
                {kind === "risks" &&
                  (() => {
                    const sc = riskScore(it, matrix);
                    return (
                      <>
                        <td className="num">{sc.score ?? ""}</td>
                        <td>{sc.band ? <span className={`risk-band ${sc.band}`}>{sc.band === "high" ? "High" : sc.band === "medium" ? "Medium" : "Low"}</span> : <span className="muted small">not scored</span>}</td>
                      </>
                    );
                  })()}
                {usesActivity && (
                  <td>
                    {it.activityId && acts.get(it.activityId) ? (
                      <button className="link" onClick={() => (selectActivity(it.activityId!), useP6.getState().show("activities"))}>
                        {acts.get(it.activityId)!.code}
                      </button>
                    ) : (
                      <button className="link" disabled={!selected} onClick={() => put(items.map((x) => (x.id === it.id ? { ...x, activityId: selected } : x)), "Link register item")}>
                        link selected
                      </button>
                    )}
                  </td>
                )}
                <td>
                  <button className="link" onClick={() => put(items.filter((x) => x.id !== it.id), `Delete ${def.title}`)}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={def.cols.length + 2} className="muted">
                  No {def.title.toLowerCase()} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Activity Network (canvas)

const BOX_W = 150;
const BOX_H = 58;
const GAP_X = 50;
const GAP_Y = 18;

export function NetworkView({ only }: { only?: Set<string> | null }) {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const selectActivity = useStore((s) => s.selectActivity);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState({ x: 20, y: 20, k: 1 });
  const [size, setSize] = useState({ w: 600, h: 400 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);
  const layout = useMemo(() => (schedule ? networkLayout(schedule, only ?? undefined) : null), [schedule, only]);
  const byId = useMemo(() => new Map((schedule?.activities ?? []).map((a) => [a.id, a])), [schedule]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Centre on the selected activity when it changes.
  useEffect(() => {
    const n = selected ? layout?.nodes.get(selected) : null;
    if (!n) return;
    setView((v) => ({ ...v, x: size.w / 2 - (n.col * (BOX_W + GAP_X) + BOX_W / 2) * v.k, y: size.h / 2 - (n.row * (BOX_H + GAP_Y) + BOX_H / 2) * v.k }));
  }, [selected, layout, size.w, size.h]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !layout || !schedule) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr;
    c.height = size.h * dpr;
    const g = c.getContext("2d")!;
    const css = getComputedStyle(c);
    const ink = css.getPropertyValue("--cl-text") || "#222";
    const line = css.getPropertyValue("--cl-line") || "#bbb";
    const panel = css.getPropertyValue("--panel") || "#fff";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.w, size.h);
    g.translate(view.x, view.y);
    g.scale(view.k, view.k);
    const vx0 = -view.x / view.k - BOX_W;
    const vy0 = -view.y / view.k - BOX_H;
    const vx1 = (size.w - view.x) / view.k + BOX_W;
    const vy1 = (size.h - view.y) / view.k + BOX_H;
    const pos = (id: string) => {
      const n = layout.nodes.get(id);
      return n ? { x: n.col * (BOX_W + GAP_X), y: n.row * (BOX_H + GAP_Y) } : null;
    };
    // Links first.
    g.lineWidth = 1 / Math.max(0.5, view.k);
    for (const r of schedule.relationships) {
      const p = pos(r.predecessorId);
      const q = pos(r.successorId);
      if (!p || !q) continue;
      const x1 = p.x + BOX_W;
      const y1 = p.y + BOX_H / 2;
      const x2 = q.x;
      const y2 = q.y + BOX_H / 2;
      if (Math.max(x1, x2) < vx0 || Math.min(x1, x2) > vx1 || Math.max(y1, y2) < vy0 || Math.min(y1, y2) > vy1) continue;
      const crit = byId.get(r.predecessorId)?.critical && byId.get(r.successorId)?.critical;
      g.strokeStyle = crit ? "#e02424" : line.trim();
      g.beginPath();
      g.moveTo(x1, y1);
      g.lineTo(x1 + GAP_X / 2, y1);
      g.lineTo(x1 + GAP_X / 2, y2);
      g.lineTo(x2, y2);
      g.stroke();
    }
    g.font = "11px Inter, system-ui, sans-serif";
    for (const [id] of layout.nodes) {
      const p = pos(id)!;
      if (p.x > vx1 || p.x < vx0 || p.y > vy1 || p.y < vy0) continue;
      const a = byId.get(id);
      if (!a) continue;
      const color = a.status === "complete" ? "#1f4fd6" : a.critical ? "#e02424" : a.status === "in-progress" ? "#2fb52f" : "#2fb52f";
      g.fillStyle = panel.trim();
      g.strokeStyle = id === selected ? "#f5a623" : color;
      g.lineWidth = id === selected ? 3 : 1.5;
      g.beginPath();
      g.roundRect(p.x, p.y, BOX_W, BOX_H, 4);
      g.fill();
      g.stroke();
      g.fillStyle = color;
      g.fillRect(p.x, p.y, BOX_W, 4);
      if (view.k > 0.35) {
        g.fillStyle = ink.trim();
        g.font = "600 11px Inter, system-ui, sans-serif";
        g.fillText(a.code, p.x + 6, p.y + 17, BOX_W - 12);
        g.font = "11px Inter, system-ui, sans-serif";
        g.fillText(a.name, p.x + 6, p.y + 31, BOX_W - 12);
        g.fillStyle = "#777";
        g.fillText(`${fmtDate(a.start)}  ${fmtDate(a.finish)}`, p.x + 6, p.y + 46, BOX_W - 12);
      }
    }
  }, [layout, schedule, view, size, selected, byId]);

  if (!schedule || !layout) return <div className="empty">No project open.</div>;

  const hit = (cx: number, cy: number) => {
    const x = (cx - view.x) / view.k;
    const y = (cy - view.y) / view.k;
    const col = Math.floor(x / (BOX_W + GAP_X));
    const row = Math.floor(y / (BOX_H + GAP_Y));
    if (x - col * (BOX_W + GAP_X) > BOX_W || y - row * (BOX_H + GAP_Y) > BOX_H) return null;
    for (const n of layout.nodes.values()) if (n.col === col && n.row === row) return n.id;
    return null;
  };
  return (
    <div
      className="p6-net"
      ref={wrap}
      onWheel={(e) => {
        const r = wrap.current!.getBoundingClientRect();
        const cx = e.clientX - r.left;
        const cy = e.clientY - r.top;
        const k = Math.max(0.08, Math.min(3, view.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
        setView({ k, x: cx - ((cx - view.x) * k) / view.k, y: cy - ((cy - view.y) * k) / view.k });
      }}
      onMouseDown={(e) => (drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false })}
      onMouseMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
        setView({ ...view, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y });
      }}
      onMouseUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (d && !d.moved) {
          const r = wrap.current!.getBoundingClientRect();
          const id = hit(e.clientX - r.left, e.clientY - r.top);
          if (id) selectActivity(id);
        }
      }}
      onMouseLeave={() => (drag.current = null)}
    >
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} />
      <div className="p6-net-tools">
        <button onClick={() => setView({ ...view, k: Math.min(3, view.k * 1.3) })}>+</button>
        <button onClick={() => setView({ ...view, k: Math.max(0.08, view.k / 1.3) })}>−</button>
        <button onClick={() => setView({ x: 20, y: 20, k: Math.min(1, Math.max(0.08, size.w / Math.max(1, layout.cols * (BOX_W + GAP_X)))) })}>Fit</button>
        <span className="muted small">
          {layout.nodes.size.toLocaleString()} activities · drag to pan, wheel to zoom, click to select
        </span>
      </div>
    </div>
  );
}

export function TraceLogicView() {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const depth = useP6((s) => s.traceDepth);
  const setDepth = useP6((s) => s.setTraceDepth);
  const only = useMemo(() => (schedule && selected ? traceLogic(schedule, selected, depth, depth) : null), [schedule, selected, depth]);
  if (!selected) return <div className="empty">Select an activity to trace its logic.</div>;
  return (
    <div className="p6-trace">
      <div className="p6-win-bar">
        <span>Trace Logic</span>
        <label>
          Levels each side{" "}
          <select value={depth} onChange={(e) => setDepth(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 8].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="muted small">{only?.size ?? 0} activities</span>
      </div>
      <NetworkView only={only} />
    </div>
  );
}

// ---------------------------------------------------------------- usage spreadsheet

export function UsageSpreadsheet({ by }: { by: "resource" | "activity" }) {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivities);
  const [step, setStep] = useState<"month" | "week">("month");
  const [measure, setMeasure] = useState<"units" | "cost">("units");
  const [onlySel, setOnlySel] = useState(false);
  const sheet = useMemo(() => (schedule ? usageSheet(schedule, { by, step, measure, activityIds: onlySel && selected.size ? selected : undefined }) : null), [schedule, by, step, measure, onlySel, selected]);
  if (!schedule || !sheet) return <div className="empty">No project open.</div>;
  if (!sheet.rows.length) return <div className="empty">No resource assignments to spread. Assign resources to activities first.</div>;
  const dd = schedule.dataDate ?? 0;
  return (
    <div className="p6-usage">
      <div className="p6-win-bar">
        <b>{by === "resource" ? "Resource Usage Spreadsheet" : "Activity Usage Spreadsheet"}</b>
        <select value={measure} onChange={(e) => setMeasure(e.target.value as "units" | "cost")}>
          <option value="units">Units</option>
          <option value="cost">Cost</option>
        </select>
        <select value={step} onChange={(e) => setStep(e.target.value as "month" | "week")}>
          <option value="month">Month</option>
          <option value="week">Week</option>
        </select>
        <label>
          <input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> Selected activities only
        </label>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky usage">
          <thead>
            <tr>
              <td className="stick">{by === "resource" ? "Resource" : "Activity"}</td>
              <td>Total</td>
              {sheet.periods.map((p) => (
                <td key={p.start} className={p.start <= dd && dd < p.end ? "ddcol" : ""}>
                  {p.label}
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.slice(0, 1500).map((r) => (
              <tr key={r.id}>
                <td className="stick" title={r.sub}>
                  {r.label} <span className="muted small">{r.sub}</span>
                </td>
                <td className="num">
                  <b>{fmtNum(r.total)}</b>
                </td>
                {r.values.map((v, i) => (
                  <td key={i} className={`num ${sheet.periods[i].end <= dd ? "past" : ""}`}>
                    {v ? fmtNum(v) : ""}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="total">
              <td className="stick">Total</td>
              <td className="num">{fmtNum(sheet.totals.reduce((a, b) => a + b, 0))}</td>
              {sheet.totals.map((v, i) => (
                <td key={i} className="num">
                  {v ? fmtNum(v) : ""}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
