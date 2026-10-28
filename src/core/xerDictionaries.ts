// Write Stratum's dictionaries and project data back into XER tables, so P6
// receives everything created or changed in Stratum: resources and their
// rates, assignments, roles, cost accounts, curves, shifts, OBS, activity /
// project / resource codes, UDFs, steps, notebooks, expenses, budgets and
// funding. Rows that came from the original XER keep their other fields and
// ids; new rows get fresh numeric ids, as P6 expects.

import { formatXerDate } from "./xerExport";
import type { XerTables } from "./xer";
import type { Activity, Schedule } from "./types";
import { fieldCtx, fieldsFor } from "./fields";

type Row = Record<string, string>;

const n = (v: number | null | undefined, dp = 6) => (v === null || v === undefined || !Number.isFinite(v) ? "" : String(Math.round(v * 10 ** dp) / 10 ** dp));
const isNum = (s: string) => /^\d+$/.test(s);

/** Numeric ids for a table: Stratum ids that are already numeric (from P6) are kept. */
function idGen(t: XerTables, table: string, key: string) {
  let max = 0;
  for (const r of t[table] ?? []) {
    const v = Number(r[key]);
    if (Number.isFinite(v)) max = Math.max(max, v);
  }
  const map = new Map<string, string>();
  const taken = new Set((t[table] ?? []).map((r) => r[key]));
  return (stratumId: string, mayReuse = true): string => {
    const hit = map.get(stratumId);
    if (hit) return hit;
    const id = mayReuse && isNum(stratumId) ? stratumId : String(++max);
    if (!mayReuse || !isNum(stratumId)) taken.add(id);
    map.set(stratumId, id);
    return id;
  };
}

/**
 * Merge a written row onto the row it replaces. `defaults` only fill new rows,
 * so P6's own values (sequence numbers, code lengths, parents…) survive, and a
 * number Stratum didn't change keeps P6's original text and precision.
 */
function mergeRow(old: Row | undefined, r: Row, defaults: Row = {}): Row {
  if (!old) return { ...defaults, ...r };
  const out = { ...old };
  for (const [k, v] of Object.entries(r)) {
    const o = old[k];
    if (o !== undefined && o !== "" && v !== "" && Number.isFinite(Number(o)) && Number.isFinite(Number(v)) && Math.abs(Number(o) - Number(v)) <= 1e-6 * Math.max(1, Math.abs(Number(o)))) continue;
    // A blank and a zero price are the same to P6; keep whichever P6 wrote.
    if (o !== undefined && /^cost_per_qty\d?$/.test(k) && Number(o || 0) === Number(v || 0)) continue;
    out[k] = v;
  }
  return out;
}

/** Replace rows matching `mine` with `rows`, merging onto the old row of the same key. */
function replaceRows(t: XerTables, table: string, key: string, rows: Row[], mine: (r: Row) => boolean, defaults?: Row) {
  const list = t[table] ?? [];
  const old = new Map(list.filter(mine).map((r) => [r[key], r]));
  const fresh = new Map(rows.map((r) => [r[key], r]));
  // Keep the original order: changed rows stay where they were, new rows go at the end.
  const out: Row[] = [];
  for (const r of list) {
    if (!mine(r)) out.push(r);
    else if (fresh.has(r[key])) {
      out.push(mergeRow(r, fresh.get(r[key])!, defaults));
      fresh.delete(r[key]);
    }
  }
  for (const r of fresh.values()) out.push(mergeRow(old.get(r[key]), r, defaults));
  t[table] = out;
}

/** Insert or update rows by key, leaving every other row alone. */
function upsertRows(t: XerTables, table: string, key: string, rows: Row[], defaults?: Row) {
  const list = t[table] ?? (t[table] = []);
  const at = new Map(list.map((r, i) => [r[key], i]));
  for (const r of rows) {
    const i = at.get(r[key]);
    if (i === undefined) {
      list.push(mergeRow(undefined, r, defaults));
      at.set(r[key], list.length - 1);
    } else list[i] = mergeRow(list[i], r, defaults);
  }
}

/** Ids and start dates of a parent's existing rate rows, so rewritten rates keep them. */
function oldRates(t: XerTables, table: string, parentKey: string, parentId: string) {
  return (t[table] ?? []).filter((r) => r[parentKey] === parentId && !r.shift_period_id).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
}

const RSRC_TYPE_OUT: Record<string, string> = { labor: "RT_Labor", equipment: "RT_Equip", material: "RT_Mat" };
const UDF_TYPE_OUT: Record<string, string> = { text: "FT_TEXT", number: "FT_FLOAT_2_DECIMALS", date: "FT_START_DATE", cost: "FT_MONEY", indicator: "FT_STATICTYPE" };
const INDICATOR_OUT: Record<string, string> = { Red: "UDF_R", Yellow: "UDF_Y", Green: "UDF_G", Blue: "UDF_B" };
const ACCRUAL_OUT: Record<string, string> = { "Uniform Over Activity": "CL_Uniform", "Start of Activity": "CL_Start", "End of Activity": "CL_End" };
const STATUS_OUT: Record<string, string> = { planned: "WS_Planned", active: "WS_Open", inactive: "WS_Closed", "what-if": "WS_Whatif" };
const EARLY = "2000-01-01 00:00";

type RateLike = { from: number | null; pricePerUnit: number; maxUnitsPerHour?: number; prices?: number[] };
/**
 * Rate rows for a resource or role: the base price, then dated changes. P6's
 * first row's id and start date are kept; dated rates on or before it are the
 * same row (the importer lists every dated row), so they are not written twice.
 */
function rateRows(base: RateLike, rates: RateLike[] | undefined, old: Row[], idKey: string, newId: (k: number) => string, maxDefault: number | null): Row[] {
  const baseStart = old[0]?.start_date || EARLY;
  const later = (rates ?? []).filter((x) => x.from !== null && formatXerDate(x.from) > baseStart);
  const first = (rates ?? []).find((x) => x.from !== null && formatXerDate(x.from) <= baseStart);
  return [first ? { ...first, from: null } : base, ...later].map((x, k) => ({
    [idKey]: old[k]?.[idKey] ?? newId(k),
    ...priceCols(x.pricePerUnit, x.prices),
    max_qty_per_hr: n(x.maxUnitsPerHour ?? maxDefault),
    start_date: x.from ? formatXerDate(x.from) : baseStart,
  }));
}

/** cost_per_qty .. cost_per_qty5 from a base price and the optional five-price list. */
const priceCols = (base: number, prices?: number[]): Row => ({
  cost_per_qty: n(base, 4),
  cost_per_qty2: n(prices?.[1] ?? 0, 4),
  cost_per_qty3: n(prices?.[2] ?? 0, 4),
  cost_per_qty4: n(prices?.[3] ?? 0, 4),
  cost_per_qty5: n(prices?.[4] ?? 0, 4),
});
const money = (v: string | undefined) => {
  const x = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(x) ? x : 0;
};

export function writeDictionaries(t: XerTables, s: Schedule, taskId: Map<string, string>) {
  const projId = s.projectId;
  const proj = (r: Row) => r.proj_id === projId;
  const root = (t.PROJWBS ?? []).find((w) => w.proj_id === projId && w.proj_node_flag === "Y");
  const wbsOut = (id: string | null) => (id ? id : root?.wbs_id ?? "");

  // ---- project row and root WBS
  for (const p of t.PROJECT ?? []) {
    if (p.proj_id !== projId) continue;
    Object.assign(p, {
      proj_short_name: s.projectCode,
      ...(s.strategicPriority ? { priority_num: String(s.strategicPriority) } : {}),
      ...(s.plannedStart ? { plan_start_date: formatXerDate(s.plannedStart) } : {}),
      ...(s.mustFinishBy ? { plan_end_date: formatXerDate(s.mustFinishBy) } : {}),
      ...(s.anticipatedStart ? { anticip_start_date: formatXerDate(s.anticipatedStart) } : {}),
      ...(s.anticipatedFinish ? { anticip_end_date: formatXerDate(s.anticipatedFinish) } : {}),
    });
  }
  if (root) {
    root.wbs_name = s.projectName;
    if (s.projectStatus) root.status_code = STATUS_OUT[s.projectStatus];
  }

  // ---- OBS
  const obsId = idGen(t, "OBS", "obs_id");
  if (s.obs?.length)
    upsertRows(
      t,
      "OBS",
      "obs_id",
      s.obs.map((o) => ({ obs_id: obsId(o.id), ...(o.parentId ? { parent_obs_id: obsId(o.parentId) } : {}), obs_name: o.name, ...(o.description !== undefined ? { obs_descr: o.description } : {}) })),
      { parent_obs_id: "", obs_descr: "", seq_num: "0" },
    );
  if (root && s.obsId) root.obs_id = obsId(s.obsId);
  // WBS fields Stratum adds.
  const wbsRows = new Map((t.PROJWBS ?? []).filter(proj).map((r) => [r.wbs_id, r]));
  for (const w of s.wbs) {
    const r = wbsRows.get(w.id);
    if (!r) continue;
    if (w.obsId) r.obs_id = obsId(w.obsId);
    if (w.originalBudget !== undefined) r.orig_cost = n(w.originalBudget);
    if (w.status) r.status_code = STATUS_OUT[w.status];
    if (w.anticipatedStart) r.anticip_start_date = formatXerDate(w.anticipatedStart);
    if (w.anticipatedFinish) r.anticip_end_date = formatXerDate(w.anticipatedFinish);
  }
  if (root && s.originalBudget !== undefined) root.orig_cost = n(s.originalBudget);

  // ---- calendars referenced by resources must exist; roles, shifts, curves, accounts
  const roleId = idGen(t, "ROLES", "role_id");
  if (s.roles?.length) {
    upsertRows(
      t,
      "ROLES",
      "role_id",
      s.roles.map((r) => ({ role_id: roleId(r.id), role_short_name: r.code, role_name: r.name, ...(r.responsibilities !== undefined ? { role_descr: r.responsibilities } : {}) })),
      { role_descr: "", seq_num: "0", parent_role_id: "" },
    );
    const rrId = idGen(t, "ROLERATE", "role_rate_id");
    const ours = new Set(s.roles.map((r) => roleId(r.id)));
    replaceRows(
      t,
      "ROLERATE",
      "role_rate_id",
      s.roles.flatMap((r) =>
        rateRows({ from: null, ...r }, r.rates, oldRates(t, "ROLERATE", "role_id", roleId(r.id)), "role_rate_id", (k) => rrId(`${r.id}#${k}`, false), null).map((x) => ({ ...x, role_id: roleId(r.id) })),
      ),
      (r) => ours.has(r.role_id),
    );
  }
  const shiftId = idGen(t, "SHIFT", "shift_id");
  if (s.shifts?.length) {
    upsertRows(t, "SHIFT", "shift_id", s.shifts.map((x) => ({ shift_id: shiftId(x.id), shift_name: x.name })));
    const spId = idGen(t, "SHIFTPER", "shift_period_id");
    const ours = new Set(s.shifts.map((x) => shiftId(x.id)));
    replaceRows(
      t,
      "SHIFTPER",
      "shift_period_id",
      s.shifts.flatMap((x) => x.periods.map((p, k) => ({ shift_period_id: spId(`${x.id}#${k}`, false), shift_id: shiftId(x.id), shift_start_hr_num: String(p.start) }))),
      (r) => ours.has(r.shift_id),
    );
  }
  const curvId = idGen(t, "RSRCCURVDATA", "curv_id");
  if (s.curves?.length)
    upsertRows(
      t,
      "RSRCCURVDATA",
      "curv_id",
      s.curves.map((c) => ({ curv_id: curvId(c.id), curv_name: c.name, default_flag: "N", ...Object.fromEntries(c.values.map((v, i) => [`pct_usage_${i}`, n(v)])) })),
    );
  const acctId = idGen(t, "ACCOUNT", "acct_id");
  if (s.costAccounts?.length)
    upsertRows(
      t,
      "ACCOUNT",
      "acct_id",
      s.costAccounts.map((a) => ({ acct_id: acctId(a.id), ...(a.parentId ? { parent_acct_id: acctId(a.parentId) } : {}), acct_short_name: a.code, acct_name: a.name })),
      { parent_acct_id: "", acct_seq_num: "0" },
    );

  // ---- resource codes
  const rcatTypeId = idGen(t, "RCATTYPE", "rsrc_catg_type_id");
  const rcatValId = idGen(t, "RCATVAL", "rsrc_catg_id");
  const rTypeByName = new Map((t.RCATTYPE ?? []).map((r) => [r.rsrc_catg_type, r.rsrc_catg_type_id]));
  const rValByKey = new Map((t.RCATVAL ?? []).map((r) => [`${r.rsrc_catg_type_id}|${r.rsrc_catg_short_name}`, r.rsrc_catg_id]));
  for (const ct of s.resourceCodeTypes ?? []) {
    const tid = rTypeByName.get(ct.name) ?? rcatTypeId(`rct:${ct.name}`, false);
    rTypeByName.set(ct.name, tid);
    upsertRows(t, "RCATTYPE", "rsrc_catg_type_id", [{ rsrc_catg_type_id: tid, rsrc_catg_type: ct.name }], { rsrc_catg_short_len: "20" });
    upsertRows(
      t,
      "RCATVAL",
      "rsrc_catg_id",
      ct.values.map((v) => {
        const id = rValByKey.get(`${tid}|${v.value}`) ?? rcatValId(`rcv:${ct.name}|${v.value}`, false);
        rValByKey.set(`${tid}|${v.value}`, id);
        return { rsrc_catg_id: id, rsrc_catg_type_id: tid, rsrc_catg_short_name: v.value, rsrc_catg_name: v.description || v.value };
      }),
      { seq_num: "0", parent_rsrc_catg_id: "" },
    );
  }

  // ---- resources, rates, roles of resources, resource codes
  const rsrcId = idGen(t, "RSRC", "rsrc_id");
  const oldRsrc = new Map((t.RSRC ?? []).map((r) => [r.rsrc_id, r]));
  const calIds = new Set((t.CALENDAR ?? []).map((c) => c.clndr_id));
  if (s.resources?.length) {
    upsertRows(
      t,
      "RSRC",
      "rsrc_id",
      s.resources.map((r) => ({
        rsrc_id: rsrcId(r.id),
        rsrc_short_name: r.code,
        rsrc_name: r.name,
        rsrc_type: RSRC_TYPE_OUT[r.type] ?? "RT_Labor",
        ...(r.calendarId && calIds.has(r.calendarId) ? { clndr_id: r.calendarId } : {}),
        ...(r.shiftId ? { shift_id: shiftId(r.shiftId) } : {}),
        ...(r.roleIds?.length && !r.roleIds.some((x) => roleId(x) === oldRsrc.get(rsrcId(r.id))?.role_id) ? { role_id: roleId(r.roleIds[0]) } : {}),
        ...(r.maxUnitsPerHour || r.rates?.some((x) => x.maxUnitsPerHour) ? { level_flag: "Y" } : {}),
      })),
      { level_flag: "N", active_flag: "Y", shift_id: "", role_id: "" },
    );
    const ours = new Set(s.resources.map((r) => rsrcId(r.id)));
    const rateId = idGen(t, "RSRCRATE", "rsrc_rate_id");
    replaceRows(
      t,
      "RSRCRATE",
      "rsrc_rate_id",
      s.resources.flatMap((r) =>
        rateRows({ from: null, ...r }, r.rates, oldRates(t, "RSRCRATE", "rsrc_id", rsrcId(r.id)), "rsrc_rate_id", (k) => rateId(`${r.id}#${k}`, false), 1).map((x) => ({ ...x, rsrc_id: rsrcId(r.id) })),
      ),
      (r) => ours.has(r.rsrc_id) && !r.shift_period_id,
      { shift_period_id: "" },
    );
    if (s.roles?.length)
      for (const row of t.RSRCROLE ?? []) row.rsrc_role_key = `${row.rsrc_id}|${row.role_id}`;
      replaceRows(
        t,
        "RSRCROLE",
        "rsrc_role_key",
        s.resources.flatMap((r) => (r.roleIds ?? []).map((rid) => ({ rsrc_role_key: `${rsrcId(r.id)}|${roleId(rid)}`, rsrc_id: rsrcId(r.id), role_id: roleId(rid) }))),
        (r) => ours.has(r.rsrc_id),
        { skill_level: "3" },
      );
    for (const row of t.RSRCROLE ?? []) delete row.rsrc_role_key;
    if (s.resourceCodeTypes?.length)
      for (const row of t.RSRCRCAT ?? []) row.rsrc_rcat_key = `${row.rsrc_id}|${row.rsrc_catg_type_id}`;
      replaceRows(
        t,
        "RSRCRCAT",
        "rsrc_rcat_key",
        s.resources.flatMap((r) =>
          Object.entries(r.codes ?? {})
            .filter(([k, v]) => v && rTypeByName.has(k) && rValByKey.has(`${rTypeByName.get(k)}|${v}`))
            .map(([k, v]) => ({ rsrc_rcat_key: `${rsrcId(r.id)}|${rTypeByName.get(k)}`, rsrc_id: rsrcId(r.id), rsrc_catg_type_id: rTypeByName.get(k)!, rsrc_catg_id: rValByKey.get(`${rTypeByName.get(k)}|${v}`)! })),
        ),
        (r) => ours.has(r.rsrc_id),
      );
    for (const row of t.RSRCRCAT ?? []) delete row.rsrc_rcat_key;
  }

  // ---- assignments
  const trId = idGen(t, "TASKRSRC", "taskrsrc_id");
  const rateTypeOut = ["COST_PER_QTY", "COST_PER_QTY2", "COST_PER_QTY3", "COST_PER_QTY4", "COST_PER_QTY5"];
  replaceRows(
    t,
    "TASKRSRC",
    "taskrsrc_id",
    (s.assignments ?? [])
      .filter((x) => taskId.has(x.activityId))
      .map((x) => {
        const r = s.resources?.find((y) => y.id === x.resourceId);
        return {
          taskrsrc_id: trId(x.id),
          task_id: taskId.get(x.activityId)!,
          proj_id: projId,
          rsrc_id: x.resourceId ? rsrcId(x.resourceId) : "",
          role_id: x.roleId ? roleId(x.roleId) : "",
          acct_id: x.costAccountId ? acctId(x.costAccountId) : "",
          curv_id: x.curveId && !x.curveId.startsWith("std-") ? curvId(x.curveId) : "",
          target_qty: n(x.budgetQty),
          remain_qty: n(x.remainingQty),
          act_reg_qty: n(x.actualQty),
          act_ot_qty: "0",
          target_cost: n(x.budgetCost),
          act_reg_cost: n(x.actualCost),
          act_ot_cost: "0",
          remain_cost: n(x.remainingCost),
          rsrc_type: RSRC_TYPE_OUT[r?.type ?? "labor"] ?? "RT_Labor",
          rate_type: rateTypeOut[(x.rateType ?? 1) - 1] ?? "COST_PER_QTY",
          cost_per_qty_source_type: x.rateSource === "role" ? "ST_Role" : x.rateSource === "override" ? "ST_Custom" : "ST_Rsrc",
          ...(x.rateSource === "override" && x.priceOverride !== undefined ? { cost_per_qty: n(x.priceOverride, 4) } : {}),
        };
      }),
    proj,
  );

  // ---- activity codes
  const typeName = new Map<string, string>(); // type name -> id
  for (const r of t.ACTVTYPE ?? []) if (!r.proj_id || r.proj_id === projId) typeName.set(r.actv_code_type, r.actv_code_type_id);
  const actTypeId = idGen(t, "ACTVTYPE", "actv_code_type_id");
  const actValId = idGen(t, "ACTVCODE", "actv_code_id");
  const valKey = new Map((t.ACTVCODE ?? []).map((r) => [`${r.actv_code_type_id}|${r.short_name}`, r.actv_code_id]));
  const types = new Map<string, { scope: string; values: Map<string, { description: string; color?: string }> }>();
  for (const ct of s.codeTypes ?? []) types.set(ct.name, { scope: ct.scope ?? "project", values: new Map(ct.values.map((v) => [v.value, { description: v.description ?? "", color: v.color }])) });
  for (const a of s.activities)
    for (const [k, v] of Object.entries(a.codes ?? {})) {
      if (!v) continue;
      const e = types.get(k) ?? (types.set(k, { scope: "project", values: new Map() }).get(k)!);
      if (!e.values.has(v)) e.values.set(v, { description: "" });
    }
  const SCOPE_OUT: Record<string, string> = { global: "AS_Global", eps: "AS_EPS", project: "AS_Project" };
  let seq = 0;
  for (const [name, e] of types) {
    const id = typeName.get(name) ?? actTypeId(`act:${name}`, false);
    typeName.set(name, id);
    upsertRows(t, "ACTVTYPE", "actv_code_type_id", [{ actv_code_type_id: id, actv_code_type: name, actv_code_type_scope: SCOPE_OUT[e.scope] ?? "AS_Project", proj_id: e.scope === "project" ? projId : "" }], { actv_short_len: "60", seq_num: String((seq += 10)) });
    let vs = 0;
    upsertRows(
      t,
      "ACTVCODE",
      "actv_code_id",
      [...e.values].map(([value, d]) => {
        const vid = valKey.get(`${id}|${value}`) ?? actValId(`acv:${name}|${value}`, false);
        valKey.set(`${id}|${value}`, vid);
        return { actv_code_id: vid, actv_code_type_id: id, short_name: value, actv_code_name: d.description || value, ...(d.color ? { color: String(parseInt(d.color.slice(1), 16)) } : {}) };
      }),
      { seq_num: String((vs += 10)), parent_actv_code_id: "" },
    );
  }
  for (const row of t.TASKACTV ?? []) row.taskactv_key = `${row.task_id}|${row.actv_code_type_id}`;
  replaceRows(
    t,
    "TASKACTV",
    "taskactv_key",
    s.activities
      .filter((a) => taskId.has(a.id))
      .flatMap((a) =>
        Object.entries(a.codes ?? {})
          .filter(([k, v]) => v && typeName.has(k))
          .map(([k, v]) => ({ taskactv_key: `${taskId.get(a.id)}|${typeName.get(k)}`, task_id: taskId.get(a.id)!, actv_code_type_id: typeName.get(k)!, actv_code_id: valKey.get(`${typeName.get(k)}|${v}`)!, proj_id: projId })),
      ),
    proj,
  );
  for (const row of t.TASKACTV ?? []) delete row.taskactv_key;

  // ---- user-defined fields (activities)
  const udfNames = new Set<string>([...(s.udfDefs ?? []).map((u) => u.name), ...s.activities.flatMap((a) => Object.keys(a.userFields ?? {}))]);
  if (udfNames.size) {
    const udfType = new Map((t.UDFTYPE ?? []).filter((u) => u.table_name === "TASK").map((u) => [u.udf_type_label || u.udf_type_name, u.udf_type_id]));
    const udfId = idGen(t, "UDFTYPE", "udf_type_id");
    const kind = new Map((s.udfDefs ?? []).map((u) => [u.name, u.type]));
    let k = (t.UDFTYPE ?? []).length;
    // Calculated UDFs (formulas, indicator rules) are written as their current values.
    const calc = (s.udfDefs ?? []).filter((u) => u.formula || u.indicatorRule?.field);
    const fields = calc.length ? new Map(fieldsFor(s).map((f) => [f.id, f])) : null;
    const ctx = calc.length ? fieldCtx(s) : null;
    const udfValues = (a: Activity): Record<string, string> => {
      if (!fields) return a.userFields ?? {};
      const out = { ...(a.userFields ?? {}) };
      for (const u of calc) {
        const v = fields.get(`user:${u.name}`)?.get(a, ctx!);
        if (v === null || v === undefined || v === "") delete out[u.name];
        else out[u.name] = String(v);
      }
      return out;
    };
    for (const name of udfNames) {
      const id = udfType.get(name) ?? udfId(`udf:${name}`, false);
      udfType.set(name, id);
      upsertRows(t, "UDFTYPE", "udf_type_id", [{ udf_type_id: id, table_name: "TASK", udf_type_label: name, logical_data_type: UDF_TYPE_OUT[kind.get(name) ?? "text"] ?? "FT_TEXT" }], { udf_type_name: `user_field_${++k}`, super_flag: "N" });
    }
    const ourTypes = new Set([...udfNames].map((x) => udfType.get(x)!));
    for (const row of t.UDFVALUE ?? []) row.udf_key = `${row.udf_type_id}|${row.fk_id}`;
    replaceRows(
      t,
      "UDFVALUE",
      "udf_key",
      s.activities
        .filter((a) => taskId.has(a.id))
        .flatMap((a) =>
          Object.entries(udfValues(a))
            .filter(([, v]) => v !== "" && v !== undefined)
            .map(([name, v]) => {
              const ty = kind.get(name) ?? "text";
              return {
                udf_key: `${udfType.get(name)}|${taskId.get(a.id)}`,
                udf_type_id: udfType.get(name)!,
                fk_id: taskId.get(a.id)!,
                proj_id: projId,
                udf_text: ty === "text" ? String(v) : ty === "indicator" ? INDICATOR_OUT[String(v)] ?? "" : "",
                udf_number: ty === "number" || ty === "cost" ? String(v) : "",
                udf_date: ty === "date" ? `${String(v).slice(0, 10)} 00:00` : "",
              };
            }),
        ),
      (r) => proj(r) && ourTypes.has(r.udf_type_id),
    );
    for (const row of t.UDFVALUE ?? []) delete row.udf_key;
  }

  // ---- steps and notebooks
  const procId = idGen(t, "TASKPROC", "proc_id");
  replaceRows(
    t,
    "TASKPROC",
    "proc_id",
    s.activities
      .filter((a) => taskId.has(a.id) && a.steps?.length)
      .flatMap((a) =>
        a.steps!.map((st, i) => ({ proc_id: procId(st.id), task_id: taskId.get(a.id)!, proj_id: projId, seq_num: String((i + 1) * 10), proc_name: st.name, proc_wt: n(st.weight), complete_pct: n(st.pct), complete_flag: st.pct >= 100 ? "Y" : "N" })),
      ),
    proj,
  );
  // General activity notes go to P6 as a "Notes" topic unless that topic is already used.
  const notebookOf = (a: Schedule["activities"][number]): Record<string, string> => (a.notes && !a.notebook?.Notes ? { Notes: a.notes, ...(a.notebook ?? {}) } : a.notebook ?? {});
  const topics = new Set(s.activities.flatMap((a) => Object.keys(notebookOf(a))));
  if (topics.size) {
    const memoType = new Map((t.MEMOTYPE ?? []).map((m) => [m.memo_type, m.memo_type_id]));
    const mtId = idGen(t, "MEMOTYPE", "memo_type_id");
    for (const topic of topics) {
      const id = memoType.get(topic) ?? mtId(`memo:${topic}`, false);
      memoType.set(topic, id);
      upsertRows(t, "MEMOTYPE", "memo_type_id", [{ memo_type_id: id, memo_type: topic }], { eps_flag: "N", proj_flag: "N", wbs_flag: "Y", task_flag: "Y", seq_num: "0" });
    }
    const memoId = idGen(t, "TASKMEMO", "memo_id");
    replaceRows(
      t,
      "TASKMEMO",
      "memo_id",
      s.activities
        .filter((a) => taskId.has(a.id))
        .flatMap((a) =>
          Object.entries(notebookOf(a))
            .filter(([, text]) => text)
            .map(([topic, text]) => ({ memo_id: memoId(`${a.id}|${topic}`, false), task_id: taskId.get(a.id)!, memo_type_id: memoType.get(topic)!, proj_id: projId, task_memo: `<html><body>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</body></html>` })),
        ),
      proj,
    );
  }

  // ---- project codes
  if (s.projectCodes && Object.keys(s.projectCodes).length) {
    const pType = new Map((t.PCATTYPE ?? []).map((r) => [r.proj_catg_type, r.proj_catg_type_id]));
    const pVal = new Map((t.PCATVAL ?? []).map((r) => [`${r.proj_catg_type_id}|${r.proj_catg_short_name}`, r.proj_catg_id]));
    const ptId = idGen(t, "PCATTYPE", "proj_catg_type_id");
    const pvId = idGen(t, "PCATVAL", "proj_catg_id");
    const desc = new Map((s.projectCodeTypes ?? []).flatMap((ct) => ct.values.map((v) => [`${ct.name}|${v.value}`, v.description ?? ""] as const)));
    const rows: Row[] = [];
    for (const [type, value] of Object.entries(s.projectCodes)) {
      if (!value) continue;
      const tid = pType.get(type) ?? ptId(`pct:${type}`, false);
      pType.set(type, tid);
      upsertRows(t, "PCATTYPE", "proj_catg_type_id", [{ proj_catg_type_id: tid, proj_catg_type: type }], { proj_catg_short_len: "20" });
      const vid = pVal.get(`${tid}|${value}`) ?? pvId(`pcv:${type}|${value}`, false);
      pVal.set(`${tid}|${value}`, vid);
      upsertRows(t, "PCATVAL", "proj_catg_id", [{ proj_catg_id: vid, proj_catg_type_id: tid, proj_catg_short_name: value, proj_catg_name: desc.get(`${type}|${value}`) || value }], { parent_proj_catg_id: "" });
      rows.push({ proj_id: projId, proj_catg_type_id: tid, proj_catg_id: vid, key: tid });
    }
    for (const row of t.PROJPCAT ?? []) row.key = row.proj_catg_type_id;
    replaceRows(t, "PROJPCAT", "key", rows, proj);
    for (const row of t.PROJPCAT ?? []) delete row.key;
  }

  // ---- expenses and their categories
  const expenses = s.registers?.expenses ?? [];
  if (expenses.length || s.expenseCategories?.length) {
    const ctName = new Map((t.COSTTYPE ?? []).map((r) => [r.cost_type, r.cost_type_id]));
    const ctId = idGen(t, "COSTTYPE", "cost_type_id");
    const cats = new Set([...(s.expenseCategories ?? []), ...expenses.map((e) => e.values.Category).filter(Boolean)]);
    for (const c of cats) {
      const id = ctName.get(c) ?? ctId(`ct:${c}`, false);
      ctName.set(c, id);
      upsertRows(t, "COSTTYPE", "cost_type_id", [{ cost_type_id: id, cost_type: c }], { seq_num: "0" });
    }
    const acctByCode = new Map((s.costAccounts ?? []).map((a) => [a.code.toLowerCase(), a.id]));
    const costId = idGen(t, "PROJCOST", "cost_item_id");
    replaceRows(
      t,
      "PROJCOST",
      "cost_item_id",
      expenses
        .filter((e) => e.activityId && taskId.has(e.activityId))
        .map((e) => {
          const acct = acctByCode.get((e.values["Cost Account"] ?? "").toLowerCase());
          return {
            cost_item_id: costId(e.id),
            task_id: taskId.get(e.activityId!)!,
            proj_id: projId,
            cost_type_id: e.values.Category ? ctName.get(e.values.Category) ?? "" : "",
            acct_id: acct ? acctId(acct) : "",
            cost_name: e.values["Expense Item"] ?? "",
            vendor_name: e.values.Vendor ?? "",
            target_cost: n(money(e.values["Budgeted Cost"])),
            act_cost: n(money(e.values["Actual Cost"])),
            remain_cost: n(money(e.values["Remaining Cost"])),
            cost_load_type: ACCRUAL_OUT[e.values["Accrual Type"] ?? ""] ?? "CL_Uniform",
            auto_compute_act_flag: "N",
          };
        }),
      proj,
    );
  }

  // ---- budget log, funding, spending plan
  if (s.budgetChanges?.length) {
    const bcId = idGen(t, "BUDGCHNG", "budg_chng_id");
    const ST: Record<string, string> = { approved: "CS_Appr", pending: "CS_Pend", "not-approved": "CS_Rejected" };
    replaceRows(
      t,
      "BUDGCHNG",
      "budg_chng_id",
      s.budgetChanges.map((c, i) => ({ budg_chng_id: bcId(c.id), proj_id: projId, wbs_id: wbsOut(c.wbsId), chng_date: formatXerDate(c.date), chng_short_name: c.reason.slice(0, 40) || String(i + 1), chng_descr: c.reason, cost: n(c.amount), chng_by_name: c.responsible, status_code: ST[c.status] })),
      proj,
    );
  }
  if (s.fundingSources?.length) {
    const fsId = idGen(t, "FUNDSRC", "fund_id");
    upsertRows(t, "FUNDSRC", "fund_id", s.fundingSources.map((f) => ({ fund_id: fsId(f.id), ...(f.parentId ? { parent_fund_id: fsId(f.parentId) } : {}), fund_name: f.name, ...(f.description !== undefined ? { fund_descr: f.description } : {}) })), { parent_fund_id: "", fund_descr: "", seq_num: "0" });
    const pfId = idGen(t, "PROJFUND", "proj_fund_id");
    replaceRows(
      t,
      "PROJFUND",
      "proj_fund_id",
      (s.funding ?? []).filter((f) => f.wbsId === null).map((f) => ({ proj_fund_id: pfId(f.id), proj_id: projId, fund_id: fsId(f.sourceId), fund_cost: n(f.amount), fund_wt: "" })),
      proj,
    );
  }
  if (s.spendingPlan?.length) {
    const wbId = idGen(t, "WBSBUDG", "wbs_budg_id");
    replaceRows(
      t,
      "WBSBUDG",
      "wbs_budg_id",
      s.spendingPlan.map((r) => ({ wbs_budg_id: wbId(`${r.wbsId ?? "root"}|${r.month}`, false), proj_id: projId, wbs_id: wbsOut(r.wbsId), start_date: `${r.month}-01 00:00`, spend_cost: n(r.spending), benefit_cost: n(r.benefit ?? 0) })),
      proj,
    );
  }
}
