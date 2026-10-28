// P6 Publish › Project Web Site: a static site for people without the
// software. One page per topic (overview, activities by WBS, Gantt chart,
// resources, work products and documents, issues, risks) with a shared
// stylesheet, all relative links, no scripts.

import { evm } from "./evm";
import { fmtDay, fmtMoney } from "./fields";
import type { Activity, RegisterItem, Schedule } from "./types";

export type SiteTopic = "activities" | "gantt" | "resources" | "documents" | "issues" | "risks";
export const SITE_TOPICS: [SiteTopic, string][] = [
  ["activities", "Activities by WBS"],
  ["gantt", "Gantt chart"],
  ["resources", "Resources and assignments"],
  ["documents", "Work products and documents"],
  ["issues", "Issues"],
  ["risks", "Risks"],
];

export interface SiteOptions {
  title: string;
  description?: string;
  topics: SiteTopic[];
  theme?: "classic" | "light";
  /** Footer line, e.g. who published it. */
  publishedBy?: string;
  publishedAt?: Date;
}

const esc = (t: unknown) => String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const DAY = 86_400_000;

const CSS = (theme: "classic" | "light") => `
:root { --ink: #1d2733; --muted: #5b6673; --line: #c9d1da; --head: ${theme === "classic" ? "#dfe6ee" : "#f2f5f8"}; --band: ${theme === "classic" ? "#ffff99" : "#eef3fb"}; --accent: #1f5fa8; --crit: #c4321f; --bar: #2f6fbf; }
* { box-sizing: border-box; }
body { margin: 0; font: 13px/1.45 "Segoe UI", system-ui, sans-serif; color: var(--ink); background: #fff; }
header { background: ${theme === "classic" ? "#3a5f8a" : "#1f2b38"}; color: #fff; padding: 14px 20px; }
header h1 { margin: 0; font-size: 18px; font-weight: 600; }
header p { margin: 4px 0 0; opacity: 0.85; }
nav { display: flex; flex-wrap: wrap; gap: 2px; background: var(--head); border-bottom: 1px solid var(--line); padding: 0 12px; }
nav a { padding: 8px 12px; color: var(--ink); text-decoration: none; }
nav a.on { background: #fff; border: 1px solid var(--line); border-bottom-color: #fff; margin-bottom: -1px; font-weight: 600; }
main { padding: 16px 20px 32px; overflow-x: auto; }
table { border-collapse: collapse; min-width: 100%; }
th, td { border: 1px solid var(--line); padding: 3px 7px; text-align: left; vertical-align: top; }
th { background: var(--head); font-weight: 600; position: sticky; top: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr.band td { background: var(--band); font-weight: 600; }
tr.crit td.name { color: var(--crit); }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; margin: 12px 0 20px; }
.kpi { border: 1px solid var(--line); padding: 10px 12px; }
.kpi b { display: block; font-size: 18px; }
.kpi span { color: var(--muted); font-size: 12px; }
.muted { color: var(--muted); }
footer { color: var(--muted); font-size: 11px; padding: 10px 20px; border-top: 1px solid var(--line); }
@media print { nav { display: none; } th { position: static; } }
`;

function page(s: Schedule, o: SiteOptions, file: string, title: string, body: string): string {
  const links: [string, string][] = [["index.html", "Overview"], ...SITE_TOPICS.filter(([t]) => o.topics.includes(t)).map(([t, l]): [string, string] => [`${t}.html`, l.replace(/ by WBS| and assignments| chart/, "")])];
  const when = o.publishedAt ?? new Date();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)} – ${esc(o.title)}</title><link rel="stylesheet" href="style.css"></head>
<body><header><h1>${esc(o.title)}</h1><p>${esc(s.projectCode)} · ${esc(s.projectName)} · Data date ${esc(fmtDay(s.dataDate))}</p></header>
<nav>${links.map(([f, l]) => `<a href="${f}"${f === file ? ' class="on"' : ""}>${esc(l)}</a>`).join("")}</nav>
<main><h2>${esc(title)}</h2>${body}</main>
<footer>Published ${esc(when.toISOString().slice(0, 16).replace("T", " "))} UTC${o.publishedBy ? ` by ${esc(o.publishedBy)}` : ""} with Stratum 4D.</footer></body></html>`;
}

/** WBS rows in outline order with their activities. */
function wbsOutline(s: Schedule): { id: string | null; label: string; depth: number; acts: Activity[] }[] {
  const kids = new Map<string | null, typeof s.wbs>();
  for (const w of s.wbs) (kids.get(w.parentId) ?? kids.set(w.parentId, []).get(w.parentId)!).push(w);
  for (const l of kids.values()) l.sort((a, b) => a.seq - b.seq || a.code.localeCompare(b.code, undefined, { numeric: true }));
  const actsOf = new Map<string | null, Activity[]>();
  for (const a of s.activities) if (a.type !== "wbs-summary") (actsOf.get(a.wbsId) ?? actsOf.set(a.wbsId, []).get(a.wbsId)!).push(a);
  for (const l of actsOf.values()) l.sort((a, b) => (a.start ?? 0) - (b.start ?? 0) || a.code.localeCompare(b.code, undefined, { numeric: true }));
  const out: { id: string | null; label: string; depth: number; acts: Activity[] }[] = [];
  const walk = (parent: string | null, depth: number, path: string) => {
    for (const w of kids.get(parent) ?? []) {
      const code = path ? `${path}.${w.code}` : w.code;
      out.push({ id: w.id, label: `${code} ${w.name}`, depth, acts: actsOf.get(w.id) ?? [] });
      walk(w.id, depth + 1, code);
    }
  };
  walk(null, 0, "");
  const loose = actsOf.get(null) ?? [];
  if (loose.length) out.unshift({ id: null, label: s.projectName, depth: 0, acts: loose });
  return out;
}

export function projectWebsite(s: Schedule, o: SiteOptions): Record<string, string> {
  const cal = (s.calendars ?? []).find((c) => c.id === s.defaultCalendarId) ?? s.calendars?.[0];
  const hpd = cal?.hoursPerDay || 8;
  const days = (h: number | null | undefined) => (h === null || h === undefined ? "" : String(Math.round((h / hpd) * 10) / 10));
  const files: Record<string, string> = { "style.css": CSS(o.theme ?? "classic") };
  const acts = s.activities.filter((a) => a.type !== "wbs-summary");
  const m = evm(s, "cost");
  const finish = Math.max(...acts.map((a) => a.finish ?? -Infinity));
  const start = Math.min(...acts.map((a) => a.actualStart ?? a.start ?? Infinity));
  const blFinish = Math.max(...acts.map((a) => a.baselineFinish ?? -Infinity));
  const kpi = (v: string, l: string) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  files["index.html"] = page(
    s,
    o,
    "index.html",
    "Project overview",
    `${o.description ? `<p>${esc(o.description).replace(/\n/g, "<br>")}</p>` : ""}<div class="kpis">${[
      kpi(fmtDay(Number.isFinite(start) ? start : null), "Start"),
      kpi(fmtDay(Number.isFinite(finish) ? finish : null), "Finish"),
      kpi(Number.isFinite(blFinish) ? fmtDay(blFinish) : "–", "Baseline finish"),
      kpi(`${Math.round(m.earnedPct * 10) / 10}%`, "Performance % complete"),
      kpi(`${Math.round(m.plannedPct * 10) / 10}%`, "Planned % complete"),
      kpi(fmtMoney(m.bac), "Budget at completion"),
      kpi(fmtMoney(m.ac), "Actual cost"),
      kpi(m.spi === null ? "–" : m.spi.toFixed(2), "SPI"),
      kpi(m.cpi === null ? "–" : m.cpi.toFixed(2), "CPI"),
      kpi(String(acts.length), "Activities"),
      kpi(String(acts.filter((a) => a.status === "complete").length), "Completed"),
      kpi(String(acts.filter((a) => a.critical && a.status !== "complete").length), "Open critical activities"),
    ].join("")}</div><p class="muted">Figures as of the data date. Performance % is earned value over budget.</p>`,
  );

  const outline = wbsOutline(s);
  if (o.topics.includes("activities")) {
    const rows = outline
      .map(
        (w) =>
          `<tr class="band"><td colspan="9" style="padding-left:${7 + w.depth * 14}px">${esc(w.label)}</td></tr>` +
          w.acts
            .map(
              (a) =>
                `<tr id="${esc(a.code)}"${a.critical && a.status !== "complete" ? ' class="crit"' : ""}><td>${esc(a.code)}</td><td class="name">${esc(a.name)}</td><td class="num">${days(a.originalDurationHours)}</td><td class="num">${days(a.remainingDurationHours)}</td><td>${esc(fmtDay(a.actualStart ?? a.start))}${a.actualStart ? " A" : ""}</td><td>${esc(fmtDay(a.actualFinish ?? a.finish))}${a.actualFinish ? " A" : ""}</td><td class="num">${days(a.totalFloatHours)}</td><td class="num">${Math.round(a.percentComplete)}%</td><td>${esc(a.status === "complete" ? "Completed" : a.status === "in-progress" ? "In Progress" : "Not Started")}</td></tr>`,
            )
            .join(""),
      )
      .join("");
    files["activities.html"] = page(s, o, "activities.html", "Activities by WBS", `<table><thead><tr><th>Activity ID</th><th>Activity Name</th><th class="num">Orig. Dur (d)</th><th class="num">Rem. Dur (d)</th><th>Start</th><th>Finish</th><th class="num">Total Float (d)</th><th class="num">% Complete</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><p class="muted">Red names are open critical activities. A = actual date.</p>`);
  }

  if (o.topics.includes("gantt")) {
    const ts = acts.flatMap((a) => [a.actualStart ?? a.start, a.actualFinish ?? a.finish, a.baselineStart, a.baselineFinish]).filter((x): x is number => x !== null);
    const lo = ts.length ? Math.min(...ts) : 0;
    const hi = ts.length ? Math.max(...ts) : DAY;
    const W = 900;
    const x = (t: number) => Math.round(((t - lo) / Math.max(DAY, hi - lo)) * W);
    const months: string[] = [];
    for (let d = new Date(Date.UTC(new Date(lo).getUTCFullYear(), new Date(lo).getUTCMonth(), 1)); d.getTime() <= hi; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      const t = d.getTime();
      if (t >= lo) months.push(`<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="100%" stroke="#e3e7ec"/>${d.getUTCMonth() % 3 === 0 ? `<text x="${x(t) + 2}" y="12" font-size="10" fill="#5b6673">${d.toISOString().slice(0, 7)}</text>` : ""}`);
    }
    const rowH = 18;
    const lines: string[] = [];
    let y = 18;
    const labels: string[] = [];
    for (const w of outline) {
      labels.push(`<tr class="band"><td colspan="2" style="height:${rowH}px;padding-left:${7 + w.depth * 14}px">${esc(w.label)}</td></tr>`);
      y += rowH;
      for (const a of w.acts) {
        const st = a.actualStart ?? a.start;
        const fi = a.actualFinish ?? a.finish;
        if (a.baselineStart !== null && a.baselineFinish !== null) lines.push(`<rect x="${x(a.baselineStart)}" y="${y + 11}" width="${Math.max(1, x(a.baselineFinish) - x(a.baselineStart))}" height="3" fill="#c49a00"/>`);
        if (st !== null && fi !== null) {
          const ms = a.type === "milestone" || a.type === "finish-milestone";
          const color = a.status === "complete" ? "#5b6673" : a.critical ? "#c4321f" : "#2f6fbf";
          lines.push(ms ? `<path d="M${x(st)} ${y + 3} l5 5 l-5 5 l-5 -5 z" fill="${color}"/>` : `<rect x="${x(st)}" y="${y + 3}" width="${Math.max(2, x(fi) - x(st))}" height="8" rx="1" fill="${color}"><title>${esc(`${a.code} ${a.name}: ${fmtDay(st)} – ${fmtDay(fi)}`)}</title></rect>`);
        }
        labels.push(`<tr><td style="height:${rowH}px">${esc(a.code)}</td><td>${esc(a.name)}</td></tr>`);
        y += rowH;
      }
    }
    const dd = s.dataDate !== null ? `<line x1="${x(s.dataDate)}" x2="${x(s.dataDate)}" y1="0" y2="${y}" stroke="#c4321f" stroke-dasharray="4 3"/>` : "";
    files["gantt.html"] = page(
      s,
      o,
      "gantt.html",
      "Gantt chart",
      `<div style="display:flex;align-items:flex-start"><table style="min-width:0;flex:0 0 auto"><thead><tr><th style="height:18px">Activity ID</th><th>Activity Name</th></tr></thead><tbody>${labels.join("")}</tbody></table><svg width="${W}" height="${y}" style="flex:0 0 auto;border:1px solid var(--line);border-left:0" role="img" aria-label="Gantt chart">${months.join("")}${lines.join("")}${dd}</svg></div><p class="muted">Blue: remaining work; red: critical; grey: complete; yellow line: baseline; dashed red line: data date.</p>`,
    );
  }

  if (o.topics.includes("resources")) {
    const by = new Map<string, { n: number; qty: number; cost: number; act: number }>();
    for (const x of s.assignments ?? []) {
      const r = by.get(x.resourceId) ?? { n: 0, qty: 0, cost: 0, act: 0 };
      r.n++;
      r.qty += x.budgetQty;
      r.cost += x.budgetCost;
      r.act += x.actualCost;
      by.set(x.resourceId, r);
    }
    const rows = (s.resources ?? [])
      .map((r) => {
        const v = by.get(r.id) ?? { n: 0, qty: 0, cost: 0, act: 0 };
        return `<tr><td>${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.type === "labor" ? "Labor" : r.type === "equipment" ? "Nonlabor" : "Material")}</td><td class="num">${v.n}</td><td class="num">${Math.round(v.qty).toLocaleString()} ${esc(r.unit)}</td><td class="num">${esc(fmtMoney(v.cost))}</td><td class="num">${esc(fmtMoney(v.act))}</td></tr>`;
      })
      .join("");
    files["resources.html"] = page(s, o, "resources.html", "Resources and assignments", `<table><thead><tr><th>Resource ID</th><th>Resource Name</th><th>Type</th><th class="num">Assignments</th><th class="num">Budgeted Units</th><th class="num">Budgeted Cost</th><th class="num">Actual Cost</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  const actCode = new Map(s.activities.map((a) => [a.id, a.code]));
  const register = (kind: "documents" | "issues" | "risks", title: string, cols: string[]) => {
    const items: RegisterItem[] = s.registers?.[kind] ?? [];
    const link = (v: string) => (/^https?:\/\//i.test(v.trim()) ? `<a href="${esc(v.trim())}" rel="noopener">${esc(v)}</a>` : esc(v));
    const rows = items
      .map((it) => `<tr>${cols.map((c) => `<td>${c === "Public Location" || c === "Location / URL" ? link(it.values[c] ?? "") : esc(it.values[c] ?? "")}</td>`).join("")}<td>${it.activityId && actCode.get(it.activityId) ? `<a href="activities.html#${esc(actCode.get(it.activityId))}">${esc(actCode.get(it.activityId))}</a>` : ""}</td></tr>`)
      .join("");
    files[`${kind}.html`] = page(s, o, `${kind}.html`, title, items.length ? `<table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}<th>Activity</th></tr></thead><tbody>${rows}</tbody></table>` : `<p class="muted">None recorded.</p>`);
  };
  if (o.topics.includes("documents")) register("documents", "Work products and documents", ["Title", "Reference No.", "Version", "Category", "Status", "Deliverable", "Author", "Revision Date", "Public Location"]);
  if (o.topics.includes("issues")) register("issues", "Issues", ["Issue Name", "Priority", "Status", "Responsible", "Date Identified", "Notes"]);
  if (o.topics.includes("risks")) register("risks", "Risks", ["Risk ID", "Risk Name", "Category", "Probability", "Impact (Schedule)", "Impact (Cost)", "Response", "Owner", "Status"]);
  return files;
}
