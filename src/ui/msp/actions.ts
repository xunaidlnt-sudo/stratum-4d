// Commands of the MS Project layout, shared by the ribbon, the keyboard and
// the right-click menus. Each edit goes through commit() so it can be undone.

import { cellCtx, editTaskCell, indentRows, insertSummary, mspRows, newMspTask, outdentRows, projectHpd, rowNumbers, type MspCell } from "../../core/msp";
import { deleteActivities, linkActivities, storeBaseline, refreshBaseline, unlinkActivities, updateProgress } from "../../core/ops";
import type { Activity, Schedule } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { useMsp } from "./state";

const st = () => useStore.getState();
const sched = () => st().schedule;

/** Selected task ids in sheet order. */
export function selectedTasks(): string[] {
  const s = sched();
  if (!s) return [];
  const sel = st().selectedActivities;
  if (!sel.size) return st().selectedActivity ? [st().selectedActivity!] : [];
  const order = rowNumbers(mspRows(s)).byId;
  return [...sel].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}
/** Selected rows, tasks and summaries, in sheet order. */
export function selectedRows(): string[] {
  const s = sched();
  if (!s) return [];
  const order = rowNumbers(mspRows(s)).byId;
  return [...new Set([...selectedTasks(), ...useMsp.getState().selWbs])].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function commitEdit(next: Schedule, label: string, select?: string[]) {
  st().commit(next, label, select);
}

/** Type into a task cell. Returns an error message, or null when it went in. */
export function editCell(id: string, cell: MspCell, text: string): string | null {
  const s = sched();
  if (!s) return null;
  try {
    const next = editTaskCell(s, id, cell, text, cellCtx(s, rowNumbers(mspRows(s)).byRow));
    if (next !== s) commitEdit(next, `Edit ${cell}`);
    return null;
  } catch (e) {
    const msg = (e as Error).message;
    st().setStatus(msg);
    return msg;
  }
}

export function renameSummary(id: string, name: string) {
  const s = sched();
  if (!s || !name.trim()) return;
  commitEdit({ ...s, wbs: s.wbs.map((w) => (w.id === id ? { ...w, name: name.trim() } : w)) }, "Rename summary task");
}

/** Insert Task (Ins): a new task above the selected row, at its level. */
export function insertTask(name = "<New Task>", milestone = false) {
  const s = sched();
  if (!s) return;
  const hpd = projectHpd(s);
  const sel = selectedRows()[0];
  const selTask = s.activities.find((a) => a.id === sel);
  const wbsId = selTask ? selTask.wbsId : sel ? (s.wbs.find((w) => w.id === sel)?.parentId ?? null) : (s.wbs[0]?.id ?? null);
  const c = cellCtx(s, new Map());
  const t = newMspTask(s, name, wbsId, hpd, (x) => c.snap({ calendarId: null } as Activity, x));
  // Takes the place of the selected task: same start, so it sorts just above it.
  const at = selTask?.start ?? t.start;
  const a: Activity = milestone
    ? { ...t, name: name === "<New Task>" ? "<New Milestone>" : name, type: "milestone", start: at, finish: at, originalDurationHours: 0, remainingDurationHours: 0, estimated: false }
    : { ...t, start: at, finish: at === null ? null : c.finishFor(t, at, hpd) };
  commitEdit({ ...s, activities: [...s.activities, a] }, milestone ? "Insert milestone" : "Insert task", [a.id]);
  st().setStatus(`Inserted ${a.name}. Type over it, or double-click for Task Information.`);
}

/** New task typed into the blank row at the end. */
export function appendTask(name: string, afterRowId: string | null) {
  const s = sched();
  if (!s || !name.trim()) return;
  const hpd = projectHpd(s);
  const prevTask = s.activities.find((a) => a.id === afterRowId);
  const wbsId = prevTask ? prevTask.wbsId : afterRowId ? (s.wbs.find((w) => w.id === afterRowId)?.parentId ?? null) : null;
  const c = cellCtx(s, new Map());
  const t = newMspTask(s, name.trim(), wbsId, hpd, (x) => c.snap({ calendarId: null } as Activity, x));
  const start = Math.max(t.start ?? 0, ...s.activities.filter((a) => a.wbsId === wbsId).map((a) => a.start ?? 0));
  const a = { ...t, start, finish: c.finishFor(t, start, hpd) };
  commitEdit({ ...s, activities: [...s.activities, a] }, "New task", [a.id]);
}

export function insertSummaryTask() {
  const s = sched();
  if (!s) return;
  const rows = selectedRows();
  if (!rows.length) return st().setStatus("Select the tasks to put under the new summary task.");
  const r = insertSummary(s, rows);
  commitEdit(r.schedule, "Insert summary task");
  useMsp.getState().set({ selWbs: new Set([r.wbsId]) });
}

export function deleteSelected() {
  const s = sched();
  if (!s) return;
  const tasks = selectedTasks();
  const wbs = [...useMsp.getState().selWbs];
  if (!tasks.length && !wbs.length) return;
  let next = deleteActivities(s, tasks);
  if (wbs.length) {
    // Deleting a summary deletes everything under it, as in MS Project.
    const under = new Set(wbs);
    let grew = true;
    while (grew) {
      grew = false;
      for (const w of next.wbs) if (w.parentId && under.has(w.parentId) && !under.has(w.id)) (under.add(w.id), (grew = true));
    }
    const n = next.activities.filter((a) => a.wbsId && under.has(a.wbsId)).length;
    if (n && !confirm(`Delete ${wbs.length === 1 ? "this summary task" : `${wbs.length} summary tasks`} and the ${n} task${n === 1 ? "" : "s"} under ${wbs.length === 1 ? "it" : "them"}?`)) return;
    next = deleteActivities(next, next.activities.filter((a) => a.wbsId && under.has(a.wbsId)).map((a) => a.id));
    next = { ...next, wbs: next.wbs.filter((w) => !under.has(w.id)) };
    useMsp.getState().set({ selWbs: new Set() });
  }
  commitEdit(next, "Delete task", []);
}

export function indent() {
  const s = sched();
  if (!s) return;
  const rows = selectedRows();
  const r = indentRows(s, rows);
  if (r.dropped && !confirm(`Indenting turns the task above into a summary task. Its ${r.dropped} link(s) and assignment(s) will be removed. Continue?`)) return;
  if (!r.moved) return st().setStatus(r.message ?? "Nothing to indent.");
  commitEdit(r.schedule, "Indent");
}

export function outdent() {
  const s = sched();
  if (!s) return;
  const r = outdentRows(s, selectedRows());
  if (!r.moved) return st().setStatus(r.message ?? "Nothing to outdent.");
  commitEdit(r.schedule, "Outdent");
}

/** Link the Selected Tasks (Ctrl+F2): finish-to-start in the order selected. */
export function linkSelected() {
  const s = sched();
  const ids = selectedTasks();
  if (!s || ids.length < 2) return st().setStatus("Select two or more tasks to link (Ctrl+click or Shift+click).");
  const r = linkActivities(s, ids);
  commitEdit(r.schedule, "Link tasks");
  st().setStatus(`${r.added} link(s) added.`);
}

/** Unlink Tasks (Ctrl+Shift+F2): with one task selected, every link it has; with several, the links between them. */
export function unlinkSelected() {
  const s = sched();
  const ids = selectedTasks();
  if (!s || !ids.length) return;
  if (ids.length === 1) {
    const rels = s.relationships.filter((r) => r.predecessorId !== ids[0] && r.successorId !== ids[0]);
    commitEdit({ ...s, relationships: rels }, "Unlink task");
    return st().setStatus(`${s.relationships.length - rels.length} link(s) removed.`);
  }
  const r = unlinkActivities(s, ids);
  commitEdit(r.schedule, "Unlink tasks");
  st().setStatus(`${r.removed} link(s) removed.`);
}

function patchSelected(label: string, patch: (a: Activity) => Partial<Activity> | null) {
  const s = sched();
  const ids = new Set(selectedTasks());
  if (!s || !ids.size) return st().setStatus("Select a task first.");
  commitEdit({ ...s, activities: s.activities.map((a) => (ids.has(a.id) ? { ...a, ...(patch(a) ?? {}) } : a)) }, label);
}

export const setMode = (mode: "auto" | "manual") => patchSelected(mode === "manual" ? "Manually schedule" : "Auto schedule", () => ({ taskMode: mode }));
export const toggleInactive = () => {
  const s = sched();
  const first = s?.activities.find((a) => a.id === selectedTasks()[0]);
  const off = !first?.inactive;
  patchSelected(off ? "Inactivate" : "Activate", () => ({ inactive: off }));
};
/** Respect Links: put manually scheduled tasks back under logic. */
export const respectLinks = () => patchSelected("Respect links", (a) => (a.taskMode === "manual" ? { taskMode: "auto", constraint: null } : { constraint: a.constraint?.type === "start-on-or-after" ? null : a.constraint }));

export function setPercent(p: number) {
  const ids = selectedTasks();
  if (!ids.length) return st().setStatus("Select a task first.");
  for (const id of ids) editCell(id, "pct", String(p));
  st().setStatus(`${ids.length} task(s) set to ${p}% complete.`);
}

/** Mark on Track: progress the selected tasks as planned up to the status date. */
export function markOnTrack() {
  const s = sched();
  const ids = selectedTasks();
  if (!s || !ids.length) return st().setStatus("Select a task first.");
  if (s.dataDate === null) return st().setStatus("Set the status date first (Project › Status Date).");
  const r = updateProgress(s, s.dataDate, ids);
  commitEdit(r.schedule, "Mark on track");
  st().setStatus(`Marked on track to ${fmtDate(s.dataDate)}: ${r.started} started, ${r.finished} finished.`);
}

/** Move Task: shift the selected tasks forward or back by working days (as a Start No Earlier Than). */
export function moveTasks(days: number) {
  const s = sched();
  const ids = selectedTasks();
  if (!s || !ids.length) return st().setStatus("Select a task first.");
  const DAY = 86_400_000;
  let cur = s;
  for (const id of ids) {
    const a = cur.activities.find((x) => x.id === id);
    if (!a?.start || a.status !== "not-started") continue;
    const t = new Date(a.start + days * DAY);
    cur = editTaskCell(cur, id, "start", `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear()}`, cellCtx(cur, new Map()));
  }
  commitEdit(cur, `Move ${days > 0 ? "forward" : "back"} ${Math.abs(days)} day(s)`);
}

/** Set Baseline: Baseline (0) is the project baseline; 1-10 are stored as "Baseline N". Interim plans likewise. */
export function setBaseline(n: number, scope: "project" | "selected", interim = false) {
  const s = sched();
  if (!s) return;
  const ids = scope === "selected" ? new Set(selectedTasks()) : null;
  if (ids && !ids.size) return st().setStatus("Select the tasks to baseline.");
  if (n === 0 && !interim) {
    const activities = s.activities.map((a) => (ids && !ids.has(a.id) ? a : { ...a, baselineStart: a.actualStart ?? a.start, baselineFinish: a.actualFinish ?? a.finish }));
    commitEdit(
      { ...s, activities, baselineInfo: { name: "Baseline", dataDate: s.dataDate, assignedAt: new Date().toISOString(), matched: ids?.size ?? activities.length, missing: 0 } },
      "Set baseline",
    );
    return st().setStatus(`Baseline set for ${ids ? `${ids.size} selected task(s)` : "the entire project"}.`);
  }
  const name = interim ? `Interim plan ${n}` : `Baseline ${n}`;
  const existing = (s.baselines ?? []).find((b) => b.name === name);
  let next: Schedule;
  if (existing) {
    const fresh = refreshBaseline(s, existing.id);
    if (ids) {
      const b = fresh.baselines!.find((x) => x.id === existing.id)!;
      const merged = { ...existing.dates };
      for (const a of s.activities) if (ids.has(a.id)) merged[a.code] = b.dates[a.code];
      next = { ...fresh, baselines: fresh.baselines!.map((x) => (x.id === existing.id ? { ...x, dates: merged } : x)) };
    } else next = fresh;
  } else {
    const r = storeBaseline(s, name);
    next = r.schedule;
    if (ids) {
      const dates = Object.fromEntries(Object.entries(r.baseline.dates).filter(([code]) => s.activities.some((a) => a.code === code && ids.has(a.id))));
      next = { ...next, baselines: next.baselines!.map((x) => (x.id === r.baseline.id ? { ...x, dates } : x)) };
    }
  }
  commitEdit(next, `Set ${name}`);
  st().setStatus(`${name} saved for ${ids ? `${ids.size} selected task(s)` : "the entire project"}.`);
}

export function clearBaseline(n: number, scope: "project" | "selected", interim = false) {
  const s = sched();
  if (!s) return;
  const ids = scope === "selected" ? new Set(selectedTasks()) : null;
  if (n === 0 && !interim) {
    commitEdit({ ...s, activities: s.activities.map((a) => (ids && !ids.has(a.id) ? a : { ...a, baselineStart: null, baselineFinish: null })), ...(ids ? {} : { baselineInfo: null }) }, "Clear baseline");
    return;
  }
  const name = interim ? `Interim plan ${n}` : `Baseline ${n}`;
  const b = (s.baselines ?? []).find((x) => x.name === name);
  if (!b) return st().setStatus(`${name} has not been saved.`);
  if (!ids) return commitEdit({ ...s, baselines: s.baselines!.filter((x) => x.id !== b.id) }, `Clear ${name}`);
  const codes = new Set(s.activities.filter((a) => ids.has(a.id)).map((a) => a.code));
  commitEdit({ ...s, baselines: s.baselines!.map((x) => (x.id === b.id ? { ...x, dates: Object.fromEntries(Object.entries(x.dates).filter(([c]) => !codes.has(c))) } : x)) }, `Clear ${name}`);
}

/** Update Project: progress everything (or the selection) as planned up to a date, and move the status date. */
export function updateProject(date: number, scope: "project" | "selected") {
  const s = sched();
  if (!s) return;
  const ids = scope === "selected" ? selectedTasks() : undefined;
  const r = updateProgress(s, date, ids);
  commitEdit(r.schedule, "Update project");
  st().setStatus(`Updated to ${fmtDate(date)}: ${r.started} started, ${r.finished} completed, ${r.progressed} in progress.`);
}

/** Move Project: shift every date in the project by the gap between the old and new project start. */
export function moveProject(newStart: number, moveDeadlines: boolean) {
  const s = sched();
  if (!s) return;
  const starts = s.activities.map((a) => a.start).filter((x): x is number => x !== null);
  if (!starts.length) return;
  const delta = newStart - Math.min(...starts);
  const sh = (t: number | null | undefined) => (t === null || t === undefined ? (t ?? null) : t + delta);
  commitEdit(
    {
      ...s,
      plannedStart: newStart,
      dataDate: sh(s.dataDate),
      activities: s.activities.map((a) => ({
        ...a,
        start: sh(a.start),
        finish: sh(a.finish),
        actualStart: sh(a.actualStart),
        actualFinish: sh(a.actualFinish),
        constraint: a.constraint ? { ...a.constraint, date: sh(a.constraint.date) } : a.constraint,
        deadline: moveDeadlines ? sh(a.deadline) : (a.deadline ?? null),
      })),
    },
    "Move project",
  );
}
