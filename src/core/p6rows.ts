// Rows for the P6 activity table: filter, group (by WBS or any field) and
// sort, with band rows that roll up dates the way P6's group totals do.

import {
  fieldText,
  filterMatches,
  type FieldCtx,
  type FieldDef,
  type FilterDef,
} from "./fields";
import type { Activity, Schedule } from "./types";

export type P6Row =
  | {
      kind: "band";
      id: string;
      depth: number;
      label: string;
      start: number | null;
      finish: number | null;
      count: number;
      wbsId: string | null;
    }
  | {
      kind: "activity";
      id: string;
      depth: number;
      activity: Activity;
      dim: boolean;
    };

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
  /** Further group-by fields after the first (P6 Group By rows 2..n). */
  thenBy?: string[];
  /** Show WBS bands down to this level only (0 = all); deeper activities sit in the last band shown. */
  wbsToLevel?: number;
  /** Bands only, no activity rows (P6 "Show Summaries Only"). */
  summariesOnly?: boolean;
  /** A grand total band at the top (P6 "Show Grand Totals"). */
  grandTotal?: boolean;
  /** Drop bands with no activities even when nothing is filtered (P6 "Hide if empty"). */
  hideEmpty?: boolean;
  /** Sort WBS bands by code instead of their WBS order (P6 "Sort bands alphabetically"). */
  sortBandsAlpha?: boolean;
  /** Band label parts (P6 Show: Title, ID / Code, Name / Description). Default code + name. */
  label?: { title?: boolean; code?: boolean; name?: boolean };
}

function comparator(
  sort: RowOptions["sort"],
  fields: Map<string, FieldDef>,
  c: FieldCtx,
) {
  const keys = sort
    .map((s) => ({ f: fields.get(s.field), desc: !!s.desc }))
    .filter((k) => k.f);
  if (!keys.length)
    return (a: Activity, b: Activity) =>
      a.code.localeCompare(b.code, undefined, { numeric: true });
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
      else if (typeof x === "boolean" || typeof y === "boolean")
        d = Number(x) - Number(y);
      else d = String(x).localeCompare(String(y), undefined, { numeric: true });
      if (d !== 0) return keys[i].desc ? -d : d;
    }
    return a.code.localeCompare(b.code, undefined, { numeric: true });
  };
}

export function buildP6Rows(
  s: Schedule,
  fields: Map<string, FieldDef>,
  c: FieldCtx,
  o: RowOptions,
): { rows: P6Row[]; shown: number } {
  const text = o.text.trim().toLowerCase();
  const pass = (a: Activity) => {
    if (text && !`${a.code} ${a.name}`.toLowerCase().includes(text))
      return false;
    if (o.quick && !filterMatches(o.quick, a, fields, c)) return false;
    if (!o.filters.length) return true;
    return o.filterMatch === "all"
      ? o.filters.every((f) => filterMatches(f, a, fields, c))
      : o.filters.some((f) => filterMatches(f, a, fields, c));
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
    return {
      start: Number.isFinite(st) ? st : null,
      finish: Number.isFinite(fi) ? fi : null,
    };
  };

  const showCode = o.label?.code ?? true;
  const showName = o.label?.name ?? true;
  const bandText = (title: string, code: string, name: string) =>
    [
      o.label?.title ? `${title}:` : "",
      showCode ? code : "",
      showName && name !== code ? name : showCode ? "" : name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    code ||
    name;

  // Nested grouping of a list of activities by fields[0], then fields[1]…; returns [start, finish, count].
  const groupItems = (
    items: { a: Activity; dim: boolean }[],
    fieldIds: string[],
    depth: number,
    prefix: string,
  ): [number, number, number] => {
    let st = Infinity;
    let fi = -Infinity;
    if (!fieldIds.length) {
      items.sort((x, y) => cmp(x.a, y.a));
      for (const k of items) {
        rows.push({
          kind: "activity",
          id: k.a.id,
          depth,
          activity: k.a,
          dim: k.dim,
        });
        if (k.a.start !== null && k.a.start < st) st = k.a.start;
        if (k.a.finish !== null && k.a.finish > fi) fi = k.a.finish;
      }
      return [st, fi, items.length];
    }
    const f = fields.get(fieldIds[0]);
    const groups = new Map<string, { a: Activity; dim: boolean }[]>();
    for (const k of items) {
      const key = f ? fieldText(f, k.a, c) || "(none)" : "(none)";
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(k);
    }
    const keys = [...groups.keys()].sort((x, y) =>
      x === "(none)"
        ? 1
        : y === "(none)"
          ? -1
          : x.localeCompare(y, undefined, { numeric: true }),
    );
    let n = 0;
    for (const key of keys) {
      const id = `${prefix}g:${fieldIds[0]}:${key}`;
      const idx = rows.length;
      rows.push({
        kind: "band",
        id,
        depth,
        label: bandText(f?.label ?? fieldIds[0], key, ""),
        start: null,
        finish: null,
        count: 0,
        wbsId: null,
      });
      const before = rows.length;
      const [s2, f2, n2] = groupItems(
        groups.get(key)!,
        fieldIds.slice(1),
        depth + 1,
        `${id}/`,
      );
      const band = rows[idx] as Extract<P6Row, { kind: "band" }>;
      band.start = Number.isFinite(s2) ? s2 : null;
      band.finish = Number.isFinite(f2) ? f2 : null;
      band.count = n2;
      if (o.collapsed.has(id)) rows.length = before;
      if (s2 < st) st = s2;
      if (f2 > fi) fi = f2;
      n += n2;
    }
    return [st, fi, n];
  };

  const finish = () => {
    if (o.grandTotal && keep.length)
      rows.unshift({
        kind: "band",
        id: "grand-total",
        depth: 0,
        label: "Grand Total",
        ...roll(keep),
        count: shown,
        wbsId: null,
      });
    return {
      rows: o.summariesOnly ? rows.filter((r) => r.kind === "band") : rows,
      shown,
    };
  };

  if (o.groupBy === "none") {
    groupItems(keep, o.thenBy ?? [], 0, "");
    return finish();
  }

  if (o.groupBy !== "wbs") {
    groupItems(keep, [o.groupBy, ...(o.thenBy ?? [])], 0, "");
    return finish();
  }

  // Group by WBS: P6 keeps the WBS tree, hides branches with nothing shown and sorts activities inside each node.
  const kids = new Map<string | null, typeof s.wbs>();
  for (const w of s.wbs)
    (kids.get(w.parentId) ?? kids.set(w.parentId, []).get(w.parentId)!).push(w);
  for (const list of kids.values())
    list.sort(
      o.sortBandsAlpha
        ? (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })
        : (a, b) =>
            a.seq - b.seq ||
            a.code.localeCompare(b.code, undefined, { numeric: true }),
    );
  const wbsIds = new Set(s.wbs.map((w) => w.id));
  const acts = new Map<string | null, { a: Activity; dim: boolean }[]>();
  for (const k of keep) {
    const w = k.a.wbsId && wbsIds.has(k.a.wbsId) ? k.a.wbsId : null;
    (acts.get(w) ?? acts.set(w, []).get(w)!).push(k);
  }
  const filtered =
    o.filterMode === "replace" &&
    (text !== "" || o.filters.length > 0 || !!o.quick);
  const dropEmpty = filtered || !!o.hideEmpty;
  const toLevel = o.wbsToLevel && o.wbsToLevel > 0 ? o.wbsToLevel : Infinity;
  const subtreeActs = (id: string): { a: Activity; dim: boolean }[] => [
    ...(acts.get(id) ?? []),
    ...(kids.get(id) ?? []).flatMap((w) => subtreeActs(w.id)),
  ];
  const then = o.thenBy ?? [];

  // Returns [start, finish, count] for the subtree, emitting rows as it goes.
  const visit = (
    parent: string | null,
    depth: number,
  ): [number, number, number] => {
    let st = Infinity;
    let fi = -Infinity;
    let n = 0;
    const own =
      parent !== null && depth >= toLevel
        ? subtreeActs(parent)
        : (acts.get(parent) ?? []);
    if (own.length) {
      const [s1, f1, n1] = groupItems(
        [...own],
        then,
        depth,
        `${parent ?? "root"}|`,
      );
      st = s1;
      fi = f1;
      n = n1;
    }
    if (parent !== null && depth >= toLevel) return [st, fi, n];
    for (const w of kids.get(parent) ?? []) {
      const idx = rows.length;
      rows.push({
        kind: "band",
        id: w.id,
        depth,
        label: bandText(
          "WBS",
          o.wbsPathLabels ? c.wbsPath(w.id) : w.code,
          w.name,
        ),
        start: null,
        finish: null,
        count: 0,
        wbsId: w.id,
      });
      const before = rows.length;
      const [s2, f2, n2] = visit(w.id, depth + 1);
      if (dropEmpty && n2 === 0) {
        rows.length = idx; // nothing below: drop the band
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
  return finish();
}
