// Activity Network layout: activities in columns by their position in the
// logic (longest chain of predecessors), rows ordered by start within each
// column, as P6's Activity Network arranges boxes left to right.

import type { Schedule } from "./types";

export interface NetNode {
  id: string;
  col: number;
  row: number;
}

export interface NetLayout {
  nodes: Map<string, NetNode>;
  cols: number;
  rows: number;
}

export function networkLayout(s: Schedule, only?: Set<string>): NetLayout {
  const acts = only ? s.activities.filter((a) => only.has(a.id)) : s.activities;
  const ids = new Set(acts.map((a) => a.id));
  const succ = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const a of acts) indeg.set(a.id, 0);
  for (const r of s.relationships) {
    if (
      !ids.has(r.predecessorId) ||
      !ids.has(r.successorId) ||
      r.predecessorId === r.successorId
    )
      continue;
    (
      succ.get(r.predecessorId) ??
      succ.set(r.predecessorId, []).get(r.predecessorId)!
    ).push(r.successorId);
    indeg.set(r.successorId, (indeg.get(r.successorId) ?? 0) + 1);
  }
  const level = new Map<string, number>();
  const queue: string[] = [];
  for (const [id, d] of indeg) if (d === 0) queue.push(id);
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    const l = level.get(id) ?? 0;
    level.set(id, l);
    for (const n of succ.get(id) ?? []) {
      level.set(n, Math.max(level.get(n) ?? 0, l + 1));
      const d = (indeg.get(n) ?? 1) - 1;
      indeg.set(n, d);
      if (d === 0) queue.push(n);
    }
  }
  // Activities in loops keep the level reached so far.
  for (const a of acts) if (!level.has(a.id)) level.set(a.id, 0);
  const cols = new Map<number, typeof acts>();
  for (const a of acts) {
    const l = level.get(a.id)!;
    (cols.get(l) ?? cols.set(l, []).get(l)!).push(a);
  }
  const nodes = new Map<string, NetNode>();
  let maxRow = 0;
  for (const [c, list] of cols) {
    list.sort(
      (a, b) =>
        (a.start ?? 0) - (b.start ?? 0) ||
        a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
    list.forEach((a, i) => nodes.set(a.id, { id: a.id, col: c, row: i }));
    maxRow = Math.max(maxRow, list.length);
  }
  return {
    nodes,
    cols: cols.size ? Math.max(...cols.keys()) + 1 : 0,
    rows: maxRow,
  };
}

/** Activities within `depth` relationships of `id`, both ways (P6 Trace Logic). */
export function traceLogic(
  s: Schedule,
  id: string,
  depthBack: number,
  depthFwd: number,
): Set<string> {
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const r of s.relationships) {
    (
      preds.get(r.successorId) ??
      preds.set(r.successorId, []).get(r.successorId)!
    ).push(r.predecessorId);
    (
      succs.get(r.predecessorId) ??
      succs.set(r.predecessorId, []).get(r.predecessorId)!
    ).push(r.successorId);
  }
  const out = new Set([id]);
  const walk = (map: Map<string, string[]>, depth: number) => {
    let front = [id];
    for (let d = 0; d < depth && front.length; d++) {
      const next: string[] = [];
      for (const x of front)
        for (const y of map.get(x) ?? [])
          if (!out.has(y)) (out.add(y), next.push(y));
      front = next;
    }
  };
  walk(preds, depthBack);
  walk(succs, depthFwd);
  return out;
}
