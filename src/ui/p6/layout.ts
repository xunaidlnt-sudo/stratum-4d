// P6 layout: which columns show, how activities are grouped, sorted and
// filtered, what the bars look like, the timescale and which panes are open.
// Layouts can be saved by name, as in P6's Layout > Save As.

import { create } from "zustand";
import { STANDARD_FILTERS, type FilterDef } from "../../core/fields";

export interface ColumnSpec {
  id: string;
  width?: number;
}

export interface SortSpec {
  field: string;
  desc?: boolean;
}

export interface BarOptions {
  actual: boolean;
  remaining: boolean;
  critical: boolean;
  baseline: boolean;
  float: boolean;
  relationships: boolean;
  /** Text shown to the right of each bar: a field id, or "" for none. */
  rightLabel: string;
  /** Text shown inside the bar. */
  insideLabel: string;
  dataDateLine: boolean;
  summaryBars: boolean;
  /** P6 progress line: joins each activity's progress point to the data date line. */
  progressLine?: boolean;
}

export type TimescaleUnit = "auto" | "day" | "week" | "month" | "quarter" | "year";
export type GroupBy = "wbs" | "none" | string;
export type LowerTab = "general" | "status" | "resources" | "predecessors" | "successors" | "relationships" | "codes" | "steps" | "notebook" | "udf" | "feedback" | "summary";
export type LowerView = "details" | "resourceUsage" | "activityUsage" | "trace" | "none";

export interface P6Layout {
  name: string;
  columns: ColumnSpec[];
  groupBy: GroupBy;
  /** Show group totals (dates rolled up) on band rows. */
  groupTotals: boolean;
  sort: SortSpec[];
  /** Active filter ids (standard or custom). Empty = all activities. */
  filters: string[];
  filterMatch: "all" | "any";
  /** Filtered-out activities are hidden (P6 "Replace activities shown") or only highlighted. */
  filterMode: "replace" | "highlight";
  bars: BarOptions;
  timescale: TimescaleUnit;
  /** Zoom factor for the bar chart. */
  zoom: number;
  showTable: boolean;
  showGantt: boolean;
  lower: LowerView;
  lowerTab: LowerTab;
  lowerHeight: number;
  /** Table pane width in px when the Gantt also shows. */
  tableWidth: number;
  /** Activity Network instead of the Gantt chart. */
  network: boolean;
  rowHeight: number;
}

export const DEFAULT_COLUMNS: ColumnSpec[] = [
  { id: "code" },
  { id: "name" },
  { id: "od" },
  { id: "rd" },
  { id: "pct" },
  { id: "start" },
  { id: "finish" },
  { id: "tf" },
];

export const DEFAULT_LAYOUT: P6Layout = {
  name: "Classic Schedule Layout",
  columns: DEFAULT_COLUMNS,
  groupBy: "wbs",
  groupTotals: true,
  sort: [{ field: "start" }],
  filters: [],
  filterMatch: "any",
  filterMode: "replace",
  bars: {
    actual: true,
    remaining: true,
    critical: true,
    baseline: false,
    float: false,
    relationships: false,
    rightLabel: "",
    insideLabel: "",
    dataDateLine: true,
    summaryBars: true,
  },
  timescale: "auto",
  zoom: 1,
  showTable: true,
  showGantt: true,
  lower: "details",
  lowerTab: "general",
  lowerHeight: 230,
  tableWidth: 800,
  network: false,
  rowHeight: 20,
};

/** P6's other stock layouts. */
export const STOCK_LAYOUTS: P6Layout[] = [
  DEFAULT_LAYOUT,
  {
    ...DEFAULT_LAYOUT,
    name: "Baseline Comparison",
    columns: [{ id: "code" }, { id: "name" }, { id: "start" }, { id: "finish" }, { id: "blStart" }, { id: "blFinish" }, { id: "startVar" }, { id: "finishVar" }],
    bars: { ...DEFAULT_LAYOUT.bars, baseline: true },
  },
  {
    ...DEFAULT_LAYOUT,
    name: "Update Progress",
    columns: [{ id: "code" }, { id: "name" }, { id: "status" }, { id: "actualStart" }, { id: "actualFinish" }, { id: "pct" }, { id: "rd" }, { id: "start" }, { id: "finish" }],
    lower: "details",
    lowerTab: "status",
  },
  {
    ...DEFAULT_LAYOUT,
    name: "Critical Path",
    columns: [{ id: "code" }, { id: "name" }, { id: "rd" }, { id: "start" }, { id: "finish" }, { id: "tf" }, { id: "ff" }, { id: "preds" }],
    filters: ["critical"],
    groupBy: "none",
    sort: [{ field: "start" }, { field: "tf" }],
    bars: { ...DEFAULT_LAYOUT.bars, relationships: true, float: true },
  },
  {
    ...DEFAULT_LAYOUT,
    name: "Logic Review",
    columns: [{ id: "code" }, { id: "name" }, { id: "type" }, { id: "od" }, { id: "preds" }, { id: "succs" }, { id: "constraint" }, { id: "tf" }],
    bars: { ...DEFAULT_LAYOUT.bars, relationships: true },
  },
  {
    ...DEFAULT_LAYOUT,
    name: "Cost Loading",
    columns: [{ id: "code" }, { id: "name" }, { id: "resources" }, { id: "budgetUnits" }, { id: "budgetCost" }, { id: "actualCost" }, { id: "remainingCost" }, { id: "atCompletionCost" }],
    showGantt: false,
    lower: "resourceUsage",
  },
];

/** Display windows (#display=<view>&id=<id>) keep their own layout. */
const DISPLAY = typeof location !== "undefined" ? /[#&]display=([^&]+)&id=([^&]+)/.exec(location.hash) : null;
const KEY = DISPLAY ? `stratum.p6.layout.v1.d.${DISPLAY[2]}` : "stratum.p6.layout.v1";

/** Starting layout for a display window showing one view. */
export function displayDefault(view: string | undefined): P6Layout {
  const upd = STOCK_LAYOUTS.find((l) => l.name === "Update Progress")!;
  switch (view) {
    case "table":
      return { ...DEFAULT_LAYOUT, showGantt: false, lower: "none" };
    case "gantt":
      return { ...DEFAULT_LAYOUT, showTable: false, lower: "none", bars: { ...DEFAULT_LAYOUT.bars, relationships: true } };
    case "progress":
      return { ...upd, showGantt: false, lower: "none", name: "Update Progress" };
    default:
      return { ...DEFAULT_LAYOUT, lower: "none" };
  }
}
const KEY_SAVED = "stratum.p6.layouts.v1";
const KEY_FILTERS = "stratum.p6.filters.v1";

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private window or full */
  }
}

/** Fill in fields added after a layout was saved. */
const complete = (l: Partial<P6Layout>): P6Layout => ({ ...DEFAULT_LAYOUT, ...l, bars: { ...DEFAULT_LAYOUT.bars, ...(l.bars ?? {}) } });

interface LayoutState {
  layout: P6Layout;
  saved: P6Layout[];
  customFilters: FilterDef[];
  set: (patch: Partial<P6Layout>) => void;
  setBars: (patch: Partial<BarOptions>) => void;
  open: (l: P6Layout) => void;
  saveAs: (name: string) => void;
  remove: (name: string) => void;
  saveFilter: (f: FilterDef) => void;
  deleteFilter: (id: string) => void;
}

export const useLayout = create<LayoutState>((set, get) => ({
  layout: complete(read<Partial<P6Layout>>(KEY, DISPLAY ? displayDefault(decodeURIComponent(DISPLAY[1])) : DEFAULT_LAYOUT)),
  saved: read<P6Layout[]>(KEY_SAVED, []).map(complete),
  customFilters: read<FilterDef[]>(KEY_FILTERS, []),
  set: (patch) => {
    set({ layout: { ...get().layout, ...patch } });
    write(KEY, get().layout);
  },
  setBars: (patch) => {
    set({ layout: { ...get().layout, bars: { ...get().layout.bars, ...patch } } });
    write(KEY, get().layout);
  },
  open: (l) => {
    set({ layout: complete(structuredClone(l)) });
    write(KEY, get().layout);
  },
  saveAs: (name) => {
    const l = { ...get().layout, name };
    const saved = [...get().saved.filter((x) => x.name !== name), l];
    set({ layout: l, saved });
    write(KEY, l);
    write(KEY_SAVED, saved);
  },
  remove: (name) => {
    const saved = get().saved.filter((x) => x.name !== name);
    set({ saved });
    write(KEY_SAVED, saved);
  },
  saveFilter: (f) => {
    const customFilters = [...get().customFilters.filter((x) => x.id !== f.id), f];
    set({ customFilters });
    write(KEY_FILTERS, customFilters);
  },
  deleteFilter: (id) => {
    const customFilters = get().customFilters.filter((x) => x.id !== id);
    set({ customFilters, layout: { ...get().layout, filters: get().layout.filters.filter((x) => x !== id) } });
    write(KEY_FILTERS, customFilters);
    write(KEY, get().layout);
  },
}));

export const allFilters = (custom: FilterDef[]) => [...STANDARD_FILTERS, ...custom];
