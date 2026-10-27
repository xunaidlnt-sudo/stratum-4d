// The MS Project layout (the P6 layout lives in ./p6/P6Screen): title bar with quick-access buttons, ribbon tabs and groups,
//    Timeline, Gantt Chart view with its vertical view label, optional Task
//    Form (Details), status bar with view shortcuts and zoom.

import {
  BarChart3,
  CalendarCheck,
  Diamond,
  Download,
  FileInput,
  Info,
  LayoutDashboard,
  ListPlus,
  Maximize2,
  Minus,
  Plus,
  Save,
  ScrollText,
  Search,
  TableProperties,
  Upload,
  Users,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { monthShort } from "../core/dates";
import { scheduleRange } from "../core/simulation";
import { ActivityEditor, addActivityAfterSelected, deleteSelectedActivity } from "./ActivityEditor";
import { ResourcePanel } from "./Analysis";
import { Gantt, ganttCommand } from "./Gantt";
import { ModeSwitch, ThemeButton } from "./ModeSwitch";
import { TrainingButton } from "./training/Training";
import { DisplaysButton } from "./display/Displays";
import { DataDateInput, EmptySample, useClassicKeys, type ClassicActions } from "./classicParts";
export { P6Screen } from "./p6/P6Screen";
export type { ClassicActions } from "./classicParts";
import { fmtDate, useStore } from "./store";

// ---------------------------------------------------------------- MS Project

type RibbonTab = "file" | "task" | "resource" | "report" | "project" | "view";
type MspView = "gantt" | "tracking" | "resource-usage";

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rb-group">
      <div className="rb-buttons">{children}</div>
      <div className="rb-label">{label}</div>
    </div>
  );
}
const Big = ({ Icon, label, onClick, disabled, active }: { Icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) => (
  <button className={`rb-big ${active ? "active" : ""}`} onClick={onClick} disabled={disabled}>
    <Icon size={24} strokeWidth={1.5} aria-hidden />
    <span>{label}</span>
  </button>
);
const Small = ({ label, onClick, disabled, active, Icon }: { label: string; onClick: () => void; disabled?: boolean; active?: boolean; Icon?: LucideIcon }) => (
  <button className={`rb-small ${active ? "active" : ""}`} onClick={onClick} disabled={disabled}>
    {Icon && <Icon size={14} strokeWidth={1.7} aria-hidden />}
    <span>{label}</span>
  </button>
);

/** MS Project's Timeline: the project span with month ticks, milestones and the status date. */
function MspTimeline() {
  const schedule = useStore((s) => s.schedule);
  const range = useMemo(() => (schedule ? scheduleRange(schedule) : null), [schedule]);
  if (!schedule || !range) return <div className="msp-tl empty-tl">Add tasks with dates to the timeline</div>;
  const span = range.finish - range.start || 1;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - range.start) / span) * 100))}%`;
  const months: number[] = [];
  const s = new Date(range.start);
  for (let m = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1); m < range.finish; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) months.push(m);
  const step = Math.max(1, Math.ceil(months.length / 14));
  const miles = schedule.activities.filter((x) => (x.type === "milestone" || x.type === "finish-milestone") && x.start !== null);
  return (
    <div className="msp-tl">
      <div className="tl-ends">
        <span>
          Start
          <br />
          <b>{fmtDate(range.start)}</b>
        </span>
      </div>
      <div className="tl-track">
        <div className="tl-months">
          {months.map((m, i) =>
            i % step === 0 ? (
              <span key={m} style={{ left: pos(m) }}>
                {monthShort(new Date(m))} '{String(new Date(m).getUTCFullYear()).slice(2)}
              </span>
            ) : null,
          )}
        </div>
        <div className="tl-bar" />
        {schedule.dataDate !== null && (
          <div className="tl-today" style={{ left: pos(schedule.dataDate) }} title={`Status date ${fmtDate(schedule.dataDate)}`}>
            <span>Status date</span>
          </div>
        )}
        {miles.map((m, i) => (
          <div
            key={m.id}
            className={`tl-ms ${i % 2 ? "low" : ""} ${(m.start! - range.start) / span > 0.8 ? "end" : ""}`}
            style={{ left: pos(m.start!) }}
            title={m.name}
          >
            <i />
            <span>
              {m.name}
              <br />
              {fmtDate(m.start)}
            </span>
          </div>
        ))}
      </div>
      <div className="tl-ends right">
        <span>
          Finish
          <br />
          <b>{fmtDate(range.finish)}</b>
        </span>
      </div>
    </div>
  );
}

export function MspScreen({ a, banners, status }: { a: ClassicActions; banners: ReactNode; status: ReactNode }) {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const updateActivity = useStore((s) => s.updateActivity);
  const setStatus = useStore((s) => s.setStatus);
  const setTracking = useStore((s) => s.setGanttTracking);
  const setFilter = useStore((s) => s.setGanttFilter);
  const filter = useStore((s) => s.ganttFilter);
  const [tab, setTab] = useState<RibbonTab>("task");
  const [fileOpen, setFileOpen] = useState(false);
  const [view, setView] = useState<MspView>("gantt");
  const [showTimeline, setShowTimeline] = useState(true);
  const [details, setDetails] = useState(false);
  const [zoom, setZoom] = useState(50);
  const findRef = useRef<HTMLInputElement>(null);
  const act = schedule?.activities.find((x) => x.id === selected) ?? null;
  const none = !schedule;
  const find = useMemo(() => () => findRef.current?.focus(), []);
  useClassicKeys(find);

  useEffect(() => setTracking(view === "tracking"), [view, setTracking]);
  useEffect(() => () => setTracking(false), [setTracking]);

  const setPct = (p: number) => {
    if (!act) return;
    const start = act.actualStart ?? (p > 0 ? act.start : null);
    updateActivity(act.id, {
      percentComplete: p,
      status: p >= 100 ? "complete" : p > 0 ? "in-progress" : "not-started",
      actualStart: p > 0 ? start : null,
      actualFinish: p >= 100 ? act.actualFinish ?? act.finish : null,
    });
    setStatus(`${act.code} set to ${p}% complete. Calculate the project (F9) to update dates.`);
  };
  const addMilestone = () => {
    addActivityAfterSelected();
    const st = useStore.getState();
    if (st.selectedActivity) st.updateActivity(st.selectedActivity, { type: "milestone", name: "New milestone", originalDurationHours: 0, remainingDurationHours: 0 });
  };

  const Body: Record<Exclude<RibbonTab, "file">, ReactNode> = {
    task: (
      <>
        <Group label="View">
          <Big Icon={BarChart3} label="Gantt Chart" onClick={() => setView("gantt")} active={view === "gantt"} />
        </Group>
        <Group label="Schedule">
          <div className="rb-grid">
            {[0, 25, 50, 75, 100].map((p) => (
              <button key={p} className="rb-pct" title={`Mark ${p}% complete`} disabled={!act} onClick={() => setPct(p)}>
                {p}%
              </button>
            ))}
          </div>
        </Group>
        <Group label="Insert">
          <Big Icon={ListPlus} label="Task" onClick={addActivityAfterSelected} disabled={none} />
          <Big Icon={Diamond} label="Milestone" onClick={addMilestone} disabled={none} />
        </Group>
        <Group label="Properties">
          <Big Icon={Info} label="Information" onClick={() => setDetails(true)} disabled={!act} />
          <Small label="Details" Icon={TableProperties} onClick={() => setDetails(!details)} active={details} />
          <Small label="Delete Task" Icon={Minus} onClick={deleteSelectedActivity} disabled={!act} />
        </Group>
        <Group label="Editing">
          <Small label="Scroll to Task" Icon={ScrollText} onClick={() => ganttCommand("scroll-to-selected")} disabled={!act} />
          <Small label="Find" Icon={Search} onClick={() => findRef.current?.focus()} disabled={none} />
        </Group>
      </>
    ),
    resource: (
      <>
        <Group label="View">
          <Big Icon={Users} label="Resource Usage" onClick={() => setView("resource-usage")} active={view === "resource-usage"} />
        </Group>
        <Group label="Assignments">
          <Big Icon={ListPlus} label="Assign Resources" onClick={() => setDetails(true)} disabled={!act} />
        </Group>
      </>
    ),
    report: (
      <>
        <Group label="View Reports">
          <Big Icon={LayoutDashboard} label="Dashboards" onClick={a.dashboards} />
        </Group>
        <Group label="Export">
          <Big Icon={Download} label="Visual Reports (CSV)" onClick={a.exportCsv} disabled={none} />
        </Group>
      </>
    ),
    project: (
      <>
        <Group label="Schedule">
          <Big Icon={CalendarCheck} label="Calculate Project" onClick={a.schedule} disabled={none} />
        </Group>
        <Group label="Status">
          <div className="rb-field">
            <DataDateInput label="Status Date" />
          </div>
        </Group>
        <Group label="Baseline">
          <Big Icon={CalendarCheck} label="Set Baseline from File" onClick={a.assignBaseline} disabled={none} />
        </Group>
        <Group label="Data">
          <Big Icon={FileInput} label="Import from P6" onClick={a.importP6} />
          {a.pushP6 && <Big Icon={Upload} label="Update P6" onClick={a.pushP6} />}
        </Group>
      </>
    ),
    view: (
      <>
        <Group label="Task Views">
          <Big Icon={BarChart3} label="Gantt Chart" onClick={() => setView("gantt")} active={view === "gantt"} />
          <Big Icon={BarChart3} label="Tracking Gantt" onClick={() => setView("tracking")} active={view === "tracking"} />
        </Group>
        <Group label="Resource Views">
          <Big Icon={Users} label="Resource Usage" onClick={() => setView("resource-usage")} active={view === "resource-usage"} />
        </Group>
        <Group label="Split View">
          <label className="rb-check">
            <input type="checkbox" checked={showTimeline} onChange={(e) => setShowTimeline(e.target.checked)} /> Timeline
          </label>
          <label className="rb-check">
            <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} /> Details
          </label>
        </Group>
        <Group label="Zoom">
          <Small label="Zoom In" Icon={ZoomIn} onClick={() => ganttCommand("zoom-in")} disabled={none} />
          <Small label="Zoom Out" Icon={ZoomOut} onClick={() => ganttCommand("zoom-out")} disabled={none} />
          <Small label="Entire Project" Icon={Maximize2} onClick={() => ganttCommand("fit")} disabled={none} />
        </Group>
      </>
    ),
  };

  const fileItems: [string, () => void, boolean?][] = [
    ["Open", a.projects],
    ["Save", a.save, none],
    ["Save As New", a.saveAsNew, none],
    ["Import (XER / XML)", a.importSchedule],
    ["Import from P6", a.importP6],
    ["Export (XER)", a.exportXer, none],
    ["Export to Excel (CSV)", a.exportCsv, none],
    ["Open Project File", a.openFile],
    ["Save Project File", a.saveFile, none],
    ["Sample: 220 kV GIS Substation", () => a.sample("gis")],
    ["Sample: RC Building", () => a.sample("rc")],
    ["Options", () => a.settings("interface")],
  ];

  return (
    <div className="classic msp-app">
      <div className="cl-titlebar msp-titlebar">
        <span className="qat">
          <button title="Save (Ctrl+S)" onClick={a.save} disabled={none}>
            <Save size={14} aria-hidden />
          </button>
          <button title="Calculate project (F9)" onClick={a.schedule} disabled={none}>
            <CalendarCheck size={14} aria-hidden />
          </button>
        </span>
        <span className="cl-title center">{schedule ? `${schedule.projectCode} – Stratum 4D` : "Stratum 4D"}</span>
        <span className="msp-context">Gantt Chart Tools</span>
        <ModeSwitch />
        <DisplaysButton className="tb cl-train" />
        <TrainingButton className="tb cl-train" />
        <ThemeButton />
      </div>
      <div className="msp-tabrow" role="tablist">
        <button className="msp-filetab" onClick={() => setFileOpen(!fileOpen)}>
          File
        </button>
        {(["task", "resource", "report", "project", "view"] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => (setTab(k), setFileOpen(false))}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
        <button onClick={a.help}>Help</button>
        <button className="msp-format">Format</button>
        <span className="spacer" />
        <div className="msp-tell">
          <Search size={13} aria-hidden />
          <input ref={findRef} placeholder="Tell me what you want to find" value={filter.text} onChange={(e) => setFilter({ text: e.target.value })} />
        </div>
      </div>
      {fileOpen && (
        <div className="msp-backstage" onMouseLeave={() => setFileOpen(false)}>
          {fileItems.map(([label, fn, dis]) => (
            <button
              key={label}
              disabled={dis}
              onClick={() => {
                setFileOpen(false);
                fn();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="msp-ribbon">{Body[tab === "file" ? "task" : tab]}</div>
      {banners}
      {showTimeline && view !== "resource-usage" && (
        <div className="msp-tlwrap">
          <div className="msp-vlabel">TIMELINE</div>
          <MspTimeline />
        </div>
      )}
      <div className="msp-mainview">
        <div className="msp-vlabel">{view === "resource-usage" ? "RESOURCE USAGE" : view === "tracking" ? "TRACKING GANTT" : "GANTT CHART"}</div>
        <div className="msp-viewbody">{!schedule ? <EmptySample a={a} /> : view === "resource-usage" ? <ResourcePanel /> : <Gantt />}</div>
      </div>
      {details && view !== "resource-usage" && (
        <div className="msp-taskform">
          <div className="msp-vlabel">TASK FORM</div>
          <div className="msp-formbody">
            <ActivityEditor bare only={["general", "status", "predecessors", "resources"]} />
          </div>
        </div>
      )}
      <div className="cl-statusbar msp-status">
        <span>Ready</span>
        <span>New Tasks : Auto Scheduled</span>
        <span className="cl-msg">{status}</span>
        <span className="spacer" />
        <button title="Gantt Chart" className={view === "gantt" ? "on" : ""} onClick={() => setView("gantt")}>
          <BarChart3 size={14} aria-hidden />
        </button>
        <button title="Resource Usage" className={view === "resource-usage" ? "on" : ""} onClick={() => setView("resource-usage")}>
          <Users size={14} aria-hidden />
        </button>
        <button title="Reports" onClick={a.dashboards}>
          <LayoutDashboard size={14} aria-hidden />
        </button>
        <button title="Zoom out" onClick={() => (setZoom((z) => Math.max(0, z - 10)), ganttCommand("zoom-out"))}>
          <Minus size={12} aria-hidden />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={zoom}
          aria-label="Zoom"
          onChange={(e) => {
            const v = Number(e.target.value);
            ganttCommand(v > zoom ? "zoom-in" : "zoom-out");
            setZoom(v);
          }}
        />
        <button title="Zoom in" onClick={() => (setZoom((z) => Math.min(100, z + 10)), ganttCommand("zoom-in"))}>
          <Plus size={12} aria-hidden />
        </button>
      </div>
    </div>
  );
}

