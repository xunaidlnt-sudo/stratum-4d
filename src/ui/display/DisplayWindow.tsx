// A display window: one view of the open project, kept in sync with the
// main window, sized for a second or third monitor.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConfig } from "../../backend/config";
import { scheduleCpm, ScheduleLoopError } from "../../core/cpm";
import { levelResources } from "../../core/level";
import { scheduleRange } from "../../core/simulation";
import { ActivityEditor } from "../ActivityEditor";
import { CostPanel, ResourcePanel } from "../Analysis";
import { applyAppearance } from "../appearance";
import { DashboardsView } from "../Dashboards";
import { ActivityTable } from "../p6/ActivityTable";
import { copySelected, cutSelected, deleteSelected, paste, selectAll, useP6 } from "../p6/commands";
import { ContextMenuHost } from "../p6/ContextMenu";
import { P6Dialogs } from "../p6/Dialogs";
import { displayDefault, useLayout } from "../p6/layout";
import { AssignmentsWindow, NetworkView, RegisterWindow, TraceLogicView, UsageSpreadsheet, WbsWindow } from "../p6/Windows";
import { fmtDate, useStore } from "../store";
import { DISPLAY_VIEWS, viewLabel } from "./Displays";
import { startSync } from "./sync";

export function displayRoute(): { view: string; id: string } | null {
  const m = /[#&]display=([^&]+)&id=([^&]+)/.exec(location.hash);
  return m ? { view: decodeURIComponent(m[1]), id: m[2] } : null;
}

const DETAIL_SECTIONS = ["general", "status", "dates", "predecessors", "successors", "resources", "codes", "steps", "notebook", "udf"] as const;

function schedule() {
  const s = useStore.getState();
  if (!s.schedule) return;
  try {
    const prev = scheduleRange(s.schedule)?.finish ?? null;
    const r = scheduleCpm(s.schedule);
    if (s.schedule.scheduleOptions?.levelWhenScheduling) {
      const lv = levelResources(r.schedule);
      r.schedule = lv.schedule;
      r.projectFinish = lv.projectFinish;
    }
    s.setSchedule(r.schedule, { keepTime: true });
    s.setScheduleReport({ at: Date.now(), projectFinish: r.projectFinish, previousFinish: prev, criticalCount: r.criticalPath.length, warnings: r.warnings });
    s.setStatus(`Scheduled: finish ${fmtDate(r.projectFinish)}, ${r.criticalPath.length} critical activities.`);
  } catch (err) {
    s.setStatus(err instanceof ScheduleLoopError ? err.message : `Scheduling failed: ${(err as Error).message}`);
  }
}

export function DisplayWindow({ route }: { route: { view: string; id: string } }) {
  const config = useConfig((s) => s.config);
  const sched = useStore((s) => s.schedule);
  const selected = useStore((s) => s.selectedActivity);
  const status = useStore((s) => s.status);
  const dirty = useStore((s) => s.scheduleDirty);
  const [view, setView] = useState(route.view);
  const act = useMemo(() => sched?.activities.find((a) => a.id === selected) ?? null, [sched, selected]);

  // P6 look for the tables, whatever layout the main window uses.
  useEffect(() => applyAppearance({ ...config, mode: "p6" }), [config]);
  useEffect(() => {
    useStore.getState().setStatus("");
    const h = startSync({ host: false, id: route.id, view: route.view });
    return () => h?.stop();
  }, [route.id, route.view]);
  useEffect(() => {
    document.title = `${viewLabel(view)}${sched ? ` – ${sched.projectCode}` : ""} · Stratum 4D`;
  }, [view, sched]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = !!(e.target as HTMLElement).closest("input, textarea, select");
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (e.key === "F9") (e.preventDefault(), schedule());
      if (typing || useP6.getState().dialog) return;
      const st = useStore.getState();
      if (ctrl && k === "z") (e.preventDefault(), st.undo());
      else if (ctrl && k === "y") (e.preventDefault(), st.redo());
      else if (ctrl && k === "c") copySelected();
      else if (ctrl && k === "x") cutSelected();
      else if (ctrl && k === "v") paste();
      else if (ctrl && k === "a") (e.preventDefault(), selectAll());
      else if (e.key === "Delete" && st.selectedActivities.size) deleteSelected();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  let body: ReactNode;
  if (!sched) body = <div className="empty">Waiting for the main Stratum window… Open a project there and this window fills in.</div>;
  else
    switch (view) {
      case "activities":
      case "table":
      case "gantt":
      case "progress":
        body = <ActivityTable onSchedule={schedule} />;
        break;
      case "details":
        body = (
          <div className="display-details">
            <ActivityEditor bare only={[...DETAIL_SECTIONS]} />
          </div>
        );
        break;
      case "network":
        body = <NetworkView />;
        break;
      case "trace":
        body = <TraceLogicView />;
        break;
      case "resourceUsage":
        body = <UsageSpreadsheet by="resource" />;
        break;
      case "activityUsage":
        body = <UsageSpreadsheet by="activity" />;
        break;
      case "resourceProfile":
        body = <ResourcePanel />;
        break;
      case "earnedValue":
        body = <CostPanel />;
        break;
      case "dashboard":
        body = <DashboardsView onClose={() => window.close()} />;
        break;
      case "wbs":
        body = <WbsWindow />;
        break;
      case "assignments":
        body = <AssignmentsWindow />;
        break;
      case "issues":
      case "risks":
        body = <RegisterWindow kind={view} />;
        break;
      default:
        body = <div className="empty">Unknown view.</div>;
    }

  return (
    <div className="classic p6-app display-win">
      <div className="cl-titlebar">
        <img className="cl-logo logo-light" src="./stratum-logo.png" alt="Stratum 4D" />
        <img className="cl-logo logo-dark" src="./stratum-logo-dark.png" alt="" aria-hidden />
        <select className="p6-lowersel" value={view} onChange={(e) => {
            const v = e.target.value;
            if (["activities", "table", "gantt", "progress"].includes(v)) useLayout.getState().open(displayDefault(v));
            setView(v);
          }} title="Change what this window shows">
          {DISPLAY_VIEWS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        <span className="cl-title">{sched ? `${sched.projectCode} – ${sched.projectName} · Data date ${fmtDate(sched.dataDate)}` : ""}</span>
        <span className="spacer" />
        {act && (
          <span className="cl-title">
            <b>{act.code}</b> {act.name}
          </span>
        )}
        <button className={`tb ${dirty ? "primary" : ""}`} onClick={schedule} disabled={!sched} title="Schedule (F9)">
          Schedule <kbd>F9</kbd>
        </button>
      </div>
      <div className="display-body">{body}</div>
      <div className="cl-statusbar p6-status">
        <span>Display window · synced with the main window</span>
        <span className="spacer" />
        <span className="cl-msg">{status}</span>
      </div>
      <P6Dialogs onSchedule={schedule} onAssignFile={() => useStore.getState().setStatus("Assign baselines from a file in the main window.")} />
      <ContextMenuHost />
    </div>
  );
}
