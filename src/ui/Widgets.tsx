import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { kpiActivities } from "../core/drill";
import { EXTRA_KPIS, type ExtraMetric } from "../core/kpiExtra";
import {
  activityRows,
  compact,
  controlRows,
  type ControlRow,
  fmtDay,
  kpi,
  lookahead,
  milestoneRows,
  portfolioRow,
  resourceHistogram,
  sCurves,
  statusMix,
  type ActivityRow,
  type MilestoneState,
} from "../core/dashboardData";
import { applySlices, groupOf, groupValues, progressCurve, progressTable } from "../core/progress";
import { quantityCurve } from "../core/quantities";
import { widgetCols, widgetRows, type Dashboard, type KpiMetric, type TableColumn, type TableFilter, type Widget, type WidgetKind } from "../core/reporting";
import { scheduleRange } from "../core/simulation";
import type { Schedule } from "../core/types";
import { ComboChart, Donut, Gauge, GroupBars, LineChart, OTHER, PeriodBars, pct, pct2, SERIES, STATUS, StackedBars, type ComboPeriod } from "./charts";
import { useStore } from "./store";

export type WidgetGroup = "Numbers" | "Charts" | "Tables" | "Layout";

export const WIDGET_KINDS: { kind: WidgetKind; label: string; group: WidgetGroup; hint: string; defaults: Partial<Widget> }[] = [
  { kind: "kpi", label: "KPI tile", group: "Numbers", hint: "One number: SPI, finish date, % complete…", defaults: { w: 3, h: 1, metric: "spi" } },
  { kind: "gauge", label: "Gauge", group: "Numbers", hint: "Dial with red / amber / green bands", defaults: { w: 3, h: 1.5, metric: "spi", good: 1, bad: 0.9 } },
  { kind: "info", label: "Key figures table", group: "Numbers", hint: "Label and value rows, computed or typed", defaults: { w: 6, h: 2, rows: [{ label: "Overall progress", metric: "percentComplete" }, { label: "Remarks", metric: null, value: "" }] } },
  { kind: "donut", label: "Status donut", group: "Numbers", hint: "Activity status, float bands or critical share", defaults: { w: 3, h: 2, split: "status" } },
  { kind: "scurve", label: "Cost / hours S-curve", group: "Charts", hint: "Planned, earned, actual and forecast", defaults: { w: 6, h: 2, measure: "cost" } },
  { kind: "pscurve", label: "Progress S-curve (%)", group: "Charts", hint: "Cumulative plan vs actual % with period bars", defaults: { w: 12, h: 3, basis: "cost", step: "month" } },
  { kind: "phasecurves", label: "S-curve per phase", group: "Charts", hint: "One small S-curve per discipline (E, P, C…)", defaults: { w: 12, h: 2, dimension: "wbs1", basis: "cost", step: "month" } },
  { kind: "groupbars", label: "Plan vs actual by group", group: "Charts", hint: "Bars per discipline, WBS or activity code", defaults: { w: 6, h: 2, dimension: "wbs1", basis: "cost" } },
  { kind: "histogram", label: "Resource histogram", group: "Charts", hint: "Weekly labour and plant hours", defaults: { w: 6, h: 2 } },
  { kind: "quantity", label: "Quantity curve", group: "Charts", hint: "Installed quantity from the 3D model", defaults: { w: 6, h: 2 } },
  { kind: "table", label: "Activity table", group: "Tables", hint: "Pick the filter, columns and sort", defaults: { w: 12, h: 2, filter: "critical", limit: 15 } },
  { kind: "milestones", label: "Milestone tracker", group: "Tables", hint: "Baseline vs forecast, days late, status", defaults: { w: 6, h: 2.5, limit: 12 } },
  { kind: "lookahead", label: "Look-ahead", group: "Tables", hint: "Work starting or running in the next weeks", defaults: { w: 6, h: 2.5, weeks: 3, limit: 30 } },
  { kind: "progress", label: "Progress table (BL plan vs actual)", group: "Tables", hint: "Weighted rows with a TOTAL line", defaults: { w: 12, h: 2, dimension: "wbs1", basis: "cost", totalLabel: "TOTAL" } },
  { kind: "portfolio", label: "Portfolio table", group: "Tables", hint: "One row per project in the database", defaults: { w: 12, h: 2 } },
  { kind: "banner", label: "Section banner", group: "Layout", hint: "Coloured heading across the page", defaults: { w: 12, h: 0.5, title: "Progress {datadate}" } },
  { kind: "text", label: "Text / note", group: "Layout", hint: "Commentary, with {project} and {datadate}", defaults: { w: 12, h: 1, text: "Notes for this report." } },
  { kind: "image", label: "Image / logo", group: "Layout", hint: "Logo, site photo or a drawing", defaults: { w: 3, h: 1.5, fit: "contain" } },
  { kind: "slicer", label: "Filter buttons (slicer)", group: "Layout", hint: "Click to filter every widget", defaults: { w: 4, h: 1, dimension: "wbs1" } },
  { kind: "cards", label: "Figure cards", group: "Numbers", hint: "Grid of dates, %s and durations, computed or typed", defaults: { w: 4, h: 1.5, cardCols: 3, rows: [{ label: "Baseline UTM", metric: "blUtm" }, { label: "Estimated UTM", metric: "estUtm" }, { label: "Actual to date", metric: "actualPct" }] } },
  { kind: "controltable", label: "Discipline control table", group: "Tables", hint: "Weight, BL plan, actual, variance, BL and estimated finish", defaults: { w: 12, h: 2.5, dimension: "wbs1", basis: "hours", cutoff: "monthstart" } },
  { kind: "combo", label: "S-curve with histograms", group: "Charts", hint: "Cumulative weight % and monthly bars, labels, date slider", defaults: { w: 12, h: 4, basis: "hours", step: "month", showLabels: true } },
];

export const TABLE_COLUMNS: { id: TableColumn; label: string }[] = [
  { id: "code", label: "ID" },
  { id: "name", label: "Name" },
  { id: "wbs", label: "WBS" },
  { id: "status", label: "Status" },
  { id: "percent", label: "%" },
  { id: "start", label: "Start" },
  { id: "finish", label: "Finish" },
  { id: "blStart", label: "BL Start" },
  { id: "blFinish", label: "BL Finish" },
  { id: "actualStart", label: "Act. Start" },
  { id: "actualFinish", label: "Act. Finish" },
  { id: "variance", label: "Var (d)" },
  { id: "totalFloat", label: "TF (d)" },
  { id: "origDur", label: "Orig. Dur (d)" },
  { id: "remDur", label: "Rem. Dur (d)" },
  { id: "critical", label: "Critical" },
];
export const DEFAULT_COLUMNS: TableColumn[] = ["code", "name", "percent", "start", "finish", "blFinish", "variance", "totalFloat"];

/** Fill {project} and {datadate} in titles and notes. */
export function fillText(t: string, s: Schedule | null): string {
  return t
    .replace(/\{datadate\}/g, fmtDay(s?.dataDate ?? null))
    .replace(/\{project\}/g, s ? `${s.projectCode} – ${s.projectName}` : "")
    .replace(/\{baseline\}/g, s?.baselineInfo?.name ?? "project baseline")
    .replace(/\{baselinedate\}/g, s?.baselineInfo ? fmtDay(s.baselineInfo.dataDate) : fmtDay(s?.dataDate ?? null));
}

/** A widget's schedule: dashboard slicers (unless ignored), then its own filters. */
export function widgetSchedule(raw: Schedule | null, w: Widget, slices: Dashboard["slices"]): Schedule | null {
  if (!raw || w.kind === "slicer") return raw;
  let s = raw;
  if (!w.ignoreSlicers && slices?.length) s = applySlices(s, slices);
  if (w.where?.length) s = applySlices(s, w.where);
  return s;
}

/** Card wrapper shared by the editor, the dashboard and the PDF. */
export function WidgetFrame({
  w,
  dash,
  schedule,
  className = "",
  children,
  header,
  tools,
  ...rest
}: {
  w: Widget;
  dash: Dashboard;
  schedule: Schedule | null;
  className?: string;
  children: ReactNode;
  header?: ReactNode;
  tools?: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  const st = w.style ?? {};
  const border = st.border ?? dash.page?.border ?? "card";
  const accent = st.accent ?? dash.page?.accent;
  const style: CSSProperties & Record<string, string | number | undefined> = {
    gridColumn: `span ${widgetCols(w.w)}`,
    gridRow: `span ${widgetRows(w.h)}`,
    background: st.background,
    color: st.color,
    textAlign: st.align,
    "--w-accent": accent,
    "--w-scale": st.fontScale,
  };
  const hide = st.hideTitle || w.kind === "banner";
  return (
    <section {...rest} className={`widget kind-${w.kind} border-${border} head-${st.header ?? "plain"} ${className}`} style={style} data-cols={widgetCols(w.w)}>
      {(!hide || tools) && (
        <header className={hide ? "title-hidden" : ""}>
          {header}
          {!hide && <span className="widget-title">{fillText(w.title, schedule)}</span>}
          {tools}
        </header>
      )}
      <div className="widget-body">{children}</div>
    </section>
  );
}

export const KPI_LABELS: Record<KpiMetric, string> = {
  finish: "Forecast finish",
  finishVariance: "Finish variance vs baseline",
  dataDate: "Data date",
  percentComplete: "% complete",
  spi: "SPI",
  cpi: "CPI",
  bac: "Budget (BAC)",
  eac: "Estimate at completion (EAC)",
  vac: "Variance at completion (VAC)",
  ev: "Earned value (EV)",
  ac: "Actual cost (AC)",
  activities: "Number of activities",
  critical: "Open critical activities",
  late: "Late against baseline",
  startingSoon: "Starting soon",
  actualPct: "Actual % (weighted)",
  blPlanPct: "Baseline plan % at data date",
  estPlanPct: "Current plan % at data date",
  sai: "Schedule adherence index",
  blUtm: "Baseline UTM (to month end)",
  estUtm: "Estimated UTM",
  estFtm: "Estimated FTM (this month)",
  actFtm: "Actual FTM (this month)",
  gapFtm: "Shortfall FTM",
  start: "Estimated start",
  blStart: "Baseline start",
  blFinish: "Baseline finish",
  blDuration: "Baseline duration (months)",
  estDuration: "Estimated duration (months)",
  elapsed: "Elapsed duration (months)",
  elapsedPct: "Elapsed duration %",
  remainingDuration: "Remaining duration (months)",
  overrun: "Overrun (months)",
  ...(Object.fromEntries(Object.entries(EXTRA_KPIS).map(([k, d]) => [k, d.label])) as Record<ExtraMetric, string>),
};

export const FILTER_LABELS: Record<TableFilter, string> = {
  critical: "Critical (open)",
  late: "Late or critical",
  "in-progress": "In progress",
  "starting-soon": "Starting soon",
  "finishing-soon": "Finishing soon",
  "negative-float": "Negative float",
  all: "All activities",
};

export interface PortfolioEntry {
  id: string;
  schedule: Schedule;
}

export interface SliceProps {
  slices: { dimension: string; values: string[] }[];
  onSlices?: (s: { dimension: string; values: string[] }[]) => void;
  /** The schedule before slicers are applied (slicers list every value). */
  raw: Schedule | null;
}

export function WidgetView({ w, schedule, portfolio, slice }: { w: Widget; schedule: Schedule | null; portfolio: PortfolioEntry[] | null; slice?: SliceProps }) {
  if (w.kind === "text") return <div className="widget-text">{fillText(w.text ?? "", schedule)}</div>;
  if (w.kind === "portfolio") return <PortfolioTable entries={portfolio} />;
  if (w.kind === "banner") return <div className="report-banner">{fillText(w.title, schedule)}</div>;
  if (w.kind === "image")
    return w.image ? <img className="widget-image" src={w.image} alt={w.title} style={{ objectFit: w.fit ?? "contain" }} /> : <p className="muted">Choose an image in the widget settings.</p>;
  if (!schedule) return <p className="muted">No project selected for this widget.</p>;
  switch (w.kind) {
    case "progress":
      return <ProgressTableView w={w} schedule={schedule} />;
    case "pscurve":
      return <ProgressSCurve w={w} schedule={schedule} />;
    case "info":
      return <InfoTable w={w} schedule={schedule} />;
    case "slicer":
      return <Slicer w={w} raw={slice?.raw ?? schedule} slice={slice} />;
    case "kpi": {
      const k = kpiFormatted(schedule, w);
      return (
        <Drill w={w} schedule={schedule}>
          <div className="kpi" title={k.hint}>
            <div className={`kpi-value ${k.tone ?? ""}`}>{k.value}</div>
            {k.hint && <div className="muted kpi-hint">{k.hint}</div>}
          </div>
        </Drill>
      );
    }
    case "gauge":
      return (
        <Drill w={w} schedule={schedule}>
          <GaugeWidget w={w} schedule={schedule} />
        </Drill>
      );
    case "donut":
      return <DonutWidget w={w} schedule={schedule} slice={slice} />;
    case "cards":
      return <Cards w={w} schedule={schedule} />;
    case "controltable":
      return <ControlTable w={w} schedule={schedule} slice={slice} />;
    case "combo":
      return <ComboWidget w={w} schedule={schedule} />;
    case "groupbars":
      return <GroupBarsWidget w={w} schedule={schedule} slice={slice} />;
    case "phasecurves":
      return <PhaseCurves w={w} schedule={schedule} />;
    case "milestones":
      return <MilestoneTable w={w} schedule={schedule} />;
    case "lookahead":
      return <Lookahead w={w} schedule={schedule} />;
    case "scurve":
      return <SCurve schedule={schedule} measure={w.measure} w={w} />;
    case "histogram":
      return <Histogram schedule={schedule} />;
    case "table":
      return <ActivityTable schedule={schedule} w={w} />;
    case "quantity":
      return <QuantityWidget schedule={schedule} quantityKey={w.quantityKey} />;
    default:
      return null;
  }
}

function SCurve({ schedule, measure, w }: { schedule: Schedule; measure?: "cost" | "hours"; w: Widget }) {
  const hasCost = (schedule.assignments ?? []).some((x) => x.budgetCost > 0);
  const m = measure === "hours" || !hasCost ? "hours" : "cost";
  const pts = useMemo(() => sCurves(schedule, m), [schedule, m]);
  if (!pts.length) return <p className="muted">No cost or labour data in this project.</p>;
  return (
    <LineChart
      title=""
      unit={m === "hours" ? "h" : ""}
      area={w.chart === "area"}
      legend={w.showLegend !== false}
      series={[
        { id: "pv", label: "Planned", color: SERIES[0], points: pts.map((p) => ({ t: p.t, v: p.pv })) },
        { id: "ev", label: "Earned", color: SERIES[1], points: pts.map((p) => ({ t: p.t, v: p.ev })) },
        { id: "ac", label: "Actual", color: SERIES[2], points: pts.map((p) => ({ t: p.t, v: p.ac })) },
        { id: "fc", label: "Forecast", color: SERIES[3], dashed: true, points: pts.map((p) => ({ t: p.t, v: p.forecast })) },
      ].filter((x) => !w.hiddenSeries?.includes(x.id))}
      markers={schedule.dataDate !== null ? [{ t: schedule.dataDate, label: "Data date", color: "#1f6feb" }] : []}
    />
  );
}

function Histogram({ schedule }: { schedule: Schedule }) {
  const res = (schedule.resources ?? []).filter((r) => r.type !== "material");
  const hist = useMemo(() => resourceHistogram(schedule, { resourceIds: res.map((r) => r.id) }), [schedule, res]);
  const color = new Map((schedule.resources ?? []).map((r, i) => [r.id, i < SERIES.length ? SERIES[i] : OTHER]));
  return (
    <StackedBars
      title=""
      bars={hist.bars.map((b) => ({ t: b.t, values: b.byResource }))}
      series={hist.resources.map((r) => ({ id: r.id, label: r.code, color: color.get(r.id)! }))}
      unit="h"
      marker={schedule.dataDate !== null ? { t: schedule.dataDate, label: "Data date", color: "#1f6feb" } : undefined}
    />
  );
}

function cellOf(r: ActivityRow, c: TableColumn, s: Schedule): { text: string; sort: number | string; cls?: string } {
  switch (c) {
    case "code":
      return { text: r.code, sort: r.code };
    case "name":
      return { text: r.name, sort: r.name };
    case "wbs":
      return { text: groupOf(r.activity, "wbs2", s), sort: groupOf(r.activity, "wbs2", s) };
    case "status":
      return { text: r.status === "complete" ? "Complete" : r.status === "in-progress" ? "In progress" : "Not started", sort: r.status };
    case "percent":
      return { text: String(Math.round(r.percent)), sort: r.percent };
    case "start":
      return { text: fmtDay(r.start), sort: r.start ?? 0 };
    case "finish":
      return { text: fmtDay(r.finish), sort: r.finish ?? 0 };
    case "blStart":
      return { text: fmtDay(r.baselineStart), sort: r.baselineStart ?? 0 };
    case "blFinish":
      return { text: fmtDay(r.baselineFinish), sort: r.baselineFinish ?? 0 };
    case "actualStart":
      return { text: fmtDay(r.actualStart), sort: r.actualStart ?? 0 };
    case "actualFinish":
      return { text: fmtDay(r.actualFinish), sort: r.actualFinish ?? 0 };
    case "variance":
      return { text: r.varianceDays === null ? "" : String(r.varianceDays), sort: r.varianceDays ?? -Infinity, cls: (r.varianceDays ?? 0) > 0 ? "bad" : "" };
    case "totalFloat":
      return { text: r.totalFloatDays === null ? "" : String(r.totalFloatDays), sort: r.totalFloatDays ?? Infinity, cls: (r.totalFloatDays ?? 0) < 0 ? "bad" : "" };
    case "origDur":
      return { text: r.origDurDays === null ? "" : String(r.origDurDays), sort: r.origDurDays ?? 0 };
    case "remDur":
      return { text: r.remDurDays === null ? "" : String(r.remDurDays), sort: r.remDurDays ?? 0 };
    case "critical":
      return { text: r.critical ? "Yes" : "", sort: r.critical ? 1 : 0, cls: r.critical ? "bad" : "" };
    default: {
      const v = groupOf(r.activity, c.slice(4), s);
      return { text: v, sort: v };
    }
  }
}

export function columnLabel(c: TableColumn): string {
  if (c.startsWith("dim:")) {
    const d = c.slice(4);
    return d === "wbs1" ? "WBS L1" : d === "wbs2" ? "WBS L2" : d.replace(/^(code|user):/, "");
  }
  return TABLE_COLUMNS.find((x) => x.id === c)?.label ?? c;
}

function ActivityTable({ schedule, w }: { schedule: Schedule; w: Widget }) {
  const [localSort, setLocalSort] = useState<Widget["sort"] | null>(null);
  const sort = localSort ?? w.sort;
  const cols = w.columns?.length ? w.columns : DEFAULT_COLUMNS;
  const rows = useMemo(() => {
    const all = activityRows(schedule, w.filter ?? "critical", { days: w.days });
    if (sort) {
      const k = (r: ActivityRow) => cellOf(r, sort.by, schedule).sort;
      all.sort((a, b) => {
        const x = k(a);
        const y = k(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return sort.desc ? -c : c;
      });
    }
    return w.limit ? all.slice(0, w.limit) : all;
  }, [schedule, w.filter, w.days, w.limit, sort]);
  if (!rows.length) return <p className="muted">None.</p>;
  return (
    <table className="data">
      <thead>
        <tr>
          {cols.map((c) => (
            <th
              key={c}
              className="sortable"
              onClick={() => setLocalSort({ by: c, desc: sort?.by === c ? !sort.desc : false })}
              aria-sort={sort?.by === c ? (sort.desc ? "descending" : "ascending") : undefined}
            >
              {columnLabel(c)}
              {sort?.by === c ? (sort.desc ? " ▾" : " ▴") : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="clickable" title="Open in the schedule" onClick={() => goToActivity(schedule, r.id)}>
            {cols.map((c) => {
              const v = cellOf(r, c, schedule);
              return (
                <td key={c} className={v.cls}>
                  {c === "code" ? <b>{v.text}</b> : v.text}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** KPI value with the widget's decimals, prefix/suffix and thresholds. */
export function kpiFormatted(schedule: Schedule, w: Widget) {
  const k = kpi(schedule, w.metric ?? "spi", { measure: w.measure, days: w.days });
  const numeric = k.raw !== null && !["finish", "dataDate", "finishVariance"].includes(w.metric ?? "");
  let value = k.value;
  if (numeric && w.decimals !== undefined) {
    const raw = w.metric === "percentComplete" ? k.raw! * 100 : k.raw!;
    value = ["bac", "eac", "vac", "ev", "ac"].includes(w.metric ?? "") && Math.abs(raw) >= 1e4 ? compact(raw) : raw.toFixed(w.decimals);
    if (w.metric === "percentComplete" && w.suffix === undefined) value += "%";
  }
  if (w.prefix) value = w.prefix + value;
  if (w.suffix) value = value + w.suffix;
  let tone = k.tone;
  if (k.raw !== null && w.good !== undefined && w.bad !== undefined) {
    const v = w.metric === "percentComplete" ? k.raw * 100 : k.raw;
    const up = w.good >= w.bad;
    tone = up ? (v >= w.good ? "good" : v < w.bad ? "bad" : undefined) : v <= w.good ? "good" : v > w.bad ? "bad" : undefined;
  }
  return { ...k, value, tone };
}

function GaugeWidget({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const metric = w.metric ?? "spi";
  if (metric === "actualPct" || metric === "estPlanPct" || metric === "blPlanPct") {
    const plan = cutoffPlan(schedule, w);
    const v = kpi(schedule, metric, { basis: w.basis ?? "hours" }).raw;
    const tone = v === null ? undefined : v >= plan - 0.05 ? "good" : undefined;
    void tone;
    return (
      <div className="gauge-wrap">
        <Gauge value={v} min={0} max={100} label={w.title} fmt={(x) => x.toFixed(w.decimals ?? 1)} marker={metric === "actualPct" ? { value: plan, label: plan.toFixed(1) } : undefined} accent={STATUS.good} />
        {metric === "actualPct" && <div className="muted kpi-hint">Baseline plan {plan.toFixed(1)} ({cutoffLabel(w)})</div>}
      </div>
    );
  }
  const k = kpi(schedule, metric, { measure: w.measure, days: w.days });
  const isPct = metric === "percentComplete";
  const ratio = metric === "spi" || metric === "cpi";
  // % complete: the needle is actual; green from the baseline plan %.
  const plan = isPct ? progressTable(schedule, { dimension: "wbs1", basis: w.basis ?? "cost" }).total.plan : null;
  const good = w.good ?? (isPct && plan !== null ? plan : undefined);
  const bad = w.bad ?? (isPct && plan !== null ? Math.max(0, plan - 0.05) : undefined);
  const dec = w.decimals ?? (ratio ? 2 : 1);
  const fmt = isPct ? (v: number) => `${(v * 100).toFixed(w.decimals ?? 0)}%` : (v: number) => `${w.prefix ?? ""}${v.toFixed(dec)}${w.suffix ?? ""}`;
  const max = isPct ? 1 : ratio ? 1.5 : Math.max(1, (good ?? k.raw ?? 1) * 1.5);
  const min = ratio ? 0.5 : 0;
  return (
    <div className="gauge-wrap">
      <Gauge value={k.raw} min={min} max={max} good={isPct && w.good !== undefined ? w.good / 100 : good} bad={isPct && w.bad !== undefined ? w.bad / 100 : bad} label={w.title} fmt={fmt} />
      {isPct && plan !== null && <div className="muted kpi-hint">Baseline plan {(plan * 100).toFixed(1)}%</div>}
    </div>
  );
}

const TONE_COLOR: Record<string, string> = { good: STATUS.good, warning: STATUS.warning, serious: STATUS.serious, critical: STATUS.critical, neutral: "#b9bec6", info: STATUS.info };

function DonutWidget({ w, schedule, slice }: { w: Widget; schedule: Schedule; slice?: SliceProps }) {
  const dim = w.dimension ?? "wbs1";
  const weights = useMemo(
    () => (w.split === "weight" ? progressTable(schedule, { dimension: dim, basis: w.basis ?? "hours", weightage: w.weightage }).rows : []),
    [schedule, w.split, dim, w.basis, w.weightage],
  );
  if (w.split === "weight") {
    const sel = slice?.slices.find((x) => x.dimension === dim)?.values ?? [];
    return (
      <Donut
        caption="weight %"
        total="100%"
        fmtValue={(v) => `${(v * 100).toFixed(2)}%`}
        selected={sel}
        onPick={slice?.onSlices ? (id) => toggleSlice(slice, dim, id) : undefined}
        slices={weights.map((r, i) => ({ id: r.key, label: r.label, value: r.weightage, color: i < SERIES.length ? SERIES[i] : OTHER }))}
      />
    );
  }
  return <StatusDonut w={w} schedule={schedule} />;
}

function StatusDonut({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const mix = useMemo(() => statusMix(schedule, (w.split as "status" | "float" | "critical") ?? "status"), [schedule, w.split]);
  return <Donut caption={w.split && w.split !== "status" ? "open" : "activities"} slices={mix.map((m) => ({ id: m.id, label: m.label, value: m.value, color: TONE_COLOR[m.tone] }))} />;
}

function GroupBarsWidget({ w, schedule, slice }: { w: Widget; schedule: Schedule; slice?: SliceProps }) {
  const dim = w.dimension ?? "wbs1";
  const picked = slice?.slices.find((x) => x.dimension === dim)?.values ?? [];
  // Click a group to filter the whole dashboard to it (click again to clear).
  const pick = slice?.onSlices
    ? (key: string) => {
        if (key === "__total") return;
        const rest = (slice.slices ?? []).filter((x) => x.dimension !== dim);
        slice.onSlices!(picked.includes(key) ? rest : [...rest, { dimension: dim, values: [key] }]);
      }
    : undefined;
  const t = useMemo(() => progressTable(schedule, { dimension: w.dimension ?? "wbs1", basis: w.basis ?? "cost", weightage: w.weightage }), [schedule, w.dimension, w.basis, w.weightage]);
  const series = [
    { id: "plan", label: "Cum. BL plan %", color: SERIES[0] },
    { id: "actual", label: "Cum. actual %", color: SERIES[1] },
    { id: "forecast", label: "Forecast %", color: SERIES[3] },
  ].filter((x) => !(w.hiddenSeries ?? ["forecast"]).includes(x.id));
  return (
    <GroupBars
      onPick={pick}
      picked={picked}
      legend={w.showLegend !== false}
      fmt={(v) => `${(v * 100).toFixed(w.decimals ?? 1)}%`}
      series={series}
      rows={[...t.rows, { ...t.total, key: "__total", label: w.totalLabel || "TOTAL" }].map((r) => ({
        key: r.key,
        label: r.label,
        values: { plan: r.plan, actual: r.actual, forecast: r.forecast },
      }))}
    />
  );
}

function PhaseCurves({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const dim = w.dimension ?? "wbs1";
  const groups = useMemo(() => groupValues(schedule, dim).slice(0, 8), [schedule, dim]);
  const dd = schedule.dataDate;
  const curves = useMemo(
    () => groups.map((g) => ({ g, pts: progressCurve(applySlices(schedule, [{ dimension: dim, values: [g] }]), { basis: w.basis ?? "cost", step: w.step ?? "month" }) })).filter((c) => c.pts.length),
    [groups, schedule, dim, w.basis, w.step],
  );
  if (!curves.length) return <p className="muted">No weighted activities.</p>;
  return (
    <div className="phase-grid">
      {curves.map(({ g, pts }, i) => {
        const last = [...pts].reverse().find((p) => p.actual !== null);
        const planAt = pts.find((p) => dd !== null && p.t >= dd)?.plan ?? pts[pts.length - 1].plan;
        return (
          <div key={g} className="phase-cell">
            <div className="phase-head">
              <b>{g}</b>
              <span className="muted">
                Actual {pct(last?.actual ?? 0)} · Plan {pct(planAt)}
              </span>
            </div>
            <LineChart
              title=""
              yMax={1}
              fmt={(v) => pct(v)}
              legend={i === 0 && w.showLegend !== false}
              area={w.chart === "area"}
              compact
              series={[
                { id: "plan", label: "Plan", color: SERIES[0], points: pts.map((p) => ({ t: p.t, v: p.plan })) },
                { id: "actual", label: "Actual", color: SERIES[1], points: pts.map((p) => ({ t: p.t, v: p.actual })) },
                { id: "fc", label: "Forecast", color: SERIES[2], dashed: true, points: pts.filter((p) => dd === null || p.t >= dd - 31 * 86_400_000).map((p) => ({ t: p.t, v: p.forecast })) },
              ].filter((x) => !w.hiddenSeries?.includes(x.id))}
              markers={dd !== null ? [{ t: dd, label: "DD", color: "#0b2a8a" }] : []}
            />
          </div>
        );
      })}
    </div>
  );
}

const MS_LABEL: Record<MilestoneState, { label: string; tone: string; icon: string }> = {
  achieved: { label: "Achieved", tone: "good", icon: "✓" },
  "achieved-late": { label: "Achieved late", tone: "warning", icon: "✓" },
  "on-track": { label: "On track", tone: "good", icon: "●" },
  "at-risk": { label: "At risk", tone: "warning", icon: "▲" },
  late: { label: "Late", tone: "critical", icon: "■" },
};

function MilestoneTable({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const rows = useMemo(() => milestoneRows(schedule, { showDone: w.showDone, limit: w.limit, riskFloatDays: w.days ?? 5 }), [schedule, w.showDone, w.limit, w.days]);
  if (!rows.length) return <p className="muted">No milestones{w.showDone ? "" : " still open"}.</p>;
  return (
    <table className="data ms-table">
      <thead>
        <tr>
          <th>Milestone</th>
          <th>Baseline</th>
          <th>Forecast</th>
          <th>Var (d)</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const st = MS_LABEL[r.state];
          return (
            <tr key={r.id} className="clickable" title="Open in the schedule" onClick={() => goToActivity(schedule, r.id)}>
              <td>
                <b>{r.code}</b> {r.name}
              </td>
              <td>{fmtDay(r.baseline)}</td>
              <td>{fmtDay(r.forecast)}</td>
              <td className={(r.varianceDays ?? 0) > 0 ? "bad" : ""}>{r.varianceDays === null ? "" : r.varianceDays > 0 ? `+${r.varianceDays}` : r.varianceDays}</td>
              <td>
                <span className={`status-pill ${st.tone}`}>
                  <span aria-hidden>{st.icon}</span> {st.label}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Lookahead({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const weeks = useMemo(() => lookahead(schedule, w.weeks ?? 3, w.limit ?? 0), [schedule, w.weeks, w.limit]);
  if (!weeks.some((x) => x.rows.length)) return <p className="muted">Nothing starting or running in the window.</p>;
  return (
    <table className="data la-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Activity</th>
          <th>Start</th>
          <th>Finish</th>
          <th>%</th>
          <th>TF (d)</th>
        </tr>
      </thead>
      <tbody>
        {weeks.map((wk, i) => [
          <tr key={`h${i}`} className="la-week">
            <td colSpan={6}>
              Week {i + 1} · from {fmtDay(wk.from)} <span className="muted">({wk.rows.length})</span>
            </td>
          </tr>,
          ...wk.rows.map((r) => (
            <tr key={r.id} className="clickable" title="Open in the schedule" onClick={() => goToActivity(schedule, r.id)}>
              <td>
                <b>{r.code}</b>
              </td>
              <td>
                {r.critical && <span className="crit-dot" title="Critical" aria-label="Critical" />}
                {r.name}
              </td>
              <td>{fmtDay(r.start)}</td>
              <td>{fmtDay(r.finish)}</td>
              <td>{Math.round(r.percent)}</td>
              <td className={(r.totalFloatDays ?? 0) < 0 ? "bad" : ""}>{r.totalFloatDays ?? ""}</td>
            </tr>
          )),
        ])}
      </tbody>
    </table>
  );
}

function PortfolioTable({ entries }: { entries: PortfolioEntry[] | null }) {
  if (!entries) return <p className="muted">Loading projects…</p>;
  if (!entries.length) return <p className="muted">No projects in the database.</p>;
  const rows = entries.map((e) => portfolioRow(e.id, e.schedule));
  return (
    <table className="data">
      <thead>
        <tr>
          <th>Project</th>
          <th>Name</th>
          <th>Data date</th>
          <th>Finish</th>
          <th>Var (d)</th>
          <th>% complete</th>
          <th>SPI</th>
          <th>CPI</th>
          <th>Late</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.projectId}>
            <td>
              <b>{r.code}</b>
            </td>
            <td>{r.name}</td>
            <td>{fmtDay(r.dataDate)}</td>
            <td>{fmtDay(r.finish)}</td>
            <td className={(r.varianceDays ?? 0) > 0 ? "bad" : ""}>{r.varianceDays ?? ""}</td>
            <td>{(r.percent * 100).toFixed(1)}%</td>
            <td className={r.spi !== null && r.spi < 0.95 ? "bad" : ""}>{r.spi?.toFixed(2) ?? "–"}</td>
            <td className={r.cpi !== null && r.cpi < 0.95 ? "bad" : ""}>{r.cpi?.toFixed(2) ?? "–"}</td>
            <td>{r.late}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function QuantityWidget({ schedule, quantityKey }: { schedule: Schedule; quantityKey?: string }) {
  const { elements, links, profiles, schedule: open } = useStore();
  const usable = open?.projectId === schedule.projectId && elements.length > 0;
  const key = quantityKey || "BaseQuantities.NetVolume";
  const pts = useMemo(() => {
    if (!usable) return [];
    const r = scheduleRange(schedule);
    if (!r) return [];
    return quantityCurve(
      schedule,
      elements,
      links,
      profiles,
      key,
      Array.from({ length: 31 }, (_, i) => r.start + ((r.finish - r.start) * i) / 30),
    );
  }, [usable, schedule, elements, links, profiles, key]);
  if (!usable) return <p className="muted">Quantity curves need the project's model open in Stratum.</p>;
  return (
    <LineChart
      title=""
      series={[
        { id: "cur", label: "Current plan", color: SERIES[0], points: pts.map((p) => ({ t: p.t, v: p.current })) },
        { id: "base", label: "Baseline", color: SERIES[1], dashed: true, points: pts.map((p) => ({ t: p.t, v: p.baseline })) },
      ]}
    />
  );
}

function ProgressTableView({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const t = useMemo(
    () => progressTable(schedule, { dimension: w.dimension ?? "wbs1", basis: w.basis ?? "cost", weightage: w.weightage }),
    [schedule, w.dimension, w.basis, w.weightage],
  );
  if (!t.rows.length) return <p className="muted">No weighted activities.</p>;
  return (
    <table className="ptable">
      <thead>
        <tr>
          <th className="ptable-dim">{w.title || "Overall"}</th>
          <th>Cum. BL Plan %</th>
          <th>Cum. Actual %</th>
          <th>Variance wrt BL (%)</th>
        </tr>
      </thead>
      <tbody>
        {t.rows.map((r) => (
          <tr key={r.key}>
            <td className="ptable-dim">
              {r.label} ({pct(r.weightage)})
            </td>
            <td>{pct2(r.plan)}</td>
            <td>{pct2(r.actual)}</td>
            <td>{pct2(r.variance)}</td>
          </tr>
        ))}
        <tr className="ptable-total">
          <td className="ptable-dim">{w.totalLabel || "TOTAL"}</td>
          <td>{pct2(t.total.plan)}</td>
          <td>{pct2(t.total.actual)}</td>
          <td>{pct2(t.total.variance)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ProgressSCurve({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const pts = useMemo(() => progressCurve(schedule, { basis: w.basis ?? "cost", step: w.step ?? "month" }), [schedule, w.basis, w.step]);
  if (!pts.length) return <p className="muted">No weighted activities.</p>;
  const dd = schedule.dataDate;
  return (
    <div className="pscurve">
      <LineChart
        title="Cumulative progress"
        yMax={1}
        fmt={(v) => pct(v)}
        area={w.chart === "area"}
        legend={w.showLegend !== false}
        series={[
          { id: "plan", label: "Cum. BL Plan %", short: "Plan", color: SERIES[0], points: pts.map((p) => ({ t: p.t, v: p.plan })) },
          { id: "actual", label: "Cum. Actual %", short: "Actual", color: SERIES[1], points: pts.map((p) => ({ t: p.t, v: p.actual })) },
          { id: "fc", label: "Forecast %", short: "Forecast", color: SERIES[2], dashed: true, points: pts.filter((p) => dd === null || p.t >= dd - 31 * 86_400_000).map((p) => ({ t: p.t, v: p.forecast })) },
        ].filter((x) => !w.hiddenSeries?.includes(x.id))}
        markers={dd !== null ? [{ t: dd, label: `Data date ${fmtDay(dd)}`, color: "#0b2a8a" }] : []}
      />
      <PeriodBars
        title={w.step === "week" ? "Weekly progress" : "Monthly progress"}
        fmt={(v) => pct(v)}
        periods={pts.map((p) => ({ t: p.t, values: { plan: p.periodPlan, actual: p.periodActual } }))}
        series={[
          { id: "plan", label: "Planned in period", color: SERIES[0] },
          { id: "actual", label: "Achieved in period", color: SERIES[1] },
        ]}
      />
    </div>
  );
}

function InfoTable({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const rows = w.rows ?? [];
  if (!rows.length) return <p className="muted">Add rows in the widget settings.</p>;
  return (
    <table className="itable">
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td>{r.label}</td>
            <td>{r.metric ? kpi(schedule, r.metric).value : fillText(r.value || "–", schedule)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Slicer({ w, raw, slice }: { w: Widget; raw: Schedule; slice?: SliceProps }) {
  const dim = w.dimension ?? "wbs1";
  const values = useMemo(() => groupValues(raw, dim), [raw, dim]);
  const selected = slice?.slices.find((x) => x.dimension === dim)?.values ?? [];
  const toggle = (v: string) => {
    if (!slice?.onSlices) return;
    const next = selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v];
    const others = slice.slices.filter((x) => x.dimension !== dim);
    slice.onSlices(next.length ? [...others, { dimension: dim, values: next }] : others);
  };
  return (
    <div className={`slicer ${w.slicerStyle === "list" ? "slicer-list" : ""}`}>
      {values.map((v) => (
        <button key={v} className={selected.includes(v) ? "on" : ""} onClick={() => toggle(v)} disabled={!slice?.onSlices}>
          {v}
        </button>
      ))}
      {selected.length > 0 && slice?.onSlices && (
        <button className="link" onClick={() => slice.onSlices!(slice.slices.filter((x) => x.dimension !== dim))}>
          clear
        </button>
      )}
    </div>
  );
}

export { compact };

/** Toggle one value of a dimension in the dashboard's slicer selections (cross-filtering). */
function toggleSlice(slice: SliceProps, dim: string, v: string) {
  if (!slice.onSlices) return;
  const cur = slice.slices.find((x) => x.dimension === dim)?.values ?? [];
  const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  const others = slice.slices.filter((x) => x.dimension !== dim);
  slice.onSlices(next.length ? [...others, { dimension: dim, values: next }] : others);
}

const DAY_MS = 86_400_000;
/** The date a "baseline plan" figure is measured at. */
function cutoffAt(s: Schedule, w: Widget): number {
  const dd = s.dataDate ?? Date.now();
  const d = new Date(dd);
  if (w.cutoff === "monthstart") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  if (w.cutoff === "monthend") return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1;
  return dd;
}
function cutoffLabel(w: Widget) {
  return w.cutoff === "monthstart" ? "to last month end" : w.cutoff === "monthend" ? "to this month end" : "at data date";
}
function cutoffPlan(s: Schedule, w: Widget) {
  return progressTable(s, { dimension: w.dimension ?? "wbs1", basis: w.basis ?? "hours", weightage: w.weightage, at: cutoffAt(s, w) }).total.plan * 100;
}

function Cards({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const rows = w.rows ?? [];
  if (!rows.length) return <p className="muted">Add figures in the widget settings.</p>;
  return (
    <div className="cards-grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, Math.min(8, w.cardCols ?? 3))}, minmax(0, 1fr))` }}>
      {rows.map((r, i) => {
        const k = r.metric ? kpi(schedule, r.metric, { basis: w.basis ?? "hours", measure: w.measure }) : null;
        const val = k ? (w.decimals !== undefined && typeof k.raw === "number" && !/Date|start|finish|Finish|Start/.test(r.metric ?? "") && k.raw < 1e9 ? `${k.raw.toFixed(w.decimals)}${/uration|elapsed$|overrun/.test(r.metric ?? "") ? "m" : ""}` : k.value) : fillText(r.value || "–", schedule);
        return (
          <div key={i} className="fig-card" title={k?.hint}>
            <div className={`fig-value ${k?.tone ?? ""}`}>{val}</div>
            <div className="fig-label">{r.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function ControlTable({ w, schedule, slice }: { w: Widget; schedule: Schedule; slice?: SliceProps }) {
  const dim = w.dimension ?? "wbs1";
  const basis = w.basis ?? "hours";
  const at = cutoffAt(schedule, w);
  const data = useMemo(() => {
    const now = controlRows(schedule, { dimension: dim, basis, weightage: w.weightage });
    const bl = progressTable(schedule, { dimension: dim, basis, weightage: w.weightage, at });
    const blBy = new Map(bl.rows.map((r) => [r.key, r.plan]));
    return { rows: now.rows.map((r) => ({ ...r, plan: blBy.get(r.key) ?? r.plan })), total: { ...now.total, plan: bl.total.plan } };
  }, [schedule, dim, basis, w.weightage, at]);
  const sel = slice?.slices.find((x) => x.dimension === dim)?.values ?? [];
  const f1 = (v: number) => (v * 100).toFixed(w.decimals ?? 1);
  const row = (r: ControlRow, total = false) => {
    const variance = (r.actual - r.plan) * 100;
    const dv = r.durationVariance;
    return (
      <tr
        key={r.key}
        className={`${total ? "ct-total" : "ct-row"} ${sel.includes(r.key) ? "on" : ""}`}
        onClick={!total && slice?.onSlices ? () => toggleSlice(slice, dim, r.key) : undefined}
        title={!total && slice?.onSlices ? "Click to filter the dashboard to this row" : undefined}
      >
        <td className="ct-name">{r.label}</td>
        <td>{(r.weight * 100).toFixed(2)}%</td>
        <td>{f1(r.plan)}</td>
        <td className="ct-actual">{f1(r.actual)}</td>
        <td className={total ? "" : variance < -0.05 ? "ct-bad" : variance > 0.05 ? "ct-good" : ""}>{variance.toFixed(w.decimals ?? 1)}</td>
        <td className="ct-bl">{fmtDay(r.blFinish)}</td>
        <td className="ct-est">{fmtDay(r.finish)}</td>
        <td className={dv !== null && dv > 0 && !total ? "ct-bad" : ""}>{dv ?? ""}</td>
      </tr>
    );
  };
  if (!data.rows.length) return <p className="muted">No weighted activities.</p>;
  return (
    <table className="data ctable">
      <thead>
        <tr>
          <th className="ct-name">{w.title.match(/discipline/i) ? "Discipline" : "Group"}</th>
          <th>Criteria weight</th>
          <th>Baseline plan</th>
          <th>Actual progress</th>
          <th>BL variance</th>
          <th>Baseline finish</th>
          <th>Estimated finish</th>
          <th>Duration variance (d)</th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r) => row(r))}
        {row(data.total, true)}
      </tbody>
    </table>
  );
}

function ComboWidget({ w, schedule }: { w: Widget; schedule: Schedule }) {
  const basis = w.basis ?? "hours";
  const built = useMemo(() => {
    const pts = progressCurve(schedule, { basis, step: w.step ?? "month" });
    if (!pts.length) return null;
    const dd = schedule.dataDate ?? Date.now();
    const nowActual = progressTable(schedule, { dimension: "wbs1", basis }).total.actual * 100;
    const step = w.step === "week" ? 7 * DAY_MS : 0;
    const periods: ComboPeriod[] = pts.map((p, i) => {
      const prev = pts[i - 1];
      const t0 = prev ? prev.t + 1 : step ? p.t - step : Date.UTC(new Date(p.t).getUTCFullYear(), new Date(p.t).getUTCMonth(), 1);
      let act = 0;
      let rem = 0;
      if (p.t <= dd) act = (p.periodActual ?? 0) * 100;
      else if (!prev || prev.t < dd) {
        act = Math.max(0, nowActual - (prev?.actual ?? 0) * 100);
        rem = Math.max(0, p.forecast * 100 - nowActual);
      } else rem = Math.max(0, (p.forecast - prev.forecast) * 100);
      return { t: p.t, t0, bl: p.periodPlan * 100, act, rem };
    });
    const past = pts.filter((p) => p.t <= dd && p.actual !== null).map((p) => ({ t: p.t, v: p.actual! * 100 }));
    const fut = pts.filter((p) => p.t > dd).map((p) => ({ t: p.t, v: p.forecast * 100 }));
    const lines = [
      { id: "baseline", label: "Baseline weight %", color: COMBO.bl, points: pts.map((p) => ({ t: p.t, v: p.plan * 100 })) },
      { id: "actual", label: "Actual weight %", color: COMBO.act, points: [...past, { t: dd, v: nowActual }] },
      { id: "remaining", label: "Remaining weight %", color: COMBO.rem, points: [{ t: dd, v: nowActual }, ...fut] },
    ];
    return { periods, lines, dd };
  }, [schedule, basis, w.step]);
  if (!built) return <p className="muted">No weighted activities.</p>;
  const hidden = w.hiddenSeries ?? [];
  return (
    <ComboChart
      periods={built.periods}
      lines={built.lines.filter((l) => !hidden.includes(l.id))}
      labels={w.showLabels !== false}
      legend={w.showLegend !== false}
      showBars={!hidden.includes("bars")}
      colors={COMBO}
      marker={{ t: built.dd, label: `Data date ${fmtDay(built.dd)}` }}
    />
  );
}

/** Combo chart colours: baseline, actual, remaining. */
const COMBO = { bl: "#4b4fc4", act: "#1fbf5f", rem: "#f08c5a" };

/** Report header: logo, title and subtitle from the dashboard's page set-up. */
export function PageHead({ dash, schedule, print = false }: { dash: Dashboard; schedule: Schedule | null; print?: boolean }) {
  const pg = dash.page ?? {};
  const title = pg.header ? fillText(pg.header, schedule) : print ? (schedule ? `${schedule.projectCode} – ${schedule.projectName}` : dash.name) : "";
  const sub = pg.subtitle ? fillText(pg.subtitle, schedule) : print ? `${dash.name} · Data date ${fmtDay(schedule?.dataDate ?? null)}` : "";
  if (!title && !sub && !pg.logo && !print) return null;
  return (
    <div className={`page-head ${print ? "" : "screen"}`}>
      {pg.logo ? (
        <img src={pg.logo} alt="" className="custom" />
      ) : dash.theme === "executive" ? (
        <img src="./stratum-logo-dark.png" alt="Stratum 4D" />
      ) : (
        <>
          <img src="./stratum-logo.png" alt="Stratum 4D" className="logo-light" />
          <img src="./stratum-logo-dark.png" alt="" className="logo-dark" />
        </>
      )}
      <div className="page-head-text">
        {title && <b>{title}</b>}
        {sub && <div className="muted">{sub}</div>}
      </div>
      {pg.showDataDate && schedule?.dataDate != null && (
        <div className="page-head-dd">
          <span className="muted">Data date</span>
          <b>{fmtDay(schedule.dataDate)}</b>
        </div>
      )}
    </div>
  );
}

/** CSS variables and classes for a dashboard's page set-up. */
export function pageStyle(dash: Dashboard): { className: string; style: CSSProperties & Record<string, string | number | undefined> } {
  const pg = dash.page ?? {};
  return {
    className: `${dash.theme === "report" ? "theme-report" : dash.theme === "executive" ? "theme-exec" : ""} orient-${pg.orientation ?? "landscape"} ${pg.dense ? "dense" : ""}`,
    style: { "--page-accent": pg.accent, "--page-bg": pg.background, "--dash-gap": pg.gap !== undefined ? `${pg.gap}px` : undefined },
  };
}

/** Open an activity in the schedule, when the widget shows the open project. */
export function goToActivity(schedule: Schedule, id: string) {
  const st = useStore.getState();
  if (st.schedule?.projectId !== schedule.projectId) {
    st.setStatus("That activity belongs to another project: open the project first, then click it again.");
    return;
  }
  st.selectActivity(id);
  st.setView("workspace");
}

/** Click a figure to list the activities behind it; click one to open it in the schedule. */
function Drill({ w, schedule, children }: { w: Widget; schedule: Schedule; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const d = useMemo(() => (open && w.metric ? kpiActivities(schedule, w.metric, { days: w.days }) : null), [open, schedule, w.metric, w.days]);
  const can = !!w.metric && kpiActivities(schedule, w.metric, { days: w.days }) !== null;
  if (!can) return <>{children}</>;
  return (
    <>
      <div className="drillable" role="button" tabIndex={0} title="Show the activities behind this figure" onClick={(e) => (e.stopPropagation(), setOpen(true))} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(true)}>
        {children}
      </div>
      {open &&
        d &&
        createPortal(
          <div className="help-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
            <div className="drill-panel" role="dialog" aria-label={d.title}>
              <header>
                <b>{d.title}</b>
                <span className="muted">
                  {d.rows.length} activit{d.rows.length === 1 ? "y" : "ies"} · {schedule.projectCode}
                </span>
                <span className="spacer" />
                <button className="icon-only" aria-label="Close" onClick={() => setOpen(false)}>
                  ✕
                </button>
              </header>
              {d.rows.length ? (
                <div className="drill-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Activity</th>
                        <th>Start</th>
                        <th>Finish</th>
                        <th>BL finish</th>
                        <th>TF (d)</th>
                        <th>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.rows.slice(0, 500).map((a) => (
                        <tr key={a.id} className="clickable" title="Open in the schedule" onClick={() => goToActivity(schedule, a.id)}>
                          <td>
                            <b>{a.code}</b>
                          </td>
                          <td>{a.name}</td>
                          <td>{fmtDay(a.actualStart ?? a.start)}</td>
                          <td>{fmtDay(a.actualFinish ?? a.finish)}</td>
                          <td>{fmtDay(a.baselineFinish)}</td>
                          <td className={(a.totalFloatHours ?? 0) < 0 ? "bad" : ""}>{a.totalFloatHours === null ? "" : Math.round(a.totalFloatHours / 8)}</td>
                          <td>{Math.round(a.percentComplete)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d.rows.length > 500 && <p className="muted small">First 500 shown.</p>}
                </div>
              ) : (
                <p className="muted">None. Nothing to follow up here.</p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
