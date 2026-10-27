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
import { closeDlg, DetailTabs, ListHead, P6Dlg, SideArrows, SideBtn, SideGap, SideHelp } from "./P6Dlg";

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
  const [portfolio, setPortfolio] = useState("");
  const [portfolios, setPortfolios] = useState(loadPortfolios);
  useEffect(() => {
    const on = () => setPortfolios(loadPortfolios());
    window.addEventListener("stratum:portfolios", on);
    return () => window.removeEventListener("stratum:portfolios", on);
  }, []);

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
    const pf = portfolios.find((x) => x.id === portfolio);
    const items: { id: string; code: string; name: string; eps?: string[] }[] = (list ?? []).filter((p) => !pf || pf.projectIds.includes(p.id));
    emptyEps.forEach((path, i) => items.push({ id: `__eps${i}`, code: "", name: "", eps: path }));
    return epsTree(items).filter((r) => !(r.kind === "project" && r.projectId!.startsWith("__eps")));
  }, [list, emptyEps, portfolio, portfolios]);
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
        <label className="p6-drop">
          Portfolio
          <select value={portfolio} onChange={(e) => setPortfolio(e.target.value)}>
            <option value="">All Projects</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
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

// ---------------------------------------------------------------- EPS dictionary (Enterprise › EPS)

type EpsEntry = { key: string; path: string[]; depth: number; id: string; name: string; projects: number };

/** Every EPS node, from the projects in the database plus empty nodes kept on this device. */
async function readEps(): Promise<{ entries: EpsEntry[]; projects: { id: string; eps: string[] }[] }> {
  const backend = useConfig.getState().backend;
  const rows = await backend.listProjects();
  const projects = await Promise.all(rows.map(async (r) => ({ id: r.id, eps: (await backend.getProject(r.id).catch(() => null))?.project.schedule?.eps ?? [] })));
  const paths = [...projects.map((p) => p.eps), ...loadEmptyEps()];
  const map = new Map<string, EpsEntry>();
  for (const path of paths)
    for (let i = 1; i <= path.length; i++) {
      const sub = path.slice(0, i);
      const key = sub.map((x) => epsNode(x).id).join("/");
      if (!map.has(key)) map.set(key, { key, path: sub, depth: i - 1, ...epsNode(sub[i - 1]), projects: 0 });
    }
  for (const p of projects) for (let i = 1; i <= p.eps.length; i++) map.get(p.eps.slice(0, i).map((x) => epsNode(x).id).join("/"))!.projects++;
  const entries = [...map.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  return { entries, projects };
}

const keyOfPath = (p: string[]) => p.map((x) => epsNode(x).id).join("/");
const startsWith = (path: string[], prefix: string[]) => prefix.length <= path.length && keyOfPath(path.slice(0, prefix.length)) === keyOfPath(prefix);

/** Replace an EPS path prefix in every project and empty node (rename, move). */
async function rewriteEps(from: string[], to: string[]) {
  const backend = useConfig.getState().backend;
  for (const r of await backend.listProjects()) {
    const got = await backend.getProject(r.id);
    const s = got?.project.schedule;
    if (!s?.eps || !startsWith(s.eps, from)) continue;
    const eps = [...to, ...s.eps.slice(from.length)];
    const v = await backend.saveProject(r.id, { ...got!.project, schedule: { ...s, eps } }, got!.version);
    const st = useStore.getState();
    if (st.currentProjectId === r.id && st.schedule) {
      useStore.setState({ schedule: { ...st.schedule, eps } });
      st.setCurrentProject(r.id, v);
    }
  }
  saveEmptyEps(loadEmptyEps().map((p) => (startsWith(p, from) ? [...to, ...p.slice(from.length)] : p)));
}

const OBS_KEY = "stratum.epsobs.v1";
const readEpsObs = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(OBS_KEY) ?? "{}");
  } catch {
    return {};
  }
};

let epsClip: { path: string[]; cut: boolean } | null = null;

export function EpsDialog() {
  const schedule = useStore((s) => s.schedule);
  const [data, setData] = useState<{ entries: EpsEntry[] } | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; name: string } | null>(null);
  const [obs, setObs] = useState<Record<string, string>>(readEpsObs);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const reload = async () => setData(await readEps());
  useEffect(() => {
    void reload().catch((e) => setMsg((e as Error).message));
  }, []);
  const cur = data?.entries.find((e) => e.key === sel) ?? null;
  const pick = (e: EpsEntry | null) => (setSel(e?.key ?? null), setDraft(e ? { id: e.id, name: e.name } : null));
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      await reload();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const add = () => {
    const parent = cur?.path ?? [];
    const taken = new Set((data?.entries ?? []).map((e) => e.key));
    let n = 1;
    while (taken.has(keyOfPath([...parent, `EPS${n}`]))) n++;
    const path = [...parent, `EPS${n} | New EPS`];
    saveEmptyEps([...loadEmptyEps(), path]);
    void reload().then(() => pick({ key: keyOfPath(path), path, depth: path.length - 1, ...epsNode(path[path.length - 1]), projects: 0 }));
  };
  const del = () =>
    run(async () => {
      if (!cur) return;
      if (cur.projects) throw new Error(`${cur.id} holds ${cur.projects} project(s). Move them to another EPS first (Projects window › Move to).`);
      saveEmptyEps(loadEmptyEps().filter((p) => !startsWith(p, cur.path)));
      pick(null);
    });
  const saveDraft = () =>
    run(async () => {
      if (!cur || !draft) return;
      const id = draft.id.trim();
      if (!id) throw new Error("The EPS ID cannot be empty.");
      const seg = draft.name.trim() && draft.name.trim() !== id ? `${id} | ${draft.name.trim()}` : id;
      if (seg === cur.path[cur.path.length - 1]) return;
      const to = [...cur.path.slice(0, -1), seg];
      if (keyOfPath(to) !== cur.key && data?.entries.some((e) => e.key === keyOfPath(to))) throw new Error(`EPS ID ${id} is already used here.`);
      await rewriteEps(cur.path, to);
      setSel(keyOfPath(to));
    });
  const moveTo = (newParent: string[]) =>
    run(async () => {
      if (!cur) return;
      if (startsWith(newParent, cur.path)) throw new Error("An EPS node cannot move under itself.");
      const to = [...newParent, cur.path[cur.path.length - 1]];
      await rewriteEps(cur.path, to);
      setSel(keyOfPath(to));
    });
  const siblingAbove = () => {
    if (!cur || !data) return null;
    const sibs = data.entries.filter((e) => e.depth === cur.depth && keyOfPath(e.path.slice(0, -1)) === keyOfPath(cur.path.slice(0, -1)));
    const i = sibs.findIndex((e) => e.key === cur.key);
    return i > 0 ? sibs[i - 1] : null;
  };
  const obsOptions = (schedule?.obs ?? []).map((o) => o.name);
  return (
    <P6Dlg
      title="Enterprise Project Structure (EPS)"
      width={640}
      onClose={closeDlg}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={closeDlg} />
          <SideGap />
          <SideBtn kind="add" label="Add" disabled={busy} onClick={add} />
          <SideBtn kind="delete" label="Delete" disabled={!cur || busy} onClick={del} />
          <SideBtn kind="cut" label="Cut" disabled={!cur} onClick={() => cur && (epsClip = { path: cur.path, cut: true })} />
          <SideBtn kind="copy" label="Copy" disabled={!cur} onClick={() => cur && (epsClip = { path: cur.path, cut: false })} />
          <SideBtn
            kind="paste"
            label="Paste"
            disabled={busy}
            onClick={() => {
              if (!epsClip) return;
              const clip = epsClip;
              if (clip.cut) {
                epsClip = null;
                const node = data?.entries.find((e) => e.key === keyOfPath(clip.path));
                if (!node) return;
                setSel(node.key);
                void run(async () => {
                  const to = [...(cur?.path ?? []), clip.path[clip.path.length - 1]];
                  if (startsWith(cur?.path ?? [], clip.path)) throw new Error("An EPS node cannot move under itself.");
                  await rewriteEps(clip.path, to);
                  setSel(keyOfPath(to));
                });
              } else {
                // Copy pastes the node structure (not its projects) under the selection.
                const base = cur?.path ?? [];
                const copies = (data?.entries ?? []).filter((e) => startsWith(e.path, clip.path)).map((e) => [...base, ...e.path.slice(clip.path.length - 1)]);
                saveEmptyEps([...loadEmptyEps(), ...copies.map((p, i) => (i === 0 ? [...p.slice(0, -1), `${epsNode(p[p.length - 1]).id}-1 | ${epsNode(p[p.length - 1]).name}`] : p))]);
                void reload();
              }
            }}
          />
          <SideArrows left={cur && cur.depth > 0 ? () => void moveTo(cur.path.slice(0, -2)) : undefined} right={siblingAbove() ? () => void moveTo(siblingAbove()!.path) : undefined} />
          <SideGap />
          <SideHelp topic="eps" />
        </>
      }
    >
      <div>
        <ListHead>EPS</ListHead>
        <div className="p6-list2">
          <table>
            <thead>
              <tr>
                <td style={{ width: "40%" }}>EPS ID</td>
                <td>EPS Name</td>
                <td style={{ width: 70 }}>Projects</td>
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <tr>
                  <td colSpan={3} className="muted">
                    Loading…
                  </td>
                </tr>
              ) : !data.entries.length ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No EPS yet. Click Add.
                  </td>
                </tr>
              ) : (
                data.entries.map((e) => (
                  <tr key={e.key} className={sel === e.key ? "on" : ""} onClick={() => pick(e)}>
                    <td style={{ paddingLeft: 6 + e.depth * 16 }}>
                      <span className="p6-ico" aria-hidden style={{ color: "#c49a00" }}>
                        ◆
                      </span>
                      {e.id}
                    </td>
                    <td>{e.name}</td>
                    <td className="num">{e.projects}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {cur && draft && (
        <div className="p6-detail">
          <div className="p6-detail-body">
            <div className="row" style={{ gap: 10 }} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && void saveDraft()}>
              <label style={{ flex: "0 0 140px" }}>
                EPS ID
                <input value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void saveDraft()} />
              </label>
              <label style={{ flex: 1 }}>
                EPS Name
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && void saveDraft()} />
              </label>
            </div>
            <label>
              Responsible Manager
              <select
                value={obs[cur.key] ?? ""}
                onChange={(e) => {
                  const next = { ...obs, [cur.key]: e.target.value };
                  setObs(next);
                  try {
                    localStorage.setItem(OBS_KEY, JSON.stringify(next));
                  } catch {
                    /* ignore */
                  }
                }}
              >
                <option value="">Enterprise</option>
                {obsOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
      {msg && <p className="small" style={{ color: "#b42318" }}>{msg}</p>}
    </P6Dlg>
  );
}

// ---------------------------------------------------------------- Project Portfolios (Enterprise › Project Portfolios)

export interface Portfolio {
  id: string;
  name: string;
  description: string;
  projectIds: string[];
}
const PF_KEY = "stratum.portfolios.v1";
export const loadPortfolios = (): Portfolio[] => {
  try {
    return JSON.parse(localStorage.getItem(PF_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const savePortfolios = (v: Portfolio[]) => {
  try {
    localStorage.setItem(PF_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("stratum:portfolios"));
};

let pfClip: Portfolio | null = null;

export function PortfoliosDialog() {
  const backend = useConfig((c) => c.backend);
  const [list, setList] = useState<Portfolio[]>(loadPortfolios);
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  useEffect(() => {
    backend.listProjects().then(setProjects).catch(() => {});
  }, [backend]);
  const set = (v: Portfolio[]) => (setList(v), savePortfolios(v));
  const cur = list.find((p) => p.id === sel) ?? null;
  const put = (p: Portfolio) => set(list.map((x) => (x.id === p.id ? p : x)));
  const add = (from?: Portfolio) => {
    const p: Portfolio = from ? { ...structuredClone(from), id: uid("pf"), name: `${from.name} (copy)` } : { id: uid("pf"), name: "New Portfolio", description: "", projectIds: [] };
    set([...list, p]);
    setSel(p.id);
  };
  return (
    <P6Dlg
      title="Project Portfolios"
      width={760}
      onClose={closeDlg}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={closeDlg} />
          <SideGap />
          <SideBtn kind="add" label="Add" onClick={() => add()} />
          <SideBtn kind="delete" label="Delete" disabled={!cur} onClick={() => cur && window.confirm(`Delete portfolio ${cur.name}? Its projects stay in the database.`) && (set(list.filter((x) => x.id !== cur.id)), setSel(null))} />
          <SideBtn kind="cut" label="Cut" disabled={!cur} onClick={() => cur && ((pfClip = cur), set(list.filter((x) => x.id !== cur.id)), setSel(null))} />
          <SideBtn kind="copy" label="Copy" disabled={!cur} onClick={() => (pfClip = cur)} />
          <SideBtn kind="paste" label="Paste" onClick={() => pfClip && add(pfClip)} />
          <SideGap />
          <SideHelp topic="portfolios" />
        </>
      }
    >
      <div>
        <ListHead>Portfolios</ListHead>
        <div className="p6-list2" style={{ minHeight: 160, maxHeight: "32vh" }}>
          <table>
            <thead>
              <tr>
                <td>Portfolio Name</td>
                <td style={{ width: 80 }}>Projects</td>
              </tr>
            </thead>
            <tbody>
              <tr className="grp">
                <td colSpan={2}>⊟ Global Portfolios</td>
              </tr>
              {list.map((p) => (
                <tr key={p.id} className={sel === p.id ? "on" : ""} onClick={() => setSel(p.id)}>
                  <td style={{ paddingLeft: 22 }}>
                    <span className="p6-ico" aria-hidden>
                      💼
                    </span>
                    {p.name}
                  </td>
                  <td className="num">{p.projectIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {cur && (
        <DetailTabs
          key={cur.id}
          tabs={[
            [
              "General",
              <>
                <label>
                  Name <input value={cur.name} onChange={(e) => put({ ...cur, name: e.target.value })} />
                </label>
                <label>
                  Description
                  <textarea rows={4} value={cur.description} onChange={(e) => put({ ...cur, description: e.target.value })} />
                </label>
              </>,
            ],
            [
              "Projects",
              <div className="p6-list2" style={{ minHeight: 120, maxHeight: 240 }}>
                <table>
                  <thead>
                    <tr>
                      <td style={{ width: 50 }}>In</td>
                      <td>Project ID</td>
                      <td>Project Name</td>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((p) => (
                      <tr key={p.id}>
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            aria-label={`${p.code} in ${cur.name}`}
                            checked={cur.projectIds.includes(p.id)}
                            onChange={(e) => put({ ...cur, projectIds: e.target.checked ? [...cur.projectIds, p.id] : cur.projectIds.filter((x) => x !== p.id) })}
                          />
                        </td>
                        <td>{p.code}</td>
                        <td>{p.name}</td>
                      </tr>
                    ))}
                    {!projects.length && (
                      <tr>
                        <td colSpan={3} className="muted small">
                          No projects in the database yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>,
            ],
          ]}
        />
      )}
    </P6Dlg>
  );
}
