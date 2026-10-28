// Claim Digger: compare two versions of a project field by field, the way
// P6's Claim Digger reports it. Activities match on Activity ID and
// relationships on predecessor / successor IDs.

import type { Activity, Schedule } from "./types";

const DAY = 86_400_000;

export interface FieldChange {
  field: string;
  before: string;
  after: string;
}

export interface ActivityDiff {
  code: string;
  name: string;
  changes: FieldChange[];
}

export interface RelDiff {
  pred: string;
  succ: string;
  kind: "added" | "deleted" | "changed";
  before: string;
  after: string;
}

export interface ClaimDiggerReport {
  base: { code: string; dataDate: number | null; finish: number | null; activities: number };
  current: { code: string; dataDate: number | null; finish: number | null; activities: number };
  finishShiftDays: number | null;
  added: { code: string; name: string }[];
  deleted: { code: string; name: string }[];
  changed: ActivityDiff[];
  relationships: RelDiff[];
}

const fmt = (t: number | null | undefined) => {
  if (t === null || t === undefined) return "";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};
const hpdOf = (s: Schedule) => (s.calendars?.find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0])?.hoursPerDay ?? 8;
const days = (h: number | null | undefined, hpd: number) => (h === null || h === undefined ? "" : `${Math.round((h / hpd) * 10) / 10}d`);
const finishOf = (s: Schedule) => {
  const f = s.activities.reduce((m, a) => Math.max(m, a.finish ?? -Infinity), -Infinity);
  return Number.isFinite(f) ? f : null;
};

export function claimDigger(base: Schedule, current: Schedule): ClaimDiggerReport {
  const hb = hpdOf(base);
  const hc = hpdOf(current);
  const calName = (s: Schedule, id: string | null) => (id ? s.calendars?.find((c) => c.id === id)?.name ?? id : "Project default");
  const wbsName = (s: Schedule, id: string | null) => {
    const w = s.wbs.find((x) => x.id === id);
    return w ? `${w.code} ${w.name}` : "";
  };
  const fields: [string, (a: Activity, s: Schedule, hpd: number) => string][] = [
    ["Activity Name", (a) => a.name],
    ["WBS", (a, s) => wbsName(s, a.wbsId)],
    ["Activity Type", (a) => a.type],
    ["Calendar", (a, s) => calName(s, a.calendarId)],
    ["Original Duration", (a, _s, h) => days(a.originalDurationHours, h)],
    ["Remaining Duration", (a, _s, h) => days(a.remainingDurationHours, h)],
    ["Start", (a) => fmt(a.start)],
    ["Finish", (a) => fmt(a.finish)],
    ["Actual Start", (a) => fmt(a.actualStart)],
    ["Actual Finish", (a) => fmt(a.actualFinish)],
    ["Activity Status", (a) => a.status],
    ["% Complete", (a) => `${Math.round(a.percentComplete)}%`],
    ["Primary Constraint", (a) => (a.constraint ? `${a.constraint.type} ${fmt(a.constraint.date)}` : "")],
    ["Total Float", (a, _s, h) => days(a.totalFloatHours, h)],
  ];
  const b = new Map(base.activities.map((a) => [a.code, a]));
  const c = new Map(current.activities.map((a) => [a.code, a]));
  const added = current.activities.filter((a) => !b.has(a.code)).map((a) => ({ code: a.code, name: a.name }));
  const deleted = base.activities.filter((a) => !c.has(a.code)).map((a) => ({ code: a.code, name: a.name }));
  const changed: ActivityDiff[] = [];
  for (const a of current.activities) {
    const o = b.get(a.code);
    if (!o) continue;
    const changes: FieldChange[] = [];
    for (const [label, get] of fields) {
      const before = get(o, base, hb);
      const after = get(a, current, hc);
      if (before !== after) changes.push({ field: label, before, after });
    }
    if (changes.length) changed.push({ code: a.code, name: a.name, changes });
  }
  // Relationships by Activity ID pair.
  const key = (s: Schedule) => {
    const code = new Map(s.activities.map((a) => [a.id, a.code]));
    const hpd = hpdOf(s);
    const m = new Map<string, { pred: string; succ: string; text: string }>();
    for (const r of s.relationships) {
      const p = code.get(r.predecessorId);
      const q = code.get(r.successorId);
      if (p && q) m.set(`${p}>${q}`, { pred: p, succ: q, text: `${r.type}${r.lagHours ? ` ${r.lagHours > 0 ? "+" : ""}${days(r.lagHours, hpd)}` : ""}` });
    }
    return m;
  };
  const rb = key(base);
  const rc = key(current);
  const relationships: RelDiff[] = [];
  for (const [k, v] of rc) {
    const o = rb.get(k);
    if (!o) relationships.push({ pred: v.pred, succ: v.succ, kind: "added", before: "", after: v.text });
    else if (o.text !== v.text) relationships.push({ pred: v.pred, succ: v.succ, kind: "changed", before: o.text, after: v.text });
  }
  for (const [k, v] of rb) if (!rc.has(k)) relationships.push({ pred: v.pred, succ: v.succ, kind: "deleted", before: v.text, after: "" });
  const fb = finishOf(base);
  const fc = finishOf(current);
  return {
    base: { code: base.projectCode, dataDate: base.dataDate, finish: fb, activities: base.activities.length },
    current: { code: current.projectCode, dataDate: current.dataDate, finish: fc, activities: current.activities.length },
    finishShiftDays: fb !== null && fc !== null ? Math.round((fc - fb) / DAY) : null,
    added,
    deleted,
    changed,
    relationships,
  };
}

/** The report as CSV (one row per change), for Excel. */
export function claimDiggerCsv(r: ClaimDiggerReport): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [["Type", "Activity ID", "Activity Name", "Field", "Base", "Current"]];
  for (const a of r.added) rows.push(["Activity added", a.code, a.name, "", "", ""]);
  for (const a of r.deleted) rows.push(["Activity deleted", a.code, a.name, "", "", ""]);
  for (const a of r.changed) for (const ch of a.changes) rows.push(["Activity changed", a.code, a.name, ch.field, ch.before, ch.after]);
  for (const x of r.relationships) rows.push([`Relationship ${x.kind}`, `${x.pred} → ${x.succ}`, "", "", x.before, x.after]);
  return rows.map((row) => row.map(q).join(",")).join("\r\n");
}
