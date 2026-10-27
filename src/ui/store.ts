import { create } from "zustand";
import { expandElements } from "../core/motion";
import { DEFAULT_PROFILES } from "../core/profiles";
import { DEFAULT_SIM_OPTIONS, scheduleRange, type SimulationOptions } from "../core/simulation";
import type {
  Activity,
  AppearanceProfile,
  Assignment,
  ElementGroup,
  ElementSegment,
  Link,
  LinkRule,
  ModelElement,
  MotionPath,
  Relationship,
  Schedule,
} from "../core/types";
import type { ScheduleDiff } from "../core/update";
import type { Clip } from "../core/ops";
import { monthShort } from "../core/dates";

export type SideTab = "selection" | "rules" | "profiles" | "display" | "check" | "tools";
export type LeftTab = "gantt" | "activity" | "cost" | "resources" | "quantities";

const DAY = 86_400_000;

export interface ScheduleReport {
  at: number;
  projectFinish: number;
  previousFinish: number | null;
  criticalCount: number;
  warnings: string[];
  error?: string;
}

export type GanttFilterKind = "all" | "critical" | "not-started" | "in-progress" | "complete" | "late" | "milestones";

export interface AppState {
  schedule: Schedule | null;
  /** Elements as loaded from the model. */
  baseElements: ModelElement[];
  /** Elements the app works with: split parents replaced by segments, group names added. */
  elements: ModelElement[];
  segments: ElementSegment[];
  groups: ElementGroup[];
  paths: MotionPath[];
  modelFileName: string | null;
  links: Link[];
  rules: LinkRule[];
  profiles: AppearanceProfile[];
  selectedElements: Set<string>;
  selectedActivity: string | null;
  /** All selected activities (P6 multi-select); always contains selectedActivity when set. */
  selectedActivities: Set<string>;
  /** Undo / redo history of schedule edits. */
  past: { s: Schedule; label: string }[];
  future: { s: Schedule; label: string }[];
  clipboard: Clip | null;
  time: number;
  playing: boolean;
  /** Playback speed in schedule days per real second. */
  speed: number;
  sim: SimulationOptions;
  status: string;
  busy: boolean;
  collapsedWbs: Set<string>;
  /** Activity filter used by the P6 and MS Project layouts (text plus a preset). */
  ganttFilter: { text: string; kind: GanttFilterKind };
  /** Show baseline bars and colour critical work (P6 "baseline bars", MS Project "Tracking Gantt"). */
  ganttTracking: boolean;
  lastUpdate: (ScheduleDiff & { droppedLinks: number; keptLinks: number; at: number }) | null;
  sideTab: SideTab;
  leftTab: LeftTab;
  /** True when the schedule was edited since the last CPM run. */
  scheduleDirty: boolean;
  scheduleReport: ScheduleReport | null;
  /** Path being drawn in the viewport. */
  pathDraft: [number, number, number][] | null;
  /** Database identity of the open project (null = not saved to the database yet). */
  currentProjectId: string | null;
  currentVersion: number | null;
  /** Full-screen views over the workspace. */
  view: "workspace" | "dashboards";
  dialog: null | "projects" | "settings" | "p6";

  setLastUpdate: (u: AppState["lastUpdate"]) => void;
  setSideTab: (t: SideTab) => void;
  setLeftTab: (t: LeftTab) => void;
  setSchedule: (s: Schedule | null, opts?: { keepTime?: boolean; dirty?: boolean }) => void;
  setModel: (elements: ModelElement[], fileName: string | null) => void;
  setSegments: (s: ElementSegment[]) => void;
  setGroups: (g: ElementGroup[]) => void;
  setPaths: (p: MotionPath[]) => void;
  setPathDraft: (p: [number, number, number][] | null) => void;
  setCurrentProject: (id: string | null, version: number | null) => void;
  setView: (v: AppState["view"]) => void;
  setDialog: (d: AppState["dialog"]) => void;
  setLinks: (links: Link[]) => void;
  setRules: (rules: LinkRule[]) => void;
  setProfiles: (p: AppearanceProfile[]) => void;
  selectElements: (ids: Set<string>) => void;
  selectActivity: (id: string | null) => void;
  /** Replace the activity selection; `primary` becomes the focused activity. */
  setActivitySelection: (ids: Set<string>, primary?: string | null) => void;
  /** Apply an edited schedule as one undoable step. */
  commit: (s: Schedule, label: string, select?: string[]) => void;
  undo: () => void;
  redo: () => void;
  setClipboard: (c: Clip | null) => void;
  setTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSpeed: (s: number) => void;
  setSim: (patch: Partial<SimulationOptions>) => void;
  setStatus: (msg: string, busy?: boolean) => void;
  toggleWbs: (id: string) => void;
  setCollapsedWbs: (ids: Set<string>) => void;
  setGanttFilter: (f: Partial<AppState["ganttFilter"]>) => void;
  setGanttTracking: (on: boolean) => void;
  setScheduleReport: (r: ScheduleReport | null) => void;

  // Schedule editing
  updateActivity: (id: string, patch: Partial<Activity>) => void;
  addActivity: (a: Activity) => void;
  deleteActivity: (id: string) => void;
  addRelationship: (r: Relationship) => void;
  updateRelationship: (id: string, patch: Partial<Relationship>) => void;
  deleteRelationship: (id: string) => void;
  upsertAssignment: (a: Assignment) => void;
  deleteAssignment: (id: string) => void;
}

function derive(base: ModelElement[], segments: ElementSegment[], groups: ElementGroup[]) {
  return expandElements(base, segments, groups);
}

const HISTORY = 60;

export const useStore = create<AppState>((set) => {
  // Typing in a field edits the schedule on every key: fold quick repeats of the same edit into one undo step.
  let lastEdit = { label: "", at: 0 };
  const editSchedule = (fn: (s: Schedule) => Schedule, label = "Edit") =>
    set((st) => {
      if (!st.schedule) return {};
      const now = Date.now();
      const fold = lastEdit.label === label && now - lastEdit.at < 1200 && st.past.length > 0;
      lastEdit = { label, at: now };
      const past = fold ? st.past : [...st.past.slice(-HISTORY + 1), { s: st.schedule, label }];
      return { schedule: fn(st.schedule), scheduleDirty: true, past, future: [] };
    });

  return {
    schedule: null,
    baseElements: [],
    elements: [],
    segments: [],
    groups: [],
    paths: [],
    modelFileName: null,
    links: [],
    rules: [],
    profiles: structuredClone(DEFAULT_PROFILES),
    selectedElements: new Set(),
    selectedActivity: null,
    selectedActivities: new Set(),
    past: [],
    future: [],
    clipboard: null,
    time: Date.now(),
    playing: false,
    speed: 7,
    sim: DEFAULT_SIM_OPTIONS,
    status: "Load a P6 XER or MS Project schedule and an IFC model, or open the demo.",
    busy: false,
    collapsedWbs: new Set(),
    ganttFilter: { text: "", kind: "all" },
    ganttTracking: false,
    lastUpdate: null,
    sideTab: "selection",
    leftTab: "gantt",
    scheduleDirty: false,
    scheduleReport: null,
    pathDraft: null,
    currentProjectId: null,
    currentVersion: null,
    view: "workspace",
    dialog: null,

    setLastUpdate: (lastUpdate) => set({ lastUpdate }),
    setSideTab: (sideTab) => set({ sideTab }),
    setLeftTab: (leftTab) => set({ leftTab }),
    setSchedule: (schedule, opts = {}) =>
      set((st) => {
        if (!schedule) return { schedule, selectedActivity: null, selectedActivities: new Set<string>(), scheduleDirty: false, past: [], future: [] };
        const r = scheduleRange(schedule);
        const time = opts.keepTime ? st.time : schedule.dataDate ?? r?.start ?? Date.now();
        const ids = opts.keepTime && st.selectedActivities.size ? new Set(schedule.activities.map((a) => a.id)) : null;
        const keepSel = !!ids && !!st.selectedActivity && ids.has(st.selectedActivity);
        return {
          schedule,
          time,
          selectedActivity: keepSel ? st.selectedActivity : null,
          selectedActivities: ids ? new Set([...st.selectedActivities].filter((x) => ids.has(x))) : new Set<string>(),
          ...(opts.keepTime ? {} : { past: [], future: [] }),
          collapsedWbs: opts.keepTime ? st.collapsedWbs : new Set(),
          scheduleDirty: opts.dirty ?? false,
        };
      }),
    setModel: (baseElements, modelFileName) =>
      set((st) => {
        const ids = new Set(baseElements.map((e) => e.id));
        const segments = st.segments.filter((s) => ids.has(s.parentId));
        return { baseElements, modelFileName, segments, elements: derive(baseElements, segments, st.groups), selectedElements: new Set() };
      }),
    setSegments: (segments) => set((st) => ({ segments, elements: derive(st.baseElements, segments, st.groups) })),
    setGroups: (groups) => set((st) => ({ groups, elements: derive(st.baseElements, st.segments, groups) })),
    setPaths: (paths) => set({ paths }),
    setPathDraft: (pathDraft) => set({ pathDraft }),
    setCurrentProject: (currentProjectId, currentVersion) => set({ currentProjectId, currentVersion }),
    setView: (view) => set({ view }),
    setDialog: (dialog) => set({ dialog }),
    setLinks: (links) => set({ links }),
    setRules: (rules) => set({ rules }),
    setProfiles: (profiles) => set({ profiles }),
    selectElements: (selectedElements) => set({ selectedElements }),
    selectActivity: (selectedActivity) => set({ selectedActivity, selectedActivities: new Set(selectedActivity ? [selectedActivity] : []) }),
    setActivitySelection: (ids, primary) =>
      set((st) => ({ selectedActivities: ids, selectedActivity: primary !== undefined ? primary : ids.has(st.selectedActivity ?? "") ? st.selectedActivity : ([...ids][0] ?? null) })),
    commit: (next, label, select) =>
      set((st) => {
        if (!st.schedule || next === st.schedule) return {};
        const sel = select ? { selectedActivities: new Set(select), selectedActivity: select[0] ?? null } : {};
        return { schedule: next, scheduleDirty: true, past: [...st.past.slice(-HISTORY + 1), { s: st.schedule, label }], future: [], ...sel };
      }),
    undo: () =>
      set((st) => {
        const prev = st.past[st.past.length - 1];
        if (!prev || !st.schedule) return {};
        return { schedule: prev.s, scheduleDirty: true, past: st.past.slice(0, -1), future: [{ s: st.schedule, label: prev.label }, ...st.future], status: `Undid: ${prev.label}` };
      }),
    redo: () =>
      set((st) => {
        const next = st.future[0];
        if (!next || !st.schedule) return {};
        return { schedule: next.s, scheduleDirty: true, future: st.future.slice(1), past: [...st.past, { s: st.schedule, label: next.label }], status: `Redid: ${next.label}` };
      }),
    setClipboard: (clipboard) => set({ clipboard }),
    setTime: (time) => set({ time }),
    setPlaying: (playing) => set({ playing }),
    setSpeed: (speed) => set({ speed }),
    setSim: (patch) => set((s) => ({ sim: { ...s.sim, ...patch } })),
    setStatus: (status, busy = false) => set({ status, busy }),
    setCollapsedWbs: (ids) => set({ collapsedWbs: ids }),
    setGanttFilter: (f) => set((st) => ({ ganttFilter: { ...st.ganttFilter, ...f } })),
    setGanttTracking: (on) => set({ ganttTracking: on }),
    toggleWbs: (id) =>
      set((s) => {
        const next = new Set(s.collapsedWbs);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { collapsedWbs: next };
      }),
    setScheduleReport: (scheduleReport) => set({ scheduleReport }),

    updateActivity: (id, patch) =>
      editSchedule((s) => ({ ...s, activities: s.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)) }), `Edit ${Object.keys(patch).join(", ")} of ${id}`),
    addActivity: (a) => editSchedule((s) => ({ ...s, activities: [...s.activities, a] }), "Add activity"),
    deleteActivity: (id) =>
      editSchedule((s) => ({
        ...s,
        activities: s.activities.filter((a) => a.id !== id),
        relationships: s.relationships.filter((r) => r.predecessorId !== id && r.successorId !== id),
        assignments: (s.assignments ?? []).filter((x) => x.activityId !== id),
      }), "Delete activity"),
    addRelationship: (r) => editSchedule((s) => ({ ...s, relationships: [...s.relationships, r] }), "Add relationship"),
    updateRelationship: (id, patch) =>
      editSchedule((s) => ({ ...s, relationships: s.relationships.map((r) => (r.id === id ? { ...r, ...patch } : r)) }), `Edit relationship ${id}`),
    deleteRelationship: (id) => editSchedule((s) => ({ ...s, relationships: s.relationships.filter((r) => r.id !== id) }), "Delete relationship"),
    upsertAssignment: (a) =>
      editSchedule((s) => {
        const list = s.assignments ?? [];
        return { ...s, assignments: list.some((x) => x.id === a.id) ? list.map((x) => (x.id === a.id ? a : x)) : [...list, a] };
      }),
    deleteAssignment: (id) => editSchedule((s) => ({ ...s, assignments: (s.assignments ?? []).filter((x) => x.id !== id) })),
  };
});

export { DAY };

export function fmtDate(t: number | null | undefined): string {
  if (t === null || t === undefined) return "";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${monthShort(d)}-${String(d.getUTCFullYear()).slice(2)}`;
}

/** "2026-03-02T08:00" for <input type="datetime-local"> (UTC wall time). */
export function toInputDate(t: number | null | undefined): string {
  if (t === null || t === undefined) return "";
  return new Date(t).toISOString().slice(0, 16);
}

export function fromInputDate(v: string): number | null {
  if (!v) return null;
  const t = Date.parse(v + (v.length === 16 ? ":00Z" : "Z"));
  return Number.isFinite(t) ? t : null;
}
