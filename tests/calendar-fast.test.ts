import { addWorkHours, nextWorkStart, prevWorkEnd, standardCalendar, subtractWorkHours, workHoursBetween } from "../src/core/calendar";
import type { Calendar } from "../src/core/types";
import * as ref from "./helpers/calendarRef";

// Deterministic pseudo-random numbers.
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const DAY = 86_400_000;
const HOUR = 3_600_000;

function randomCalendar(i: number): Calendar {
  const spans: [number, number][][] = [
    [[8, 12], [13, 17]],
    [[7, 15]],
    [[0, 24]],
    [[6.5, 11.25], [12, 18.5]],
  ];
  const day = spans[i % spans.length];
  const week = Array.from({ length: 7 }, (_, d) => (rnd() < 0.75 || d === 3 ? day : [])) as [number, number][][];
  const base = Date.UTC(2026, 0, 1);
  const holidays = Array.from({ length: 12 }, () => base + Math.floor(rnd() * 900) * DAY);
  const workdays = Array.from({ length: 4 }, () => ({ date: base + Math.floor(rnd() * 900) * DAY, spans: [[9, 13]] as [number, number][] }));
  return { id: `c${i}`, name: `c${i}`, week, holidays, workdays, hoursPerDay: 8 };
}

describe("fast calendar arithmetic", () => {
  const cals = [standardCalendar(), ...Array.from({ length: 11 }, (_, i) => randomCalendar(i))];
  it("matches the day-by-day reference on random dates", () => {
    let checked = 0;
    for (const cal of cals) {
      for (let k = 0; k < 250; k++) {
        // Times on hour, half-hour and odd minutes, around 2025–2028.
        const t = Date.UTC(2025, 6, 1) + Math.floor(rnd() * 1000) * DAY + Math.floor(rnd() * 96) * 15 * 60_000;
        const h = [0, 0.5, 1, 4, 8, 16, 40, 333, 2000][Math.floor(rnd() * 9)] + (rnd() < 0.2 ? 0.25 : 0);
        const u = t + Math.floor((rnd() - 0.3) * 600) * DAY + Math.floor(rnd() * 24) * HOUR;
        expect(addWorkHours(cal, t, h)).toBe(ref.addWorkHours(cal, t, h));
        expect(subtractWorkHours(cal, t, h)).toBe(ref.subtractWorkHours(cal, t, h));
        expect(nextWorkStart(cal, t)).toBe(ref.nextWorkStart(cal, t));
        expect(prevWorkEnd(cal, t)).toBe(ref.prevWorkEnd(cal, t));
        expect(workHoursBetween(cal, t, u)).toBeCloseTo(ref.workHoursBetween(cal, t, u), 6);
        checked++;
      }
    }
    expect(checked).toBe(cals.length * 250);
  });
  it("handles spans far from the first query (index widening)", () => {
    const cal = standardCalendar();
    const t = Date.UTC(2026, 0, 5, 8);
    const far = addWorkHours(cal, t, 8 * 260 * 20); // ~20 years of working days
    expect(far).toBe(ref.addWorkHours(cal, t, 8 * 260 * 20));
    expect(subtractWorkHours(cal, far, 8 * 260 * 20)).toBe(ref.subtractWorkHours(cal, far, 8 * 260 * 20));
    expect(workHoursBetween(cal, t, far)).toBeCloseTo(8 * 260 * 20, 6);
  });
});
