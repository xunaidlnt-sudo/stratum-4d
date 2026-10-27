// More P6 dialogs: Schedule Options, Level Resources, Calendars, Activity
// Codes, User Defined Fields and Claim Digger.

import { useMemo, useState } from "react";
import { claimDigger, claimDiggerCsv, type ClaimDiggerReport } from "../../core/compare";
import { DEFAULT_SCHEDULE_OPTIONS } from "../../core/cpm";
import { DEFAULT_LEVELING, levelResources, overloads } from "../../core/level";
import { parseMspdi } from "../../core/mspdi";
import { uid } from "../../core/ops";
import type { Calendar, CodeType, LevelingOptions, Schedule, ScheduleOptions, UdfDef } from "../../core/types";
import { parseXer } from "../../core/xer";
import { fmtDate, useStore } from "../store";
import { close, Shell } from "./Dialogs";

const commit = (s: Schedule, label: string) => useStore.getState().commit(s, label);
const say = (m: string) => useStore.getState().setStatus(m);

// ---------------------------------------------------------------- Schedule Options

export function ScheduleOptionsDialog({ onSchedule }: { onSchedule: () => void }) {
  const schedule = useStore((s) => s.schedule);
  const [o, setO] = useState<ScheduleOptions>({ ...DEFAULT_SCHEDULE_OPTIONS, ...(schedule?.scheduleOptions ?? {}) });
  const [endCode, setEndCode] = useState(() => schedule?.activities.find((a) => a.id === o.floatPaths?.endActivityId)?.code ?? "");
  if (!schedule) return null;
  const hpd = (schedule.calendars?.find((c) => c.id === schedule.defaultCalendarId) ?? schedule.calendars?.[0])?.hoursPerDay ?? 8;
  const save = () => {
    const end = schedule.activities.find((a) => a.code.toLowerCase() === endCode.trim().toLowerCase());
    const next: ScheduleOptions = { ...o, floatPaths: o.floatPaths && end ? { ...o.floatPaths, endActivityId: end.id } : null };
    commit({ ...schedule, scheduleOptions: next }, "Schedule Options");
    return next;
  };
  return (
    <Shell
      title="Schedule Options"
      wide
      onClose={close}
      foot={
        <>
          <button onClick={() => (setO(DEFAULT_SCHEDULE_OPTIONS), setEndCode(""))}>P6 defaults</button>
          <span className="spacer" />
          <button
            className="primary"
            onClick={() => {
              save();
              close();
              onSchedule();
            }}
          >
            Schedule now (F9)
          </button>
          <button
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
      <p className="muted">Saved with the project and used every time you schedule. Data date: {fmtDate(schedule.dataDate)}.</p>
      <div className="grid2">
        <label>
          When scheduling progressed activities use
          <select value={o.outOfSequence} onChange={(e) => setO({ ...o, outOfSequence: e.target.value as ScheduleOptions["outOfSequence"] })}>
            <option value="retained-logic">Retained Logic</option>
            <option value="progress-override">Progress Override</option>
            <option value="actual-dates">Actual Dates</option>
          </select>
        </label>
        <label>
          Compute Total Float as
          <select value={o.floatType} onChange={(e) => setO({ ...o, floatType: e.target.value as ScheduleOptions["floatType"] })}>
            <option value="finish">Finish Float = Late Finish − Early Finish</option>
            <option value="start">Start Float = Late Start − Early Start</option>
            <option value="smallest">Smallest of Start Float and Finish Float</option>
          </select>
        </label>
        <label>
          Define critical activities as
          <select value={o.criticalBy} onChange={(e) => setO({ ...o, criticalBy: e.target.value as ScheduleOptions["criticalBy"] })}>
            <option value="float">Total Float less than or equal to</option>
            <option value="longest-path">Longest Path</option>
          </select>
        </label>
        <label>
          Critical float threshold (days)
          <input type="number" step={0.5} disabled={o.criticalBy !== "float"} value={o.criticalFloatHours / hpd} onChange={(e) => setO({ ...o, criticalFloatHours: (Number(e.target.value) || 0) * hpd })} />
        </label>
        <label>
          Calculate start-to-start lag from
          <select value={o.ssLagFrom} onChange={(e) => setO({ ...o, ssLagFrom: e.target.value as ScheduleOptions["ssLagFrom"] })}>
            <option value="actual-start">Actual Start</option>
            <option value="early-start">Early Start</option>
          </select>
        </label>
        <div className="stack">
          <label className="p6-check">
            <input type="checkbox" checked={o.openEndsCritical} onChange={(e) => setO({ ...o, openEndsCritical: e.target.checked })} /> Make open-ended activities critical
          </label>
          <label className="p6-check">
            <input type="checkbox" checked={o.levelWhenScheduling} onChange={(e) => setO({ ...o, levelWhenScheduling: e.target.checked })} /> Level resources during scheduling
          </label>
          <label className="p6-check">
            <input type="checkbox" checked={!!o.autoSchedule} onChange={(e) => setO({ ...o, autoSchedule: e.target.checked })} /> Schedule automatically when a change affects dates
          </label>
          <label className="p6-check">
            <input type="checkbox" checked={!!o.useExpectedFinish} onChange={(e) => setO({ ...o, useExpectedFinish: e.target.checked })} /> Use Expected Finish dates
          </label>
        </div>
      </div>
      <h4>Multiple float paths</h4>
      <div className="row">
        <label className="p6-check">
          <input type="checkbox" checked={!!o.floatPaths} onChange={(e) => setO({ ...o, floatPaths: e.target.checked ? { endActivityId: null, count: 10 } : null })} /> Calculate multiple float paths
        </label>
        <label>
          Ending activity{" "}
          <input list="p6-end-acts" disabled={!o.floatPaths} value={endCode} onChange={(e) => setEndCode(e.target.value)} placeholder="Activity ID" style={{ width: 130 }} />
          <datalist id="p6-end-acts">
            {schedule.activities
              .filter((a) => a.type === "finish-milestone" || a.longestPath)
              .slice(0, 300)
              .map((a) => (
                <option key={a.id} value={a.code}>
                  {a.name}
                </option>
              ))}
          </datalist>
        </label>
        <label>
          Number of paths{" "}
          <input type="number" min={1} max={50} disabled={!o.floatPaths} value={o.floatPaths?.count ?? 10} onChange={(e) => o.floatPaths && setO({ ...o, floatPaths: { ...o.floatPaths, count: Math.max(1, Number(e.target.value) || 1) } })} style={{ width: 60 }} />
        </label>
      </div>
      <p className="muted small">
        Paths are ranked by the least relationship free float to the ending activity: path 1 drives it. Show the Float Path and Float Path Order columns and group by Float Path to read them. Retained Logic keeps the remaining work of an out-of-sequence activity behind its unfinished predecessors; Progress Override lets it carry on from the data date; Actual Dates keeps only the predecessors that have actually finished.
      </p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Level Resources

export function LevelDialog({ onSchedule }: { onSchedule: () => void }) {
  const schedule = useStore((s) => s.schedule);
  const [o, setO] = useState<LevelingOptions>({ ...DEFAULT_LEVELING, ...(schedule?.levelingOptions ?? {}) });
  const report = useMemo(() => (schedule ? overloads(schedule) : []), [schedule]);
  if (!schedule) return null;
  const res = (schedule.resources ?? []).filter((r) => r.type !== "material");
  const setLimit = (id: string, v: number | undefined) => commit({ ...schedule, resources: (schedule.resources ?? []).map((r) => (r.id === id ? { ...r, maxUnitsPerHour: v } : r)) }, "Resource limit");
  return (
    <Shell
      title="Level Resources"
      wide
      onClose={close}
      foot={
        <>
          <button onClick={onSchedule} title="Remove levelling delays by rescheduling from logic">
            Schedule (undo levelling)
          </button>
          <span className="spacer" />
          <button
            className="primary"
            onClick={() => {
              const r = levelResources({ ...schedule, levelingOptions: o });
              commit({ ...r.schedule, levelingOptions: o }, "Level resources");
              say(`Levelled: ${r.delayed} activities delayed${r.overloaded.length ? `, ${r.overloaded.length} still overloaded` : ""}. Finish ${fmtDate(r.projectFinish)}. ${r.warnings.join(" ")}`);
              close();
            }}
          >
            Level
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <p>Delays activities, in priority order, until no resource is used beyond its limit. Only resources with a max units per hour take part. Schedule (F9) first so the logic dates are up to date.</p>
      <div className="grid2">
        <label>
          Leveling priority
          <select value={o.priority} onChange={(e) => setO({ ...o, priority: e.target.value as LevelingOptions["priority"] })}>
            <option value="late-start">Late Start, then Total Float</option>
            <option value="total-float">Total Float</option>
            <option value="early-start">Early Start</option>
            <option value="activity-id">Activity ID</option>
          </select>
        </label>
        <div className="stack">
          <label className="p6-check">
            <input type="checkbox" checked={o.preserveFinish} onChange={(e) => setO({ ...o, preserveFinish: e.target.checked })} /> Preserve scheduled early and late dates (do not extend the finish)
          </label>
          <label className="p6-check">
            <input type="checkbox" checked={o.levelWithinFloat} onChange={(e) => setO({ ...o, levelWithinFloat: e.target.checked })} /> Level resources only within activity Total Float
          </label>
        </div>
      </div>
      <h4>Resource limits</h4>
      {res.length ? (
        <div className="p6-scroll short">
          <table className="p6-grid">
            <thead>
              <tr>
                <td>Resource</td>
                <td>Max units / hour</td>
                <td>Peak use / day</td>
                <td>Capacity / day</td>
                <td>Overloaded days</td>
              </tr>
            </thead>
            <tbody>
              {res.map((r) => {
                const x = report.find((y) => y.resourceId === r.id);
                return (
                  <tr key={r.id}>
                    <td>
                      {r.code} <span className="muted">{r.name}</span>
                    </td>
                    <td>
                      <input type="number" min={0} step={0.5} value={r.maxUnitsPerHour ?? ""} placeholder="no limit" onChange={(e) => setLimit(r.id, e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))} />
                    </td>
                    <td className="num">{x ? x.peak : ""}</td>
                    <td className="num">{x ? x.capacity : ""}</td>
                    <td className={`num ${x?.days ? "bad" : ""}`}>{x ? x.days : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">No labour or equipment resources in this project.</p>
      )}
      <p className="muted small">A crew of 4 working 8 hours has max 4 units per hour. Leveling Delay shows how far each activity moved.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Calendars

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const spansText = (sp: [number, number][]) => sp.map(([a, b]) => `${hhmm(a)}-${hhmm(b)}`).join(", ");
function parseSpans(t: string): [number, number][] | null {
  if (!t.trim()) return [];
  const out: [number, number][] = [];
  for (const part of t.split(",")) {
    const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]) + Number(m[2] ?? 0) / 60;
    const b = Number(m[3]) + Number(m[4] ?? 0) / 60;
    if (!(b > a && b <= 24)) return null;
    out.push([a, b]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function SpanInput({ spans, onChange }: { spans: [number, number][]; onChange: (s: [number, number][]) => void }) {
  const [t, setT] = useState(spansText(spans));
  const [bad, setBad] = useState(false);
  return (
    <input
      value={t}
      className={bad ? "bad" : ""}
      placeholder="non-working"
      onChange={(e) => {
        setT(e.target.value);
        const p = parseSpans(e.target.value);
        setBad(p === null);
        if (p) onChange(p);
      }}
    />
  );
}

export function CalendarsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [sel, setSel] = useState<string | null>(schedule?.defaultCalendarId ?? schedule?.calendars?.[0]?.id ?? null);
  const [newDate, setNewDate] = useState("");
  const [newWork, setNewWork] = useState({ date: "", spans: "08:00-12:00, 13:00-17:00" });
  if (!schedule) return null;
  const cals = schedule.calendars ?? [];
  const cal = cals.find((c) => c.id === sel) ?? null;
  const used = new Map<string, number>();
  for (const a of schedule.activities) if (a.calendarId) used.set(a.calendarId, (used.get(a.calendarId) ?? 0) + 1);
  const put = (c: Calendar, label = "Edit calendar") => commit({ ...schedule, calendars: cals.map((x) => (x.id === c.id ? c : x)) }, label);
  const add = () => {
    const base = cal ?? cals[0];
    const c: Calendar = base ? { ...structuredClone(base), id: uid("cal"), name: `${base.name} (copy)` } : { id: uid("cal"), name: "New calendar", week: [[], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], [[8, 12], [13, 17]], []], holidays: [], hoursPerDay: 8 };
    commit({ ...schedule, calendars: [...cals, c] }, "Add calendar");
    setSel(c.id);
  };
  return (
    <Shell title="Calendars" wide onClose={close}>
      <div className="p6-cal">
        <div className="p6-list">
          <div className="p6-list-head">Project calendars</div>
          <div className="p6-list-body">
            {cals.map((c) => (
              <button key={c.id} className={sel === c.id ? "on" : ""} onClick={() => setSel(c.id)}>
                {c.name}
                {c.id === schedule.defaultCalendarId ? " (default)" : ""} <span className="muted small">{used.get(c.id) ?? 0} act.</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ padding: 6 }}>
            <button onClick={add}>Add (copy)</button>
            <button disabled={!cal || cal.id === schedule.defaultCalendarId} onClick={() => cal && commit({ ...schedule, defaultCalendarId: cal.id }, "Default calendar")}>
              Set default
            </button>
            <button
              disabled={!cal || cals.length <= 1}
              onClick={() => {
                if (!cal || !window.confirm(`Delete ${cal.name}? Its ${used.get(cal.id) ?? 0} activities move to the default calendar.`)) return;
                const rest = cals.filter((x) => x.id !== cal.id);
                const def = schedule.defaultCalendarId === cal.id ? rest[0].id : schedule.defaultCalendarId;
                commit({ ...schedule, calendars: rest, defaultCalendarId: def, activities: schedule.activities.map((a) => (a.calendarId === cal.id ? { ...a, calendarId: null } : a)) }, "Delete calendar");
                setSel(def ?? null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
        {cal ? (
          <div className="stack" key={cal.id}>
            <div className="grid2">
              <label>
                Calendar name <input value={cal.name} onChange={(e) => put({ ...cal, name: e.target.value }, `Calendar name ${cal.id}`)} />
              </label>
              <label>
                Hours per day (for days ↔ hours)
                <input type="number" min={1} max={24} step={0.5} value={cal.hoursPerDay} onChange={(e) => put({ ...cal, hoursPerDay: Math.max(1, Number(e.target.value) || 8) }, `Calendar hours ${cal.id}`)} />
              </label>
            </div>
            <h4>Standard work week</h4>
            <table className="p6-grid">
              <tbody>
                {DAYS.map((d, i) => (
                  <tr key={d}>
                    <td style={{ width: 110 }}>{d}</td>
                    <td>
                      <SpanInput spans={cal.week[i] ?? []} onChange={(sp) => put({ ...cal, week: cal.week.map((w, k) => (k === i ? sp : w)) }, `Calendar week ${cal.id}`)} />
                    </td>
                    <td className="num" style={{ width: 60 }}>
                      {(cal.week[i] ?? []).reduce((t, [a, b]) => t + b - a, 0)}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Working hours as 08:00-12:00, 13:00-17:00. Leave empty for a non-working day.</p>
            <div className="grid2">
              <div>
                <h4>Holidays (non-work days) · {cal.holidays.length}</h4>
                <div className="row">
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  <button
                    disabled={!newDate}
                    onClick={() => {
                      const t = Date.parse(`${newDate}T00:00:00Z`);
                      if (!cal.holidays.includes(t)) put({ ...cal, holidays: [...cal.holidays, t].sort((x, y) => x - y) }, "Add holiday");
                      setNewDate("");
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="p6-scroll short">
                  {cal.holidays.map((h) => (
                    <div key={h} className="row">
                      <span style={{ width: 110 }}>{fmtDate(h)}</span>
                      <span className="muted small">{DAYS[new Date(h).getUTCDay()]}</span>
                      <button className="link" onClick={() => put({ ...cal, holidays: cal.holidays.filter((x) => x !== h) }, "Remove holiday")}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4>Working exceptions · {(cal.workdays ?? []).length}</h4>
                <div className="row">
                  <input type="date" value={newWork.date} onChange={(e) => setNewWork({ ...newWork, date: e.target.value })} />
                  <input value={newWork.spans} onChange={(e) => setNewWork({ ...newWork, spans: e.target.value })} style={{ width: 170 }} />
                  <button
                    disabled={!newWork.date || !parseSpans(newWork.spans)}
                    onClick={() => {
                      const t = Date.parse(`${newWork.date}T00:00:00Z`);
                      const spans = parseSpans(newWork.spans)!;
                      put({ ...cal, workdays: [...(cal.workdays ?? []).filter((w) => w.date !== t), { date: t, spans }].sort((x, y) => x.date - y.date), holidays: cal.holidays.filter((h) => h !== t) }, "Add work exception");
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="p6-scroll short">
                  {(cal.workdays ?? []).map((w) => (
                    <div key={w.date} className="row">
                      <span style={{ width: 110 }}>{fmtDate(w.date)}</span>
                      <span className="muted small">{spansText(w.spans)}</span>
                      <button className="link" onClick={() => put({ ...cal, workdays: (cal.workdays ?? []).filter((x) => x.date !== w.date) }, "Remove work exception")}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="muted small">Calendar changes take effect when you schedule (F9).</p>
          </div>
        ) : (
          <p className="muted">No calendars. Add one.</p>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Activity Codes

/** Code types: the dictionary plus any code names found on activities. */
function codeTypesOf(s: Schedule): CodeType[] {
  const map = new Map<string, CodeType>((s.codeTypes ?? []).map((t) => [t.name, { name: t.name, values: [...t.values] }]));
  for (const a of s.activities)
    for (const k in a.codes) {
      const t = map.get(k) ?? map.set(k, { name: k, values: [] }).get(k)!;
      if (!t.values.some((v) => v.value === a.codes[k])) t.values.push({ value: a.codes[k] });
    }
  for (const t of map.values()) t.values.sort((x, y) => x.value.localeCompare(y.value, undefined, { numeric: true }));
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

export function ActivityCodesDialog() {
  const schedule = useStore((s) => s.schedule);
  const types = useMemo(() => (schedule ? codeTypesOf(schedule) : []), [schedule]);
  const [sel, setSel] = useState<string | null>(types[0]?.name ?? null);
  const [newType, setNewType] = useState("");
  const [newVal, setNewVal] = useState({ value: "", description: "" });
  if (!schedule) return null;
  const t = types.find((x) => x.name === sel) ?? null;
  const count = (name: string, value?: string) => schedule.activities.filter((a) => (value === undefined ? a.codes[name] !== undefined : a.codes[name] === value)).length;
  const save = (next: CodeType[], acts = schedule.activities, label = "Activity codes") => commit({ ...schedule, codeTypes: next, activities: acts }, label);
  const renameType = (from: string, to: string) => {
    if (!to.trim() || types.some((x) => x.name === to)) return;
    save(
      types.map((x) => (x.name === from ? { ...x, name: to } : x)),
      schedule.activities.map((a) => {
        if (a.codes[from] === undefined) return a;
        const codes = { ...a.codes, [to]: a.codes[from] };
        delete codes[from];
        return { ...a, codes };
      }),
      "Rename code type",
    );
    setSel(to);
  };
  const renameValue = (type: string, from: string, to: string) =>
    save(
      types.map((x) => (x.name === type ? { ...x, values: x.values.map((v) => (v.value === from ? { ...v, value: to } : v)) } : x)),
      schedule.activities.map((a) => (a.codes[type] === from ? { ...a, codes: { ...a.codes, [type]: to } } : a)),
      `Code value ${type}`,
    );
  return (
    <Shell title="Activity Codes" wide onClose={close}>
      <div className="p6-cal">
        <div className="p6-list">
          <div className="p6-list-head">Code types</div>
          <div className="p6-list-body">
            {types.map((x) => (
              <button key={x.name} className={sel === x.name ? "on" : ""} onClick={() => setSel(x.name)}>
                {x.name} <span className="muted small">{x.values.length} values</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ padding: 6 }}>
            <input placeholder="New code type" value={newType} onChange={(e) => setNewType(e.target.value)} style={{ width: 130 }} />
            <button
              disabled={!newType.trim() || types.some((x) => x.name === newType.trim())}
              onClick={() => {
                save([...types, { name: newType.trim(), values: [] }]);
                setSel(newType.trim());
                setNewType("");
              }}
            >
              Add
            </button>
          </div>
        </div>
        {t ? (
          <div className="stack" key={t.name}>
            <div className="row">
              <label>
                Code type name <input defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && renameType(t.name, e.target.value.trim())} />
              </label>
              <span className="spacer" />
              <button
                onClick={() =>
                  window.confirm(`Delete code type ${t.name}? It is assigned to ${count(t.name)} activities.`) &&
                  save(
                    types.filter((x) => x.name !== t.name),
                    schedule.activities.map((a) => {
                      if (a.codes[t.name] === undefined) return a;
                      const codes = { ...a.codes };
                      delete codes[t.name];
                      return { ...a, codes };
                    }),
                    "Delete code type",
                  )
                }
              >
                Delete type
              </button>
            </div>
            <table className="p6-grid">
              <thead>
                <tr>
                  <td>Code value</td>
                  <td>Description</td>
                  <td>Color</td>
                  <td>Activities</td>
                  <td />
                </tr>
              </thead>
              <tbody>
                {t.values.map((v) => (
                  <tr key={v.value}>
                    <td>
                      <input className="cell" defaultValue={v.value} onBlur={(e) => e.target.value.trim() && e.target.value !== v.value && renameValue(t.name, v.value, e.target.value.trim())} />
                    </td>
                    <td>
                      <input className="cell" value={v.description ?? ""} onChange={(e) => save(types.map((x) => (x.name === t.name ? { ...x, values: x.values.map((y) => (y.value === v.value ? { ...y, description: e.target.value } : y)) } : x)), schedule.activities, `Code desc ${t.name}`)} />
                    </td>
                    <td>
                      <input type="color" value={v.color ?? "#cccccc"} onChange={(e) => save(types.map((x) => (x.name === t.name ? { ...x, values: x.values.map((y) => (y.value === v.value ? { ...y, color: e.target.value } : y)) } : x)), schedule.activities, `Code color ${t.name}`)} />
                    </td>
                    <td className="num">{count(t.name, v.value)}</td>
                    <td>
                      <button
                        className="link"
                        onClick={() =>
                          save(
                            types.map((x) => (x.name === t.name ? { ...x, values: x.values.filter((y) => y.value !== v.value) } : x)),
                            schedule.activities.map((a) => {
                              if (a.codes[t.name] !== v.value) return a;
                              const codes = { ...a.codes };
                              delete codes[t.name];
                              return { ...a, codes };
                            }),
                            "Delete code value",
                          )
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <input placeholder="Code value" value={newVal.value} onChange={(e) => setNewVal({ ...newVal, value: e.target.value })} style={{ width: 120 }} />
              <input placeholder="Description" value={newVal.description} onChange={(e) => setNewVal({ ...newVal, description: e.target.value })} />
              <button
                disabled={!newVal.value.trim() || t.values.some((v) => v.value === newVal.value.trim())}
                onClick={() => {
                  save(types.map((x) => (x.name === t.name ? { ...x, values: [...x.values, { value: newVal.value.trim(), description: newVal.description || undefined }] } : x)));
                  setNewVal({ value: "", description: "" });
                }}
              >
                Add value
              </button>
            </div>
            <p className="muted small">Assign codes from Edit → Assign Activity Codes, the Codes tab, or a code column in the table. Group by a code in Group and Sort.</p>
          </div>
        ) : (
          <p className="muted">No activity codes yet. Add a code type such as Area, Discipline or Phase.</p>
        )}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- User Defined Fields

export function UdfDialog() {
  const schedule = useStore((s) => s.schedule);
  const [name, setName] = useState("");
  const [type, setType] = useState<UdfDef["type"]>("text");
  if (!schedule) return null;
  const defs = new Map((schedule.udfDefs ?? []).map((d) => [d.name, d]));
  for (const a of schedule.activities) for (const k in a.userFields ?? {}) if (!defs.has(k)) defs.set(k, { name: k, type: "text" });
  const list = [...defs.values()].sort((x, y) => x.name.localeCompare(y.name));
  const used = (n: string) => schedule.activities.filter((a) => a.userFields?.[n] !== undefined && a.userFields[n] !== "").length;
  return (
    <Shell title="User Defined Fields – Activities" onClose={close}>
      <table className="p6-grid">
        <thead>
          <tr>
            <td>Title</td>
            <td>Data type</td>
            <td>Activities with a value</td>
            <td />
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={d.name}>
              <td>{d.name}</td>
              <td>
                <select value={d.type} onChange={(e) => commit({ ...schedule, udfDefs: list.map((x) => (x.name === d.name ? { ...x, type: e.target.value as UdfDef["type"] } : x)) }, "UDF type")}>
                  {["text", "number", "date", "cost", "indicator"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </td>
              <td className="num">{used(d.name)}</td>
              <td>
                <button
                  className="link"
                  onClick={() =>
                    window.confirm(`Delete ${d.name} and its values on ${used(d.name)} activities?`) &&
                    commit(
                      {
                        ...schedule,
                        udfDefs: list.filter((x) => x.name !== d.name),
                        activities: schedule.activities.map((a) => {
                          if (a.userFields?.[d.name] === undefined) return a;
                          const userFields = { ...a.userFields };
                          delete userFields[d.name];
                          return { ...a, userFields };
                        }),
                      },
                      "Delete UDF",
                    )
                  }
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <input placeholder="New field title" value={name} onChange={(e) => setName(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value as UdfDef["type"])}>
          {["text", "number", "date", "cost", "indicator"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button
          disabled={!name.trim() || defs.has(name.trim())}
          onClick={() => {
            commit({ ...schedule, udfDefs: [...list, { name: name.trim(), type }] }, "Add UDF");
            setName("");
          }}
        >
          Add
        </button>
      </div>
      <p className="muted small">New fields appear in Columns, Filters, Group and Sort and Global Change under User Defined Fields.</p>
    </Shell>
  );
}

// ---------------------------------------------------------------- Claim Digger

export function ClaimDiggerDialog() {
  const schedule = useStore((s) => s.schedule);
  const [report, setReport] = useState<ClaimDiggerReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"changed" | "added" | "deleted" | "rels">("changed");
  if (!schedule) return null;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setErr("");
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      if (text.includes("�")) text = new TextDecoder("windows-1252").decode(buf);
      const base = /\.xml$/i.test(f.name) ? parseMspdi(text) : parseXer(text);
      setReport(claimDigger(base, schedule));
    } catch (e) {
      setErr(`Could not read ${f.name}: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  const fromStored = (id: string) => {
    const b = schedule.baselines?.find((x) => x.id === id);
    if (!b) return;
    const base: Schedule = {
      ...schedule,
      projectCode: b.name,
      dataDate: b.dataDate,
      activities: schedule.activities.filter((a) => b.dates[a.code]).map((a) => ({ ...a, start: b.dates[a.code][0], finish: b.dates[a.code][1] })),
    };
    setReport(claimDigger(base, schedule));
  };
  const download = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([claimDiggerCsv(report)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `claim-digger-${schedule.projectCode}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Shell
      title="Claim Digger – Schedule Comparison"
      wide
      onClose={close}
      foot={
        <>
          <button disabled={!report} onClick={download}>
            Export CSV (Excel)
          </button>
          <span className="spacer" />
          <button onClick={close}>Close</button>
        </>
      }
    >
      <p>Compares the open project with an earlier version, field by field: activities added, deleted and changed (names, durations, dates, status, constraints, calendars, float) and relationships added, deleted or changed.</p>
      <div className="row">
        <label className="p6-drop">
          Compare with a file (XER / XML)
          <input type="file" accept=".xer,.xml" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {(schedule.baselines ?? []).length > 0 && (
          <label>
            or a stored baseline{" "}
            <select value="" onChange={(e) => e.target.value && fromStored(e.target.value)}>
              <option value="">Choose…</option>
              {schedule.baselines!.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {busy && <span className="muted">Reading…</span>}
      </div>
      {err && <p className="bad">{err}</p>}
      {report && (
        <>
          <table className="p6-grid">
            <tbody>
              <tr>
                <td>Base</td>
                <td>{report.base.code}</td>
                <td>DD {fmtDate(report.base.dataDate)}</td>
                <td>Finish {fmtDate(report.base.finish)}</td>
                <td>{report.base.activities} activities</td>
              </tr>
              <tr>
                <td>Current</td>
                <td>{report.current.code}</td>
                <td>DD {fmtDate(report.current.dataDate)}</td>
                <td>
                  Finish {fmtDate(report.current.finish)}{" "}
                  {report.finishShiftDays ? <b className={report.finishShiftDays > 0 ? "bad" : "good"}>({report.finishShiftDays > 0 ? "+" : ""}{report.finishShiftDays}d)</b> : null}
                </td>
                <td>{report.current.activities} activities</td>
              </tr>
            </tbody>
          </table>
          <div className="p6-tabs">
            {(
              [
                ["changed", `Changed (${report.changed.length})`],
                ["added", `Added (${report.added.length})`],
                ["deleted", `Deleted (${report.deleted.length})`],
                ["rels", `Relationships (${report.relationships.length})`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="p6-scroll">
            <table className="p6-grid">
              <tbody>
                {tab === "changed" &&
                  report.changed.slice(0, 1500).flatMap((a) =>
                    a.changes.map((c, i) => (
                      <tr key={`${a.code}${c.field}`}>
                        <td>{i === 0 ? <b>{a.code}</b> : ""}</td>
                        <td className="muted">{i === 0 ? a.name : ""}</td>
                        <td>{c.field}</td>
                        <td>{c.before}</td>
                        <td>
                          <b>{c.after}</b>
                        </td>
                      </tr>
                    )),
                  )}
                {(tab === "added" ? report.added : tab === "deleted" ? report.deleted : []).slice(0, 2000).map((a) => (
                  <tr key={a.code}>
                    <td>{a.code}</td>
                    <td>{a.name}</td>
                  </tr>
                ))}
                {tab === "rels" &&
                  report.relationships.slice(0, 2000).map((r) => (
                    <tr key={`${r.pred}>${r.succ}`}>
                      <td>{r.kind}</td>
                      <td>
                        {r.pred} → {r.succ}
                      </td>
                      <td>{r.before}</td>
                      <td>
                        <b>{r.after}</b>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Shell>
  );
}
