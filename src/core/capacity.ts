// Capacity planning across projects (P6 EPPM portfolio capacity planning):
// monthly demand of each resource or role in a set of projects against the
// capacity its limits allow.

import { workHoursBetween, standardCalendar } from "./calendar";
import type { Schedule } from "./types";
import { usageSheet } from "./usage";

export interface CapacityRow {
  key: string;
  label: string;
  demand: number[];
  capacity: number[];
  /** Demand per project code, per month. */
  byProject: Record<string, number[]>;
}

export interface CapacityPlan {
  months: { start: number; end: number; label: string }[];
  rows: CapacityRow[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function capacityPlan(projects: Schedule[], by: "resource" | "role"): CapacityPlan {
  // Months covering all demand.
  const sheets = projects.map((s) => ({ s, sheet: usageSheet(s, { by: "resource", step: "month", measure: "units" }) }));
  let lo = Infinity;
  let hi = -Infinity;
  for (const { sheet } of sheets) for (const p of sheet.periods) (lo = Math.min(lo, p.start)), (hi = Math.max(hi, p.end));
  if (!Number.isFinite(lo)) return { months: [], rows: [] };
  const months: CapacityPlan["months"] = [];
  for (let t = lo; t < hi; ) {
    const d = new Date(t);
    const n = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    months.push({ start: t, end: n, label: `${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}` });
    t = n;
  }
  const idx = new Map(months.map((m, i) => [m.start, i]));
  const rows = new Map<string, CapacityRow>();
  const row = (key: string, label: string) => rows.get(key) ?? (rows.set(key, { key, label, demand: months.map(() => 0), capacity: months.map(() => 0), byProject: {} }).get(key)!);
  // Capacity of a resource in a month: max units per hour × working hours of its calendar.
  const capSeen = new Set<string>();
  for (const { s, sheet } of sheets) {
    const cals = new Map((s.calendars ?? []).map((c) => [c.id, c]));
    const def = (s.defaultCalendarId && cals.get(s.defaultCalendarId)) || s.calendars?.[0] || standardCalendar();
    const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
    const roles = new Map((s.roles ?? []).map((r) => [r.id, r]));
    const keyOf = (rowId: string): { key: string; label: string } | null => {
      if (rowId.startsWith("role:")) {
        const r = roles.get(rowId.slice(5));
        return by === "role" && r ? { key: `role:${r.code}`, label: `${r.code} – ${r.name}` } : null;
      }
      const r = res.get(rowId);
      if (!r || r.type === "material") return null;
      if (by === "resource") return { key: `res:${r.code}`, label: `${r.code} – ${r.name}` };
      const role = r.roleIds?.length ? roles.get(r.roleIds[0]) : undefined;
      return role ? { key: `role:${role.code}`, label: `${role.code} – ${role.name}` } : { key: "role:(none)", label: "(no role)" };
    };
    for (const r of sheet.rows) {
      const k = keyOf(r.id);
      if (!k) continue;
      const out = row(k.key, k.label);
      const per = (out.byProject[s.projectCode] ??= months.map(() => 0));
      sheet.periods.forEach((p, i) => {
        const m = idx.get(p.start);
        if (m === undefined) return;
        out.demand[m] += r.values[i];
        per[m] += r.values[i];
      });
    }
    // Capacity: count each resource (by code) once across projects.
    for (const r of s.resources ?? []) {
      if (r.type === "material") continue;
      const k = keyOf(r.id);
      if (!k || capSeen.has(`${k.key}|${r.code}`)) continue;
      capSeen.add(`${k.key}|${r.code}`);
      const cal = (r.calendarId && cals.get(r.calendarId)) || def;
      const out = row(k.key, k.label);
      months.forEach((m, i) => (out.capacity[i] += (r.maxUnitsPerHour ?? 1) * workHoursBetween(cal, m.start, m.end)));
    }
  }
  return { months, rows: [...rows.values()].filter((r) => r.demand.some((v) => v > 0)).sort((a, b) => a.label.localeCompare(b.label)) };
}
