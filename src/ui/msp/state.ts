// UI state of the MS Project layout: current view, table, Format options,
// open dialog and calculation mode. Kept apart from the schedule store so the
// P6 and 4D layouts are not affected.

import { create } from "zustand";

export type MspView = "gantt" | "tracking" | "task-sheet" | "task-usage" | "network" | "calendar" | "team-planner" | "resource-sheet" | "resource-usage" | "resource-graph";
export type MspTable = "entry" | "schedule" | "tracking" | "cost" | "variance" | "work" | "summary" | "earned";
export type MspDialog =
  | "taskInfo"
  | "projectInfo"
  | "statistics"
  | "workingTime"
  | "setBaseline"
  | "clearBaseline"
  | "assignResources"
  | "resourceInfo"
  | "options"
  | "updateProject"
  | "moveProject"
  | "levelOptions"
  | "columns"
  | "timescale"
  | "barStyles"
  | "sort"
  | "groupBy"
  | "filter"
  | "recurring"
  | "customFields"
  | null;
export type MspFilter = "all" | "active" | "completed" | "incomplete" | "critical" | "late" | "milestones" | "summary" | "manual" | "deadline" | "slipping" | "date-range";
export type MspGroup = "none" | "critical" | "milestones" | "status" | "priority" | "duration" | "resource" | "task-mode";
export type MspSort = "id" | "start" | "finish" | "priority" | "duration" | "name" | "cost";

export interface MspFormat {
  criticalTasks: boolean;
  slack: boolean;
  lateTasks: boolean;
  baseline: boolean;
  outlineNumber: boolean;
  projectSummary: boolean;
  summaryTasks: boolean;
  linkLines: boolean;
  /** Gridlines between rows in the chart. */
  gridlines: boolean;
  /** Bar text: resource names to the right of task bars. */
  barText: "resources" | "name" | "none";
  /** Format › Task Path for the selected task. */
  taskPath: "none" | "predecessors" | "driving" | "successors";
}

export const DEFAULT_FORMAT: MspFormat = { criticalTasks: false, slack: false, lateTasks: false, baseline: false, outlineNumber: false, projectSummary: false, summaryTasks: true, linkLines: true, gridlines: false, barText: "resources", taskPath: "none" };

interface MspState {
  view: MspView;
  table: MspTable;
  /** Extra columns added with "Add New Column", per table. */
  extraCols: Partial<Record<MspTable, string[]>>;
  /** Columns hidden with Hide Column, per table. */
  hiddenCols: Partial<Record<MspTable, string[]>>;
  format: MspFormat;
  filter: MspFilter;
  dateRange: [number, number] | null;
  /** Highlight instead of hiding (MS Project's Highlight drop-down). */
  highlight: MspFilter;
  group: MspGroup;
  sort: { by: MspSort; desc: boolean };
  dialog: MspDialog;
  /** Tab to open the dialog on. */
  dialogTab?: string;
  /** Automatic calculation (File › Options › Schedule › Calculation). */
  autoCalc: boolean;
  /** Chart zoom in pixels per day. */
  pxPerDay: number;
  showTimeline: boolean;
  details: boolean;
  /** Split between sheet and chart (sheet width in px). */
  sheetWidth: number;
  /** Selected summary rows (tasks are in the schedule store's selection). */
  selWbs: Set<string>;
  /** Selected resource in the Resource Sheet. */
  selRes: string | null;
  set: (patch: Partial<Omit<MspState, "set" | "open" | "setFormat">>) => void;
  setFormat: (patch: Partial<MspFormat>) => void;
  open: (d: MspDialog, tab?: string) => void;
}

const KEY = "stratum.msp.ui.v1";
const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<MspState>;
  } catch {
    return {};
  }
})();

export const useMsp = create<MspState>((set) => ({
  view: "gantt",
  table: "entry",
  extraCols: saved.extraCols ?? {},
  hiddenCols: saved.hiddenCols ?? {},
  format: { ...DEFAULT_FORMAT, ...(saved.format ?? {}) },
  filter: "all",
  dateRange: null,
  highlight: "all",
  group: "none",
  sort: { by: "id", desc: false },
  dialog: null,
  autoCalc: saved.autoCalc ?? true,
  pxPerDay: saved.pxPerDay ?? 12,
  showTimeline: saved.showTimeline ?? true,
  details: false,
  sheetWidth: saved.sheetWidth ?? 640,
  selWbs: new Set(),
  selRes: null,
  set: (patch) => set(patch),
  setFormat: (patch) => set((s) => ({ format: { ...s.format, ...patch } })),
  open: (dialog, dialogTab) => set({ dialog, dialogTab }),
}));

// Keep layout choices between sessions.
useMsp.subscribe((s) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ extraCols: s.extraCols, hiddenCols: s.hiddenCols, format: s.format, autoCalc: s.autoCalc, pxPerDay: s.pxPerDay, showTimeline: s.showTimeline, sheetWidth: s.sheetWidth }));
  } catch {
    /* storage blocked */
  }
});

export const ZOOM_STEPS = [0.4, 0.8, 1.6, 3, 6, 12, 24, 48];
export const zoomIn = () => useMsp.setState((s) => ({ pxPerDay: ZOOM_STEPS.find((z) => z > s.pxPerDay + 0.01) ?? s.pxPerDay }));
export const zoomOut = () => useMsp.setState((s) => ({ pxPerDay: [...ZOOM_STEPS].reverse().find((z) => z < s.pxPerDay - 0.01) ?? s.pxPerDay }));
