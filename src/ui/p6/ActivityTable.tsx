// P6 Activities window: the activity table (any columns, grouped, sorted,
// filtered, edited in place) beside the Gantt chart (actual / remaining /
// critical / baseline / float bars, relationship lines, timescale).
// Rows are virtualised, so 25,000+ activities scroll and select smoothly.

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MONTHS, monthShort } from "../../core/dates";
import { fieldCtx, fieldsFor, fieldText, fmtDay, STANDARD_FILTERS, type FieldDef } from "../../core/fields";
import { buildP6Rows, type P6Row } from "../../core/p6rows";
import type { Activity } from "../../core/types";
import { DAY, useStore } from "../store";
import { addActivity, collapseAll, copySelected, cutSelected, deleteSelected, dissolveSelected, expandAll, fillDownSelected, linkSelected, paste, selectAll, setCell, tableOrder, unlinkSelected, useP6 } from "./commands";
import { useCtx, type CtxItem } from "./ContextMenu";
import { allFilters, useLayout, type P6Layout, type TimescaleUnit } from "./layout";

const HEAD = 36;

/** The layout bar's quick filter (shared with the MS Project layout) mapped to P6's default filters. */
export const QUICK: Record<string, string | undefined> = {
  critical: "critical",
  "not-started": "notStarted",
  "in-progress": "inProgress",
  complete: "completed",
  late: "late",
  milestones: "milestones",
};

interface Tier {
  t: number;
  end: number;
  label: string;
}

const addMonths = (t: number, n: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
};
const monthStart = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};

/** Pixels per day for an explicit timescale unit. */
const UNIT_PX: Record<Exclude<TimescaleUnit, "auto">, number> = { day: 22, week: 5, month: 1.6, quarter: 0.55, year: 0.2 };

/** Two-tier P6 timescale. */
function tiers(origin: number, end: number, pxPerDay: number, unit: TimescaleUnit): { top: Tier[]; bottom: Tier[] } {
  const top: Tier[] = [];
  const bottom: Tier[] = [];
  const u = unit !== "auto" ? unit : pxPerDay >= 16 ? "day" : pxPerDay * 7 >= 30 ? "week" : pxPerDay * 30 >= 22 ? "month" : pxPerDay * 91 >= 26 ? "quarter" : "year";
  const y0 = new Date(origin).getUTCFullYear();
  if (u === "day" || u === "week") {
    for (let m = monthStart(origin); m < end; m = addMonths(m, 1)) top.push({ t: m, end: addMonths(m, 1), label: `${monthShort(new Date(m))} ${new Date(m).getUTCFullYear()}` });
    if (u === "day") {
      for (let d = Math.floor(origin / DAY) * DAY; d < end; d += DAY) {
        const x = new Date(d);
        bottom.push({ t: d, end: d + DAY, label: pxPerDay >= 18 ? String(x.getUTCDate()) : "" });
      }
    } else {
      const first = new Date(origin);
      const toMon = (first.getUTCDay() + 6) % 7;
      for (let w = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate() - toMon); w < end; w += 7 * DAY) bottom.push({ t: w, end: w + 7 * DAY, label: String(new Date(w).getUTCDate()).padStart(2, "0") });
    }
  } else if (u === "month") {
    for (let y = y0; Date.UTC(y, 0, 1) < end; y++) top.push({ t: Date.UTC(y, 0, 1), end: Date.UTC(y + 1, 0, 1), label: String(y) });
    for (let m = monthStart(origin); m < end; m = addMonths(m, 1)) bottom.push({ t: m, end: addMonths(m, 1), label: pxPerDay * 30 < 30 ? MONTHS[new Date(m).getUTCMonth()][0] : monthShort(new Date(m)) });
  } else {
    for (let y = y0; Date.UTC(y, 0, 1) < end; y++) {
      top.push({ t: Date.UTC(y, 0, 1), end: Date.UTC(y + 1, 0, 1), label: String(y) });
      if (u === "quarter") for (let q = 0; q < 4; q++) bottom.push({ t: Date.UTC(y, q * 3, 1), end: Date.UTC(y, q * 3 + 3, 1), label: `Q${q + 1}` });
      else for (let h = 0; h < 2; h++) bottom.push({ t: Date.UTC(y, h * 6, 1), end: Date.UTC(y, h * 6 + 6, 1), label: `H${h + 1}` });
    }
  }
  return { top, bottom };
}

// ---------------------------------------------------------------- in-place editor

function CellEditor({ f, a, onDone }: { f: FieldDef; a: Activity; onDone: (move?: 1 | -1) => void }) {
  const s = useStore.getState().schedule!;
  const c = fieldCtx(s);
  const raw = f.get(a, c);
  const initial = f.type === "date" ? (typeof raw === "number" ? new Date(raw).toISOString().slice(0, 10) : "") : f.type === "percent" ? String(raw ?? "") : raw === null || raw === undefined ? "" : String(raw);
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const commit = (move?: 1 | -1) => {
    if (done.current) return;
    done.current = true;
    if (v !== initial) {
      const value = f.type === "date" ? (v ? Date.parse(`${v}T00:00:00Z`) + ((typeof raw === "number" ? raw : 8 * 3_600_000) % DAY) : null) : f.type === "duration" || f.type === "number" || f.type === "percent" ? (v === "" ? null : Number(v)) : v;
      setCell(a.id, f.id, value);
    }
    onDone(move);
  };
  const keys = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") {
      done.current = true;
      onDone();
    } else if (e.key === "Tab") {
      e.preventDefault();
      commit(e.shiftKey ? -1 : 1);
    }
  };
  if (f.type === "enum")
    return (
      <select autoFocus className="cell-edit" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => commit()} onKeyDown={keys}>
        {(f.options ?? []).map((o) => (
          <option key={o} value={o}>
            {o || "(none)"}
          </option>
        ))}
      </select>
    );
  return (
    <input
      autoFocus
      className="cell-edit"
      type={f.type === "date" ? "date" : f.type === "duration" || f.type === "number" || f.type === "percent" ? "number" : "text"}
      step={f.type === "duration" ? 0.5 : undefined}
      value={v}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => commit()}
      onKeyDown={keys}
    />
  );
}

// ---------------------------------------------------------------- table + Gantt

export function ActivityTable({ onSchedule, trace }: { onSchedule?: () => void; trace?: Set<string> | null }) {
  const schedule = useStore((s) => s.schedule);
  const collapsed = useStore((s) => s.collapsedWbs);
  const toggleWbs = useStore((s) => s.toggleWbs);
  const selected = useStore((s) => s.selectedActivity);
  const selection = useStore((s) => s.selectedActivities);
  const setSelection = useStore((s) => s.setActivitySelection);
  const findText = useStore((s) => s.ganttFilter.text);
  const quickKind = useStore((s) => s.ganttFilter.kind);
  const tracking = useStore((s) => s.ganttTracking);
  const layout = useLayout((s) => s.layout);
  const custom = useLayout((s) => s.customFilters);
  const setLayout = useLayout((s) => s.set);
  const editing = useP6((s) => s.editing);
  const setEditing = useP6((s) => s.setEditing);
  const focusField = useP6((s) => s.focusField);
  const setFocusField = useP6((s) => s.setFocusField);
  const spotlight = useP6((s) => s.spotlight);
  const showCtx = useCtx((s) => s.show);

  const tableRef = useRef<HTMLDivElement>(null);
  const ganttRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(400);
  const [ganttW, setGanttW] = useState(600);
  const anchor = useRef<string | null>(null);
  const [printAll, setPrintAll] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setPrintAll(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("stratum:print", on);
    return () => window.removeEventListener("stratum:print", on);
  }, []);
  const ROW = layout.rowHeight;

  const fields = useMemo(() => fieldsFor(schedule), [schedule]);
  const fieldMap = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);
  const ctx = useMemo(() => (schedule ? fieldCtx(schedule) : null), [schedule]);
  const cols = useMemo(
    () => layout.columns.map((c) => ({ spec: c, f: fieldMap.get(c.id) })).filter((x): x is { spec: (typeof layout.columns)[number]; f: FieldDef } => !!x.f).map((x) => ({ f: x.f, width: x.spec.width ?? x.f.width })),
    [layout.columns, fieldMap],
  );
  const COLS = cols.reduce((s, c) => s + c.width, 0);

  const filterDefs = useMemo(() => {
    const all = allFilters(custom);
    return layout.filters.map((id) => all.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f);
  }, [layout.filters, custom]);

  const { rows, shown } = useMemo(() => {
    if (!schedule || !ctx) return { rows: [] as P6Row[], shown: 0 };
    const r = buildP6Rows(schedule, fieldMap, ctx, {
      groupBy: layout.groupBy,
      sort: layout.sort,
      filters: filterDefs,
      filterMatch: layout.filterMatch,
      filterMode: layout.filterMode,
      text: findText,
      collapsed,
      quick: QUICK[quickKind] ? STANDARD_FILTERS.find((f) => f.id === QUICK[quickKind]) : null,
    });
    if (!trace) return r;
    const kept = r.rows.filter((x) => x.kind === "activity" && trace.has(x.id));
    return { rows: kept.map((x) => ({ ...x, depth: 0 })), shown: kept.length };
  }, [schedule, ctx, fieldMap, layout.groupBy, layout.sort, filterDefs, layout.filterMatch, layout.filterMode, findText, quickKind, collapsed, trace]);

  const rowIndex = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r, i) => r.kind === "activity" && m.set(r.id, i));
    return m;
  }, [rows]);
  useEffect(() => {
    tableOrder.ids = rows.filter((r) => r.kind === "activity").map((r) => r.id);
  }, [rows]);

  useEffect(() => {
    const el = ganttRef.current ?? tableRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeight(el.clientHeight);
      if (ganttRef.current) setGanttW(ganttRef.current.clientWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout.showGantt, layout.showTable, schedule]);

  // Time axis.
  const range = useMemo(() => {
    if (!schedule) return null;
    let s = Infinity;
    let f = -Infinity;
    for (const a of schedule.activities) {
      const st = a.start ?? a.baselineStart;
      const fi = a.finish ?? a.baselineFinish;
      if (st !== null && st < s) s = st;
      if (fi !== null && fi > f) f = fi;
      if (a.baselineStart !== null && a.baselineStart < s) s = a.baselineStart;
      if (a.baselineFinish !== null && a.baselineFinish > f) f = a.baselineFinish;
    }
    if (schedule.dataDate !== null) {
      s = Math.min(s, schedule.dataDate);
      f = Math.max(f, schedule.dataDate);
    }
    return Number.isFinite(s) ? { start: s, finish: f } : null;
  }, [schedule]);
  const origin = range ? monthStart(range.start - 7 * DAY) : 0;
  const totalDays = range ? Math.ceil((range.finish - origin) / DAY) + 45 : 0;
  const pxPerDay = layout.timescale === "auto" ? Math.max(0.05, ((ganttW - 8) / Math.max(1, totalDays)) * layout.zoom) : UNIT_PX[layout.timescale] * layout.zoom;
  const x = useCallback((t: number) => ((t - origin) / DAY) * pxPerDay, [origin, pxPerDay]);
  const gw = Math.max(ganttW, totalDays * pxPerDay);
  const scale = useMemo(() => (range ? tiers(origin, origin + totalDays * DAY, pxPerDay, layout.timescale) : { top: [], bottom: [] }), [range, origin, totalDays, pxPerDay, layout.timescale]);

  // Keep the selected row in view when it changes from elsewhere (Find, another window, the network).
  const lastSel = useRef<string | null>(null);
  useEffect(() => {
    if (!selected || selected === lastSel.current) return;
    lastSel.current = selected;
    const i = rowIndex.get(selected);
    const el = ganttRef.current ?? tableRef.current;
    if (i === undefined || !el) return;
    const top = i * ROW;
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - HEAD - ROW * 2) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [selected, rowIndex, ROW]);

  // Zoom / fit / scroll commands from the toolbar and menus.
  useEffect(() => {
    const on = (e: Event) => {
      const action = (e as CustomEvent<string>).detail;
      const L = useLayout.getState();
      if (action === "zoom-in") L.set({ zoom: Math.min(80, L.layout.zoom * 1.5) });
      else if (action === "zoom-out") L.set({ zoom: Math.max(0.1, L.layout.zoom / 1.5) });
      else if (action === "fit") L.set({ zoom: 1, timescale: "auto" });
      else if (action === "scroll-to-selected") {
        const id = useStore.getState().selectedActivity;
        const i = id ? rowIndex.get(id) : undefined;
        const a = id ? useStore.getState().schedule?.activities.find((y) => y.id === id) : null;
        if (i !== undefined && ganttRef.current) {
          ganttRef.current.scrollTop = Math.max(0, i * ROW - ganttRef.current.clientHeight / 3);
          if (a?.start != null) ganttRef.current.scrollLeft = Math.max(0, x(a.start) - 60);
        }
      }
    };
    window.addEventListener("stratum:gantt", on);
    return () => window.removeEventListener("stratum:gantt", on);
  }, [rowIndex, ROW, x]);

  const onScroll = (src: "t" | "g") => (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const other = src === "t" ? ganttRef.current : tableRef.current;
    if (other && Math.abs(other.scrollTop - top) > 1) other.scrollTop = top;
    setScrollTop(top);
  };

  // ---------------------------------------------------------------- selection

  const pick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchor.current) {
      const a = rowIndex.get(anchor.current);
      const b = rowIndex.get(id);
      if (a !== undefined && b !== undefined) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const ids = new Set<string>(e.ctrlKey || e.metaKey ? selection : []);
        for (let i = lo; i <= hi; i++) if (rows[i].kind === "activity") ids.add(rows[i].id);
        return setSelection(ids, id);
      }
    }
    anchor.current = id;
    if (e.ctrlKey || e.metaKey) {
      const ids = new Set(selection);
      if (ids.has(id)) ids.delete(id);
      else ids.add(id);
      return setSelection(ids, ids.has(id) ? id : [...ids][0] ?? null);
    }
    if (selection.size > 1 && selection.has(id) && e.button === 2) return; // right-click keeps a multi-selection
    setSelection(new Set([id]), id);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (editing || (e.target as HTMLElement).closest("input, select, textarea")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") e.stopPropagation();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const acts = rows.filter((r) => r.kind === "activity");
      const cur = selected ? acts.findIndex((r) => r.id === selected) : -1;
      const next = acts[Math.max(0, Math.min(acts.length - 1, cur + (e.key === "ArrowDown" ? 1 : -1)))];
      if (!next) return;
      if (e.shiftKey) {
        const ids = new Set(selection);
        ids.add(next.id);
        setSelection(ids, next.id);
      } else {
        anchor.current = next.id;
        setSelection(new Set([next.id]), next.id);
      }
    } else if (e.key === "F2" && selected) {
      e.preventDefault();
      const f = fieldMap.get(focusField ?? "name");
      if (f?.set) setEditing({ id: selected, field: f.id });
    } else if (e.key === "Enter" && selected && focusField) {
      const f = fieldMap.get(focusField);
      if (f?.set) setEditing({ id: selected, field: f.id });
    }
  };

  // ---------------------------------------------------------------- column header

  const resize = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = cols[idx].width;
    const move = (m: MouseEvent) => {
      const w = Math.max(24, w0 + m.clientX - x0);
      setLayout({ columns: layout.columns.map((c) => (c.id === cols[idx].f.id ? { ...c, width: w } : c)) });
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const sortBy = (fid: string, add: boolean) => {
    const cur = layout.sort;
    const i = cur.findIndex((s) => s.field === fid);
    if (add) {
      if (i >= 0) setLayout({ sort: cur.map((s, k) => (k === i ? { ...s, desc: !s.desc } : s)) });
      else setLayout({ sort: [...cur, { field: fid }] });
    } else setLayout({ sort: [{ field: fid, desc: i === 0 ? !cur[0].desc : false }] });
  };

  const dragCol = useRef<string | null>(null);
  const dropCol = (target: string) => {
    const from = dragCol.current;
    dragCol.current = null;
    if (!from || from === target) return;
    const list = layout.columns.filter((c) => c.id !== from);
    const moved = layout.columns.find((c) => c.id === from)!;
    const at = list.findIndex((c) => c.id === target);
    list.splice(at, 0, moved);
    setLayout({ columns: list });
  };

  const headMenu = (f: FieldDef, e: React.MouseEvent) => {
    e.preventDefault();
    const open = useP6.getState().open;
    showCtx(e.clientX, e.clientY, [
      { label: "Sort Ascending", onClick: () => setLayout({ sort: [{ field: f.id }] }) },
      { label: "Sort Descending", onClick: () => setLayout({ sort: [{ field: f.id, desc: true }] }) },
      { label: `Group by ${f.label}`, onClick: () => setLayout({ groupBy: f.id }), checked: layout.groupBy === f.id },
      { label: "Group by WBS", onClick: () => setLayout({ groupBy: "wbs" }), checked: layout.groupBy === "wbs" },
      { label: "No Grouping", onClick: () => setLayout({ groupBy: "none" }), checked: layout.groupBy === "none" },
      "sep",
      { label: `Hide ${f.label}`, onClick: () => setLayout({ columns: layout.columns.filter((c) => c.id !== f.id) }), disabled: layout.columns.length <= 1 },
      { label: "Columns…", onClick: () => open("columns") },
      { label: "Group and Sort…", onClick: () => open("groupSort") },
      { label: "Filters…", onClick: () => open("filters") },
      { label: "Adjust Column Widths", onClick: () => setLayout({ columns: layout.columns.map((c) => ({ id: c.id })) }) },
    ]);
  };

  const rowMenu = (a: Activity, e: React.MouseEvent) => {
    e.preventDefault();
    if (!selection.has(a.id)) setSelection(new Set([a.id]), a.id);
    const n = Math.max(1, useStore.getState().selectedActivities.size);
    const open = useP6.getState().open;
    const st = useStore.getState();
    const items: CtxItem[] = [
      { label: "Add Activity", onClick: addActivity, shortcut: "Ins" },
      { label: n > 1 ? `Delete ${n} Activities` : "Delete", onClick: () => deleteSelected(), shortcut: "Del" },
      "sep",
      { label: "Cut", onClick: cutSelected, shortcut: "Ctrl+X" },
      { label: "Copy", onClick: copySelected, shortcut: "Ctrl+C" },
      { label: "Paste", onClick: paste, shortcut: "Ctrl+V", disabled: !st.clipboard },
      "sep",
      { label: "Dissolve", onClick: dissolveSelected },
      { label: "Renumber Activity IDs…", onClick: () => open("renumber") },
      { label: "Link Activities", onClick: () => linkSelected("FS"), disabled: n < 2, sub: n < 2 ? undefined : (["FS", "SS", "FF", "SF"] as const).map((t) => ({ label: `Link ${t}`, onClick: () => linkSelected(t) })) },
      { label: "Unlink Activities", onClick: unlinkSelected, disabled: n < 2 },
      { label: "Fill Down", onClick: fillDownSelected, disabled: n < 2, shortcut: "Ctrl+E" },
      "sep",
      {
        label: "Assign",
        sub: [
          { label: "Predecessors…", onClick: () => open("assignPred") },
          { label: "Successors…", onClick: () => open("assignSucc") },
          { label: "Resources…", onClick: () => open("assignRes") },
          { label: "Activity Codes…", onClick: () => open("assignCode") },
        ],
      },
      { label: "Select All", onClick: selectAll, shortcut: "Ctrl+A" },
      "sep",
      { label: "Columns…", onClick: () => open("columns") },
      { label: "Filters…", onClick: () => open("filters") },
      { label: "Group and Sort…", onClick: () => open("groupSort") },
      { label: "Bar Chart Options…", onClick: () => open("bars") },
      { label: "Expand All", onClick: expandAll },
      { label: "Collapse All", onClick: collapseAll },
      ...(onSchedule ? (["sep", { label: "Schedule…", onClick: onSchedule, shortcut: "F9" }] as CtxItem[]) : []),
    ];
    showCtx(e.clientX, e.clientY, items);
  };

  if (!schedule || !ctx) return <div className="empty">No schedule loaded.</div>;

  const first = printAll ? 0 : Math.max(0, Math.floor(scrollTop / ROW) - 6);
  const last = printAll ? Math.min(rows.length, 6000) : Math.min(rows.length, Math.ceil((scrollTop + height) / ROW) + 6);
  const visible = rows.slice(first, last);
  const bodyH = rows.length * ROW;
  const dd = schedule.dataDate;
  const bars = tracking && !layout.bars.baseline ? { ...layout.bars, baseline: true } : layout.bars;
  const spotEnd = dd !== null ? addMonths(dd, 1) : null;

  const tableHead = (
    <div className="p6t-head" style={{ width: COLS, height: HEAD }}>
      {cols.map((c, i) => {
        const sIdx = layout.sort.findIndex((s) => s.field === c.f.id);
        return (
          <div
            key={c.f.id}
            className={`p6t-th ${c.f.align ?? ""}`}
            style={{ width: c.width }}
            title={`${c.f.label}\nClick to sort, Shift+click to add a sort level, drag to move, right-click for options`}
            draggable
            onDragStart={() => (dragCol.current = c.f.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => dropCol(c.f.id)}
            onClick={(e) => sortBy(c.f.id, e.shiftKey)}
            onContextMenu={(e) => headMenu(c.f, e)}
          >
            <span>{c.f.label}</span>
            {sIdx >= 0 && (
              <i className="p6t-sort">
                {layout.sort[sIdx].desc ? "▼" : "▲"}
                {layout.sort.length > 1 ? sIdx + 1 : ""}
              </i>
            )}
            <b className="p6t-grip" onMouseDown={(e) => resize(i, e)} onClick={(e) => e.stopPropagation()} />
          </div>
        );
      })}
    </div>
  );

  const cellStyle = (c: (typeof cols)[number], extra?: CSSProperties): CSSProperties => ({ width: c.width, textAlign: c.f.align === "right" ? "right" : c.f.align === "center" ? "center" : undefined, ...extra });

  const tableRows = visible.map((r, k) => {
    const top = (first + k) * ROW;
    if (r.kind === "band") {
      const depth = Math.min(r.depth, 5);
      const nameW = cols.findIndex((c) => c.f.id === "name");
      const span = cols.slice(0, Math.max(1, nameW + 1)).reduce((s, c) => s + c.width, 0);
      return (
        <div key={`b${r.id}`} className={`p6t-row band band${depth} gantt-row wbs`} style={{ top, height: ROW, width: COLS }} onClick={() => toggleWbs(r.id)} title={`${r.label} · ${r.count} activities`}>
          <div className="p6t-td" style={{ width: span, paddingLeft: 4 + r.depth * 12 }}>
            <span className="p6t-tw">{collapsed.has(r.id) ? "+" : "−"}</span> {r.label}
          </div>
          {cols.slice(Math.max(1, nameW + 1)).map((c) => (
            <div key={c.f.id} className="p6t-td" style={cellStyle(c)}>
              {layout.groupTotals ? (c.f.id === "start" || c.f.id === "earlyStart" ? fmtDay(r.start) : c.f.id === "finish" || c.f.id === "earlyFinish" ? fmtDay(r.finish) : "") : ""}
            </div>
          ))}
        </div>
      );
    }
    const a = r.activity;
    const sel = selection.has(a.id);
    const spot = spotlight && dd !== null && spotEnd !== null && a.start !== null && a.finish !== null && a.start < spotEnd && a.finish > dd;
    return (
      <div
        key={a.id}
        className={`p6t-row act gantt-row ${sel ? "selected" : ""} ${a.id === selected ? "focus" : ""} ${r.dim ? "dim" : ""} ${spot ? "spot" : ""}`}
        style={{ top, height: ROW, width: COLS }}
        onMouseDown={(e) => e.button !== 1 && pick(a.id, e)}
        // A click with no mouse press before it (keyboard, assistive tech, training "Show me") still selects.
        onClick={(e) => e.detail === 0 && pick(a.id, e)}
        onContextMenu={(e) => rowMenu(a, e)}
      >
        {cols.map((c, i) => {
          const isEdit = editing?.id === a.id && editing.field === c.f.id;
          const neg = (c.f.id === "tf" || c.f.id === "ff" || c.f.id === "finishVar" || c.f.id === "startVar") && Number(c.f.get(a, ctx)) < 0;
          return (
            <div
              key={c.f.id}
              className={`p6t-td ${neg ? "bad" : ""} ${c.f.set ? "editable" : ""} ${sel && focusField === c.f.id ? "cellfocus" : ""}`}
              style={cellStyle(c, i === 0 && layout.groupBy !== "none" ? { paddingLeft: 6 + r.depth * 12 } : undefined)}
              title={c.f.id === "name" ? a.name : undefined}
              onMouseDown={() => setFocusField(c.f.id)}
              onDoubleClick={() => c.f.set && setEditing({ id: a.id, field: c.f.id })}
            >
              {isEdit ? (
                <CellEditor
                  f={c.f}
                  a={a}
                  onDone={(move) => {
                    setEditing(null);
                    if (move) {
                      const editable = cols.filter((x) => x.f.set);
                      const j = editable.findIndex((x) => x.f.id === c.f.id);
                      const n = editable[j + move];
                      if (n) {
                        setFocusField(n.f.id);
                        setEditing({ id: a.id, field: n.f.id });
                      }
                    }
                    tableRef.current?.focus();
                  }}
                />
              ) : (
                fieldText(c.f, a, ctx)
              )}
            </div>
          );
        })}
      </div>
    );
  });

  // ---------------------------------------------------------------- bars

  const barLabel = (a: Activity, fid: string) => {
    const f = fieldMap.get(fid);
    return f ? fieldText(f, a, ctx) : "";
  };

  const ganttRows = visible.map((r, k) => {
    const top = (first + k) * ROW;
    if (r.kind === "band") {
      if (!bars.summaryBars || r.start === null || r.finish === null) return <div key={`gb${r.id}`} className={`p6g-row band band${Math.min(r.depth, 5)}`} style={{ top, height: ROW, width: gw }} />;
      return (
        <div key={`gb${r.id}`} className={`p6g-row band band${Math.min(r.depth, 5)}`} style={{ top, height: ROW, width: gw }} onClick={() => toggleWbs(r.id)}>
          <div className="p6g-sum" style={{ left: x(r.start), width: Math.max(2, x(r.finish) - x(r.start)) }} />
        </div>
      );
    }
    const a = r.activity;
    const s = a.start;
    const f = a.finish;
    const isMs = a.type === "milestone" || a.type === "finish-milestone";
    const crit = bars.critical && a.critical;
    const split = s === null || f === null ? null : a.status === "complete" ? f : a.status === "in-progress" && dd !== null ? Math.min(Math.max(dd, s), f) : s;
    const lateF = a.lateFinish ?? (a.totalFloatHours !== null && f !== null ? f + (a.totalFloatHours / ctx.hpd) * DAY * (7 / 5) : null);
    return (
      <div key={`g${a.id}`} className={`p6g-row ${selection.has(a.id) ? "selected" : ""} ${r.dim ? "dim" : ""}`} style={{ top, height: ROW, width: gw }} onMouseDown={(e) => pick(a.id, e)} onContextMenu={(e) => rowMenu(a, e)}>
        {bars.baseline && a.baselineStart !== null && a.baselineFinish !== null && (
          <div className="p6g-bl" style={{ left: x(a.baselineStart), width: Math.max(2, x(a.baselineFinish) - x(a.baselineStart)) }} title={`Baseline ${fmtDay(a.baselineStart)} – ${fmtDay(a.baselineFinish)}`} />
        )}
        {s !== null &&
          f !== null &&
          (isMs ? (
            <div className={`p6g-ms ${a.status === "complete" ? "done" : crit ? "crit" : ""}`} style={{ left: x(a.type === "finish-milestone" ? f : s) - 5 }} title={`${a.code} ${fmtDay(s)}`} />
          ) : (
            <>
              {bars.actual && split !== null && split > s && <div className="p6g-bar actual" style={{ left: x(s), width: Math.max(2, x(split) - x(s)) }} />}
              {bars.remaining && split !== null && f > split && <div className={`p6g-bar remaining ${crit ? "crit" : ""}`} style={{ left: x(split), width: Math.max(2, x(f) - x(split)) }} />}
              {bars.insideLabel && <span className="p6g-in" style={{ left: x(s) + 3, width: Math.max(0, x(f) - x(s) - 4) }}>{barLabel(a, bars.insideLabel)}</span>}
            </>
          ))}
        {bars.float && f !== null && lateF !== null && lateF > f && a.status !== "complete" && <div className="p6g-float" style={{ left: x(f), width: x(lateF) - x(f) }} title="Total float" />}
        {bars.rightLabel && f !== null && <span className="p6g-label" style={{ left: x(f) + (isMs ? 9 : 5) }}>{barLabel(a, bars.rightLabel)}</span>}
      </div>
    );
  });

  // Relationship lines for the visible rows (P6 draws them from bar end to bar start).
  let relLines: JSX.Element | null = null;
  if (bars.relationships && layout.showGantt) {
    const visIdx = new Set(visible.filter((r) => r.kind === "activity").map((r) => r.id));
    const byId = new Map(schedule.activities.map((a) => [a.id, a]));
    const paths: JSX.Element[] = [];
    for (const rel of schedule.relationships) {
      if (paths.length > 1500) break;
      if (!visIdx.has(rel.predecessorId) && !visIdx.has(rel.successorId)) continue;
      const pi = rowIndex.get(rel.predecessorId);
      const si = rowIndex.get(rel.successorId);
      const p = byId.get(rel.predecessorId);
      const q = byId.get(rel.successorId);
      if (pi === undefined || si === undefined || !p || !q) continue;
      const px = rel.type[0] === "F" ? p.finish : p.start;
      const qx = rel.type[1] === "S" ? q.start : q.finish;
      if (px === null || qx === null) continue;
      const x1 = x(px);
      const y1 = pi * ROW + ROW / 2;
      const x2 = x(qx);
      const y2 = si * ROW + ROW / 2;
      const driving = p.critical && q.critical;
      const elbow = rel.type[1] === "S" ? Math.max(x1 + 4, x2 - 6) : x2 + 8;
      const d = rel.type[1] === "S" ? `M${x1},${y1} H${elbow} V${y2} H${x2}` : `M${x1},${y1} H${Math.max(x1, x2) + 8} V${y2} H${x2}`;
      paths.push(<path key={rel.id} d={d} className={driving ? "drv" : ""} markerEnd={driving ? "url(#p6arrowc)" : "url(#p6arrow)"} />);
    }
    relLines = (
      <svg className="p6g-rels" width={gw} height={bodyH} style={{ top: HEAD }}>
        <defs>
          <marker id="p6arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="arr" />
          </marker>
          <marker id="p6arrowc" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" className="arr drv" />
          </marker>
        </defs>
        {paths}
      </svg>
    );
  }

  const tableW = layout.showGantt ? Math.min(layout.tableWidth, Math.max(240, COLS + 16)) : undefined;

  const splitter = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = layout.tableWidth;
    const move = (m: MouseEvent) => setLayout({ tableWidth: Math.max(160, Math.min(window.innerWidth - 240, w0 + m.clientX - x0)) });
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div className="p6t" tabIndex={0} onKeyDown={onKey}>
      {layout.showTable && (
        <div className={`p6t-pane ${layout.showGantt ? "with-gantt" : ""}`} ref={tableRef} style={tableW ? { width: tableW, flex: "none" } : undefined} onScroll={onScroll("t")}>
          <div style={{ height: bodyH + HEAD, width: COLS, position: "relative" }}>
            {tableHead}
            <div className="p6t-body" style={{ top: HEAD, height: bodyH, width: COLS }}>
              {tableRows}
            </div>
          </div>
        </div>
      )}
      {layout.showTable && layout.showGantt && <div className="p6t-split" onMouseDown={splitter} title="Drag to resize" />}
      {layout.showGantt && (
        <div className="p6g-pane gantt-body" ref={ganttRef} onScroll={onScroll("g")}>
          <div style={{ height: bodyH + HEAD, width: gw, position: "relative" }}>
            <div className="p6g-head" style={{ width: gw, height: HEAD }}>
              {scale.top.map((s) => (
                <span key={`t${s.t}`} className="tier top" style={{ left: x(s.t), width: x(s.end) - x(s.t) }}>
                  {x(s.end) - x(s.t) > 26 ? s.label : ""}
                </span>
              ))}
              {scale.bottom.map((s) => (
                <span key={`b${s.t}`} className="tier bottom" style={{ left: x(s.t), width: x(s.end) - x(s.t) }}>
                  {x(s.end) - x(s.t) >= 14 ? s.label : ""}
                </span>
              ))}
            </div>
            {scale.bottom.length < 3000 && scale.bottom.map((s) => <div key={`v${s.t}`} className="p6g-vline" style={{ left: x(s.t), top: HEAD, height: bodyH }} />)}
            {spotlight && dd !== null && spotEnd !== null && <div className="p6g-spot" style={{ left: x(dd), width: x(spotEnd) - x(dd), top: HEAD, height: bodyH }} title="Spotlight: the next update period" />}
            <div className="p6t-body" style={{ top: HEAD, height: bodyH, width: gw }}>
              {ganttRows}
            </div>
            {relLines}
            {bars.dataDateLine && dd !== null && <div className="p6g-dd" style={{ left: x(dd), top: HEAD, height: bodyH }} title={`Data date ${fmtDay(dd)}`} />}
          </div>
        </div>
      )}
      <div className="p6t-count" aria-live="polite">
        {shown.toLocaleString()} of {schedule.activities.length.toLocaleString()} activities
        {selection.size > 1 ? ` · ${selection.size.toLocaleString()} selected` : ""}
      </div>
    </div>
  );
}

export type { P6Layout };
