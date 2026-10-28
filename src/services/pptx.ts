// Dashboard to PowerPoint. Everything is native and editable: key figures as
// text boxes, charts as PowerPoint charts with their data embedded (Edit Data
// opens it in Excel), tables as PowerPoint tables. One title slide with the
// key figures, then one slide per chart, table, note or picture.

import PptxGenJS from "pptxgenjs";
import { activityRows, kpi, lookahead, milestoneRows, portfolioRow, statusMix, type KpiValue } from "../core/dashboardData";
import { resourceHistogram, sCurves } from "../core/evm";
import { applySlices, groupValues, progressCurve, progressTable } from "../core/progress";
import type { Dashboard, Widget } from "../core/reporting";
import type { Schedule } from "../core/types";

const NAVY = "1F2B38";
const ACCENT = "1F5FA8";
const SERIES = ["2F6FBF", "E07B39", "2E8540", "8E44AD", "C49A00", "16A2B8", "C4321F", "6B7682"];
const W = 13.333;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (t: number | null | undefined) => {
  if (t === null || t === undefined || !Number.isFinite(t)) return "";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}-${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};
const month = (t: number) => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]}-${String(d.getUTCFullYear()).slice(2)}`;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const fill = (t: string, s: Schedule | null) => t.replace(/\{project\}/g, s ? `${s.projectCode} – ${s.projectName}` : "").replace(/\{datadate\}/g, day(s?.dataDate));

function kpiText(w: Widget, k: KpiValue): string {
  const v = w.decimals !== undefined && typeof k.raw === "number" && Math.abs(k.raw) < 1e9 && !/date|start|finish/i.test(w.metric ?? "") ? k.raw.toFixed(w.decimals) : k.value;
  return `${w.prefix ?? ""}${v}${w.suffix ?? ""}`;
}

export interface PptxInput {
  dashboard: Dashboard;
  /** Schedule for a widget with slicers applied, as on screen. */
  scheduleFor: (w: Widget) => Schedule | null;
  portfolio?: { id: string; schedule: Schedule }[] | null;
  /** Widgets that must not show numbers (baseline prerequisites missing). */
  blocked?: (w: Widget) => boolean;
}

export async function dashboardToPptx({ dashboard: d, scheduleFor, portfolio, blocked }: PptxInput): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.title = d.name;
  pptx.company = "Stratum 4D";
  const main = scheduleFor({ id: "", kind: "kpi", title: "", w: 3, h: 1 });
  const footer = `${d.page?.footer ? `${d.page.footer} · ` : ""}${main ? `${main.projectCode} · Data date ${day(main.dataDate)}` : ""}`;
  pptx.defineSlideMaster({
    title: "STRATUM",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: W, h: 0.08, fill: { color: ACCENT } } },
      { text: { text: footer, options: { x: 0.4, y: 7.05, w: 9, h: 0.3, fontSize: 9, color: "6B7682" } } },
    ],
    slideNumber: { x: 12.4, y: 7.05, w: 0.6, h: 0.3, fontSize: 9, color: "6B7682" },
  });
  const heading = (slide: PptxGenJS.Slide, title: string, sub?: string) => {
    slide.addText(title, { x: 0.4, y: 0.25, w: W - 0.8, h: 0.55, fontSize: 22, bold: true, color: NAVY, fontFace: "Segoe UI" });
    if (sub) slide.addText(sub, { x: 0.4, y: 0.78, w: W - 0.8, h: 0.3, fontSize: 11, color: "6B7682", fontFace: "Segoe UI" });
  };
  const body = { x: 0.4, y: 1.2, w: W - 0.8, h: 5.7 };

  // ---- title slide with the key figures
  const figures: { label: string; value: string; tone?: string }[] = [];
  for (const w of d.widgets) {
    const s = scheduleFor(w);
    if (!s) continue;
    if ((w.kind === "kpi" || w.kind === "gauge") && w.metric) {
      if (blocked?.(w)) figures.push({ label: w.title, value: "needs baseline" });
      else {
        const k = kpi(s, w.metric, { measure: w.measure, days: w.days, basis: w.basis });
        figures.push({ label: w.title || k.label, value: kpiText(w, k), tone: k.tone });
      }
    }
    if (w.kind === "cards" || w.kind === "info")
      for (const r of w.rows ?? []) {
        const k = r.metric ? kpi(s, r.metric, { basis: w.basis ?? "hours", measure: w.measure }) : null;
        figures.push({ label: r.label, value: k ? k.value : fill(r.value || "–", s), tone: k?.tone });
      }
  }
  const t = pptx.addSlide({ masterName: "STRATUM" });
  heading(t, fill(d.page?.header || d.name, main), fill(d.page?.subtitle || "Data date {datadate}", main));
  const cols = 4;
  figures.slice(0, 16).forEach((f, i) => {
    const x = 0.4 + (i % cols) * 3.15;
    const y = 1.35 + Math.floor(i / cols) * 1.35;
    t.addShape(pptx.ShapeType.rect, { x, y, w: 3.0, h: 1.2, fill: { color: "F2F5F8" }, line: { color: "D5DCE3", width: 0.75 } });
    t.addText(f.value, { x: x + 0.15, y: y + 0.12, w: 2.7, h: 0.6, fontSize: 22, bold: true, color: f.tone === "bad" ? "C4321F" : f.tone === "good" ? "2E8540" : NAVY, fontFace: "Segoe UI" });
    t.addText(f.label, { x: x + 0.15, y: y + 0.72, w: 2.7, h: 0.38, fontSize: 11, color: "5B6673", fontFace: "Segoe UI" });
  });
  if (!figures.length) t.addText(d.name, { x: 0.4, y: 3, w: W - 0.8, h: 1, fontSize: 28, color: NAVY, align: "center" });

  const table = (slide: PptxGenJS.Slide, head: string[], rows: (string | number)[][], widths?: number[]) => {
    const cell = (v: string | number, h = false): PptxGenJS.TableCell => ({ text: String(v), options: { bold: h, fill: { color: h ? "DFE6EE" : "FFFFFF" }, fontSize: 10, color: "1D2733", valign: "middle" } });
    const max = 18;
    slide.addTable([head.map((h) => cell(h, true)), ...rows.slice(0, max).map((r) => r.map((v) => cell(v)))], { x: body.x, y: body.y, w: body.w, rowH: 0.3, colW: widths, border: { type: "solid", color: "C9D1DA", pt: 0.5 }, autoPage: true, autoPageRepeatHeader: true, fontFace: "Segoe UI" } as PptxGenJS.TableProps);
    if (rows.length > max) slide.addText(`${rows.length - max} more rows in the Excel export.`, { x: 0.4, y: 6.75, w: 8, h: 0.25, fontSize: 9, color: "6B7682" });
  };
  const chartOpts = (extra: PptxGenJS.IChartOpts = {}): PptxGenJS.IChartOpts => ({
    ...body,
    showLegend: true,
    legendPos: "b",
    legendFontSize: 10,
    catAxisLabelFontSize: 9,
    valAxisLabelFontSize: 9,
    catAxisLabelRotate: -45,
    chartColors: SERIES,
    valGridLine: { color: "E3E7EC", size: 0.5 },
    ...extra,
  });

  for (const w of d.widgets) {
    if (["kpi", "gauge", "cards", "info", "slicer"].includes(w.kind)) continue;
    const s = scheduleFor(w);
    const slide = pptx.addSlide({ masterName: "STRATUM" });
    heading(slide, fill(w.title || d.name, s));
    if (blocked?.(w)) {
      slide.addText("Needs a baseline: assign one and schedule the project, then export again.", { ...body, fontSize: 16, color: "6B7682", align: "center" });
      continue;
    }
    if (w.kind === "text" || w.kind === "banner") {
      slide.addText(fill(w.text || w.title, s), { ...body, fontSize: 16, color: "1D2733", valign: "top" });
      continue;
    }
    if (w.kind === "image") {
      if (w.image) slide.addImage({ data: w.image, ...body, sizing: { type: w.fit === "cover" ? "cover" : "contain", w: body.w, h: body.h } });
      continue;
    }
    if (w.kind === "portfolio") {
      const rows = (portfolio ?? []).map((p) => portfolioRow(p.id, p.schedule));
      table(slide, ["Project", "Name", "Data date", "Finish", "Variance (d)", "% complete", "SPI", "CPI", "Late"], rows.map((r) => [r.code, r.name, day(r.dataDate), day(r.finish), r.varianceDays ?? "", `${r1(r.percent)}%`, r.spi?.toFixed(2) ?? "", r.cpi?.toFixed(2) ?? "", r.late]));
      continue;
    }
    if (!s) {
      slide.addText("No project selected for this widget.", { ...body, fontSize: 14, color: "6B7682" });
      continue;
    }
    switch (w.kind) {
      case "scurve": {
        const pts = sCurves(s, w.measure ?? "cost", 30);
        const labels = pts.map((p) => month(p.t));
        const series = [
          { name: "Planned (PV)", labels, values: pts.map((p) => Math.round(p.pv)) },
          { name: "Earned (EV)", labels, values: pts.map((p) => (p.ev === null ? null : Math.round(p.ev))) },
          { name: "Actual (AC)", labels, values: pts.map((p) => (p.ac === null ? null : Math.round(p.ac))) },
          { name: "Forecast", labels, values: pts.map((p) => Math.round(p.forecast)) },
        ].filter((x) => !w.hiddenSeries?.includes(x.name));
        slide.addChart(w.chart === "area" ? pptx.ChartType.area : pptx.ChartType.line, series as PptxGenJS.OptsChartData[], chartOpts({ lineSize: 2, lineDataSymbol: "none", valAxisLabelFormatCode: "#,##0" }));
        break;
      }
      case "pscurve":
      case "combo": {
        const pts = progressCurve(s, { basis: w.basis ?? "hours", step: w.step ?? "month" });
        const labels = pts.map((p) => month(p.t));
        const pc = (v: number | null) => (v === null ? null : r1(v * 100));
        slide.addChart(
          [
            { type: pptx.ChartType.bar, data: [{ name: "Period plan %", labels, values: pts.map((p) => pc(p.periodPlan)) }, { name: "Period actual %", labels, values: pts.map((p) => pc(p.periodActual)) }] as PptxGenJS.OptsChartData[], options: { barGrouping: "clustered", chartColors: ["9DB8DD", "F2B48C"] } },
            { type: pptx.ChartType.line, data: [{ name: "Cum. plan %", labels, values: pts.map((p) => pc(p.plan)) }, { name: "Cum. actual %", labels, values: pts.map((p) => pc(p.actual)) }, { name: "Cum. forecast %", labels, values: pts.map((p) => pc(p.forecast)) }] as PptxGenJS.OptsChartData[], options: { chartColors: ["1F5FA8", "E07B39", "6B7682"], lineSize: 2, lineDataSymbol: "none", secondaryValAxis: false } },
          ] as unknown as PptxGenJS.IChartMulti[],
          // Combo charts take the options as the second argument.
          chartOpts({ valAxisMaxVal: 100, valAxisLabelFormatCode: "0" }) as unknown as unknown[],
        );
        break;
      }
      case "phasecurves": {
        const dim = (w.dimension ?? "wbs1") as Parameters<typeof groupValues>[1];
        const groups = groupValues(s, dim).slice(0, 6);
        const curves = groups.map((g) => ({ g, pts: progressCurve(applySlices(s, [{ dimension: dim, values: [g] }]), { basis: w.basis ?? "hours", step: "month" }) }));
        const all = [...new Set(curves.flatMap((c) => c.pts.map((p) => p.t)))].sort((a, b) => a - b);
        const labels = all.map(month);
        const at = (pts: { t: number; actual: number | null; plan: number }[], t: number, k: "plan" | "actual") => {
          const p = pts.find((x) => x.t === t);
          const v = p ? p[k] : null;
          return v === null || v === undefined ? null : r1(v * 100);
        };
        const series = curves.flatMap((c) => [
          { name: `${c.g} plan %`, labels, values: all.map((t) => at(c.pts, t, "plan")) },
          { name: `${c.g} actual %`, labels, values: all.map((t) => at(c.pts, t, "actual")) },
        ]);
        slide.addChart(pptx.ChartType.line, series as PptxGenJS.OptsChartData[], chartOpts({ lineSize: 2, lineDataSymbol: "none", valAxisMaxVal: 100 }));
        break;
      }
      case "histogram": {
        const h = resourceHistogram(s, { stepDays: 30 });
        const labels = h.bars.map((b) => month(b.t));
        const res = h.resources.slice(0, 8);
        slide.addChart(pptx.ChartType.bar, res.map((r) => ({ name: r.code, labels, values: h.bars.map((b) => Math.round(b.byResource[r.id] ?? 0)) })) as PptxGenJS.OptsChartData[], chartOpts({ barGrouping: "stacked", barDir: "col" }));
        break;
      }
      case "groupbars": {
        const pt = progressTable(s, { dimension: (w.dimension ?? "wbs1") as Parameters<typeof progressTable>[1]["dimension"], basis: w.basis ?? "hours", weightage: w.weightage });
        const labels = pt.rows.map((r) => r.label);
        slide.addChart(pptx.ChartType.bar, [{ name: "Plan %", labels, values: pt.rows.map((r) => r1(r.plan * 100)) }, { name: "Actual %", labels, values: pt.rows.map((r) => r1(r.actual * 100)) }] as PptxGenJS.OptsChartData[], chartOpts({ barDir: "col", barGrouping: "clustered", showValue: w.showLabels !== false, dataLabelFontSize: 9, valAxisMaxVal: 100 }));
        break;
      }
      case "donut": {
        const mix = w.split === "weight" ? progressTable(s, { dimension: (w.dimension ?? "wbs1") as Parameters<typeof progressTable>[1]["dimension"], basis: w.basis ?? "hours" }).rows.map((r) => ({ label: r.label, value: r1(r.weightage * 100) })) : statusMix(s, w.split ?? "status");
        slide.addChart(pptx.ChartType.doughnut, [{ name: w.title, labels: mix.map((m) => m.label), values: mix.map((m) => m.value) }] as PptxGenJS.OptsChartData[], chartOpts({ holeSize: 55, showPercent: true, showLegend: true, legendPos: "r", catAxisLabelRotate: 0 }));
        break;
      }
      case "progress":
      case "controltable": {
        const pt = progressTable(s, { dimension: (w.dimension ?? "wbs1") as Parameters<typeof progressTable>[1]["dimension"], basis: w.basis ?? "hours", weightage: w.weightage });
        const row = (r: (typeof pt.rows)[number]) => [r.label, `${r1(r.weightage * 100)}%`, `${r1(r.plan * 100)}%`, `${r1(r.actual * 100)}%`, `${r1(r.forecast * 100)}%`, `${r1(r.variance * 100)}%`];
        table(slide, ["Group", "Weight", "Cum. BL plan", "Cum. actual", "Forecast", "Variance"], [...pt.rows.map(row), row({ ...pt.total, label: w.totalLabel ?? "TOTAL" })]);
        break;
      }
      case "milestones": {
        const rows = milestoneRows(s, { showDone: w.showDone, limit: w.limit });
        table(slide, ["ID", "Milestone", "Baseline", "Forecast", "Variance (d)", "Float (d)", "Status"], rows.map((r) => [r.code, r.name, day(r.baseline), day(r.forecast), r.varianceDays ?? "", r.totalFloatDays ?? "", r.state]));
        break;
      }
      case "lookahead": {
        const weeks = lookahead(s, w.weeks ?? 3, w.limit ?? 0);
        table(slide, ["Week of", "ID", "Activity", "Start", "Finish", "%"], weeks.flatMap((wk) => wk.rows.map((r, i) => [i === 0 ? day(wk.from) : "", r.code, r.name, day(r.start), day(r.finish), `${Math.round(r.percent)}%`])));
        break;
      }
      case "table": {
        const rows = activityRows(s, w.filter ?? "critical", { days: w.days, limit: w.limit ?? 200 });
        table(slide, ["ID", "Activity", "Status", "%", "Start", "Finish", "BL finish", "Var. (d)"], rows.map((r) => [r.code, r.name, r.status, `${Math.round(r.percent)}%`, day(r.actualStart ?? r.start), day(r.actualFinish ?? r.finish), day(r.baselineFinish), r.varianceDays ?? ""]), [1.1, 4.5, 1.2, 0.7, 1.3, 1.3, 1.3, 0.9]);
        break;
      }
      default:
        slide.addText(`${w.kind} widget: see the dashboard in Stratum.`, { ...body, fontSize: 14, color: "6B7682" });
    }
  }
  const out = (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
  return out;
}
