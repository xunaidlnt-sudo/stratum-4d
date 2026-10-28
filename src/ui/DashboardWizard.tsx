// Dashboard wizard: choose the project, the baseline to compare against and a
// template, then check the prerequisites (baseline assigned, data date,
// schedule calculated, progress, costs, logic) before the dashboard is made.
// Opened on an existing dashboard it changes the project and baseline.

import { useEffect, useState } from "react";
import { useConfig } from "../backend/config";
import type { ProjectSummary } from "../backend/types";
import { baselineOptions, baselineReady, dashboardReadiness } from "../core/dashboardBaseline";
import { BUILTIN_TEMPLATES, type Dashboard } from "../core/reporting";
import type { Schedule } from "../core/types";
import { fmtDate, useStore } from "./store";

export interface WizardResult {
  projectId: string | null;
  baselineId: string | null;
  /** Builtin template id, a user template's dashboard id, or "blank". Absent when editing. */
  template?: string;
  name: string;
  schedule: Schedule | null;
}

export function DashboardWizard({ dash, projects, templates, onDone, onClose }: { dash?: Dashboard; projects: ProjectSummary[]; templates: Dashboard[]; onDone: (r: WizardResult) => void; onClose: () => void }) {
  const { backend } = useConfig();
  const open = useStore((s) => s.schedule);
  const currentId = useStore((s) => s.currentProjectId);
  const steps = dash ? ["Project", "Baseline", "Check"] : ["Project", "Baseline", "Template", "Check"];
  const [i, setI] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(dash ? dash.projectId : currentId);
  const [baselineId, setBaselineId] = useState<string | null>(dash?.baselineId ?? null);
  const [template, setTemplate] = useState("status");
  const [name, setName] = useState(dash?.name ?? "");
  const [sched, setSched] = useState<Schedule | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const s = !projectId || projectId === currentId ? open : (await backend.getProject(projectId).catch(() => null))?.project.schedule ?? null;
      if (live) setSched(s);
    })();
    return () => {
      live = false;
    };
  }, [projectId, backend, currentId, open]);

  const opts = sched ? baselineOptions(sched) : [];
  const checks = sched ? dashboardReadiness(sched, baselineId) : [];
  const ready = baselineReady(checks);
  const step = steps[i];
  const finish = () => onDone({ projectId, baselineId, template: dash ? undefined : template, name: name.trim() || (dash?.name ?? BUILTIN_TEMPLATES.find((t) => t.id === template)?.name ?? templates.find((t) => t.id === template)?.name.replace(/ \(template\)$/, "") ?? "New dashboard"), schedule: sched });

  return (
    <div className="help-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dash-wizard" role="dialog" aria-label="Dashboard wizard">
        <header>
          <b>{dash ? `Dashboard setup – ${dash.name}` : "New dashboard"}</b>
          <ol>
            {steps.map((t, k) => (
              <li key={t} className={k === i ? "on" : k < i ? "done" : ""}>
                <button className="link" onClick={() => setI(k)}>
                  {k + 1}. {t}
                </button>
              </li>
            ))}
          </ol>
        </header>
        <div className="dash-wizard-body">
          {step === "Project" && (
            <div className="stack">
              <p className="muted">Which project should the widgets show? Widgets can still point at other projects later.</p>
              <label>
                Project
                <select value={projectId ?? ""} onChange={(e) => (setProjectId(e.target.value || null), setBaselineId(null))}>
                  <option value="">The open project{open ? ` (${open.projectCode})` : ""}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} – {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {sched ? (
                <p className="small">
                  {sched.projectCode} – {sched.projectName}: {sched.activities.length} activities, data date {fmtDate(sched.dataDate)}, {sched.baselines?.length ?? 0} stored baseline{sched.baselines?.length === 1 ? "" : "s"}.
                </p>
              ) : (
                <p className="muted small">No project loaded.</p>
              )}
            </div>
          )}
          {step === "Baseline" && (
            <div className="stack">
              <p className="muted">KPIs such as SPI, finish variance, planned % and the S-curve plan line compare against this baseline. Pick the one your report is measured against (e.g. the approved baseline or the latest re-baseline).</p>
              {opts.map((o) => (
                <label key={o.id ?? "project"} className={`dash-bl ${baselineId === o.id ? "on" : ""}`}>
                  <input type="radio" name="dash-bl" checked={baselineId === o.id} onChange={() => setBaselineId(o.id)} />
                  <span>
                    <b>{o.name}</b>
                    <span className="muted small">
                      {o.dataDate !== null ? `Data date ${fmtDate(o.dataDate)} · ` : ""}
                      {Math.round(o.coverage * 100)}% of activities have baseline dates
                    </span>
                  </span>
                  <span className={`dash-bl-cov ${o.coverage >= 0.9 ? "ok" : o.coverage > 0 ? "warn" : "bad"}`}>{o.coverage >= 0.9 ? "Usable" : o.coverage > 0 ? "Partial" : "Empty"}</span>
                </label>
              ))}
              {!opts.length && <p className="muted">Load a project first.</p>}
              <p className="muted small">Store more baselines in the schedule with Project › Maintain Baselines; they all appear here.</p>
            </div>
          )}
          {step === "Template" && (
            <div className="stack">
              <label>
                Dashboard name
                <input value={name} placeholder="e.g. Monthly progress report" onChange={(e) => setName(e.target.value)} />
              </label>
              <div className="dash-tpls">
                {[...BUILTIN_TEMPLATES.map((t) => ({ id: t.id, name: t.name, hint: t.hint })), ...templates.map((t) => ({ id: t.id, name: t.name, hint: `${t.widgets.length} widgets (my template)` })), { id: "blank", name: "Blank dashboard", hint: "Build it from the widget gallery" }].map((t) => (
                  <label key={t.id} className={`dash-bl ${template === t.id ? "on" : ""}`}>
                    <input type="radio" name="dash-tpl" checked={template === t.id} onChange={() => setTemplate(t.id)} />
                    <span>
                      <b>{t.name}</b>
                      <span className="muted small">{t.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          {step === "Check" && (
            <div className="stack">
              <p className={ready ? "" : "bad"}>{ready ? "All required prerequisites are met: baseline KPIs will be meaningful." : "Some prerequisites are missing. Baseline widgets will show “Needs a baseline” until they are fixed."}</p>
              <ul className="dash-checks">
                {checks.map((c) => (
                  <li key={c.id} className={c.ok ? "ok" : c.level === "required" ? "bad" : "warn"}>
                    <b>
                      {c.ok ? "✓" : c.level === "required" ? "✕" : "!"} {c.label}
                    </b>{" "}
                    <span className="muted">{c.level === "required" ? "(required)" : "(recommended)"} {c.detail}</span>
                    {!c.ok && c.fix && <div className="small">{c.fix}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <footer>
          <button onClick={onClose}>Cancel</button>
          <span className="spacer" />
          <button disabled={i === 0} onClick={() => setI(i - 1)}>
            Back
          </button>
          {i < steps.length - 1 ? (
            <button className="primary" onClick={() => setI(i + 1)}>
              Next
            </button>
          ) : (
            <button className="primary" onClick={finish}>
              {dash ? "Apply" : ready ? "Create dashboard" : "Create anyway"}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
