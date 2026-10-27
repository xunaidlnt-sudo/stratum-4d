// Apply a table of values to the schedule: rows from an Excel sheet (matched
// by Activity ID, as P6's Excel import does) or cells pasted from Excel into
// the activity table (matched by position).

import { fieldCtx, fieldsFor, type FieldCtx, type FieldDef } from "./fields";
import { uid } from "./ops";
import type { Activity, Schedule } from "./types";

export type Cell = string | number | boolean | Date | null | undefined;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Read a date typed or exported in any of the usual forms; keeps 08:00 / 17:00 style times when given. */
export function parseDateCell(v: Cell, fallbackHour = 8): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), v.getHours() || fallbackHour, v.getMinutes());
  if (typeof v === "number") {
    // Excel serial date.
    if (v > 20000 && v < 80000) return Math.round((v - 25569) * 86_400_000) + (v % 1 === 0 ? fallbackHour * 3_600_000 : 0);
    return null;
  }
  const t = String(v).replace(/\s*\*?\s*A\s*$/i, "").trim();
  let m = /^(\d{1,2})[-\s/]([A-Za-z]{3})[A-Za-z]*[-\s/](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mi >= 0) return Date.UTC(y, mi, Number(m[1]), m[4] ? Number(m[4]) : fallbackHour, m[5] ? Number(m[5]) : 0);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(t);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : fallbackHour, m[5] ? Number(m[5]) : 0);
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), fallbackHour);
  return null;
}

/** Turn a cell into the value a field's setter expects (days for durations, ms for dates, 0–100 for percents). */
export function coerceCell(f: FieldDef, v: Cell): string | number | boolean | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return f.type === "text" || f.type === "enum" ? "" : null;
  switch (f.type) {
    case "date":
      return parseDateCell(v, f.id.toLowerCase().includes("finish") ? 17 : 8) ?? undefined;
    case "duration":
    case "number": {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, "").replace(/d$/i, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "percent": {
      if (typeof v === "number") return v <= 1 && v > 0 && !Number.isInteger(v) ? v * 100 : v;
      const n = Number(String(v).replace(/[%\s]/g, ""));
      return Number.isFinite(n) ? n : undefined;
    }
    case "bool":
      return v === true || /^(y|yes|true|1)$/i.test(String(v));
    default:
      return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  }
}

export interface ImportResult {
  schedule: Schedule;
  updated: number;
  added: number;
  changes: number;
  skipped: string[];
  unknownColumns: string[];
}

function findField(header: string, fields: FieldDef[]): FieldDef | undefined {
  const h = header.trim().toLowerCase();
  return fields.find((f) => f.label.toLowerCase() === h || f.id.toLowerCase() === h);
}

function applyValue(a: Activity, f: FieldDef, v: Cell, c: FieldCtx): Partial<Activity> | null {
  if (!f.set) return null;
  const value = coerceCell(f, v);
  if (value === undefined) return null;
  return f.set(a, value as string | number | boolean | null, c);
}

/**
 * Update activities from rows with a header. Rows match on the Activity ID
 * column; IDs that do not exist become new activities when `addNew` is set
 * (in the WBS given by a "WBS" column when it matches a WBS code path).
 */
export function importTable(s: Schedule, header: string[], rows: Cell[][], opts: { addNew?: boolean } = {}): ImportResult {
  const fields = fieldsFor(s);
  const c = fieldCtx(s);
  const cols = header.map((h) => findField(String(h ?? ""), fields));
  const unknownColumns = header.filter((h, i) => h && !cols[i]).map(String);
  const idCol = cols.findIndex((f) => f?.id === "code");
  if (idCol < 0) return { schedule: s, updated: 0, added: 0, changes: 0, skipped: ["No Activity ID column: the first row must hold column titles such as Activity ID, Activity Name, Original Duration."], unknownColumns };
  const wbsByPath = new Map(s.wbs.map((w) => [c.wbsPath(w.id).toLowerCase(), w.id]));
  const wbsCol = cols.findIndex((f) => f?.id === "wbs");
  const byCode = new Map(s.activities.map((a) => [a.code, a]));
  const patches = new Map<string, Activity>();
  const added: Activity[] = [];
  const skipped: string[] = [];
  let changes = 0;
  const used = new Set(byCode.keys());
  const hpd = c.hpd;
  for (const row of rows) {
    const code = String(row[idCol] ?? "").trim();
    if (!code) continue;
    let a = patches.get(code) ?? byCode.get(code);
    if (!a) {
      if (!opts.addNew) {
        skipped.push(code);
        continue;
      }
      const wbsId = wbsCol >= 0 ? wbsByPath.get(String(row[wbsCol] ?? "").trim().toLowerCase()) ?? null : s.wbs[0]?.id ?? null;
      a = {
        id: uid("act"),
        code,
        name: code,
        wbsId,
        type: "task",
        status: "not-started",
        percentComplete: 0,
        start: s.dataDate,
        finish: s.dataDate,
        baselineStart: null,
        baselineFinish: null,
        actualStart: null,
        actualFinish: null,
        totalFloatHours: null,
        originalDurationHours: 5 * hpd,
        remainingDurationHours: 5 * hpd,
        critical: false,
        calendarId: null,
        codes: {},
      };
      used.add(code);
      added.push(a);
    }
    let next = a;
    let rowChanges = 0;
    cols.forEach((f, i) => {
      if (!f || i === idCol || !f.set) return;
      const patch = applyValue(next, f, row[i], c);
      if (!patch) return;
      const before = JSON.stringify(f.get(next, c));
      const after = { ...next, ...patch };
      if (JSON.stringify(f.get(after, c)) === before) return;
      rowChanges++;
      next = after;
    });
    changes += rowChanges;
    if (rowChanges || !byCode.has(code)) patches.set(code, next);
  }
  const addedIds = new Set(added.map((a) => a.code));
  const activities = s.activities.map((a) => patches.get(a.code) ?? a).concat(added.map((a) => patches.get(a.code) ?? a));
  return {
    schedule: { ...s, activities },
    updated: [...patches.keys()].filter((k) => !addedIds.has(k)).length,
    added: added.length,
    changes,
    skipped,
    unknownColumns,
  };
}

/** Paste a block of cells (rows × columns) into the table starting at a row and column, as Excel does. */
export function pasteCells(s: Schedule, rowIds: string[], fieldIds: string[], block: Cell[][]): { schedule: Schedule; changes: number; readOnly: string[] } {
  const fields = new Map(fieldsFor(s).map((f) => [f.id, f]));
  const c = fieldCtx(s);
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const out = new Map<string, Activity>();
  const readOnly = new Set<string>();
  let changes = 0;
  block.forEach((line, i) => {
    const id = rowIds[i];
    if (!id) return;
    let a = out.get(id) ?? byId.get(id);
    if (!a) return;
    line.forEach((v, j) => {
      const f = fields.get(fieldIds[j]);
      if (!f) return;
      if (!f.set) {
        readOnly.add(f.label);
        return;
      }
      const patch = applyValue(a!, f, v, c);
      if (!patch) return;
      a = { ...a!, ...patch };
      changes++;
    });
    out.set(id, a);
  });
  return { schedule: changes ? { ...s, activities: s.activities.map((a) => out.get(a.id) ?? a) } : s, changes, readOnly: [...readOnly] };
}

/** Split text copied from Excel (tab-separated, quoted cells allowed) into rows of cells. */
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export const toTsv = (rows: string[][]) => rows.map((r) => r.map((c) => (/[\t\n"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join("\t")).join("\r\n");
