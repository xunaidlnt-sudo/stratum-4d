// Timescaled logic diagram (as in P6 Visualizer): bars on a time axis,
// packed into as few rows as possible, with relationship lines between them.
// A successor goes on its driving predecessor's row when it fits there, so
// logic chains read left to right along one line.

import type { Activity, Relationship, Schedule } from "./types";

export interface TsldBar {
  a: Activity;
  start: number;
  finish: number;
  row: number;
  milestone: boolean;
}

export interface TsldGroup {
  id: string | null;
  label: string;
  firstRow: number;
  rows: number;
}

export interface TsldLayout {
  bars: TsldBar[];
  groups: TsldGroup[];
  rows: number;
  start: number;
  finish: number;
  links: { r: Relationship; from: TsldBar; to: TsldBar }[];
}

export interface TsldOptions {
  /** One band per WBS element (top level, or the full path when `wbsLevels` is 0). */
  groupByWbs?: boolean;
  /** Restrict to these activity ids. */
  only?: Set<string>;
  /** Minimum gap between bars on the same row, in ms (room for the label of the next bar). */
  gapMs?: number;
}

export function timescaledLayout(s: Schedule, o: TsldOptions = {}): TsldLayout {
  const gap = o.gapMs ?? 0;
  const acts = s.activities.filter((a) => a.type !== "wbs-summary" && a.type !== "loe" && (!o.only || o.only.has(a.id)) && (a.actualStart ?? a.start) !== null && (a.actualFinish ?? a.finish) !== null);
  const byId = new Map(acts.map((a) => [a.id, a]));
  const preds = new Map<string, Relationship[]>();
  for (const r of s.relationships) if (byId.has(r.predecessorId) && byId.has(r.successorId)) (preds.get(r.successorId) ?? preds.set(r.successorId, []).get(r.successorId)!).push(r);

  // Groups: WBS elements in outline order (by the activity's own WBS path), or one group.
  const wbs = new Map(s.wbs.map((w) => [w.id, w]));
  const pathOf = (id: string | null) => {
    const parts: string[] = [];
    for (let w = id ? wbs.get(id) : undefined; w; w = w.parentId ? wbs.get(w.parentId) : undefined) parts.unshift(w.code);
    return parts.join(".");
  };
  const groupKey = (a: Activity) => (o.groupByWbs ? a.wbsId : null);
  const keys = [...new Set(acts.map(groupKey))].sort((x, y) => pathOf(x).localeCompare(pathOf(y), undefined, { numeric: true }));

  const bars: TsldBar[] = [];
  const barOf = new Map<string, TsldBar>();
  const groups: TsldGroup[] = [];
  let rowBase = 0;
  for (const k of keys) {
    const list = acts
      .filter((a) => groupKey(a) === k)
      .map((a) => ({ a, start: a.actualStart ?? a.start!, finish: Math.max(a.actualStart ?? a.start!, a.actualFinish ?? a.finish!) }))
      .sort((x, y) => x.start - y.start || x.finish - y.finish || x.a.code.localeCompare(y.a.code, undefined, { numeric: true }));
    const rowEnd: number[] = [];
    for (const it of list) {
      const ms = it.a.type === "milestone" || it.a.type === "finish-milestone";
      // Prefer the row of the driving predecessor (latest-finishing one in this group).
      let pref = -1;
      let best = -Infinity;
      for (const r of preds.get(it.a.id) ?? []) {
        const pb = barOf.get(r.predecessorId);
        if (pb && pb.row >= rowBase && pb.finish > best) (best = pb.finish), (pref = pb.row - rowBase);
      }
      let row = pref >= 0 && rowEnd[pref] + gap <= it.start ? pref : rowEnd.findIndex((e) => e + gap <= it.start);
      if (row < 0) row = rowEnd.push(-Infinity) - 1;
      rowEnd[row] = Math.max(it.finish, it.start + (ms ? 1 : 0));
      const b: TsldBar = { a: it.a, start: it.start, finish: it.finish, row: rowBase + row, milestone: ms };
      bars.push(b);
      barOf.set(it.a.id, b);
    }
    const n = Math.max(1, rowEnd.length);
    const w = k ? wbs.get(k) : undefined;
    groups.push({ id: k, label: k ? `${pathOf(k)} ${w?.name ?? ""}`.trim() : o.groupByWbs ? "(no WBS)" : s.projectName, firstRow: rowBase, rows: n });
    rowBase += n;
  }
  const links: TsldLayout["links"] = [];
  for (const r of s.relationships) {
    const from = barOf.get(r.predecessorId);
    const to = barOf.get(r.successorId);
    if (from && to) links.push({ r, from, to });
  }
  return {
    bars,
    groups,
    rows: rowBase,
    start: bars.length ? Math.min(...bars.map((b) => b.start)) : s.dataDate ?? 0,
    finish: bars.length ? Math.max(...bars.map((b) => b.finish)) : s.dataDate ?? 0,
    links,
  };
}
