// Project Details (General, Dates, Defaults, Settings, Codes, Summary) and the
// code dictionaries (Project Codes, Resource Codes, Activity Codes) in P6's
// dialog layout.

import { useState } from "react";
import { batchFinancialPeriods } from "../../core/budget";
import { DEFAULT_PROJECT_DEFAULTS } from "../../core/ops";
import type { Activity, CodeType, ProjectDefaults, Schedule } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { close } from "./Dialogs";
import { DetailTabs, ListHead, P6Dlg, SideArrows, SideBtn, SideGap, SideHelp } from "./P6Dlg";

const commit = (s: Schedule, label: string) => useStore.getState().commit(s, label);
const isoDay = (t: number | null | undefined) => (t != null ? new Date(t).toISOString().slice(0, 10) : "");
const fromDay = (v: string, hour: number) => (v ? Date.parse(`${v}T00:00:00Z`) + hour * 3_600_000 : null);

// ---------------------------------------------------------------- Project codes (enterprise, kept on this device)

const PC_KEY = "stratum.projectcodes.v1";
export const loadProjectCodeTypes = (): CodeType[] => {
  try {
    return JSON.parse(localStorage.getItem(PC_KEY) ?? "[]");
  } catch {
    return [];
  }
};
/** Enterprise code types plus the ones a project brought with it, merged by name. */
export function mergeCodeTypes(a: CodeType[], b: CodeType[]): CodeType[] {
  const m = new Map(a.map((t) => [t.name, { ...t, values: [...t.values] }]));
  for (const t of b) {
    const x = m.get(t.name);
    if (!x) m.set(t.name, { ...t, values: [...t.values] });
    else for (const v of t.values) if (!x.values.some((y) => y.value === v.value)) x.values.push(v);
  }
  return [...m.values()];
}
const saveProjectCodeTypes = (v: CodeType[]) => {
  try {
    localStorage.setItem(PC_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

// ---------------------------------------------------------------- Project Details

export function ProjectDetailsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [local] = useState(loadProjectCodeTypes);
  if (!schedule) return null;
  const pcTypes = mergeCodeTypes(local, schedule.projectCodeTypes ?? []);
  const s = schedule;
  const up = (patch: Partial<Schedule>) => commit({ ...s, ...patch }, "Project details");
  const d: ProjectDefaults = { ...DEFAULT_PROJECT_DEFAULTS, ...(s.projectDefaults ?? {}) };
  const setD = (patch: Partial<ProjectDefaults>) => up({ projectDefaults: { ...d, ...patch } });
  const st = s.projectSettings ?? {};
  const setS = (patch: Partial<NonNullable<Schedule["projectSettings"]>>) => up({ projectSettings: { ...st, ...patch } });
  const acts = s.activities;
  const count = (k: Activity["status"]) => acts.filter((a) => a.status === k).length;
  const range = acts.reduce((r, a) => ({ lo: Math.min(r.lo, a.actualStart ?? a.start ?? Infinity), hi: Math.max(r.hi, a.finish ?? -Infinity) }), { lo: Infinity, hi: -Infinity });
  const blStart = acts.reduce((m, a) => Math.min(m, a.baselineStart ?? Infinity), Infinity);
  const blFinish = acts.reduce((m, a) => Math.max(m, a.baselineFinish ?? -Infinity), -Infinity);
  const cals = s.calendars ?? [];
  return (
    <P6Dlg
      title={`Project Details – ${s.projectCode}`}
      width={760}
      onClose={close}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={close} />
          <SideGap />
          <SideHelp topic="project-details" />
        </>
      }
    >
      <DetailTabs
        tabs={[
          [
            "General",
            <>
              <div className="row" style={{ gap: 10 }}>
                <label style={{ flex: "0 0 180px" }}>
                  Project ID <input value={s.projectCode} onChange={(e) => up({ projectCode: e.target.value })} />
                </label>
                <label style={{ flex: 1 }}>
                  Project Name <input value={s.projectName} onChange={(e) => up({ projectName: e.target.value })} />
                </label>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <label style={{ flex: 1 }}>
                  Status
                  <select value={s.projectStatus ?? "active"} onChange={(e) => up({ projectStatus: e.target.value as Schedule["projectStatus"] })}>
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="what-if">What-If</option>
                  </select>
                </label>
                <label style={{ flex: 1 }}>
                  Responsible Manager
                  <select value={s.obsId ?? ""} onChange={(e) => up({ obsId: e.target.value || null })}>
                    <option value="">Enterprise</option>
                    {(s.obs ?? []).map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: "0 0 140px" }}>
                  Strategic Priority
                  <input type="number" min={1} max={10000} value={s.strategicPriority ?? 500} onChange={(e) => up({ strategicPriority: Math.min(10000, Math.max(1, Math.round(Number(e.target.value) || 500))) })} />
                </label>
              </div>
              <label>
                EPS
                <input value={(s.eps ?? []).join(" / ") || "(top level)"} disabled />
              </label>
            </>,
          ],
          [
            "Dates",
            <>
              <fieldset className="p6-fieldset">
                <legend>Schedule Dates</legend>
                <div className="grid2">
                  <label>
                    Project Planned Start
                    <input type="date" value={isoDay(s.plannedStart)} onChange={(e) => up({ plannedStart: fromDay(e.target.value, 8) })} />
                  </label>
                  <label>
                    Must Finish By
                    <input type="date" value={isoDay(s.mustFinishBy)} onChange={(e) => up({ mustFinishBy: fromDay(e.target.value, 17) })} />
                  </label>
                  <label>
                    Data Date
                    <input type="date" value={isoDay(s.dataDate)} onChange={(e) => e.target.value && up({ dataDate: fromDay(e.target.value, ((s.dataDate ?? 0) % 86_400_000) / 3_600_000 || 8) })} />
                  </label>
                  <label>
                    Finish (scheduled)
                    <input value={fmtDate(Number.isFinite(range.hi) ? range.hi : null)} disabled />
                  </label>
                </div>
              </fieldset>
              <fieldset className="p6-fieldset">
                <legend>Anticipated Dates</legend>
                <div className="grid2">
                  <label>
                    Anticipated Start
                    <input type="date" value={isoDay(s.anticipatedStart)} onChange={(e) => up({ anticipatedStart: fromDay(e.target.value, 8) })} />
                  </label>
                  <label>
                    Anticipated Finish
                    <input type="date" value={isoDay(s.anticipatedFinish)} onChange={(e) => up({ anticipatedFinish: fromDay(e.target.value, 17) })} />
                  </label>
                </div>
              </fieldset>
              <fieldset className="p6-fieldset">
                <legend>Actual and Baseline</legend>
                <div className="grid2">
                  <label>
                    Start
                    <input value={fmtDate(Number.isFinite(range.lo) ? range.lo : null)} disabled />
                  </label>
                  <label>
                    Baseline Start / Finish
                    <input value={Number.isFinite(blStart) ? `${fmtDate(blStart)} – ${fmtDate(blFinish)}` : "—"} disabled />
                  </label>
                </div>
              </fieldset>
            </>,
          ],
          [
            "Defaults",
            <>
              <fieldset className="p6-fieldset">
                <legend>Defaults for New Activities</legend>
                <div className="grid2">
                  <label>
                    Duration Type
                    <select value={d.durationType} onChange={(e) => setD({ durationType: e.target.value as ProjectDefaults["durationType"] })}>
                      <option value="fixed-duration-units-time">Fixed Duration and Units/Time</option>
                      <option value="fixed-duration-units">Fixed Duration and Units</option>
                      <option value="fixed-units">Fixed Units</option>
                      <option value="fixed-units-time">Fixed Units/Time</option>
                    </select>
                  </label>
                  <label>
                    Percent Complete Type
                    <select value={d.pctType} onChange={(e) => setD({ pctType: e.target.value as ProjectDefaults["pctType"] })}>
                      <option value="duration">Duration</option>
                      <option value="physical">Physical</option>
                      <option value="units">Units</option>
                    </select>
                  </label>
                  <label>
                    Activity Type
                    <select value={d.activityType} onChange={(e) => setD({ activityType: e.target.value as ProjectDefaults["activityType"] })}>
                      <option value="task">Task Dependent</option>
                      <option value="resource-dependent">Resource Dependent</option>
                      <option value="loe">Level of Effort</option>
                      <option value="milestone">Start Milestone</option>
                      <option value="finish-milestone">Finish Milestone</option>
                      <option value="wbs-summary">WBS Summary</option>
                    </select>
                  </label>
                  <label>
                    Calendar
                    <select value={d.calendarId ?? ""} onChange={(e) => setD({ calendarId: e.target.value || null })}>
                      <option value="">Project default ({cals.find((c) => c.id === s.defaultCalendarId)?.name ?? "—"})</option>
                      {cals.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Original Duration (days)
                    <input type="number" min={0} step={0.5} value={d.durationDays} onChange={(e) => setD({ durationDays: Math.max(0, Number(e.target.value) || 0) })} />
                  </label>
                  <label>
                    Project Default Calendar
                    <select value={s.defaultCalendarId ?? ""} onChange={(e) => up({ defaultCalendarId: e.target.value || null })}>
                      {cals.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset className="p6-fieldset">
                <legend>Auto-numbering Defaults</legend>
                <div className="row" style={{ gap: 10 }}>
                  <label>
                    Activity ID Prefix <input value={d.idPrefix} onChange={(e) => setD({ idPrefix: e.target.value })} style={{ width: 110 }} />
                  </label>
                  <label>
                    Activity ID Suffix <input type="number" min={0} value={d.idSuffix} onChange={(e) => setD({ idSuffix: Math.max(0, Math.round(Number(e.target.value) || 0)) })} style={{ width: 110 }} />
                  </label>
                  <label>
                    Increment <input type="number" min={1} value={d.idIncrement} onChange={(e) => setD({ idIncrement: Math.max(1, Math.round(Number(e.target.value) || 10)) })} style={{ width: 90 }} />
                  </label>
                </div>
                <label className="p6-check">
                  <input type="checkbox" checked={d.incrementFromSelected} onChange={(e) => setD({ incrementFromSelected: e.target.checked })} /> Increment Activity ID based on selected activity
                </label>
              </fieldset>
            </>,
          ],
          [
            "Settings",
            <>
              <div className="grid2">
                <label>
                  Character for separating code from WBS hierarchy
                  <input maxLength={1} value={st.wbsSeparator ?? "."} onChange={(e) => setS({ wbsSeparator: e.target.value || "." })} style={{ width: 60 }} />
                </label>
                <label>
                  Fiscal year begins on the 1st day of
                  <select value={st.fiscalYearStartMonth ?? 1} onChange={(e) => setS({ fiscalYearStartMonth: Number(e.target.value) })}>
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Baseline for earned value calculations
                  <select value={st.evBaseline ?? "project"} onChange={(e) => setS({ evBaseline: e.target.value as "project" | "bl2" | "bl3" })}>
                    <option value="project">Project Baseline</option>
                    <option value="bl2">Baseline 2</option>
                    <option value="bl3">Baseline 3</option>
                  </select>
                </label>
                <label>
                  Define critical activities as
                  <input value={s.scheduleOptions?.criticalBy === "longest-path" ? "Longest Path" : "Total Float ≤ threshold (Schedule Options)"} disabled />
                </label>
              </div>
            </>,
          ],
          [
            "Codes",
            pcTypes.length ? (
              <table className="p6-grid">
                <thead>
                  <tr>
                    <td>Project Code</td>
                    <td>Code Value</td>
                  </tr>
                </thead>
                <tbody>
                  {pcTypes.map((t) => (
                    <tr key={t.name}>
                      <td>{t.name}</td>
                      <td>
                        <select value={s.projectCodes?.[t.name] ?? ""} onChange={(e) => up({ projectCodes: { ...(s.projectCodes ?? {}), [t.name]: e.target.value } })}>
                          <option value="">–</option>
                          {t.values.map((v) => (
                            <option key={v.value} value={v.value}>
                              {v.value}
                              {v.description ? ` – ${v.description}` : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted small">No project codes yet. Create them in Enterprise › Project Codes.</p>
            ),
          ],
          [
            "Summary",
            <table className="props">
              <tbody>
                <tr>
                  <td>Activities</td>
                  <td>
                    {acts.length.toLocaleString()} ({count("not-started")} not started, {count("in-progress")} in progress, {count("complete")} completed)
                  </td>
                </tr>
                <tr>
                  <td>Relationships</td>
                  <td>{s.relationships.length.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>WBS elements</td>
                  <td>{s.wbs.length.toLocaleString()}</td>
                </tr>
                <tr>
                  <td>Resources / assignments</td>
                  <td>
                    {(s.resources ?? []).length} / {(s.assignments ?? []).length}
                  </td>
                </tr>
                <tr>
                  <td>Stored baselines</td>
                  <td>{(s.baselines ?? []).length}</td>
                </tr>
                <tr>
                  <td>Source</td>
                  <td>{s.sourceFormat ?? "—"}</td>
                </tr>
              </tbody>
            </table>,
          ],
        ]}
      />
    </P6Dlg>
  );
}

// ---------------------------------------------------------------- Code dictionaries

/** P6's code dictionary: pick a code type, edit its values (Code Value, Description, Colour). */
function CodeDictionary({ title, types, onTypes, used, onRename, help }: { title: string; types: CodeType[]; onTypes: (t: CodeType[]) => void; used: (type: string, value: string) => number; onRename?: (from: string, to: string) => void; help: string }) {
  const [typeName, setTypeName] = useState(types[0]?.name ?? "");
  const [sel, setSel] = useState<number | null>(null);
  const t = types.find((x) => x.name === typeName) ?? null;
  const putValues = (values: CodeType["values"]) => t && onTypes(types.map((x) => (x.name === t.name ? { ...x, values } : x)));
  const addType = () => {
    const name = window.prompt("New code type name:", "");
    if (!name?.trim() || types.some((x) => x.name === name.trim())) return;
    onTypes([...types, { name: name.trim(), values: [] }]);
    setTypeName(name.trim());
  };
  const renameType = () => {
    if (!t) return;
    const name = window.prompt("Rename code type:", t.name);
    if (!name?.trim() || name.trim() === t.name || types.some((x) => x.name === name.trim())) return;
    onRename?.(t.name, name.trim());
    onTypes(types.map((x) => (x.name === t.name ? { ...x, name: name.trim() } : x)));
    setTypeName(name.trim());
  };
  const vals = t?.values ?? [];
  return (
    <P6Dlg
      title={title}
      width={680}
      onClose={close}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={close} />
          <SideGap />
          <SideBtn kind="add" label="Add" disabled={!t} onClick={() => (putValues([...vals, { value: `V${vals.length + 1}`, description: "" }]), setSel(vals.length))} />
          <SideBtn kind="delete" label="Delete" disabled={sel === null} onClick={() => sel !== null && (putValues(vals.filter((_, k) => k !== sel)), setSel(null))} />
          <SideArrows
            up={sel !== null && sel > 0 ? () => (putValues(vals.map((v, k) => (k === sel - 1 ? vals[sel] : k === sel ? vals[sel - 1] : v))), setSel(sel - 1)) : undefined}
            down={sel !== null && sel < vals.length - 1 ? () => (putValues(vals.map((v, k) => (k === sel + 1 ? vals[sel] : k === sel ? vals[sel + 1] : v))), setSel(sel + 1)) : undefined}
          />
          <SideGap />
          <SideHelp topic={help} />
        </>
      }
    >
      <div className="row" style={{ gap: 6, alignItems: "end" }}>
        <label style={{ flex: 1 }}>
          Select code
          <select value={typeName} onChange={(e) => (setTypeName(e.target.value), setSel(null))}>
            {!types.length && <option value="">(no code types)</option>}
            {types.map((x) => (
              <option key={x.name} value={x.name}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={addType}>New code type…</button>
        <button disabled={!t} onClick={renameType}>
          Rename…
        </button>
        <button disabled={!t} onClick={() => t && window.confirm(`Delete code type ${t.name} and its values?`) && (onTypes(types.filter((x) => x.name !== t.name)), setTypeName(types.find((x) => x.name !== t.name)?.name ?? ""))}>
          Delete type
        </button>
      </div>
      <div>
        <ListHead>Code Value</ListHead>
        <div className="p6-list2">
          <table>
            <thead>
              <tr>
                <td style={{ width: "30%" }}>Code Value</td>
                <td>Description</td>
                <td style={{ width: 60 }}>Colour</td>
                <td style={{ width: 70 }}>Used</td>
              </tr>
            </thead>
            <tbody>
              {vals.map((v, k) => (
                <tr key={k} className={sel === k ? "on" : ""} onClick={() => setSel(k)}>
                  <td>
                    <input className="cell" value={v.value} onChange={(e) => putValues(vals.map((x, i) => (i === k ? { ...x, value: e.target.value } : x)))} />
                  </td>
                  <td>
                    <input className="cell" value={v.description ?? ""} onChange={(e) => putValues(vals.map((x, i) => (i === k ? { ...x, description: e.target.value } : x)))} />
                  </td>
                  <td>
                    <input type="color" value={v.color ?? "#cccccc"} onChange={(e) => putValues(vals.map((x, i) => (i === k ? { ...x, color: e.target.value } : x)))} aria-label={`Colour of ${v.value}`} />
                  </td>
                  <td className="num">{t ? used(t.name, v.value) : 0}</td>
                </tr>
              ))}
              {t && !vals.length && (
                <tr>
                  <td colSpan={4} className="muted small">
                    No values. Click Add.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </P6Dlg>
  );
}

export function ProjectCodesDialog() {
  const schedule = useStore((s) => s.schedule);
  const [types, setTypes] = useState(() => mergeCodeTypes(loadProjectCodeTypes(), schedule?.projectCodeTypes ?? []));
  return (
    <CodeDictionary
      title="Project Codes"
      help="project-codes"
      types={types}
      onTypes={(t) => (setTypes(t), saveProjectCodeTypes(t))}
      used={(type, value) => (schedule?.projectCodes?.[type] === value ? 1 : 0)}
      onRename={(from, to) => {
        if (schedule?.projectCodes?.[from] !== undefined) {
          const { [from]: v, ...rest } = schedule.projectCodes;
          commit({ ...schedule, projectCodes: { ...rest, [to]: v } }, "Rename project code");
        }
      }}
    />
  );
}

export function ResourceCodesDialog() {
  const schedule = useStore((s) => s.schedule);
  if (!schedule) return null;
  const s = schedule;
  return (
    <CodeDictionary
      title="Resource Codes"
      help="resource-codes"
      types={s.resourceCodeTypes ?? []}
      onTypes={(t) => commit({ ...useStore.getState().schedule!, resourceCodeTypes: t }, "Resource codes")}
      used={(type, value) => (s.resources ?? []).filter((r) => r.codes?.[type] === value).length}
      onRename={(from, to) => {
        const cur = useStore.getState().schedule!;
        commit({ ...cur, resources: (cur.resources ?? []).map((r) => (r.codes && from in r.codes ? { ...r, codes: Object.fromEntries(Object.entries(r.codes).map(([k, v]) => [k === from ? to : k, v])) } : r)) }, "Rename resource code");
      }}
    />
  );
}

// ---------------------------------------------------------------- Expense Categories

export function ExpenseCategoriesDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<number | null>(null);
  if (!schedule) return null;
  const s = schedule;
  const cats = s.expenseCategories ?? [];
  const used = (c: string) => (s.registers?.expenses ?? []).filter((e) => e.values.Category === c).length;
  const put = (next: string[], label: string) => commit({ ...useStore.getState().schedule!, expenseCategories: next }, label);
  const rename = (i: number, name: string) => {
    const old = cats[i];
    const cur = useStore.getState().schedule!;
    commit(
      {
        ...cur,
        expenseCategories: cats.map((c, k) => (k === i ? name : c)),
        registers: { ...(cur.registers ?? {}), expenses: (cur.registers?.expenses ?? []).map((e) => (e.values.Category === old ? { ...e, values: { ...e.values, Category: name } } : e)) },
      },
      `Expense category ${i}`,
    );
  };
  return (
    <P6Dlg
      title="Expense Categories"
      width={520}
      onClose={close}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={close} />
          <SideGap />
          <SideBtn kind="add" label="Add" onClick={() => (put([...cats, `Category ${cats.length + 1}`], "Add expense category"), setSel(cats.length))} />
          <SideBtn kind="delete" label="Delete" disabled={sel === null} onClick={() => sel !== null && (put(cats.filter((_, k) => k !== sel), "Delete expense category"), setSel(null))} />
          <SideGap />
          <SideHelp topic="expense-categories" />
        </>
      }
    >
      <div className="p6-list2">
        <table>
          <thead>
            <tr>
              <td>Expense Category</td>
              <td style={{ width: 70 }}>Used</td>
            </tr>
          </thead>
          <tbody>
            {cats.map((c, i) => (
              <tr key={i} className={sel === i ? "on" : ""} onClick={() => setSel(i)}>
                <td>
                  <input className="cell" value={c} onChange={(e) => rename(i, e.target.value)} />
                </td>
                <td className="num">{used(c)}</td>
              </tr>
            ))}
            {!cats.length && (
              <tr>
                <td colSpan={2} className="muted small">
                  No categories yet (for example Materials, Subcontract, Travel). Click Add.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </P6Dlg>
  );
}

// ---------------------------------------------------------------- Financial Period Calendar (Admin)

export function FinancialPeriodsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(null);
  const [batch, setBatch] = useState({ start: "", end: "", interval: "month" as "week" | "month" | "quarter" });
  if (!schedule) return null;
  const s = schedule;
  const list = [...(s.financialPeriods ?? [])].sort((a, b) => a.start - b.start);
  const put = (next: typeof list, label: string) => commit({ ...useStore.getState().schedule!, financialPeriods: next }, label);
  const dd = s.dataDate ?? Date.now();
  return (
    <P6Dlg
      title="Financial Period Calendar"
      width={680}
      onClose={close}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={close} />
          <SideGap />
          <SideBtn
            kind="add"
            label="Add"
            onClick={() => {
              const last = list[list.length - 1];
              const start = last ? last.finish : Math.floor(dd / 86_400_000) * 86_400_000;
              const p = batchFinancialPeriods(start, start + 1, "month")[0];
              put([...list, p], "Add financial period");
              setSel(p.id);
            }}
          />
          <SideBtn kind="delete" label="Delete" disabled={!sel} onClick={() => sel && (put(list.filter((p) => p.id !== sel), "Delete financial period"), setSel(null))} />
          <SideGap />
          <SideHelp topic="financial-periods" />
        </>
      }
    >
      <fieldset className="p6-fieldset">
        <legend>Batch Create</legend>
        <div className="row" style={{ gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label>
            Start date <input type="date" value={batch.start} onChange={(e) => setBatch({ ...batch, start: e.target.value })} />
          </label>
          <label>
            End date <input type="date" value={batch.end} onChange={(e) => setBatch({ ...batch, end: e.target.value })} />
          </label>
          <label>
            Period
            <select value={batch.interval} onChange={(e) => setBatch({ ...batch, interval: e.target.value as typeof batch.interval })}>
              <option value="week">Week (ending Sunday)</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
            </select>
          </label>
          <button
            disabled={!batch.start || !batch.end || batch.end <= batch.start}
            onClick={() => {
              const made = batchFinancialPeriods(Date.parse(`${batch.start}T00:00:00Z`), Date.parse(`${batch.end}T00:00:00Z`) + 86_400_000, batch.interval);
              const keep = list.filter((p) => !made.some((m) => m.start < p.finish && p.start < m.finish));
              put([...keep, ...made], "Batch create financial periods");
            }}
          >
            Batch Create
          </button>
        </div>
      </fieldset>
      <div>
        <ListHead>Financial Periods</ListHead>
        <div className="p6-list2">
          <table>
            <thead>
              <tr>
                <td>Period Name</td>
                <td>Start Date</td>
                <td>End Date</td>
                <td style={{ width: 90 }}>Stored</td>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={sel === p.id ? "on" : ""} onClick={() => setSel(p.id)}>
                  <td>
                    <input className="cell" value={p.name} onChange={(e) => put(list.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)), `Financial period ${p.id}`)} />
                  </td>
                  <td>{fmtDate(p.start)}</td>
                  <td>{fmtDate(p.finish - 1)}</td>
                  <td>{(s.periods ?? []).some((x) => x.date >= p.start && x.date < p.finish) ? "Yes" : ""}</td>
                </tr>
              ))}
              {!list.length && (
                <tr>
                  <td colSpan={4} className="muted small">
                    No financial periods. Use Batch Create, e.g. monthly from the project start to its finish.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="muted small">Store Period Performance names each stored period after the financial period that holds the data date; usage spreadsheets can step by financial period.</p>
    </P6Dlg>
  );
}
