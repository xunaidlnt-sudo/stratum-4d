// Rows for the P6 activity table: filter, group (by WBS or any field) and
// sort, with band rows that roll up dates the way P6's group totals do.

import { fieldText, filterMatches, type FieldCtx, type FieldDef, type FilterDef } from "./fields";
import type { Activity, Schedule } from "./types";

export type P6Row =
  | { kind: "band"; id: string; depth: number; label: string; start: number | null; finish: number | null; count: number; wbsId: string | null }
  | { kind: "activity"; id: string; depth: number; activity: Activity; dim: boolean };

export interface RowOptions {
  groupBy: string;
  sort: { field: string; desc?: boolean }[];
  filters: FilterDef[];
  filterMatch: "all" | "any";
  filterMode: "replace" | "highlight";
  text: string;
  collapsed: Set<string>;
  /** Band labels show the full WBS path code. */
  wbsPathLabels?: boolean;
  /** A quick filter applied on top of the layout's filters (AND). */
  quick?: FilterDef | null;
}

function comparator(sort: RowOptions["sort"], fields: Map<string, FieldDef>, c: FieldCtx) {
  const keys = sort.map((s) => ({ f: fields.get(s.field), desc: !!s.desc })).filter((k) => k.f);
  if (!keys.length) return (a: Activity, b: Activity) => a.code.localeCompare(b.code, undefined, { numeric: true });
  // Cache values: sorting 25k rows calls the comparator ~400k times.
  const cache = keys.map(() => new Map<string, unknown>());
  const val = (i: number, a: Activity) => {
    const m = cache[i];
    if (m.has(a.id)) return m.get(a.id);
    const v = keys[i].f!.get(a, c);
    m.set(a.id, v);
    return v;
  };
  return (a: Activity, b: Activity) => {
    for (let i = 0; i < keys.length; i++) {
      const x = val(i, a);
      const y = val(i, b);
      const xe = x === null || x === undefined || x === "";
      const ye = y === null || y === undefined || y === "";
      if (xe && ye) continue;
      if (xe) return 1; // empty values last, whatever the direction
      if (ye) return -1;
      let d = 0;
      if (typeof x === "number" && typeof y === "number") d = x - y;
      else if (typeof x === "boolean" || typeof y === "boolean") d = Number(x) - Number(y);
      else d = String(x).localeCompare(String(y), undefined, { numeric: true });
      if (d !== 0) return keys[i].desc ? -d : d;
    }
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  };
}

export function buildP6Rows(s: Schedule, fields: Map<string, FieldDef>, c: FieldCtx, o: RowOptions): { rows: P6Row[]; shown: number } {
  const text = o.text.trim().toLowerCase();
  const pass = (a: Activity) => {
    if (text && !`${a.code} ${a.name}`.toLowerCase().includes(text)) return false;
    if (o.quick && !filterMatches(o.quick, a, fields, c)) return false;
    if (!o.filters.length) return true;
    return o.filterMatch === "all" ? o.filters.every((f) => filterMatches(f, a, fields, c)) : o.filters.some((f) => filterMatches(f, a, fields, c));
  };
  const cmp = comparator(o.sort, fields, c);
  const rows: P6Row[] = [];
  let shown = 0;
  const keep: { a: Activity; dim: boolean }[] = [];
  for (const a of s.activities) {
    const ok = pass(a);
    if (ok || o.filterMode === "highlight") keep.push({ a, dim: !ok });
    if (ok) shown++;
  }

  const roll = (items: { a: Activity }[]) => {
    let st = Infinity;
    let fi = -Infinity;
    for (const { a } of items) {
      if (a.start !== null && a.start < st) st = a.start;
      if (a.finish !== null && a.finish > fi) fi = a.finish;
    }
    return { start: Number.isFinite(st) ? st : null, finish: Number.isFinite(fi) ? fi : null };
  };

  if (o.groupBy === "none") {
    keep.sort((x, y) => cmp(x.a, y.a));
    for (const k of keep) rows.push({ kind: "activity", id: k.a.id, depth: 0, activity: k.a, dim: k.dim });
    return { rows, shown };
  }

  if (o.groupBy !== "wbs") {
    const f = fields.get(o.groupBy);
    const groups = new Map<string, { a: Activity; dim: boolean }[]>();
    for (const k of keep) {
      const key = f ? fieldText(f, k.a, c) || "(none)" : "(none)";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(k);
    }
    const keys = [...groups.keys()].sort((x, y) => (x === "(none)" ? 1 : y === "(none)" ? -1 : x.localeCompare(y, undefined, { numeric: true })));
    for (const key of keys) {
      const items = groups.get(key)!;
      const id = `g:${o.groupBy}:${key}`;
      rows.push({ kind: "band", id, depth: 0, label: key, ...roll(items), count: items.length, wbsId: null });
      if (o.collapsed.has(id)) continue;
      items.sort((x, y) => cmp(x.a, y.a));
      for (const k of items) rows.push({ kind: "activity", id: k.a.id, depth: 1, activity: k.a, dim: k.dim });
    }
    return { rows, shown };
  }

  // Group by WBS: P6 keeps the WBS tree, hides branches with nothing shown and sorts activities inside each node.
  const kids = new Map<string | null, typeof s.wbs>();
  for (const w of s.wbs) (kids.get(w.parentId) ?? kids.set(w.parentId, []).get(w.parentId)!).push(w);
  for (const list of kids.values()) list.sort((a, b) => a.seq - b.seq || a.code.localeCompare(b.code, undefined, { numeric: true }));
  const wbsIds = new Set(s.wbs.map((w) => w.id));
  const acts = new Map<string | null, { a: Activity; dim: boolean }[]>();
  for (const k of keep) {
    const w = k.a.wbsId && wbsIds.has(k.a.wbsId) ? k.a.wbsId : null;
    (acts.get(w) ?? acts.set(w, []).get(w)!).push(k);
  }
  for (const list of acts.values()) list.sort((x, y) => cmp(x.a, y.a));
  const filtered = o.filterMode === "replace" && (text !== "" || o.filters.length > 0 || !!o.quick);

  // Returns [start, finish, count] for the subtree, emitting rows as it goes.
  const visit = (parent: string | null, depth: number): [number, number, number] => {
    let st = Infinity;
    let fi = -Infinity;
    let n = 0;
    for (const k of acts.get(parent) ?? []) {
      rows.push({ kind: "activity", id: k.a.id, depth, activity: k.a, dim: k.dim });
      if (k.a.start !== null && k.a.start < st) st = k.a.start;
      if (k.a.finish !== null && k.a.finish > fi) fi = k.a.finish;
      n++;
    }
    for (const w of kids.get(parent) ?? []) {
      const idx = rows.length;
      rows.push({ kind: "band", id: w.id, depth, label: `${o.wbsPathLabels ? c.wbsPath(w.id) : w.code} ${w.name}`.trim(), start: null, finish: null, count: 0, wbsId: w.id });
      const before = rows.length;
      const [s2, f2, n2] = visit(w.id, depth + 1);
      if (filtered && n2 === 0) {
        rows.length = idx; // nothing below passes the filter: drop the band
        continue;
      }
      const band = rows[idx] as Extract<P6Row, { kind: "band" }>;
      band.start = Number.isFinite(s2) ? s2 : null;
      band.finish = Number.isFinite(f2) ? f2 : null;
      band.count = n2;
      if (o.collapsed.has(w.id)) rows.length = before;
      if (s2 < st) st = s2;
      if (f2 > fi) fi = f2;
      n += n2;
    }
    return [st, fi, n];
  };
  visit(null, 0);
  return { rows, shown };
}
