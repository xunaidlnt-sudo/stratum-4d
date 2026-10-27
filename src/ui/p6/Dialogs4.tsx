// Enterprise dictionaries from P6's resource and cost chapters: Roles,
// Resource Shifts, Resource Curves, Cost Accounts, a resource's rates over
// time, and assigning roles to activities.

import { useMemo, useState } from "react";
import { uid } from "../../core/ops";
import { allCurves, costAccountPath, costAccountTotals, curveCumulative, resourcesForRole, STANDARD_CURVES } from "../../core/resources";
import type { CostAccount, Resource, ResourceCurve, Role, Schedule, Shift } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { selectedInOrder, useP6 } from "./commands";
import { close, Shell } from "./Dialogs";

const commit = (s: Schedule, label: string) => useStore.getState().commit(s, label);
const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 });
const DAY = 86_400_000;

// ---------------------------------------------------------------- Roles

export function RolesDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(schedule?.roles?.[0]?.id ?? null);
  if (!schedule) return null;
  const s = schedule;
  const roles = s.roles ?? [];
  const role = roles.find((r) => r.id === sel) ?? null;
  const put = (r: Role) => commit({ ...s, roles: roles.map((x) => (x.id === r.id ? r : x)) }, `Role ${r.id}`);
  const used = (id: string) => (s.assignments ?? []).filter((x) => x.roleId === id).length;
  const toggle = (r: Resource, on: boolean) =>
    role &&
    commit(
      { ...s, resources: (s.resources ?? []).map((x) => (x.id === r.id ? { ...x, roleIds: on ? [...new Set([...(x.roleIds ?? []), role.id])] : (x.roleIds ?? []).filter((y) => y !== role.id) } : x)) },
      `Role resources ${role.id}`,
    );
  return (
    <Shell title="Roles" wide onClose={close}>
      <div className="p6-cal">
        <div className="p6-list">
          <div className="p6-list-head">Roles</div>
          <div className="p6-list-body">
            {roles.map((r) => (
              <button key={r.id} className={sel === r.id ? "on" : ""} onClick={() => setSel(r.id)}>
                {r.code} {r.name} <span className="muted small">{used(r.id)} asg.</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ padding: 6 }}>
            <button
              onClick={() => {
                const r: Role = { id: uid("role"), code: `ROLE${roles.length + 1}`, name: "New Role", pricePerUnit: 0 };
                commit({ ...s, roles: [...roles, r] }, "Add role");
                setSel(r.id);
              }}
            >
              Add
            </button>
            <button
              disabled={!role}
              onClick={() => {
                if (!role || !window.confirm(`Delete role ${role.code}? Its unstaffed assignments are removed; staffed ones keep their resource.`)) return;
                commit(
                  {
                    ...s,
                    roles: roles.filter((x) => x.id !== role.id),
                    assignments: (s.assignments ?? []).filter((x) => !(x.roleId === role.id && !x.resourceId)).map((x) => (x.roleId === role.id ? { ...x, roleId: null } : x)),
                    resources: (s.resources ?? []).map((x) => (x.roleIds?.includes(role.id) ? { ...x, roleIds: x.roleIds.filter((y) => y !== role.id) } : x)),
                  },
                  "Delete role",
                );
                setSel(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
        {role ? (
          <div className="stack" key={role.id}>
            <div className="grid2">
              <label>
                Role ID <input value={role.code} onChange={(e) => put({ ...role, code: e.target.value })} />
              </label>
              <label>
                Role name <input value={role.name} onChange={(e) => put({ ...role, name: e.target.value })} />
              </label>
              <label>
                Price / unit (used until the role is staffed)
                <input type="number" min={0} value={role.pricePerUnit} onChange={(e) => put({ ...role, pricePerUnit: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
              <label>
                Max units / h (role limit)
                <input type="number" min={0} step={0.5} placeholder="no limit" value={role.maxUnitsPerHour ?? ""} onChange={(e) => put({ ...role, maxUnitsPerHour: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
              </label>
            </div>
            <h4>Resources that can fill this role</h4>
            <div className="p6-scroll" style={{ maxHeight: 260 }}>
              <table className="p6-grid">
                <tbody>
                  {(s.resources ?? []).map((r) => (
                    <tr key={r.id}>
                      <td style={{ width: 30 }}>
                        <input type="checkbox" checked={!!r.roleIds?.includes(role.id)} onChange={(e) => toggle(r, e.target.checked)} aria-label={`${r.code} fills ${role.code}`} />
                      </td>
                      <td>{r.code}</td>
                      <td>{r.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="muted">Add a role (a job title such as Electrician or Planner), then tick the resources that can do it. Assign roles to activities from Activities › Assign Roles and staff them later in the Assignments window.</p>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Assign Roles

export function AssignRoleDialog() {
  const schedule = useStore((s) => s.schedule);
  const ids = selectedInOrder();
  const [picked, setPicked] = useState<string | null>(null);
  if (!schedule) return null;
  const roles = schedule.roles ?? [];
  const assign = () => {
    const r = roles.find((x) => x.id === picked);
    if (!r) return;
    const byId = new Map(schedule.activities.map((a) => [a.id, a]));
    const add = ids
      .filter((id) => !(schedule.assignments ?? []).some((x) => x.activityId === id && x.roleId === r.id && !x.resourceId))
      .map((id) => {
        const qty = byId.get(id)?.originalDurationHours ?? 0;
        return { id: uid("asg"), activityId: id, resourceId: "", roleId: r.id, budgetQty: qty, actualQty: 0, remainingQty: qty, budgetCost: qty * r.pricePerUnit, actualCost: 0, remainingCost: qty * r.pricePerUnit };
      });
    commit({ ...schedule, assignments: [...(schedule.assignments ?? []), ...add] }, `Assign role ${r.code}`);
    useStore.getState().setStatus(`Assigned role ${r.code} to ${add.length} activities. Staff it in the Assignments window.`);
    close();
  };
  return (
    <Shell
      title={`Assign Roles – ${ids.length} activit${ids.length === 1 ? "y" : "ies"}`}
      onClose={close}
      foot={
        <>
          <span className="spacer" />
          <button className="primary" disabled={!picked || !ids.length} onClick={assign}>
            Assign
          </button>
          <button onClick={close}>Close</button>
        </>
      }
    >
      {roles.length ? (
        <div className="p6-scroll">
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Role ID</td>
                <td>Role Name</td>
                <td>Price / Unit</td>
                <td>Resources</td>
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id} className={picked === r.id ? "on" : ""} onClick={() => setPicked(r.id)}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td className="num">{r.pricePerUnit}</td>
                  <td className="num">{resourcesForRole(schedule, r.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No roles yet. Create them in Enterprise › Roles.</p>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- Resource Shifts

export function ShiftsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(schedule?.shifts?.[0]?.id ?? null);
  if (!schedule) return null;
  const s = schedule;
  const shifts = s.shifts ?? [];
  const shift = shifts.find((x) => x.id === sel) ?? null;
  const put = (x: Shift) => commit({ ...s, shifts: shifts.map((y) => (y.id === x.id ? x : y)) }, `Shift ${x.id}`);
  const users = (id: string) => (s.resources ?? []).filter((r) => r.shiftId === id);
  return (
    <Shell title="Resource Shifts" wide onClose={close}>
      <div className="p6-cal">
        <div className="p6-list">
          <div className="p6-list-head">Shifts</div>
          <div className="p6-list-body">
            {shifts.map((x) => (
              <button key={x.id} className={sel === x.id ? "on" : ""} onClick={() => setSel(x.id)}>
                {x.name} <span className="muted small">{users(x.id).length} res.</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ padding: 6 }}>
            <button
              onClick={() => {
                const x: Shift = { id: uid("shift"), name: `Shift ${shifts.length + 1}`, periods: [{ start: 0, maxUnits: 0 }, { start: 7, maxUnits: 1 }, { start: 19, maxUnits: 0 }] };
                commit({ ...s, shifts: [...shifts, x] }, "Add shift");
                setSel(x.id);
              }}
            >
              Add
            </button>
            <button
              disabled={!shift}
              onClick={() => {
                if (!shift || !window.confirm(`Delete ${shift.name}?`)) return;
                commit({ ...s, shifts: shifts.filter((y) => y.id !== shift.id), resources: (s.resources ?? []).map((r) => (r.shiftId === shift.id ? { ...r, shiftId: null } : r)) }, "Delete shift");
                setSel(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
        {shift ? (
          <div className="stack" key={shift.id}>
            <label>
              Shift name <input value={shift.name} onChange={(e) => put({ ...shift, name: e.target.value })} />
            </label>
            <h4>Periods (each runs until the next one starts)</h4>
            <table className="p6-grid">
              <thead>
                <tr>
                  <td>Start hour</td>
                  <td>Max units / h</td>
                  <td />
                </tr>
              </thead>
              <tbody>
                {shift.periods.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <input className="cell num" type="number" min={0} max={23} value={p.start} onChange={(e) => put({ ...shift, periods: shift.periods.map((q, k) => (k === i ? { ...q, start: Math.min(23, Math.max(0, Math.round(Number(e.target.value) || 0))) } : q)) })} />
                    </td>
                    <td>
                      <input className="cell num" type="number" min={0} step={0.5} value={p.maxUnits} onChange={(e) => put({ ...shift, periods: shift.periods.map((q, k) => (k === i ? { ...q, maxUnits: Math.max(0, Number(e.target.value) || 0) } : q)) })} />
                    </td>
                    <td>
                      <button className="link" disabled={shift.periods.length <= 1} onClick={() => put({ ...shift, periods: shift.periods.filter((_, k) => k !== i) })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button onClick={() => put({ ...shift, periods: [...shift.periods, { start: Math.min(23, (shift.periods.at(-1)?.start ?? 0) + 4), maxUnits: 1 }] })}>Add period</button>
            </div>
            <p className="muted small">
              Levelling uses the shift instead of the resource&apos;s max units: for each period it allows max units × the calendar hours worked in it. Used by {users(shift.id).map((r) => r.code).join(", ") || "no resources yet"} (set in Enterprise › Resource Rates and Shifts).
            </p>
          </div>
        ) : (
          <p className="muted">Shifts limit how many units of a resource can work in each part of the day, for example two crews on days and one at night.</p>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Resource Rates and Shifts

let rateTarget: string | null = null;
/** Open the rates dialog on one resource. */
export const openRates = (resourceId: string) => {
  rateTarget = resourceId;
  useP6.getState().open("resourceRates");
};

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export function ResourceRatesDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(rateTarget ?? schedule?.resources?.[0]?.id ?? null);
  if (!schedule) return null;
  const s = schedule;
  const res = s.resources ?? [];
  const r = res.find((x) => x.id === sel) ?? null;
  const put = (x: Resource) => commit({ ...s, resources: res.map((y) => (y.id === x.id ? x : y)) }, `Resource ${x.id}`);
  const rates = r ? [...(r.rates ?? [])].sort((a, b) => a.from - b.from) : [];
  const setRate = (i: number, patch: Partial<NonNullable<Resource["rates"]>[number]>) => r && put({ ...r, rates: rates.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  return (
    <Shell title="Resource Rates and Shifts" wide onClose={close}>
      <div className="p6-cal">
        <div className="p6-list">
          <div className="p6-list-head">Resources</div>
          <div className="p6-list-body">
            {res.map((x) => (
              <button key={x.id} className={sel === x.id ? "on" : ""} onClick={() => setSel(x.id)}>
                {x.code} {x.name}
              </button>
            ))}
          </div>
        </div>
        {r ? (
          <div className="stack" key={r.id}>
            <div className="grid2">
              <label>
                Shift
                <select value={r.shiftId ?? ""} disabled={r.type === "material"} onChange={(e) => put({ ...r, shiftId: e.target.value || null })}>
                  <option value="">(none: use max units / h)</option>
                  {(s.shifts ?? []).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default price / unit
                <input type="number" min={0} value={r.pricePerUnit} onChange={(e) => put({ ...r, pricePerUnit: Math.max(0, Number(e.target.value) || 0) })} />
              </label>
            </div>
            <h4>Prices and limits over time</h4>
            <table className="p6-grid">
              <thead>
                <tr>
                  <td>Effective date</td>
                  <td>Price / unit</td>
                  <td>Max units / h</td>
                  <td />
                </tr>
              </thead>
              <tbody>
                {rates.map((x, i) => (
                  <tr key={i}>
                    <td>
                      <input type="date" value={isoDay(x.from)} onChange={(e) => e.target.value && setRate(i, { from: Date.parse(`${e.target.value}T00:00:00Z`) })} />
                    </td>
                    <td>
                      <input className="cell num" type="number" min={0} value={x.pricePerUnit} onChange={(e) => setRate(i, { pricePerUnit: Math.max(0, Number(e.target.value) || 0) })} />
                    </td>
                    <td>
                      <input className="cell num" type="number" min={0} step={0.5} placeholder="unchanged" value={x.maxUnitsPerHour ?? ""} onChange={(e) => setRate(i, { maxUnitsPerHour: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} />
                    </td>
                    <td>
                      <button className="link" onClick={() => put({ ...r, rates: rates.filter((_, k) => k !== i) })}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button
                onClick={() => {
                  const from = Math.floor((rates.at(-1)?.from ?? s.dataDate ?? Date.now()) / DAY) * DAY + (rates.length ? 365 * DAY : 0);
                  put({ ...r, rates: [...rates, { from, pricePerUnit: rates.at(-1)?.pricePerUnit ?? r.pricePerUnit }] });
                }}
              >
                Add rate
              </button>
            </div>
            <p className="muted small">Before the first effective date the default price applies. Tools › Recalculate Assignment Costs prices each day of the work at the rate in force that day.</p>
          </div>
        ) : (
          <p className="muted">No resources.</p>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Resource Curves

export function CurveChart({ curve, height = 90 }: { curve: ResourceCurve; height?: number }) {
  const max = Math.max(1, ...curve.values);
  const F = curveCumulative(curve);
  const w = 21 * 12;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height} role="img" aria-label={`${curve.name} curve`}>
      {curve.values.map((v, i) => {
        const h = (v / max) * (height - 6);
        return <rect key={i} x={i * 12 + 1} y={height - h} width={10} height={h} rx={2} fill="var(--accent)" opacity={0.75}>
          <title>{`${i * 5}%: ${v}`}</title>
        </rect>;
      })}
      <polyline fill="none" stroke="var(--text, #333)" strokeWidth={2} points={Array.from({ length: 21 }, (_, i) => `${i * 12 + 6},${height - F(i / 20) * (height - 6)}`).join(" ")} />
    </svg>
  );
}

export function CurvesDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string>(STANDARD_CURVES[0].id);
  if (!schedule) return null;
  const s = schedule;
  const custom = s.curves ?? [];
  const curve = allCurves(s).find((c) => c.id === sel) ?? STANDARD_CURVES[0];
  const editable = custom.some((c) => c.id === curve.id);
  const put = (c: ResourceCurve) => commit({ ...s, curves: custom.map((x) => (x.id === c.id ? c : x)) }, `Curve ${c.id}`);
  const used = (id: string) => (s.assignments ?? []).filter((x) => x.curveId === id).length;
  return (
    <Shell title="Resource Curves" wide onClose={close}>
      <div className="p6-cal">
        <div className="p6-list">
          <div className="p6-list-head">Curves</div>
          <div className="p6-list-body">
            {allCurves(s).map((c) => (
              <button key={c.id} className={sel === c.id ? "on" : ""} onClick={() => setSel(c.id)}>
                {c.name}
                {c.id.startsWith("std-") ? " (standard)" : ""} <span className="muted small">{used(c.id)} asg.</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ padding: 6 }}>
            <button
              onClick={() => {
                const c: ResourceCurve = { id: uid("curve"), name: `${curve.name} (copy)`, values: [...curve.values] };
                commit({ ...s, curves: [...custom, c] }, "Add curve");
                setSel(c.id);
              }}
            >
              Add (copy)
            </button>
            <button
              disabled={!editable}
              onClick={() => {
                if (!window.confirm(`Delete ${curve.name}? Assignments using it go back to linear.`)) return;
                commit({ ...s, curves: custom.filter((x) => x.id !== curve.id), assignments: (s.assignments ?? []).map((x) => (x.curveId === curve.id ? { ...x, curveId: null } : x)) }, "Delete curve");
                setSel(STANDARD_CURVES[0].id);
              }}
            >
              Delete
            </button>
          </div>
        </div>
        <div className="stack" key={curve.id}>
          <label>
            Curve name <input value={curve.name} disabled={!editable} onChange={(e) => put({ ...curve, name: e.target.value })} />
          </label>
          <CurveChart curve={curve} />
          <p className="muted small">Bars: share of the work at each 5% of the duration. Line: cumulative share. Standard curves are read only; copy one to change it.</p>
          <div className="p6-curve-grid">
            {curve.values.map((v, i) => (
              <label key={i}>
                {i * 5}%
                <input className="cell num" type="number" min={0} step={0.5} value={v} disabled={!editable} onChange={(e) => put({ ...curve, values: curve.values.map((x, k) => (k === i ? Math.max(0, Number(e.target.value) || 0) : x)) })} />
              </label>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Cost Accounts

export function CostAccountsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(null);
  const totals = useMemo(() => (schedule ? costAccountTotals(schedule) : []), [schedule]);
  if (!schedule) return null;
  const s = schedule;
  const accts = s.costAccounts ?? [];
  const acct = accts.find((a) => a.id === sel) ?? null;
  const put = (a: CostAccount) => commit({ ...s, costAccounts: accts.map((x) => (x.id === a.id ? a : x)) }, `Cost account ${a.id}`);
  const add = (parentId: string | null) => {
    const sibs = accts.filter((a) => a.parentId === parentId).length;
    const a: CostAccount = { id: uid("cacct"), parentId, code: String((sibs + 1) * 10), name: "New cost account" };
    commit({ ...s, costAccounts: [...accts, a] }, "Add cost account");
    setSel(a.id);
  };
  const descendants = (id: string): Set<string> => {
    const out = new Set([id]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const a of accts) if (a.parentId && out.has(a.parentId) && !out.has(a.id)) (out.add(a.id), (grew = true));
    }
    return out;
  };
  return (
    <Shell
      title="Cost Accounts"
      wide
      onClose={close}
      foot={
        <>
          <button onClick={() => add(null)}>Add</button>
          <button disabled={!acct} onClick={() => acct && add(acct.id)}>
            Add child
          </button>
          <button disabled={!acct || s.defaultCostAccountId === acct?.id} onClick={() => acct && commit({ ...s, defaultCostAccountId: acct.id }, "Default cost account")}>
            Set default
          </button>
          <button
            disabled={!acct}
            onClick={() => {
              if (!acct) return;
              const gone = descendants(acct.id);
              if (!window.confirm(`Delete ${costAccountPath(s, acct.id)} and ${gone.size - 1} child accounts? Assignments booked to them lose the account.`)) return;
              commit(
                {
                  ...s,
                  costAccounts: accts.filter((a) => !gone.has(a.id)),
                  defaultCostAccountId: s.defaultCostAccountId && gone.has(s.defaultCostAccountId) ? null : s.defaultCostAccountId,
                  assignments: (s.assignments ?? []).map((x) => (x.costAccountId && gone.has(x.costAccountId) ? { ...x, costAccountId: null } : x)),
                },
                "Delete cost account",
              );
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
      {totals.length ? (
        <div className="p6-scroll">
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Cost Account ID</td>
                <td>Cost Account Name</td>
                <td>Budgeted Cost</td>
                <td>Actual Cost</td>
                <td>Remaining Cost</td>
                <td>At Completion</td>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => {
                const a = t.account;
                return (
                  <tr key={a?.id ?? "none"} className={a && sel === a.id ? "on" : ""} onClick={() => setSel(a?.id ?? null)}>
                    <td style={{ paddingLeft: 6 + t.depth * 14 }}>
                      {a ? (
                        sel === a.id ? (
                          <input className="cell" value={a.code} onChange={(e) => put({ ...a, code: e.target.value })} style={{ width: 90 }} />
                        ) : (
                          <>
                            {costAccountPath(s, a.id)}
                            {s.defaultCostAccountId === a.id ? " ★" : ""}
                          </>
                        )
                      ) : (
                        <span className="muted">(none)</span>
                      )}
                    </td>
                    <td>{a ? sel === a.id ? <input className="cell" value={a.name} onChange={(e) => put({ ...a, name: e.target.value })} /> : a.name : <span className="muted">Not booked to an account</span>}</td>
                    <td className="num">{money(t.budget)}</td>
                    <td className="num">{money(t.actual)}</td>
                    <td className="num">{money(t.remaining)}</td>
                    <td className="num">{money(t.actual + t.remaining)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No cost accounts yet. Add accounts (for example 100 Labour, 200 Plant, 300 Materials), book assignments to them in the Assignments window and expenses through their Cost Account field. ★ marks the default account used when none is set.</p>
      )}
      <p className="muted small">Totals roll up the hierarchy. Expense rows match an account by its ID in their Cost Account column. Data date {fmtDate(s.dataDate)}.</p>
    </Shell>
  );
}
