// The P6 Professional layout: title bar, menus, toolbar, Directory bar
// (left), workspace windows with tabs, the Activities window (layout bar,
// activity table + Gantt or Activity Network, lower pane with Activity
// Details, usage profiles / spreadsheets or Trace Logic), the Command bar
// (right) and the status bar.

import { TsldView } from "./Tsld";
import { TrackingWindow } from "./Tracking";
import { ActivityDocs } from "./Documents";
import { download as saveFile } from "../files";
import {
  AlignVerticalSpaceAround,
  ArrowDownToLine,
  BarChart3,
  Calculator,
  CalendarClock,
  CalendarRange,
  ChartGantt,
  ChartLine,
  ChartNoAxesGantt,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  ClipboardPaste,
  Columns3,
  Copy,
  DatabaseZap,
  FileChartColumn,
  FileInput,
  FileOutput,
  FileText,
  Filter,
  Flag,
  FolderKanban,
  FolderOpen,
  Gauge,
  GitBranch,
  GitFork,
  Highlighter,
  Layers,
  LayoutDashboard,
  LayoutPanelTop,
  Link2,
  ListOrdered,
  ListTree,
  Merge,
  MonitorUp,
  MoveHorizontal,
  Network,
  GitCommitHorizontal,
  NotebookPen,
  PanelBottom,
  PencilRuler,
  Plus,
  Printer,
  Receipt,
  Redo2,
  Save,
  Scissors,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  SpellCheck,
  SquareCheck,
  Table2,
  Tags,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
  Wand2,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePrefs } from "./prefs";
import { useConfig } from "../../backend/config";
import { estimateProgress, recalcAssignmentCosts, removeProgress } from "../../core/ops";
import { ActivityEditor, type EditorSection } from "../ActivityEditor";
import { CostPanel, ResourcePanel } from "../Analysis";
import { DataDateInput, EmptySample, FILTERS, IconBtn, MenuBar, type ClassicActions, type MenuItem } from "../classicParts";
import { ganttCommand } from "../Gantt";
import { ModeSwitch, ThemeButton } from "../ModeSwitch";
import { fmtDate, useStore, type GanttFilterKind } from "../store";
import { useTraining } from "../training/engine";
import { TrainingButton } from "../training/Training";
import { ActivityTable } from "./ActivityTable";
import {
  lastCopied,
  pasteIntoCells,
  selectionTsv,
  addActivity,
  collapseAll,
  copySelected,
  cutSelected,
  deleteSelected,
  dissolveSelected,
  expandAll,
  expandToLevel,
  fillDownSelected,
  linkSelected,
  paste,
  selectAll,
  unlinkSelected,
  useP6,
  type P6Window,
} from "./commands";
import { ContextMenuHost } from "./ContextMenu";
import { P6Dialogs, printLayout } from "./Dialogs";
import { exportLayoutXlsx } from "./Dialogs3";
import { openBudgets } from "./Dialogs5";
import { EnterpriseProjectsWindow } from "./EnterpriseProjects";
import { loginEnabled, signOut } from "../LoginGate";
import { STOCK_LAYOUTS, useLayout, type LowerTab, type LowerView } from "./layout";
import { AssignmentsWindow, NetworkView, ProjectsWindow, RegisterWindow, ResourcesWindow, TraceLogicView, UsageSpreadsheet, WbsWindow } from "./Windows";

const WINDOW_LABEL: Record<P6Window, string> = {
  activities: "Activities",
  wbs: "WBS",
  assignments: "Assignments",
  resources: "Resources",
  projects: "Projects",
  documents: "WPs & Docs",
  expenses: "Expenses",
  thresholds: "Thresholds",
  issues: "Issues",
  risks: "Risks",
  tracking: "Tracking",
};

const LOWER_TABS: [LowerTab, string, EditorSection[]][] = [
  ["general", "General", ["general"]],
  ["status", "Status", ["status", "dates"]],
  ["resources", "Resources", ["resources"]],
  ["predecessors", "Predecessors", ["predecessors"]],
  ["successors", "Successors", ["successors"]],
  ["relationships", "Relationships", ["predecessors", "successors"]],
  ["codes", "Codes", ["codes"]],
  ["steps", "Steps", ["steps"]],
  ["notebook", "Notebook", ["notebook"]],
  ["udf", "UDFs", ["udf"]],
  ["wpdocs", "WPs & Docs", []],
];

const LOWER_VIEWS: [LowerView | "resourceProfile" | "activityProfile", string][] = [
  ["details", "Activity Details"],
  ["resourceProfile", "Resource Usage Profile"],
  ["activityProfile", "Activity Usage Profile"],
  ["resourceUsage", "Resource Usage Spreadsheet"],
  ["activityUsage", "Activity Usage Spreadsheet"],
  ["trace", "Trace Logic"],
  ["none", "Nothing"],
];

// ---------------------------------------------------------------- rails

interface RailItem {
  id: string;
  label: string;
  title: string;
  Icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}

function Rail({ side, items, label }: { side: "left" | "right"; items: (RailItem | "sep")[]; label: string }) {
  return (
    <nav className={`p6-rail p6-rail-${side}`} aria-label={label}>
      {items.map((it, i) =>
        it === "sep" ? (
          <span key={`sep${i}`} className="rail-sep" />
        ) : (
          <button key={it.id} className={it.active ? "on" : ""} title={it.title} onClick={it.onClick} disabled={it.disabled} aria-pressed={it.active}>
            <it.Icon size={20} strokeWidth={1.6} aria-hidden />
            <span>{it.label}</span>
          </button>
        ),
      )}
    </nav>
  );
}

function DirectoryBar({ a }: { a: ClassicActions }) {
  const win = useP6((s) => s.window);
  const show = useP6((s) => s.show);
  const none = !useStore((s) => s.schedule);
  const item = (id: P6Window, Icon: LucideIcon, title: string): RailItem => ({ id, label: WINDOW_LABEL[id], title, Icon, active: win === id, disabled: none && id !== "projects", onClick: () => show(id) });
  return (
    <Rail
      side="left"
      label="Directory"
      items={[
        item("projects", FolderKanban, "Projects window"),
        item("resources", Users, "Resources window: the resource dictionary"),
        { id: "reports", label: "Reports", title: "Reports and dashboards", Icon: FileChartColumn, onClick: a.dashboards },
        { ...item("tracking", Gauge, "Tracking: project-level table, Gantt and bar charts across a portfolio"), disabled: false },
        "sep",
        item("wbs", Network, "WBS window: edit the work breakdown structure"),
        item("activities", ListTree, "Activities window"),
        item("assignments", ClipboardList, "Assignments window: every resource assignment"),
        item("documents", FileText, "Work products and documents"),
        item("expenses", Receipt, "Project expenses"),
        item("thresholds", AlignVerticalSpaceAround, "Thresholds to monitor"),
        item("issues", TriangleAlert, "Project issues"),
        item("risks", ShieldAlert, "Project risks"),
        "sep",
        { id: "p6", label: "P6 Import", title: "Import a project from a P6 connection", Icon: DatabaseZap, onClick: a.importP6 },
      ]}
    />
  );
}

function CommandBar({ a }: { a: ClassicActions }) {
  const win = useP6((s) => s.window);
  const open = useP6((s) => s.open);
  const schedule = useStore((s) => s.schedule);
  const sel = useStore((s) => s.selectedActivities);
  const canUndo = useStore((s) => s.past.length > 0);
  const clip = useStore((s) => s.clipboard);
  const none = !schedule;
  const n = sel.size;
  if (win !== "activities")
    return (
      <Rail
        side="right"
        label="Commands"
        items={[
          { id: "f9", label: "Schedule", title: "Schedule (F9)", Icon: Calculator, onClick: () => useP6.getState().open("scheduleRun"), disabled: none },
          { id: "save", label: "Commit", title: "Commit changes to the database (Ctrl+S)", Icon: Save, onClick: a.save, disabled: none },
          { id: "undo", label: "Undo", title: "Undo (Ctrl+Z)", Icon: Undo2, onClick: () => useStore.getState().undo(), disabled: !canUndo },
          "sep",
          { id: "acts", label: "Activities", title: "Back to the Activities window", Icon: ListTree, onClick: () => useP6.getState().show("activities"), disabled: none },
        ]}
      />
    );
  return (
    <Rail
      side="right"
      label="Commands"
      items={[
        { id: "add", label: "Add", title: "Add an activity after the selected one (Ins)", Icon: Plus, onClick: addActivity, disabled: none },
        { id: "del", label: "Delete", title: "Delete the selected activities (Del)", Icon: Trash2, onClick: () => deleteSelected(), disabled: !n },
        { id: "cut", label: "Cut", title: "Cut (Ctrl+X)", Icon: Scissors, onClick: cutSelected, disabled: !n },
        { id: "copy", label: "Copy", title: "Copy (Ctrl+C)", Icon: Copy, onClick: copySelected, disabled: !n },
        { id: "paste", label: "Paste", title: "Paste (Ctrl+V)", Icon: ClipboardPaste, onClick: paste, disabled: !clip },
        { id: "dissolve", label: "Dissolve", title: "Delete and link predecessors to successors", Icon: Merge, onClick: dissolveSelected, disabled: !n },
        { id: "renumber", label: "Renumber", title: "Renumber Activity IDs", Icon: ListOrdered, onClick: () => open("renumber"), disabled: !n },
        { id: "link", label: "Link", title: "Link the selected activities FS in table order", Icon: Link2, onClick: () => linkSelected("FS"), disabled: n < 2 },
        { id: "undo", label: "Undo", title: "Undo (Ctrl+Z)", Icon: Undo2, onClick: () => useStore.getState().undo(), disabled: !canUndo },
        { id: "fill", label: "Fill Down", title: "Copy the top value of the focused column down the selection (Ctrl+E)", Icon: ArrowDownToLine, onClick: fillDownSelected, disabled: n < 2 },
        { id: "selall", label: "Select All", title: "Select all activities shown (Ctrl+A)", Icon: SquareCheck, onClick: selectAll, disabled: none },
        { id: "spell", label: "Spelling", title: "Check spelling of activity names", Icon: SpellCheck, onClick: () => open("spelling"), disabled: none },
        "sep",
        { id: "apred", label: "Predecessors", title: "Assign predecessors", Icon: GitFork, onClick: () => open("assignPred"), disabled: n !== 1 },
        { id: "asucc", label: "Successors", title: "Assign successors", Icon: GitBranch, onClick: () => open("assignSucc"), disabled: n !== 1 },
        { id: "ares", label: "Resources", title: "Assign resources", Icon: Users, onClick: () => open("assignRes"), disabled: !n },
        { id: "acode", label: "Codes", title: "Assign activity codes", Icon: Tags, onClick: () => open("assignCode"), disabled: !n },
        "sep",
        { id: "expand", label: "Expand All", title: "Expand all bands", Icon: ChevronsUpDown, onClick: expandAll, disabled: none },
        { id: "collapse", label: "Collapse All", title: "Collapse all WBS bands", Icon: ChevronsDownUp, onClick: collapseAll, disabled: none },
        { id: "f9", label: "Schedule", title: "Schedule (F9)", Icon: Calculator, onClick: () => useP6.getState().open("scheduleRun"), disabled: none },
        { id: "save", label: "Commit", title: "Commit changes to the database (Ctrl+S)", Icon: Save, onClick: a.save, disabled: none },
      ]}
    />
  );
}

// ---------------------------------------------------------------- keys

function useP6Keys(a: ClassicActions, find: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = !!el.closest("input, textarea, select, [contenteditable]");
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const st = useStore.getState();
      if (useP6.getState().dialog) return;
      if (ctrl && k === "f") {
        e.preventDefault();
        return find();
      }
      if (e.key === "F10") {
        e.preventDefault();
        return useP6.getState().open("level");
      }
      if (typing) return;
      if (useP6.getState().window !== "activities") {
        if (ctrl && k === "z") (e.preventDefault(), st.undo());
        else if (ctrl && k === "y") (e.preventDefault(), st.redo());
        return;
      }
      const act = (fn: () => void) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      };
      if (e.key === "Insert") act(addActivity);
      else if (e.key === "Delete" && st.selectedActivities.size) act(() => deleteSelected());
      else if (ctrl && k === "z" && !e.shiftKey) act(st.undo);
      else if ((ctrl && k === "y") || (ctrl && e.shiftKey && k === "z")) act(st.redo);
      else if (ctrl && k === "a") act(selectAll);
      else if (ctrl && k === "e") act(fillDownSelected);
      else if (ctrl && k === "l") act(() => linkSelected("FS"));
    };
    // Copy / cut / paste go through the clipboard events, so cells can travel to and from Excel.
    const inTable = (e: Event) => {
      const el = e.target instanceof Element ? e.target : document.activeElement;
      return !el?.closest("input, textarea, select, [contenteditable]") && !useP6.getState().dialog && useP6.getState().window === "activities";
    };
    const onCopy = (e: ClipboardEvent) => {
      if (!inTable(e) || !useStore.getState().selectedActivities.size || window.getSelection()?.toString()) return;
      e.preventDefault();
      const tsv = selectionTsv();
      e.clipboardData?.setData("text/plain", tsv);
      lastCopied.text = tsv;
      if (e.type === "cut") cutSelected();
      else copySelected();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!inTable(e)) return;
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      // Our own copy (or nothing): paste activities. Anything else, e.g. cells from Excel: paste into cells.
      if (!text || text === lastCopied.text) return paste();
      pasteIntoCells(text);
    };
    window.addEventListener("keydown", on, true);
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCopy);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", on, true);
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCopy);
      window.removeEventListener("paste", onPaste);
    };
  }, [a, find]);
}

// ---------------------------------------------------------------- lower pane

function LowerPane() {
  const schedule = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const lower = useLayout((s) => s.layout.lower);
  const tab = useLayout((s) => s.layout.lowerTab);
  const h = useLayout((s) => s.layout.lowerHeight);
  const set = useLayout((s) => s.set);
  const [profile, setProfile] = useState<null | "resourceProfile" | "activityProfile">(null);
  const act = schedule?.activities.find((x) => x.id === selected) ?? null;
  if (lower === "none" && !profile) return null;
  const grip = (e: React.MouseEvent) => {
    e.preventDefault();
    const y0 = e.clientY;
    const h0 = h;
    const move = (m: MouseEvent) => set({ lowerHeight: Math.max(90, Math.min(window.innerHeight - 220, h0 - (m.clientY - y0))) });
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const viewSel = (
    <select
      className="p6-lowersel"
      value={profile ?? lower}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "resourceProfile" || v === "activityProfile") {
          setProfile(v);
          set({ lower: "details" });
        } else {
          setProfile(null);
          set({ lower: v as LowerView });
        }
      }}
      title="Show on Bottom"
    >
      {LOWER_VIEWS.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
  let body: ReactNode;
  if (profile) body = profile === "resourceProfile" ? <ResourcePanel /> : <CostPanel />;
  else if (lower === "resourceUsage") body = <UsageSpreadsheet by="resource" />;
  else if (lower === "activityUsage") body = <UsageSpreadsheet by="activity" />;
  else if (lower === "trace") body = <TraceLogicView />;
  else
    body = (
      <>
        <div className="p6-tabs" role="tablist">
          {LOWER_TABS.map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => set({ lowerTab: id })}>
              {label}
            </button>
          ))}
        </div>
        <div className="p6-lowerbody">
          {tab === "wpdocs" ? act ? <ActivityDocs activityId={act.id} /> : <p className="muted">Select an activity.</p> : <ActivityEditor bare only={(LOWER_TABS.find((d) => d[0] === tab) ?? LOWER_TABS[0])[2]} />}
        </div>
      </>
    );
  return (
    <div className="p6-lower" style={{ flex: `0 0 ${h}px` }}>
      <div className="p6-lowergrip" onMouseDown={grip} title="Drag to resize" />
      <div className="p6-lowerhead">
        {viewSel}
        {!profile && lower === "details" && (
          <>
            <span>
              Activity <b>{act?.code ?? "—"}</b>
            </span>
            <span className="p6-actname">{act?.name ?? "No activity selected"}</span>
          </>
        )}
        <span className="spacer" />
        <span>
          Project <b>{schedule?.projectCode ?? "—"}</b>
        </span>
      </div>
      {body}
    </div>
  );
}

// ---------------------------------------------------------------- screen

export function P6Screen({ a, banners, status, displays }: { a: ClassicActions; banners: ReactNode; status: ReactNode; displays?: { menu: MenuItem[]; dialog?: ReactNode } }) {
  const schedule = useStore((s) => s.schedule);
  const filter = useStore((s) => s.ganttFilter);
  const setFilter = useStore((s) => s.setGanttFilter);
  const tracking = useStore((s) => s.ganttTracking);
  const setTracking = useStore((s) => s.setGanttTracking);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undoLabel = useStore((s) => s.past[s.past.length - 1]?.label);
  const redoLabel = useStore((s) => s.future[0]?.label);
  const sel = useStore((s) => s.selectedActivities);
  const clip = useStore((s) => s.clipboard);
  const user = useConfig((s) => s.config.user);
  const layout = useLayout((s) => s.layout);
  const custom = useLayout((s) => s.customFilters);
  const setLayout = useLayout((s) => s.set);
  const win = useP6((s) => s.window);
  const tabs = useP6((s) => s.tabs);
  // User Preferences › Application › Look: P6 Professional's classic Windows look by default.
  const look = usePrefs((p) => p.p6Look ?? "classic");
  useEffect(() => {
    document.documentElement.dataset.p6look = look;
    return () => {
      delete document.documentElement.dataset.p6look;
    };
  }, [look]);
  // User Preferences › Application › Startup Window.
  useEffect(() => {
    const w = usePrefs.getState().startupWindow;
    if (w) useP6.getState().show(w as P6Window);
  }, []);
  const P = useP6();
  const findRef = useRef<HTMLInputElement>(null);
  const none = !schedule;
  const n = sel.size;
  const find = useMemo(
    () => () => {
      useP6.getState().show("activities");
      setTimeout(() => findRef.current?.focus(), 0);
    },
    [],
  );
  useP6Keys(a, find);
  const toggle = (k: "showTable" | "showGantt" | "network") => setLayout({ [k]: !layout[k] } as Partial<typeof layout>);
  const recalc = () => {
    const s = useStore.getState().schedule;
    if (!s) return;
    const r = recalcAssignmentCosts(s);
    useStore.getState().commit(r.schedule, "Recalculate assignment costs");
    useStore.getState().setStatus(`Recalculated costs on ${r.changed} assignments from resource prices.`);
  };
  const exportHtml = () => {
    const rows = [...document.querySelectorAll(".p6t-pane .p6t-row")].map((r) => [...r.querySelectorAll(".p6t-td")].map((c) => c.textContent ?? ""));
    const head = [...document.querySelectorAll(".p6t-pane .p6t-th span")].map((c) => c.textContent ?? "");
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const html = `<!doctype html><meta charset="utf-8"><title>${esc(schedule?.projectName ?? "Layout")}</title><style>body{font:12px system-ui}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:2px 6px}</style><h3>${esc(`${schedule?.projectCode} – ${schedule?.projectName}`)}</h3><p>Data date ${fmtDate(schedule?.dataDate)} · ${esc(layout.name)} · visible rows</p><table><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
    saveFile(`${schedule?.projectCode ?? "layout"}.html`, html, "text/html");
  };

  const menus: [string, MenuItem[]][] = [
    [
      "File",
      [
        { label: "Open…", onClick: a.projects, shortcut: "Ctrl+O" },
        { label: "Commit Changes", onClick: a.save, disabled: none, shortcut: "Ctrl+S" },
        { label: "Save as New Project", onClick: a.saveAsNew, disabled: none },
        "sep",
        { label: "Page Setup…", onClick: () => P.open("pageSetup"), disabled: none },
        { label: "Print…", onClick: printLayout, disabled: none, shortcut: "Ctrl+P" },
        { label: "Publish Layout as HTML", onClick: exportHtml, disabled: none },
        { label: "Publish Project Web Site…", onClick: () => P.open("publishSite"), disabled: none },
        "sep",
        { label: "Import…", onClick: a.importSchedule },
        { label: "Import from P6 Connection…", onClick: a.importP6 },
        { label: "Export… (XER)", onClick: a.exportXer, disabled: none },
        { label: "Export… (Microsoft Project XML)", onClick: a.exportMspdi, disabled: none },
        { label: "Export to Excel (.xlsx) – current layout", onClick: () => void exportLayoutXlsx(), disabled: none },
        { label: "Import from Excel…", onClick: () => P.open("excelImport"), disabled: none },
        { label: "Export to CSV", onClick: a.exportCsv, disabled: none },
        "sep",
        { label: "Open Project File…", onClick: a.openFile },
        { label: "Save Project File", onClick: a.saveFile, disabled: none },
        "sep",
        { label: "Sample: 220 kV GIS Substation (UAE)", onClick: () => a.sample("gis") },
        ...(loginEnabled ? ["sep" as const, { label: "Sign Out", onClick: signOut }] : []),
        { label: "Sample: RC Building", onClick: () => a.sample("rc") },
      ],
    ],
    [
      "Edit",
      [
        { label: `Undo${undoLabel ? ` ${undoLabel}` : ""}`, onClick: () => useStore.getState().undo(), disabled: !canUndo, shortcut: "Ctrl+Z" },
        { label: `Redo${redoLabel ? ` ${redoLabel}` : ""}`, onClick: () => useStore.getState().redo(), disabled: !canRedo, shortcut: "Ctrl+Y" },
        "sep",
        { label: "Cut", onClick: cutSelected, disabled: !n, shortcut: "Ctrl+X" },
        { label: "Copy", onClick: copySelected, disabled: !n, shortcut: "Ctrl+C" },
        { label: "Paste", onClick: paste, disabled: !clip, shortcut: "Ctrl+V" },
        "sep",
        { label: "Add", onClick: addActivity, disabled: none, shortcut: "Ins" },
        { label: "Delete", onClick: () => deleteSelected(), disabled: !n, shortcut: "Del" },
        { label: "Dissolve", onClick: dissolveSelected, disabled: !n },
        { label: "Renumber Activity IDs…", onClick: () => P.open("renumber"), disabled: !n },
        { label: "Link Activities", onClick: () => linkSelected("FS"), disabled: n < 2, shortcut: "Ctrl+L" },
        { label: "Unlink Activities", onClick: unlinkSelected, disabled: n < 2 },
        { label: "Fill Down", onClick: fillDownSelected, disabled: n < 2, shortcut: "Ctrl+E" },
        { label: "Select All", onClick: selectAll, disabled: none, shortcut: "Ctrl+A" },
        "sep",
        { label: "Assign Predecessors…", onClick: () => P.open("assignPred"), disabled: n !== 1 },
        { label: "Assign Successors…", onClick: () => P.open("assignSucc"), disabled: n !== 1 },
        { label: "Assign Resources…", onClick: () => P.open("assignRes"), disabled: !n },
        { label: "Assign Roles…", onClick: () => P.open("assignRole"), disabled: !n },
        { label: "Assign Activity Codes…", onClick: () => P.open("assignCode"), disabled: !n },
        "sep",
        { label: "Find…", onClick: find, disabled: none, shortcut: "Ctrl+F" },
        { label: "Spell Check…", onClick: () => P.open("spelling"), disabled: none },
        { label: "User Preferences…", onClick: () => P.open("preferences") },
        { label: "Interface Settings…", onClick: () => a.settings("interface") },
      ],
    ],
    [
      "View",
      [
        { label: "Layout: Open…", onClick: () => P.open("layouts") },
        { label: "Layout: Save As…", onClick: () => P.open("layouts") },
        "sep",
        { label: "Show on Top: Activity Table", onClick: () => toggle("showTable"), checked: layout.showTable },
        { label: "Show on Top: Gantt Chart", onClick: () => setLayout({ showGantt: !layout.showGantt || layout.network || !!layout.tsld, network: false, tsld: false }), checked: layout.showGantt && !layout.network && !layout.tsld },
        { label: "Show on Top: Activity Network", onClick: () => setLayout({ network: !layout.network, tsld: false }), checked: layout.network && !layout.tsld },
        { label: "Show on Top: Timescaled Logic Diagram", onClick: () => setLayout({ tsld: !layout.tsld }), checked: !!layout.tsld },
        ...LOWER_VIEWS.filter(([v]) => v !== "resourceProfile" && v !== "activityProfile").map(([v, l]) => ({ label: `Show on Bottom: ${l}`, onClick: () => setLayout({ lower: v as LowerView }), checked: layout.lower === v })),
        "sep",
        { label: "Columns…", onClick: () => P.open("columns") },
        { label: "Filters…", onClick: () => P.open("filters") },
        { label: "Group and Sort…", onClick: () => P.open("groupSort") },
        { label: "Bar Chart Options…", onClick: () => P.open("bars") },
        { label: "Timescale…", onClick: () => P.open("timescale") },
        "sep",
        { label: "Expand All", onClick: expandAll, disabled: none },
        { label: "Collapse All", onClick: collapseAll, disabled: none },
        { label: "Collapse to WBS Level 1", onClick: () => expandToLevel(1), disabled: none },
        { label: "Collapse to WBS Level 2", onClick: () => expandToLevel(2), disabled: none },
        { label: "Collapse to WBS Level 3", onClick: () => expandToLevel(3), disabled: none },
        "sep",
        { label: "Zoom In", onClick: () => ganttCommand("zoom-in"), disabled: none },
        { label: "Zoom Out", onClick: () => ganttCommand("zoom-out"), disabled: none },
        { label: "Fit Timescale", onClick: () => ganttCommand("fit"), disabled: none },
        { label: "Go To Selected Activity", onClick: () => ganttCommand("scroll-to-selected"), disabled: !n },
        { label: "Spotlight", onClick: () => P.setSpotlight(!P.spotlight), checked: P.spotlight, disabled: none },
        { label: "Show Baseline Bars", onClick: () => setTracking(!tracking), checked: tracking },
        { label: "Show Progress Line", onClick: () => useLayout.getState().setBars({ progressLine: !layout.bars.progressLine }), checked: !!layout.bars.progressLine },
        ...(displays ? (["sep", ...displays.menu] as MenuItem[]) : []),
      ],
    ],
    [
      "Project",
      [
        { label: "Schedule…", onClick: () => P.open("scheduleRun"), disabled: none, shortcut: "F9" },
        { label: "Schedule Options…", onClick: () => P.open("scheduleOptions"), disabled: none },
        { label: "Level Resources…", onClick: () => P.open("level"), disabled: none, shortcut: "F10" },
        { label: "Check Schedule…", onClick: () => P.open("checkSchedule"), disabled: none },
        "sep",
        { label: "Maintain Baselines…", onClick: () => P.open("baselines"), disabled: none },
        { label: "Assign Baselines… (from XER / XML)", onClick: a.assignBaseline, disabled: none },
        "sep",
        { label: "Project Details…", onClick: () => P.open("projectInfo"), disabled: none },
        { label: "Budgets…", onClick: () => openBudgets(null), disabled: none },
        ...(a.pushP6 ? [{ label: "Send Progress to P6", onClick: a.pushP6 }] : []),
        "sep",
        { label: "Reports and Dashboards", onClick: a.dashboards },
      ],
    ],
    [
      "Enterprise",
      [
        { label: "Projects", onClick: () => P.show("projects") },
        { label: "Enterprise Project Structure…", onClick: () => P.open("eps") },
        { label: "Project Portfolios…", onClick: () => P.open("portfolios") },
        { label: "Capacity Planning…", onClick: () => P.open("capacity") },
        "sep",
        { label: "Resources", onClick: () => P.show("resources"), disabled: none },
        { label: "Roles…", onClick: () => P.open("roles"), disabled: none },
        { label: "Resource Rates and Shifts…", onClick: () => P.open("resourceRates"), disabled: none },
        { label: "Resource Shifts…", onClick: () => P.open("shifts"), disabled: none },
        { label: "Resource Curves…", onClick: () => P.open("curves"), disabled: none },
        { label: "Cost Accounts…", onClick: () => P.open("costAccounts"), disabled: none },
        { label: "OBS…", onClick: () => P.open("obs"), disabled: none },
        { label: "Risk Scoring Matrix…", onClick: () => P.open("riskMatrix"), disabled: none },
        { label: "Calendars…", onClick: () => P.open("calendars"), disabled: none },
        { label: "Activity Codes…", onClick: () => P.open("activityCodes"), disabled: none },
        { label: "Project Codes…", onClick: () => P.open("projectCodes") },
        { label: "Resource Codes…", onClick: () => P.open("resourceCodes"), disabled: none },
        { label: "Expense Categories…", onClick: () => P.open("expenseCategories"), disabled: none },
        { label: "User Defined Fields…", onClick: () => P.open("udfs"), disabled: none },
        { label: "P6 Connections…", onClick: () => a.settings("p6") },
      ],
    ],
    [
      "Tools",
      [
        { label: "Global Change…", onClick: () => P.open("globalChange"), disabled: none },
        { label: "Update Progress…", onClick: () => P.open("updateProgress"), disabled: none },
        { label: "Publish › Project Web Site…", onClick: () => P.open("publishSite"), disabled: none },
        { label: "Top-Down Estimation…", onClick: () => P.open("topDown"), disabled: none },
        {
          label: "Estimate Progress (selected)",
          onClick: () => {
            const st = useStore.getState();
            if (!st.schedule) return;
            const r = estimateProgress(st.schedule, st.selectedActivities.size ? st.selectedActivities : undefined);
            st.commit(r.schedule, "Estimate progress");
            st.setStatus(`Estimated progress to the data date: ${r.started} started, ${r.finished} finished, ${r.progressed} in progress.`);
          },
          disabled: none,
        },
        {
          label: "Remove Progress (selected)",
          onClick: () => {
            const st = useStore.getState();
            if (!st.schedule || !st.selectedActivities.size || !window.confirm(`Remove all progress from ${st.selectedActivities.size} activities?`)) return;
            const r = removeProgress(st.schedule, st.selectedActivities);
            st.commit(r.schedule, "Remove progress");
            st.setStatus(`Removed progress from ${r.changed} activities. Press F9 to reschedule.`);
          },
          disabled: !n,
        },
        { label: "Store Period Performance…", onClick: () => P.open("periods"), disabled: none },
        { label: "Recalculate Assignment Costs", onClick: recalc, disabled: none },
        { label: "Check Schedule…", onClick: () => P.open("checkSchedule"), disabled: none },
        { label: "Claim Digger (compare schedules)…", onClick: () => P.open("claimDigger"), disabled: none },
        { label: "Schedule Log…", onClick: () => P.open("scheduleLog"), disabled: none },
        { label: "Spell Check…", onClick: () => P.open("spelling"), disabled: none },
        "sep",
        { label: "Reports", onClick: a.dashboards },
        { label: "Scheduled Emails", onClick: a.dashboards },
      ],
    ],
    [
      "Admin",
      [
        { label: "Users…", onClick: () => a.settings("users") },
        { label: "Database…", onClick: () => a.settings("data") },
        { label: "Email (SMTP)…", onClick: () => a.settings("email") },
        "sep",
        { label: "Financial Period Calendar…", onClick: () => P.open("financialPeriods"), disabled: none },
        { label: "Preferences…", onClick: () => a.settings("interface") },
      ],
    ],
    [
      "Help",
      [
        { label: "Training Mode…", onClick: () => useTraining.getState().openCatalog(true) },
        { label: "Getting Started", onClick: a.help, shortcut: "?" },
      ],
    ],
  ];

  const quick = [...FILTERS, ...custom.map((f) => [`custom:${f.id}`, f.name] as [string, string])];

  const windowBody = (() => {
    if (!schedule && win !== "projects" && win !== "tracking") return <EmptySample a={a} />;
    switch (win) {
      case "wbs":
        return <WbsWindow />;
      case "resources":
        return <ResourcesWindow />;
      case "assignments":
        return <AssignmentsWindow />;
      case "projects":
        return a.openOne ? <EnterpriseProjectsWindow onOpenOne={a.openOne} onImport={a.projects} onImportToDb={a.importToDb} onSave={a.saveDb} /> : <ProjectsWindow onOpen={a.projects} />;
      case "tracking":
        return <TrackingWindow onDashboards={a.dashboards} />;
      case "documents":
      case "expenses":
      case "thresholds":
      case "issues":
      case "risks":
        return <RegisterWindow kind={win} />;
      default:
        return (
          <>
            <div className="p6-layoutbar">
              <button className="p6-layoutbtn" onClick={() => P.open("layouts")} title="Open or save a layout">
                Layout: {layout.name} <ChevronDown size={12} aria-hidden />
              </button>
              <label className="p6-drop">
                Filter:
                <select
                  value={filter.kind !== "all" ? filter.kind : layout.filters.length === 1 && custom.some((f) => f.id === layout.filters[0]) ? `custom:${layout.filters[0]}` : "all"}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v.startsWith("custom:")) {
                      setFilter({ kind: "all" });
                      setLayout({ filters: [v.slice(7)] });
                    } else {
                      setFilter({ kind: v as GanttFilterKind });
                      if (v === "all") setLayout({ filters: [] });
                    }
                  }}
                >
                  {quick.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <button className="p6-drop p6-blbtn" onClick={() => setTracking(!tracking)} aria-pressed={tracking} title="Show baseline bars under each activity">
                {tracking ? "✓ " : ""}Baseline bars
              </button>
              {layout.filters.length > 0 && (
                <button className="p6-drop" onClick={() => P.open("filters")} title="Layout filters in use">
                  <Filter size={12} aria-hidden /> {layout.filters.length} filter{layout.filters.length > 1 ? "s" : ""}
                </button>
              )}
              <span className="spacer" />
              <input ref={findRef} className="p6-find" placeholder="Find activity ID or name" value={filter.text} onChange={(e) => setFilter({ text: e.target.value })} />
            </div>
            <div className="p6-upper">{layout.tsld ? <TsldView /> : layout.network ? <NetworkView /> : <ActivityTable onSchedule={a.schedule} />}</div>
            <LowerPane />
          </>
        );
    }
  })();

  return (
    <div className="classic p6-app">
      <div className="cl-titlebar">
        <img className="cl-logo logo-light" src="./stratum-logo.png" alt="Stratum 4D" />
        <img className="cl-logo logo-dark" src="./stratum-logo-dark.png" alt="" aria-hidden />
        <span className="cl-title">{schedule ? `${WINDOW_LABEL[win]} : ${schedule.projectCode} – ${schedule.projectName}` : WINDOW_LABEL[win]}</span>
        <span className="spacer" />
        <ModeSwitch />
        {displays && (
          <button className="tb cl-train" onClick={() => (displays.menu[0] as { onClick: () => void }).onClick()} title="Displays: open views in their own windows, one per monitor">
            <MonitorUp size={14} aria-hidden /> Displays
          </button>
        )}
        <TrainingButton className="tb cl-train" />
        <ThemeButton />
      </div>
      <MenuBar className="cl-menubar" menus={menus} />
      <div className="cl-toolbar p6-toolbar">
        <IconBtn Icon={FolderOpen} title="Open project (Ctrl+O)" onClick={a.projects} />
        <IconBtn Icon={Save} title="Commit changes (Ctrl+S)" onClick={a.save} disabled={none} />
        <span className="tsep" />
        <IconBtn Icon={Printer} title="Print" onClick={printLayout} disabled={none} />
        <IconBtn Icon={PencilRuler} title="Page Setup" onClick={() => P.open("pageSetup")} disabled={none} />
        <IconBtn Icon={FileInput} title="Import XER / XML" onClick={a.importSchedule} />
        <IconBtn Icon={FileOutput} title="Export XER" onClick={a.exportXer} disabled={none} />
        <span className="tsep" />
        <IconBtn Icon={Undo2} title={`Undo${undoLabel ? `: ${undoLabel}` : ""} (Ctrl+Z)`} onClick={() => useStore.getState().undo()} disabled={!canUndo} />
        <IconBtn Icon={Redo2} title={`Redo${redoLabel ? `: ${redoLabel}` : ""} (Ctrl+Y)`} onClick={() => useStore.getState().redo()} disabled={!canRedo} />
        <span className="tsep" />
        <IconBtn Icon={LayoutPanelTop} title="Layout: open or save" onClick={() => P.open("layouts")} />
        <IconBtn Icon={Table2} title="Show/hide the activity table" onClick={() => toggle("showTable")} disabled={none} />
        <IconBtn Icon={ChartGantt} title="Show/hide the Gantt chart" onClick={() => toggle("showGantt")} disabled={none} />
        <IconBtn Icon={PanelBottom} title="Show/hide the bottom pane" onClick={() => setLayout({ lower: layout.lower === "none" ? "details" : "none" })} disabled={none} />
        <IconBtn Icon={Network} title="Activity Network" onClick={() => setLayout({ network: !layout.network, tsld: false })} disabled={none} />
        <IconBtn Icon={GitCommitHorizontal} title="Timescaled Logic Diagram" onClick={() => setLayout({ tsld: !layout.tsld })} disabled={none} />
        <span className="tsep" />
        <IconBtn Icon={Columns3} title="Columns" onClick={() => P.open("columns")} disabled={none} />
        <IconBtn Icon={Filter} title="Filters" onClick={() => P.open("filters")} disabled={none} />
        <IconBtn Icon={Layers} title="Group and Sort" onClick={() => P.open("groupSort")} disabled={none} />
        <IconBtn Icon={ChartNoAxesGantt} title="Bar Chart Options" onClick={() => P.open("bars")} disabled={none} />
        <IconBtn Icon={CalendarRange} title="Timescale" onClick={() => P.open("timescale")} disabled={none} />
        <IconBtn Icon={ZoomIn} title="Zoom in" onClick={() => ganttCommand("zoom-in")} disabled={none} />
        <IconBtn Icon={ZoomOut} title="Zoom out" onClick={() => ganttCommand("zoom-out")} disabled={none} />
        <IconBtn Icon={MoveHorizontal} title="Fit timescale" onClick={() => ganttCommand("fit")} disabled={none} />
        <span className="tsep" />
        <IconBtn Icon={Calculator} title="Schedule (F9)" onClick={() => P.open("scheduleRun")} disabled={none} />
        <IconBtn Icon={BarChart3} title="Level Resources (F10)" onClick={() => P.open("level")} disabled={none} />
        <IconBtn Icon={CalendarClock} title="Update Progress" onClick={() => P.open("updateProgress")} disabled={none} />
        <IconBtn Icon={Wand2} title="Global Change" onClick={() => P.open("globalChange")} disabled={none} />
        <IconBtn Icon={Flag} title="Maintain Baselines" onClick={() => P.open("baselines")} disabled={none} />
        <IconBtn Icon={ClipboardCheck} title="Check Schedule" onClick={() => P.open("checkSchedule")} disabled={none} />
        <span className="tsep" />
        <IconBtn Icon={Highlighter} title="Spotlight the next update period" onClick={() => P.setSpotlight(!P.spotlight)} disabled={none} />
        <IconBtn Icon={GitBranch} title="Trace Logic" onClick={() => setLayout({ lower: layout.lower === "trace" ? "details" : "trace" })} disabled={none} />
        <IconBtn Icon={NotebookPen} title="Notebook" onClick={() => setLayout({ lower: "details", lowerTab: "notebook" })} disabled={none} />
        <IconBtn Icon={SlidersHorizontal} title="Project details" onClick={() => P.open("projectInfo")} disabled={none} />
        <span className="tsep" />
        {displays && <IconBtn Icon={MonitorUp} title="Displays: open views on other monitors" onClick={() => displays.menu[0] && (displays.menu[0] as { onClick: () => void }).onClick()} />}
        <IconBtn Icon={LayoutDashboard} title="Reports and dashboards" onClick={a.dashboards} />
        <IconBtn Icon={ChartLine} title="Resource Usage Spreadsheet" onClick={() => setLayout({ lower: "resourceUsage" })} disabled={none} />
        <IconBtn Icon={Search} title="Find (Ctrl+F)" onClick={find} disabled={none} />
        <IconBtn Icon={CircleHelp} title="Help" onClick={a.help} />
        <span className="spacer" />
        <select className="p6-stock" value="" onChange={(e) => e.target.value && useLayout.getState().open(STOCK_LAYOUTS.find((l) => l.name === e.target.value)!)} title="Quick layouts" disabled={none}>
          <option value="">Quick layout…</option>
          {STOCK_LAYOUTS.map((l) => (
            <option key={l.name}>{l.name}</option>
          ))}
        </select>
      </div>
      {banners}
      <div className="p6-body">
        <DirectoryBar a={a} />
        <div className="p6-window">
          <div className="p6-wintabs">
            {tabs.map((t) => (
              <span key={t} className={`p6-wintab ${t === win ? "active" : ""}`} onClick={() => P.show(t)} role="tab" aria-selected={t === win}>
                {WINDOW_LABEL[t]}
                {tabs.length > 1 && (
                  <button
                    className="p6-tabx"
                    aria-label={`Close ${WINDOW_LABEL[t]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      P.closeTab(t);
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
          {windowBody}
        </div>
        <CommandBar a={a} />
      </div>
      <div className="cl-statusbar p6-status">
        <span>Portfolio: All Projects</span>
        <span>Access Mode: Shared</span>
        <DataDateInput label="Data Date" />
        <span title={schedule?.baselineInfo ? `Assigned ${new Date(schedule.baselineInfo.assignedAt).toLocaleString()}: ${schedule.baselineInfo.matched} activities matched` : "Baseline dates as imported"}>
          Baseline: {schedule?.baselineInfo ? `${schedule.baselineInfo.name} (DD ${fmtDate(schedule.baselineInfo.dataDate)})` : "Project Baseline"}
        </span>
        <span>User: {user?.name ?? "Local user"}</span>
        <span>DB: {a.dbLabel}</span>
        <span className="spacer" />
        <span className="cl-msg">{status}</span>
      </div>
      <P6Dialogs onSchedule={a.schedule} onAssignFile={a.assignBaseline} displays={displays?.dialog} />
      <ContextMenuHost />
    </div>
  );
}
