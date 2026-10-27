// Working-time calendars and work-hour arithmetic.
//
// All times are epoch ms read as UTC wall-clock time (the same convention as
// the XER reader), so a P6 "08:00" is 08:00 here regardless of the user's zone.

import type { Calendar } from "./types";

export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export function dayStart(t: number): number {
  return Math.floor(t / DAY) * DAY;
}

/** Monday–Friday, 08:00–12:00 and 13:00–17:00 (8 h/day). */
export function standardCalendar(id = "std", name = "Standard 5-day"): Calendar {
  const work: [number, number][] = [
    [8, 12],
    [13, 17],
  ];
  return { id, name, week: [[], work, work, work, work, work, []], holidays: [], hoursPerDay: 8 };
}

/** Seven days a week, 24 hours (for curing, lead times and similar). */
export function continuousCalendar(id = "24x7", name = "24/7"): Calendar {
  const all: [number, number][] = [[0, 24]];
  return { id, name, week: [all, all, all, all, all, all, all], holidays: [], hoursPerDay: 24 };
}

interface Index {
  holidays: Set<number>;
  workdays: Map<number, [number, number][]>;
}
const indexCache = new WeakMap<Calendar, Index>();

function index(cal: Calendar): Index {
  let ix = indexCache.get(cal);
  if (!ix) {
    ix = {
      holidays: new Set(cal.holidays.map(dayStart)),
      workdays: new Map((cal.workdays ?? []).map((w) => [dayStart(w.date), w.spans])),
    };
    indexCache.set(cal, ix);
  }
  return ix;
}

/** Working spans for the day starting at `day` (UTC midnight), as absolute ms intervals. */
export function spansOn(cal: Calendar, day: number): [number, number][] {
  return relSpans(cal, day).map(([a, b]) => [day + a * HOUR, day + b * HOUR]);
}

/** Working spans of a day in hours from midnight (shared arrays: do not mutate). */
function relSpans(cal: Calendar, day: number): [number, number][] {
  const ix = index(cal);
  const override = ix.workdays.get(day);
  if (override) return override;
  if (ix.holidays.has(day)) return [];
  return cal.week[(((Math.floor(day / DAY) + 4) % 7) + 7) % 7] ?? []; // 1 Jan 1970 was a Thursday
}

function hasAnyWork(cal: Calendar): boolean {
  return cal.week.some((d) => d.some(([a, b]) => b > a)) || (cal.workdays ?? []).length > 0;
}

const MAX_DAYS = 365 * 60;

// ---------------------------------------------------------------------------
// Fast arithmetic. Each calendar gets a running total of working time per day
// (prefix[i] = working ms before day d0 + i), built once and widened on demand.
// Then "working hours between" is a subtraction and "add N hours" a binary
// search, instead of walking day by day. This is what keeps F9 fast on
// schedules with tens of thousands of activities over several years.
// ---------------------------------------------------------------------------

interface Cum {
  d0: number; // first day number covered (days since 1970-01-01)
  n: number; // days covered
  prefix: Float64Array; // length n + 1
}
const cumCache = new WeakMap<Calendar, Cum>();

function buildCum(cal: Calendar, d0: number, n: number): Cum {
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    let h = 0;
    for (const [a, b] of relSpans(cal, (d0 + i) * DAY)) if (b > a) h += b - a;
    prefix[i + 1] = prefix[i] + h * HOUR;
  }
  return { d0, n, prefix };
}

/** The cumulative index for `cal`, covering at least days lo..hi. */
function cumFor(cal: Calendar, lo: number, hi: number): Cum {
  let c = cumCache.get(cal);
  if (!c || lo < c.d0 || hi >= c.d0 + c.n) {
    const from = Math.min(lo, c ? c.d0 : lo) - 366;
    const to = Math.max(hi, c ? c.d0 + c.n - 1 : hi) + 366 * 2;
    const next = buildCum(cal, from, to - from + 1);
    // Keep the same origin as before so totals already computed stay comparable.
    if (c) {
      const shift = c.prefix[0] - next.prefix[c.d0 - next.d0];
      if (shift) for (let i = 0; i < next.prefix.length; i++) next.prefix[i] += shift;
    }
    c = next;
    cumCache.set(cal, c);
  }
  return c;
}

/** Working ms from the index origin to t. */
function cumAt(cal: Calendar, c: Cum, t: number): number {
  const d = Math.floor(t / DAY);
  const day = d * DAY;
  let v = c.prefix[d - c.d0];
  for (const [a, b] of relSpans(cal, day)) {
    const s = day + a * HOUR;
    const e = day + b * HOUR;
    if (t >= e) v += e - s;
    else if (t > s) v += t - s;
  }
  return v;
}

/** First day index i (from lo) with prefix[i + 1] >= target (or > when strict); -1 if none in range. */
function findDay(c: Cum, target: number, strict: boolean, from = 0): number {
  let lo = Math.max(0, from);
  let hi = c.n - 1;
  const ok = (i: number) => (strict ? c.prefix[i + 1] > target : c.prefix[i + 1] >= target);
  if (lo > hi || !ok(hi)) return -1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ok(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * Smallest moment where the running total reaches `target` (strict = false)
 * or starts to exceed it (strict = true), searching forward from day index `from`.
 */
function momentOf(cal: Calendar, t0: number, target: number, strict: boolean): number | null {
  const startDay = Math.floor(t0 / DAY);
  for (let span = 366 * 4; span <= MAX_DAYS * 2; span *= 2) {
    const c = cumFor(cal, startDay - 2, startDay + span);
    const i = findDay(c, target, strict, startDay - c.d0 - 1);
    if (i < 0) {
      if (span >= MAX_DAYS) return null;
      continue;
    }
    const day = (c.d0 + i) * DAY;
    let acc = c.prefix[i];
    for (const [a, b] of relSpans(cal, day)) {
      const len = (b - a) * HOUR;
      if (len <= 0) continue;
      if (strict ? acc + len > target : acc + len >= target) return day + a * HOUR + Math.max(0, target - acc);
      acc += len;
    }
    return day + DAY; // unreachable with a consistent index
  }
  return null;
}

/**
 * Add working hours to t. A result that lands exactly on the end of a working
 * span stays there (a task finishing at 17:00 finishes at 17:00, not 08:00 the
 * next morning). Adding 0 returns t unchanged.
 */
export function addWorkHours(cal: Calendar, t: number, hours: number): number {
  if (hours < 0) return subtractWorkHours(cal, t, -hours);
  if (hours === 0) return t;
  if (!hasAnyWork(cal)) throw new Error(`Calendar "${cal.name}" has no working time`);
  const c = cumFor(cal, Math.floor(t / DAY) - 2, Math.floor(t / DAY) + 2);
  const r = momentOf(cal, t, cumAt(cal, c, t) + hours * HOUR, false);
  if (r === null) throw new Error("Date arithmetic ran past 60 years; check the calendar");
  return r;
}

/** Subtract working hours. A result exactly on the start of a span stays there. */
export function subtractWorkHours(cal: Calendar, t: number, hours: number): number {
  if (hours < 0) return addWorkHours(cal, t, -hours);
  if (hours === 0) return t;
  if (!hasAnyWork(cal)) throw new Error(`Calendar "${cal.name}" has no working time`);
  const day = Math.floor(t / DAY);
  // Make sure the index reaches far enough back to hold the hours we subtract.
  let c = cumFor(cal, day - 2, day + 2);
  let target = cumAt(cal, c, t) - hours * HOUR;
  for (let back = 366 * 4; target < c.prefix[0] && back <= MAX_DAYS * 2; back *= 2) {
    c = cumFor(cal, day - back, day + 2);
    target = cumAt(cal, c, t) - hours * HOUR;
  }
  if (target < c.prefix[0]) throw new Error("Date arithmetic ran past 60 years; check the calendar");
  // Largest moment with that total: where the total starts to exceed it, searching from the index start.
  const i = findDay(c, target, true, 0);
  if (i < 0) throw new Error("Date arithmetic ran past 60 years; check the calendar");
  const d = (c.d0 + i) * DAY;
  let acc = c.prefix[i];
  for (const [a, b] of relSpans(cal, d)) {
    const len = (b - a) * HOUR;
    if (len <= 0) continue;
    if (acc + len > target) return d + a * HOUR + Math.max(0, target - acc);
    acc += len;
  }
  return d + DAY;
}

/** Earliest working moment at or after t (a start date). */
export function nextWorkStart(cal: Calendar, t: number): number {
  if (!hasAnyWork(cal)) return t;
  const c = cumFor(cal, Math.floor(t / DAY) - 2, Math.floor(t / DAY) + 2);
  return momentOf(cal, t, cumAt(cal, c, t), true) ?? t;
}

/** Latest working moment at or before t (a finish date). */
export function prevWorkEnd(cal: Calendar, t: number): number {
  if (!hasAnyWork(cal)) return t;
  const day = Math.floor(t / DAY);
  let c = cumFor(cal, day - 2, day + 2);
  let target = cumAt(cal, c, t);
  for (let back = 366 * 4; target <= c.prefix[0] && back <= MAX_DAYS * 2; back *= 2) {
    c = cumFor(cal, day - back, day + 2);
    target = cumAt(cal, c, t);
  }
  if (target <= c.prefix[0]) return t;
  const i = findDay(c, target, false, 0);
  if (i < 0) return t;
  const d = (c.d0 + i) * DAY;
  let acc = c.prefix[i];
  for (const [a, b] of relSpans(cal, d)) {
    const len = (b - a) * HOUR;
    if (len <= 0) continue;
    if (acc + len >= target) return Math.min(t, d + a * HOUR + Math.max(0, target - acc));
    acc += len;
  }
  return t;
}

/** Working hours between a and b (negative when b < a). */
export function workHoursBetween(cal: Calendar, a: number, b: number): number {
  if (b < a) return -workHoursBetween(cal, b, a);
  if (a === b) return 0;
  const c = cumFor(cal, Math.floor(a / DAY) - 1, Math.floor(b / DAY) + 1);
  return (cumAt(cal, c, b) - cumAt(cal, c, a)) / HOUR;
}

// ---------------------------------------------------------------------------
// P6 calendar data (CALENDAR.clndr_data)
//
// P6 stores calendars as nested "(0||Name(args)(children))" records. Weekdays
// are numbered 1 = Sunday .. 7 = Saturday; exception dates are serial day
// numbers counted from 1899-12-30. An exception with no time spans is a
// holiday; one with spans is a working day with those hours.
// ---------------------------------------------------------------------------

const P6_EPOCH = Date.UTC(1899, 11, 30);

function hhmm(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

function spansIn(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const re = /s\|(\d{1,2}:\d{2})\|f\|(\d{1,2}:\d{2})|f\|(\d{1,2}:\d{2})\|s\|(\d{1,2}:\d{2})/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const s = hhmm(m[1] ?? m[4]);
    let f = hhmm(m[2] ?? m[3]);
    if (f === 0) f = 24; // "f|00:00" means midnight at the end of the day
    if (f > s) spans.push([s, f]);
  }
  return spans.sort((a, b) => a[0] - b[0]);
}

export function parseP6CalendarData(id: string, name: string, data: string, hoursPerDay?: number): Calendar {
  const week: [number, number][][] = [[], [], [], [], [], [], []];
  const holidays: number[] = [];
  const workdays: { date: number; spans: [number, number][] }[] = [];

  const dowStart = data.indexOf("DaysOfWeek");
  const excStart = data.indexOf("Exceptions");
  if (dowStart >= 0) {
    const block = data.slice(dowStart, excStart > dowStart ? excStart : undefined);
    const heads = [...block.matchAll(/\(0\|\|([1-7])\(\)\(/g)];
    heads.forEach((h, i) => {
      const from = (h.index ?? 0) + h[0].length;
      const to = i + 1 < heads.length ? heads[i + 1].index : block.length;
      week[Number(h[1]) - 1] = spansIn(block.slice(from, to));
    });
  }
  if (excStart >= 0) {
    const block = data.slice(excStart);
    const heads = [...block.matchAll(/\(0\|\|\d+\(d\|(\d+)\)\(/g)];
    heads.forEach((h, i) => {
      const from = (h.index ?? 0) + h[0].length;
      const to = i + 1 < heads.length ? heads[i + 1].index : block.length;
      const date = P6_EPOCH + Number(h[1]) * DAY;
      const spans = spansIn(block.slice(from, to));
      if (spans.length) workdays.push({ date, spans });
      else holidays.push(date);
    });
  }
  const parsedAny = week.some((d) => d.length);
  const cal: Calendar = parsedAny
    ? { id, name, week, holidays, workdays, hoursPerDay: hoursPerDay ?? 8 }
    : { ...standardCalendar(id, name), holidays, workdays, hoursPerDay: hoursPerDay ?? 8 };
  return cal;
}

/** Encode a calendar back into P6 clndr_data (used by the XER exporter for new calendars). */
export function toP6CalendarData(cal: Calendar): string {
  const t = (h: number) => `${String(Math.floor(h % 24 === 0 && h > 0 ? 0 : h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const spans = (list: [number, number][]) => list.map(([a, b], i) => `(0||${i}(s|${t(a)}|f|${t(b)})())`).join("");
  const days = cal.week.map((d, i) => `(0||${i + 1}()(${spans(d)}))`).join("");
  const ex = [
    ...cal.holidays.map((d) => ({ d, s: [] as [number, number][] })),
    ...(cal.workdays ?? []).map((w) => ({ d: w.date, s: w.spans })),
  ]
    .map((e, i) => `(0||${i}(d|${Math.round((dayStart(e.d) - P6_EPOCH) / DAY)})(${spans(e.s)}))`)
    .join("");
  return `(0||CalendarData()((0||DaysOfWeek()(${days}))(0||Exceptions()(${ex}))))`;
}
