// Resource and Activity Usage spreadsheets: units or cost per period, spread
// evenly over the working span of each assignment (actuals up to the data
// date, remaining after it), as P6's usage spreadsheets show them.

import type { Schedule } from "./types";

const DAY = 86_400_000;

export interface UsageRow {
  id: string;
  label: string;
  sub: string;
  values: number[];
  total: number;
}

export interface UsageSheet {
  periods: { start: number; end: number; label: string }[];
  rows: UsageRow[];
  totals: number[];
}

const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function usageSheet(s: Schedule, opts: { by: "resource" | "activity"; step: "week" | "month"; measure: "units" | "cost"; activityIds?: Set<string> }): UsageSheet {
  const dd = s.dataDate ?? Date.now();
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
  type Piece = { key: string; qty: number; a: number; b: number };
  const pieces: Piece[] = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of s.assignments ?? []) {
    const a = acts.get(x.activityId);
    if (!a || (opts.activityIds && !opts.activityIds.has(a.id))) continue;
    const key = opts.by === "resource" ? x.resourceId : a.id;
    const act = opts.measure === "cost" ? x.actualCost : x.actualQty;
    const rem = opts.measure === "cost" ? x.remainingCost : x.remainingQty;
    if (a.actualStart !== null && act > 0) pieces.push({ key, qty: act, a: a.actualStart, b: Math.max(a.actualStart + DAY, a.actualFinish ?? dd) });
    if (a.status !== "complete" && rem > 0 && a.finish !== null) {
      const st = a.actualStart !== null ? Math.max(dd, a.start ?? dd) : a.start ?? dd;
      pieces.push({ key, qty: rem, a: st, b: Math.max(st + DAY, a.finish) });
    }
  }
  for (const p of pieces) {
    lo = Math.min(lo, p.a);
    hi = Math.max(hi, p.b);
  }
  if (!pieces.length) return { periods: [], rows: [], totals: [] };
  const periods: UsageSheet["periods"] = [];
  if (opts.step === "month") {
    const d = new Date(lo);
    for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); t < hi; ) {
      const x = new Date(t);
      const n = Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 1);
      periods.push({ start: t, end: n, label: `${M[x.getUTCMonth()]}-${String(x.getUTCFullYear()).slice(2)}` });
      t = n;
    }
  } else {
    const d = new Date(lo);
    const toMon = (d.getUTCDay() + 6) % 7;
    for (let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - toMon); t < hi; t += 7 * DAY) {
      const x = new Date(t);
      periods.push({ start: t, end: t + 7 * DAY, label: `${String(x.getUTCDate()).padStart(2, "0")}-${M[x.getUTCMonth()]}` });
    }
  }
  const rowMap = new Map<string, number[]>();
  for (const p of pieces) {
    const vals = rowMap.get(p.key) ?? rowMap.set(p.key, new Array(periods.length).fill(0)).get(p.key)!;
    const span = p.b - p.a;
    // Binary search the first period, then walk.
    let i = 0;
    let j = periods.length - 1;
    while (i < j) {
      const m = (i + j) >> 1;
      if (periods[m].end <= p.a) i = m + 1;
      else j = m;
    }
    for (; i < periods.length && periods[i].start < p.b; i++) {
      const ov = Math.min(p.b, periods[i].end) - Math.max(p.a, periods[i].start);
      if (ov > 0) vals[i] += (p.qty * ov) / span;
    }
  }
  const rows: UsageRow[] = [...rowMap].map(([key, values]) => {
    const r = res.get(key);
    const a = acts.get(key);
    return {
      id: key,
      label: opts.by === "resource" ? r?.code ?? key : a?.code ?? key,
      sub: opts.by === "resource" ? `${r?.name ?? ""}${r ? ` (${opts.measure === "cost" ? "cost" : r.unit})` : ""}` : a?.name ?? "",
      values,
      total: values.reduce((x, y) => x + y, 0),
    };
  });
  rows.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const totals = periods.map((_, i) => rows.reduce((t, r) => t + r.values[i], 0));
  return { periods, rows, totals };
}
