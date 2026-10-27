// P6 Projects window: the EPS tree of every project in the database, opening
// several projects together, and reflections.

import { useEffect, useMemo, useState } from "react";
import { useConfig } from "../../backend/config";
import type { ProjectSummary } from "../../backend/types";
import { combineSchedules, epsNode, epsTree, isCombined, mergeReflection, reflect, reflectionChanges, splitSchedule } from "../../core/multiproject";
import { uid } from "../../core/ops";
import type { StratumProject } from "../../core/project";
import type { Schedule } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { useP6 } from "./commands";

const payload = (schedule: Schedule, old?: StratumProject | null): StratumProject => ({
  format: "stratum-project",
  version: 2,
  savedAt: new Date().toISOString(),
  modelFileName: old?.modelFileName ?? null,
  schedule,
  links: old?.links ?? [],
  rules: old?.rules ?? [],
  profiles: old?.profiles ?? [],
  segments: old?.segments ?? [],
  groups: old?.groups ?? [],
  paths: old?.paths ?? [],
} as StratumProject);

/** Save every project of a combined view back to its own database record. */
export async function saveCombined(): Promise<string> {
  const st = useStore.getState();
  const s = st.schedule;
  if (!s || !isCombined(s)) return "";
  const backend = useConfig.getState().backend;
  const parts = splitSchedule(s);
  const versions = new Map<string, number>();
  for (const [i, p] of parts.entries()) {
    const key = s.projects![i].key;
    const id = p.dbId ?? uid("prj");
    const old = p.dbId ? (await backend.getProject(p.dbId))?.project ?? null : null;
    const v = await backend.saveProject(id, payload(p.schedule, old), p.version ?? undefined);
    versions.set(key, v);
    if (!p.dbId) s.projects![i] = { ...s.projects![i], dbId: id };
  }
  useStore.setState({ schedule: { ...s, projects: s.projects!.map((p) => ({ ...p, version: versions.get(p.key) ?? p.version })) } });
  return `Saved ${parts.length} projects (${parts.map((p) => p.schedule.projectCode).join(", ")}).`;
}

function openCombined(schedule: Schedule) {
  const st = useStore.getState();
  st.setSchedule(schedule);
  st.setLinks([]);
  st.setPaths([]);
  st.setLastUpdate(null);
  st.setScheduleReport(null);
  st.setCurrentProject(null, null);
}

type Row = ProjectSummary & { eps: string[]; reflectionOf: string | null; activities: number; priority: number; baseline: string; baselineDate: number | null };

// EPS nodes with no project yet live on this device (P6 keeps them in the EPS table).
const EPS_KEY = "stratum.eps.v1";
const loadEmptyEps = (): string[][] => {
  try {
    return JSON.parse(localStorage.getItem(EPS_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const saveEmptyEps = (v: string[][]) => {
  try {
    localStorage.setItem(EPS_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
};

export function EnterpriseProjectsWindow({ onOpenOne, onImportToDb, onSave }: { onOpenOne: (id: string) => Promise<void>; onImport?: () => void; onImportToDb?: (eps: string[]) => Promise<void>; onSave?: () => Promise<void> }) {
  const backend = useConfig((c) => c.backend);
  const schedule = useStore((s) => s.schedule);
  const currentId = useStore((s) => s.currentProjectId);
  const [list, setList] = useState<Row[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [selEps, setSelEps] = useState<string | null>(null);
  const [emptyEps, setEmptyEps] = useState<string[][]>(loadEmptyEps);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const rows = await backend.listProjects();
      // Details live in each project; read them once per saved version.
      const full = await Promise.all(
        rows.map(async (r) => {
          const hit = epsCache.get(`${r.id}@${r.version}`);
          if (hit) return { ...r, ...hit };
          const s = (await backend.getProject(r.id).catch(() => null))?.project.schedule;
          const info = {
            eps: s?.eps ?? [],
            reflectionOf: s?.reflectionOf?.dbId ?? null,
            activities: s?.activities.length ?? 0,
            priority: s?.strategicPriority ?? 500,
            baseline: s?.baselineInfo?.name ?? "<Current Project>",
            baselineDate: s?.baselineInfo?.dataDate ?? s?.dataDate ?? null,
          };
          epsCache.set(`${r.id}@${r.version}`, info);
          return { ...r, ...info };
        }),
      );
      setList(full);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend, currentId, schedule?.projects?.map((p) => p.version).join()]);

  const byId = new Map((list ?? []).map((p) => [p.id, p]));
  const rows = useMemo(() => {
    const items: { id: string; code: string; name: string; eps?: string[] }[] = [...(list ?? [])];
    emptyEps.forEach((path, i) => items.push({ id: `__eps${i}`, code: "", name: "", eps: path }));
    return epsTree(items).filter((r) => !(r.kind === "project" && r.projectId!.startsWith("__eps")));
  }, [list, emptyEps]);
  const epsPaths = useMemo(() => {
    // Every EPS node as a path, for the Move to EPS list.
    const out: { key: string; path: string[]; label: string }[] = [];
    const stack: string[] = [];
    const segOf = new Map<string, string>();
    for (const it of [...(list ?? []).map((p) => p.eps), ...emptyEps]) {
      const acc: string[] = [];
      for (const seg of it) {
        acc.push(epsNode(seg).id);
        if (!segOf.has(acc.join("/"))) segOf.set(acc.join("/"), seg);
      }
    }
    for (const r of rows) {
      if (r.kind !== "eps") continue;
      stack.length = r.depth;
      stack.push(segOf.get(r.key) ?? r.id);
      out.push({ key: r.key, path: [...stack], label: `${"\u00a0\u00a0".repeat(r.depth)}${r.id}${r.name !== r.id ? ` – ${r.name}` : ""}` });
    }
    return out;
  }, [rows, list, emptyEps]);
  const openIds = new Set(isCombined(schedule) ? schedule!.projects!.map((p) => p.dbId ?? "") : currentId ? [currentId] : []);
  const unsaved = !!schedule && !currentId && !isCombined(schedule);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg("");
    try {
      const m = await fn();
      if (m) setMsg(m);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openSelected = () =>
    run(async () => {
      if (sel.length === 1) {
        await onOpenOne(sel[0]);
        useP6.getState().show("activities");
        return;
      }
      const parts = [];
      for (const id of sel) {
        const r = await backend.getProject(id);
        if (r?.project.schedule) parts.push({ dbId: id, version: r.version, schedule: r.project.schedule });
      }
      const c = combineSchedules(parts);
      openCombined(c);
      useStore.getState().setStatus(`Opened ${parts.length} projects together: ${c.projectCode}. Press F9 to schedule them as one network; Commit saves each project back.`);
      useP6.getState().show("activities");
    });
  const saveField = async (ids: string[], patch: (s: Schedule) => Schedule) => {
    for (const id of ids) {
      const r = await backend.getProject(id);
      if (!r?.project.schedule) continue;
      const next = patch(r.project.schedule);
      const v = await backend.saveProject(id, { ...r.project, schedule: next }, r.version);
      if (id === currentId) {
        const st = useStore.getState();
        if (st.schedule) useStore.setState({ schedule: patch(st.schedule) });
        st.setCurrentProject(id, v);
      }
    }
    await load();
  };
  const moveTo = (path: string[]) =>
    run(async () => {
      await saveField(sel, (s) => ({ ...s, eps: path }));
      return `Moved ${sel.length} project(s) to ${path.map((x) => epsNode(x).id).join(" / ") || "the top level"}.`;
    });
  const addEps = () => {
    const parent = epsPaths.find((e) => e.key === selEps)?.path ?? [];
    const t = window.prompt(`New EPS node${parent.length ? ` under ${parent.map((x) => epsNode(x).id).join(" / ")}` : ""}.\nType the EPS ID and name, e.g. NEWEPS | L&T Projects - TAQA`, "");
    if (!t?.trim()) return;
    const next = [...emptyEps, [...parent, t.trim()]];
    setEmptyEps(next);
    saveEmptyEps(next);
  };
  const createReflection = () =>
    run(async () => {
      const id = sel[0];
      const r = await backend.getProject(id);
      if (!r?.project.schedule) throw new Error("Project not found.");
      const s = reflect(r.project.schedule, id);
      await backend.saveProject(uid("prj"), { ...r.project, schedule: s });
      await load();
      return `Created reflection ${s.projectCode}. Open it, make your changes, then Merge Reflection brings them back to ${r.project.schedule.projectCode}.`;
    });
  const mergeBack = () =>
    run(async () => {
      const ref = useStore.getState().schedule;
      if (!ref?.reflectionOf) throw new Error("Open a reflection first.");
      const src = await backend.getProject(ref.reflectionOf.dbId);
      if (!src?.project.schedule) throw new Error(`The source project ${ref.reflectionOf.code} is no longer in the database.`);
      const ch = reflectionChanges(src.project.schedule, ref);
      const summary = `${ch.added.length} added, ${ch.deleted.length} deleted, ${ch.changed.length} changed activities; ${ch.relationshipsAdded} relationships added, ${ch.relationshipsDeleted} deleted, ${ch.relationshipsChanged} changed; ${ch.assignmentsChanged} assignments and ${ch.wbsChanged} WBS elements changed`;
      if (!window.confirm(`Merge the reflection into ${ref.reflectionOf.code}?\n\n${summary}.\n\nThe source project is overwritten with the reflection's activities, logic, WBS and resources.`)) return;
      const merged = mergeReflection(src.project.schedule, ref);
      await backend.saveProject(ref.reflectionOf.dbId, { ...src.project, schedule: merged.schedule }, src.version);
      await load();
      return `Merged into ${ref.reflectionOf.code}: ${summary}.`;
    });
  const del = () =>
    run(async () => {
      if (!window.confirm(`Delete ${sel.map((id) => byId.get(id)?.code).join(", ")} from the database? This cannot be undone.`)) return;
      for (const id of sel) await backend.deleteProject(id);
      setSel([]);
      await load();
    });

  const visibleProjects = rows.filter((r) => r.kind === "project").map((r) => r.projectId!);
  const click = (id: string, e: React.MouseEvent) => {
    setSelEps(null);
    if (e.ctrlKey || e.metaKey) setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
    else if (e.shiftKey && sel.length) {
      const a = visibleProjects.indexOf(sel[sel.length - 1]);
      const b = visibleProjects.indexOf(id);
      setSel(visibleProjects.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else setSel([id]);
  };
  const hidden = (key: string) => [...collapsed].some((c) => key !== c && (key.startsWith(`${c}/`) || key.startsWith(`${c}#`)));
  const n = sel.length;
  const total = (ids: string[]) => ids.reduce((t, id) => t + (byId.get(id)?.activities ?? 0), 0);
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <button className="primary" disabled={!n || busy} onClick={openSelected}>
          {n > 1 ? `Open ${n} projects together` : "Open"}
        </button>
        {onImportToDb && (
          <button disabled={busy} onClick={() => run(() => onImportToDb(epsPaths.find((e) => e.key === selEps)?.path ?? []).then(load))} title="Import an XER or MS Project XML straight into the database">
            Import XER…
          </button>
        )}
        <button onClick={addEps} title="Add an EPS node (under the selected EPS)">
          Add EPS…
        </button>
        <label className="p6-drop" title="Move the selected projects to an EPS node">
          Move to
          <select value="" disabled={!n || busy} onChange={(e) => e.target.value !== "" && void moveTo(e.target.value === "__top" ? [] : epsPaths.find((x) => x.key === e.target.value)!.path)}>
            <option value="">EPS…</option>
            <option value="__top">(top level)</option>
            {epsPaths.map((e) => (
              <option key={e.key} value={e.key}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <span className="tsep" />
        <button disabled={n !== 1 || busy} onClick={createReflection} title="Copy the project to try changes without touching it">
          Create Reflection
        </button>
        <button disabled={!schedule?.reflectionOf || busy} onClick={mergeBack} title="Bring the open reflection's changes back into its source project">
          Merge Reflection
        </button>
        <button disabled={!n || busy} onClick={del}>
          Delete
        </button>
        <span className="spacer" />
        <span className="muted small">{msg || backend.label}</span>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky p6-projects">
          <thead>
            <tr>
              <td style={{ width: 220 }}>Project ID</td>
              <td>Project Name</td>
              <td style={{ width: 110 }}>Total Activities</td>
              <td style={{ width: 120 }}>Strategic Priority</td>
              <td style={{ width: 170 }}>Project Baseline</td>
              <td style={{ width: 130 }}>Baseline Data Date</td>
              <td style={{ width: 90 }}>Status</td>
            </tr>
          </thead>
          <tbody>
            {unsaved && (
              <tr className="p6-unsaved">
                <td>
                  <span className="p6-folder" aria-hidden /> {schedule!.projectCode}
                </td>
                <td>{schedule!.projectName}</td>
                <td className="num">{schedule!.activities.length.toLocaleString()}</td>
                <td className="num">{schedule!.strategicPriority ?? 500}</td>
                <td>{schedule!.baselineInfo?.name ?? "<Current Project>"}</td>
                <td>{fmtDate(schedule!.baselineInfo?.dataDate ?? schedule!.dataDate)}</td>
                <td>
                  {onSave ? (
                    <button className="link" disabled={busy} onClick={() => run(async () => (await onSave(), await load(), "Saved to the database."))}>
                      Open, not saved – save
                    </button>
                  ) : (
                    "Open, not saved"
                  )}
                </td>
              </tr>
            )}
            {list === null ? (
              <tr>
                <td colSpan={7} className="muted">
                  Loading…
                </td>
              </tr>
            ) : !rows.length && !unsaved ? (
              <tr>
                <td colSpan={7} className="muted">
                  No projects in the database yet. Use Import XER… to add one.
                </td>
              </tr>
            ) : (
              rows
                .filter((r) => !hidden(r.key))
                .map((r) => {
                  if (r.kind === "eps")
                    return (
                      <tr key={r.key} className={`p6-eps-row ${selEps === r.key ? "on" : ""}`} onClick={() => (setSelEps(r.key), setSel([]))}>
                        <td style={{ paddingLeft: 4 + r.depth * 16 }}>
                          <button className="p6-eps-toggle" aria-label={collapsed.has(r.key) ? "Expand" : "Collapse"} onClick={(e) => (e.stopPropagation(), setCollapsed((c) => (c.has(r.key) ? new Set([...c].filter((x) => x !== r.key)) : new Set([...c, r.key]))))}>
                            {collapsed.has(r.key) ? "+" : "−"}
                          </button>{" "}
                          <span className="p6-eps-icon" aria-hidden>◆</span> {r.id}
                        </td>
                        <td>{r.name}</td>
                        <td className="num">{total(r.projectIds).toLocaleString()}</td>
                        <td />
                        <td />
                        <td />
                        <td />
                      </tr>
                    );
                  const p = byId.get(r.projectId!)!;
                  return (
                    <tr key={r.key} className={sel.includes(p.id) ? "on" : ""} onClick={(e) => click(p.id, e)} onDoubleClick={() => void run(async () => (await onOpenOne(p.id), useP6.getState().show("activities")))}>
                      <td style={{ paddingLeft: 22 + r.depth * 16 }}>
                        <span className="p6-folder" aria-hidden /> {p.code}
                      </td>
                      <td>
                        {p.name}
                        {p.reflectionOf && <span className="muted small"> (reflection of {byId.get(p.reflectionOf)?.code ?? "deleted project"})</span>}
                      </td>
                      <td className="num">{p.activities.toLocaleString()}</td>
                      <td className="num" onClick={(e) => e.stopPropagation()}>
                        <input
                          className="cell num"
                          defaultValue={p.priority}
                          aria-label={`Strategic priority of ${p.code}`}
                          onBlur={(e) => {
                            const v = Math.min(10000, Math.max(1, Math.round(Number(e.target.value) || 500)));
                            if (v !== p.priority) void run(() => saveField([p.id], (s) => ({ ...s, strategicPriority: v })));
                          }}
                        />
                      </td>
                      <td>{p.baseline}</td>
                      <td>{fmtDate(p.baselineDate)}</td>
                      <td>{openIds.has(p.id) ? "Open" : ""}</td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
        <p className="muted small" style={{ padding: 8 }}>
          Click a project, Ctrl+click or Shift+click for several, then Open: several projects open together as one network, each project a band. Double-click opens one. Select an EPS row before Add EPS… or Import XER… to put the new node or project under it.
        </p>
      </div>
    </div>
  );
}

const epsCache = new Map<string, Omit<Row, keyof ProjectSummary>>();
