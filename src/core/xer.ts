// Primavera P6 XER reader.
//
// XER is a tab-delimited text export. Each table starts with "%T <name>", then
// one "%F" line of field names and any number of "%R" rows. "%E" ends the file.
// The format is documented by Oracle and widely used for P6 data exchange.

import { parseP6CalendarData, standardCalendar } from "./calendar";
import type {
  Activity,
  ActivityStatus,
  ActivityType,
  Assignment,
  Calendar,
  ConstraintType,
  CostAccount,
  Relationship,
  RelationshipType,
  Resource,
  ResourceCurve,
  ResourceType,
  Role,
  Schedule,
  Shift,
  WbsNode,
} from "./types";

export type XerTables = Record<string, Record<string, string>[]>;

export function parseXerTables(text: string): XerTables {
  const tables: XerTables = {};
  let current: string | null = null;
  let fields: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine) continue;
    const parts = rawLine.split("\t");
    const tag = parts[0];
    if (tag === "%T") {
      current = (parts[1] ?? "").trim();
      fields = [];
      tables[current] ??= [];
    } else if (tag === "%F") {
      fields = parts.slice(1).map((f) => f.trim());
    } else if (tag === "%R" && current) {
      const row: Record<string, string> = {};
      for (let i = 0; i < fields.length; i++) row[fields[i]] = parts[i + 1] ?? "";
      tables[current].push(row);
    } else if (tag === "%E") {
      break;
    }
  }
  return tables;
}

/** Windows-1252 code points 0x80-0x9F (the rest of the range matches Latin-1). */
export const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030,
  0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function looksUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    // Pure ASCII is valid UTF-8 too; only call it UTF-8 if it has multi-byte sequences.
    return bytes.some((b) => b >= 0x80);
  } catch {
    return false;
  }
}

/**
 * Decode XER bytes. P6 normally writes Windows-1252; newer versions can write
 * UTF-8. Decoded by hand so the result is the same in every runtime.
 */
export function decodeXer(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (looksUtf8(bytes)) return new TextDecoder("utf-8").decode(bytes);
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const part = bytes.subarray(i, i + CHUNK);
    const codes = new Array<number>(part.length);
    for (let k = 0; k < part.length; k++) codes[k] = CP1252_HIGH[part[k]] ?? part[k];
    out += String.fromCharCode(...codes);
  }
  return out;
}

/** P6 dates look like "2024-03-18 08:00". They have no zone; we read them as UTC wall time. */
export function parseXerDate(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value.trim());
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

function num(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const TYPE_MAP: Record<string, ActivityType> = {
  TT_Task: "task",
  TT_Mile: "milestone",
  TT_FinMile: "finish-milestone",
  TT_LOE: "loe",
  TT_WBS: "wbs-summary",
  TT_Rsrc: "resource-dependent",
};

const STATUS_MAP: Record<string, ActivityStatus> = {
  TK_NotStart: "not-started",
  TK_Active: "in-progress",
  TK_Complete: "complete",
};

const REL_MAP: Record<string, RelationshipType> = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };

export const CONSTRAINT_MAP: Record<string, ConstraintType> = {
  CS_MSOA: "start-on-or-after",
  CS_MSOB: "start-on-or-before",
  CS_MEOA: "finish-on-or-after",
  CS_MEOB: "finish-on-or-before",
  CS_MSO: "start-on",
  CS_MEO: "finish-on",
  CS_MANDSTART: "mandatory-start",
  CS_MANDFIN: "mandatory-finish",
  CS_ALAP: "as-late-as-possible",
};

const RSRC_TYPE: Record<string, ResourceType> = { RT_Labor: "labor", RT_Equip: "equipment", RT_Mat: "material" };

export interface XerImportOptions {
  /** Pick a project when the XER holds several. Defaults to the first one. */
  projectId?: string;
}

export function listXerProjects(tables: XerTables): { id: string; code: string; name: string }[] {
  return (tables.PROJECT ?? []).map((p) => ({
    id: p.proj_id,
    code: p.proj_short_name ?? p.proj_id,
    name: projectName(tables, p.proj_id) ?? p.proj_short_name ?? p.proj_id,
  }));
}

function projectName(tables: XerTables, projId: string): string | null {
  const root = (tables.PROJWBS ?? []).find((w) => w.proj_id === projId && w.proj_node_flag === "Y");
  return root?.wbs_name ?? null;
}

export function xerToSchedule(tables: XerTables, options: XerImportOptions = {}): Schedule {
  const projects = tables.PROJECT ?? [];
  if (projects.length === 0) throw new Error("No PROJECT table found. Is this a P6 XER export?");
  const project = options.projectId ? projects.find((p) => p.proj_id === options.projectId) : projects[0];
  if (!project) throw new Error(`Project ${options.projectId} not found in XER`);
  const projId = project.proj_id;

  // Activity codes: type id -> type name, code id -> value
  const codeTypeName = new Map<string, string>();
  for (const t of tables.ACTVTYPE ?? []) codeTypeName.set(t.actv_code_type_id, t.actv_code_type);
  const codeValue = new Map<string, { type: string; value: string }>();
  for (const c of tables.ACTVCODE ?? []) {
    codeValue.set(c.actv_code_id, { type: c.actv_code_type_id, value: c.short_name || c.actv_code_name });
  }
  const taskCodes = new Map<string, Record<string, string>>();
  for (const a of tables.TASKACTV ?? []) {
    if (a.proj_id && a.proj_id !== projId) continue;
    const cv = codeValue.get(a.actv_code_id);
    if (!cv) continue;
    const typeName = codeTypeName.get(a.actv_code_type_id ?? cv.type) ?? cv.type;
    const rec = taskCodes.get(a.task_id) ?? {};
    rec[typeName] = cv.value;
    taskCodes.set(a.task_id, rec);
  }

  const wbsRows = (tables.PROJWBS ?? []).filter((w) => w.proj_id === projId);
  const rootWbs = wbsRows.find((w) => w.proj_node_flag === "Y");
  const wbs: WbsNode[] = wbsRows
    .filter((w) => w.proj_node_flag !== "Y")
    .map((w) => ({
      id: w.wbs_id,
      parentId: w.parent_wbs_id && w.parent_wbs_id !== rootWbs?.wbs_id ? w.parent_wbs_id : null,
      code: w.wbs_short_name ?? "",
      name: w.wbs_name ?? "",
      seq: num(w.seq_num) ?? 0,
    }));

  const activities: Activity[] = (tables.TASK ?? [])
    .filter((t) => t.proj_id === projId)
    .map((t) => {
      const status = STATUS_MAP[t.status_code] ?? "not-started";
      const actualStart = parseXerDate(t.act_start_date);
      const actualFinish = parseXerDate(t.act_end_date);
      // For in-progress work P6 holds remaining dates in restart_date / reend_date.
      const start = actualStart ?? parseXerDate(t.early_start_date) ?? parseXerDate(t.restart_date) ?? parseXerDate(t.target_start_date);
      const finish =
        actualFinish ?? parseXerDate(t.early_end_date) ?? parseXerDate(t.reend_date) ?? parseXerDate(t.target_end_date);
      const totalFloatHours = num(t.total_float_hr_cnt);
      return {
        id: t.task_id,
        code: t.task_code ?? t.task_id,
        name: t.task_name ?? "",
        wbsId: t.wbs_id && t.wbs_id !== rootWbs?.wbs_id ? t.wbs_id : null,
        type: TYPE_MAP[t.task_type] ?? "task",
        status,
        percentComplete: status === "complete" ? 100 : Math.max(0, Math.min(100, num(t.phys_complete_pct) ?? 0)),
        start,
        finish,
        baselineStart: parseXerDate(t.target_start_date),
        baselineFinish: parseXerDate(t.target_end_date),
        actualStart,
        actualFinish,
        totalFloatHours,
        originalDurationHours: num(t.target_drtn_hr_cnt),
        remainingDurationHours: num(t.remain_drtn_hr_cnt),
        critical: t.driving_path_flag === "Y" || (totalFloatHours !== null && totalFloatHours <= 0 && status !== "complete"),
        calendarId: t.clndr_id || null,
        codes: taskCodes.get(t.task_id) ?? {},
      };
    });

  // P6 user-defined fields on activities.
  const udfLabel = new Map<string, string>();
  for (const u of tables.UDFTYPE ?? []) if (u.table_name === "TASK") udfLabel.set(u.udf_type_id, u.udf_type_label || u.udf_type_name);
  const udfs = new Map<string, Record<string, string>>();
  for (const v of tables.UDFVALUE ?? []) {
    const label = udfLabel.get(v.udf_type_id);
    if (!label) continue;
    const value = v.udf_text || v.udf_number || (v.udf_date ? v.udf_date.slice(0, 10) : "") || v.udf_code_id || "";
    if (!value) continue;
    const rec = udfs.get(v.fk_id) ?? {};
    rec[label] = value;
    udfs.set(v.fk_id, rec);
  }
  const taskRows = new Map((tables.TASK ?? []).map((t) => [t.task_id, t]));
  for (const a of activities) {
    const t = taskRows.get(a.id)!;
    const ct = CONSTRAINT_MAP[t.cstr_type];
    a.constraint = ct ? { type: ct, date: parseXerDate(t.cstr_date) } : null;
    const u = udfs.get(a.id);
    if (u) a.userFields = u;
  }

  // Calendars: global ones plus this project's.
  const calendars: Calendar[] = (tables.CALENDAR ?? [])
    .filter((c) => !c.proj_id || c.proj_id === projId || c.clndr_type !== "CA_Project")
    .map((c) => {
      try {
        return parseP6CalendarData(c.clndr_id, c.clndr_name || c.clndr_id, c.clndr_data ?? "", num(c.day_hr_cnt) ?? 8);
      } catch {
        return standardCalendar(c.clndr_id, c.clndr_name || c.clndr_id);
      }
    });
  const defaultCal =
    (tables.CALENDAR ?? []).find((c) => c.clndr_id === project.clndr_id)?.clndr_id ??
    (tables.CALENDAR ?? []).find((c) => c.default_flag === "Y")?.clndr_id ??
    calendars[0]?.id ??
    null;

  // Resources and their assignments, with rates over time, roles, shifts, curves and cost accounts.
  const rateRows = [...(tables.RSRCRATE ?? [])].sort((a, b) => (parseXerDate(a.start_date) ?? 0) - (parseXerDate(b.start_date) ?? 0));
  const ratesOf = new Map<string, Record<string, string>[]>();
  for (const r of rateRows) (ratesOf.get(r.rsrc_id) ?? ratesOf.set(r.rsrc_id, []).get(r.rsrc_id)!).push(r);
  const unitName = new Map((tables.UMEASURE ?? []).map((u) => [u.unit_id, u.unit_abbrev || u.unit_name]));
  const roleLinks = new Map<string, string[]>();
  for (const x of tables.RSRCROLE ?? []) (roleLinks.get(x.rsrc_id) ?? roleLinks.set(x.rsrc_id, []).get(x.rsrc_id)!).push(x.role_id);
  const resources: Resource[] = (tables.RSRC ?? []).map((r) => {
    const rows = ratesOf.get(r.rsrc_id) ?? [];
    const levels = r.level_flag === "Y";
    const dated = rows.filter((x) => !x.shift_period_id && parseXerDate(x.start_date) !== null);
    const res: Resource = {
      id: r.rsrc_id,
      code: r.rsrc_short_name || r.rsrc_id,
      name: r.rsrc_name || r.rsrc_short_name || r.rsrc_id,
      type: RSRC_TYPE[r.rsrc_type] ?? "labor",
      unit: unitName.get(r.unit_id) || (RSRC_TYPE[r.rsrc_type] === "material" ? "unit" : "h"),
      pricePerUnit: num(rows[0]?.cost_per_qty) ?? 0,
    };
    if (dated.length > 1)
      res.rates = dated.map((x) => ({ from: parseXerDate(x.start_date)!, pricePerUnit: num(x.cost_per_qty) ?? 0, ...(levels && num(x.max_qty_per_hr) ? { maxUnitsPerHour: num(x.max_qty_per_hr)! } : {}) }));
    if (levels && num(dated[0]?.max_qty_per_hr)) res.maxUnitsPerHour = num(dated[0].max_qty_per_hr)!;
    if (r.shift_id) res.shiftId = r.shift_id;
    const roleIds = [...new Set([...(roleLinks.get(r.rsrc_id) ?? []), ...(r.role_id ? [r.role_id] : [])])];
    if (roleIds.length) res.roleIds = roleIds;
    return res;
  });
  const rolePrice = new Map<string, number>();
  for (const x of tables.ROLERATE ?? []) if (!rolePrice.has(x.role_id)) rolePrice.set(x.role_id, num(x.cost_per_qty) ?? 0);
  const roles: Role[] = (tables.ROLES ?? []).map((x) => ({ id: x.role_id, code: x.role_short_name || x.role_id, name: x.role_name || x.role_short_name || x.role_id, pricePerUnit: rolePrice.get(x.role_id) ?? 0 }));
  const shifts: Shift[] = (tables.SHIFT ?? []).map((x) => ({
    id: x.shift_id,
    name: x.shift_name || x.shift_id,
    periods: (tables.SHIFTPER ?? [])
      .filter((p) => p.shift_id === x.shift_id)
      .map((p) => {
        const rate = rateRows.find((r) => r.shift_period_id === p.shift_period_id);
        return { start: num(p.shift_start_hr_num) ?? 0, maxUnits: num(rate?.max_qty_per_hr) ?? 1 };
      })
      .sort((a, b) => a.start - b.start),
  }));
  const curves: ResourceCurve[] = (tables.RSRCCURVDATA ?? []).map((x) => ({
    id: x.curv_id,
    name: x.curv_name || x.curv_id,
    values: Array.from({ length: 21 }, (_, i) => num(x[`pct_usage_${i}`]) ?? 0),
  }));
  const costAccounts: CostAccount[] = (tables.ACCOUNT ?? []).map((x) => ({ id: x.acct_id, parentId: x.parent_acct_id || null, code: x.acct_short_name || x.acct_id, name: x.acct_name || x.acct_short_name || x.acct_id }));
  const acctIds = new Set(costAccounts.map((a) => a.id));
  for (const a of costAccounts) if (a.parentId && !acctIds.has(a.parentId)) a.parentId = null;
  const roleIdSet = new Set(roles.map((r) => r.id));
  const curveIds = new Set(curves.map((c) => c.id));
  const actIds = new Set(activities.map((a) => a.id));
  const assignments: Assignment[] = (tables.TASKRSRC ?? [])
    .filter((x) => actIds.has(x.task_id))
    .map((x) => {
      const asg: Assignment = {
        id: x.taskrsrc_id,
        activityId: x.task_id,
        resourceId: x.rsrc_id ?? "",
        budgetQty: num(x.target_qty) ?? 0,
        actualQty: (num(x.act_reg_qty) ?? 0) + (num(x.act_ot_qty) ?? 0),
        remainingQty: num(x.remain_qty) ?? 0,
        budgetCost: num(x.target_cost) ?? 0,
        actualCost: (num(x.act_reg_cost) ?? 0) + (num(x.act_ot_cost) ?? 0),
        remainingCost: num(x.remain_cost) ?? 0,
      };
      if (x.role_id && roleIdSet.has(x.role_id)) asg.roleId = x.role_id;
      if (x.curv_id && curveIds.has(x.curv_id)) asg.curveId = x.curv_id;
      if (x.acct_id && acctIds.has(x.acct_id)) asg.costAccountId = x.acct_id;
      return asg;
    })
    .filter((x) => x.resourceId || x.roleId);

  const ids = new Set(activities.map((a) => a.id));
  const relationships: Relationship[] = (tables.TASKPRED ?? [])
    .filter((r) => ids.has(r.task_id) && ids.has(r.pred_task_id))
    .map((r) => ({
      id: r.task_pred_id,
      predecessorId: r.pred_task_id,
      successorId: r.task_id,
      type: REL_MAP[r.pred_type] ?? "FS",
      lagHours: num(r.lag_hr_cnt) ?? 0,
    }));

  return {
    projectId: projId,
    projectCode: project.proj_short_name ?? projId,
    projectName: projectName(tables, projId) ?? project.proj_short_name ?? projId,
    dataDate: parseXerDate(project.last_recalc_date) ?? parseXerDate(project.next_data_date),
    activities,
    wbs,
    relationships,
    calendars,
    defaultCalendarId: defaultCal,
    resources,
    assignments,
    ...(roles.length ? { roles } : {}),
    ...(shifts.length ? { shifts } : {}),
    ...(curves.length ? { curves } : {}),
    ...(costAccounts.length ? { costAccounts } : {}),
    sourceXer: tables,
    sourceFormat: "xer",
  };
}

export function parseXer(text: string, options?: XerImportOptions): Schedule {
  return xerToSchedule(parseXerTables(text), options);
}
