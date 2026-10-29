// Task Information (Shift+F2): General, Predecessors, Resources, Advanced,
// Notes and Custom Fields, as in MS Project. Edits are held in the dialog and
// applied together on OK, as one undo step.

import { useMemo, useState } from "react";
import { cellCtx, durationTypeOf, editTaskCell, formatMspDuration, mspRows, mspTaskType, projectHpd, rowNumbers, type MspTaskType } from "../../core/msp";
import { uid } from "../../core/ops";
import type { Activity, Assignment, ConstraintType, Relationship, RelationshipType, Schedule } from "../../core/types";
import { useStore } from "../store";
import { commitEdit } from "./actions";
import { MspDlg, Row, dateVal, fromDateVal } from "./MspDlg";
import { useMsp } from "./state";

const CONSTRAINTS: [ConstraintType | "asap", string][] = [
  ["asap", "As Soon As Possible"],
  ["as-late-as-possible", "As Late As Possible"],
  ["finish-on-or-after", "Finish No Earlier Than"],
  ["finish-on-or-before", "Finish No Later Than"],
  ["mandatory-finish", "Must Finish On"],
  ["mandatory-start", "Must Start On"],
  ["start-on-or-after", "Start No Earlier Than"],
  ["start-on-or-before", "Start No Later Than"],
];
const LINK_NAMES: [RelationshipType, string][] = [
  ["FS", "Finish-to-Start (FS)"],
  ["SS", "Start-to-Start (SS)"],
  ["FF", "Finish-to-Finish (FF)"],
  ["SF", "Start-to-Finish (SF)"],
];
const ddmmyyyy = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
};

type PredRow = { key: string; predecessorId: string; type: RelationshipType; lag: string; rel?: Relationship };
type ResRow = { key: string; resourceId: string; units: string; asg?: Assignment };

export function TaskInfoDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const selected = useStore((x) => x.selectedActivity);
  const a0 = s.activities.find((a) => a.id === selected);
  if (!a0) {
    return (
      <MspDlg title="Task Information" onClose={onClose}>
        <p>Select a task in the sheet first. Summary tasks are renamed by typing in the Task Name cell.</p>
      </MspDlg>
    );
  }
  return <TaskInfoBody key={a0.id} s={s} a0={a0} onClose={onClose} />;
}

function TaskInfoBody({ s, a0, onClose }: { s: Schedule; a0: Activity; onClose: () => void }) {
  const hpd = projectHpd(s);
  const startTab = useMsp((m) => m.dialogTab) ?? "general";
  const [tab, setTab] = useState(startTab);
  const [err, setErr] = useState<string | null>(null);
  const rows = useMemo(() => mspRows(s), [s]);
  const nums = useMemo(() => rowNumbers(rows), [rows]);
  const tasks = useMemo(() => rows.filter((r) => r.kind === "activity").map((r) => (r as { activity: Activity }).activity), [rows]);
  const isMs = a0.type === "milestone" || a0.type === "finish-milestone";

  const [name, setName] = useState(a0.name);
  const [dur, setDur] = useState(formatMspDuration(isMs ? 0 : a0.originalDurationHours, hpd));
  const [estimated, setEstimated] = useState(!!a0.estimated);
  const [pct, setPct] = useState(String(Math.round(a0.percentComplete)));
  const [priority, setPriority] = useState(String(a0.priority ?? 500));
  const [mode, setMode] = useState<"auto" | "manual">(a0.taskMode ?? "auto");
  const [inactive, setInactive] = useState(!!a0.inactive);
  const [start, setStart] = useState(dateVal(a0.start));
  const [finish, setFinish] = useState(dateVal(a0.finish));
  const [hideBar, setHideBar] = useState(!!a0.hideBar);
  const [onTimeline, setOnTimeline] = useState(!!a0.onTimeline);
  const [deadline, setDeadline] = useState(dateVal(a0.deadline));
  const [ctype, setCtype] = useState<ConstraintType | "asap">(a0.constraint?.type ?? "asap");
  const [cdate, setCdate] = useState(dateVal(a0.constraint?.date));
  const [ttype, setTtype] = useState<MspTaskType>(mspTaskType(a0));
  const [cal, setCal] = useState(a0.calendarId ?? "");
  const [evm, setEvm] = useState(a0.pctType === "physical" ? "physical" : "pct");
  const [milestone, setMilestone] = useState(isMs);
  const [effort, setEffort] = useState(!!a0.effortDriven);
  const [notes, setNotes] = useState(a0.notes ?? "");
  const [udf, setUdf] = useState<Record<string, string>>({ ...(a0.userFields ?? {}) });
  const [preds, setPreds] = useState<PredRow[]>(() =>
    s.relationships.filter((r) => r.successorId === a0.id).map((r) => ({ key: r.id, predecessorId: r.predecessorId, type: r.type, lag: r.lagHours ? formatMspDuration(r.lagHours, hpd) : "0d", rel: r })),
  );
  const [res, setRes] = useState<ResRow[]>(() => (s.assignments ?? []).filter((x) => x.activityId === a0.id).map((x) => ({ key: x.id, resourceId: x.resourceId, units: `${Math.round((x.units ?? 1) * 100)}%`, asg: x })));

  const ok = () => {
    try {
      const ctx = cellCtx(s, nums.byRow);
      let cur = s;
      if (name !== a0.name) cur = editTaskCell(cur, a0.id, "name", name, ctx);
      const wantMs = milestone;
      const durText = wantMs && !isMs ? "0d" : !wantMs && isMs && /^0(\D|$)/.test(dur.trim()) ? "1d" : dur;
      if (durText !== formatMspDuration(isMs ? 0 : a0.originalDurationHours, hpd) || estimated !== !!a0.estimated) cur = editTaskCell(cur, a0.id, "duration", `${durText.replace(/\?$/, "")}${estimated ? "?" : ""}`, ctx);
      // Mode first, so a typed start on a manual task does not become a constraint.
      cur = { ...cur, activities: cur.activities.map((x) => (x.id === a0.id ? { ...x, taskMode: mode } : x)) };
      if (start && start !== dateVal(a0.start)) cur = editTaskCell(cur, a0.id, "start", ddmmyyyy(Date.parse(start)), ctx);
      if (finish && finish !== dateVal(a0.finish)) cur = editTaskCell(cur, a0.id, "finish", ddmmyyyy(Date.parse(finish)), ctx);
      if (pct !== String(Math.round(a0.percentComplete))) cur = editTaskCell(cur, a0.id, "pct", pct, ctx);
      const p = Math.round(Number(priority));
      if (!Number.isFinite(p) || p < 0 || p > 1000) throw new Error("Priority is a whole number from 0 to 1000.");
      const constraint = ctype === "asap" ? null : { type: ctype, date: ctype === "as-late-as-possible" ? null : fromDateVal(cdate, a0.constraint?.date, 8) };
      if (constraint && constraint.type !== "as-late-as-possible" && constraint.date === null) throw new Error("Enter a date for the constraint.");
      const userFields = Object.fromEntries(Object.entries(udf).filter(([, v]) => v !== ""));
      cur = {
        ...cur,
        activities: cur.activities.map((x) =>
          x.id !== a0.id
            ? x
            : {
                ...x,
                priority: p,
                inactive,
                hideBar,
                onTimeline,
                deadline: fromDateVal(deadline, a0.deadline, 17),
                // A typed Start may have set its own constraint; the Advanced tab wins when it was changed.
                constraint: ctype !== (a0.constraint?.type ?? "asap") || cdate !== dateVal(a0.constraint?.date) ? constraint : x.constraint,
                durationType: durationTypeOf(ttype),
                effortDriven: effort,
                calendarId: cal || null,
                pctType: evm === "physical" ? "physical" : x.pctType === "physical" ? "duration" : x.pctType,
                notes: notes || undefined,
                userFields,
              },
        ),
      };
      // Predecessors
      const seen = new Set<string>();
      const newRels: Relationship[] = [];
      for (const r of preds) {
        if (!r.predecessorId) continue;
        if (r.predecessorId === a0.id) throw new Error("A task cannot be its own predecessor.");
        if (seen.has(r.predecessorId)) throw new Error("A predecessor is listed twice.");
        seen.add(r.predecessorId);
        const neg = r.lag.trim().startsWith("-");
        const lag = r.lag.trim().replace(/^[+-]/, "");
        const parsed = lag === "" || lag === "0" ? { hours: 0 } : parseLag(lag, hpd);
        if (!parsed) throw new Error(`"${r.lag}" is not a lag. Use e.g. 2d or -1w.`);
        newRels.push({ ...(r.rel ?? {}), id: r.rel?.id ?? uid("rel"), predecessorId: r.predecessorId, successorId: a0.id, type: r.type, lagHours: neg ? -parsed.hours : parsed.hours });
      }
      cur = { ...cur, relationships: [...cur.relationships.filter((r) => r.successorId !== a0.id), ...newRels] };
      // Resources
      const a1 = cur.activities.find((x) => x.id === a0.id)!;
      const hours = a1.type === "milestone" || a1.type === "finish-milestone" ? 0 : (a1.originalDurationHours ?? 0);
      const resById = new Map((cur.resources ?? []).map((r) => [r.id, r]));
      const newAsg: Assignment[] = [];
      const seenRes = new Set<string>();
      for (const r of res) {
        if (!r.resourceId || seenRes.has(r.resourceId)) continue;
        seenRes.add(r.resourceId);
        const units = Number(r.units.replace("%", "")) / 100;
        if (!Number.isFinite(units) || units < 0) throw new Error(`"${r.units}" is not a valid Units value.`);
        const rr = resById.get(r.resourceId)!;
        const sameUnits = r.asg && Math.abs((r.asg.units ?? 1) - units) < 1e-9;
        if (r.asg && sameUnits) newAsg.push(r.asg);
        else {
          const qty = rr.type === "material" ? (r.asg?.budgetQty ?? units) : Math.round(units * hours * 100) / 100;
          const actual = r.asg?.actualQty ?? 0;
          newAsg.push({ ...(r.asg ?? { id: uid("asg"), activityId: a0.id, resourceId: r.resourceId, actualCost: 0 }), units, budgetQty: qty, actualQty: actual, remainingQty: Math.max(0, qty - actual), budgetCost: qty * rr.pricePerUnit, remainingCost: Math.max(0, qty - actual) * rr.pricePerUnit } as Assignment);
        }
      }
      cur = { ...cur, assignments: [...(cur.assignments ?? []).filter((x) => x.activityId !== a0.id), ...newAsg] };
      commitEdit(cur, "Task Information");
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const fieldRow = (r: PredRow, i: number) => (
    <tr key={r.key}>
      <td>
        <input
          className="num"
          value={r.predecessorId ? (nums.byId.get(r.predecessorId) ?? "") : ""}
          onChange={(e) => {
            const id = nums.byRow.get(Number(e.target.value));
            setPreds(preds.map((p, k) => (k === i ? { ...p, predecessorId: id && tasks.some((t) => t.id === id) ? id : "" } : p)));
          }}
          aria-label="ID"
        />
      </td>
      <td>
        <select value={r.predecessorId} onChange={(e) => setPreds(preds.map((p, k) => (k === i ? { ...p, predecessorId: e.target.value } : p)))} aria-label="Task Name">
          <option value="">—</option>
          {tasks
            .filter((t) => t.id !== a0.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {nums.byId.get(t.id)} {t.name}
              </option>
            ))}
        </select>
      </td>
      <td>
        <select value={r.type} onChange={(e) => setPreds(preds.map((p, k) => (k === i ? { ...p, type: e.target.value as RelationshipType } : p)))} aria-label="Type">
          {LINK_NAMES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input value={r.lag} onChange={(e) => setPreds(preds.map((p, k) => (k === i ? { ...p, lag: e.target.value } : p)))} aria-label="Lag" />
      </td>
      <td>
        <button className="msp-x" onClick={() => setPreds(preds.filter((_, k) => k !== i))} title="Remove" aria-label="Remove">
          ×
        </button>
      </td>
    </tr>
  );

  const head = (
    <div className="msp-ti-head">
      <Row label="Name:" wide>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Row>
      <Row label="Duration:">
        <span className="msp-inline">
          <input value={dur} onChange={(e) => setDur(e.target.value)} style={{ width: 90 }} disabled={milestone} />
          <label className="rb-check">
            <input type="checkbox" checked={estimated} onChange={(e) => setEstimated(e.target.checked)} /> Estimated
          </label>
        </span>
      </Row>
    </div>
  );

  return (
    <MspDlg
      title="Task Information"
      width={660}
      onClose={onClose}
      onOk={ok}
      tabs={[
        ["general", "General"],
        ["predecessors", "Predecessors"],
        ["resources", "Resources"],
        ["advanced", "Advanced"],
        ["notes", "Notes"],
        ["custom", "Custom Fields"],
      ]}
      tab={tab}
      onTab={setTab}
    >
      {head}
      {err && <div className="msp-err">{err}</div>}
      {tab === "general" && (
        <div className="msp-grid2">
          <Row label="Percent complete:">
            <input value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 70 }} />
          </Row>
          <Row label="Priority:">
            <input value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: 70 }} />
          </Row>
          <div className="msp-fs-inline">
            <span>Schedule Mode:</span>
            <label>
              <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} /> Manually Scheduled
            </label>
            <label>
              <input type="radio" checked={mode === "auto"} onChange={() => setMode("auto")} /> Auto Scheduled
            </label>
          </div>
          <label className="rb-check">
            <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Inactive
          </label>
          <fieldset className="msp-fs">
            <legend>Dates</legend>
            <Row label="Start:">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={a0.status !== "not-started" && mode === "auto"} />
            </Row>
            <Row label="Finish:">
              <input type="date" value={finish} onChange={(e) => setFinish(e.target.value)} disabled={milestone} />
            </Row>
          </fieldset>
          <div className="msp-checks">
            <label className="rb-check">
              <input type="checkbox" checked={hideBar} onChange={(e) => setHideBar(e.target.checked)} /> Hide Bar
            </label>
            <label className="rb-check">
              <input type="checkbox" checked={onTimeline} onChange={(e) => setOnTimeline(e.target.checked)} /> Display on Timeline
            </label>
          </div>
        </div>
      )}
      {tab === "predecessors" && (
        <div className="msp-ti-grid">
          <table className="msp-tbl">
            <thead>
              <tr>
                <th style={{ width: 54 }}>ID</th>
                <th>Task Name</th>
                <th style={{ width: 150 }}>Type</th>
                <th style={{ width: 80 }}>Lag</th>
                <th style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>{preds.map(fieldRow)}</tbody>
          </table>
          <button className="msp-btn" onClick={() => setPreds([...preds, { key: uid("p"), predecessorId: "", type: "FS", lag: "0d" }])}>
            Add predecessor
          </button>
        </div>
      )}
      {tab === "resources" && (
        <div className="msp-ti-grid">
          <table className="msp-tbl">
            <thead>
              <tr>
                <th>Resource Name</th>
                <th style={{ width: 80 }}>Units</th>
                <th style={{ width: 110 }}>Cost</th>
                <th style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>
              {res.map((r, i) => {
                const rr = (s.resources ?? []).find((x) => x.id === r.resourceId);
                const cost = r.asg ? r.asg.actualCost + r.asg.remainingCost : 0;
                return (
                  <tr key={r.key}>
                    <td>
                      <select value={r.resourceId} onChange={(e) => setRes(res.map((x, k) => (k === i ? { ...x, resourceId: e.target.value } : x)))} aria-label="Resource Name">
                        <option value="">—</option>
                        {(s.resources ?? []).map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input value={r.units} onChange={(e) => setRes(res.map((x, k) => (k === i ? { ...x, units: e.target.value } : x)))} aria-label="Units" disabled={rr?.type === "material"} />
                    </td>
                    <td className="num">{cost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td>
                      <button className="msp-x" onClick={() => setRes(res.filter((_, k) => k !== i))} title="Remove" aria-label="Remove">
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button className="msp-btn" onClick={() => setRes([...res, { key: uid("r"), resourceId: "", units: "100%" }])} disabled={!(s.resources ?? []).length}>
            Add resource
          </button>
        </div>
      )}
      {tab === "advanced" && (
        <div className="msp-grid2">
          <fieldset className="msp-fs wide">
            <legend>Constrain task</legend>
            <Row label="Deadline:">
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </Row>
            <Row label="Constraint type:">
              <select value={ctype} onChange={(e) => setCtype(e.target.value as ConstraintType | "asap")}>
                {CONSTRAINTS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="Constraint date:">
              <input type="date" value={cdate} onChange={(e) => setCdate(e.target.value)} disabled={ctype === "asap" || ctype === "as-late-as-possible"} />
            </Row>
          </fieldset>
          <Row label="Task type:">
            <select value={ttype} onChange={(e) => setTtype(e.target.value as MspTaskType)}>
              <option value="fixed-units">Fixed Units</option>
              <option value="fixed-duration">Fixed Duration</option>
              <option value="fixed-work">Fixed Work</option>
            </select>
          </Row>
          <label className="rb-check">
            <input type="checkbox" checked={effort} onChange={(e) => setEffort(e.target.checked)} /> Effort driven
          </label>
          <Row label="Calendar:">
            <select value={cal} onChange={(e) => setCal(e.target.value)}>
              <option value="">None</option>
              {(s.calendars ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Row>
          <Row label="WBS code:">
            <input value={nums.byId.has(a0.id) ? (a0.wbsId ? (s.wbs.find((w) => w.id === a0.wbsId)?.code ?? "") : "") : ""} readOnly />
          </Row>
          <Row label="Earned value method:">
            <select value={evm} onChange={(e) => setEvm(e.target.value)}>
              <option value="pct">% Complete</option>
              <option value="physical">Physical % Complete</option>
            </select>
          </Row>
          <label className="rb-check">
            <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} /> Mark task as milestone
          </label>
        </div>
      )}
      {tab === "notes" && <textarea className="msp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />}
      {tab === "custom" && (
        <div className="msp-ti-grid">
          {!(s.udfDefs ?? []).length ? (
            <p className="muted">No custom fields yet. Add them in Project › Custom Fields.</p>
          ) : (
            <table className="msp-tbl">
              <thead>
                <tr>
                  <th>Custom Field Name</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {(s.udfDefs ?? [])
                  .filter((d) => !d.formula)
                  .map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      <td>
                        <input type={d.type === "date" ? "date" : d.type === "number" || d.type === "cost" ? "number" : "text"} value={udf[d.name] ?? ""} onChange={(e) => setUdf({ ...udf, [d.name]: e.target.value })} aria-label={d.name} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </MspDlg>
  );
}

function parseLag(text: string, hpd: number): { hours: number } | null {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(text.trim());
  if (!m) return null;
  const u = (m[2] || "d").toLowerCase();
  const per = /^h/.test(u) ? 1 : /^w/.test(u) ? hpd * 5 : /^mo/.test(u) ? hpd * 20 : /^m/.test(u) ? 1 / 60 : /^d/.test(u) ? hpd : null;
  return per === null ? null : { hours: Number(m[1]) * per };
}
