// Recurring Task Information and Custom Fields dialogs of the MS Project layout.

import { useState } from "react";
import { WEEKDAYS } from "../../core/dates";
import { insertRecurring, parseMspDuration, projectHpd } from "../../core/msp";
import type { UdfDef } from "../../core/types";
import { useStore } from "../store";
import { commitEdit, selectedRows } from "./actions";
import { Fieldset, MspDlg, Row, dateVal, fromDateVal } from "./MspDlg";
import { BAR_DEFAULTS, useMsp, type BarKind, type CustomFilter } from "./state";
import { FIELDS, udfField } from "./sheet";

export function RecurringDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const [name, setName] = useState("Progress meeting");
  const [dur, setDur] = useState("1h");
  const [pattern, setPattern] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [every, setEvery] = useState("1");
  const [days, setDays] = useState<number[]>([1]);
  const [dom, setDom] = useState("1");
  const [start, setStart] = useState(dateVal(s.dataDate ?? Date.now()));
  const [endKind, setEndKind] = useState<"count" | "date">("count");
  const [count, setCount] = useState("10");
  const [end, setEnd] = useState(dateVal((s.dataDate ?? Date.now()) + 90 * 86_400_000));
  const [err, setErr] = useState<string | null>(null);
  const ok = () => {
    const d = parseMspDuration(dur, projectHpd(s));
    if (!d) return setErr(`"${dur}" is not a duration.`);
    const t0 = fromDateVal(start, null, 0);
    if (t0 === null) return setErr("Enter a start date.");
    const sel = selectedRows()[0];
    const parent = s.activities.find((a) => a.id === sel)?.wbsId ?? s.wbs.find((w) => w.id === sel)?.parentId ?? null;
    const r = insertRecurring(s, {
      name: name.trim() || "Recurring task",
      hours: d.hours,
      pattern,
      every: Math.max(1, Number(every) || 1),
      weekdays: days,
      dayOfMonth: Math.max(1, Math.min(31, Number(dom) || 1)),
      start: t0,
      ...(endKind === "count" ? { count: Math.max(1, Number(count) || 1) } : { end: fromDateVal(end, null, 23) ?? t0 }),
      parentWbsId: parent,
    });
    if (!r.added) return setErr("No occurrences fall in that range.");
    commitEdit(r.schedule, "Recurring task");
    useStore.getState().setStatus(`Added ${r.added} occurrences of '${name}' under a recurring summary task.`);
    onClose();
  };
  return (
    <MspDlg title="Recurring Task Information" width={560} onClose={onClose} onOk={ok}>
      {err && <div className="msp-err">{err}</div>}
      <div className="msp-grid2">
        <Row label="Task Name:">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Row>
        <Row label="Duration:">
          <input value={dur} onChange={(e) => setDur(e.target.value)} style={{ width: 90 }} />
        </Row>
      </div>
      <Fieldset legend="Recurrence pattern">
        <div className="msp-recur">
          <div className="msp-radios">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <label key={p}>
                <input type="radio" checked={pattern === p} onChange={() => setPattern(p)} /> {p[0].toUpperCase() + p.slice(1)}
              </label>
            ))}
          </div>
          <div className="msp-radios">
            <span className="msp-inline">
              Recur every <input value={every} onChange={(e) => setEvery(e.target.value)} style={{ width: 44 }} aria-label="Every" /> {pattern === "daily" ? "day(s)" : pattern === "weekly" ? "week(s) on:" : "month(s)"}
            </span>
            {pattern === "weekly" && (
              <span className="msp-inline">
                {WEEKDAYS.map((w, i) => (
                  <label key={w}>
                    <input type="checkbox" checked={days.includes(i)} onChange={(e) => setDays(e.target.checked ? [...days, i] : days.filter((x) => x !== i))} /> {w}
                  </label>
                ))}
              </span>
            )}
            {pattern === "monthly" && (
              <span className="msp-inline">
                Day <input value={dom} onChange={(e) => setDom(e.target.value)} style={{ width: 44 }} aria-label="Day of month" /> of the month
              </span>
            )}
          </div>
        </div>
      </Fieldset>
      <Fieldset legend="Range of recurrence">
        <div className="msp-grid2">
          <Row label="Start:">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Row>
          <div className="msp-radios">
            <label className="msp-inline">
              <input type="radio" checked={endKind === "count"} onChange={() => setEndKind("count")} /> End after: <input value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 50 }} aria-label="Occurrences" /> occurrences
            </label>
            <label className="msp-inline">
              <input type="radio" checked={endKind === "date"} onChange={() => setEndKind("date")} /> End by: <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="End by" />
            </label>
          </div>
        </div>
      </Fieldset>
    </MspDlg>
  );
}

const TYPES: [UdfDef["type"], string][] = [
  ["text", "Text"],
  ["number", "Number"],
  ["cost", "Cost"],
  ["date", "Date"],
  ["indicator", "Flag / Indicator"],
];

export function CustomFieldsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const [defs, setDefs] = useState<UdfDef[]>(() => (s.udfDefs ?? []).map((d) => ({ ...d })));
  const [sel, setSel] = useState(0);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<UdfDef["type"]>("text");
  const d = defs[sel];
  const ok = () => {
    const before = new Map((s.udfDefs ?? []).map((x, i) => [i, x.name]));
    // Renames carry the values across.
    const renames = new Map<string, string>();
    defs.forEach((x, i) => {
      const old = (s.udfDefs ?? [])[i]?.name;
      if (old && old !== x.name && before.get(i) === old) renames.set(old, x.name);
    });
    const keep = new Set(defs.map((x) => x.name));
    const activities = s.activities.map((a) => {
      if (!a.userFields) return a;
      const f: Record<string, string> = {};
      for (const [k, v] of Object.entries(a.userFields)) {
        const k2 = renames.get(k) ?? k;
        if (keep.has(k2) || !(s.udfDefs ?? []).some((x) => x.name === k)) f[k2] = v;
      }
      return { ...a, userFields: f };
    });
    commitEdit({ ...s, udfDefs: defs, activities }, "Custom Fields");
    // Show new fields as columns of the current table.
    const m = useMsp.getState();
    const added = defs.filter((x) => !(s.udfDefs ?? []).some((y) => y.name === x.name)).map((x) => `udf:${x.name}`);
    if (added.length) m.set({ extraCols: { ...m.extraCols, [m.table]: [...(m.extraCols[m.table] ?? []), ...added] } });
    onClose();
  };
  return (
    <MspDlg title="Custom Fields" width={620} onClose={onClose} onOk={ok}>
      <p className="msp-note">Task fields. New fields are added to the current table; type values straight into their column or in Task Information › Custom Fields.</p>
      <div className="msp-cf">
        <div className="msp-ti-grid">
          <table className="msp-tbl selectable">
            <thead>
              <tr>
                <th>Field</th>
                <th style={{ width: 120 }}>Type</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((x, i) => (
                <tr key={i} className={sel === i ? "on" : ""} onClick={() => setSel(i)}>
                  <td>{x.name}</td>
                  <td>{TYPES.find(([k]) => k === x.type)?.[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="msp-radios">
          {d ? (
            <>
              <Row label="Rename:">
                <input value={d.name} onChange={(e) => setDefs(defs.map((x, i) => (i === sel ? { ...x, name: e.target.value } : x)))} />
              </Row>
              {(d.type === "number" || d.type === "cost") && (
                <Row label="Formula:">
                  <input value={d.formula ?? ""} placeholder="e.g. [Total Float] * 2" onChange={(e) => setDefs(defs.map((x, i) => (i === sel ? { ...x, formula: e.target.value || undefined } : x)))} />
                </Row>
              )}
              <button className="msp-btn" onClick={() => (setDefs(defs.filter((_, i) => i !== sel)), setSel(0))}>
                Delete Field
              </button>
            </>
          ) : (
            <p className="muted">No custom fields yet.</p>
          )}
          <Fieldset legend="New field">
            <Row label="Name:">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Row>
            <Row label="Type:">
              <select value={newType} onChange={(e) => setNewType(e.target.value as UdfDef["type"])}>
                {TYPES.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Row>
            <button
              className="msp-btn"
              disabled={!newName.trim() || defs.some((x) => x.name === newName.trim())}
              onClick={() => {
                setDefs([...defs, { name: newName.trim(), type: newType }]);
                setSel(defs.length);
                setNewName("");
              }}
            >
              Add
            </button>
          </Fieldset>
        </div>
      </div>
    </MspDlg>
  );
}

const TESTS: [CustomFilter["rows"][number]["test"], string][] = [
  ["eq", "equals"],
  ["ne", "does not equal"],
  ["gt", "is greater than"],
  ["ge", "is greater than or equal to"],
  ["lt", "is less than"],
  ["le", "is less than or equal to"],
  ["within", "is within"],
  ["contains", "contains"],
  ["not-contains", "does not contain"],
];

/** Filter Definition (More Filters › New / Edit): rows of And/Or, field, test and value. */
export function FilterEditDialog({ onClose }: { onClose: () => void }) {
  const m = useMsp();
  const s = useStore((x) => x.schedule);
  const editing = m.customFilters.find((f) => f.name === m.dialogTab);
  const [name, setName] = useState(editing?.name ?? `Filter ${m.customFilters.length + 1}`);
  const [rows, setRows] = useState<CustomFilter["rows"]>(editing?.rows.map((r) => ({ ...r })) ?? [{ join: "and", field: "name", test: "contains", value: "" }]);
  const fields = [...FIELDS.filter((f) => f.key !== "ind" && f.key !== "mode"), ...(s?.udfDefs ?? []).map((d) => udfField(d.name))];
  const save = (apply: boolean) => {
    const f: CustomFilter = { name: name.trim() || "Filter", rows: rows.filter((r) => r.field) };
    const list = [...m.customFilters.filter((x) => x.name !== editing?.name && x.name !== f.name), f];
    m.set({ customFilters: list, ...(apply ? { customFilter: f.name, filter: "all" } : {}) });
    onClose();
  };
  const put = (i: number, patch: Partial<CustomFilter["rows"][number]>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  return (
    <MspDlg
      title={`Filter Definition in '${s?.projectCode ?? "Project"}'`}
      width={760}
      onClose={onClose}
      onOk={() => save(false)}
      okLabel="Save"
      extra={
        <>
          {editing && (
            <button className="msp-btn" onClick={() => (m.set({ customFilters: m.customFilters.filter((x) => x.name !== editing.name), customFilter: m.customFilter === editing.name ? null : m.customFilter }), onClose())}>
              Delete
            </button>
          )}
          <button className="msp-btn" onClick={() => save(true)}>
            Apply
          </button>
        </>
      }
    >
      <Row label="Name:">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Row>
      <div className="msp-ti-grid tall">
        <table className="msp-tbl">
          <thead>
            <tr>
              <th style={{ width: 70 }}>And/Or</th>
              <th>Field Name</th>
              <th style={{ width: 170 }}>Test</th>
              <th>Value(s)</th>
              <th style={{ width: 24 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  {i > 0 && (
                    <select value={r.join} onChange={(e) => put(i, { join: e.target.value as "and" | "or" })} aria-label="And/Or">
                      <option value="and">And</option>
                      <option value="or">Or</option>
                    </select>
                  )}
                </td>
                <td>
                  <select value={r.field} onChange={(e) => put(i, { field: e.target.value })} aria-label="Field Name">
                    {fields.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.key === "name" ? "Name" : f.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={r.test} onChange={(e) => put(i, { test: e.target.value as CustomFilter["rows"][number]["test"] })} aria-label="Test">
                    {TESTS.map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className="msp-inline" style={{ flexWrap: "nowrap" }}>
                    <input value={r.value} onChange={(e) => put(i, { value: e.target.value })} placeholder={r.test === "within" ? "from" : "e.g. 10 days, 01/03/27, Crew"} aria-label="Value" />
                    {r.test === "within" && <input value={r.value2 ?? ""} onChange={(e) => put(i, { value2: e.target.value })} placeholder="to" aria-label="Value 2" />}
                  </span>
                </td>
                <td>
                  <button className="msp-x" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Delete row">
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="msp-btn" onClick={() => setRows([...rows, { join: "and", field: "start", test: "gt", value: "" }])}>
          Add row
        </button>
      </div>
      <p className="msp-note">Dates as dd/mm/yy; durations as e.g. 10 days. And is evaluated before Or.</p>
    </MspDlg>
  );
}

const BAR_NAMES: [BarKind, string][] = [
  ["task", "Task"],
  ["critical", "Critical task"],
  ["manual", "Manual task"],
  ["progress", "Progress"],
  ["summary", "Summary"],
  ["milestone", "Milestone"],
  ["baseline", "Baseline"],
  ["slack", "Total slack"],
  ["link", "Link lines"],
];

/** Format › Bar Styles and Text Styles: colours by bar type and the sheet text size. */
export function BarStylesDialog({ onClose }: { onClose: () => void }) {
  const m = useMsp();
  const [tab, setTab] = useState(m.dialogTab ?? "bars");
  const [colors, setColors] = useState<Partial<Record<BarKind, string>>>({ ...(m.format.colors ?? {}) });
  const [size, setSize] = useState(m.format.fontSize ?? 12);
  return (
    <MspDlg
      title={tab === "bars" ? "Bar Styles" : "Text Styles"}
      width={480}
      onClose={onClose}
      onOk={() => {
        m.setFormat({ colors, fontSize: size === 12 ? undefined : size });
        onClose();
      }}
      tabs={[
        ["bars", "Bar Styles"],
        ["text", "Text Styles"],
      ]}
      tab={tab}
      onTab={setTab}
      extra={
        <button className="msp-btn" onClick={() => (tab === "bars" ? setColors({}) : setSize(12))}>
          Reset
        </button>
      }
    >
      {tab === "bars" ? (
        <table className="msp-tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 80 }}>Colour</th>
            </tr>
          </thead>
          <tbody>
            {BAR_NAMES.map(([k, l]) => (
              <tr key={k}>
                <td>{l}</td>
                <td>
                  <input type="color" className="msp-swatch" value={colors[k] ?? BAR_DEFAULTS[k]} onChange={(e) => setColors({ ...colors, [k]: e.target.value })} aria-label={`${l} colour`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Row label="Size (all text):">
          <select value={size} onChange={(e) => setSize(Number(e.target.value))}>
            {[10, 11, 12, 13, 14, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Row>
      )}
    </MspDlg>
  );
}
