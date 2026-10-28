// Project-level dialogs of the MS Project layout: Project Information and
// Statistics, Set / Clear Baseline, Update Project, Move Project, Options,
// Resource Leveling, Zoom, Sort, Date Range filter and Assign Resources.

import { useMemo, useState } from "react";
import { levelResources } from "../../core/level";
import { projectStatistics, setResourceNames, projectHpd } from "../../core/msp";
import type { Schedule } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { clearBaseline, commitEdit, moveProject, selectedTasks, setBaseline, updateProject } from "./actions";
import { Fieldset, MspDlg, Row, dateVal, fromDateVal } from "./MspDlg";
import { mspDateText, SORT_NAMES } from "./sheet";
import { useMsp, type MspSort } from "./state";

const st = () => useStore.getState();

export function ProjectInfoDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const stats = useMemo(() => projectStatistics(s), [s]);
  const [from, setFrom] = useState<"start" | "finish">(s.scheduleFrom ?? "start");
  const [start, setStart] = useState(dateVal(s.plannedStart ?? stats.current.start));
  const [finish, setFinish] = useState(dateVal(s.mustFinishBy ?? stats.current.finish));
  const [status, setStatus] = useState(dateVal(s.dataDate));
  const [cal, setCal] = useState(s.defaultCalendarId ?? s.calendars?.[0]?.id ?? "");
  const [priority, setPriority] = useState(String(s.strategicPriority ?? 500));
  const [title, setTitle] = useState(s.projectName);
  const ok = () => {
    const next: Schedule = {
      ...s,
      projectName: title.trim() || s.projectName,
      scheduleFrom: from,
      plannedStart: from === "start" ? fromDateVal(start, s.plannedStart, 8) : s.plannedStart,
      mustFinishBy: from === "finish" ? fromDateVal(finish, s.mustFinishBy, 17) : (s.mustFinishBy ?? null),
      dataDate: fromDateVal(status, s.dataDate, 0) ?? s.dataDate,
      defaultCalendarId: cal || s.defaultCalendarId,
      strategicPriority: Math.max(0, Math.min(1000, Math.round(Number(priority) || 500))),
    };
    commitEdit(next, "Project Information");
    onClose();
  };
  return (
    <MspDlg title={`Project Information for '${s.projectCode}'`} width={620} onClose={onClose} onOk={ok} extra={<button className="msp-btn" onClick={() => useMsp.getState().open("statistics")}>Statistics…</button>}>
      <div className="msp-grid2">
        <Row label="Title:" wide>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Row>
        <Row label="Start date:">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={from === "finish"} />
        </Row>
        <Row label="Current date:">
          <input type="date" value={dateVal(Date.now())} readOnly />
        </Row>
        <Row label="Finish date:">
          <input type="date" value={finish} onChange={(e) => setFinish(e.target.value)} disabled={from === "start"} />
        </Row>
        <Row label="Status date:">
          <input type="date" value={status} onChange={(e) => setStatus(e.target.value)} />
        </Row>
        <Row label="Schedule from:">
          <select value={from} onChange={(e) => setFrom(e.target.value as "start" | "finish")}>
            <option value="start">Project Start Date</option>
            <option value="finish">Project Finish Date</option>
          </select>
        </Row>
        <Row label="Calendar:">
          <select value={cal} onChange={(e) => setCal(e.target.value)}>
            {(s.calendars ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Row>
        <p className="msp-note wide">{from === "start" ? "All tasks begin as soon as possible." : "All tasks begin as late as possible."}</p>
        <Row label="Priority:">
          <input value={priority} onChange={(e) => setPriority(e.target.value)} style={{ width: 70 }} />
        </Row>
      </div>
    </MspDlg>
  );
}

export function StatisticsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const t = useMemo(() => projectStatistics(s), [s]);
  const cur = s.projectSettings?.currency ?? "";
  const money = (v: number) => `${cur}${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const d = (v: number | null) => (v === null ? "NA" : `${v} days`);
  return (
    <MspDlg title={`Project Statistics for '${s.projectCode}'`} width={600} onClose={onClose} noCancel onOk={onClose} okLabel="Close">
      <table className="msp-tbl stats">
        <thead>
          <tr>
            <th />
            <th>Start</th>
            <th>Finish</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Current</th>
            <td>{mspDateText(t.current.start)}</td>
            <td>{mspDateText(t.current.finish)}</td>
          </tr>
          <tr>
            <th>Baseline</th>
            <td>{mspDateText(t.baseline.start)}</td>
            <td>{mspDateText(t.baseline.finish)}</td>
          </tr>
          <tr>
            <th>Actual</th>
            <td>{mspDateText(t.actual.start)}</td>
            <td>{mspDateText(t.actual.finish)}</td>
          </tr>
          <tr>
            <th>Variance</th>
            <td>{d(t.variance.startDays)}</td>
            <td>{d(t.variance.finishDays)}</td>
          </tr>
        </tbody>
      </table>
      <table className="msp-tbl stats">
        <thead>
          <tr>
            <th />
            <th>Duration</th>
            <th>Work</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Current</th>
            <td>{d(t.durationDays.current)}</td>
            <td>{t.work.current} hrs</td>
            <td>{money(t.cost.current)}</td>
          </tr>
          <tr>
            <th>Baseline</th>
            <td>{d(t.durationDays.baseline)}</td>
            <td>{t.work.baseline} hrs</td>
            <td>{money(t.cost.baseline)}</td>
          </tr>
          <tr>
            <th>Actual</th>
            <td>{d(t.durationDays.actual)}</td>
            <td>{t.work.actual} hrs</td>
            <td>{money(t.cost.actual)}</td>
          </tr>
          <tr>
            <th>Remaining</th>
            <td>{d(t.durationDays.remaining)}</td>
            <td>{t.work.remaining} hrs</td>
            <td>{money(t.cost.remaining)}</td>
          </tr>
        </tbody>
      </table>
      <p className="msp-note">
        Percent complete: <b>Duration: {t.percentComplete}%</b> &nbsp; <b>Work: {t.workPercentComplete}%</b>
      </p>
    </MspDlg>
  );
}

function baselineLabel(s: Schedule, n: number, interim: boolean): string {
  if (n === 0 && !interim) {
    const has = s.activities.some((a) => a.baselineStart !== null);
    return `Baseline${has ? ` (last saved on ${s.baselineInfo?.assignedAt ? fmtDate(Date.parse(s.baselineInfo.assignedAt)) : "file"})` : ""}`;
  }
  const name = interim ? `Interim plan ${n}` : `Baseline ${n}`;
  const b = (s.baselines ?? []).find((x) => x.name === name);
  const label = interim ? `Start${n}/Finish${n}` : `Baseline ${n}`;
  return `${label}${b ? ` (last saved on ${b.createdAt && Date.parse(b.createdAt) > 0 ? fmtDate(Date.parse(b.createdAt)) : "file"})` : ""}`;
}

export function SetBaselineDialog({ onClose, clear }: { onClose: () => void; clear?: boolean }) {
  const s = useStore((x) => x.schedule)!;
  const [kind, setKind] = useState<"baseline" | "interim">("baseline");
  const [n, setN] = useState(0);
  const [k, setK] = useState(1);
  const [scope, setScope] = useState<"project" | "selected">("project");
  const ok = () => {
    if (clear) clearBaseline(kind === "baseline" ? n : k, scope, kind === "interim");
    else {
      const name = kind === "baseline" ? (n === 0 ? "Baseline" : `Baseline ${n}`) : `Interim plan ${k}`;
      const exists = kind === "baseline" && n === 0 ? s.activities.some((a) => a.baselineStart !== null) : (s.baselines ?? []).some((b) => b.name === name);
      if (exists && scope === "project" && !confirm(`The '${name}' has already been used. Are you sure you want to overwrite the data?`)) return;
      setBaseline(kind === "baseline" ? n : k, scope, kind === "interim");
    }
    onClose();
  };
  return (
    <MspDlg title={clear ? "Clear Baseline" : "Set Baseline"} width={460} onClose={onClose} onOk={ok}>
      <div className="msp-radios">
        <label>
          <input type="radio" checked={kind === "baseline"} onChange={() => setKind("baseline")} /> {clear ? "Clear baseline plan" : "Set baseline"}
        </label>
        <select value={n} onChange={(e) => setN(Number(e.target.value))} disabled={kind !== "baseline"} aria-label="Baseline">
          {Array.from({ length: 11 }, (_, i) => (
            <option key={i} value={i}>
              {baselineLabel(s, i, false)}
            </option>
          ))}
        </select>
        <label>
          <input type="radio" checked={kind === "interim"} onChange={() => setKind("interim")} /> {clear ? "Clear interim plan" : "Set interim plan"}
        </label>
        <div className="msp-inline">
          {!clear && <span>Copy: Scheduled Start/Finish &nbsp; Into:</span>}
          <select value={k} onChange={(e) => setK(Number(e.target.value))} disabled={kind !== "interim"} aria-label="Interim plan">
            {Array.from({ length: 10 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {baselineLabel(s, i + 1, true)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Fieldset legend="For:">
        <label>
          <input type="radio" checked={scope === "project"} onChange={() => setScope("project")} /> Entire project
        </label>
        <label>
          <input type="radio" checked={scope === "selected"} onChange={() => setScope("selected")} disabled={!selectedTasks().length} /> Selected tasks
        </label>
      </Fieldset>
    </MspDlg>
  );
}

export function UpdateProjectDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const [date, setDate] = useState(dateVal(s.dataDate ?? Date.now()));
  const [scope, setScope] = useState<"project" | "selected">("project");
  const [how, setHow] = useState<"pct" | "binary">("pct");
  const ok = () => {
    const t = fromDateVal(date, null, 17);
    if (t === null) return;
    updateProject(t, scope);
    if (how === "binary") {
      // 0% or 100% complete only: work under way goes back to not started.
      const cur = st().schedule!;
      const ids = scope === "selected" ? new Set(selectedTasks()) : null;
      commitEdit({ ...cur, activities: cur.activities.map((a) => (a.status === "in-progress" && (!ids || ids.has(a.id)) && !s.activities.find((b) => b.id === a.id)?.actualStart ? { ...a, status: "not-started", actualStart: null, percentComplete: 0, remainingDurationHours: a.originalDurationHours } : a)) }, "Update project (0/100)");
    }
    onClose();
  };
  return (
    <MspDlg title="Update Project" width={480} onClose={onClose} onOk={ok}>
      <div className="msp-radios">
        <label>
          <input type="radio" checked readOnly /> Update work as complete through:
        </label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Complete through" />
        <label className="indent">
          <input type="radio" checked={how === "pct"} onChange={() => setHow("pct")} /> Set 0% – 100% complete
        </label>
        <label className="indent">
          <input type="radio" checked={how === "binary"} onChange={() => setHow("binary")} /> Set 0% or 100% complete only
        </label>
      </div>
      <Fieldset legend="For:">
        <label>
          <input type="radio" checked={scope === "project"} onChange={() => setScope("project")} /> Entire project
        </label>
        <label>
          <input type="radio" checked={scope === "selected"} onChange={() => setScope("selected")} disabled={!selectedTasks().length} /> Selected tasks
        </label>
      </Fieldset>
    </MspDlg>
  );
}

export function MoveProjectDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const first = Math.min(...s.activities.map((a) => a.start ?? Infinity));
  const [date, setDate] = useState(dateVal(Number.isFinite(first) ? first : Date.now()));
  const [deadlines, setDeadlines] = useState(true);
  return (
    <MspDlg
      title="Move Project"
      width={420}
      onClose={onClose}
      onOk={() => {
        const t = fromDateVal(date, Number.isFinite(first) ? first : null, 8);
        if (t !== null) moveProject(t, deadlines);
        onClose();
      }}
    >
      <Row label="New project start date:">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Row>
      <label className="rb-check">
        <input type="checkbox" checked={deadlines} onChange={(e) => setDeadlines(e.target.checked)} /> Move deadlines
      </label>
    </MspDlg>
  );
}

export function OptionsDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule);
  const autoCalc = useMsp((m) => m.autoCalc);
  const [tab, setTab] = useState("schedule");
  const [newMode, setNewMode] = useState<"auto" | "manual">(s?.newTaskMode ?? "auto");
  const [calc, setCalc] = useState(autoCalc);
  const [cur, setCur] = useState(s?.projectSettings?.currency ?? "");
  const [critical, setCritical] = useState(String(Math.round((s?.scheduleOptions?.criticalFloatHours ?? 0) / (s ? projectHpd(s) : 8))));
  const [multiple, setMultiple] = useState(s?.scheduleOptions?.floatBasis === "each-project");
  const ok = () => {
    useMsp.getState().set({ autoCalc: calc });
    if (s) {
      const hpd = projectHpd(s);
      commitEdit(
        {
          ...s,
          newTaskMode: newMode,
          projectSettings: { ...(s.projectSettings ?? {}), currency: cur },
          scheduleOptions: { ...(s.scheduleOptions ?? ({} as NonNullable<Schedule["scheduleOptions"]>)), criticalFloatHours: (Number(critical) || 0) * hpd, floatBasis: multiple ? "each-project" : (s.scheduleOptions?.floatBasis ?? "each-project") },
        },
        "Project Options",
      );
    }
    onClose();
  };
  return (
    <MspDlg title="Project Options" width={640} onClose={onClose} onOk={ok} tabs={[["schedule", "Schedule"], ["display", "Display"], ["advanced", "Advanced"]]} tab={tab} onTab={setTab}>
      {tab === "schedule" && (
        <div className="msp-grid2">
          <Fieldset legend={`Scheduling options for this project: ${s?.projectCode ?? ""}`}>
            <Row label="New tasks created:">
              <select value={newMode} onChange={(e) => setNewMode(e.target.value as "auto" | "manual")} disabled={!s}>
                <option value="manual">Manually Scheduled</option>
                <option value="auto">Auto Scheduled</option>
              </select>
            </Row>
            <Row label="Duration is entered in:">
              <select value="days" disabled>
                <option value="days">Days</option>
              </select>
            </Row>
          </Fieldset>
          <Fieldset legend="Calculation">
            <div className="msp-radios">
              <span>Calculate project after each edit:</span>
              <label>
                <input type="radio" checked={calc} onChange={() => setCalc(true)} /> On
              </label>
              <label>
                <input type="radio" checked={!calc} onChange={() => setCalc(false)} /> Off (press F9 to calculate)
              </label>
            </div>
          </Fieldset>
        </div>
      )}
      {tab === "display" && (
        <Fieldset legend={`Currency options for this project: ${s?.projectCode ?? ""}`}>
          <Row label="Symbol:">
            <input value={cur} onChange={(e) => setCur(e.target.value)} style={{ width: 80 }} placeholder="e.g. AED " disabled={!s} />
          </Row>
        </Fieldset>
      )}
      {tab === "advanced" && (
        <Fieldset legend={`Calculation options for this project: ${s?.projectCode ?? ""}`}>
          <Row label="Tasks are critical if slack is less than or equal to (days):">
            <input value={critical} onChange={(e) => setCritical(e.target.value)} style={{ width: 70 }} disabled={!s} />
          </Row>
          <label className="rb-check">
            <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} disabled={!s} /> Calculate multiple critical paths
          </label>
        </Fieldset>
      )}
    </MspDlg>
  );
}

export function LevelingDialog({ onClose, run }: { onClose: () => void; run?: boolean }) {
  const s = useStore((x) => x.schedule)!;
  const [order, setOrder] = useState<"id" | "standard" | "priority">("standard");
  const [withinSlack, setWithinSlack] = useState(!!s.levelingOptions?.levelWithinFloat);
  const [clearFirst, setClearFirst] = useState(true);
  const opts = () => ({
    levelWithinFloat: withinSlack,
    preserveFinish: withinSlack,
    priorities: order === "id" ? [{ field: "activity-id" }] : order === "priority" ? [{ field: "msp-priority" }, { field: "total-float" }, { field: "early-start" }] : [{ field: "total-float" }, { field: "early-start" }, { field: "msp-priority" }],
  });
  const levelAll = () => {
    const base = clearFirst ? { ...s, activities: s.activities.map((a) => ({ ...a, leveledDelayHours: null })) } : s;
    const r = levelResources(base, opts());
    commitEdit({ ...r.schedule, levelingOptions: { ...(s.levelingOptions ?? ({} as NonNullable<Schedule["levelingOptions"]>)), ...opts() } }, "Level resources");
    st().setStatus(`Levelled: finish ${fmtDate(r.projectFinish)}. ${r.warnings.length ? r.warnings[0] : ""}`);
    onClose();
  };
  return (
    <MspDlg
      title="Resource Leveling"
      width={520}
      onClose={onClose}
      onOk={() => {
        commitEdit({ ...s, levelingOptions: { ...(s.levelingOptions ?? ({} as NonNullable<Schedule["levelingOptions"]>)), ...opts() } }, "Leveling options");
        if (run) levelAll();
        else onClose();
      }}
      extra={
        <button className="msp-btn" onClick={levelAll}>
          Level All
        </button>
      }
    >
      <Fieldset legend="Leveling calculations">
        <label className="rb-check">
          <input type="checkbox" checked={clearFirst} onChange={(e) => setClearFirst(e.target.checked)} /> Clear leveling values before leveling
        </label>
      </Fieldset>
      <Fieldset legend="Resolving overallocations">
        <Row label="Leveling order:">
          <select value={order} onChange={(e) => setOrder(e.target.value as "id" | "standard" | "priority")}>
            <option value="id">ID Only</option>
            <option value="standard">Standard</option>
            <option value="priority">Priority, Standard</option>
          </select>
        </Row>
        <label className="rb-check">
          <input type="checkbox" checked={withinSlack} onChange={(e) => setWithinSlack(e.target.checked)} /> Level only within available slack
        </label>
      </Fieldset>
    </MspDlg>
  );
}

export function ZoomDialog({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState("entire");
  const ok = () => {
    const w = (document.querySelector(".mspg-chart") as HTMLElement | null)?.clientWidth ?? 800;
    const days: Record<string, number> = { "1w": 7, "2w": 14, "1m": 30, "3m": 91 };
    if (v === "entire") window.dispatchEvent(new CustomEvent("stratum:gantt", { detail: "fit" }));
    else if (v === "selected") window.dispatchEvent(new CustomEvent("stratum:gantt", { detail: "scroll-to-selected" }));
    else useMsp.getState().set({ pxPerDay: Math.max(0.4, Math.min(48, w / days[v])) });
    onClose();
  };
  return (
    <MspDlg title="Zoom" width={300} onClose={onClose} onOk={ok}>
      <Fieldset legend="Zoom to">
        {[
          ["1w", "1 week"],
          ["2w", "2 weeks"],
          ["1m", "1 month"],
          ["3m", "3 months"],
          ["selected", "Selected task"],
          ["entire", "Entire project"],
        ].map(([k, l]) => (
          <label key={k}>
            <input type="radio" checked={v === k} onChange={() => setV(k)} /> {l}
          </label>
        ))}
      </Fieldset>
    </MspDlg>
  );
}

export function SortDialog({ onClose }: { onClose: () => void }) {
  const sort = useMsp((m) => m.sort);
  const [by, setBy] = useState<MspSort>(sort.by);
  const [desc, setDesc] = useState(sort.desc);
  return (
    <MspDlg
      title="Sort"
      width={380}
      onClose={onClose}
      onOk={() => {
        useMsp.getState().set({ sort: { by, desc } });
        onClose();
      }}
      extra={
        <button className="msp-btn" onClick={() => (useMsp.getState().set({ sort: { by: "id", desc: false } }), onClose())}>
          Reset
        </button>
      }
    >
      <Fieldset legend="Sort by">
        <select value={by} onChange={(e) => setBy(e.target.value as MspSort)} aria-label="Sort by">
          {SORT_NAMES.map(([k, l]) => (
            <option key={k} value={k}>
              {l.replace(/^by /, "")}
            </option>
          ))}
        </select>
        <label>
          <input type="radio" checked={!desc} onChange={() => setDesc(false)} /> Ascending
        </label>
        <label>
          <input type="radio" checked={desc} onChange={() => setDesc(true)} /> Descending
        </label>
      </Fieldset>
      <label className="rb-check">
        <input type="checkbox" checked readOnly /> Keep outline structure
      </label>
    </MspDlg>
  );
}

export function DateRangeDialog({ onClose }: { onClose: () => void }) {
  const range = useMsp((m) => m.dateRange);
  const s = useStore((x) => x.schedule);
  const [a, setA] = useState(dateVal(range?.[0] ?? s?.dataDate ?? Date.now()));
  const [b, setB] = useState(dateVal(range?.[1] ?? (s?.dataDate ?? Date.now()) + 30 * 86_400_000));
  return (
    <MspDlg
      title="Date Range"
      width={380}
      onClose={onClose}
      onOk={() => {
        const x = fromDateVal(a, null, 0);
        const y = fromDateVal(b, null, 23);
        if (x !== null && y !== null) useMsp.getState().set({ filter: "date-range", dateRange: [x, y] });
        onClose();
      }}
    >
      <Row label="Show tasks that start or finish after:">
        <input type="date" value={a} onChange={(e) => setA(e.target.value)} />
      </Row>
      <Row label="And before:">
        <input type="date" value={b} onChange={(e) => setB(e.target.value)} />
      </Row>
    </MspDlg>
  );
}

/** Assign Resources (Alt+F10): stays open while tasks are picked in the sheet. */
export function AssignResourcesDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const selected = useStore((x) => x.selectedActivity);
  const a = s.activities.find((x) => x.id === selected) ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const [units, setUnits] = useState("100%");
  const [newName, setNewName] = useState("");
  const [q, setQ] = useState("");
  const mine = new Map((s.assignments ?? []).filter((x) => a && x.activityId === a.id).map((x) => [x.resourceId, x]));
  const names = (ids: Map<string, number>) =>
    [...ids]
      .map(([id, u]) => {
        const r = (s.resources ?? []).find((x) => x.id === id);
        return r ? (Math.abs(u - 1) > 1e-9 ? `${r.name}[${Math.round(u * 100)}%]` : r.name) : "";
      })
      .filter(Boolean)
      .join(", ");
  const current = () => new Map([...mine].map(([id, x]) => [id, x.units ?? 1]));
  const apply = (m: Map<string, number>, label: string) => {
    if (!a) return;
    commitEdit(setResourceNames(s, a.id, names(m), projectHpd(s)), label);
  };
  const assign = () => {
    if (!pick || !a) return;
    const u = Number(units.replace("%", "")) / 100;
    const m = current();
    m.set(pick, Number.isFinite(u) && u > 0 ? u : 1);
    apply(m, "Assign resource");
  };
  const remove = () => {
    if (!pick || !a) return;
    const m = current();
    m.delete(pick);
    apply(m, "Remove resource");
  };
  const add = () => {
    if (!newName.trim() || !a) return;
    const m = current();
    const text = [names(m), newName.trim()].filter(Boolean).join(", ");
    commitEdit(setResourceNames(s, a.id, text, projectHpd(s)), "Add resource");
    setNewName("");
  };
  const list = (s.resources ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <MspDlg
      title="Assign Resources"
      width={560}
      onClose={onClose}
      noCancel
      onOk={onClose}
      okLabel="Close"
      extra={
        <>
          <button className="msp-btn" onClick={assign} disabled={!pick || !a}>
            Assign
          </button>
          <button className="msp-btn" onClick={remove} disabled={!pick || !a || !mine.has(pick)}>
            Remove
          </button>
        </>
      }
    >
      <p className="msp-note">Task: {a ? a.name : "select a task in the sheet"}</p>
      <div className="msp-inline">
        <input placeholder="Filter resources" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter resources" />
        <span>Units:</span>
        <input value={units} onChange={(e) => setUnits(e.target.value)} style={{ width: 70 }} aria-label="Units" />
      </div>
      <div className="msp-ti-grid tall">
        <table className="msp-tbl selectable">
          <thead>
            <tr>
              <th style={{ width: 24 }} />
              <th>Resource Name</th>
              <th style={{ width: 70 }}>R/D</th>
              <th style={{ width: 70 }}>Units</th>
              <th style={{ width: 100 }}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const x = mine.get(r.id);
              return (
                <tr key={r.id} className={pick === r.id ? "on" : ""} onClick={() => setPick(r.id)} onDoubleClick={() => (setPick(r.id), x ? null : assign())}>
                  <td>{x ? "✔" : ""}</td>
                  <td>{r.name}</td>
                  <td />
                  <td>{x ? `${Math.round((x.units ?? 1) * 100)}%` : ""}</td>
                  <td className="num">{x ? (x.actualCost + x.remainingCost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="msp-inline">
        <input placeholder="Type a new resource name" value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New resource" onKeyDown={(e) => e.key === "Enter" && (e.stopPropagation(), add())} />
        <button className="msp-btn" onClick={add} disabled={!newName.trim() || !a}>
          Add Resources
        </button>
      </div>
    </MspDlg>
  );
}
