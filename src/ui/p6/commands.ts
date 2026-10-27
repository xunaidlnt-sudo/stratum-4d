// Commands shared by the P6 menus, toolbar, Command bar, right-click menu
// and keyboard shortcuts. Each one acts on the current selection and is a
// single undoable step.

import { create } from "zustand";
import { standardCalendar } from "../../core/calendar";
import { fieldCtx, fieldsFor, fieldText } from "../../core/fields";
import { parseTsv, pasteCells, toTsv } from "../../core/tableImport";
import { useLayout } from "./layout";
import { copyActivities, deleteActivities, dissolve, fillDown, linkActivities, nextCode, pasteActivities, uid, unlinkActivities } from "../../core/ops";
import type { Activity, RelationshipType } from "../../core/types";
import { useStore } from "../store";

export type P6Dialog =
  | "columns"
  | "filters"
  | "groupSort"
  | "bars"
  | "timescale"
  | "layouts"
  | "globalChange"
  | "updateProgress"
  | "baselines"
  | "checkSchedule"
  | "renumber"
  | "assignPred"
  | "assignSucc"
  | "assignRes"
  | "assignCode"
  | "pageSetup"
  | "projectInfo"
  | "spelling"
  | "level"
  | "periods"
  | "displays"
  | "scheduleOptions"
  | "calendars"
  | "activityCodes"
  | "udfs"
  | "claimDigger"
  | "preferences"
  | "scheduleLog"
  | "excelImport"
  | "roles"
  | "assignRole"
  | "shifts"
  | "resourceRates"
  | "curves"
  | "costAccounts"
  | "obs"
  | "budgets"
  | "riskMatrix"
  | "eps"
  | "portfolios";

export type P6Window = "activities" | "wbs" | "assignments" | "resources" | "projects" | "documents" | "expenses" | "thresholds" | "issues" | "risks";

interface P6Ui {
  dialog: P6Dialog | null;
  window: P6Window;
  /** Open windows shown as tabs, like P6's workspace tabs. */
  tabs: P6Window[];
  /** Column focused in the table, used by Fill Down and F2. */
  focusField: string | null;
  /** Field of the cell being edited in place. */
  editing: { id: string; field: string } | null;
  /** Spotlight: highlight activities in the data-date period. */
  spotlight: boolean;
  /** Trace Logic depth (levels each side) when trace view is on. */
  traceDepth: number;
  open: (d: P6Dialog | null) => void;
  show: (w: P6Window) => void;
  closeTab: (w: P6Window) => void;
  setFocusField: (f: string | null) => void;
  setEditing: (e: P6Ui["editing"]) => void;
  setSpotlight: (on: boolean) => void;
  setTraceDepth: (n: number) => void;
}

export const useP6 = create<P6Ui>((set, get) => ({
  dialog: null,
  window: "activities",
  tabs: ["activities"],
  focusField: null,
  editing: null,
  spotlight: false,
  traceDepth: 2,
  open: (dialog) => set({ dialog }),
  show: (window) => set({ window, tabs: get().tabs.includes(window) ? get().tabs : [...get().tabs, window] }),
  closeTab: (w) => {
    const tabs = get().tabs.filter((x) => x !== w);
    const next = tabs.length ? tabs : (["activities"] as P6Window[]);
    set({ tabs: next, window: get().window === w ? next[next.length - 1] : get().window });
  },
  setFocusField: (focusField) => set({ focusField }),
  setEditing: (editing) => set({ editing }),
  setSpotlight: (spotlight) => set({ spotlight }),
  setTraceDepth: (traceDepth) => set({ traceDepth }),
}));

/** Rows currently shown in the activity table, in display order (set by the table). */
export const tableOrder: { ids: string[] } = { ids: [] };

const st = () => useStore.getState();

/** Selected activity ids in table order. */
export function selectedInOrder(): string[] {
  const sel = st().selectedActivities;
  const inOrder = tableOrder.ids.filter((id) => sel.has(id));
  if (inOrder.length === sel.size) return inOrder;
  // Anything selected but not shown (filtered away) goes last.
  const seen = new Set(inOrder);
  for (const id of sel) if (!seen.has(id)) inOrder.push(id);
  return inOrder;
}

const say = (msg: string) => st().setStatus(msg);

export function addActivity() {
  const s = st().schedule;
  if (!s) return;
  const sel = s.activities.find((a) => a.id === st().selectedActivity) ?? null;
  const cals = s.calendars ?? [];
  const cal = cals.find((c) => c.id === (sel?.calendarId ?? s.defaultCalendarId)) ?? cals[0] ?? standardCalendar();
  const hpd = cal.hoursPerDay || 8;
  const used = new Set(s.activities.map((a) => a.code));
  const code = nextCode(used, sel?.code ?? s.activities[s.activities.length - 1]?.code ?? "A1000");
  const start = sel?.finish ?? s.dataDate ?? Date.now();
  const a: Activity = {
    id: uid("act"),
    code,
    name: "New Activity",
    wbsId: sel?.wbsId ?? s.wbs[0]?.id ?? null,
    type: "task",
    status: "not-started",
    percentComplete: 0,
    start,
    finish: start,
    baselineStart: null,
    baselineFinish: null,
    actualStart: null,
    actualFinish: null,
    totalFloatHours: null,
    originalDurationHours: 5 * hpd,
    remainingDurationHours: 5 * hpd,
    critical: false,
    calendarId: sel?.calendarId ?? s.defaultCalendarId ?? null,
    codes: {},
  };
  const relationships = sel ? [...s.relationships, { id: uid("rel"), predecessorId: sel.id, successorId: a.id, type: "FS" as RelationshipType, lagHours: 0 }] : s.relationships;
  st().commit({ ...s, activities: [...s.activities, a], relationships }, `Add ${code}`, [a.id]);
  useP6.getState().setEditing({ id: a.id, field: "name" });
  say(`Added ${code}${sel ? ` after ${sel.code}` : ""}. Press F9 to schedule it.`);
}

export function deleteSelected(confirm = true) {
  const s = st().schedule;
  const ids = selectedInOrder();
  if (!s || !ids.length) return;
  const label = ids.length === 1 ? s.activities.find((a) => a.id === ids[0])?.code ?? "activity" : `${ids.length} activities`;
  if (confirm && !window.confirm(`Delete ${label} and their relationships?`)) return;
  st().commit(deleteActivities(s, ids), `Delete ${label}`, []);
  say(`Deleted ${label}.`);
}

export function copySelected() {
  const s = st().schedule;
  const ids = selectedInOrder();
  if (!s || !ids.length) return;
  st().setClipboard(copyActivities(s, ids));
  say(`Copied ${ids.length} activit${ids.length === 1 ? "y" : "ies"}.`);
}

export function cutSelected() {
  const s = st().schedule;
  const ids = selectedInOrder();
  if (!s || !ids.length) return;
  st().setClipboard(copyActivities(s, ids));
  st().commit(deleteActivities(s, ids), `Cut ${ids.length} activities`, []);
  say(`Cut ${ids.length} activit${ids.length === 1 ? "y" : "ies"}. Paste them into another WBS with Ctrl+V.`);
}

export function paste() {
  const { schedule: s, clipboard } = st();
  if (!s || !clipboard?.activities.length) return say("Nothing to paste. Copy activities first (Ctrl+C).");
  const target = s.activities.find((a) => a.id === st().selectedActivity);
  const r = pasteActivities(s, clipboard, { wbsId: target ? target.wbsId : undefined });
  st().commit(r.schedule, `Paste ${r.ids.length} activities`, r.ids);
  say(`Pasted ${r.ids.length} activit${r.ids.length === 1 ? "y" : "ies"} with new Activity IDs. Press F9 to schedule.`);
}

export function dissolveSelected() {
  const s = st().schedule;
  const ids = selectedInOrder();
  if (!s || !ids.length) return;
  if (!window.confirm(`Dissolve ${ids.length} activit${ids.length === 1 ? "y" : "ies"}? Predecessors are linked straight to successors.`)) return;
  const r = dissolve(s, ids);
  st().commit(r.schedule, "Dissolve", []);
  say(`Dissolved ${ids.length}; added ${r.added} relationship${r.added === 1 ? "" : "s"} to keep the logic.`);
}

export function linkSelected(type: RelationshipType = "FS") {
  const s = st().schedule;
  const ids = selectedInOrder();
  if (!s || ids.length < 2) return say("Select two or more activities to link (Ctrl+click).");
  const r = linkActivities(s, ids, type);
  st().commit(r.schedule, "Link activities");
  say(r.added ? `Linked ${ids.length} activities ${type} in table order (${r.added} new).` : "They are already linked.");
}

export function unlinkSelected() {
  const s = st().schedule;
  const ids = selectedInOrder();
  if (!s || ids.length < 2) return say("Select the linked activities to unlink.");
  const r = unlinkActivities(s, ids);
  st().commit(r.schedule, "Unlink activities");
  say(`Removed ${r.removed} relationship${r.removed === 1 ? "" : "s"}.`);
}

export function selectAll() {
  st().setActivitySelection(new Set(tableOrder.ids), tableOrder.ids[0] ?? null);
}

export function fillDownSelected() {
  const s = st().schedule;
  const ids = selectedInOrder();
  const field = useP6.getState().focusField;
  if (!s || ids.length < 2) return say("Select a range of activities first; the top one's value is copied down.");
  if (!field) return say("Click a cell in the column to fill down first.");
  const f = fieldsFor(s).find((x) => x.id === field);
  if (!f?.set) return say(`${f?.label ?? field} cannot be edited.`);
  const r = fillDown(s, ids, field);
  st().commit(r.schedule, `Fill down ${f.label}`);
  say(`Filled ${f.label} down to ${r.changed} activit${r.changed === 1 ? "y" : "ies"}.`);
}

export function setCell(id: string, field: string, value: string | number | null) {
  const s = st().schedule;
  if (!s) return false;
  const f = fieldsFor(s).find((x) => x.id === field);
  const a = s.activities.find((x) => x.id === id);
  if (!f?.set || !a) return false;
  const patch = f.set(a, value, fieldCtx(s));
  if (!patch) {
    say(`${f.label} cannot be set that way for ${a.code}.`);
    return false;
  }
  if (field === "code" && s.activities.some((x) => x.id !== id && x.code === patch.code)) {
    say(`Activity ID ${patch.code} is already used.`);
    return false;
  }
  st().commit({ ...s, activities: s.activities.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, `Edit ${f.label} of ${a.code}`);
  return true;
}

export const expandAll = () => st().setCollapsedWbs(new Set());
export function collapseAll() {
  const s = st().schedule;
  if (s) st().setCollapsedWbs(new Set(s.wbs.map((w) => w.id)));
}

/** Expand to a WBS level (1 = top level only). */
export function expandToLevel(level: number) {
  const s = st().schedule;
  if (!s) return;
  const parent = new Map(s.wbs.map((w) => [w.id, w.parentId]));
  const depth = (id: string) => {
    let d = 0;
    for (let p = parent.get(id) ?? null; p; p = parent.get(p) ?? null) d++;
    return d;
  };
  st().setCollapsedWbs(new Set(s.wbs.filter((w) => depth(w.id) >= level - 1).map((w) => w.id)));
}

// ---------------------------------------------------------------- cells to and from Excel

/** What this window last put on the system clipboard, to tell our own copy from Excel's. */
export const lastCopied: { text: string } = { text: "" };

/** Selected rows in the layout's columns as tab-separated text (with a title row), as P6 copies cells. */
export function selectionTsv(): string {
  const s = st().schedule;
  if (!s) return "";
  const cols = useLayoutCols();
  const c = fieldCtx(s);
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const rows = [cols.map((f) => f.label)];
  for (const id of selectedInOrder()) {
    const a = byId.get(id);
    if (a) rows.push(cols.map((f) => fieldText(f, a, c)));
  }
  return toTsv(rows);
}

/** Paste a block copied from Excel into the table from the focused cell down and right. */
export function pasteIntoCells(text: string) {
  const s = st().schedule;
  if (!s) return;
  let block = parseTsv(text.replace(/\r?\n$/, ""));
  const cols = useLayoutCols();
  // A copied title row that matches the columns is skipped.
  if (block.length > 1 && block[0].every((h, i) => !h || cols.some((f) => f.label === h) || i >= cols.length)) block = block.slice(1);
  const startField = useP6.getState().focusField ?? cols[0]?.id;
  const ci = Math.max(0, cols.findIndex((f) => f.id === startField));
  const startId = st().selectedActivity;
  const ri = startId ? tableOrder.ids.indexOf(startId) : -1;
  if (ri < 0) return say("Click the cell where the pasted block should start.");
  const rowIds = tableOrder.ids.slice(ri, ri + block.length);
  const fieldIds = cols.slice(ci, ci + Math.max(...block.map((r) => r.length))).map((f) => f.id);
  const r = pasteCells(s, rowIds, fieldIds, block);
  if (!r.changes) return say(r.readOnly.length ? `Nothing pasted: ${r.readOnly.join(", ")} cannot be edited.` : "Nothing pasted.");
  st().commit(r.schedule, `Paste ${r.changes} cells`, rowIds);
  say(`Pasted ${r.changes} cells into ${rowIds.length} activities${r.readOnly.length ? ` (read-only skipped: ${r.readOnly.join(", ")})` : ""}. Press F9 to reschedule.`);
}

function useLayoutCols() {
  const s = st().schedule!;
  const fields = new Map(fieldsFor(s).map((f) => [f.id, f]));
  return useLayout.getState().layout.columns.map((c) => fields.get(c.id)).filter((f): f is NonNullable<typeof f> => !!f);
}
