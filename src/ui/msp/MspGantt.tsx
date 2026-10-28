// MS Project Gantt Chart / Tracking Gantt / Task Sheet: an editable sheet on
// the left (type into cells, F2, Enter moves down, Esc cancels; a blank row at
// the end adds tasks) and the chart on the right with MS Project's bars,
// summary brackets, milestones, link arrows, baseline and slack bars. Bars
// drag to move and stretch to change the duration. Both panes scroll together.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MONTHS, monthShort } from "../../core/dates";
import { missedDeadline } from "../../core/msp";
import { buildGanttRows } from "../../core/wbs";
import { useCtx, type CtxItem } from "../p6/ContextMenu";
import { useStore } from "../store";
import { appendTask, deleteSelected, editCell, indent, insertTask, linkSelected, outdent, renameSummary, setMode, toggleInactive, unlinkSelected } from "./actions";
import { FIELD, FIELDS, TABLES, indicators, mspDateText, sheetCtx, sheetRows, type Field, type SheetRow } from "./sheet";
import { useMsp } from "./state";

const ROW = 21;
const HEAD = 40;
const DAY = 86_400_000;
const BLANK_ROWS = 12;

/** The auto / manual task-mode glyph of MS Project's Task Mode column. */
export const ModeGlyph = ({ manual }: { manual?: boolean }) =>
  manual ? (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden className="taskmode manual">
      <path d="M2 3 L9 3 M2 9 L9 9 M2 3 L2 9" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <path d="M11 2 l3 3 -3 3" stroke="currentColor" strokeWidth="1.2" fill="none" />
      <circle cx="12" cy="10" r="1" fill="currentColor" />
    </svg>
  ) : (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden className="taskmode">
      <rect x="1" y="3" width="10" height="4" fill="currentColor" />
      <path d="M11 1 L15 5 L11 9 Z" fill="currentColor" />
    </svg>
  );

interface Tier {
  t: number;
  end: number;
  label: string;
}

/** MS Project's two-tier timescale for a zoom level. */
function timescale(origin: number, end: number, px: number): { top: Tier[]; bottom: Tier[] } {
  const top: Tier[] = [];
  const bottom: Tier[] = [];
  const d0 = new Date(origin);
  const yy = (d: Date) => `'${String(d.getUTCFullYear()).slice(2)}`;
  const monthsFrom = (step: number, label: (d: Date) => string, out: Tier[]) => {
    for (let m = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() - (d0.getUTCMonth() % step), 1); m < end; ) {
      const d = new Date(m);
      const n = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1);
      out.push({ t: m, end: n, label: label(d) });
      m = n;
    }
  };
  const weeks = (label: (d: Date) => string, out: Tier[]) => {
    const dow = (d0.getUTCDay() + 6) % 7;
    for (let w = origin - dow * DAY; w < end; w += 7 * DAY) out.push({ t: w, end: w + 7 * DAY, label: label(new Date(w)) });
  };
  if (px >= 14) {
    weeks((d) => `${String(d.getUTCDate()).padStart(2, "0")} ${monthShort(d)} ${yy(d)}`, top);
    for (let t = origin; t < end; t += DAY) bottom.push({ t, end: t + DAY, label: "SMTWTFS"[new Date(t).getUTCDay()] });
  } else if (px >= 3) {
    monthsFrom(1, (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, top);
    weeks((d) => String(d.getUTCDate()).padStart(2, "0"), bottom);
  } else if (px >= 1) {
    monthsFrom(3, (d) => `Qtr ${Math.floor(d.getUTCMonth() / 3) + 1}, ${d.getUTCFullYear()}`, top);
    monthsFrom(1, (d) => monthShort(d), bottom);
  } else {
    monthsFrom(12, (d) => String(d.getUTCFullYear()), top);
    monthsFrom(3, (d) => `Q${Math.floor(d.getUTCMonth() / 3) + 1}`, bottom);
  }
  return { top, bottom };
}

/** Which rows are on screen. */
function useViewport(ref: React.RefObject<HTMLDivElement | null>) {
  const [vp, setVp] = useState({ top: 0, height: 600 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp((v) => ({ ...v, height: el.clientHeight })));
    ro.observe(el);
    setVp({ top: el.scrollTop, height: el.clientHeight });
    return () => ro.disconnect();
  }, [ref]);
  return [vp, setVp] as const;
}

export function MspGantt({ chart = true, tracking = false }: { chart?: boolean; tracking?: boolean }) {
  const schedule = useStore((s) => s.schedule)!;
  const selected = useStore((s) => s.selectedActivity);
  const selection = useStore((s) => s.selectedActivities);
  const collapsedWbs = useStore((s) => s.collapsedWbs);
  const toggleWbs = useStore((s) => s.toggleWbs);
  const textFilter = useStore((s) => s.ganttFilter.text);
  const m = useMsp();
  const { format, table, pxPerDay: px } = m;
  const sheetRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useViewport(sheetRef);
  const [active, setActive] = useState<{ row: number; col: string } | null>(null);
  const [edit, setEdit] = useState<{ row: number; col: string; value: string } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [drag, setDrag] = useState<{ id: string; kind: "move" | "finish"; x0: number; dx: number } | null>(null);
  const anchor = useRef<number | null>(null);

  const fullRows = useMemo(() => buildGanttRows(schedule, "current"), [schedule]);
  const ctx = useMemo(() => sheetCtx(schedule, fullRows, ""), [schedule, fullRows]);
  const rows: SheetRow[] = useMemo(() => {
    let r = sheetRows(schedule, fullRows, ctx, {
      collapsed: collapsedWbs,
      filter: m.filter,
      dateRange: m.dateRange,
      group: m.group,
      sort: m.sort,
      projectSummary: format.projectSummary,
      summaryTasks: format.summaryTasks,
    });
    const q = textFilter.trim().toLowerCase();
    if (q) r = r.filter((x) => x.kind !== "task" || x.a.name.toLowerCase().includes(q) || x.a.code.toLowerCase().includes(q));
    return r;
  }, [schedule, fullRows, ctx, collapsedWbs, m.filter, m.dateRange, m.group, m.sort, format.projectSummary, format.summaryTasks, textFilter]);

  const cols: Field[] = useMemo(() => {
    const keys = [...TABLES[table].cols, ...(m.extraCols[table] ?? [])].filter((k) => !(m.hiddenCols[table] ?? []).includes(k) || k === "name");
    if (tracking && table === "entry") keys.splice(keys.indexOf("ind"), keys.includes("ind") ? 1 : 0);
    return keys.map((k) => FIELD.get(k)).filter((f): f is Field => !!f).map((f) => ({ ...f, width: widths[f.key] ?? f.width }));
  }, [table, m.extraCols, m.hiddenCols, widths, tracking]);
  const sheetW = cols.reduce((t, c) => t + c.width, 0) + 120;

  // Highlight filter: rows that match get MS Project's yellow highlight.
  const hl = m.highlight;
  const highlighted = (r: SheetRow) => hl !== "all" && r.kind === "task" && (hl === "critical" ? r.a.critical : hl === "milestones" ? r.a.type === "milestone" || r.a.type === "finish-milestone" : hl === "late" ? r.a.finish !== null && schedule.dataDate !== null && r.a.finish < schedule.dataDate && r.a.status !== "complete" : hl === "manual" ? r.a.taskMode === "manual" : hl === "completed" ? r.a.status === "complete" : hl === "incomplete" ? r.a.status !== "complete" : hl === "deadline" ? r.a.deadline != null : false);

  // Chart span.
  const span = useMemo(() => {
    let s0 = Infinity;
    let f0 = -Infinity;
    for (const a of schedule.activities) {
      for (const t of [a.start, a.baselineStart, a.actualStart]) if (t !== null && t !== undefined && t < s0) s0 = t;
      for (const t of [a.finish, a.baselineFinish, a.lateFinish, a.deadline]) if (t !== null && t !== undefined && t > f0) f0 = t;
    }
    if (!Number.isFinite(s0)) s0 = schedule.dataDate ?? Date.now();
    if (!Number.isFinite(f0)) f0 = s0 + 60 * DAY;
    const d = new Date(s0);
    const origin = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - (((d.getUTCDay() + 6) % 7) + 7) * DAY;
    return { origin, end: f0 + 45 * DAY };
  }, [schedule]);
  const x = (t: number) => ((t - span.origin) / DAY) * px;
  const chartW = Math.ceil(((span.end - span.origin) / DAY) * px);
  const scale = useMemo(() => timescale(span.origin, span.end, px), [span, px]);
  const cal = (schedule.calendars ?? []).find((c) => c.id === schedule.defaultCalendarId) ?? schedule.calendars?.[0];
  const offDays = useMemo(() => {
    if (px < 3 || !cal) return [];
    const out: number[] = [];
    for (let t = span.origin; t < span.end; t += DAY) if (!cal.week[new Date(t).getUTCDay()].length) out.push(t);
    return out;
  }, [px, cal, span]);

  const total = rows.length + BLANK_ROWS;
  const first = Math.max(0, Math.floor(vp.top / ROW) - 8);
  const last = Math.min(total, Math.ceil((vp.top + vp.height) / ROW) + 8);
  const visible = rows.slice(first, Math.min(last, rows.length));
  const rowIndex = useMemo(() => {
    const mp = new Map<string, number>();
    rows.forEach((r, i) => r.kind === "task" && !mp.has(r.id) && mp.set(r.id, i));
    return mp;
  }, [rows]);

  // Scroll to the selected task when another part of the app asks (Scroll to Task).
  useEffect(() => {
    const on = (e: Event) => {
      const c = (e as CustomEvent<string>).detail;
      const id = useStore.getState().selectedActivity;
      if (c === "scroll-to-selected" && id) {
        const i = rowIndex.get(id);
        const r = i !== undefined ? rows[i] : null;
        if (i !== undefined) sheetRef.current?.scrollTo({ top: Math.max(0, i * ROW - 60) });
        if (r?.fig.start != null && chartRef.current) chartRef.current.scrollLeft = Math.max(0, x(r.fig.start) - 40);
      } else if (c === "fit" && chartRef.current) {
        const w = chartRef.current.clientWidth;
        const days = (span.end - span.origin) / DAY;
        useMsp.getState().set({ pxPerDay: Math.max(0.4, Math.min(48, (w - 20) / days)) });
        chartRef.current.scrollLeft = 0;
      }
    };
    window.addEventListener("stratum:gantt", on);
    return () => window.removeEventListener("stratum:gantt", on);
  });

  const onScroll = (src: "sheet" | "chart") => (e: React.UIEvent<HTMLDivElement>) => {
    const top = e.currentTarget.scrollTop;
    const other = src === "sheet" ? chartRef.current : sheetRef.current;
    if (other && Math.abs(other.scrollTop - top) > 1) other.scrollTop = top;
    setVp((v) => ({ ...v, top }));
  };

  // ---- selection ----
  const selectRow = (i: number, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const r = rows[i];
    const st = useStore.getState();
    const wbs = new Set(useMsp.getState().selWbs);
    if (!r) {
      st.selectActivity(null);
      useMsp.getState().set({ selWbs: new Set() });
      return;
    }
    if (e.shiftKey && anchor.current !== null) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      const tasks = new Set<string>();
      const sums = new Set<string>();
      for (let k = a; k <= b; k++) {
        const x = rows[k];
        if (x?.kind === "task") tasks.add(x.id);
        else if (x?.kind === "wbs") sums.add(x.id);
      }
      st.setActivitySelection(tasks, r.kind === "task" ? r.id : undefined);
      useMsp.getState().set({ selWbs: sums });
      return;
    }
    anchor.current = i;
    if (e.ctrlKey || e.metaKey) {
      if (r.kind === "task") {
        const next = new Set(st.selectedActivities);
        if (next.has(r.id)) next.delete(r.id);
        else next.add(r.id);
        st.setActivitySelection(next, next.has(r.id) ? r.id : undefined);
      } else if (r.kind === "wbs") {
        if (wbs.has(r.id)) wbs.delete(r.id);
        else wbs.add(r.id);
        useMsp.getState().set({ selWbs: wbs });
      }
      return;
    }
    if (r.kind === "task") st.selectActivity(r.id);
    else st.selectActivity(null);
    useMsp.getState().set({ selWbs: r.kind === "wbs" ? new Set([r.id]) : new Set() });
  };
  const isSel = (r: SheetRow) => (r.kind === "task" ? selection.has(r.id) || selected === r.id : r.kind === "wbs" ? m.selWbs.has(r.id) : false);

  // ---- editing ----
  const editable = (r: SheetRow | undefined, f: Field) => (!r ? f.key === "name" : r.kind === "task" ? !!f.edit : r.kind === "wbs" ? !!f.editSummary : false);
  const startEdit = (row: number, col: string, value?: string) => {
    const f = FIELD.get(col);
    const r = rows[row];
    if (!f || !editable(r, f)) return;
    setEdit({ row, col, value: value ?? (r ? f.text(r, ctx).replace(/^NA$/, "") : "") });
  };
  // Enter commits and then the input's blur fires: only the first may apply the edit.
  const done = useRef<object | null>(null);
  const commit = (move: 0 | 1 | -1 = 0) => {
    if (!edit || done.current === edit) return;
    done.current = edit;
    const r = rows[edit.row];
    const f = FIELD.get(edit.col)!;
    const before = r ? f.text(r, ctx) : "";
    let err: string | null = null;
    if (edit.value !== before) {
      if (!r) {
        if (f.key === "name" && edit.value.trim()) appendTask(edit.value, rows[rows.length - 1]?.id ?? null);
      } else if (r.kind === "wbs") renameSummary(r.id, edit.value);
      else if (r.kind === "task" && f.edit) err = editCell(r.id, f.edit, edit.value);
    }
    if (err) {
      done.current = null; // keep the cell open so it can be corrected
      return;
    }
    setEdit(null);
    if (move) setActive({ row: Math.max(0, Math.min(total - 1, edit.row + move)), col: edit.col });
    sheetRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (edit) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.altKey && e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      return e.key === "ArrowRight" ? indent() : outdent();
    }
    if (ctrl && e.key === "F2") {
      e.preventDefault();
      return e.shiftKey ? unlinkSelected() : linkSelected();
    }
    if (e.shiftKey && e.key === "F2") {
      e.preventDefault();
      return useMsp.getState().open("taskInfo");
    }
    if (!active) return;
    const ci = cols.findIndex((c) => c.key === active.col);
    const move = (dr: number, dc: number) => {
      e.preventDefault();
      const row = Math.max(0, Math.min(total - 1, active.row + dr));
      const col = cols[Math.max(0, Math.min(cols.length - 1, ci + dc))].key;
      setActive({ row, col });
      if (dr) selectRow(row, { ctrlKey: false, metaKey: false, shiftKey: e.shiftKey });
      const el = sheetRef.current;
      if (el && (row * ROW < el.scrollTop || (row + 2) * ROW > el.scrollTop + el.clientHeight - HEAD)) el.scrollTop = Math.max(0, row * ROW - el.clientHeight / 2);
    };
    if (e.key === "ArrowDown") return move(1, 0);
    if (e.key === "ArrowUp") return move(-1, 0);
    if (e.key === "ArrowRight" || (e.key === "Tab" && !e.shiftKey)) return move(0, 1);
    if (e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)) return move(0, -1);
    if (e.key === "F2" || e.key === "Enter") {
      e.preventDefault();
      return startEdit(active.row, active.col);
    }
    if (e.key.length === 1 && !ctrl && !e.altKey) {
      e.preventDefault();
      startEdit(active.row, active.col, e.key);
    }
  };

  // ---- bar dragging ----
  useEffect(() => {
    if (!drag) return;
    const mv = (e: MouseEvent) => setDrag((d) => (d ? { ...d, dx: e.clientX - d.x0 } : d));
    const up = () => {
      const d = drag;
      setDrag(null);
      const days = Math.round(d.dx / px);
      const a = schedule.activities.find((q) => q.id === d.id);
      if (!a || !days || a.start === null) return;
      const base = d.kind === "move" ? a.start : (a.finish ?? a.start);
      const t = new Date(base + days * DAY);
      editCell(a.id, d.kind === "move" ? "start" : "finish", `${t.getUTCDate()}/${t.getUTCMonth() + 1}/${t.getUTCFullYear()}`);
    };
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", up, { once: true });
    return () => {
      window.removeEventListener("mousemove", mv);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, px, schedule]);

  // ---- context menus ----
  const ctxMenu = useCtx((s) => s.show);
  const rowMenu = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    if (!isSel(rows[i])) selectRow(i, { ctrlKey: false, metaKey: false, shiftKey: false });
    const r = rows[i];
    const a = r?.kind === "task" ? r.a : null;
    const items: CtxItem[] = [
      { label: "Insert Task", onClick: () => insertTask(), shortcut: "Ins" },
      { label: "Delete Task", onClick: deleteSelected, shortcut: "Del" },
      { label: a?.inactive ? "Activate Task" : "Inactivate Task", onClick: toggleInactive, disabled: !a },
      "sep",
      { label: "Manually Schedule", onClick: () => setMode("manual"), disabled: !a, checked: a?.taskMode === "manual" },
      { label: "Auto Schedule", onClick: () => setMode("auto"), disabled: !a, checked: !!a && a.taskMode !== "manual" },
      "sep",
      { label: "Indent Task", onClick: indent, shortcut: "Alt+Shift+→" },
      { label: "Outdent Task", onClick: outdent, shortcut: "Alt+Shift+←" },
      { label: "Link Tasks", onClick: linkSelected, shortcut: "Ctrl+F2" },
      { label: "Unlink Tasks", onClick: unlinkSelected, shortcut: "Ctrl+Shift+F2" },
      "sep",
      { label: "Assign Resources…", onClick: () => useMsp.getState().open("assignResources"), disabled: !a, shortcut: "Alt+F10" },
      { label: "Notes…", onClick: () => useMsp.getState().open("taskInfo", "notes"), disabled: !a },
      { label: "Information…", onClick: () => useMsp.getState().open("taskInfo"), disabled: !a, shortcut: "Shift+F2" },
    ];
    ctxMenu(e.clientX, e.clientY, items);
  };
  const headMenu = (e: React.MouseEvent, f: Field) => {
    e.preventDefault();
    const hide = () => useMsp.getState().set({ hiddenCols: { ...m.hiddenCols, [table]: [...(m.hiddenCols[table] ?? []), f.key] }, extraCols: { ...m.extraCols, [table]: (m.extraCols[table] ?? []).filter((k) => k !== f.key) } });
    ctxMenu(e.clientX, e.clientY, [
      { label: "Insert Column", onClick: () => setAddOpen(true) },
      { label: "Hide Column", onClick: hide, disabled: f.key === "name" },
      { label: "Show All Columns", onClick: () => useMsp.getState().set({ hiddenCols: { ...m.hiddenCols, [table]: [] } }), disabled: !(m.hiddenCols[table] ?? []).length },
      "sep",
      { label: "Sort Ascending", onClick: () => useMsp.getState().set({ sort: { by: (["start", "finish", "priority", "duration", "name", "cost"].includes(f.key) ? f.key : "id") as never, desc: false } }) },
      { label: "Sort Descending", onClick: () => useMsp.getState().set({ sort: { by: (["start", "finish", "priority", "duration", "name", "cost"].includes(f.key) ? f.key : "id") as never, desc: true } }) },
    ]);
  };
  const addColumn = (key: string) => {
    setAddOpen(false);
    const hidden = m.hiddenCols[table] ?? [];
    if (hidden.includes(key)) useMsp.getState().set({ hiddenCols: { ...m.hiddenCols, [table]: hidden.filter((k) => k !== key) } });
    else if (!cols.some((c) => c.key === key)) useMsp.getState().set({ extraCols: { ...m.extraCols, [table]: [...(m.extraCols[table] ?? []), key] } });
  };
  const resizeCol = (e: React.MouseEvent, f: Field) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = f.width;
    const mv = (ev: MouseEvent) => setWidths((w) => ({ ...w, [f.key]: Math.max(24, w0 + ev.clientX - x0) }));
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", () => window.removeEventListener("mousemove", mv), { once: true });
  };
  const resizeSplit = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = m.sheetWidth;
    const mv = (ev: MouseEvent) => useMsp.getState().set({ sheetWidth: Math.max(160, Math.min(window.innerWidth - 120, w0 + ev.clientX - x0)) });
    window.addEventListener("mousemove", mv);
    window.addEventListener("mouseup", () => window.removeEventListener("mousemove", mv), { once: true });
  };

  // ---- cells ----
  const cell = (r: SheetRow | undefined, i: number, f: Field): ReactNode => {
    const isEdit = edit && edit.row === i && edit.col === f.key;
    if (isEdit) {
      if (f.key === "mode")
        return (
          <select autoFocus value={/man/i.test(edit.value) ? "Manually Scheduled" : "Auto Scheduled"} onChange={(e) => setEdit({ ...edit, value: e.target.value })} onBlur={() => commit()} onKeyDown={(e) => (e.key === "Enter" ? commit(1) : e.key === "Escape" ? setEdit(null) : null)}>
            <option>Manually Scheduled</option>
            <option>Auto Scheduled</option>
          </select>
        );
      return (
        <input
          autoFocus
          value={edit.value}
          onChange={(e) => setEdit({ ...edit, value: e.target.value })}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit(1);
            else if (e.key === "Escape") (setEdit(null), sheetRef.current?.focus());
            else if (e.key === "Tab") (e.preventDefault(), commit(0), setActive({ row: i, col: cols[Math.min(cols.length - 1, cols.findIndex((c) => c.key === f.key) + (e.shiftKey ? -1 : 1))].key }));
          }}
        />
      );
    }
    if (!r) return "";
    if (f.key === "ind" && r.kind === "task")
      return indicators(r.a).map((g) => (
        <span key={g.glyph} className={`msp-ind ${g.cls ?? ""}`} title={g.title}>
          {g.glyph}
        </span>
      ));
    if (f.key === "mode") return r.kind === "task" || r.kind === "wbs" ? <span title={r.kind === "task" && r.a.taskMode === "manual" ? "Manually Scheduled" : "Auto Scheduled"}><ModeGlyph manual={r.kind === "task" && r.a.taskMode === "manual"} /></span> : "";
    if (f.key === "name") {
      const outline = format.outlineNumber && r.id ? `${ctx.outline.get(r.id) ?? ""} ` : "";
      const pad = 4 + r.depth * 14;
      if (r.kind === "wbs" || r.kind === "project" || r.kind === "group")
        return (
          <span className="msp-namecell" style={{ paddingLeft: pad }}>
            {r.kind === "wbs" ? (
              <button className="msp-twisty" onClick={(e) => (e.stopPropagation(), toggleWbs(r.id))} aria-label={r.collapsed ? "Expand" : "Collapse"}>
                {r.collapsed ? "▷" : "◢"}
              </button>
            ) : (
              <span className="msp-twisty">{r.kind === "project" ? "◢" : ""}</span>
            )}
            {outline}
            {r.name}
          </span>
        );
      return (
        <span className="msp-namecell" style={{ paddingLeft: pad + 14 }} title={r.a.name}>
          {outline}
          {r.a.name}
        </span>
      );
    }
    const txt = f.text(r, ctx);
    return txt === "NA" && r.kind !== "task" ? "" : txt;
  };

  // ---- chart ----
  const linkPaths = useMemo(() => {
    if (!chart || !format.linkLines) return [];
    const out: { d: string; crit: boolean }[] = [];
    const lo = first;
    const hi = Math.min(last, rows.length);
    const mid = (i: number) => HEAD + i * ROW + ROW / 2;
    for (const rel of schedule.relationships) {
      const pi = rowIndex.get(rel.predecessorId);
      const si = rowIndex.get(rel.successorId);
      if (pi === undefined || si === undefined) continue;
      if ((pi < lo && si < lo) || (pi >= hi && si >= hi)) continue;
      const p = (rows[pi] as Extract<SheetRow, { kind: "task" }>).a;
      const s = (rows[si] as Extract<SheetRow, { kind: "task" }>).a;
      if (p.start === null || p.finish === null || s.start === null || s.finish === null) continue;
      const y1 = mid(pi);
      const y2 = mid(si);
      const down = y2 > y1;
      const edge = y2 + (down ? -6 : 6);
      const fromEnd = rel.type === "FS" || rel.type === "FF";
      const toStart = rel.type === "FS" || rel.type === "SS";
      const x1 = x(fromEnd ? p.finish : p.start);
      const x2 = x(toStart ? s.start : s.finish);
      let d: string;
      if (rel.type === "FS" && x2 >= x1 + 6) d = `M${x1},${y1} H${x2 + 3} V${edge}`;
      else if (toStart) {
        const out1 = fromEnd ? x1 + 6 : x1 - 8;
        const yMid = y1 + (down ? ROW / 2 : -ROW / 2);
        d = `M${x1},${y1} H${out1} V${yMid} H${x2 - 8} V${y2} H${x2 - 1}`;
      } else {
        const xr = Math.max(x1, x2) + 8;
        d = fromEnd ? `M${x1},${y1} H${xr} V${y2} H${x2 + 1}` : `M${x1},${y1} H${x1 - 8} V${y1 + (down ? ROW / 2 : -ROW / 2)} H${xr} V${y2} H${x2 + 1}`;
      }
      out.push({ d, crit: (format.criticalTasks || tracking) && p.critical && s.critical });
    }
    return out;
  }, [chart, format.linkLines, format.criticalTasks, tracking, schedule.relationships, rowIndex, rows, first, last, px, span]);

  const bar = (r: SheetRow, i: number): ReactNode => {
    const f = r.fig;
    if (f.start === null || f.finish === null) return null;
    const top = HEAD + i * ROW;
    if (r.kind !== "task") {
      if (r.kind === "group") return <div className="mspg-group" style={{ top: top + 7, left: x(f.start), width: Math.max(3, x(f.finish) - x(f.start)) }} />;
      return <div className={`mspg-summary ${r.kind === "project" ? "project" : ""}`} style={{ top: top + 6, left: x(f.start), width: Math.max(4, x(f.finish) - x(f.start)) }} />;
    }
    const a = r.a;
    if (a.hideBar) return null;
    const isMs = a.type === "milestone" || a.type === "finish-milestone";
    const crit = (format.criticalTasks || tracking) && a.critical && a.status !== "complete";
    const late = format.lateTasks && schedule.dataDate !== null && a.status !== "complete" && a.finish !== null && a.finish < schedule.dataDate;
    const dragging = drag?.id === a.id ? drag : null;
    const shift = dragging?.kind === "move" ? dragging.dx : 0;
    const stretch = dragging?.kind === "finish" ? dragging.dx : 0;
    const sx = x(a.start!) + shift;
    const w = Math.max(2, x(a.finish!) - x(a.start!) + stretch);
    const showBl = (format.baseline || tracking) && a.baselineStart !== null && a.baselineFinish !== null;
    const label = tracking || format.barText === "none" ? "" : format.barText === "name" ? a.name : (ctx.resNames.get(a.id) ?? "");
    const parts: ReactNode[] = [];
    if (format.slack && a.lateFinish != null && a.lateFinish > a.finish!) parts.push(<div key="sl" className="mspg-slack" style={{ top: top + 14, left: x(a.finish!), width: x(a.lateFinish) - x(a.finish!) }} />);
    if (showBl) {
      const bms = a.baselineFinish! - a.baselineStart! < 60_000;
      parts.push(bms ? <div key="bl" className="mspg-blms" style={{ top: top + 11, left: x(a.baselineStart!) - 5 }} /> : <div key="bl" className={`mspg-baseline ${tracking ? "tracking" : ""}`} style={{ top: top + (tracking ? 11 : 13), left: x(a.baselineStart!), width: Math.max(2, x(a.baselineFinish!) - x(a.baselineStart!)) }} />);
    }
    const onDown = (kind: "move" | "finish") => (e: React.MouseEvent) => {
      if (e.button !== 0 || a.status === "complete") return;
      e.stopPropagation();
      selectRow(i, e);
      setDrag({ id: a.id, kind, x0: e.clientX, dx: 0 });
    };
    if (isMs) {
      parts.push(<div key="ms" className={`mspg-ms ${crit ? "crit" : ""} ${a.inactive ? "inactive" : ""}`} style={{ top: top + 5, left: sx - 6 }} onMouseDown={onDown("move")} title={`${a.name}\n${mspDateText(a.start)}`} />);
      parts.push(
        <span key="lbl" className="mspg-label" style={{ top, left: sx + 9 }}>
          {String(new Date(a.start!).getUTCDate()).padStart(2, "0")}/{String(new Date(a.start!).getUTCMonth() + 1).padStart(2, "0")}
        </span>,
      );
    } else {
      const cls = ["mspg-bar", a.taskMode === "manual" ? "manual" : "", crit ? "crit" : "", late ? "late" : "", a.inactive ? "inactive" : "", tracking ? "tracking" : "", showBl && !tracking ? "with-bl" : ""].join(" ");
      parts.push(
        <div key="bar" className={cls} style={{ top: top + (tracking ? 4 : 5), left: sx, width: w }} onMouseDown={onDown("move")} title={`${a.name}\nStart: ${mspDateText(a.start)}\nFinish: ${mspDateText(a.finish)}\nDuration: ${ctx.hpd ? Math.round(((a.originalDurationHours ?? 0) / ctx.hpd) * 10) / 10 : 0} days`}>
          <div className="mspg-prog" style={{ width: `${a.percentComplete}%` }} />
          {tracking && a.percentComplete > 0 && <span className="mspg-pct">{Math.round(a.percentComplete)}%</span>}
          <div className="mspg-grip" onMouseDown={onDown("finish")} />
        </div>,
      );
      if (label) parts.push(<span key="lbl" className="mspg-label" style={{ top, left: sx + w + 6 }}>{label}</span>);
    }
    if (a.deadline != null) parts.push(<div key="dl" className={`mspg-deadline ${missedDeadline(a) ? "missed" : ""}`} style={{ top: top + 2, left: x(a.deadline) - 5 }} title={`Deadline ${mspDateText(a.deadline)}`} />);
    return parts;
  };

  const blank = Math.max(0, Math.min(last, total) - Math.max(first, rows.length));
  const rowCls = (r: SheetRow | undefined, i: number) =>
    ["mspg-row", r?.kind ?? "blank", r && isSel(r) ? "sel" : "", r && highlighted(r) ? "hl" : "", r?.kind === "task" && r.a.inactive ? "inactive" : "", active?.row === i ? "cur" : "", r?.kind === "wbs" || r?.kind === "project" ? "bold" : ""].join(" ");

  return (
    <div className={`mspg ${chart ? "" : "sheet-only"}`}>
      <div className="mspg-sheet" ref={sheetRef} tabIndex={0} onScroll={onScroll("sheet")} onKeyDown={onKey} style={chart ? { width: m.sheetWidth } : undefined}>
        <div style={{ width: sheetW, height: HEAD + total * ROW, position: "relative" }}>
          <div className="mspg-head" style={{ width: sheetW }}>
            {cols.map((f) => (
              <span key={f.key} className="mspg-hcell" style={{ width: f.width, textAlign: f.align }} onContextMenu={(e) => headMenu(e, f)} title={f.label}>
                {f.key === "mode" ? <ModeGlyph /> : f.label}
                <i className="mspg-resize" onMouseDown={(e) => resizeCol(e, f)} />
              </span>
            ))}
            <span className="mspg-hcell add" style={{ width: 120 }} onClick={() => setAddOpen(!addOpen)}>
              Add New Column ▾
            </span>
            {addOpen && (
              <div className="mspg-addcol" onMouseLeave={() => setAddOpen(false)}>
                {FIELDS.filter((f) => !cols.some((c) => c.key === f.key) && f.key !== "ind")
                  .sort((p, q) => p.label.localeCompare(q.label))
                  .map((f) => (
                    <button key={f.key} onClick={() => addColumn(f.key)}>
                      {f.label}
                    </button>
                  ))}
              </div>
            )}
          </div>
          {visible.map((r, k) => {
            const i = first + k;
            return (
              <div
                key={r.key}
                className={rowCls(r, i)}
                style={{ top: HEAD + i * ROW, width: sheetW }}
                onMouseDown={(e) => (e.button === 0 ? selectRow(i, e) : null)}
                onContextMenu={(e) => rowMenu(e, i)}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest("input,select")) return;
                  if (r.kind === "task") useMsp.getState().open("taskInfo");
                  else if (r.kind === "wbs") toggleWbs(r.id);
                }}
              >
                {cols.map((f) => (
                  <span
                    key={f.key}
                    className={`mspg-cell ${f.key === "id" ? "idcell" : ""} ${active?.row === i && active.col === f.key ? "active" : ""}`}
                    style={{ width: f.width, textAlign: f.align }}
                    onMouseDown={() => setActive({ row: i, col: f.key })}
                    onDoubleClick={(e) => {
                      if (f.key !== "id" && editable(r, f) && f.key !== "name") (e.stopPropagation(), startEdit(i, f.key));
                    }}
                  >
                    {cell(r, i, f)}
                  </span>
                ))}
              </div>
            );
          })}
          {Array.from({ length: blank }, (_, k) => {
            const i = Math.max(first, rows.length) + k;
            return (
              <div key={`b${i}`} className={rowCls(undefined, i)} style={{ top: HEAD + i * ROW, width: sheetW }} onMouseDown={(e) => selectRow(i, e)}>
                {cols.map((f) => (
                  <span key={f.key} className={`mspg-cell ${f.key === "id" ? "idcell" : ""} ${active?.row === i && active.col === f.key ? "active" : ""}`} style={{ width: f.width }} onMouseDown={() => setActive({ row: i, col: f.key })} onDoubleClick={() => startEdit(i, f.key)}>
                    {cell(undefined, i, f)}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {chart && <div className="mspg-split" onMouseDown={resizeSplit} role="separator" aria-orientation="vertical" />}
      {chart && (
        <div className="mspg-chart" ref={chartRef} onScroll={onScroll("chart")}>
          <div style={{ width: chartW, height: HEAD + total * ROW, position: "relative" }}>
            <div className="mspg-scale" style={{ width: chartW }}>
              {scale.top.map((t) => (
                <span key={`t${t.t}`} className="tier top" style={{ left: x(t.t), width: x(t.end) - x(t.t) }}>
                  {t.label}
                </span>
              ))}
              {scale.bottom.map((t) => (
                <span key={`b${t.t}`} className="tier bottom" style={{ left: x(t.t), width: x(t.end) - x(t.t) }}>
                  {x(t.end) - x(t.t) >= 9 ? t.label : ""}
                </span>
              ))}
            </div>
            {offDays.map((t) => (
              <div key={t} className="mspg-off" style={{ left: x(t), width: px, top: HEAD, height: total * ROW }} />
            ))}
            {schedule.dataDate !== null && <div className="mspg-status" style={{ left: x(schedule.dataDate), top: HEAD, height: total * ROW }} title={`Status date ${mspDateText(schedule.dataDate)}`} />}
            {format.gridlines && visible.map((r, k) => <div key={`g${r.key}`} className="mspg-gridline" style={{ top: HEAD + (first + k + 1) * ROW - 1, width: chartW }} />)}
            {visible.map((r, k) => (r && isSel(r) ? <div key={`s${r.key}`} className="mspg-chart-sel" style={{ top: HEAD + (first + k) * ROW, width: chartW }} /> : null))}
            <svg className="mspg-links" width={chartW} height={HEAD + total * ROW}>
              <defs>
                <marker id="mspg-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                  <path d="M0,0 L6,3 L0,6 z" fill="context-stroke" />
                </marker>
              </defs>
              {linkPaths.map((p, k) => (
                <path key={k} d={p.d} className={p.crit ? "crit" : ""} markerEnd="url(#mspg-arrow)" />
              ))}
            </svg>
            {visible.map((r, k) => (
              <div key={`r${r.key}`} className="mspg-barrow" onContextMenu={(e) => rowMenu(e, first + k)} onDoubleClick={() => r.kind === "task" && useMsp.getState().open("taskInfo")}>
                {bar(r, first + k)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
