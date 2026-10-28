// The Task Form in the Details pane under the Gantt Chart: name, duration,
// mode, dates and % complete at the top, with the task's resources and
// predecessors below, plus Previous / Next to walk the tasks.

import { useEffect, useMemo, useState } from "react";
import { cellCtx, editTaskCell, formatMspDuration, mspRows, mspTaskType, durationTypeOf, projectHpd, rowNumbers, type MspTaskType } from "../../core/msp";
import type { Activity } from "../../core/types";
import { useStore } from "../store";
import { commitEdit } from "./actions";
import { dateVal } from "./MspDlg";

const ddmmyyyy = (v: string) => {
  const [y, m, d] = v.split("-");
  return `${+d}/${+m}/${y}`;
};

export function TaskForm() {
  const s = useStore((x) => x.schedule)!;
  const selected = useStore((x) => x.selectedActivity);
  const rows = useMemo(() => mspRows(s), [s]);
  const nums = useMemo(() => rowNumbers(rows), [rows]);
  const tasks = useMemo(() => rows.filter((r) => r.kind === "activity").map((r) => (r as { activity: Activity }).activity), [rows]);
  const a = s.activities.find((x) => x.id === selected) ?? null;
  const hpd = projectHpd(s);
  const [f, setF] = useState({ name: "", dur: "", start: "", finish: "", pct: "", mode: "auto", ttype: "fixed-units" as MspTaskType });
  useEffect(() => {
    if (!a) return;
    const ms = a.type === "milestone" || a.type === "finish-milestone";
    setF({ name: a.name, dur: formatMspDuration(ms ? 0 : a.originalDurationHours, hpd, a.estimated), start: dateVal(a.start), finish: dateVal(a.finish), pct: String(Math.round(a.percentComplete)), mode: a.taskMode ?? "auto", ttype: mspTaskType(a) });
  }, [a, hpd]);
  const [err, setErr] = useState<string | null>(null);
  if (!a) return <div className="msp-tf empty">Select a task to see it in the Task Form.</div>;
  const step = (d: 1 | -1) => {
    const i = tasks.findIndex((t) => t.id === a.id);
    const n = tasks[i + d];
    if (n) useStore.getState().selectActivity(n.id);
  };
  const ok = () => {
    try {
      const c = cellCtx(s, nums.byRow);
      let cur = { ...s, activities: s.activities.map((x) => (x.id === a.id ? { ...x, taskMode: f.mode as "auto" | "manual", durationType: durationTypeOf(f.ttype) } : x)) };
      const ms = a.type === "milestone" || a.type === "finish-milestone";
      if (f.name !== a.name) cur = editTaskCell(cur, a.id, "name", f.name, c);
      if (f.dur !== formatMspDuration(ms ? 0 : a.originalDurationHours, hpd, a.estimated)) cur = editTaskCell(cur, a.id, "duration", f.dur, c);
      if (f.start && f.start !== dateVal(a.start)) cur = editTaskCell(cur, a.id, "start", ddmmyyyy(f.start), c);
      if (f.finish && f.finish !== dateVal(a.finish)) cur = editTaskCell(cur, a.id, "finish", ddmmyyyy(f.finish), c);
      if (f.pct !== String(Math.round(a.percentComplete))) cur = editTaskCell(cur, a.id, "pct", f.pct, c);
      commitEdit(cur, "Task Form");
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const asg = (s.assignments ?? []).filter((x) => x.activityId === a.id);
  const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
  const preds = s.relationships.filter((r) => r.successorId === a.id);
  const byId = new Map(s.activities.map((x) => [x.id, x]));
  return (
    <div className="msp-tf" onKeyDown={(e) => e.key === "Enter" && !(e.target as HTMLElement).closest("button") && ok()}>
      <div className="msp-tf-top">
        <label>
          Name: <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="wide" />
        </label>
        <label>
          Duration: <input value={f.dur} onChange={(e) => setF({ ...f, dur: e.target.value })} style={{ width: 80 }} />
        </label>
        <span className="msp-tf-mode">
          <label>
            <input type="radio" checked={f.mode === "manual"} onChange={() => setF({ ...f, mode: "manual" })} /> Manually Scheduled
          </label>
          <label>
            <input type="radio" checked={f.mode !== "manual"} onChange={() => setF({ ...f, mode: "auto" })} /> Auto Scheduled
          </label>
        </span>
        <span className="msp-tf-btns">
          <button className="msp-btn" onClick={() => step(-1)}>
            Previous
          </button>
          <button className="msp-btn" onClick={() => step(1)}>
            Next
          </button>
          <button className="msp-btn primary" onClick={ok}>
            OK
          </button>
        </span>
        <label>
          Start: <input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </label>
        <label>
          Finish: <input type="date" value={f.finish} onChange={(e) => setF({ ...f, finish: e.target.value })} />
        </label>
        <label>
          Task type:{" "}
          <select value={f.ttype} onChange={(e) => setF({ ...f, ttype: e.target.value as MspTaskType })}>
            <option value="fixed-units">Fixed Units</option>
            <option value="fixed-duration">Fixed Duration</option>
            <option value="fixed-work">Fixed Work</option>
          </select>
        </label>
        <label>
          % Complete: <input value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} style={{ width: 54 }} />
        </label>
        {err && <span className="msp-err">{err}</span>}
      </div>
      <div className="msp-tf-grids">
        <table className="msp-tbl">
          <thead>
            <tr>
              <th style={{ width: 40 }}>ID</th>
              <th>Resource Name</th>
              <th style={{ width: 64 }}>Units</th>
              <th style={{ width: 80 }}>Work</th>
            </tr>
          </thead>
          <tbody>
            {asg.map((x, i) => (
              <tr key={x.id}>
                <td className="num">{i + 1}</td>
                <td>{res.get(x.resourceId)?.name ?? x.resourceId}</td>
                <td className="num">{Math.round((x.units ?? 1) * 100)}%</td>
                <td className="num">{Math.round((x.actualQty + x.remainingQty) * 100) / 100} hrs</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="msp-tbl">
          <thead>
            <tr>
              <th style={{ width: 40 }}>ID</th>
              <th>Predecessor Name</th>
              <th style={{ width: 44 }}>Type</th>
              <th style={{ width: 70 }}>Lag</th>
            </tr>
          </thead>
          <tbody>
            {preds.map((r) => (
              <tr key={r.id}>
                <td className="num">{nums.byId.get(r.predecessorId) ?? ""}</td>
                <td>{byId.get(r.predecessorId)?.name ?? ""}</td>
                <td>{r.type}</td>
                <td>{formatMspDuration(r.lagHours, hpd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
