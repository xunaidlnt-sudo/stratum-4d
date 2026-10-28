// P6 dialogs: Columns, Filters, Group and Sort, Bar Chart Options,
// Timescale, Layouts, Global Change, Update Progress, Maintain Baselines,
// Check Schedule, Renumber, Assign Predecessors / Successors / Resources /
// Activity Codes, Page Setup and Print, Project details, Spelling and Store
// Period Performance.

import { DocumentDialog } from "./Documents";
import { NewActivityWizard, NewResourceWizard } from "./Wizards";
import { allCodeTypes } from "../../core/codes";
import { sharedGet } from "../shared";
import { printPage } from "../files";
import { download as saveFile } from "../files";
import { Filter } from "lucide-react";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { fieldCtx, fieldsFor, OP_LABEL, STANDARD_FILTERS, type FilterDef, type FilterOp, type FilterRule } from "../../core/fields";
import {
  checkSchedule,
  deleteBaseline,
  globalChange,
  refreshBaseline,
  renameBaseline,
  renumber,
  storeBaseline,
  uid,
  updateProgress,
  useStoredBaseline,
  type ChangeOp,
  type ChangeRule,
  type GlobalChangeDef,
} from "../../core/ops";
import type { CodeType, RelationshipType } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { selectedInOrder, tableOrder, useP6, type P6Dialog } from "./commands";
import { P6Dlg, SideBtn, SideColumn, SideGap, SideHelp } from "./P6Dlg";
import { CapacityDialog, EpsDialog, PortfoliosDialog } from "./EnterpriseProjects";
import { BucketsDialog, ExpenseCategoriesDialog, FinancialPeriodsDialog, NetBoxDialog, PeriodPerformanceDialog, RegisterDetailDialog, TopDownDialog, ProjectCodesDialog, ProjectDetailsDialog, ResourceCodesDialog } from "./Dialogs6";
import { ExcelImportDialog, PreferencesDialog, ScheduleLogDialog } from "./Dialogs3";
import { BudgetsDialog, CurtainsAndTexts, ObsDialog, RiskMatrixDialog } from "./Dialogs5";
import { AssignRoleDialog, CostAccountsDialog, CurvesDialog, ResourceRatesDialog, RolesDialog, ShiftsDialog } from "./Dialogs4";
import { ActivityCodesDialog, CalendarsDialog, ClaimDiggerDialog, LevelDialog, ScheduleOptionsDialog, ScheduleRunDialog, UdfDialog } from "./Dialogs2";
import { allFilters, DEFAULT_GROUP_OPTIONS, DEFAULT_LAYOUT, P6_CLASSIC_BANDS, SOFT_BANDS, STOCK_LAYOUTS, useLayout, type BandStyle, type GroupOptions, type TimescaleUnit } from "./layout";

export function Shell({ title, children, foot, wide, width, onClose }: { title: string; children: ReactNode; foot?: ReactNode; wide?: boolean; width?: number; onClose: () => void }) {
  // Every dialog uses P6's frame: content on the left, command buttons in a column on the right.
  return (
    <P6Dlg
      title={title}
      width={width ?? (wide ? 900 : 620)}
      onClose={onClose}
      side={
        <>
          <SideColumn>{foot ?? <button onClick={onClose}>Close</button>}</SideColumn>
          <SideGap />
          <SideHelp topic={title} />
        </>
      }
    >
      {children}
    </P6Dlg>
  );
}

export const close = () => useP6.getState().open(null);

// ---------------------------------------------------------------- Columns

function ColumnsDialog() {
  const schedule = useStore((s) => s.schedule);
  const layout = useLayout((s) => s.layout);
  const setLayout = useLayout((s) => s.set);
  const fields = useMemo(() => fieldsFor(schedule), [schedule]);
  const [sel, setSel] = useState<string[]>(layout.columns.map((c) => c.id));
  const [pickA, setPickA] = useState<string | null>(null);
  const [pickS, setPickS] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const m = new Map<string, typeof fields>();
    for (const f of fields) if (!sel.includes(f.id) && f.label.toLowerCase().includes(q.toLowerCase())) (m.get(f.group) ?? m.set(f.group, []).get(f.group)!).push(f);
    return m;
  }, [fields, sel, q]);
  const label = (id: string) => fields.find((f) => f.id === id)?.label ?? id;
  const move = (d: -1 | 1) => {
    if (!pickS) return;
    const i = sel.indexOf(pickS);
    const j = i + d;
    if (j < 0 || j >= sel.length) return;
    const next = [...sel];
    [next[i], next[j]] = [next[j], next[i]];
    setSel(next);
  };
  const apply = () => setLayout({ columns: sel.map((id) => layout.columns.find((c) => c.id === id) ?? { id }) });
  return (
    <Shell
      title="Columns"
      wide
      onClose={close}
      foot={
        <>
          <button onClick={() => setSel(DEFAULT_LAYOUT.columns.map((c) => c.id))}>Default</button>
          <span className="spacer" />
          <button onClick={apply}>Apply</button>
          <button
            className="primary"
            onClick={() => {
              apply();
              close();
            }}
          >
            OK
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <div className="p6-cols">
        <div className="p6-list">
          <div className="p6-list-head">
            Available Options <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="p6-list-body">
            {[...groups].map(([g, list]) => (
              <details key={g} open={q !== "" || g === "General" || g === "Dates"}>
                <summary>{g}</summary>
                {list.map((f) => (
                  <button key={f.id} className={pickA === f.id ? "on" : ""} onClick={() => setPickA(f.id)} onDoubleClick={() => setSel([...sel, f.id])}>
                    {f.label}
                  </button>
                ))}
              </details>
            ))}
          </div>
        </div>
        <div className="p6-arrows">
          <button disabled={!pickA} onClick={() => pickA && (setSel([...sel, pickA]), setPickA(null))} title="Add">
            ›
          </button>
          <button disabled={!pickS || sel.length <= 1} onClick={() => pickS && (setSel(sel.filter((x) => x !== pickS)), setPickS(null))} title="Remove">
            ‹
          </button>
          <button disabled={!pickS} onClick={() => move(-1)} title="Move up">
            ▲
          </button>
          <button disabled={!pickS} onClick={() => move(1)} title="Move down">
            ▼
          </button>
        </div>
        <div className="p6-list">
          <div className="p6-list-head">Selected Options</div>
          <div className="p6-list-body">
            {sel.map((id) => (
              <button key={id} className={pickS === id ? "on" : ""} onClick={() => setPickS(id)} onDoubleClick={() => sel.length > 1 && setSel(sel.filter((x) => x !== id))}>
                {label(id)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Filters

const OPS_BY_TYPE: Record<string, FilterOp[]> = {
  text: ["eq", "ne", "contains", "notContains", "startsWith", "empty", "notEmpty"],
  enum: ["eq", "ne", "contains", "empty", "notEmpty"],
  number: ["eq", "ne", "lt", "le", "gt", "ge", "empty", "notEmpty"],
  duration: ["eq", "ne", "lt", "le", "gt", "ge", "empty", "notEmpty"],
  percent: ["eq", "ne", "lt", "le", "gt", "ge"],
  date: ["eq", "ne", "lt", "le", "gt", "ge", "empty", "notEmpty"],
  bool: ["isTrue", "isFalse"],
};

function RuleRows({ rules, onChange }: { rules: FilterRule[]; onChange: (r: FilterRule[]) => void }) {
  const schedule = useStore((s) => s.schedule);
  const fields = useMemo(() => fieldsFor(schedule), [schedule]);
  return (
    <table className="p6-grid">
      <thead>
        <tr>
          <td>Parameter</td>
          <td>Is</td>
          <td>Value</td>
          <td />
        </tr>
      </thead>
      <tbody>
        {rules.map((r, i) => {
          const f = fields.find((x) => x.id === r.field);
          const ops = OPS_BY_TYPE[f?.type ?? "text"];
          const needsValue = !["empty", "notEmpty", "isTrue", "isFalse"].includes(r.op);
          return (
            <tr key={i} data-i={i}>
              <td>
                <select
                  value={r.field}
                  onChange={(e) => {
                    const nf = fields.find((x) => x.id === e.target.value);
                    const op = OPS_BY_TYPE[nf?.type ?? "text"][0];
                    onChange(rules.map((x, k) => (k === i ? { field: e.target.value, op, value: "" } : x)));
                  }}
                >
                  {fields.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={r.op} onChange={(e) => onChange(rules.map((x, k) => (k === i ? { ...x, op: e.target.value as FilterOp } : x)))}>
                  {ops.map((o) => (
                    <option key={o} value={o}>
                      {OP_LABEL[o]}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                {needsValue &&
                  (f?.type === "enum" ? (
                    <select value={r.value ?? ""} onChange={(e) => onChange(rules.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))}>
                      <option value="" />
                      {(f.options ?? []).map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f?.type === "date" ? "date" : "text"}
                      value={r.value ?? ""}
                      placeholder={f?.type === "duration" ? "days" : ""}
                      onChange={(e) => onChange(rules.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))}
                    />
                  ))}
              </td>
              <td>
                <button className="link" onClick={() => onChange(rules.filter((_, k) => k !== i))} title="Delete row">
                  ✕
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

let filterClipboard: FilterDef | null = null;

function FiltersDialog() {
  const layout = useLayout((s) => s.layout);
  const custom = useLayout((s) => s.customFilters);
  const L = useLayout.getState();
  const [on, setOn] = useState<string[]>(layout.filters);
  const [match, setMatch] = useState(layout.filterMatch);
  const [mode, setMode] = useState(layout.filterMode);
  const [edit, setEdit] = useState<FilterDef | null>(null);
  const [cur, setCur] = useState<string | null>(null);
  const [rowSel, setRowSel] = useState<number | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const apply = () => L.set({ filters: on, filterMatch: match, filterMode: mode });
  const isUser = (id: string | null) => !!id && custom.some((c) => c.id === id);
  const curDef = allFilters(custom).find((f) => f.id === cur) ?? null;
  if (edit) {
    const rules = edit.rules;
    return (
      <P6Dlg
        title={isUser(edit.id) ? `Filter: ${edit.name || "untitled"}` : "New Filter"}
        width={900}
        onClose={() => setEdit(null)}
        side={
          <>
            <SideBtn
              kind="ok"
              label="OK"
              primary
              disabled={!edit.name.trim() || !rules.length}
              onClick={() => {
                L.saveFilter(edit);
                setOn([...on.filter((x) => x !== edit.id), edit.id]);
                setCur(edit.id);
                setEdit(null);
              }}
            />
            <SideBtn kind="cancel" label="Cancel" onClick={() => setEdit(null)} />
            <SideGap />
            <SideBtn kind="add" label="Add" onClick={() => setEdit({ ...edit, rules: [...rules, { field: "name", op: "contains", value: "" }] })} />
            <SideBtn kind="delete" label="Delete" disabled={rowSel === null} onClick={() => (setEdit({ ...edit, rules: rules.filter((_, k) => k !== rowSel) }), setRowSel(null))} />
            <SideGap />
            <SideHelp topic="filters" />
          </>
        }
      >
        <div className="row" style={{ gap: 12, alignItems: "end" }}>
          <label>
            Filter Name <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} autoFocus />
          </label>
          <label>
            Show activities where
            <select value={edit.match} onChange={(e) => setEdit({ ...edit, match: e.target.value as "all" | "any" })}>
              <option value="all">All of the following are met</option>
              <option value="any">Any of the following are met</option>
            </select>
          </label>
        </div>
        <div onClick={(e) => {
          const tr = (e.target as HTMLElement).closest("tr[data-i]");
          if (tr) setRowSel(Number(tr.getAttribute("data-i")));
        }}>
          <RuleRows rules={rules} onChange={(r) => setEdit({ ...edit, rules: r })} />
        </div>
      </P6Dlg>
    );
  }
  const groups: [string, FilterDef[]][] = [
    ["Default", STANDARD_FILTERS],
    ["User Defined", custom],
  ];
  return (
    <P6Dlg
      title="Filters"
      width={760}
      onClose={close}
      side={
        <>
          <SideBtn
            kind="ok"
            label="OK"
            primary
            onClick={() => {
              apply();
              close();
            }}
          />
          <SideBtn kind="cancel" label="Cancel" onClick={close} />
          <SideBtn kind="apply" label="Apply" onClick={apply} />
          <SideGap />
          <SideBtn kind="add" label="New..." onClick={() => setEdit({ id: uid("flt"), name: "", match: "all", rules: [{ field: "name", op: "contains", value: "" }] })} />
          <SideBtn kind="delete" label="Delete" disabled={!isUser(cur)} onClick={() => cur && (L.deleteFilter(cur), setOn(on.filter((x) => x !== cur)), setCur(null))} />
          <SideBtn kind="copy" label="Copy" disabled={!curDef} onClick={() => (filterClipboard = curDef ? structuredClone(curDef) : null)} />
          <SideBtn
            kind="paste"
            label="Paste"
            onClick={() => {
              if (!filterClipboard) return;
              const f = { ...structuredClone(filterClipboard), id: uid("flt"), name: `${filterClipboard.name} (copy)` };
              L.saveFilter(f);
              setCur(f.id);
            }}
          />
          <SideBtn kind="modify" label="Modify..." disabled={!curDef} onClick={() => curDef && setEdit(isUser(curDef.id) ? structuredClone(curDef) : { ...structuredClone(curDef), id: uid("flt"), name: `${curDef.name} (copy)` })} />
          <SideGap />
          <SideHelp topic="filters" />
        </>
      }
    >
      <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
        <label className="p6-check">
          <input type="checkbox" checked={!on.length} onChange={() => setOn([])} /> All Activities
        </label>
        <div>
          <div className="small">Show activities that match</div>
          <label className="p6-check">
            <input type="radio" checked={match === "all"} onChange={() => setMatch("all")} /> All selected filters
          </label>
          <label className="p6-check">
            <input type="radio" checked={match === "any"} onChange={() => setMatch("any")} /> Any selected filter
          </label>
        </div>
      </div>
      <div className="p6-list2" style={{ maxHeight: "50vh" }}>
        <table>
          <thead>
            <tr>
              <td>Filter</td>
              <td style={{ width: 60, textAlign: "center" }}>Select</td>
            </tr>
          </thead>
          <tbody>
            {groups.map(([g, list]) => (
              <Fragment key={g}>
                <tr className="grp" onClick={() => setFolded((f) => (f.has(g) ? new Set([...f].filter((x) => x !== g)) : new Set([...f, g])))}>
                  <td colSpan={2}>
                    {folded.has(g) ? "⊞" : "⊟"} {g}
                  </td>
                </tr>
                {!folded.has(g) &&
                  list.map((f) => (
                    <tr key={f.id} className={cur === f.id ? "on" : ""} onClick={() => setCur(f.id)} onDoubleClick={() => setEdit(isUser(f.id) ? structuredClone(f) : { ...structuredClone(f), id: uid("flt"), name: `${f.name} (copy)` })} title={f.rules.map((r) => `${r.field} ${OP_LABEL[r.op]} ${r.value ?? ""}`).join(f.match === "all" ? " and " : " or ")}>
                      <td style={{ paddingLeft: 22 }}>
                        <span className="p6-ico" aria-hidden>
                          <Filter size={12} color={cur === f.id ? "#fff" : "#1f5fa8"} />
                        </span>
                        {f.name}
                      </td>
                      <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${f.name}`} checked={on.includes(f.id)} onChange={(e) => setOn(e.target.checked ? [...on, f.id] : on.filter((x) => x !== f.id))} />
                      </td>
                    </tr>
                  ))}
                {!folded.has(g) && !list.length && (
                  <tr>
                    <td colSpan={2} className="muted small" style={{ paddingLeft: 22 }}>
                      None yet. Use New... or Copy and Paste a default filter.
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <fieldset className="p6-fieldset">
        <legend>When applying the selected filter(s):</legend>
        <label className="p6-check">
          <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace activities shown in current layout
        </label>
        <label className="p6-check">
          <input type="radio" checked={mode === "highlight"} onChange={() => setMode("highlight")} /> Highlight activities in current layout which match criteria
        </label>
      </fieldset>
    </P6Dlg>
  );
}

// ---------------------------------------------------------------- Group and Sort

function GroupSortDialog() {
  const schedule = useStore((s) => s.schedule);
  const layout = useLayout((s) => s.layout);
  const L = useLayout.getState();
  const fields = useMemo(() => fieldsFor(schedule), [schedule]);
  const [groupBy, setGroupBy] = useState(layout.groupBy);
  const [totals, setTotals] = useState(layout.groupTotals);
  const [sort, setSort] = useState(layout.sort);
  const [go, setGo] = useState<GroupOptions>({ ...DEFAULT_GROUP_OPTIONS, ...(layout.groupOptions ?? {}) });
  const put = (p: Partial<GroupOptions>) => setGo((g) => ({ ...g, ...p }));
  const groupable = fields.filter((f) => f.type === "text" || f.type === "enum" || f.type === "bool" || f.group === "Activity Codes");
  const fieldOptions = (skip: string) =>
    groupable
      .filter((f) => f.id !== "wbs" && f.id !== skip)
      .map((f) => (
        <option key={f.id} value={f.id}>
          {f.group === "Activity Codes" ? `Activity Code: ${f.label}` : f.label}
        </option>
      ));
  // Group By rows: the first field, then up to four more.
  const levels = [groupBy, ...go.thenBy];
  const setLevel = (i: number, v: string) => {
    if (i === 0) return setGroupBy(v);
    const t = [...go.thenBy];
    if (v === "") t.splice(i - 1);
    else t[i - 1] = v;
    put({ thenBy: t });
  };
  const wbsDepth = useMemo(() => {
    if (!schedule) return 1;
    const m = new Map(schedule.wbs.map((w) => [w.id, w]));
    let d = 1;
    for (const w of schedule.wbs) {
      let k = 1;
      for (let p = w.parentId ? m.get(w.parentId) : undefined; p && k < 50; p = p.parentId ? m.get(p.parentId) : undefined) k++;
      d = Math.max(d, k);
    }
    return d;
  }, [schedule]);
  const bandCount = Math.min(15, Math.max(levels.length + (groupBy === "wbs" ? wbsDepth - 1 : 0), 3));
  const styles = go.bandStyles ?? SOFT_BANDS;
  const styleAt = (i: number) => styles[Math.min(i, styles.length - 1)];
  const setStyle = (i: number, p: Partial<BandStyle>) => {
    const base = Array.from({ length: Math.max(bandCount, styles.length) }, (_, k) => ({ ...styleAt(k) }));
    base[i] = { ...base[i], ...p };
    put({ bandStyles: base });
  };
  const levelName = (i: number) => {
    if (groupBy === "wbs" && i < wbsDepth && (go.wbsToLevel === 0 || i < go.wbsToLevel)) return `WBS level ${i + 1}`;
    const extra = groupBy === "wbs" ? i - Math.min(wbsDepth, go.wbsToLevel || wbsDepth) : i - 1;
    const id = groupBy === "wbs" ? go.thenBy[extra] : i === 0 ? groupBy : go.thenBy[i - 1];
    return id ? fields.find((f) => f.id === id)?.label ?? id : `Level ${i + 1}`;
  };
  const apply = () => L.set({ groupBy, groupTotals: totals, sort, groupOptions: go });
  return (
    <P6Dlg
      title="Group and Sort"
      width={900}
      onClose={close}
      side={
        <>
          <SideBtn
            kind="ok"
            label="OK"
            primary
            onClick={() => {
              apply();
              close();
            }}
          />
          <SideBtn kind="cancel" label="Cancel" onClick={close} />
          <SideBtn kind="apply" label="Apply" onClick={apply} />
          <SideBtn kind="delete" label="Delete" disabled={!go.thenBy.length} onClick={() => put({ thenBy: go.thenBy.slice(0, -1) })} />
          <SideGap />
          <SideBtn kind="default" label="Default" onClick={() => (setGroupBy("wbs"), setSort([{ field: "start" }]), setTotals(true), setGo(DEFAULT_GROUP_OPTIONS))} />
          <SideGap />
          <SideHelp topic="group-sort" />
        </>
      }
    >
      <fieldset className="p6-fieldset">
        <legend>Display Options</legend>
        <label className="p6-check">
          <input type="checkbox" checked={totals} onChange={(e) => setTotals(e.target.checked)} /> Show Group Totals
        </label>
        <div style={{ paddingLeft: 22 }}>
          <label className="p6-check">
            <input type="checkbox" checked={go.grandTotal} onChange={(e) => put({ grandTotal: e.target.checked })} /> Show Grand Totals
          </label>
          <label className="p6-check">
            <input type="checkbox" checked={go.summariesOnly} onChange={(e) => put({ summariesOnly: e.target.checked })} /> Show Summaries Only
          </label>
        </div>
      </fieldset>
      <fieldset className="p6-fieldset">
        <legend>Group By</legend>
        <table className="p6-grid">
          <thead>
            <tr>
              <td>Group By</td>
              <td>Indent</td>
              <td>To Level</td>
            </tr>
          </thead>
          <tbody>
            {[...levels, ""].slice(0, 5).map((v, i) => (
              <tr key={i}>
                <td>
                  <select value={v} onChange={(e) => setLevel(i, e.target.value)}>
                    {i === 0 ? (
                      <>
                        <option value="wbs">WBS</option>
                        <option value="none">&lt;None&gt;</option>
                      </>
                    ) : (
                      <option value="">&lt;None&gt;</option>
                    )}
                    {fieldOptions("")}
                  </select>
                </td>
                <td>{i === 0 && <input type="checkbox" checked={go.indent} onChange={(e) => put({ indent: e.target.checked })} aria-label="Indent bands" />}</td>
                <td>
                  {i === 0 && groupBy === "wbs" && (
                    <select value={go.wbsToLevel} onChange={(e) => put({ wbsToLevel: Number(e.target.value) })} aria-label="WBS to level">
                      <option value={0}>All</option>
                      {Array.from({ length: wbsDepth }, (_, k) => (
                        <option key={k} value={k + 1}>
                          {k + 1}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4>Font &amp; Color</h4>
        <div className="row" style={{ gap: 6, marginBottom: 4 }}>
          <button onClick={() => put({ bandStyles: P6_CLASSIC_BANDS })}>P6 classic colours</button>
          <button onClick={() => put({ bandStyles: null })}>Stratum colours</button>
        </div>
        <table className="p6-grid">
          <thead>
            <tr>
              <td>Level</td>
              <td>Sample</td>
              <td>Size</td>
              <td>Background</td>
              <td>Text</td>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: bandCount }, (_, i) => {
              const st = styleAt(i);
              return (
                <tr key={i}>
                  <td>{levelName(i)}</td>
                  <td>
                    <span className="p6-band-sample" style={{ background: st.bg, color: st.fg, fontSize: st.size }}>
                      {st.size} Aa
                    </span>
                  </td>
                  <td>
                    <select value={st.size} onChange={(e) => setStyle(i, { size: Number(e.target.value) })} aria-label={`Font size level ${i + 1}`}>
                      {[10, 11, 12, 13, 14, 15, 16, 18].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="color" value={st.bg} onChange={(e) => setStyle(i, { bg: e.target.value })} aria-label={`Background level ${i + 1}`} />
                  </td>
                  <td>
                    <input type="color" value={st.fg} onChange={(e) => setStyle(i, { fg: e.target.value })} aria-label={`Text colour level ${i + 1}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </fieldset>
      <fieldset className="p6-fieldset">
        <legend>Group By Options</legend>
        <label className="p6-check">
          <input type="checkbox" checked={go.hideEmpty} onChange={(e) => put({ hideEmpty: e.target.checked })} /> Hide if empty
        </label>
        <label className="p6-check">
          <input type="checkbox" checked={go.sortBandsAlpha} onChange={(e) => put({ sortBandsAlpha: e.target.checked })} /> Sort bands alphabetically
        </label>
        <div className="row" style={{ gap: 14 }}>
          <span>Show:</span>
          {(
            [
              ["title", "Title"],
              ["code", "ID / Code"],
              ["name", "Name / Description"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="p6-check">
              <input type="checkbox" checked={go.label[k]} onChange={(e) => put({ label: { ...go.label, [k]: e.target.checked } })} /> {l}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="p6-fieldset">
        <legend>Sort</legend>
        <table className="p6-grid">
          <thead>
            <tr>
              <td>Field</td>
              <td>Order</td>
              <td />
            </tr>
          </thead>
          <tbody>
            {sort.map((x, i) => (
              <tr key={i}>
                <td>
                  <select value={x.field} onChange={(e) => setSort(sort.map((y, k) => (k === i ? { ...y, field: e.target.value } : y)))}>
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={x.desc ? "d" : "a"} onChange={(e) => setSort(sort.map((y, k) => (k === i ? { ...y, desc: e.target.value === "d" } : y)))}>
                    <option value="a">Ascending</option>
                    <option value="d">Descending</option>
                  </select>
                </td>
                <td>
                  <button className="link" onClick={() => setSort(sort.filter((_, k) => k !== i))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => setSort([...sort, { field: "code" }])}>Add sort level</button>
      </fieldset>
    </P6Dlg>
  );
}

// ---------------------------------------------------------------- Bars and timescale

function BarsDialog() {
  const schedule = useStore((s) => s.schedule);
  const bars = useLayout((s) => s.layout.bars);
  const rowHeight = useLayout((s) => s.layout.rowHeight);
  const L = useLayout.getState();
  const fields = useMemo(() => fieldsFor(schedule), [schedule]);
  const tick = (k: keyof typeof bars, label: string, hint: string) => (
    <label className="p6-check" title={hint}>
      <input type="checkbox" checked={!!bars[k]} onChange={(e) => L.setBars({ [k]: e.target.checked })} /> {label} <span className="muted small">{hint}</span>
    </label>
  );
  return (
    <Shell title="Bar Chart Options" onClose={close}>
      <h4>Bars</h4>
      {tick("actual", "Actual Work", "blue, from actual start to the data date")}
      {tick("remaining", "Remaining Work", "green, from the data date to finish")}
      {tick("critical", "Critical Remaining Work", "red when the activity is critical")}
      {tick("baseline", "Project Baseline", "thin bar under each activity")}
      {tick("float", "Total Float", "line from finish to late finish")}
      {tick("summaryBars", "Summary bars", "on WBS and group bands")}
      {tick("relationships", "Relationship lines", "predecessor to successor, critical in red")}
      {tick("dataDateLine", "Data date line", "")}
      {tick("progressLine", "Progress line", "joins each activity's progress point to the data date")}
      {tick("legend", "Legend", "a key to the bar colours in the chart")}
      <CurtainsAndTexts />
      <h4>Custom bars</h4>
      <table className="p6-grid">
        <thead>
          <tr>
            <td>Show</td>
            <td>Name</td>
            <td>Timescale</td>
            <td>Filter</td>
            <td>Row</td>
            <td>Colour</td>
            <td />
          </tr>
        </thead>
        <tbody>
          {(bars.custom ?? []).map((b, i) => {
            const put = (patch: Partial<typeof b>) => L.setBars({ custom: bars.custom!.map((x, k) => (k === i ? { ...x, ...patch } : x)) });
            return (
              <tr key={b.id}>
                <td>
                  <input type="checkbox" checked={b.show} onChange={(e) => put({ show: e.target.checked })} />
                </td>
                <td>
                  <input value={b.name} onChange={(e) => put({ name: e.target.value })} />
                </td>
                <td>
                  <select value={b.timescale} onChange={(e) => put({ timescale: e.target.value as typeof b.timescale })}>
                    <option value="current">Current (start – finish)</option>
                    <option value="remaining">Remaining</option>
                    <option value="actual">Actual</option>
                    <option value="baseline">Project baseline</option>
                    <option value="bl2">Baseline 2</option>
                    <option value="bl3">Baseline 3</option>
                    <option value="late">Late dates</option>
                    <option value="float">Total float</option>
                  </select>
                </td>
                <td>
                  <select value={b.filter} onChange={(e) => put({ filter: e.target.value })}>
                    <option value="">All activities</option>
                    {allFilters(useLayout.getState().customFilters).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={b.row} onChange={(e) => put({ row: e.target.value as typeof b.row })}>
                    <option value="top">Top</option>
                    <option value="middle">Middle</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </td>
                <td>
                  <input type="color" value={b.color} onChange={(e) => put({ color: e.target.value })} />
                </td>
                <td>
                  <button className="link" onClick={() => L.setBars({ custom: bars.custom!.filter((_, k) => k !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row">
        <button onClick={() => L.setBars({ custom: [...(bars.custom ?? []), { id: uid("bar"), name: "Baseline 2", show: true, timescale: "bl2", filter: "", color: "#8b5cf6", row: "bottom" }] })}>Add bar</button>
        <span className="muted small">For example: Baseline 2 in purple along the bottom, or Late dates for critical activities only.</span>
      </div>
      <h4>Bar labels</h4>
      <div className="row">
        <label>
          Right of bar{" "}
          <select value={bars.rightLabel} onChange={(e) => L.setBars({ rightLabel: e.target.value })}>
            <option value="">(none)</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Inside bar{" "}
          <select value={bars.insideLabel} onChange={(e) => L.setBars({ insideLabel: e.target.value })}>
            <option value="">(none)</option>
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <h4>Rows</h4>
      <label>
        Row height{" "}
        <select value={rowHeight} onChange={(e) => L.set({ rowHeight: Number(e.target.value) })}>
          {[18, 20, 24, 28, 34].map((h) => (
            <option key={h} value={h}>
              {h}px
            </option>
          ))}
        </select>
      </label>
    </Shell>
  );
}

function TimescaleDialog() {
  const unit = useLayout((s) => s.layout.timescale);
  const L = useLayout.getState();
  const opts: [TimescaleUnit, string][] = [
    ["auto", "Fit to window"],
    ["day", "Month / Day"],
    ["week", "Month / Week"],
    ["month", "Year / Month"],
    ["quarter", "Year / Quarter"],
    ["year", "Year / Half"],
  ];
  return (
    <Shell title="Timescale" onClose={close}>
      <p className="muted">Date interval shown on the two timescale rows.</p>
      {opts.map(([v, l]) => (
        <label key={v} className="p6-check">
          <input type="radio" checked={unit === v} onChange={() => L.set({ timescale: v, zoom: 1 })} /> {l}
        </label>
      ))}
    </Shell>
  );
}

function LayoutsDialog() {
  const saved = useLayout((s) => s.saved);
  const cur = useLayout((s) => s.layout);
  const L = useLayout.getState();
  const [name, setName] = useState(cur.name);
  const row = (l: typeof cur, mine: boolean) => (
    <tr key={`${mine}${l.name}`} className={cur.name === l.name ? "on" : ""}>
      <td>{l.name}</td>
      <td className="muted">{mine ? "User" : "Stock"}</td>
      <td className="nowrap">
        <button
          className="link"
          onClick={() => {
            L.open(l);
            close();
          }}
        >
          Open
        </button>
        {mine && (
          <button className="link" onClick={() => L.remove(l.name)}>
            Delete
          </button>
        )}
      </td>
    </tr>
  );
  return (
    <Shell title="Open Layout" onClose={close}>
      <table className="p6-grid">
        <tbody>
          {STOCK_LAYOUTS.map((l) => row(l, false))}
          {saved.map((l) => row(l, true))}
        </tbody>
      </table>
      <h4>Save current layout as</h4>
      <div className="row">
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <button disabled={!name.trim()} onClick={() => L.saveAs(name.trim())}>
          Save
        </button>
      </div>
      <div className="row">
        <button
          onClick={() => {
            saveFile(`${cur.name.replace(/[^\w -]+/g, "")}.plf.json`, JSON.stringify({ stratumLayout: 1, layout: cur, filters: useLayout.getState().customFilters }, null, 2), "application/json");
          }}
        >
          Export layout…
        </button>
        <label className="p6-drop">
          Import layout…
          <input
            type="file"
            accept=".json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                if (!j.layout?.columns) throw new Error("not a Stratum layout file");
                for (const flt of j.filters ?? []) L.saveFilter(flt);
                L.open(j.layout);
                L.saveAs(j.layout.name);
                useStore.getState().setStatus(`Imported layout ${j.layout.name}.`);
              } catch (x) {
                useStore.getState().setStatus(`Could not import ${f.name}: ${(x as Error).message}`);
              }
            }}
          />
        </label>
      </div>
      <p className="muted small">A layout keeps the columns, filters, grouping and sorting, bars, timescale and panes. Export one to share it with your team.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Global Change

const CHANGE_OPS: [ChangeOp, string][] = [
  ["set", "="],
  ["add", "+"],
  ["subtract", "−"],
  ["multiply", "×"],
  ["divide", "÷"],
  ["append", "append"],
  ["prepend", "prepend"],
];

function GlobalChangeDialog() {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const fields = useMemo(() => fieldsFor(schedule), [schedule]);
  const editable = fields.filter((f) => f.set);
  const [def, setDef] = useState<GlobalChangeDef>({ id: "gc", name: "Global Change", when: { id: "w", name: "", match: "all", rules: [] }, then: [{ field: "od", op: "add", value: "1" }], else: [] });
  const [scope, setScope] = useState<"all" | "selected" | "shown">("shown");
  const [preview, setPreview] = useState<ReturnType<typeof globalChange> | null>(null);
  if (!schedule) return null;
  const ids = scope === "all" ? undefined : scope === "selected" ? selectedInOrder() : tableOrder.ids;
  const ruleTable = (key: "then" | "else", list: ChangeRule[]) => (
    <table className="p6-grid">
      <thead>
        <tr>
          <td>{key === "then" ? "Then" : "Else"}</td>
          <td />
          <td>Value</td>
          <td />
        </tr>
      </thead>
      <tbody>
        {list.map((r, i) => (
          <tr key={i}>
            <td>
              <select value={r.field} onChange={(e) => setDef({ ...def, [key]: list.map((x, k) => (k === i ? { ...x, field: e.target.value } : x)) })}>
                {editable.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <select value={r.op} onChange={(e) => setDef({ ...def, [key]: list.map((x, k) => (k === i ? { ...x, op: e.target.value as ChangeOp } : x)) })}>
                {CHANGE_OPS.map(([o, l]) => (
                  <option key={o} value={o}>
                    {l}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input value={r.value} onChange={(e) => setDef({ ...def, [key]: list.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)) })} placeholder="value, days or date" />
            </td>
            <td>
              <button className="link" onClick={() => setDef({ ...def, [key]: list.filter((_, k) => k !== i) })}>
                ✕
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  if (preview)
    return (
      <Shell
        title={`Global Change Report: ${preview.changes.length} changes`}
        wide
        onClose={() => setPreview(null)}
        foot={
          <>
            <span className="muted">Commit to apply, or Cancel to discard.</span>
            <span className="spacer" />
            <button
              className="primary"
              disabled={!preview.changes.length}
              onClick={() => {
                commit(preview.schedule, `Global Change (${preview.changes.length})`);
                useStore.getState().setStatus(`Global Change applied: ${preview.changes.length} values changed. Press F9 to reschedule.`);
                close();
              }}
            >
              Commit Changes
            </button>
            <button onClick={() => setPreview(null)}>Cancel</button>
          </>
        }
      >
        <div className="p6-scroll">
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Activity ID</td>
                <td>Field</td>
                <td>Old</td>
                <td>New</td>
              </tr>
            </thead>
            <tbody>
              {preview.changes.slice(0, 2000).map((c, i) => (
                <tr key={i}>
                  <td>{c.code}</td>
                  <td>{c.label}</td>
                  <td>{c.before}</td>
                  <td>
                    <b>{c.after}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {preview.changes.length > 2000 && <p className="muted">…and {preview.changes.length - 2000} more.</p>}
        </div>
      </Shell>
    );
  return (
    <Shell
      title="Global Change"
      wide
      onClose={close}
      foot={
        <>
          <label>
            Apply to{" "}
            <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
              <option value="shown">activities shown ({tableOrder.ids.length})</option>
              <option value="selected">selected activities ({useStore.getState().selectedActivities.size})</option>
              <option value="all">all activities ({schedule.activities.length})</option>
            </select>
          </label>
          <span className="spacer" />
          <button className="primary" disabled={!def.then.length && !def.else?.length} onClick={() => setPreview(globalChange(schedule, def, ids))}>
            Change…
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <h4>
        If{" "}
        <select value={def.when.match} onChange={(e) => setDef({ ...def, when: { ...def.when, match: e.target.value as "all" | "any" } })}>
          <option value="all">all of the following</option>
          <option value="any">any of the following</option>
        </select>{" "}
        are met <span className="muted small">(no rows = every activity)</span>
      </h4>
      <RuleRows rules={def.when.rules} onChange={(rules) => setDef({ ...def, when: { ...def.when, rules } })} />
      <button onClick={() => setDef({ ...def, when: { ...def.when, rules: [...def.when.rules, { field: "critical", op: "isTrue" }] } })}>Add If row</button>
      {ruleTable("then", def.then)}
      <button onClick={() => setDef({ ...def, then: [...def.then, { field: "name", op: "append", value: "" }] })}>Add Then row</button>
      {ruleTable("else", def.else ?? [])}
      <button onClick={() => setDef({ ...def, else: [...(def.else ?? []), { field: "name", op: "append", value: "" }] })}>Add Else row</button>
      <p className="muted small">Durations are in days; add or subtract days to dates; use “=” with a date such as 2026-03-31 or 31-Mar-26. The report shows every change before it is applied.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Update Progress

function UpdateProgressDialog({ onSchedule }: { onSchedule: () => void }) {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const dd = schedule?.dataDate ?? Date.now();
  const nextWeek = dd + 7 * 86_400_000;
  const [date, setDate] = useState(new Date(nextWeek).toISOString().slice(0, 10));
  const [scope, setScope] = useState<"all" | "selected">("all");
  if (!schedule) return null;
  return (
    <Shell
      title="Update Progress"
      onClose={close}
      foot={
        <>
          <span className="spacer" />
          <button
            className="primary"
            onClick={() => {
              const t = Date.parse(`${date}T00:00:00Z`) + (((dd % 86_400_000) + 86_400_000) % 86_400_000);
              const r = updateProgress(schedule, t, scope === "selected" ? selectedInOrder() : undefined);
              commit(r.schedule, `Update Progress to ${fmtDate(t)}`);
              useStore.getState().setStatus(`Progress updated to ${fmtDate(t)}: ${r.started} started, ${r.finished} finished, ${r.progressed} in progress. Rescheduling…`);
              close();
              onSchedule();
            }}
          >
            Apply
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <p>Records progress as if work went to plan up to the new data date: activities planned to start get an actual start, those planned to finish get an actual finish, and remaining durations are cut to the work left. The project is then rescheduled.</p>
      <div className="grid2">
        <label>
          Current data date <input value={fmtDate(dd)} disabled />
        </label>
        <label>
          New data date <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="span2">
          Activities{" "}
          <select value={scope} onChange={(e) => setScope(e.target.value as "all" | "selected")}>
            <option value="all">All activities</option>
            <option value="selected">Selected activities only</option>
          </select>
        </label>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Baselines

function BaselinesDialog({ onAssignFile }: { onAssignFile: () => void }) {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const [name, setName] = useState("");
  const [pick, setPick] = useState<string | null>(null);
  if (!schedule) return null;
  const list = schedule.baselines ?? [];
  const sel = list.find((b) => b.id === pick) ?? null;
  return (
    <Shell
      title={`Maintain Baselines – ${schedule.projectCode}`}
      wide
      onClose={close}
      foot={
        <>
          <button onClick={onAssignFile}>Assign from file…</button>
          <span className="spacer" />
          <button onClick={close}>Close</button>
        </>
      }
    >
      <p className="muted">
        Project baseline now: <b>{schedule.baselineInfo?.name ?? "as imported"}</b>
        {schedule.baselineInfo ? ` (data date ${fmtDate(schedule.baselineInfo.dataDate)})` : ""}
      </p>
      <div className="row">
        {(["bl2", "bl3"] as const).map((k) => (
          <label key={k}>
            {k === "bl2" ? "Baseline 2 (comparison)" : "Baseline 3 (comparison)"}{" "}
            <select value={schedule.compareBaselines?.[k] ?? ""} onChange={(e) => commit({ ...schedule, compareBaselines: { ...(schedule.compareBaselines ?? {}), [k]: e.target.value || null } }, `Assign ${k.toUpperCase()}`)}>
              <option value="">(none)</option>
              {list.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="muted small">BL2 and BL3 add columns (BL2 Start / Finish…) and can be drawn as bars from Bar Chart Options → Add bar.</p>
      <table className="p6-grid">
        <thead>
          <tr>
            <td>Baseline Name</td>
            <td>Data Date</td>
            <td>Stored</td>
            <td>Activities</td>
          </tr>
        </thead>
        <tbody>
          {list.map((b) => (
            <tr key={b.id} className={pick === b.id ? "on" : ""} onClick={() => setPick(b.id)}>
              <td>
                <input value={b.name} onChange={(e) => commit(renameBaseline(schedule, b.id, e.target.value), "Rename baseline")} />
              </td>
              <td>{fmtDate(b.dataDate)}</td>
              <td>{new Date(b.createdAt).toLocaleString()}</td>
              <td>{Object.keys(b.dates).length}</td>
            </tr>
          ))}
          {!list.length && (
            <tr>
              <td colSpan={4} className="muted">
                No stored baselines. Add one to keep a copy of the current plan.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="row">
        <input placeholder={`${schedule.projectCode} – Baseline ${list.length + 1}`} value={name} onChange={(e) => setName(e.target.value)} />
        <button
          onClick={() => {
            const r = storeBaseline(schedule, name.trim() || `${schedule.projectCode} – Baseline ${list.length + 1}`);
            commit(r.schedule, "Add baseline");
            setName("");
            setPick(r.baseline.id);
          }}
        >
          Add (copy of current project)
        </button>
      </div>
      <div className="row">
        <button
          disabled={!sel}
          className="primary"
          onClick={() => {
            if (!sel) return;
            const r = useStoredBaseline(schedule, sel.id);
            commit(r.schedule, `Assign baseline ${sel.name}`);
            useStore.getState().setStatus(`Project baseline is now ${sel.name}: ${r.matched} activities matched, ${r.missing} without baseline dates.`);
          }}
        >
          Assign as Project Baseline
        </button>
        <button disabled={!sel} onClick={() => sel && window.confirm(`Overwrite ${sel.name} with the current plan?`) && commit(refreshBaseline(schedule, sel.id), "Update baseline")}>
          Update
        </button>
        <button disabled={!sel} onClick={() => sel && window.confirm(`Delete ${sel.name}?`) && commit(deleteBaseline(schedule, sel.id), "Delete baseline")}>
          Delete
        </button>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Check Schedule

function CheckScheduleDialog() {
  const schedule = useStore((s) => s.schedule);
  const setSel = useStore((s) => s.setActivitySelection);
  const r = useMemo(() => (schedule ? checkSchedule(schedule) : null), [schedule]);
  const [open, setOpen] = useState<string | null>(null);
  if (!schedule || !r) return null;
  const byId = new Map(schedule.activities.map((a) => [a.id, a]));
  const m = r.metrics.find((x) => x.id === open);
  const passed = r.metrics.filter((x) => x.pass).length;
  return (
    <Shell title="Check Schedule" wide onClose={close}>
      <p>
        {r.checked.toLocaleString()} open activities checked against the 14-point assessment. <b>{passed}</b> of {r.metrics.length} metrics pass.
      </p>
      <table className="p6-grid">
        <thead>
          <tr>
            <td>Metric</td>
            <td>Count / Index</td>
            <td>%</td>
            <td>Threshold</td>
            <td>Result</td>
          </tr>
        </thead>
        <tbody>
          {r.metrics.map((x) => (
            <tr key={x.id} className={open === x.id ? "on" : ""} onClick={() => setOpen(x.id)} title={x.description}>
              <td>{x.name}</td>
              <td>{x.percent === null ? x.value : x.value.toLocaleString()}</td>
              <td>{x.percent === null ? "" : `${x.percent}%`}</td>
              <td>{x.threshold}</td>
              <td className={x.pass ? "good" : "bad"}>{x.pass ? "✔ Pass" : "✖ Fail"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {m && (
        <div>
          <h4>
            {m.name}: {m.description}
          </h4>
          {m.activityIds.length ? (
            <>
              <button onClick={() => (setSel(new Set(m.activityIds), m.activityIds[0]), close())}>Select these {m.activityIds.length} activities</button>
              <div className="p6-scroll short">
                {[...new Set(m.activityIds)].slice(0, 300).map((id) => (
                  <div key={id}>
                    {byId.get(id)?.code} <span className="muted">{byId.get(id)?.name}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">No activities to list.</p>
          )}
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- Renumber

function RenumberDialog() {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const ids = selectedInOrder();
  const firstCode = schedule?.activities.find((a) => a.id === ids[0])?.code ?? "A1000";
  const m = /^(.*?)(\d+)$/.exec(firstCode);
  const [prefix, setPrefix] = useState(m ? m[1] : "A");
  const [start, setStart] = useState(m ? Number(m[2]) : 1000);
  const [inc, setInc] = useState(10);
  const [width, setWidth] = useState(m ? m[2].length : 0);
  if (!schedule) return null;
  const sample = Array.from({ length: Math.min(3, ids.length) }, (_, i) => `${prefix}${width ? String(start + i * inc).padStart(width, "0") : start + i * inc}`);
  return (
    <Shell
      title="Renumber Activity IDs"
      onClose={close}
      foot={
        <>
          <span className="spacer" />
          <button
            className="primary"
            disabled={!ids.length}
            onClick={() => {
              const r = renumber(schedule, ids, { prefix, start, increment: inc, width });
              commit(r.schedule, "Renumber Activity IDs");
              useStore.getState().setStatus(`Renumbered ${r.changed} activities.`);
              close();
            }}
          >
            OK
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <p>{ids.length ? `${ids.length} selected activities are renumbered in the order shown.` : "Select the activities to renumber first."}</p>
      <div className="grid2">
        <label>
          Prefix <input value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        </label>
        <label>
          Start with <input type="number" value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} />
        </label>
        <label>
          Increment by <input type="number" min={1} value={inc} onChange={(e) => setInc(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label>
          Digits (0 = no padding) <input type="number" min={0} max={10} value={width} onChange={(e) => setWidth(Math.max(0, Number(e.target.value) || 0))} />
        </label>
      </div>
      <p className="muted">Preview: {sample.join(", ")}…</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Assign

function AssignRelDialog({ kind }: { kind: "pred" | "succ" }) {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const selected = useStore((s) => s.selectedActivity);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [type, setType] = useState<RelationshipType>("FS");
  const [lag, setLag] = useState("0");
  const act = schedule?.activities.find((a) => a.id === selected);
  const hits = useMemo(() => {
    if (!schedule) return [];
    const t = q.trim().toLowerCase();
    return schedule.activities.filter((a) => a.id !== selected && (!t || `${a.code} ${a.name}`.toLowerCase().includes(t))).slice(0, 400);
  }, [schedule, q, selected]);
  if (!schedule) return null;
  if (!act)
    return (
      <Shell title={kind === "pred" ? "Assign Predecessors" : "Assign Successors"} onClose={close}>
        <p>Select an activity first.</p>
      </Shell>
    );
  const hpd = fieldCtx(schedule).hpd;
  return (
    <Shell
      title={`Assign ${kind === "pred" ? "Predecessors" : "Successors"} – ${act.code}`}
      wide
      onClose={close}
      foot={
        <>
          <label>
            Type{" "}
            <select value={type} onChange={(e) => setType(e.target.value as RelationshipType)}>
              {["FS", "SS", "FF", "SF"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Lag (days) <input type="number" step={0.5} value={lag} onChange={(e) => setLag(e.target.value)} style={{ width: 70 }} />
          </label>
          <span className="spacer" />
          <button
            className="primary"
            disabled={!picked.size}
            onClick={() => {
              const exist = new Set(schedule.relationships.map((r) => `${r.predecessorId}>${r.successorId}`));
              const add = [...picked]
                .map((id) => (kind === "pred" ? { p: id, s: act.id } : { p: act.id, s: id }))
                .filter((x) => !exist.has(`${x.p}>${x.s}`))
                .map((x) => ({ id: uid("rel"), predecessorId: x.p, successorId: x.s, type, lagHours: (Number(lag) || 0) * hpd }));
              commit({ ...schedule, relationships: [...schedule.relationships, ...add] }, `Assign ${add.length} ${kind === "pred" ? "predecessors" : "successors"}`);
              useStore.getState().setStatus(`Assigned ${add.length} ${kind === "pred" ? "predecessor" : "successor"}${add.length === 1 ? "" : "s"} to ${act.code}.`);
              close();
            }}
          >
            Assign ({picked.size})
          </button>
          <button onClick={close}>Close</button>
        </>
      }
    >
      <input autoFocus placeholder="Search Activity ID or name" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="p6-scroll">
        <table className="p6-grid">
          <tbody>
            {hits.map((a) => (
              <tr key={a.id} className={picked.has(a.id) ? "on" : ""} onClick={() => setPicked((p) => (p.has(a.id) ? new Set([...p].filter((x) => x !== a.id)) : new Set([...p, a.id])))}>
                <td>
                  <input type="checkbox" readOnly checked={picked.has(a.id)} />
                </td>
                <td>{a.code}</td>
                <td>{a.name}</td>
                <td>{fmtDate(a.start)}</td>
                <td>{fmtDate(a.finish)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function AssignResDialog() {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const ids = selectedInOrder();
  const [picked, setPicked] = useState<string | null>(null);
  if (!schedule) return null;
  const res = schedule.resources ?? [];
  return (
    <Shell
      title={`Assign Resources – ${ids.length} activit${ids.length === 1 ? "y" : "ies"}`}
      onClose={close}
      foot={
        <>
          <span className="spacer" />
          <button
            className="primary"
            disabled={!picked || !ids.length}
            onClick={() => {
              const r = res.find((x) => x.id === picked)!;
              const byId = new Map(schedule.activities.map((a) => [a.id, a]));
              const add = ids
                .filter((id) => !(schedule.assignments ?? []).some((x) => x.activityId === id && x.resourceId === r.id))
                .map((id) => {
                  const qty = r.type === "material" ? 1 : byId.get(id)?.originalDurationHours ?? 0;
                  return { id: uid("asg"), activityId: id, resourceId: r.id, budgetQty: qty, actualQty: 0, remainingQty: qty, budgetCost: qty * r.pricePerUnit, actualCost: 0, remainingCost: qty * r.pricePerUnit };
                });
              commit({ ...schedule, assignments: [...(schedule.assignments ?? []), ...add] }, `Assign ${r.code}`);
              useStore.getState().setStatus(`Assigned ${r.code} to ${add.length} activities.`);
              close();
            }}
          >
            Assign
          </button>
          <button onClick={close}>Close</button>
        </>
      }
    >
      {res.length ? (
        <div className="p6-scroll">
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Resource ID</td>
                <td>Resource Name</td>
                <td>Type</td>
                <td>Price / Unit</td>
              </tr>
            </thead>
            <tbody>
              {res.map((r) => (
                <tr key={r.id} className={picked === r.id ? "on" : ""} onClick={() => setPicked(r.id)}>
                  <td>{r.code}</td>
                  <td>{r.name}</td>
                  <td>{r.type}</td>
                  <td>
                    {r.pricePerUnit}/{r.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>No resources yet. Add them in the Resources window (Directory bar).</p>
      )}
    </Shell>
  );
}

function AssignCodeDialog() {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const ids = selectedInOrder();
  const all = useMemo(() => (schedule ? allCodeTypes(schedule, sharedGet<CodeType[]>("stratum.activitycodes.v1", [])) : []), [schedule]);
  const types = useMemo(() => new Map(all.map((t) => [t.name, new Set(t.values.map((v) => v.value))])), [all]);
  const [type, setType] = useState([...types.keys()][0] ?? "");
  const [value, setValue] = useState("");
  if (!schedule) return null;
  return (
    <Shell
      title={`Assign Activity Codes – ${ids.length} activit${ids.length === 1 ? "y" : "ies"}`}
      onClose={close}
      foot={
        <>
          <span className="spacer" />
          <button
            className="primary"
            disabled={!type.trim() || !ids.length}
            onClick={() => {
              const set = new Set(ids);
              const t = type.trim();
              // A shared (global / EPS) type used here for the first time is copied into the project.
              const known = (schedule.codeTypes ?? []).some((x) => x.name === t);
              const sharedType = all.find((x) => x.name === t && x.scope && x.scope !== "project");
              commit(
                {
                  ...schedule,
                  ...(!known && sharedType ? { codeTypes: [...(schedule.codeTypes ?? []), sharedType] } : {}),
                  activities: schedule.activities.map((a) => {
                    if (!set.has(a.id)) return a;
                    const codes = { ...a.codes };
                    if (value.trim()) codes[t] = value.trim();
                    else delete codes[t];
                    return { ...a, codes };
                  }),
                },
                `Assign code ${t}`,
              );
              close();
            }}
          >
            Assign
          </button>
          <button onClick={close}>Close</button>
        </>
      }
    >
      <div className="grid2">
        <label>
          Activity Code type
          <input list="p6-code-types" value={type} onChange={(e) => setType(e.target.value)} />
          <datalist id="p6-code-types">
            {[...types.keys()].map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>
        <label>
          Code value (empty removes it)
          <input list="p6-code-vals" value={value} onChange={(e) => setValue(e.target.value)} />
          <datalist id="p6-code-vals">
            {[...(types.get(type) ?? [])].sort().map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </label>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- page setup / print

export interface PageSetup {
  orientation: "landscape" | "portrait";
  size: "A4" | "A3" | "A1" | "Letter" | "Tabloid";
  header: string;
  footer: string;
  showLegend: boolean;
}
const PAGE_KEY = "stratum.p6.page.v1";
export function pageSetup(): PageSetup {
  try {
    return { orientation: "landscape", size: "A3", header: "{project}", footer: "Data date {datadate} · Page {page}", showLegend: true, ...JSON.parse(localStorage.getItem(PAGE_KEY) ?? "{}") };
  } catch {
    return { orientation: "landscape", size: "A3", header: "{project}", footer: "Data date {datadate} · Page {page}", showLegend: true };
  }
}

/** Print the Activities window the way P6 prints the current layout: table and Gantt on landscape pages. */
export function printLayout() {
  const p = pageSetup();
  const s = useStore.getState().schedule;
  const style = document.createElement("style");
  style.id = "p6-print-page";
  style.textContent = `@page { size: ${p.size} ${p.orientation}; margin: 10mm; }`;
  document.getElementById("p6-print-page")?.remove();
  document.head.appendChild(style);
  document.body.dataset.printHeader = (p.header || "").replace("{project}", s ? `${s.projectCode} – ${s.projectName}` : "").replace("{datadate}", fmtDate(s?.dataDate));
  document.body.dataset.printFooter = (p.footer || "").replace("{project}", s ? `${s.projectCode} – ${s.projectName}` : "").replace("{datadate}", fmtDate(s?.dataDate)).replace("{page}", "");
  document.body.classList.add("printing-p6");
  // The table normally draws only the rows on screen; ask it to draw them all, then print.
  window.dispatchEvent(new CustomEvent("stratum:print", { detail: true }));
  setTimeout(() => {
    printPage();
    document.body.classList.remove("printing-p6");
    window.dispatchEvent(new CustomEvent("stratum:print", { detail: false }));
  }, 400);
}

function PageSetupDialog() {
  const [p, setP] = useState(pageSetup());
  const save = () => {
    try {
      localStorage.setItem(PAGE_KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  };
  return (
    <Shell
      title="Page Setup"
      onClose={close}
      foot={
        <>
          <button
            onClick={() => {
              save();
              close();
              printLayout();
            }}
          >
            Print…
          </button>
          <span className="spacer" />
          <button
            className="primary"
            onClick={() => {
              save();
              close();
            }}
          >
            OK
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <div className="grid2">
        <label>
          Orientation
          <select value={p.orientation} onChange={(e) => setP({ ...p, orientation: e.target.value as PageSetup["orientation"] })}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </select>
        </label>
        <label>
          Paper size
          <select value={p.size} onChange={(e) => setP({ ...p, size: e.target.value as PageSetup["size"] })}>
            {["A4", "A3", "A1", "Letter", "Tabloid"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="span2">
          Header <input value={p.header} onChange={(e) => setP({ ...p, header: e.target.value })} />
        </label>
        <label className="span2">
          Footer <input value={p.footer} onChange={(e) => setP({ ...p, footer: e.target.value })} />
        </label>
      </div>
      <p className="muted small">Use {"{project}"} and {"{datadate}"} in the header and footer. Printing uses the current layout; choose “Save as PDF” in the print dialog for a PDF.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- project details, spelling, periods


/** Spell check uses the browser's own dictionary on every activity name shown. */
function SpellingDialog() {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const [names, setNames] = useState<Record<string, string>>({});
  if (!schedule) return null;
  const ids = tableOrder.ids.slice(0, 500);
  const byId = new Map(schedule.activities.map((a) => [a.id, a]));
  const changed = Object.keys(names).filter((id) => names[id] !== byId.get(id)?.name);
  return (
    <Shell
      title="Check Spelling"
      wide
      onClose={close}
      foot={
        <>
          <span className="muted small">Misspelled words are underlined by your system dictionary. Correct them here.</span>
          <span className="spacer" />
          <button
            className="primary"
            disabled={!changed.length}
            onClick={() => {
              commit({ ...schedule, activities: schedule.activities.map((a) => (names[a.id] !== undefined ? { ...a, name: names[a.id] } : a)) }, "Spelling");
              close();
            }}
          >
            Apply {changed.length || ""}
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <div className="p6-scroll">
        {ids.map((id) => (
          <div key={id} className="spell-row">
            <span>{byId.get(id)?.code}</span>
            <input spellCheck lang="en" value={names[id] ?? byId.get(id)?.name ?? ""} onChange={(e) => setNames({ ...names, [id]: e.target.value })} />
          </div>
        ))}
      </div>
      {tableOrder.ids.length > 500 && <p className="muted small">First 500 activities shown; filter the table to check others.</p>}
    </Shell>
  );
}



// ---------------------------------------------------------------- host

export function P6Dialogs({ onSchedule, onAssignFile, displays }: { onSchedule: () => void; onAssignFile: () => void; displays?: ReactNode }) {
  const d = useP6((s) => s.dialog);
  const map: Record<P6Dialog, () => ReactNode> = {
    columns: () => <ColumnsDialog />,
    filters: () => <FiltersDialog />,
    groupSort: () => <GroupSortDialog />,
    bars: () => <BarsDialog />,
    timescale: () => <TimescaleDialog />,
    layouts: () => <LayoutsDialog />,
    globalChange: () => <GlobalChangeDialog />,
    updateProgress: () => <UpdateProgressDialog onSchedule={onSchedule} />,
    baselines: () => (
      <BaselinesDialog
        onAssignFile={() => {
          close();
          onAssignFile();
        }}
      />
    ),
    checkSchedule: () => <CheckScheduleDialog />,
    renumber: () => <RenumberDialog />,
    assignPred: () => <AssignRelDialog kind="pred" />,
    assignSucc: () => <AssignRelDialog kind="succ" />,
    assignRes: () => <AssignResDialog />,
    assignCode: () => <AssignCodeDialog />,
    pageSetup: () => <PageSetupDialog />,
    projectInfo: () => <ProjectDetailsDialog />,
    projectCodes: () => <ProjectCodesDialog />,
    resourceCodes: () => <ResourceCodesDialog />,
    expenseCategories: () => <ExpenseCategoriesDialog />,
    financialPeriods: () => <FinancialPeriodsDialog />,
    buckets: () => <BucketsDialog />,
    topDown: () => <TopDownDialog />,
    registerDetail: () => <RegisterDetailDialog />,
    capacity: () => <CapacityDialog />,
    netBox: () => <NetBoxDialog />,
    activityWizard: () => <NewActivityWizard />,
    documentDetail: () => <DocumentDialog />,
    resourceWizard: () => <NewResourceWizard />,
    spelling: () => <SpellingDialog />,
    level: () => <LevelDialog onSchedule={onSchedule} />,
    scheduleOptions: () => <ScheduleOptionsDialog onSchedule={onSchedule} />,
    scheduleRun: () => <ScheduleRunDialog onSchedule={onSchedule} />,
    calendars: () => <CalendarsDialog />,
    activityCodes: () => <ActivityCodesDialog />,
    udfs: () => <UdfDialog />,
    claimDigger: () => <ClaimDiggerDialog />,
    preferences: () => <PreferencesDialog />,
    scheduleLog: () => <ScheduleLogDialog />,
    excelImport: () => <ExcelImportDialog />,
    roles: () => <RolesDialog />,
    assignRole: () => <AssignRoleDialog />,
    shifts: () => <ShiftsDialog />,
    resourceRates: () => <ResourceRatesDialog />,
    curves: () => <CurvesDialog />,
    costAccounts: () => <CostAccountsDialog />,
    obs: () => <ObsDialog />,
    budgets: () => <BudgetsDialog />,
    riskMatrix: () => <RiskMatrixDialog />,
    eps: () => <EpsDialog />,
    portfolios: () => <PortfoliosDialog />,
    periods: () => <PeriodPerformanceDialog />,
    displays: () => displays ?? null,
  };
  return d ? <>{map[d]()}</> : null;
}
