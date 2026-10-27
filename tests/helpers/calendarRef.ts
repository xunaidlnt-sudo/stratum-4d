// Reference (day-by-day) calendar arithmetic, kept only to check the fast
// implementation in src/core/calendar.ts gives identical answers.
import type { Calendar } from "../../src/core/types";
const HOUR = 3_600_000;
const DAY = 86_400_000;
const dayStart = (t: number) => Math.floor(t / DAY) * DAY;
function index(cal: Calendar) {
  return { holidays: new Set(cal.holidays.map(dayStart)), workdays: new Map((cal.workdays ?? []).map((w) => [dayStart(w.date), w.spans])) };
}
/** Working spans for the day starting at `day` (UTC midnight), as absolute ms intervals. */
export function spansOn(cal: Calendar, day: number): [number, number][] {
  const ix = index(cal);
  let spans: [number, number][];
  const override = ix.workdays.get(day);
  if (override) spans = override;
  else if (ix.holidays.has(day)) spans = [];
  else spans = cal.week[new Date(day).getUTCDay()] ?? [];
  return spans.map(([a, b]) => [day + a * HOUR, day + b * HOUR]);
}

function hasAnyWork(cal: Calendar): boolean {
  return cal.week.some((d) => d.some(([a, b]) => b > a)) || (cal.workdays ?? []).length > 0;
}

const MAX_DAYS = 365 * 60;

/**
 * Add working hours to t. A result that lands exactly on the end of a working
 * span stays there (a task finishing at 17:00 finishes at 17:00, not 08:00 the
 * next morning). Adding 0 returns t unchanged.
 */
export function addWorkHours(cal: Calendar, t: number, hours: number): number {
  if (hours < 0) return subtractWorkHours(cal, t, -hours);
  if (hours === 0) return t;
  if (!hasAnyWork(cal)) throw new Error(`Calendar "${cal.name}" has no working time`);
  let rem = hours * HOUR;
  for (let day = dayStart(t), i = 0; i < MAX_DAYS; day += DAY, i++) {
    for (const [a, b] of spansOn(cal, day)) {
      const s = Math.max(t, a);
      if (s >= b) continue;
      const avail = b - s;
      if (rem <= avail) return s + rem;
      rem -= avail;
    }
  }
  throw new Error("Date arithmetic ran past 60 years; check the calendar");
}

/** Subtract working hours. A result exactly on the start of a span stays there. */
export function subtractWorkHours(cal: Calendar, t: number, hours: number): number {
  if (hours < 0) return addWorkHours(cal, t, -hours);
  if (hours === 0) return t;
  if (!hasAnyWork(cal)) throw new Error(`Calendar "${cal.name}" has no working time`);
  let rem = hours * HOUR;
  for (let day = dayStart(t), i = 0; i < MAX_DAYS; day -= DAY, i++) {
    const spans = spansOn(cal, day);
    for (let k = spans.length - 1; k >= 0; k--) {
      const [a, b] = spans[k];
      const e = Math.min(t, b);
      if (e <= a) continue;
      const avail = e - a;
      if (rem <= avail) return e - rem;
      rem -= avail;
    }
  }
  throw new Error("Date arithmetic ran past 60 years; check the calendar");
}

/** Earliest working moment at or after t (a start date). */
export function nextWorkStart(cal: Calendar, t: number): number {
  if (!hasAnyWork(cal)) return t;
  for (let day = dayStart(t), i = 0; i < MAX_DAYS; day += DAY, i++) {
    for (const [a, b] of spansOn(cal, day)) {
      if (t < b) return Math.max(t, a);
    }
  }
  return t;
}

/** Latest working moment at or before t (a finish date). */
export function prevWorkEnd(cal: Calendar, t: number): number {
  if (!hasAnyWork(cal)) return t;
  for (let day = dayStart(t), i = 0; i < MAX_DAYS; day -= DAY, i++) {
    const spans = spansOn(cal, day);
    for (let k = spans.length - 1; k >= 0; k--) {
      const [a, b] = spans[k];
      if (t > a) return Math.min(t, b);
    }
  }
  return t;
}

/** Working hours between a and b (negative when b < a). */
export function workHoursBetween(cal: Calendar, a: number, b: number): number {
  if (b < a) return -workHoursBetween(cal, b, a);
  let total = 0;
  for (let day = dayStart(a); day < b; day += DAY) {
    for (const [s, e] of spansOn(cal, day)) {
      const lo = Math.max(s, a);
      const hi = Math.min(e, b);
      if (hi > lo) total += hi - lo;
    }
  }
  return total / HOUR;
}

