// P6 Projects window: the EPS tree of every project in the database, opening
// several projects together, and reflections.

import { useEffect, useMemo, useState } from "react";
import { useConfig } from "../../backend/config";
import type { ProjectSummary } from "../../backend/types";
import { combineSchedules, epsTree, isCombined, mergeReflection, parseEps, reflect, reflectionChanges, splitSchedule } from "../../core/multiproject";
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

export function EnterpriseProjectsWindow({ onOpenOne, onImport }: { onOpenOne: (id: string) => Promise<void>; onImport: () => void }) {
  const backend = useConfig((c) => c.backend);
  const schedule = useStore((s) => s.schedule);
  const currentId = useStore((s) => s.currentProjectId);
  const [list, setList] = useState<(ProjectSummary & { eps?: string[]; reflectionOf?: string | null })[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const rows = await backend.listProjects();
      // The EPS path lives in each project; read it once per saved version.
      const full = await Promise.all(
        rows.map(async (r) => {
          const hit = epsCache.get(`${r.id}@${r.version}`);
          if (hit) return { ...r, ...hit };
          const s = (await backend.getProject(r.id).catch(() => null))?.project.schedule;
          const info = { eps: s?.eps ?? [], reflectionOf: s?.reflectionOf?.dbId ?? null };
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

  const rows = useMemo(() => epsTree(list ?? []), [list]);
  const byId = new Map((list ?? []).map((p) => [p.id, p]));
  const openIds = new Set(isCombined(schedule) ? schedule!.projects!.map((p) => p.dbId ?? "") : currentId ? [currentId] : []);
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
      const ids = [...checked];
      if (ids.length === 1) {
        await onOpenOne(ids[0]);
        useP6.getState().show("activities");
        return;
      }
      const parts = [];
      for (const id of ids) {
        const r = await backend.getProject(id);
        if (r?.project.schedule) parts.push({ dbId: id, version: r.version, schedule: r.project.schedule });
      }
      const c = combineSchedules(parts);
      openCombined(c);
      useStore.getState().setStatus(`Opened ${parts.length} projects together: ${c.projectCode}. Press F9 to schedule them as one network; Commit saves each project back.`);
      useP6.getState().show("activities");
      return `Opened ${parts.length} projects.`;
    });
  const setEps = () =>
    run(async () => {
      const ids = [...checked];
      const first = byId.get(ids[0]);
      const text = window.prompt(`EPS for ${ids.length} project(s), top level first, separated by "/":`, (first?.eps ?? []).join(" / "));
      if (text === null) return;
      const eps = parseEps(text);
      for (const id of ids) {
        const r = await backend.getProject(id);
        if (!r?.project.schedule) continue;
        const v = await backend.saveProject(id, { ...r.project, schedule: { ...r.project.schedule, eps } }, r.version);
        if (id === currentId) {
          const st = useStore.getState();
          if (st.schedule) useStore.setState({ schedule: { ...st.schedule, eps } });
          st.setCurrentProject(id, v);
        }
      }
      await load();
      return `EPS set to ${eps.join(" / ") || "(top level)"}.`;
    });
  const createReflection = () =>
    run(async () => {
      const id = [...checked][0];
      const r = await backend.getProject(id);
      if (!r?.project.schedule) throw new Error("Project not found.");
      const s = reflect(r.project.schedule, id);
      const newId = uid("prj");
      await backend.saveProject(newId, { ...r.project, schedule: s });
      await load();
      return `Created reflection ${s.projectCode}. Open it, make your changes, then use Merge Reflection to bring them back to ${r.project.schedule.projectCode}.`;
    });
  const mergeBack = () =>
    run(async () => {
      const st = useStore.getState();
      const ref = st.schedule;
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

  const n = checked.size;
  const hidden = (key: string) => [...collapsed].some((c) => key !== c && (key.startsWith(`${c}/`) || key.startsWith(`${c}#`)));
  return (
    <div className="p6-win">
      <div className="p6-win-bar">
        <button className="primary" disabled={!n || busy} onClick={openSelected}>
          {n > 1 ? `Open ${n} projects together` : "Open"}
        </button>
        <button disabled={!n || busy} onClick={setEps}>
          Set EPS…
        </button>
        <span className="tsep" />
        <button disabled={n !== 1 || busy} onClick={createReflection} title="Copy the project to try changes without touching it">
          Create Reflection
        </button>
        <button disabled={!schedule?.reflectionOf || busy} onClick={mergeBack} title="Bring the open reflection's changes back into its source project">
          Merge Reflection
        </button>
        <span className="tsep" />
        <button onClick={onImport}>Import / Save…</button>
        <span className="spacer" />
        <span className="muted small">{msg || backend.label}</span>
      </div>
      <div className="p6-win-body">
        <table className="p6-grid sticky">
          <thead>
            <tr>
              <td style={{ width: 28 }} />
              <td>EPS / Project</td>
              <td>Data Date</td>
              <td>Saved</td>
              <td>Version</td>
              <td>Status</td>
            </tr>
          </thead>
          <tbody>
            {list === null ? (
              <tr>
                <td colSpan={6} className="muted">
                  Loading…
                </td>
              </tr>
            ) : !list.length ? (
              <tr>
                <td colSpan={6} className="muted">
                  No projects in the database yet. Open or import a schedule, then Commit (Ctrl+S) to save it here.
                </td>
              </tr>
            ) : (
              rows
                .filter((r) => !hidden(r.key))
                .map((r) => {
                  if (r.kind === "eps")
                    return (
                      <tr key={r.key} className="p6-eps-row">
                        <td />
                        <td style={{ paddingLeft: 6 + r.depth * 16 }}>
                          <button className="link" onClick={() => setCollapsed((c) => (c.has(r.key) ? new Set([...c].filter((x) => x !== r.key)) : new Set([...c, r.key])))}>
                            {collapsed.has(r.key) ? "▸" : "▾"} {r.name}
                          </button>
                        </td>
                        <td colSpan={4} />
                      </tr>
                    );
                  const p = byId.get(r.projectId!)!;
                  return (
                    <tr key={r.key} className={openIds.has(p.id) ? "on" : ""} onDoubleClick={() => void run(async () => (await onOpenOne(p.id), useP6.getState().show("activities")))}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select ${p.code}`}
                          checked={checked.has(p.id)}
                          onChange={(e) => setChecked((c) => (e.target.checked ? new Set([...c, p.id]) : new Set([...c].filter((x) => x !== p.id))))}
                        />
                      </td>
                      <td style={{ paddingLeft: 6 + r.depth * 16 }}>
                        <b>{p.code}</b> {p.name}
                        {p.reflectionOf && <span className="muted small"> (reflection of {byId.get(p.reflectionOf)?.code ?? "deleted project"})</span>}
                      </td>
                      <td>{fmtDate(p.dataDate)}</td>
                      <td>{new Date(p.updatedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="num">{p.version}</td>
                      <td>{openIds.has(p.id) ? "Open" : ""}</td>
                    </tr>
                  );
                })
            )}
          </tbody>
        </table>
        <p className="muted small" style={{ padding: 8 }}>
          Tick projects and open them together to schedule them as one network, link activities across projects and see them in one Gantt chart, each project as a band. Double-click opens one project.
        </p>
      </div>
    </div>
  );
}

const epsCache = new Map<string, { eps: string[]; reflectionOf: string | null }>();
