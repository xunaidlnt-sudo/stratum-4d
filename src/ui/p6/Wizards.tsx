// P6's New Activity and New Resource wizards (User Preferences › Assistance).
// Each page asks for one thing; Finish creates the activity or resource with
// everything entered so far, so any page can be skipped.

import { useMemo, useState, type ReactNode } from "react";
import { standardCalendar } from "../../core/calendar";
import { newActivityDefaults, uid } from "../../core/ops";
import type { Activity, ActivityType, Assignment, Relationship, RelationshipType, Resource, ResourceType } from "../../core/types";
import { useStore } from "../store";
import { useP6 } from "./commands";
import { closeDlg, P6Dlg, SideBtn, SideGap, SideHelp } from "./P6Dlg";
import { BasePrices } from "./Prices";

function Wizard({ title, pages, onFinish, canFinish = true }: { title: string; pages: [string, ReactNode][]; onFinish: () => void; canFinish?: boolean }) {
  const [i, setI] = useState(0);
  const last = i === pages.length - 1;
  return (
    <P6Dlg
      title={title}
      width={700}
      onClose={closeDlg}
      side={
        <>
          <SideBtn kind="ok" label={last ? "Finish" : "Next >"} primary disabled={last && !canFinish} onClick={() => (last ? onFinish() : setI(i + 1))} />
          <SideBtn label="< Back" disabled={i === 0} onClick={() => setI(i - 1)} />
          {!last && <SideBtn kind="run" label="Finish" disabled={!canFinish} onClick={onFinish} />}
          <SideBtn kind="cancel" label="Cancel" onClick={closeDlg} />
          <SideGap />
          <SideHelp topic="wizards" />
        </>
      }
    >
      <div className="p6-wizard">
        <ol className="p6-wizard-steps">
          {pages.map(([t], k) => (
            <li key={t} className={k === i ? "on" : k < i ? "done" : ""}>
              <button className="link" onClick={() => setI(k)}>
                {t}
              </button>
            </li>
          ))}
        </ol>
        <div className="p6-wizard-page">
          <h3>{pages[i][0]}</h3>
          {pages[i][1]}
        </div>
      </div>
    </P6Dlg>
  );
}

const TYPES: [ActivityType, string][] = [
  ["task", "Task Dependent"],
  ["resource-dependent", "Resource Dependent"],
  ["loe", "Level of Effort"],
  ["milestone", "Start Milestone"],
  ["finish-milestone", "Finish Milestone"],
  ["wbs-summary", "WBS Summary"],
];

type Link = { id: string; type: RelationshipType; lagDays: number };

/** Pick activities for predecessors or successors. */
function LinkPicker({ acts, list, set, exclude }: { acts: Activity[]; list: Link[]; set: (l: Link[]) => void; exclude: string[] }) {
  const [q, setQ] = useState("");
  const t = q.trim().toLowerCase();
  const hits = t ? acts.filter((a) => !exclude.includes(a.id) && !list.some((l) => l.id === a.id) && `${a.code} ${a.name}`.toLowerCase().includes(t)).slice(0, 8) : [];
  const byId = new Map(acts.map((a) => [a.id, a]));
  return (
    <div className="stack">
      <input placeholder="Find activity ID or name" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((a) => (
        <button key={a.id} className="link" style={{ textAlign: "left" }} onClick={() => (set([...list, { id: a.id, type: "FS", lagDays: 0 }]), setQ(""))}>
          + {a.code} {a.name}
        </button>
      ))}
      {list.length > 0 && (
        <table className="p6-grid">
          <thead>
            <tr>
              <td>Activity ID</td>
              <td>Activity Name</td>
              <td>Relationship Type</td>
              <td>Lag (d)</td>
              <td />
            </tr>
          </thead>
          <tbody>
            {list.map((l, k) => (
              <tr key={l.id}>
                <td>{byId.get(l.id)?.code}</td>
                <td>{byId.get(l.id)?.name}</td>
                <td>
                  <select value={l.type} onChange={(e) => set(list.map((x, j) => (j === k ? { ...x, type: e.target.value as RelationshipType } : x)))}>
                    {["FS", "SS", "FF", "SF"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="cell num" type="number" value={l.lagDays} onChange={(e) => set(list.map((x, j) => (j === k ? { ...x, lagDays: Number(e.target.value) || 0 } : x)))} style={{ width: 60 }} />
                </td>
                <td>
                  <button className="link" onClick={() => set(list.filter((_, j) => j !== k))}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function NewActivityWizard() {
  const s = useStore((x) => x.schedule);
  const sel = useStore((x) => x.selectedActivity);
  const commit = useStore((x) => x.commit);
  const selected = s?.activities.find((a) => a.id === sel) ?? null;
  const def = useMemo(() => (s ? newActivityDefaults(s, selected) : null), [s, selected]);
  const [code, setCode] = useState(def?.code ?? "A1000");
  const [name, setName] = useState("");
  const [wbsId, setWbsId] = useState<string | null>(selected?.wbsId ?? s?.wbs[0]?.id ?? null);
  const [type, setType] = useState<ActivityType>(def?.type ?? "task");
  const [days, setDays] = useState(def?.durationDays ?? 5);
  const [calId, setCalId] = useState<string | null>(def?.calendarId ?? null);
  const [preds, setPreds] = useState<Link[]>(selected ? [{ id: selected.id, type: "FS", lagDays: 0 }] : []);
  const [succs, setSuccs] = useState<Link[]>([]);
  const [res, setRes] = useState<{ id: string; qty: number }[]>([]);
  if (!s || !def) return null;
  const cals = s.calendars?.length ? s.calendars : [standardCalendar()];
  const cal = cals.find((c) => c.id === calId) ?? cals[0];
  const hpd = cal.hoursPerDay || 8;
  const ms = type === "milestone" || type === "finish-milestone";
  const dup = s.activities.some((a) => a.code === code.trim());
  const wbsLabel = (id: string) => {
    const parts: string[] = [];
    let w = s.wbs.find((x) => x.id === id);
    while (w) {
      parts.unshift(w.code);
      w = w.parentId ? s.wbs.find((x) => x.id === w!.parentId) : undefined;
    }
    return parts.join(".");
  };
  const finish = () => {
    const start = s.dataDate ?? Date.now();
    const a: Activity = {
      id: uid("act"),
      code: code.trim(),
      name: name.trim() || "New Activity",
      wbsId,
      type,
      durationType: def.durationType,
      pctType: def.pctType,
      status: "not-started",
      percentComplete: 0,
      start,
      finish: start,
      baselineStart: null,
      baselineFinish: null,
      actualStart: null,
      actualFinish: null,
      totalFloatHours: null,
      originalDurationHours: ms ? 0 : days * hpd,
      remainingDurationHours: ms ? 0 : days * hpd,
      critical: false,
      calendarId: calId,
      codes: {},
    };
    const rels: Relationship[] = [
      ...preds.map((l) => ({ id: uid("rel"), predecessorId: l.id, successorId: a.id, type: l.type, lagHours: l.lagDays * hpd })),
      ...succs.map((l) => ({ id: uid("rel"), predecessorId: a.id, successorId: l.id, type: l.type, lagHours: l.lagDays * hpd })),
    ];
    const rmap = new Map((s.resources ?? []).map((r) => [r.id, r]));
    const asg: Assignment[] = res
      .filter((x) => rmap.has(x.id))
      .map((x) => {
        const price = rmap.get(x.id)!.pricePerUnit;
        return { id: uid("asg"), activityId: a.id, resourceId: x.id, budgetQty: x.qty, actualQty: 0, remainingQty: x.qty, budgetCost: x.qty * price, actualCost: 0, remainingCost: x.qty * price };
      });
    commit({ ...s, activities: [...s.activities, a], relationships: [...s.relationships, ...rels], assignments: [...(s.assignments ?? []), ...asg] }, `Add ${a.code}`, [a.id]);
    useStore.getState().setStatus(`Added ${a.code} with ${rels.length} relationship${rels.length === 1 ? "" : "s"} and ${asg.length} resource${asg.length === 1 ? "" : "s"}. Press F9 to schedule it.`);
    closeDlg();
  };
  return (
    <Wizard
      title="New Activity"
      canFinish={!!code.trim() && !dup}
      onFinish={finish}
      pages={[
        [
          "Activity ID and Name",
          <div className="grid2" key="id">
            <label>
              Activity ID
              <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
              {dup && <span className="bad small">{code} is already used.</span>}
            </label>
            <label>
              Activity Name
              <input value={name} placeholder="New Activity" onChange={(e) => setName(e.target.value)} />
            </label>
          </div>,
        ],
        [
          "WBS",
          <div className="p6-list" key="wbs" style={{ maxHeight: 300 }}>
            <div className="p6-list-body">
              {s.wbs.map((w) => (
                <button key={w.id} className={wbsId === w.id ? "on" : ""} onClick={() => setWbsId(w.id)}>
                  {wbsLabel(w.id)} {w.name}
                </button>
              ))}
              {!s.wbs.length && <div className="muted small">No WBS; the activity goes under the project.</div>}
            </div>
          </div>,
        ],
        [
          "Activity Type",
          <div className="stack" key="type">
            {TYPES.map(([k, l]) => (
              <label key={k} className="p6-check">
                <input type="radio" name="wiz-type" checked={type === k} onChange={() => setType(k)} /> {l}
              </label>
            ))}
            <span className="muted small">Resource Dependent activities follow their resources' calendars.</span>
          </div>,
        ],
        [
          "Duration and Calendar",
          <div className="grid2" key="dur">
            <label>
              Original Duration (days)
              <input type="number" min={0} disabled={ms} value={ms ? 0 : days} onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))} />
            </label>
            <label>
              Calendar
              <select value={calId ?? ""} onChange={(e) => setCalId(e.target.value || null)}>
                {cals.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>,
        ],
        ["Predecessors", <LinkPicker key="p" acts={s.activities} list={preds} set={setPreds} exclude={succs.map((x) => x.id)} />],
        ["Successors", <LinkPicker key="s" acts={s.activities} list={succs} set={setSuccs} exclude={preds.map((x) => x.id)} />],
        [
          "Resources",
          <div className="stack" key="r">
            <select
              value=""
              onChange={(e) => e.target.value && setRes([...res, { id: e.target.value, qty: (s.resources ?? []).find((r) => r.id === e.target.value)?.type === "material" ? 1 : days * hpd }])}
            >
              <option value="">Assign a resource…</option>
              {(s.resources ?? [])
                .filter((r) => !res.some((x) => x.id === r.id))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} – {r.name}
                  </option>
                ))}
            </select>
            {res.length > 0 && (
              <table className="p6-grid">
                <thead>
                  <tr>
                    <td>Resource</td>
                    <td>Budgeted Units</td>
                    <td />
                  </tr>
                </thead>
                <tbody>
                  {res.map((x, k) => {
                    const r = (s.resources ?? []).find((y) => y.id === x.id);
                    return (
                      <tr key={x.id}>
                        <td>
                          {r?.code} {r?.name}
                        </td>
                        <td>
                          <input className="cell num" type="number" min={0} value={x.qty} onChange={(e) => setRes(res.map((y, j) => (j === k ? { ...y, qty: Math.max(0, Number(e.target.value) || 0) } : y)))} style={{ width: 90 }} />{" "}
                          {r?.unit}
                        </td>
                        <td>
                          <button className="link" onClick={() => setRes(res.filter((_, j) => j !== k))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>,
        ],
        [
          "Finish",
          <div className="stack" key="f">
            <p>
              Ready to add <b>{code}</b> {name || "New Activity"}
              {wbsId ? ` under ${wbsLabel(wbsId)}` : ""}: {TYPES.find((t) => t[0] === type)?.[1]}, {ms ? "milestone" : `${days} d on ${cal.name}`}, {preds.length} predecessor{preds.length === 1 ? "" : "s"}, {succs.length} successor{succs.length === 1 ? "" : "s"}, {res.length} resource{res.length === 1 ? "" : "s"}.
            </p>
            <p className="muted small">Turn the wizard off in Edit › User Preferences › Assistance.</p>
          </div>,
        ],
      ]}
    />
  );
}

const RTYPES: [ResourceType, string][] = [
  ["labor", "Labor"],
  ["equipment", "Nonlabor"],
  ["material", "Material"],
];

export function NewResourceWizard() {
  const s = useStore((x) => x.schedule);
  const commit = useStore((x) => x.commit);
  const n = (s?.resources?.length ?? 0) + 1;
  const [r, setR] = useState<Resource>({ id: uid("rsrc"), code: `R${n}`, name: "", type: "labor", unit: "h", pricePerUnit: 0 });
  if (!s) return null;
  const put = (p: Partial<Resource>) => setR({ ...r, ...p });
  const dup = (s.resources ?? []).some((x) => x.code === r.code.trim());
  const finish = () => {
    const res = { ...r, code: r.code.trim(), name: r.name.trim() || "New Resource" };
    commit({ ...s, resources: [...(s.resources ?? []), res] }, `Add resource ${res.code}`);
    useStore.getState().setStatus(`Added resource ${res.code}.`);
    closeDlg();
    useP6.getState().show("resources");
  };
  return (
    <Wizard
      title="New Resource"
      canFinish={!!r.code.trim() && !dup}
      onFinish={finish}
      pages={[
        [
          "Resource ID and Name",
          <div className="grid2" key="id">
            <label>
              Resource ID
              <input autoFocus value={r.code} onChange={(e) => put({ code: e.target.value })} />
              {dup && <span className="bad small">{r.code} is already used.</span>}
            </label>
            <label>
              Resource Name
              <input value={r.name} placeholder="New Resource" onChange={(e) => put({ name: e.target.value })} />
            </label>
          </div>,
        ],
        [
          "Resource Type",
          <div className="stack" key="t">
            {RTYPES.map(([k, l]) => (
              <label key={k} className="p6-check">
                <input type="radio" name="wiz-rtype" checked={r.type === k} onChange={() => put({ type: k, unit: k === "material" ? (r.unit === "h" ? "unit" : r.unit) : "h" })} /> {l}
              </label>
            ))}
            {r.type === "material" && (
              <label>
                Unit of Measure
                <input value={r.unit} onChange={(e) => put({ unit: e.target.value })} style={{ width: 120 }} />
              </label>
            )}
          </div>,
        ],
        [
          "Units and Prices",
          <div className="stack" key="p">
            {r.type !== "material" && (
              <label>
                Max Units / Time (per hour; empty = no limit)
                <input type="number" min={0} step={0.5} value={r.maxUnitsPerHour ?? ""} onChange={(e) => put({ maxUnitsPerHour: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) })} style={{ width: 120 }} />
              </label>
            )}
            <BasePrices x={r} set={setR} />
          </div>,
        ],
        [
          "Calendar",
          <label key="c">
            Calendar
            <select value={r.calendarId ?? ""} onChange={(e) => put({ calendarId: e.target.value || null })}>
              <option value="">Project default</option>
              {(s.calendars ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>,
        ],
        [
          "Roles",
          <div className="stack" key="roles">
            {(s.roles ?? []).map((ro) => (
              <label key={ro.id} className="p6-check">
                <input type="checkbox" checked={!!r.roleIds?.includes(ro.id)} onChange={(e) => put({ roleIds: e.target.checked ? [...(r.roleIds ?? []), ro.id] : (r.roleIds ?? []).filter((x) => x !== ro.id) })} /> {ro.code} {ro.name}
              </label>
            ))}
            {!s.roles?.length && <span className="muted small">No roles defined (Enterprise › Roles).</span>}
          </div>,
        ],
        [
          "Resource Codes",
          <div className="grid2" key="codes">
            {(s.resourceCodeTypes ?? []).map((ct) => (
              <label key={ct.name}>
                {ct.name}
                <select value={r.codes?.[ct.name] ?? ""} onChange={(e) => put({ codes: { ...(r.codes ?? {}), [ct.name]: e.target.value } })}>
                  <option value="" />
                  {ct.values.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.value} {v.description}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {!s.resourceCodeTypes?.length && <span className="muted small">No resource codes defined (Enterprise › Resource Codes).</span>}
          </div>,
        ],
        [
          "Finish",
          <div className="stack" key="f">
            <p>
              Ready to add <b>{r.code}</b> {r.name || "New Resource"}: {RTYPES.find((t) => t[0] === r.type)?.[1]}, {r.pricePerUnit}/{r.unit}
              {r.maxUnitsPerHour ? `, max ${r.maxUnitsPerHour}/h` : ""}.
            </p>
            <p className="muted small">Turn the wizard off in Edit › User Preferences › Assistance.</p>
          </div>,
        ],
      ]}
    />
  );
}
