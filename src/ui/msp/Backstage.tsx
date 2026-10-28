// MS Project's File tab (Backstage): a green column of commands on the left
// and the chosen page on the right, covering the ribbon and the view.

import { ArrowLeft } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { projectStatistics } from "../../core/msp";
import { printPage } from "../files";
import type { ClassicActions } from "../classicParts";
import { useStore } from "../store";
import { mspDateText } from "./sheet";
import { useMsp } from "./state";

type Page = "info" | "new" | "open" | "save" | "print" | "export" | "options";

const Tile = ({ title, sub, onClick, disabled }: { title: string; sub?: string; onClick: () => void; disabled?: boolean }) => (
  <button className="bs-tile" onClick={onClick} disabled={disabled}>
    <b>{title}</b>
    {sub && <span>{sub}</span>}
  </button>
);

export function Backstage({ a, onClose }: { a: ClassicActions; onClose: () => void }) {
  const s = useStore((x) => x.schedule);
  const [page, setPage] = useState<Page>(s ? "info" : "new");
  const stats = useMemo(() => (s ? projectStatistics(s) : null), [s]);
  const none = !s;
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };
  const nav: [Page | "save-now" | "close", string, boolean?][] = [
    ["info", "Info", none],
    ["new", "New"],
    ["open", "Open"],
    ["save-now", "Save", none],
    ["save", "Save As", none],
    ["print", "Print", none],
    ["export", "Export", none],
    ["options", "Options"],
  ];
  const body: Record<Page, ReactNode> = {
    info: s && stats && (
      <>
        <h2>Info</h2>
        <div className="bs-info">
          <div>
            <Tile title="Project Information" sub="Start and finish dates, status date, calendar and priority." onClick={go(() => useMsp.getState().open("projectInfo"))} />
            <Tile title="Project Statistics" sub="Current, baseline and actual dates, work and cost." onClick={go(() => useMsp.getState().open("statistics"))} />
            <Tile title="Change Working Time" sub="Calendars, holidays and work weeks." onClick={go(() => useMsp.getState().open("workingTime"))} />
          </div>
          <dl className="bs-props">
            <dt>Title</dt>
            <dd>{s.projectName}</dd>
            <dt>Project</dt>
            <dd>{s.projectCode}</dd>
            <dt>Start Date</dt>
            <dd>{mspDateText(stats.current.start)}</dd>
            <dt>Finish Date</dt>
            <dd>{mspDateText(stats.current.finish)}</dd>
            <dt>Status Date</dt>
            <dd>{mspDateText(s.dataDate)}</dd>
            <dt>% Complete</dt>
            <dd>{stats.percentComplete}%</dd>
            <dt>Tasks</dt>
            <dd>{s.activities.length}</dd>
            <dt>Source</dt>
            <dd>{s.sourceFormat === "mspdi" ? "Microsoft Project XML" : s.sourceFormat === "xer" ? "Primavera P6 XER" : (s.sourceFormat ?? "Stratum")}</dd>
          </dl>
        </div>
      </>
    ),
    new: (
      <>
        <h2>New</h2>
        <div className="bs-tiles">
          <Tile title="220 kV GIS Substation" sub="Sample project (UAE)" onClick={go(() => a.sample("gis"))} />
          <Tile title="RC Building" sub="Small sample project" onClick={go(() => a.sample("rc"))} />
          <Tile title="New from an existing schedule…" sub="P6 XER or Microsoft Project XML" onClick={go(a.importSchedule)} />
        </div>
      </>
    ),
    open: (
      <>
        <h2>Open</h2>
        <div className="bs-tiles col">
          <Tile title="Projects" sub={`Open a project from ${a.dbLabel}`} onClick={go(a.projects)} />
          <Tile title="Browse" sub="Open a Stratum project file (.stratum.json)" onClick={go(a.openFile)} />
          <Tile title="Import XER / Microsoft Project XML" sub="P6 .xer or MS Project .xml (File › Save As › XML in MS Project)" onClick={go(a.importSchedule)} />
          <Tile title="Import from P6" sub="Pull a project from a P6 connection" onClick={go(a.importP6)} />
        </div>
      </>
    ),
    save: (
      <>
        <h2>Save As</h2>
        <div className="bs-tiles col">
          <Tile title="Save as new project" sub={`A copy in ${a.dbLabel}`} onClick={go(a.saveAsNew)} disabled={none} />
          <Tile title="Microsoft Project XML (*.xml)" sub="Opens in MS Project 2010 and later" onClick={go(a.exportMspdi)} disabled={none} />
          <Tile title="Primavera P6 XER (*.xer)" sub="Import into P6 Professional or EPPM" onClick={go(a.exportXer)} disabled={none} />
          <Tile title="Stratum project file (*.stratum.json)" sub="Schedule, model links and settings" onClick={go(a.saveFile)} disabled={none} />
        </div>
      </>
    ),
    print: (
      <>
        <h2>Print</h2>
        <p>Prints the current view. Choose landscape and "fit to page width" in the print dialog for wide Gantt charts.</p>
        <div className="bs-tiles">
          <Tile title="Print" sub="Current view" onClick={go(() => void printPage(`${s?.projectCode ?? "Project"} – Gantt Chart`))} disabled={none} />
        </div>
      </>
    ),
    export: (
      <>
        <h2>Export</h2>
        <div className="bs-tiles col">
          <Tile title="Create PDF/XPS Document" sub="Print the current view to PDF" onClick={go(() => void printPage(`${s?.projectCode ?? "Project"}`))} disabled={none} />
          <Tile title="Save Project as File: XML" sub="Microsoft Project XML" onClick={go(a.exportMspdi)} disabled={none} />
          <Tile title="Save Project as File: Excel (CSV)" sub="Task list for Excel" onClick={go(a.exportCsv)} disabled={none} />
          <Tile title="Save Project as File: XER" sub="Primavera P6" onClick={go(a.exportXer)} disabled={none} />
        </div>
      </>
    ),
    options: (
      <>
        <h2>Options</h2>
        <div className="bs-tiles col">
          <Tile title="Project Options" sub="New task mode, calculation, currency, critical slack" onClick={go(() => useMsp.getState().open("options"))} />
          <Tile title="Stratum Settings" sub="Interface, data, P6 connections, email, users" onClick={go(() => a.settings("interface"))} />
        </div>
      </>
    ),
  };
  return (
    <div className="msp-bs" role="dialog" aria-label="File">
      <nav className="msp-bs-nav">
        <button className="back" onClick={onClose} aria-label="Back" title="Back">
          <ArrowLeft size={22} aria-hidden />
        </button>
        {nav.map(([k, label, dis]) => (
          <button
            key={k}
            disabled={dis}
            className={page === k ? "on" : ""}
            onClick={() => {
              if (k === "save-now") return go(a.save)();
              if (k === "close") return onClose();
              setPage(k);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="msp-bs-page">{body[page]}</div>
    </div>
  );
}
