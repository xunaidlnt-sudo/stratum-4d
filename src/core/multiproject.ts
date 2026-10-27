// Several projects open at once (P6 opens any set of EPS projects together),
// relationships between them, the EPS, and reflections (a working copy of a
// project whose changes are merged back later).

import type { Activity, ExternalRelationship, ProjectPart, Relationship, Schedule, WbsNode } from "./types";

const SEP = "~";
const ROOT = "__root";

/** Dictionaries that are enterprise-wide in P6: merged by id when projects open together. */
const SHARED = ["calendars", "resources", "roles", "shifts", "curves", "costAccounts", "codeTypes", "udfDefs", "obs", "fundingSources", "stepTemplates", "notebookTopics"] as const;
type SharedKey = (typeof SHARED)[number];

// XER tables are large; keep them out of the combined schedule and put them back on split.
const xerByPart = new Map<string, Schedule["sourceXer"]>();

const pre = (k: string, id: string) => `${k}${SEP}${id}`;
const unpre = (k: string, id: string) => (id.startsWith(`${k}${SEP}`) ? id.slice(k.length + SEP.length) : id);
const keyOf = (id: string) => (id.includes(SEP) ? id.slice(0, id.indexOf(SEP)) : null);

export const isCombined = (s: Schedule | null | undefined) => !!s?.projects && s.projects.length > 1;

/**
 * Combine projects into one schedule. Activity, WBS, relationship and
 * assignment ids get a per-project prefix; each project becomes a top WBS
 * band; external relationships between the projects become real ones.
 */
export function combineSchedules(parts: { dbId: string | null; version?: number | null; schedule: Schedule }[]): Schedule {
  if (!parts.length) throw new Error("No projects to open.");
  const projects: ProjectPart[] = [];
  const out: Schedule = { projectId: "multi", projectCode: parts.map((p) => p.schedule.projectCode).join(" + "), projectName: `${parts.length} projects`, dataDate: null, activities: [], wbs: [], relationships: [], assignments: [], registers: {} };
  const shared = new Map<SharedKey, Map<string, unknown>>(SHARED.map((k) => [k, new Map()]));
  const codeToId = new Map<string, string>(); // "PROJ|A100" -> combined activity id
  parts.forEach((p, i) => {
    const s = p.schedule;
    const k = `p${i + 1}`;
    const { activities, wbs, relationships, assignments, registers, projects: _nested, ...rest } = s;
    void _nested;
    xerByPart.set(`${k}|${s.projectCode}`, rest.sourceXer ?? null);
    projects.push({ key: k, dbId: p.dbId, version: p.version ?? null, code: s.projectCode, name: s.projectName, rest: { ...rest, sourceXer: null } });
    // Each project is a top band, like the project node in P6.
    out.wbs.push({ id: pre(k, ROOT), parentId: null, code: s.projectCode, name: s.projectName, seq: i, obsId: s.obsId ?? null, originalBudget: s.originalBudget });
    for (const w of wbs) out.wbs.push({ ...w, id: pre(k, w.id), parentId: w.parentId ? pre(k, w.parentId) : pre(k, ROOT) });
    for (const a of activities) {
      const id = pre(k, a.id);
      out.activities.push({ ...a, id, projectId: k, wbsId: a.wbsId ? pre(k, a.wbsId) : pre(k, ROOT) });
      codeToId.set(`${s.projectCode}|${a.code}`, id);
    }
    for (const r of relationships) out.relationships.push({ ...r, id: pre(k, r.id), predecessorId: pre(k, r.predecessorId), successorId: pre(k, r.successorId) });
    for (const x of assignments ?? []) out.assignments!.push({ ...x, id: pre(k, x.id), activityId: pre(k, x.activityId) });
    for (const [kind, list] of Object.entries(registers ?? {})) {
      const reg = out.registers as Record<string, unknown[]>;
      reg[kind] = [...(reg[kind] ?? []), ...(list ?? []).map((it) => ({ ...it, id: pre(k, it.id), activityId: it.activityId ? pre(k, it.activityId) : it.activityId, values: { ...it.values, Project: s.projectCode } }))];
    }
    for (const key of SHARED) for (const x of (s[key] as { id: string }[] | undefined) ?? []) if (!shared.get(key)!.has(x.id)) shared.get(key)!.set(x.id, x);
    if (s.dataDate !== null && (out.dataDate === null || s.dataDate > out.dataDate)) out.dataDate = s.dataDate;
    if (!out.defaultCalendarId && s.defaultCalendarId) out.defaultCalendarId = s.defaultCalendarId;
  });
  // External relationships whose other project is open become ordinary relationships.
  parts.forEach((p, i) => {
    const k = `p${i + 1}`;
    for (const e of p.schedule.externalRelationships ?? []) {
      const pred = codeToId.get(`${e.predecessorProject}|${e.predecessorCode}`);
      if (!pred) continue;
      out.relationships.push({ id: `x${SEP}${e.predecessorProject}.${e.predecessorCode}>${pre(k, e.successorId)}`, predecessorId: pred, successorId: pre(k, e.successorId), type: e.type, lagHours: e.lagHours });
    }
  });
  for (const key of SHARED) {
    const m = shared.get(key)!;
    if (m.size) (out as unknown as Record<string, unknown>)[key] = [...m.values()];
  }
  out.projects = projects;
  out.scheduleOptions = parts[0].schedule.scheduleOptions;
  return out;
}

/** Split a combined schedule back into its projects (inverse of combineSchedules). */
export function splitSchedule(s: Schedule): { dbId: string | null; version: number | null; schedule: Schedule }[] {
  if (!s.projects?.length) return [{ dbId: null, version: null, schedule: s }];
  const byKey = new Map(s.projects.map((p) => [p.key, p]));
  // Work added in the combined view has no prefix: it belongs to the project of its WBS.
  const wbsById = new Map(s.wbs.map((w) => [w.id, w]));
  const wbsKey = (id: string | null | undefined): string | null => {
    for (let w = id ? wbsById.get(id) : undefined, n = 0; w && n < 1000; w = w.parentId ? wbsById.get(w.parentId) : undefined, n++) {
      const k = keyOf(w.id);
      if (k && byKey.has(k)) return k;
    }
    return null;
  };
  const first = s.projects[0].key;
  const actKey = new Map(s.activities.map((a) => [a.id, a.projectId ?? (keyOf(a.id) && byKey.has(keyOf(a.id)!) ? keyOf(a.id) : null) ?? wbsKey(a.wbsId) ?? first]));
  const actCode = new Map(s.activities.map((a) => [a.id, a.code]));
  return s.projects.map((p) => {
    const k = p.key;
    const wbs: WbsNode[] = s.wbs
      .filter((w) => wbsKey(w.id) === k && w.id !== pre(k, ROOT))
      .map((w) => ({ ...w, id: unpre(k, w.id), parentId: w.parentId && w.parentId !== pre(k, ROOT) ? unpre(k, w.parentId) : null }));
    const root = s.wbs.find((w) => w.id === pre(k, ROOT));
    const activities: Activity[] = s.activities
      .filter((a) => actKey.get(a.id) === k)
      .map((a) => {
        const { projectId: _p, ...rest } = a;
        void _p;
        return { ...rest, id: unpre(k, a.id), wbsId: a.wbsId && a.wbsId !== pre(k, ROOT) ? unpre(k, a.wbsId) : null };
      });
    const relationships: Relationship[] = [];
    const externalRelationships: ExternalRelationship[] = [];
    for (const r of s.relationships) {
      const pk = actKey.get(r.predecessorId);
      const sk = actKey.get(r.successorId);
      if (sk !== k) continue;
      if (pk === k) relationships.push({ ...r, id: r.id.startsWith(`x${SEP}`) ? `ext-${unpre(k, r.predecessorId)}-${unpre(k, r.successorId)}` : unpre(k, r.id), predecessorId: unpre(k, r.predecessorId), successorId: unpre(k, r.successorId) });
      else if (pk) externalRelationships.push({ predecessorProject: byKey.get(pk)?.code ?? pk, predecessorCode: actCode.get(r.predecessorId) ?? "", successorId: unpre(k, r.successorId), type: r.type, lagHours: r.lagHours });
    }
    // Keep external links to projects that were not open this time.
    const openCodes = new Set(s.projects!.map((x) => x.code));
    for (const e of p.rest.externalRelationships ?? []) if (!openCodes.has(e.predecessorProject)) externalRelationships.push(e);
    const registers: Schedule["registers"] = {};
    for (const [kind, list] of Object.entries(s.registers ?? {})) {
      const regKey = (it: { id: string; activityId?: string | null; values: Record<string, string> }) =>
        (keyOf(it.id) && byKey.has(keyOf(it.id)!) ? keyOf(it.id) : null) ?? (it.activityId ? actKey.get(it.activityId) : null) ?? s.projects!.find((x) => x.code === it.values.Project)?.key ?? first;
      const own = (list ?? []).filter((it) => regKey(it) === k);
      (registers as Record<string, unknown[]>)[kind] = own.map((it) => {
        const { Project: _proj, ...values } = it.values;
        void _proj;
        return { ...it, id: unpre(k, it.id), activityId: it.activityId ? unpre(k, it.activityId) : it.activityId, values };
      });
    }
    const schedule: Schedule = {
      ...p.rest,
      activities,
      wbs,
      relationships,
      assignments: (s.assignments ?? []).filter((x) => actKey.get(x.activityId) === k).map((x) => ({ ...x, id: unpre(k, x.id), activityId: unpre(k, x.activityId) })),
      registers,
      externalRelationships,
      obsId: root?.obsId ?? p.rest.obsId,
      originalBudget: root?.originalBudget ?? p.rest.originalBudget,
      projectCode: root?.code || p.code,
      projectName: root?.name || p.name,
      sourceXer: xerByPart.get(`${k}|${p.code}`) ?? p.rest.sourceXer ?? null,
    };
    for (const key of SHARED) if (s[key]) (schedule as unknown as Record<string, unknown>)[key] = s[key];
    return { dbId: p.dbId, version: p.version ?? null, schedule };
  });
}

/** Project code of an activity in a combined schedule. */
export function projectCodeOf(s: Schedule, a: Activity): string {
  if (!a.projectId || !s.projects) return s.projectCode;
  return s.projects.find((p) => p.key === a.projectId)?.code ?? "";
}

// ---------------------------------------------------------------- EPS

export interface EpsRow {
  /** Path key, e.g. "Company/Substations". */
  key: string;
  name: string;
  depth: number;
  kind: "eps" | "project";
  projectId?: string;
}

/** EPS tree from each project's EPS path. Projects without one sit at the top. */
export function epsTree(items: { id: string; code: string; name: string; eps?: string[] }[]): EpsRow[] {
  type Node = { name: string; kids: Map<string, Node>; projects: typeof items };
  const root: Node = { name: "", kids: new Map(), projects: [] };
  for (const it of items) {
    let n = root;
    for (const part of (it.eps ?? []).map((x) => x.trim()).filter(Boolean)) {
      if (!n.kids.has(part)) n.kids.set(part, { name: part, kids: new Map(), projects: [] });
      n = n.kids.get(part)!;
    }
    n.projects.push(it);
  }
  const out: EpsRow[] = [];
  const walk = (n: Node, depth: number, path: string) => {
    for (const k of [...n.kids.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      const key = path ? `${path}/${k.name}` : k.name;
      out.push({ key, name: k.name, depth, kind: "eps" });
      walk(k, depth + 1, key);
    }
    for (const p of [...n.projects].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))) out.push({ key: `${path}#${p.id}`, name: `${p.code} – ${p.name}`, depth, kind: "project", projectId: p.id });
  };
  walk(root, 0, "");
  return out;
}

export const parseEps = (text: string) =>
  text
    .split(/[/\\>]/)
    .map((x) => x.trim())
    .filter(Boolean);

// ---------------------------------------------------------------- reflections

/** A reflection: a working copy of a project, to try changes without touching the original. */
export function reflect(s: Schedule, sourceDbId: string): Schedule {
  return { ...structuredClone({ ...s, sourceXer: null }), sourceXer: s.sourceXer, projectCode: `${s.projectCode}-R`, projectName: `${s.projectName} (reflection)`, reflectionOf: { dbId: sourceDbId, code: s.projectCode, createdAt: new Date().toISOString() } };
}

export interface MergeReport {
  added: string[];
  deleted: string[];
  changed: { code: string; fields: string[] }[];
  relationshipsAdded: number;
  relationshipsDeleted: number;
  relationshipsChanged: number;
  assignmentsChanged: number;
  wbsChanged: number;
}

const ACT_FIELDS: (keyof Activity)[] = [
  "code", "name", "wbsId", "type", "status", "percentComplete", "start", "finish", "actualStart", "actualFinish", "originalDurationHours", "remainingDurationHours",
  "calendarId", "constraintType", "constraintDate", "secondaryConstraint", "codes", "udfs", "steps", "notebook", "durationType", "pctType", "physicalPercent", "expectedFinish", "suspendDate", "resumeDate",
] as (keyof Activity)[];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What a reflection changed compared with its source project. */
export function reflectionChanges(source: Schedule, reflection: Schedule): MergeReport {
  const src = new Map(source.activities.map((a) => [a.id, a]));
  const ref = new Map(reflection.activities.map((a) => [a.id, a]));
  const changed: MergeReport["changed"] = [];
  for (const a of reflection.activities) {
    const o = src.get(a.id);
    if (!o) continue;
    const fields = ACT_FIELDS.filter((f) => !same(a[f], o[f])) as string[];
    if (fields.length) changed.push({ code: a.code, fields });
  }
  const relKey = (r: Relationship) => `${r.predecessorId}>${r.successorId}`;
  const sr = new Map(source.relationships.map((r) => [relKey(r), r]));
  const rr = new Map(reflection.relationships.map((r) => [relKey(r), r]));
  const sa = new Map((source.assignments ?? []).map((x) => [x.id, x]));
  const sw = new Map(source.wbs.map((w) => [w.id, w]));
  return {
    added: reflection.activities.filter((a) => !src.has(a.id)).map((a) => a.code),
    deleted: source.activities.filter((a) => !ref.has(a.id)).map((a) => a.code),
    changed,
    relationshipsAdded: [...rr.keys()].filter((k) => !sr.has(k)).length,
    relationshipsDeleted: [...sr.keys()].filter((k) => !rr.has(k)).length,
    relationshipsChanged: [...rr].filter(([k, r]) => sr.has(k) && (sr.get(k)!.type !== r.type || sr.get(k)!.lagHours !== r.lagHours)).length,
    assignmentsChanged: (reflection.assignments ?? []).filter((x) => !same(x, sa.get(x.id))).length + (source.assignments ?? []).filter((x) => !(reflection.assignments ?? []).some((y) => y.id === x.id)).length,
    wbsChanged: reflection.wbs.filter((w) => !same(w, sw.get(w.id))).length + source.wbs.filter((w) => !reflection.wbs.some((x) => x.id === w.id)).length,
  };
}

/** Merge a reflection back: the source takes the reflection's activities, logic, WBS and assignments, keeping its own identity. */
export function mergeReflection(source: Schedule, reflection: Schedule): { schedule: Schedule; report: MergeReport } {
  const report = reflectionChanges(source, reflection);
  const { projectCode: _c, projectName: _n, reflectionOf: _r, sourceXer: _x, ...body } = reflection;
  void _c;
  void _n;
  void _r;
  void _x;
  return { schedule: { ...source, ...body, projectCode: source.projectCode, projectName: source.projectName, reflectionOf: null, sourceXer: source.sourceXer }, report };
}
