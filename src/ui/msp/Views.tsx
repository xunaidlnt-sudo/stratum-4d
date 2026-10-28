// MS Project views besides the Gantt Chart: Resource Sheet (editable), Task
// Usage and Resource Usage (timephased work), Network Diagram, Calendar and
// Team Planner (drag a task to another resource), plus the Resource
// Information dialog and the Level commands.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MONTHS, WEEKDAYS, monthShort } from "../../core/dates";
import { levelResources } from "../../core/level";
import { dailyWork, formatMspDuration, overallocations, projectHpd } from "../../core/msp";
import { uid } from "../../core/ops";
import { buildGanttRows } from "../../core/wbs";
import type { Activity, Resource, ResourceType } from "../../core/types";
import { fmtDate, useStore } from "../store";
import { commitEdit } from "./actions";
import { MspDlg, Row } from "./MspDlg";
import { mspDateText } from "./sheet";
import { useMsp } from "./state";

const DAY = 86_400_000;
const ROW = 21;
const st = () => useStore.getState();
const isMs = (a: Activity) => a.type === "milestone" || a.type === "finish-milestone";

// ---------------------------------------------------------------- Level commands

export function levelAll() {
  const s = st().schedule;
  if (!s) return;
  const r = levelResources(s);
  commitEdit(r.schedule, "Level All");
  st().setStatus(`Levelled. Project finish ${fmtDate(r.projectFinish)}.${r.warnings.length ? ` ${r.warnings[0]}` : ""}`);
}
export function clearLeveling() {
  const s = st().schedule;
  if (!s) return;
  commitEdit({ ...s, activities: s.activities.map((a) => (a.leveledDelayHours ? { ...a, leveledDelayHours: null } : a)) }, "Clear Leveling");
  // Recalculating returns every task to its logic-driven dates.
  st().setStatus("Leveling cleared. The project is recalculated from its logic.");
}
export function nextOverallocation() {
  const s = st().schedule;
  if (!s) return;
  const daily = dailyWork(s);
  const over = overallocations(s, daily);
  const sel = s.activities.find((a) => a.id === st().selectedActivity);
  const after = sel?.start ?? -Infinity;
  let best: { day: number; rid: string } | null = null;
  for (const [rid, days] of over) {
    const d = days.find((x) => x > after + DAY - 1) ?? null;
    if (d !== null && (!best || d < best.day)) best = { day: d, rid };
  }
  if (!best) return st().setStatus(over.size ? "No more overallocations after the selected task." : "There are no overallocated resources.");
  const asg = (s.assignments ?? []).find((x) => x.resourceId === best!.rid && daily.get(x.id)?.has(best!.day));
  const r = (s.resources ?? []).find((x) => x.id === best!.rid);
  if (asg) {
    st().selectActivity(asg.activityId);
    window.dispatchEvent(new CustomEvent("stratum:gantt", { detail: "scroll-to-selected" }));
  }
  st().setStatus(`${r?.name ?? "A resource"} is overallocated on ${fmtDate(best.day)}.`);
}

// ---------------------------------------------------------------- Resource Sheet

type ResCol = { key: string; label: string; width: number; align?: "right"; text: (r: Resource, c: { cur: string; cals: Map<string, string>; over: Set<string> }) => string; edit?: (r: Resource, v: string) => Partial<Resource> | null };
const money = (v: number | undefined, cur: string) => `${cur}${(v ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: string) => {
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const RES_COLS: ResCol[] = [
  { key: "name", label: "Resource Name", width: 200, text: (r) => r.name, edit: (_, v) => (v.trim() ? { name: v.trim() } : null) },
  {
    key: "type",
    label: "Type",
    width: 74,
    text: (r) => (r.type === "material" ? "Material" : "Work"),
    edit: (_, v) => ({ type: (/^m/i.test(v) ? "material" : "labor") as ResourceType, unit: /^m/i.test(v) ? "unit" : "h" }),
  },
  { key: "label", label: "Material Label", width: 90, text: (r) => (r.type === "material" ? r.unit : ""), edit: (r, v) => (r.type === "material" ? { unit: v.trim() || "unit" } : null) },
  { key: "initials", label: "Initials", width: 80, text: (r) => r.code, edit: (_, v) => (v.trim() ? { code: v.trim() } : null) },
  { key: "group", label: "Group", width: 100, text: (r) => r.group ?? "", edit: (_, v) => ({ group: v.trim() || undefined }) },
  {
    key: "max",
    label: "Max.",
    width: 64,
    align: "right",
    text: (r) => (r.type === "material" ? "" : `${Math.round((r.maxUnitsPerHour ?? 1) * 100)}%`),
    edit: (r, v) => (r.type === "material" || num(v) === null ? null : { maxUnitsPerHour: num(v)! / 100 }),
  },
  { key: "std", label: "Std. Rate", width: 96, align: "right", text: (r, c) => `${money(r.pricePerUnit, c.cur)}${r.type === "material" ? "" : "/hr"}`, edit: (_, v) => (num(v) === null ? null : { pricePerUnit: num(v)! }) },
  { key: "ovt", label: "Ovt. Rate", width: 96, align: "right", text: (r, c) => (r.type === "material" ? "" : `${money(r.overtimeRate, c.cur)}/hr`), edit: (_, v) => (num(v) === null ? null : { overtimeRate: num(v)! }) },
  { key: "cpu", label: "Cost/Use", width: 84, align: "right", text: (r, c) => money(r.costPerUse, c.cur), edit: (_, v) => (num(v) === null ? null : { costPerUse: num(v)! }) },
  {
    key: "accrue",
    label: "Accrue At",
    width: 80,
    text: (r) => (r.accrueAt === "start" ? "Start" : r.accrueAt === "end" ? "End" : "Prorated"),
    edit: (_, v) => ({ accrueAt: /^s/i.test(v) ? "start" : /^e/i.test(v) ? "end" : "prorated" }),
  },
  { key: "cal", label: "Base Calendar", width: 120, text: (r, c) => (r.calendarId ? (c.cals.get(r.calendarId) ?? "") : "Standard") },
  { key: "code", label: "Code", width: 80, text: (r) => (r.code !== r.name ? r.code : "") },
];

export function ResourceSheet() {
  const s = useStore((x) => x.schedule)!;
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ id: string | null; col: string; value: string } | null>(null);
  const over = useMemo(() => new Set(overallocations(s).keys()), [s]);
  const ctx = { cur: s.projectSettings?.currency ?? "", cals: new Map((s.calendars ?? []).map((c) => [c.id, c.name])), over };
  const res = s.resources ?? [];
  useEffect(() => useMsp.getState().set({ selRes: sel }), [sel]);
  const put = (id: string | null, col: ResCol, v: string) => {
    setEdit(null);
    if (id === null) {
      if (col.key !== "name" || !v.trim()) return;
      const r: Resource = { id: uid("res"), code: v.trim().slice(0, 3).toUpperCase(), name: v.trim(), type: "labor", unit: "h", pricePerUnit: 0, maxUnitsPerHour: 1 };
      commitEdit({ ...s, resources: [...res, r] }, "Add resource");
      return setSel(r.id);
    }
    const r = res.find((x) => x.id === id)!;
    if (col.text(r, ctx) === v) return;
    const patch = col.edit?.(r, v);
    if (!patch) return st().setStatus(`"${v}" is not a valid ${col.label}.`);
    commitEdit({ ...s, resources: res.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, `Edit ${col.label}`);
  };
  const del = () => {
    if (!sel) return;
    const n = (s.assignments ?? []).filter((x) => x.resourceId === sel).length;
    if (n && !confirm(`This resource has ${n} assignment(s). Delete it and its assignments?`)) return;
    commitEdit({ ...s, resources: res.filter((x) => x.id !== sel), assignments: (s.assignments ?? []).filter((x) => x.resourceId !== sel) }, "Delete resource");
    setSel(null);
  };
  const w = RES_COLS.reduce((t, c) => t + c.width, 0) + 64;
  const cell = (r: Resource | null, c: ResCol, i: number): ReactNode => {
    if (edit && edit.id === (r?.id ?? null) && edit.col === c.key && (r || i === res.length)) {
      if (c.key === "type" || c.key === "accrue")
        return (
          <select autoFocus value={edit.value} onChange={(e) => put(r?.id ?? null, c, e.target.value)} onBlur={() => setEdit(null)}>
            {(c.key === "type" ? ["Work", "Material"] : ["Start", "Prorated", "End"]).map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        );
      return <input autoFocus value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} onBlur={() => put(r?.id ?? null, c, edit.value)} onKeyDown={(e) => (e.key === "Enter" ? put(r?.id ?? null, c, edit.value) : e.key === "Escape" ? setEdit(null) : null)} />;
    }
    return r ? c.text(r, ctx) : "";
  };
  return (
    <div className="msp-rs" tabIndex={0} onKeyDown={(e) => !edit && e.key === "Delete" && (e.stopPropagation(), del())}>
      <div style={{ width: w }}>
        <div className="mspg-head static" style={{ width: w }}>
          <span className="mspg-hcell" style={{ width: 38 }} />
          <span className="mspg-hcell" style={{ width: 26 }}>
            ⓘ
          </span>
          {RES_COLS.map((c) => (
            <span key={c.key} className="mspg-hcell" style={{ width: c.width, textAlign: c.align }}>
              {c.label}
            </span>
          ))}
        </div>
        {[...res, null, null, null].map((r, i) => (
          <div key={r?.id ?? `blank${i}`} className={`mspg-row static ${r && sel === r.id ? "sel" : ""} ${r && over.has(r.id) ? "over" : ""}`} onMouseDown={() => setSel(r?.id ?? null)} onDoubleClick={(e) => r && !(e.target as HTMLElement).closest("input,select") && useMsp.getState().open("resourceInfo")}>
            <span className="mspg-cell idcell" style={{ width: 38, textAlign: "right" }}>
              {r ? i + 1 : ""}
            </span>
            <span className="mspg-cell" style={{ width: 26, textAlign: "center" }}>
              {r && over.has(r.id) ? (
                <span className="msp-ind bad" title="This resource should be leveled based on a Day by Day setting.">
                  ◆
                </span>
              ) : (
                ""
              )}
            </span>
            {RES_COLS.map((c) => (
              <span key={c.key} className="mspg-cell" style={{ width: c.width, textAlign: c.align }} onDoubleClick={(e) => (c.edit || (!r && c.key === "name")) && (e.stopPropagation(), setEdit({ id: r?.id ?? null, col: c.key, value: r ? c.text(r, ctx).replace(/\/hr$/, "") : "" }))}>
                {cell(r, c, i)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResourceInfoDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const id = useMsp((m) => m.selRes);
  const r0 = (s.resources ?? []).find((r) => r.id === id);
  const [tab, setTab] = useState("general");
  const [r, setR] = useState<Resource | null>(r0 ? { ...r0 } : null);
  if (!r)
    return (
      <MspDlg title="Resource Information" onClose={onClose}>
        <p>Select a resource in the Resource Sheet first.</p>
      </MspDlg>
    );
  const ok = () => {
    commitEdit({ ...s, resources: (s.resources ?? []).map((x) => (x.id === r.id ? r : x)) }, "Resource Information");
    onClose();
  };
  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return (
    <MspDlg title="Resource Information" width={600} onClose={onClose} onOk={ok} tabs={[["general", "General"], ["costs", "Costs"], ["notes", "Notes"]]} tab={tab} onTab={setTab}>
      {tab === "general" && (
        <div className="msp-grid2">
          <Row label="Resource name:" wide>
            <input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
          </Row>
          <Row label="Initials:">
            <input value={r.code} onChange={(e) => setR({ ...r, code: e.target.value })} />
          </Row>
          <Row label="Email:">
            <input value={r.email ?? ""} onChange={(e) => setR({ ...r, email: e.target.value || undefined })} />
          </Row>
          <Row label="Group:">
            <input value={r.group ?? ""} onChange={(e) => setR({ ...r, group: e.target.value || undefined })} />
          </Row>
          <Row label="Type:">
            <select value={r.type === "material" ? "material" : "work"} onChange={(e) => setR({ ...r, type: e.target.value === "material" ? "material" : "labor", unit: e.target.value === "material" ? r.unit === "h" ? "unit" : r.unit : "h" })}>
              <option value="work">Work</option>
              <option value="material">Material</option>
            </select>
          </Row>
          <Row label="Material label:">
            <input value={r.type === "material" ? r.unit : ""} disabled={r.type !== "material"} onChange={(e) => setR({ ...r, unit: e.target.value })} />
          </Row>
          <Row label="Max. units (%):">
            <input value={Math.round((r.maxUnitsPerHour ?? 1) * 100)} disabled={r.type === "material"} onChange={(e) => setR({ ...r, maxUnitsPerHour: n(e.target.value) / 100 })} />
          </Row>
          <Row label="Base calendar:">
            <select value={r.calendarId ?? ""} onChange={(e) => setR({ ...r, calendarId: e.target.value || null })}>
              <option value="">(Project calendar)</option>
              {(s.calendars ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Row>
        </div>
      )}
      {tab === "costs" && (
        <div className="msp-grid2">
          <Row label="Standard rate:">
            <input value={r.pricePerUnit} onChange={(e) => setR({ ...r, pricePerUnit: n(e.target.value) })} />
          </Row>
          <Row label="Overtime rate:">
            <input value={r.overtimeRate ?? 0} onChange={(e) => setR({ ...r, overtimeRate: n(e.target.value) })} />
          </Row>
          <Row label="Per use cost:">
            <input value={r.costPerUse ?? 0} onChange={(e) => setR({ ...r, costPerUse: n(e.target.value) })} />
          </Row>
          <Row label="Cost accrual:">
            <select value={r.accrueAt ?? "prorated"} onChange={(e) => setR({ ...r, accrueAt: e.target.value as Resource["accrueAt"] })}>
              <option value="start">Start</option>
              <option value="prorated">Prorated</option>
              <option value="end">End</option>
            </select>
          </Row>
          {(r.rates ?? []).length > 0 && <p className="msp-note wide">This resource also has {r.rates!.length} rate change(s) from P6; they still apply.</p>}
        </div>
      )}
      {tab === "notes" && <p className="muted">Resource notes are kept in P6 resource details. Use Group and Email here for MS Project.</p>}
    </MspDlg>
  );
}

// ---------------------------------------------------------------- timephased grids

interface UsageRow {
  key: string;
  depth: number;
  label: string;
  kind: "summary" | "task" | "assignment" | "resource";
  total: number;
  days: Map<number, number>;
  activityId?: string;
  overDays?: Set<number>;
  sub?: string;
}

function buckets(from: number, to: number, unit: "day" | "week" | "month"): [number, number, string][] {
  const out: [number, number, string][] = [];
  if (unit === "day") for (let t = from; t < to; t += DAY) out.push([t, t + DAY, `${WEEKDAYS[new Date(t).getUTCDay()][0]} ${new Date(t).getUTCDate()}`]);
  else if (unit === "week") {
    const d0 = new Date(from);
    for (let t = from - ((d0.getUTCDay() + 6) % 7) * DAY; t < to; t += 7 * DAY) out.push([t, t + 7 * DAY, `${String(new Date(t).getUTCDate()).padStart(2, "0")} ${monthShort(new Date(t))} '${String(new Date(t).getUTCFullYear()).slice(2)}`]);
  } else {
    const d0 = new Date(from);
    for (let m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), 1); m < to; ) {
      const n = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1);
      out.push([m, n, `${monthShort(new Date(m))} '${String(new Date(m).getUTCFullYear()).slice(2)}`]);
      m = n;
    }
  }
  return out;
}

function UsageGrid({ rows, title, unitOf }: { rows: UsageRow[]; title: string; unitOf: (r: UsageRow) => string }) {
  const px = useMsp((m) => m.pxPerDay);
  const selected = useStore((x) => x.selectedActivity);
  const s = useStore((x) => x.schedule)!;
  const unit: "day" | "week" | "month" = px >= 14 ? "day" : px >= 3 ? "week" : "month";
  const colW = unit === "day" ? 46 : unit === "week" ? 70 : 76;
  const span = useMemo(() => {
    let a = Infinity;
    let b = -Infinity;
    for (const r of rows) for (const d of r.days.keys()) (a = Math.min(a, d)), (b = Math.max(b, d));
    if (!Number.isFinite(a)) a = b = s.dataDate ?? Date.now();
    return { from: a - 7 * DAY, to: b + 14 * DAY };
  }, [rows, s.dataDate]);
  const cols = useMemo(() => buckets(span.from, span.to, unit), [span, unit]);
  const ref = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ top: 0, left: 0, h: 600, w: 1200 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp((v) => ({ ...v, h: el.clientHeight, w: el.clientWidth })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const LEFT = 360;
  const first = Math.max(0, Math.floor(vp.top / ROW) - 5);
  const last = Math.min(rows.length, Math.ceil((vp.top + vp.h) / ROW) + 5);
  const c0 = Math.max(0, Math.floor((vp.left - LEFT) / colW) - 2);
  const c1 = Math.min(cols.length, Math.ceil((vp.left + vp.w) / colW) + 2);
  const sumIn = (r: UsageRow, a: number, b: number) => {
    let t = 0;
    for (const [d, v] of r.days) if (d >= a && d < b) t += v;
    return t;
  };
  const fmt = (v: number) => (v ? `${Math.round(v * 10) / 10}h` : "");
  return (
    <div className="msp-usage" ref={ref} onScroll={(e) => setVp({ ...vp, top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}>
      <div style={{ width: LEFT + cols.length * colW + 80, height: 40 + rows.length * ROW, position: "relative" }}>
        <div className="usage-head" style={{ width: LEFT + cols.length * colW + 80 }}>
          <span className="usage-left" style={{ width: LEFT }}>
            <b style={{ width: 210 }}>{title}</b>
            <b style={{ width: 80 }}>Work</b>
            <b style={{ width: 70 }}>Details</b>
          </span>
          {cols.slice(c0, c1).map(([a, , l], k) => (
            <span key={a} className="usage-col" style={{ left: LEFT + (c0 + k) * colW, width: colW }}>
              {l}
            </span>
          ))}
        </div>
        {rows.slice(first, last).map((r, k) => {
          const i = first + k;
          return (
            <div key={r.key} className={`usage-row ${r.kind} ${r.activityId && r.activityId === selected && r.kind === "task" ? "sel" : ""}`} style={{ top: 40 + i * ROW }} onMouseDown={() => r.activityId && st().selectActivity(r.activityId)}>
              <span className="usage-left" style={{ width: LEFT }}>
                <span style={{ width: 210, paddingLeft: 4 + r.depth * 14 }} title={r.label}>
                  {r.label}
                </span>
                <span style={{ width: 80, textAlign: "right" }}>{`${Math.round(r.total * 100) / 100} ${unitOf(r)}`}</span>
                <span style={{ width: 70 }}>Work</span>
              </span>
              {cols.slice(c0, c1).map(([a, b], j) => {
                const v = sumIn(r, a, b);
                const over = r.overDays && [...r.overDays].some((d) => d >= a && d < b);
                return (
                  <span key={a} className={`usage-cell ${over ? "over" : ""}`} style={{ left: LEFT + (c0 + j) * colW, width: colW }}>
                    {fmt(v)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TaskUsage() {
  const s = useStore((x) => x.schedule)!;
  const collapsed = useStore((x) => x.collapsedWbs);
  const rows = useMemo(() => {
    const daily = dailyWork(s);
    const res = new Map((s.resources ?? []).map((r) => [r.id, r]));
    const byAct = new Map<string, typeof s.assignments>();
    for (const x of s.assignments ?? []) (byAct.get(x.activityId) ?? byAct.set(x.activityId, []).get(x.activityId)!).push(x);
    const out: UsageRow[] = [];
    const stack: UsageRow[] = [];
    const add = (target: UsageRow, days: Map<number, number>, total: number) => {
      target.total += total;
      for (const [d, v] of days) target.days.set(d, (target.days.get(d) ?? 0) + v);
    };
    for (const g of buildGanttRows(s, "current", collapsed)) {
      while (stack.length && stack[stack.length - 1].depth >= g.depth) stack.pop();
      if (g.kind === "wbs") {
        const r: UsageRow = { key: g.id, depth: g.depth, label: g.label.replace(/^\S+\s/, ""), kind: "summary", total: 0, days: new Map() };
        out.push(r);
        stack.push(r);
        continue;
      }
      const a = g.activity;
      const t: UsageRow = { key: a.id, depth: g.depth, label: a.name, kind: "task", total: 0, days: new Map(), activityId: a.id };
      out.push(t);
      for (const x of byAct.get(a.id) ?? []) {
        const r = res.get(x.resourceId);
        if (!r || r.type === "material") continue;
        const days = daily.get(x.id) ?? new Map();
        const total = x.actualQty + x.remainingQty || x.budgetQty;
        out.push({ key: x.id, depth: g.depth + 1, label: r.name, kind: "assignment", total, days, activityId: a.id });
        add(t, days, total);
      }
      for (const p of stack) add(p, t.days, t.total);
    }
    return out;
  }, [s, collapsed]);
  return <UsageGrid rows={rows} title="Task Name" unitOf={() => "hrs"} />;
}

export function ResourceUsageView() {
  const s = useStore((x) => x.schedule)!;
  const rows = useMemo(() => {
    const daily = dailyWork(s);
    const over = overallocations(s, daily);
    const acts = new Map(s.activities.map((a) => [a.id, a]));
    const out: UsageRow[] = [];
    for (const r of s.resources ?? []) {
      const mine = (s.assignments ?? []).filter((x) => x.resourceId === r.id);
      const head: UsageRow = { key: r.id, depth: 0, label: r.name, kind: "resource", total: 0, days: new Map(), overDays: new Set(over.get(r.id) ?? []), sub: r.type === "material" ? r.unit : "hrs" };
      out.push(head);
      for (const x of mine) {
        const days = daily.get(x.id) ?? new Map();
        const total = x.actualQty + x.remainingQty || x.budgetQty;
        head.total += total;
        for (const [d, v] of days) head.days.set(d, (head.days.get(d) ?? 0) + v);
        out.push({ key: x.id, depth: 1, label: acts.get(x.activityId)?.name ?? "", kind: "assignment", total, days, activityId: x.activityId, sub: head.sub });
      }
    }
    return out;
  }, [s]);
  if (!(s.resources ?? []).length) return <div className="empty">No resources yet. Add them in the Resource Sheet.</div>;
  return <UsageGrid rows={rows} title="Resource Name" unitOf={(r) => r.sub ?? "hrs"} />;
}

// ---------------------------------------------------------------- Network Diagram

const BW = 190;
const BH = 84;
const GX = 60;
const GY = 26;

export function NetworkDiagram() {
  const s = useStore((x) => x.schedule)!;
  const selected = useStore((x) => x.selectedActivity);
  const hpd = projectHpd(s);
  const layout = useMemo(() => {
    const acts = s.activities.filter((a) => a.type !== "wbs-summary" && !a.inactive);
    const ids = new Set(acts.map((a) => a.id));
    const preds = new Map<string, string[]>();
    for (const r of s.relationships) if (ids.has(r.predecessorId) && ids.has(r.successorId)) (preds.get(r.successorId) ?? preds.set(r.successorId, []).get(r.successorId)!).push(r.predecessorId);
    // Column = longest chain of predecessors (loops broken by visit order).
    const col = new Map<string, number>();
    const visiting = new Set<string>();
    const depth = (id: string): number => {
      if (col.has(id)) return col.get(id)!;
      if (visiting.has(id)) return 0;
      visiting.add(id);
      let d = 0;
      for (const p of preds.get(id) ?? []) d = Math.max(d, depth(p) + 1);
      visiting.delete(id);
      col.set(id, d);
      return d;
    };
    const sorted = [...acts].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
    for (const a of sorted) depth(a.id);
    const rowsInCol = new Map<number, number>();
    const pos = new Map<string, { x: number; y: number; a: Activity }>();
    for (const a of sorted) {
      const c = col.get(a.id)!;
      const r = rowsInCol.get(c) ?? 0;
      rowsInCol.set(c, r + 1);
      pos.set(a.id, { x: 20 + c * (BW + GX), y: 20 + r * (BH + GY), a });
    }
    const w = Math.max(0, ...[...pos.values()].map((p) => p.x)) + BW + 40;
    const h = Math.max(0, ...[...pos.values()].map((p) => p.y)) + BH + 40;
    return { pos, w, h };
  }, [s]);
  const ref = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ top: 0, left: 0, w: 1400, h: 800 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp((v) => ({ ...v, w: el.clientWidth, h: el.clientHeight })));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Scroll to the selected task when it changes elsewhere.
  useEffect(() => {
    const p = selected ? layout.pos.get(selected) : null;
    const el = ref.current;
    if (!p || !el) return;
    if (p.x < el.scrollLeft || p.x + BW > el.scrollLeft + el.clientWidth || p.y < el.scrollTop || p.y + BH > el.scrollTop + el.clientHeight) el.scrollTo({ left: Math.max(0, p.x - 80), top: Math.max(0, p.y - 80) });
  }, [selected, layout]);
  const inView = (x: number, y: number) => x + BW >= vp.left - 200 && x <= vp.left + vp.w + 200 && y + BH >= vp.top - 200 && y <= vp.top + vp.h + 200;
  const boxes = [...layout.pos.values()].filter((p) => inView(p.x, p.y));
  const shown = new Set(boxes.map((b) => b.a.id));
  const lines = s.relationships.filter((r) => shown.has(r.predecessorId) || shown.has(r.successorId));
  const resNames = useMemo(() => {
    const m = new Map<string, string[]>();
    const res = new Map((s.resources ?? []).map((r) => [r.id, r.name]));
    for (const x of s.assignments ?? []) (m.get(x.activityId) ?? m.set(x.activityId, []).get(x.activityId)!).push(res.get(x.resourceId) ?? "");
    return m;
  }, [s]);
  const ids = useMemo(() => {
    const m = new Map<string, number>();
    buildGanttRows(s, "current").forEach((r, i) => m.set(r.id, i + 1));
    return m;
  }, [s]);
  return (
    <div className="msp-net" ref={ref} onScroll={(e) => setVp({ ...vp, top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}>
      <div style={{ width: layout.w, height: layout.h, position: "relative" }}>
        <svg className="net-lines" width={layout.w} height={layout.h}>
          <defs>
            <marker id="net-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L6,3 L0,6 z" fill="context-stroke" />
            </marker>
          </defs>
          {lines.map((r) => {
            const p = layout.pos.get(r.predecessorId);
            const q = layout.pos.get(r.successorId);
            if (!p || !q) return null;
            const x1 = p.x + BW;
            const y1 = p.y + BH / 2;
            const x2 = q.x;
            const y2 = q.y + BH / 2;
            const mx = x2 > x1 ? x1 + Math.min(GX / 2, (x2 - x1) / 2) : x1 + GX / 2;
            const d = x2 > x1 ? `M${x1},${y1} H${mx} V${y2} H${x2}` : `M${x1},${y1} H${mx} V${Math.max(p.y, q.y) + BH + GY / 2} H${x2 - 12} V${y2} H${x2}`;
            return <path key={r.id} d={d} className={p.a.critical && q.a.critical ? "crit" : ""} markerEnd="url(#net-arrow)" />;
          })}
        </svg>
        {boxes.map(({ x, y, a }) => (
          <div
            key={a.id}
            className={`net-box ${a.critical ? "crit" : ""} ${a.status} ${isMs(a) ? "ms" : ""} ${selected === a.id ? "sel" : ""}`}
            style={{ left: x, top: y, width: BW, height: BH }}
            onMouseDown={() => st().selectActivity(a.id)}
            onDoubleClick={() => useMsp.getState().open("taskInfo")}
            title={a.name}
          >
            <div className="nb-name">{a.name}</div>
            <div className="nb-grid">
              <span>Start: {mspDateText(a.start)}</span>
              <span>ID: {ids.get(a.id) ?? ""}</span>
              <span>Finish: {mspDateText(a.finish)}</span>
              <span>Dur: {formatMspDuration(isMs(a) ? 0 : a.originalDurationHours, hpd)}</span>
              <span className="nb-res">Res: {(resNames.get(a.id) ?? []).join(", ")}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Calendar

export function CalendarView() {
  const s = useStore((x) => x.schedule)!;
  const selected = useStore((x) => x.selectedActivity);
  const start = s.dataDate ?? Math.min(...s.activities.map((a) => a.start ?? Infinity));
  const [month, setMonth] = useState(() => {
    const d = new Date(Number.isFinite(start) ? start : Date.now());
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  });
  const m = new Date(month);
  const first = month - new Date(month).getUTCDay() * DAY;
  const weeks = Array.from({ length: 6 }, (_, w) => first + w * 7 * DAY);
  const acts = useMemo(() => s.activities.filter((a) => a.type !== "wbs-summary" && a.start !== null && a.finish !== null && !a.inactive), [s]);
  const MAX = 5;
  return (
    <div className="msp-cal">
      <div className="cal-nav">
        <button onClick={() => setMonth(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1))} aria-label="Previous month">
          ◀
        </button>
        <button onClick={() => setMonth(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))} aria-label="Next month">
          ▶
        </button>
        <b>
          {MONTHS[m.getUTCMonth()]} {m.getUTCFullYear()}
        </b>
      </div>
      <div className="cal-head">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="cal-weeks">
        {weeks.map((w) => {
          const inWeek = acts.filter((a) => a.start! < w + 7 * DAY && a.finish! >= w).sort((a, b) => a.start! - b.start! || b.finish! - a.finish!);
          return (
            <div key={w} className="cal-week">
              {Array.from({ length: 7 }, (_, d) => (
                <span key={d} className={`cal-day ${new Date(w + d * DAY).getUTCMonth() !== m.getUTCMonth() ? "out" : ""}`} style={{ left: `${(d / 7) * 100}%` }}>
                  {new Date(w + d * DAY).getUTCDate()}
                </span>
              ))}
              {inWeek.slice(0, MAX).map((a, i) => {
                const s0 = Math.max(0, Math.floor((a.start! - w) / DAY));
                const s1 = Math.min(7, Math.ceil((a.finish! - w) / DAY));
                return (
                  <button key={a.id} className={`cal-bar ${a.critical ? "crit" : ""} ${isMs(a) ? "ms" : ""} ${selected === a.id ? "sel" : ""}`} style={{ left: `${(s0 / 7) * 100}%`, width: `${(Math.max(1, s1 - s0) / 7) * 100}%`, top: 20 + i * 18 }} onClick={() => st().selectActivity(a.id)} onDoubleClick={() => useMsp.getState().open("taskInfo")} title={`${a.name}\n${mspDateText(a.start)} – ${mspDateText(a.finish)}`}>
                    {isMs(a) ? "◆ " : ""}
                    {a.name}
                  </button>
                );
              })}
              {inWeek.length > MAX && <span className="cal-more">+{inWeek.length - MAX} more tasks</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Team Planner

export function TeamPlanner() {
  const s = useStore((x) => x.schedule)!;
  const selected = useStore((x) => x.selectedActivity);
  const px = Math.max(3, useMsp((m) => m.pxPerDay));
  const daily = useMemo(() => dailyWork(s), [s]);
  const over = useMemo(() => overallocations(s, daily), [s, daily]);
  const res = (s.resources ?? []).filter((r) => r.type !== "material");
  const acts = useMemo(() => new Map(s.activities.map((a) => [a.id, a])), [s]);
  const byRes = useMemo(() => {
    const m = new Map<string, { asgId: string; a: Activity }[]>();
    for (const x of s.assignments ?? []) {
      const a = acts.get(x.activityId);
      if (a && a.start !== null && a.finish !== null) (m.get(x.resourceId) ?? m.set(x.resourceId, []).get(x.resourceId)!).push({ asgId: x.id, a });
    }
    return m;
  }, [s, acts]);
  const assigned = new Set((s.assignments ?? []).map((x) => x.activityId));
  const unassigned = s.activities.filter((a) => !assigned.has(a.id) && a.type !== "wbs-summary" && !isMs(a) && a.status !== "complete" && a.start !== null && a.finish !== null).sort((p, q) => p.start! - q.start!).slice(0, 300);
  const from = useMemo(() => {
    const t = Math.min(...s.activities.map((a) => a.start ?? Infinity));
    const d = new Date(Number.isFinite(t) ? t : Date.now());
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }, [s]);
  const to = Math.max(...s.activities.map((a) => a.finish ?? -Infinity), from + 60 * DAY) + 30 * DAY;
  const x = (t: number) => ((t - from) / DAY) * px;
  const months = buckets(from, to, "month");
  const H = 44;
  const LEFT = 200;
  const drop = (rid: string | null, e: React.DragEvent) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const [asgId, actId] = data.split("|");
    if (!rid) return;
    const r = res.find((q) => q.id === rid)!;
    if (asgId) {
      const asg = (s.assignments ?? []).find((q) => q.id === asgId);
      if (!asg || asg.resourceId === rid) return;
      commitEdit({ ...s, assignments: (s.assignments ?? []).map((q) => (q.id === asgId ? { ...q, resourceId: rid, budgetCost: q.budgetQty * r.pricePerUnit, remainingCost: q.remainingQty * r.pricePerUnit } : q)) }, `Reassign to ${r.name}`);
    } else {
      const a = acts.get(actId);
      if (!a) return;
      const qty = isMs(a) ? 0 : (a.originalDurationHours ?? 0);
      commitEdit({ ...s, assignments: [...(s.assignments ?? []), { id: uid("asg"), activityId: a.id, resourceId: rid, units: 1, budgetQty: qty, actualQty: 0, remainingQty: qty, budgetCost: qty * r.pricePerUnit, actualCost: 0, remainingCost: qty * r.pricePerUnit }] }, `Assign to ${r.name}`);
    }
    st().setStatus(`Task assigned to ${r.name}.`);
  };
  const block = (a: Activity, asgId: string | null, lane: number) => (
    <div
      key={`${asgId ?? a.id}`}
      className={`tp-task ${a.critical ? "crit" : ""} ${a.status} ${selected === a.id ? "sel" : ""}`}
      style={{ left: LEFT + x(a.start!), width: Math.max(4, x(a.finish!) - x(a.start!)), top: 4 + lane * 18 }}
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `${asgId ?? ""}|${a.id}`)}
      onClick={() => st().selectActivity(a.id)}
      onDoubleClick={() => useMsp.getState().open("taskInfo")}
      title={`${a.name}\n${mspDateText(a.start)} – ${mspDateText(a.finish)}`}
    >
      {a.name}
    </div>
  );
  /** Two lanes: overlapping tasks go to the lower lane, as Team Planner stacks them. */
  const lanes = (list: { a: Activity }[]) => {
    const ends: number[] = [];
    return list
      .sort((p, q) => p.a.start! - q.a.start!)
      .map((t) => {
        let l = ends.findIndex((e) => e <= t.a.start!);
        if (l < 0) l = Math.min(1, ends.length);
        ends[l] = Math.max(ends[l] ?? 0, t.a.finish!);
        return l;
      });
  };
  return (
    <div className="msp-tp">
      <div style={{ width: LEFT + x(to), position: "relative" }}>
        <div className="tp-head" style={{ width: LEFT + x(to) }}>
          <span className="tp-left" style={{ width: LEFT }}>
            Resource Name
          </span>
          {months.map(([a, b, l]) => (
            <span key={a} className="tp-month" style={{ left: LEFT + x(a), width: x(b) - x(a) }}>
              {l}
            </span>
          ))}
        </div>
        {res.map((r) => {
          const list = byRes.get(r.id) ?? [];
          const ln = lanes(list);
          return (
            <div key={r.id} className={`tp-row ${over.has(r.id) ? "over" : ""}`} style={{ height: H }} onDragOver={(e) => e.preventDefault()} onDrop={(e) => drop(r.id, e)}>
              <span className="tp-left" style={{ width: LEFT }}>
                {over.has(r.id) && <span className="msp-ind bad">◆</span>} {r.name}
              </span>
              {list.map((t, i) => block(t.a, t.asgId, ln[i]))}
            </div>
          );
        })}
        <div className="tp-sep">Unassigned Tasks: {unassigned.length}</div>
        <div className="tp-row unassigned" style={{ height: H + 18 }}>
          <span className="tp-left" style={{ width: LEFT }}>
            Unassigned Tasks
          </span>
          {(() => {
            const ln = lanes(unassigned.map((q) => ({ a: q })));
            return unassigned.map((a, i) => block(a, null, Math.min(2, ln[i] ?? 0)));
          })()}
        </div>
      </div>
    </div>
  );
}

