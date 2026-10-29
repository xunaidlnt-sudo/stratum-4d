// Microsoft Project XML (MSPDI) reader. MS Project saves this with
// File > Save As > XML; the schema is published by Microsoft.
//
// Summary tasks become WBS nodes; everything else becomes an activity.

import { XMLParser } from "fast-xml-parser";
import { standardCalendar } from "./calendar";
import type {
  Activity,
  Assignment,
  Calendar,
  ConstraintType,
  Relationship,
  RelationshipType,
  Resource,
  Schedule,
  StoredBaseline,
  WbsNode,
} from "./types";

type X = Record<string, unknown>;

const arr = <T = X>(v: unknown): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? (v as T[]) : [v as T]);
const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));
const n = (v: unknown): number | null => {
  if (v === undefined || v === null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

/** "2026-03-02T08:00:00" read as UTC wall time, like the XER reader. */
export function parseMspDate(v: unknown): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(str(v));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
}

/** ISO-8601 duration ("PT16H0M0S", "P2DT4H") in hours. MSPDI days in durations are 24 h elapsed. */
export function parseMspDuration(v: unknown): number | null {
  const m = /^-?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(str(v));
  if (!m) return null;
  const h = (+(m[1] ?? 0)) * 24 + +(m[2] ?? 0) + +(m[3] ?? 0) / 60 + +(m[4] ?? 0) / 3600;
  return str(v).startsWith("-") ? -h : h;
}

// MSPDI link types: 0 FF, 1 FS, 2 SF, 3 SS.
const LINK: Record<string, RelationshipType> = { "0": "FF", "1": "FS", "2": "SF", "3": "SS" };
// MSPDI constraint types.
const CONSTRAINT: Record<string, ConstraintType | null> = {
  "0": null, // as soon as possible
  "1": "as-late-as-possible",
  "2": "start-on", // must start on
  "3": "finish-on", // must finish on
  "4": "start-on-or-after",
  "5": "start-on-or-before",
  "6": "finish-on-or-after",
  "7": "finish-on-or-before",
};

function hhmm(v: unknown): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(v));
  return m ? +m[1] + +m[2] / 60 : 0;
}

function readCalendars(project: X): Calendar[] {
  return arr(((project.Calendars as X) ?? {}).Calendar).map((c) => {
    const week: [number, number][][] = [[], [], [], [], [], [], []];
    const holidays: number[] = [];
    const workdays: { date: number; spans: [number, number][] }[] = [];
    let sawWeek = false;
    const listed = new Set<number>();
    for (const d of arr(((c.WeekDays as X) ?? {}).WeekDay)) {
      const spans = arr(((d.WorkingTimes as X) ?? {}).WorkingTime).map((w) => [hhmm(w.FromTime), hhmm(w.ToTime) || 24] as [number, number]);
      const dayType = n(d.DayType) ?? 0;
      if (dayType >= 1 && dayType <= 7) {
        sawWeek = true;
        listed.add(dayType - 1);
        week[dayType - 1] = str(d.DayWorking) === "1" ? spans : [];
      } else if (dayType === 0) {
        // Older exception format: a date range with DayWorking 0/1.
        const p = (d.TimePeriod as X) ?? {};
        const from = parseMspDate(p.FromDate);
        const to = parseMspDate(p.ToDate);
        if (from !== null && to !== null) {
          for (let t = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()); t <= to; t += 86_400_000) {
            if (str(d.DayWorking) === "1") workdays.push({ date: t, spans });
            else holidays.push(t);
          }
        }
      }
    }
    for (const e of arr(((c.Exceptions as X) ?? {}).Exception)) {
      const p = (e.TimePeriod as X) ?? {};
      const from = parseMspDate(p.FromDate);
      const to = parseMspDate(p.ToDate);
      const spans = arr(((e.WorkingTimes as X) ?? {}).WorkingTime).map((w) => [hhmm(w.FromTime), hhmm(w.ToTime) || 24] as [number, number]);
      if (from === null || to === null) continue;
      for (let t = Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth(), new Date(from).getUTCDate()); t <= to; t += 86_400_000) {
        if (str(e.DayWorking) === "1" && spans.length) workdays.push({ date: t, spans });
        else holidays.push(t);
      }
    }
    const id = str(c.UID);
    const name = str(c.Name) || `Calendar ${id}`;
    if (!sawWeek) return { ...standardCalendar(id, name), holidays, workdays };
    // Days the file does not list follow the standard week (derived calendars inherit them).
    const std = standardCalendar().week;
    for (let d = 0; d < 7; d++) if (!listed.has(d)) week[d] = std[d];
    const workingDays = week.filter((d) => d.length);
    const hoursPerDay = workingDays.length ? workingDays[0].reduce((h, [a, b]) => h + (b - a), 0) : 8;
    return { id, name, week, holidays, workdays, hoursPerDay };
  });
}

export function parseMspdi(xml: string): Schedule {
  const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });
  const doc = parser.parse(xml) as X;
  const project = doc.Project as X | undefined;
  if (!project || !project.Tasks) throw new Error("Not a Microsoft Project XML file (no <Project><Tasks>).");

  const calendars = readCalendars(project);
  const defaultCalendarId = str(project.CalendarUID) || calendars[0]?.id || null;

  const tasks = arr(((project.Tasks as X) ?? {}).Task).filter((t) => str(t.UID) !== "0" && str(t.IsNull) !== "1");
  const byOutline = new Map<string, X>();
  for (const t of tasks) byOutline.set(str(t.OutlineNumber), t);
  const parentOf = (t: X): X | undefined => {
    const o = str(t.OutlineNumber);
    const i = o.lastIndexOf(".");
    return i > 0 ? byOutline.get(o.slice(0, i)) : undefined;
  };

  const wbs: WbsNode[] = [];
  const activities: Activity[] = [];
  const relationships: Relationship[] = [];
  // MS Project Baseline1-10 become stored baselines named "Baseline 1" … "Baseline 10".
  const numbered = new Map<number, StoredBaseline["dates"]>();
  const summaryUids = new Set<string>();
  let seq = 0;
  for (const t of tasks) {
    const uid = str(t.UID);
    const parent = parentOf(t);
    const parentId = parent ? `w${str(parent.UID)}` : null;
    if (str(t.Summary) === "1") {
      wbs.push({ id: `w${uid}`, parentId, code: str(t.WBS) || str(t.OutlineNumber), name: str(t.Name), seq: seq++ });
      summaryUids.add(uid);
      for (const l of arr(t.PredecessorLink))
        relationships.push({ id: `${str(l.PredecessorUID)}-${uid}-${relationships.length}`, predecessorId: str(l.PredecessorUID), successorId: uid, type: LINK[str(l.Type)] ?? "FS", lagHours: (n(l.LinkLag) ?? 0) / 600 });
      continue;
    }
    const pct = n(t.PercentComplete) ?? 0;
    const actualStart = parseMspDate(t.ActualStart);
    const actualFinish = parseMspDate(t.ActualFinish);
    const status = actualFinish !== null || pct >= 100 ? "complete" : actualStart !== null || pct > 0 ? "in-progress" : "not-started";
    const baseline = arr(t.Baseline).find((b) => str(b.Number) === "0");
    const milestone = str(t.Milestone) === "1";
    const dur = parseMspDuration(t.Duration);
    const ct = CONSTRAINT[str(t.ConstraintType)] ?? null;
    const totalSlack = n(t.TotalSlack); // tenths of a minute
    const code = str(t.ID) ? `T${str(t.ID)}` : `UID${uid}`;
    for (const bl of arr(t.Baseline)) {
      const k = n(bl.Number);
      if (k === null || k < 1 || k > 10) continue;
      const d = numbered.get(k) ?? {};
      d[code] = [parseMspDate(bl.Start), parseMspDate(bl.Finish)];
      numbered.set(k, d);
    }
    const ttype = str(t.Type);
    const manual = str(t.Manual) === "1";
    activities.push({
      id: uid,
      code,
      name: str(t.Name),
      wbsId: parentId,
      type: milestone ? "milestone" : "task",
      status,
      percentComplete: status === "complete" ? 100 : pct,
      start: parseMspDate(t.Start),
      finish: parseMspDate(t.Finish),
      baselineStart: baseline ? parseMspDate(baseline.Start) : null,
      baselineFinish: baseline ? parseMspDate(baseline.Finish) : null,
      actualStart,
      actualFinish,
      totalFloatHours: totalSlack !== null ? totalSlack / 600 : null,
      originalDurationHours: dur,
      remainingDurationHours: parseMspDuration(t.RemainingDuration) ?? dur,
      critical: str(t.Critical) === "1",
      calendarId: str(t.CalendarUID) && str(t.CalendarUID) !== "-1" ? str(t.CalendarUID) : null,
      codes: {},
      constraint: ct ? { type: ct, date: parseMspDate(t.ConstraintDate) } : null,
      mspUid: Number(uid),
      ...(manual ? { taskMode: "manual" as const } : {}),
      ...(str(t.Active) === "0" ? { inactive: true } : {}),
      ...(parseMspDate(t.Deadline) !== null ? { deadline: parseMspDate(t.Deadline) } : {}),
      ...(n(t.Priority) !== null && n(t.Priority) !== 500 ? { priority: n(t.Priority)! } : {}),
      ...(str(t.Estimated) === "1" ? { estimated: true } : {}),
      ...(str(t.EffortDriven) === "1" ? { effortDriven: true } : {}),
      ...(str(t.HideBar) === "1" ? { hideBar: true } : {}),
      ...(str(t.Notes) ? { notes: str(t.Notes) } : {}),
      ...(ttype === "1" ? { durationType: "fixed-duration-units" as const } : ttype === "2" ? { durationType: "fixed-units" as const } : ttype === "0" ? { durationType: "fixed-units-time" as const } : {}),
    });
    for (const l of arr(t.PredecessorLink)) {
      const lagTenthsMin = n(l.LinkLag) ?? 0;
      relationships.push({
        id: `${str(l.PredecessorUID)}-${uid}-${relationships.length}`,
        predecessorId: str(l.PredecessorUID),
        successorId: uid,
        type: LINK[str(l.Type)] ?? "FS",
        lagHours: lagTenthsMin / 600,
      });
    }
  }
  // Links to and from summary tasks: Stratum links tasks only, so a summary
  // predecessor becomes its last tasks and a summary successor its first tasks.
  const actIds = new Set(activities.map((a) => a.id));
  const wbsParent = new Map(wbs.map((w) => [w.id, w.parentId]));
  const under = new Map<string, string[]>();
  for (const a of activities) for (let w = a.wbsId, g = 0; w && g < 64; w = wbsParent.get(w) ?? null, g++) (under.get(w) ?? under.set(w, []).get(w)!).push(a.id);
  const ends = (sumUid: string, first: boolean): string[] => {
    const kids = new Set(under.get(`w${sumUid}`) ?? []);
    const inside = relationships.filter((r) => kids.has(r.predecessorId) && kids.has(r.successorId));
    const linked = new Set(inside.map((r) => (first ? r.successorId : r.predecessorId)));
    return [...kids].filter((id) => !linked.has(id));
  };
  const seen = new Set<string>();
  const rels: Relationship[] = [];
  for (const r of relationships) {
    const fromStart = r.type === "SS" || r.type === "SF";
    const toStart = r.type === "FS" || r.type === "SS";
    const preds = summaryUids.has(r.predecessorId) ? ends(r.predecessorId, fromStart) : [r.predecessorId];
    const succs = summaryUids.has(r.successorId) ? ends(r.successorId, toStart) : [r.successorId];
    for (const p of preds)
      for (const q of succs) {
        if (!actIds.has(p) || !actIds.has(q) || p === q || seen.has(`${p}>${q}`)) continue;
        seen.add(`${p}>${q}`);
        rels.push(p === r.predecessorId && q === r.successorId ? r : { ...r, id: `${r.id}-${p}-${q}`, predecessorId: p, successorId: q });
      }
  }

  const resources: Resource[] = arr(((project.Resources as X) ?? {}).Resource)
    .filter((r) => str(r.UID) !== "0" && str(r.Name))
    .map((r) => ({
      id: str(r.UID),
      code: str(r.Initials) || str(r.Name),
      name: str(r.Name),
      type: str(r.Type) === "0" ? "material" : "labor",
      unit: str(r.Type) === "0" ? str(r.MaterialLabel) || "unit" : "h",
      pricePerUnit: n(r.StandardRate) ?? 0,
      ...(str(r.Group) ? { group: str(r.Group) } : {}),
      ...(str(r.EmailAddress) ? { email: str(r.EmailAddress) } : {}),
      ...(n(r.OvertimeRate) ? { overtimeRate: n(r.OvertimeRate)! } : {}),
      ...(n(r.CostPerUse) ? { costPerUse: n(r.CostPerUse)! } : {}),
      ...(str(r.AccrueAt) === "1" ? { accrueAt: "start" as const } : str(r.AccrueAt) === "2" ? { accrueAt: "end" as const } : {}),
      ...(str(r.Type) !== "0" && n(r.MaxUnits) !== null ? { maxUnitsPerHour: n(r.MaxUnits)! } : {}),
      ...(str(r.CalendarUID) && str(r.CalendarUID) !== "-1" && calendars.some((c) => c.id === str(r.CalendarUID)) ? { calendarId: str(r.CalendarUID) } : {}),
    }));
  const resIds = new Set(resources.map((r) => r.id));
  const assignments: Assignment[] = arr(((project.Assignments as X) ?? {}).Assignment)
    .filter((a) => actIds.has(str(a.TaskUID)) && resIds.has(str(a.ResourceUID)))
    .map((a) => ({
      id: str(a.UID),
      activityId: str(a.TaskUID),
      resourceId: str(a.ResourceUID),
      budgetQty: parseMspDuration(a.Work) ?? n(a.Units) ?? 0,
      actualQty: parseMspDuration(a.ActualWork) ?? 0,
      remainingQty: parseMspDuration(a.RemainingWork) ?? 0,
      budgetCost: n(a.Cost) ?? 0,
      actualCost: n(a.ActualCost) ?? 0,
      remainingCost: n(a.RemainingCost) ?? 0,
      ...(n(a.Units) !== null ? { units: n(a.Units)! } : {}),
    }));

  return {
    projectId: str(project.GUID) || str(project.Name) || "msp",
    projectCode: str(project.Name).replace(/\.xml$/i, "") || "MSP",
    projectName: str(project.Title) || str(project.Name) || "Microsoft Project",
    dataDate: parseMspDate(project.StatusDate) ?? parseMspDate(project.CurrentDate),
    activities,
    wbs,
    relationships: rels,
    calendars,
    defaultCalendarId,
    resources,
    assignments,
    sourceXer: null,
    sourceFormat: "mspdi",
    ...(str(project.ScheduleFromStart) === "0" ? { scheduleFrom: "finish" as const, mustFinishBy: parseMspDate(project.FinishDate) } : {}),
    ...(parseMspDate(project.StartDate) !== null ? { plannedStart: parseMspDate(project.StartDate) } : {}),
    ...(str(project.NewTasksAreManual) === "1" ? { newTaskMode: "manual" as const } : {}),
    ...(numbered.size
      ? {
          baselines: [...numbered]
            .sort((p, q) => p[0] - q[0])
            .map(([k, dates]) => ({ id: `msp-bl${k}`, name: `Baseline ${k}`, createdAt: new Date(0).toISOString(), dataDate: null, dates })),
        }
      : {}),
  };
}
