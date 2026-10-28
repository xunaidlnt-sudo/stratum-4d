// Primavera P6 XER reader.
//
// XER is a tab-delimited text export. Each table starts with "%T <name>", then
// one "%F" line of field names and any number of "%R" rows. "%E" ends the file.
// The format is documented by Oracle and widely used for P6 data exchange.

import { parseP6CalendarData, standardCalendar } from "./calendar";
import type {
  ActivityStep,
  UdfDef,
  Activity,
  ActivityStatus,
  ActivityType,
  Assignment,
  BudgetChange,
  Calendar,
  CodeType,
  ConstraintType,
  CostAccount,
  FundingAssignment,
  FundingSource,
  ObsNode,
  RegisterItem,
  Relationship,
  RelationshipType,
  Resource,
  ResourceCurve,
  ResourceType,
  Role,
  Schedule,
  Shift,
  SpendingPlanRow,
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

const PRIORITY_IN: Record<string, 1 | 2 | 3 | 4 | 5> = { PT_Top: 1, PT_High: 2, PT_Normal: 3, PT_Low: 4, PT_Lowest: 5 };
const RATE_TYPE_IN: Record<string, number> = { COST_PER_QTY: 1, COST_PER_QTY2: 2, COST_PER_QTY3: 3, COST_PER_QTY4: 4, COST_PER_QTY5: 5 };

/** Price/Unit 1-5 of a rate row, or undefined when only the first is set. */
function pricesOf(r: Record<string, string> | undefined): number[] | undefined {
  if (!r) return undefined;
  const p = ["cost_per_qty", "cost_per_qty2", "cost_per_qty3", "cost_per_qty4", "cost_per_qty5"].map((k) => Number(r[k]) || 0);
  return p.slice(1).some((x) => x) ? p : undefined;
}

/** Plain text from a P6 memo (HTML or RTF-ish). */
export function memoText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const SCOPE_IN: Record<string, CodeType["scope"]> = { AS_Global: "global", AS_EPS: "eps", AS_Project: "project" };
  const codeTypes: CodeType[] = (tables.ACTVTYPE ?? [])
    .filter((t) => !t.proj_id || t.proj_id === projId)
    .map((t) => ({
      name: t.actv_code_type,
      ...(SCOPE_IN[t.actv_code_type_scope] ? { scope: SCOPE_IN[t.actv_code_type_scope] } : {}),
      values: (tables.ACTVCODE ?? [])
        .filter((c) => c.actv_code_type_id === t.actv_code_type_id)
        .sort((a, b) => (num(a.seq_num) ?? 0) - (num(b.seq_num) ?? 0))
        .map((c) => {
          const col = num(c.color);
          return {
            value: c.short_name || c.actv_code_name,
            ...(c.actv_code_name && c.actv_code_name !== c.short_name ? { description: c.actv_code_name } : {}),
            ...(col ? { color: `#${col.toString(16).padStart(6, "0")}` } : {}),
          };
        }),
    }));
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
      ...(w.obs_id ? { obsId: w.obs_id } : {}),
      ...(num(w.orig_cost) ? { originalBudget: num(w.orig_cost)! } : {}),
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
        ...(PRIORITY_IN[t.priority_type] && PRIORITY_IN[t.priority_type] !== 3 ? { levelingPriority: PRIORITY_IN[t.priority_type] } : {}),
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
  const UDF_KIND: Record<string, UdfDef["type"]> = { FT_TEXT: "text", FT_INT: "number", FT_FLOAT_2_DECIMALS: "number", FT_MONEY: "cost", FT_START_DATE: "date", FT_END_DATE: "date", FT_STATICTYPE: "indicator" };
  const udfDefs: UdfDef[] = [];
  for (const u of tables.UDFTYPE ?? [])
    if (u.table_name === "TASK") {
      udfLabel.set(u.udf_type_id, u.udf_type_label || u.udf_type_name);
      udfDefs.push({ name: u.udf_type_label || u.udf_type_name, type: UDF_KIND[u.logical_data_type] ?? "text" });
    }
  const INDICATOR_IN: Record<string, string> = { UDF_R: "Red", UDF_Y: "Yellow", UDF_G: "Green", UDF_B: "Blue" };
  const udfs = new Map<string, Record<string, string>>();
  for (const v of tables.UDFVALUE ?? []) {
    const label = udfLabel.get(v.udf_type_id);
    if (!label) continue;
    const value = INDICATOR_IN[v.udf_text] ?? (v.udf_text || v.udf_number || (v.udf_date ? v.udf_date.slice(0, 10) : "") || v.udf_code_id || "");
    if (!value) continue;
    const rec = udfs.get(v.fk_id) ?? {};
    rec[label] = value;
    udfs.set(v.fk_id, rec);
  }
  // Steps (TASKPROC) and notebook topics (TASKMEMO / MEMOTYPE).
  const steps = new Map<string, (ActivityStep & { seq: number })[]>();
  for (const p of tables.TASKPROC ?? [])
    (steps.get(p.task_id) ?? steps.set(p.task_id, []).get(p.task_id)!).push({ id: p.proc_id, name: p.proc_name || "", weight: num(p.proc_wt) ?? 1, pct: num(p.complete_pct) ?? (p.complete_flag === "Y" ? 100 : 0), seq: num(p.seq_num) ?? 0 });
  const memoTopic = new Map((tables.MEMOTYPE ?? []).map((m) => [m.memo_type_id, m.memo_type || m.memo_type_id]));
  const notes = new Map<string, Record<string, string>>();
  for (const m of tables.TASKMEMO ?? []) {
    const topic = memoTopic.get(m.memo_type_id) ?? "Notes";
    const text = memoText(m.task_memo ?? "");
    if (text) (notes.get(m.task_id) ?? notes.set(m.task_id, {}).get(m.task_id)!)[topic] = text;
  }
  const taskRows = new Map((tables.TASK ?? []).map((t) => [t.task_id, t]));
  for (const a of activities) {
    const t = taskRows.get(a.id)!;
    const ct = CONSTRAINT_MAP[t.cstr_type];
    a.constraint = ct ? { type: ct, date: parseXerDate(t.cstr_date) } : null;
    const u = udfs.get(a.id);
    if (u) a.userFields = u;
    const st = steps.get(a.id);
    if (st) a.steps = st.sort((x, y) => x.seq - y.seq).map(({ seq: _seq, ...rest }) => rest);
    const nb = notes.get(a.id);
    if (nb) a.notebook = nb;
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
  // Resource codes (RCATTYPE / RCATVAL / RSRCRCAT) and project codes (PCATTYPE / PCATVAL / PROJPCAT).
  const catTypes = (typeTable: string, idKey: string, nameKey: string, valTable: string, valTypeKey: string, valIdKey: string, shortKey: string, longKey: string) => {
    const names = new Map((tables[typeTable] ?? []).map((t) => [t[idKey], t[nameKey] || t[idKey]]));
    const vals = new Map<string, { type: string; value: string; description: string }>();
    const types = new Map<string, CodeType>();
    for (const v of tables[valTable] ?? []) {
      const type = names.get(v[valTypeKey]);
      if (!type) continue;
      vals.set(v[valIdKey], { type, value: v[shortKey] || v[valIdKey], description: v[longKey] || "" });
      const t = types.get(type) ?? (types.set(type, { name: type, values: [] }).get(type)!);
      t.values.push({ value: v[shortKey] || v[valIdKey], description: v[longKey] || "" });
    }
    for (const n of names.values()) if (!types.has(n)) types.set(n, { name: n, values: [] });
    return { types: [...types.values()], vals };
  };
  const rcat = catTypes("RCATTYPE", "rsrc_catg_type_id", "rsrc_catg_type", "RCATVAL", "rsrc_catg_type_id", "rsrc_catg_id", "rsrc_catg_short_name", "rsrc_catg_name");
  const rsrcCodes = new Map<string, Record<string, string>>();
  for (const x of tables.RSRCRCAT ?? []) {
    const v = rcat.vals.get(x.rsrc_catg_id);
    if (v) (rsrcCodes.get(x.rsrc_id) ?? rsrcCodes.set(x.rsrc_id, {}).get(x.rsrc_id)!)[v.type] = v.value;
  }
  const pcat = catTypes("PCATTYPE", "proj_catg_type_id", "proj_catg_type", "PCATVAL", "proj_catg_type_id", "proj_catg_id", "proj_catg_short_name", "proj_catg_name");
  const projectCodes: Record<string, string> = {};
  for (const x of tables.PROJPCAT ?? []) {
    if (x.proj_id !== projId) continue;
    const v = pcat.vals.get(x.proj_catg_id);
    if (v) projectCodes[v.type] = v.value;
  }
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
    const pr = pricesOf(rows[0]);
    if (pr) res.prices = pr;
    if (dated.length > 1)
      res.rates = dated.map((x) => ({
        from: parseXerDate(x.start_date)!,
        pricePerUnit: num(x.cost_per_qty) ?? 0,
        ...(levels && num(x.max_qty_per_hr) ? { maxUnitsPerHour: num(x.max_qty_per_hr)! } : {}),
        ...(pricesOf(x) ? { prices: pricesOf(x)! } : {}),
      }));
    if (levels && num(dated[0]?.max_qty_per_hr)) res.maxUnitsPerHour = num(dated[0].max_qty_per_hr)!;
    if (r.shift_id) res.shiftId = r.shift_id;
    if (r.clndr_id && calendars.some((c) => c.id === r.clndr_id)) res.calendarId = r.clndr_id;
    const rc = rsrcCodes.get(r.rsrc_id);
    if (rc) res.codes = rc;
    const roleIds = [...new Set([...(roleLinks.get(r.rsrc_id) ?? []), ...(r.role_id ? [r.role_id] : [])])];
    if (roleIds.length) res.roleIds = roleIds;
    return res;
  });
  const roleRates = new Map<string, Record<string, string>[]>();
  for (const x of [...(tables.ROLERATE ?? [])].sort((a, b) => (parseXerDate(a.start_date) ?? 0) - (parseXerDate(b.start_date) ?? 0)))
    (roleRates.get(x.role_id) ?? roleRates.set(x.role_id, []).get(x.role_id)!).push(x);
  const roles: Role[] = (tables.ROLES ?? []).map((x) => {
    const rr = roleRates.get(x.role_id) ?? [];
    const role: Role = { id: x.role_id, code: x.role_short_name || x.role_id, name: x.role_name || x.role_short_name || x.role_id, pricePerUnit: num(rr[0]?.cost_per_qty) ?? 0 };
    const pr = pricesOf(rr[0]);
    if (pr) role.prices = pr;
    if (num(rr[0]?.max_qty_per_hr)) role.maxUnitsPerHour = num(rr[0].max_qty_per_hr)!;
    if (rr.length > 1) role.rates = rr.map((r) => ({ from: parseXerDate(r.start_date) ?? 0, pricePerUnit: num(r.cost_per_qty) ?? 0, ...(num(r.max_qty_per_hr) ? { maxUnitsPerHour: num(r.max_qty_per_hr)! } : {}), ...(pricesOf(r) ? { prices: pricesOf(r)! } : {}) }));
    if (x.role_descr && x.role_descr !== x.role_name) role.responsibilities = memoText(x.role_descr);
    return role;
  });
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
      const rt = RATE_TYPE_IN[x.rate_type];
      if (rt && rt > 1) asg.rateType = rt;
      if (x.cost_per_qty_source_type === "ST_Role") asg.rateSource = "role";
      else if (x.cost_per_qty_source_type === "ST_Custom") {
        asg.rateSource = "override";
        if (num(x.cost_per_qty) !== null) asg.priceOverride = num(x.cost_per_qty)!;
      }
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

  // Expenses (PROJCOST) with their categories (COSTTYPE) and cost accounts.
  const costTypes = new Map((tables.COSTTYPE ?? []).map((c) => [c.cost_type_id, c.cost_type || c.cost_type_id]));
  const acctCode = new Map((tables.ACCOUNT ?? []).map((a) => [a.acct_id, a.acct_short_name || a.acct_id]));
  const ACCRUAL: Record<string, string> = { CL_Uniform: "Uniform Over Activity", CL_Start: "Start of Activity", CL_End: "End of Activity" };
  const expenses: RegisterItem[] = (tables.PROJCOST ?? [])
    .filter((c) => (!c.proj_id || c.proj_id === projId) && actIds.has(c.task_id))
    .map((c) => ({
      id: c.cost_item_id,
      activityId: c.task_id,
      values: {
        "Expense Item": c.cost_name || "",
        Category: costTypes.get(c.cost_type_id) ?? "",
        Vendor: c.vendor_name || "",
        "Budgeted Cost": c.target_cost || "0",
        "Actual Cost": c.act_cost || "0",
        "Remaining Cost": c.remain_cost || "0",
        "Accrual Type": ACCRUAL[c.cost_load_type] ?? "",
        ...(c.acct_id && acctCode.has(c.acct_id) ? { "Cost Account": acctCode.get(c.acct_id)! } : {}),
      },
    }));

  // OBS, budget log, funding and spending plan.
  const wbsIdOf = (id: string | undefined) => (!id || id === rootWbs?.wbs_id ? null : id);
  const obs: ObsNode[] = (tables.OBS ?? []).map((o) => ({ id: o.obs_id, parentId: o.parent_obs_id || null, name: o.obs_name || o.obs_id, ...(o.obs_descr && o.obs_descr !== o.obs_name ? { description: o.obs_descr } : {}) }));
  const obsIds = new Set(obs.map((o) => o.id));
  for (const o of obs) if (o.parentId && !obsIds.has(o.parentId)) o.parentId = null;
  const CHANGE_STATUS: Record<string, BudgetChange["status"]> = { CS_Appr: "approved", CS_Pend: "pending", CS_Rejected: "not-approved", CS_NotAppr: "not-approved" };
  const budgetChanges: BudgetChange[] = (tables.BUDGCHNG ?? [])
    .filter((c) => !c.proj_id || c.proj_id === projId)
    .map((c) => ({ id: c.budg_chng_id, wbsId: wbsIdOf(c.wbs_id), date: parseXerDate(c.chng_date) ?? 0, amount: num(c.cost) ?? 0, reason: c.chng_short_name || c.chng_descr || "", responsible: c.chng_by_name || "", status: CHANGE_STATUS[c.status_code] ?? "pending" }));
  const fundingSources: FundingSource[] = (tables.FUNDSRC ?? []).map((f) => ({ id: f.fund_id, parentId: f.parent_fund_id || null, name: f.fund_name || f.fund_id, ...(f.fund_descr ? { description: f.fund_descr } : {}) }));
  const funding: FundingAssignment[] = (tables.PROJFUND ?? [])
    .filter((f) => !f.proj_id || f.proj_id === projId)
    .map((f) => ({ id: f.proj_fund_id, wbsId: null, sourceId: f.fund_id, amount: num(f.fund_cost) ?? 0 }));
  const spendingPlan: SpendingPlanRow[] = (tables.WBSBUDG ?? [])
    .filter((b) => (!b.proj_id || b.proj_id === projId) && parseXerDate(b.start_date) !== null)
    .map((b) => ({ wbsId: wbsIdOf(b.wbs_id), month: new Date(parseXerDate(b.start_date)!).toISOString().slice(0, 7), spending: num(b.spend_cost) ?? 0, ...(num(b.benefit_cost) ? { benefit: num(b.benefit_cost)! } : {}) }));

  return {
    projectId: projId,
    projectCode: project.proj_short_name ?? projId,
    projectName: projectName(tables, projId) ?? project.proj_short_name ?? projId,
    ...(num(project.priority_num) ? { strategicPriority: num(project.priority_num)! } : {}),
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
    ...(obs.length ? { obs } : {}),
    ...(costTypes.size ? { expenseCategories: [...new Set(costTypes.values())] } : {}),
    ...(expenses.length ? { registers: { expenses } } : {}),
    ...(rcat.types.length ? { resourceCodeTypes: rcat.types } : {}),
    ...(codeTypes.length ? { codeTypes } : {}),
    ...(udfDefs.length ? { udfDefs } : {}),
    ...(project.plan_start_date && parseXerDate(project.plan_start_date) ? { plannedStart: parseXerDate(project.plan_start_date) } : {}),
    ...(project.anticip_start_date && parseXerDate(project.anticip_start_date) ? { anticipatedStart: parseXerDate(project.anticip_start_date) } : {}),
    ...(project.anticip_end_date && parseXerDate(project.anticip_end_date) ? { anticipatedFinish: parseXerDate(project.anticip_end_date) } : {}),
    ...(pcat.types.length ? { projectCodeTypes: pcat.types } : {}),
    ...(Object.keys(projectCodes).length ? { projectCodes } : {}),
    ...(rootWbs?.obs_id ? { obsId: rootWbs.obs_id } : {}),
    ...(num(rootWbs?.orig_cost) ? { originalBudget: num(rootWbs?.orig_cost)! } : {}),
    ...(budgetChanges.length ? { budgetChanges } : {}),
    ...(fundingSources.length ? { fundingSources } : {}),
    ...(funding.length ? { funding } : {}),
    ...(spendingPlan.length ? { spendingPlan } : {}),
    sourceXer: tables,
    sourceFormat: "xer",
  };
}

export function parseXer(text: string, options?: XerImportOptions): Schedule {
  return xerToSchedule(parseXerTables(text), options);
}
