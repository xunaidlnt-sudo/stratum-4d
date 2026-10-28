// The MS Project layout: green title bar with the Quick Access Toolbar, File
// (Backstage), the Task / Resource / Report / Project / View ribbon tabs and
// the contextual Format tab, the Timeline, the current view with its vertical
// view label, the Details pane (Task Form) and the status bar with view
// shortcuts and the zoom slider.

import {
  ArrowDownAZ,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ChartGantt,
  ClipboardPaste,
  Copy,
  Diamond,
  Download,
  Eraser,
  FileInput,
  Flag,
  GalleryHorizontal,
  Group,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Info,
  LayoutDashboard,
  Link2,
  ListFilter,
  ListPlus,
  ListTree,
  Maximize2,
  Minus,
  MoveRight,
  Network,
  Pin,
  Plus,
  Printer,
  Redo2,
  Ruler,
  Save,
  Scale,
  ScanSearch,
  Scissors,
  ScrollText,
  Search,
  Sheet,
  StickyNote,
  Table,
  TableProperties,
  Undo2,
  Unlink,
  Upload,
  UserPlus,
  Users,
  UsersRound,
  Ban,
  CheckCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { buildGanttRows } from "../../core/wbs";
import type { ClassicActions } from "../classicParts";
import { DataDateInput, EmptySample } from "../classicParts";
import { ganttCommand } from "../Gantt";
import { ModeSwitch, ThemeButton } from "../ModeSwitch";
import { DisplaysButton } from "../display/Displays";
import { ContextMenuHost, useCtx, type CtxItem } from "../p6/ContextMenu";
import { copySelected, cutSelected, paste } from "../p6/commands";
import { TrainingButton } from "../training/Training";
import { fmtDate, useStore } from "../store";
import { printPage } from "../files";
import {
  deleteSelected,
  indent,
  insertSummaryTask,
  insertTask,
  linkSelected,
  markOnTrack,
  moveTasks,
  outdent,
  respectLinks,
  selectedTasks,
  setMode,
  setPercent,
  toggleInactive,
  unlinkSelected,
  commitEdit,
} from "./actions";
import { Backstage } from "./Backstage";
import { MspGantt } from "./MspGantt";
import { AssignResourcesDialog, DateRangeDialog, LevelingDialog, MoveProjectDialog, OptionsDialog, ProjectInfoDialog, SetBaselineDialog, SortDialog, StatisticsDialog, UpdateProjectDialog, ZoomDialog } from "./ProjectDialogs";
import { FILTER_NAMES, GROUP_NAMES, TABLES } from "./sheet";
import { useMsp, zoomIn, zoomOut, ZOOM_STEPS, type MspFilter, type MspTable, type MspView } from "./state";
import { TaskForm } from "./TaskForm";
import { TaskInfoDialog } from "./TaskInfo";
import { MspTimeline } from "./Timeline";
import { CalendarView, NetworkDiagram, ResourceInfoDialog, ResourceSheet, ResourceUsageView, TaskUsage, TeamPlanner, levelAll, clearLeveling, nextOverallocation } from "./Views";
import { WorkingTimeDialog } from "./WorkingTime";

type RibbonTab = "task" | "resource" | "report" | "project" | "view" | "format";

function Group_({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rb-group">
      <div className="rb-buttons">{children}</div>
      <div className="rb-label">{label}</div>
    </div>
  );
}
const Big = ({ Icon, label, onClick, disabled, active, menu }: { Icon: LucideIcon; label: string; onClick?: () => void; disabled?: boolean; active?: boolean; menu?: () => CtxItem[] }) => (
  <button
    className={`rb-big ${active ? "active" : ""}`}
    disabled={disabled}
    onClick={(e) => {
      if (menu) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        useCtx.getState().show(r.left, r.bottom, menu());
      } else onClick?.();
    }}
  >
    <Icon size={24} strokeWidth={1.5} aria-hidden />
    <span>
      {label}
      {menu ? " ▾" : ""}
    </span>
  </button>
);
const Small = ({ label, onClick, disabled, active, Icon, menu, title }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; Icon?: LucideIcon; menu?: () => CtxItem[]; title?: string }) => (
  <button
    className={`rb-small ${active ? "active" : ""}`}
    disabled={disabled}
    title={title}
    onClick={(e) => {
      if (menu) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        useCtx.getState().show(r.left, r.bottom, menu());
      } else onClick?.();
    }}
  >
    {Icon && <Icon size={14} strokeWidth={1.7} aria-hidden />}
    <span>
      {label}
      {menu ? " ▾" : ""}
    </span>
  </button>
);
const Check = ({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <label className="rb-check">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} /> {label}
  </label>
);

const VIEW_LABEL: Record<MspView, string> = {
  gantt: "GANTT CHART",
  tracking: "TRACKING GANTT",
  "task-sheet": "TASK SHEET",
  "task-usage": "TASK USAGE",
  network: "NETWORK DIAGRAM",
  calendar: "CALENDAR",
  "team-planner": "TEAM PLANNER",
  "resource-sheet": "RESOURCE SHEET",
  "resource-usage": "RESOURCE USAGE",
};
const TASK_VIEWS: MspView[] = ["gantt", "tracking", "task-sheet", "task-usage", "network", "calendar"];
const viewName = (v: MspView) => VIEW_LABEL[v].toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function MspScreen({ a, banners, status }: { a: ClassicActions; banners: ReactNode; status: ReactNode }) {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const filterText = useStore((s) => s.ganttFilter.text);
  const setFilterText = useStore((s) => s.setGanttFilter);
  const dirty = useStore((s) => s.scheduleDirty);
  const m = useMsp();
  const { view, format } = m;
  const [tab, setTab] = useState<RibbonTab>("task");
  const [fileOpen, setFileOpen] = useState(false);
  const findRef = useRef<HTMLInputElement>(null);
  const act = schedule?.activities.find((x) => x.id === selected) ?? null;
  const none = !schedule;
  const ganttLike = view === "gantt" || view === "tracking" || view === "task-sheet";
  const setView = (v: MspView) => m.set({ view: v });

  // Automatic calculation: reschedule shortly after each edit, as MS Project does.
  useEffect(() => {
    if (!m.autoCalc || !dirty || !schedule) return;
    const t = setTimeout(() => useStore.getState().scheduleDirty && a.schedule(), 250);
    return () => clearTimeout(t);
  }, [m.autoCalc, dirty, schedule, a]);

  // MS Project shortcuts that the sheet does not already handle.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      const ctrl = e.ctrlKey || e.metaKey;
      const st = useStore.getState();
      if (ctrl && e.key.toLowerCase() === "f") (e.preventDefault(), findRef.current?.focus());
      else if (!typing && e.key === "Insert") (e.preventDefault(), insertTask());
      else if (!typing && e.key === "Delete" && (st.selectedActivities.size || st.selectedActivity || useMsp.getState().selWbs.size)) (e.preventDefault(), deleteSelected());
      else if (ctrl && !typing && e.key.toLowerCase() === "z") (e.preventDefault(), st.undo());
      else if (ctrl && !typing && e.key.toLowerCase() === "y") (e.preventDefault(), st.redo());
      else if (ctrl && !typing && e.key.toLowerCase() === "c") copySelected();
      else if (ctrl && !typing && e.key.toLowerCase() === "x") cutSelected();
      else if (ctrl && !typing && e.key.toLowerCase() === "v") paste();
      else if (ctrl && e.key.toLowerCase() === "p") (e.preventDefault(), void printPage(`${st.schedule?.projectCode ?? "Project"} – ${viewName(useMsp.getState().view)}`));
      else if (e.altKey && e.key === "F10") (e.preventDefault(), useMsp.getState().open("assignResources"));
      else if (!typing && e.shiftKey && e.key === "F2") (e.preventDefault(), useMsp.getState().open("taskInfo"));
      else if (!typing && ctrl && e.key === "F2") (e.preventDefault(), e.shiftKey ? unlinkSelected() : linkSelected());
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const outlineMenu = (): CtxItem[] => {
    const s = useStore.getState().schedule;
    if (!s) return [];
    const depth = new Map<string, number>();
    for (const r of buildGanttRows(s, "current")) if (r.kind === "wbs") depth.set(r.id, r.depth);
    const show = (lvl: number | null) => useStore.getState().setCollapsedWbs(new Set(lvl === null ? [] : [...depth].filter(([, d]) => d >= lvl - 1).map(([id]) => id)));
    return [{ label: "All Subtasks", onClick: () => show(null) }, ...[1, 2, 3, 4, 5].map((n) => ({ label: `Level ${n}`, onClick: () => show(n) }))];
  };
  const tablesMenu = (): CtxItem[] => (Object.keys(TABLES) as MspTable[]).map((k) => ({ label: TABLES[k].label, checked: m.table === k, onClick: () => m.set({ table: k }) }));
  const sortMenu = (): CtxItem[] => [
    ...[
      ["start", "by Start Date"],
      ["finish", "by Finish Date"],
      ["priority", "by Priority"],
      ["cost", "by Cost"],
      ["id", "by ID"],
    ].map(([k, l]) => ({ label: l, checked: m.sort.by === k, onClick: () => m.set({ sort: { by: k as never, desc: k === "priority" || k === "cost" } }) })),
    "sep",
    { label: "Sort By…", onClick: () => m.open("sort") },
  ];
  const timescaleMenu = (): CtxItem[] =>
    [
      [0.4, "Years"],
      [1, "Quarters"],
      [3, "Months"],
      [6, "Thirds of Months"],
      [12, "Weeks"],
      [24, "Days"],
      [48, "Hours"],
    ].map(([px, l]) => ({ label: l as string, checked: Math.abs(m.pxPerDay - (px as number)) < 0.01, onClick: () => m.set({ pxPerDay: px as number }) }));
  const viewsMenu = (list: MspView[]): CtxItem[] => list.map((v) => ({ label: viewName(v), checked: view === v, onClick: () => setView(v) }));
  const moveMenu = (): CtxItem[] => [
    { label: "1 Day", onClick: () => moveTasks(1) },
    { label: "1 Week", onClick: () => moveTasks(7) },
    { label: "4 Weeks", onClick: () => moveTasks(28) },
    "sep",
    { label: "Back 1 Day", onClick: () => moveTasks(-1) },
    { label: "Back 1 Week", onClick: () => moveTasks(-7) },
  ];
  const inspect = () => {
    const s = useStore.getState().schedule;
    if (!s || !act) return;
    const drivers = s.relationships.filter((r) => r.successorId === act.id && r.driving).map((r) => s.activities.find((x) => x.id === r.predecessorId)?.name).filter(Boolean);
    const why = act.taskMode === "manual" ? "It is manually scheduled: its dates stay as entered." : act.constraint?.date ? `It has a constraint on ${fmtDate(act.constraint.date)}.` : drivers.length ? `Predecessors driving it: ${drivers.join(", ")}.` : act.status !== "not-started" ? `Actual start ${fmtDate(act.actualStart)}.` : "It starts at the project start or status date.";
    useStore.getState().setStatus(`Task Inspector – ${act.name}: start ${fmtDate(act.start)}. ${why}`);
  };
  const addToTimeline = () => {
    const s = useStore.getState().schedule;
    const ids = new Set(selectedTasks());
    if (!s || !ids.size) return;
    const on = !s.activities.find((x) => ids.has(x.id))?.onTimeline;
    commitEdit({ ...s, activities: s.activities.map((x) => (ids.has(x.id) ? { ...x, onTimeline: on } : x)) }, on ? "Add to Timeline" : "Remove from Timeline");
    if (on) m.set({ showTimeline: true });
  };
  const baselineMenu = (): CtxItem[] => [
    { label: "Set Baseline…", onClick: () => m.open("setBaseline") },
    { label: "Clear Baseline…", onClick: () => m.open("clearBaseline") },
  ];

  const Body: Record<RibbonTab, ReactNode> = {
    task: (
      <>
        <Group_ label="View">
          <Big Icon={ChartGantt} label="Gantt Chart" menu={() => viewsMenu([...TASK_VIEWS, "team-planner", "resource-sheet", "resource-usage"])} active={ganttLike} />
        </Group_>
        <Group_ label="Clipboard">
          <Big Icon={ClipboardPaste} label="Paste" onClick={paste} disabled={none} />
          <Small label="Cut" Icon={Scissors} onClick={cutSelected} disabled={!act} />
          <Small label="Copy" Icon={Copy} onClick={copySelected} disabled={!act} />
        </Group_>
        <Group_ label="Schedule">
          <div className="rb-sched">
            <div className="rb-grid">
              {[0, 25, 50, 75, 100].map((p) => (
                <button key={p} className="rb-pct" title={`${p}% Complete`} disabled={!act} onClick={() => setPercent(p)}>
                  {p}%
                </button>
              ))}
            </div>
            <div className="rb-sched-row">
              <button className="rb-icon" title="Outdent Task (Alt+Shift+Left)" onClick={outdent} disabled={none}>
                <IndentDecrease size={15} aria-hidden />
              </button>
              <button className="rb-icon" title="Indent Task (Alt+Shift+Right)" onClick={indent} disabled={none}>
                <IndentIncrease size={15} aria-hidden />
              </button>
              <button className="rb-icon" title="Link the Selected Tasks (Ctrl+F2)" onClick={linkSelected} disabled={none}>
                <Link2 size={15} aria-hidden />
              </button>
              <button className="rb-icon" title="Unlink Tasks (Ctrl+Shift+F2)" onClick={unlinkSelected} disabled={!act}>
                <Unlink size={15} aria-hidden />
              </button>
            </div>
          </div>
          <Small label="Mark on Track" Icon={CheckCheck} onClick={markOnTrack} disabled={!act} />
          <Small label="Respect Links" Icon={Link2} onClick={respectLinks} disabled={!act} />
          <Small label={act?.inactive ? "Activate" : "Inactivate"} Icon={Ban} onClick={toggleInactive} disabled={!act} />
        </Group_>
        <Group_ label="Tasks">
          <Big Icon={Pin} label="Manually Schedule" onClick={() => setMode("manual")} disabled={!act} active={act?.taskMode === "manual"} />
          <Big Icon={CalendarClock} label="Auto Schedule" onClick={() => setMode("auto")} disabled={!act} active={!!act && act.taskMode !== "manual"} />
          <Small label="Inspect" Icon={ScanSearch} onClick={inspect} disabled={!act} />
          <Small label="Move" Icon={MoveRight} menu={moveMenu} disabled={!act} />
          <Small label="Mode" Icon={CalendarClock} menu={() => [{ label: "Manually Schedule", onClick: () => setMode("manual") }, { label: "Auto Schedule", onClick: () => setMode("auto") }]} disabled={!act} />
        </Group_>
        <Group_ label="Insert">
          <Big Icon={ListPlus} label="Task" onClick={() => insertTask()} disabled={none} />
          <Small label="Summary" Icon={ListTree} onClick={insertSummaryTask} disabled={none} />
          <Small label="Milestone" Icon={Diamond} onClick={() => insertTask("<New Milestone>", true)} disabled={none} />
        </Group_>
        <Group_ label="Properties">
          <Big Icon={Info} label="Information" onClick={() => m.open("taskInfo")} disabled={!act} />
          <Small label="Notes" Icon={StickyNote} onClick={() => m.open("taskInfo", "notes")} disabled={!act} />
          <Small label="Details" Icon={TableProperties} onClick={() => m.set({ details: !m.details })} active={m.details} />
          <Small label="Add to Timeline" Icon={GalleryHorizontal} onClick={addToTimeline} disabled={!act} active={!!act?.onTimeline} />
        </Group_>
        <Group_ label="Editing">
          <Small label="Scroll to Task" Icon={ScrollText} onClick={() => ganttCommand("scroll-to-selected")} disabled={!act} />
          <Small label="Find" Icon={Search} onClick={() => findRef.current?.focus()} disabled={none} />
          <Small label="Clear" Icon={Eraser} menu={() => [{ label: "Clear Filter", onClick: () => (m.set({ filter: "all", highlight: "all" }), setFilterText({ text: "" })) }, { label: "Clear Sort and Group", onClick: () => m.set({ sort: { by: "id", desc: false }, group: "none" }) }]} disabled={none} />
        </Group_>
      </>
    ),
    resource: (
      <>
        <Group_ label="View">
          <Big Icon={UsersRound} label="Team Planner" onClick={() => setView("team-planner")} active={view === "team-planner"} disabled={none} />
        </Group_>
        <Group_ label="Assignments">
          <Big Icon={Users} label="Assign Resources" onClick={() => m.open("assignResources")} disabled={!act} />
        </Group_>
        <Group_ label="Insert">
          <Big Icon={UserPlus} label="Add Resources" onClick={() => setView("resource-sheet")} disabled={none} />
        </Group_>
        <Group_ label="Properties">
          <Big Icon={Info} label="Information" onClick={() => (view === "resource-sheet" ? m.open("resourceInfo") : m.open("taskInfo", "resources"))} disabled={none} />
          <Small label="Details" Icon={TableProperties} onClick={() => m.set({ details: !m.details })} active={m.details} />
        </Group_>
        <Group_ label="Level">
          <Big Icon={Scale} label="Level All" onClick={levelAll} disabled={none} />
          <Small label="Leveling Options" Icon={Scale} onClick={() => m.open("levelOptions")} disabled={none} />
          <Small label="Clear Leveling" Icon={Eraser} onClick={clearLeveling} disabled={none} />
          <Small label="Next Overallocation" Icon={MoveRight} onClick={nextOverallocation} disabled={none} />
        </Group_>
      </>
    ),
    report: (
      <>
        <Group_ label="View Reports">
          <Big Icon={LayoutDashboard} label="Dashboards" onClick={a.dashboards} />
          <Big Icon={Users} label="Resources" onClick={a.dashboards} />
          <Big Icon={CalendarRange} label="Costs" onClick={a.dashboards} />
          <Big Icon={ChartGantt} label="In Progress" onClick={() => (m.set({ filter: "incomplete" }), setView("gantt"))} disabled={none} />
        </Group_>
        <Group_ label="Project">
          <Big Icon={Info} label="Project Statistics" onClick={() => m.open("statistics")} disabled={none} />
        </Group_>
        <Group_ label="Export">
          <Big Icon={Download} label="Visual Reports (CSV)" onClick={a.exportCsv} disabled={none} />
          <Small label="Print" Icon={Printer} onClick={() => void printPage(`${schedule?.projectCode ?? "Project"} – ${viewName(view)}`)} disabled={none} />
        </Group_>
      </>
    ),
    project: (
      <>
        <Group_ label="Properties">
          <Big Icon={Info} label="Project Information" onClick={() => m.open("projectInfo")} disabled={none} />
          <Big Icon={CalendarDays} label="Change Working Time" onClick={() => m.open("workingTime")} disabled={none} />
          <Small label="Options" Icon={TableProperties} onClick={() => m.open("options")} />
        </Group_>
        <Group_ label="Schedule">
          <Big Icon={CalendarCheck} label="Calculate Project" onClick={a.schedule} disabled={none} />
          <Big Icon={Flag} label="Set Baseline" menu={baselineMenu} disabled={none} />
          <Small label="Move Project" Icon={MoveRight} onClick={() => m.open("moveProject")} disabled={none} />
          <Small label="Assign Baseline from File" Icon={FileInput} onClick={a.assignBaseline} disabled={none} />
        </Group_>
        <Group_ label="Status">
          <div className="rb-field">
            <DataDateInput label="Status Date" />
          </div>
          <Big Icon={CalendarRange} label="Update Project" onClick={() => m.open("updateProject")} disabled={none} />
        </Group_>
        <Group_ label="Data">
          <Big Icon={FileInput} label="Import from P6" onClick={a.importP6} />
          {a.pushP6 && <Big Icon={Upload} label="Update P6" onClick={a.pushP6} />}
          <Small label="Save as MS Project XML" Icon={Download} onClick={a.exportMspdi} disabled={none} />
        </Group_>
      </>
    ),
    view: (
      <>
        <Group_ label="Task Views">
          <Big Icon={ChartGantt} label="Gantt Chart" onClick={() => setView("gantt")} active={view === "gantt"} />
          <Big Icon={TableProperties} label="Task Usage" onClick={() => setView("task-usage")} active={view === "task-usage"} disabled={none} />
          <Small label="Network Diagram" Icon={Network} onClick={() => setView("network")} active={view === "network"} disabled={none} />
          <Small label="Calendar" Icon={CalendarDays} onClick={() => setView("calendar")} active={view === "calendar"} disabled={none} />
          <Small label="Other Views" Icon={Table} menu={() => viewsMenu(["tracking", "task-sheet"])} />
        </Group_>
        <Group_ label="Resource Views">
          <Big Icon={UsersRound} label="Team Planner" onClick={() => setView("team-planner")} active={view === "team-planner"} disabled={none} />
          <Small label="Resource Usage" Icon={Users} onClick={() => setView("resource-usage")} active={view === "resource-usage"} disabled={none} />
          <Small label="Resource Sheet" Icon={Sheet} onClick={() => setView("resource-sheet")} active={view === "resource-sheet"} disabled={none} />
        </Group_>
        <Group_ label="Data">
          <Small label="Sort" Icon={ArrowDownAZ} menu={sortMenu} disabled={!ganttLike} />
          <Small label="Outline" Icon={ListTree} menu={outlineMenu} disabled={!ganttLike} />
          <Small label="Tables" Icon={Table} menu={tablesMenu} disabled={!ganttLike} />
          <div className="rb-dd">
            <span>
              <Highlighter size={13} aria-hidden /> Highlight:
            </span>
            <select value={m.highlight} onChange={(e) => m.set({ highlight: e.target.value as MspFilter })} disabled={!ganttLike} aria-label="Highlight">
              {FILTER_NAMES.filter(([k]) => k !== "date-range" && k !== "summary").map(([k, l]) => (
                <option key={k} value={k}>
                  {k === "all" ? "[No Highlight]" : l}
                </option>
              ))}
            </select>
          </div>
          <div className="rb-dd">
            <span>
              <ListFilter size={13} aria-hidden /> Filter:
            </span>
            <select value={m.filter} onChange={(e) => (e.target.value === "date-range" ? m.open("filter") : m.set({ filter: e.target.value as MspFilter }))} disabled={!ganttLike} aria-label="Filter">
              {FILTER_NAMES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="rb-dd">
            <span>
              <Group size={13} aria-hidden /> Group by:
            </span>
            <select value={m.group} onChange={(e) => m.set({ group: e.target.value as typeof m.group })} disabled={!ganttLike} aria-label="Group by">
              {GROUP_NAMES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        </Group_>
        <Group_ label="Zoom">
          <Small label="Timescale" Icon={Ruler} menu={timescaleMenu} disabled={none} />
          <Small label="Zoom" Icon={Search} menu={() => [{ label: "Zoom In", onClick: zoomIn }, { label: "Zoom Out", onClick: zoomOut }, { label: "Zoom…", onClick: () => m.open("timescale") }]} disabled={none} />
          <Big Icon={Maximize2} label="Entire Project" onClick={() => ganttCommand("fit")} disabled={none} />
          <Big Icon={ScrollText} label="Selected Tasks" onClick={() => ganttCommand("scroll-to-selected")} disabled={!act} />
        </Group_>
        <Group_ label="Split View">
          <Check label="Timeline" checked={m.showTimeline} onChange={(v) => m.set({ showTimeline: v })} />
          <Check label="Details" checked={m.details} onChange={(v) => m.set({ details: v })} />
        </Group_>
      </>
    ),
    format: (
      <>
        <Group_ label="Columns">
          <Big Icon={Plus} label="Insert Column" onClick={() => (document.querySelector(".mspg-hcell.add") as HTMLElement | null)?.click()} disabled={!ganttLike || none} />
          <Small label="Tables" Icon={Table} menu={tablesMenu} disabled={!ganttLike} />
        </Group_>
        <Group_ label="Bar Styles">
          <Check label="Critical Tasks" checked={format.criticalTasks} onChange={(v) => m.setFormat({ criticalTasks: v })} />
          <Check label="Slack" checked={format.slack} onChange={(v) => m.setFormat({ slack: v })} />
          <Check label="Late Tasks" checked={format.lateTasks} onChange={(v) => m.setFormat({ lateTasks: v })} />
          <Check label="Baseline" checked={format.baseline} onChange={(v) => m.setFormat({ baseline: v })} />
          <Check label="Link Lines" checked={format.linkLines} onChange={(v) => m.setFormat({ linkLines: v })} />
          <Check label="Gridlines" checked={format.gridlines} onChange={(v) => m.setFormat({ gridlines: v })} />
        </Group_>
        <Group_ label="Bar Text">
          <div className="rb-dd">
            <span>Right of bars:</span>
            <select value={format.barText} onChange={(e) => m.setFormat({ barText: e.target.value as typeof format.barText })} aria-label="Bar text">
              <option value="resources">Resource Names</option>
              <option value="name">Task Name</option>
              <option value="none">None</option>
            </select>
          </div>
        </Group_>
        <Group_ label="Show/Hide">
          <Check label="Outline Number" checked={format.outlineNumber} onChange={(v) => m.setFormat({ outlineNumber: v })} />
          <Check label="Project Summary Task" checked={format.projectSummary} onChange={(v) => m.setFormat({ projectSummary: v })} />
          <Check label="Summary Tasks" checked={format.summaryTasks} onChange={(v) => m.setFormat({ summaryTasks: v })} />
        </Group_>
      </>
    ),
  };

  const tabs: [RibbonTab, string][] = [
    ["task", "Task"],
    ["resource", "Resource"],
    ["report", "Report"],
    ["project", "Project"],
    ["view", "View"],
  ];
  const close = () => m.set({ dialog: null, dialogTab: undefined });
  const dialogs: Record<NonNullable<typeof m.dialog>, ReactNode> = {
    taskInfo: <TaskInfoDialog onClose={close} />,
    projectInfo: <ProjectInfoDialog onClose={close} />,
    statistics: <StatisticsDialog onClose={close} />,
    workingTime: <WorkingTimeDialog onClose={close} />,
    setBaseline: <SetBaselineDialog onClose={close} />,
    clearBaseline: <SetBaselineDialog onClose={close} clear />,
    assignResources: <AssignResourcesDialog onClose={close} />,
    resourceInfo: <ResourceInfoDialog onClose={close} />,
    options: <OptionsDialog onClose={close} />,
    updateProject: <UpdateProjectDialog onClose={close} />,
    moveProject: <MoveProjectDialog onClose={close} />,
    levelOptions: <LevelingDialog onClose={close} />,
    timescale: <ZoomDialog onClose={close} />,
    sort: <SortDialog onClose={close} />,
    filter: <DateRangeDialog onClose={close} />,
    columns: null,
    barStyles: null,
    groupBy: null,
  };
  const needsSchedule = m.dialog && m.dialog !== "options";

  const viewBody = () => {
    if (!schedule) return <EmptySample a={a} />;
    switch (view) {
      case "gantt":
        return <MspGantt />;
      case "tracking":
        return <MspGantt tracking />;
      case "task-sheet":
        return <MspGantt chart={false} />;
      case "task-usage":
        return <TaskUsage />;
      case "network":
        return <NetworkDiagram />;
      case "calendar":
        return <CalendarView />;
      case "team-planner":
        return <TeamPlanner />;
      case "resource-sheet":
        return <ResourceSheet />;
      case "resource-usage":
        return <ResourceUsageView />;
    }
  };
  const zoomIdx = ZOOM_STEPS.findIndex((z) => Math.abs(z - m.pxPerDay) < 0.01);

  return (
    <div className="classic msp-app">
      <div className="cl-titlebar msp-titlebar">
        <span className="qat">
          <button title="Save (Ctrl+S)" onClick={a.save} disabled={none}>
            <Save size={14} aria-hidden />
          </button>
          <button title="Undo (Ctrl+Z)" onClick={() => useStore.getState().undo()} disabled={!canUndo}>
            <Undo2 size={14} aria-hidden />
          </button>
          <button title="Redo (Ctrl+Y)" onClick={() => useStore.getState().redo()} disabled={!canRedo}>
            <Redo2 size={14} aria-hidden />
          </button>
          <button title="Calculate project (F9)" onClick={a.schedule} disabled={none}>
            <CalendarCheck size={14} aria-hidden />
          </button>
        </span>
        <span className="cl-title center">{schedule ? `${schedule.projectCode}  -  Stratum 4D` : "Stratum 4D"}</span>
        {ganttLike && <span className="msp-context">Gantt Chart Tools</span>}
        <ModeSwitch />
        <DisplaysButton className="tb cl-train" />
        <TrainingButton className="tb cl-train" />
        <ThemeButton />
      </div>
      <div className="msp-tabrow" role="tablist">
        <button className="msp-filetab" onClick={() => setFileOpen(true)}>
          File
        </button>
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
        <button onClick={a.help}>Help</button>
        {ganttLike && (
          <button role="tab" aria-selected={tab === "format"} className={`msp-format ${tab === "format" ? "active" : ""}`} onClick={() => setTab("format")}>
            Format
          </button>
        )}
        <span className="spacer" />
        <div className="msp-tell">
          <Search size={13} aria-hidden />
          <input ref={findRef} placeholder="Tell me what you want to do" value={filterText} onChange={(e) => setFilterText({ text: e.target.value })} aria-label="Find tasks" />
        </div>
      </div>
      <div className="msp-ribbon">{Body[tab === "format" && !ganttLike ? "task" : tab]}</div>
      {banners}
      {m.showTimeline && TASK_VIEWS.includes(view) && (
        <div className="msp-tlwrap">
          <div className="msp-vlabel">TIMELINE</div>
          <MspTimeline />
        </div>
      )}
      <div className="msp-mainview">
        <div className="msp-vlabel">{VIEW_LABEL[view]}</div>
        <div className="msp-viewbody">{viewBody()}</div>
      </div>
      {m.details && schedule && TASK_VIEWS.includes(view) && (
        <div className="msp-taskform">
          <div className="msp-vlabel">TASK FORM</div>
          <div className="msp-formbody">
            <TaskForm />
          </div>
        </div>
      )}
      <div className="cl-statusbar msp-status">
        <span>Ready</span>
        <button
          className="msp-newmode"
          disabled={none}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const s = useStore.getState().schedule;
            if (!s) return;
            useCtx.getState().show(r.left, r.top - 60, [
              { label: "Auto Scheduled – Task dates are calculated by Project", checked: s.newTaskMode !== "manual", onClick: () => commitEdit({ ...s, newTaskMode: "auto" }, "New tasks: auto scheduled") },
              { label: "Manually Scheduled – Task dates are not automatically updated", checked: s.newTaskMode === "manual", onClick: () => commitEdit({ ...s, newTaskMode: "manual" }, "New tasks: manually scheduled") },
            ]);
          }}
        >
          New Tasks : {schedule?.newTaskMode === "manual" ? "Manually Scheduled" : "Auto Scheduled"}
        </button>
        {(m.filter !== "all" || filterText) && <span className="msp-flag">Filter Applied</span>}
        {!m.autoCalc && dirty && <span className="msp-flag">Calculate</span>}
        <span className="cl-msg">{status}</span>
        <span className="spacer" />
        {(
          [
            ["gantt", ChartGantt, "Gantt Chart"],
            ["task-usage", TableProperties, "Task Usage"],
            ["team-planner", UsersRound, "Team Planner"],
            ["resource-sheet", Sheet, "Resource Sheet"],
          ] as [MspView, LucideIcon, string][]
        ).map(([v, Icon, title]) => (
          <button key={v} title={title} className={view === v ? "on" : ""} onClick={() => setView(v)} disabled={none && v !== "gantt"}>
            <Icon size={14} aria-hidden />
          </button>
        ))}
        <button title="Reports" onClick={a.dashboards}>
          <LayoutDashboard size={14} aria-hidden />
        </button>
        <button title="Zoom out" onClick={zoomOut}>
          <Minus size={12} aria-hidden />
        </button>
        <input type="range" min={0} max={ZOOM_STEPS.length - 1} value={zoomIdx < 0 ? 5 : zoomIdx} aria-label="Zoom" onChange={(e) => m.set({ pxPerDay: ZOOM_STEPS[Number(e.target.value)] })} />
        <button title="Zoom in" onClick={zoomIn}>
          <Plus size={12} aria-hidden />
        </button>
      </div>
      {fileOpen && <Backstage a={a} onClose={() => setFileOpen(false)} />}
      {m.dialog && (!needsSchedule || schedule) && dialogs[m.dialog]}
      <ContextMenuHost />
    </div>
  );
}
