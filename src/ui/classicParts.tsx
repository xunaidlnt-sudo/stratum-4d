// Pieces shared by the P6 and MS Project layouts: menu bar, toolbar
// buttons, the data date box and the empty-project panel.

import { CalendarDays, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addActivityAfterSelected, deleteSelectedActivity } from "./ActivityEditor";
import { useTraining } from "./training/engine";
import { fmtDate, useStore, type GanttFilterKind } from "./store";

export interface ClassicActions {
  projects: () => void;
  /** Open one project from the database. */
  openOne?: (id: string) => Promise<void>;
  save: () => void;
  saveAsNew: () => void;
  importSchedule: () => void;
  importP6: () => void;
  pushP6: (() => void) | null;
  schedule: () => void;
  exportXer: () => void;
  exportCsv: () => void;
  openFile: () => void;
  saveFile: () => void;
  sample: (kind: "gis" | "rc") => void;
  /** Take baseline dates from an approved-baseline XER/XML (P6: Assign Baselines). */
  assignBaseline: () => void;
  dashboards: () => void;
  settings: (tab?: "interface" | "data" | "p6" | "email" | "users") => void;
  help: () => void;
  dbLabel: string;
}

export const FILTERS: [GanttFilterKind, string][] = [
  ["all", "All Activities"],
  ["critical", "Critical"],
  ["not-started", "Not Started"],
  ["in-progress", "In Progress"],
  ["complete", "Completed"],
  ["late", "Late against Baseline"],
  ["milestones", "Milestones"],
];

// ---------------------------------------------------------------- menu bar

export type MenuItem = { label: string; onClick?: () => void; disabled?: boolean; checked?: boolean; shortcut?: string } | "sep";

export function MenuBar({ menus, className }: { menus: [string, MenuItem[]][]; className: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className={className} ref={ref} role="menubar">
      {menus.map(([name, items], i) => (
        <div key={name} className="mb-item">
          <button className={open === i ? "open" : ""} role="menuitem" onClick={() => setOpen(open === i ? null : i)} onMouseEnter={() => open !== null && setOpen(i)}>
            {name}
          </button>
          {open === i && (
            <div className="mb-drop" role="menu">
              {items.map((it, k) =>
                it === "sep" ? (
                  <hr key={k} />
                ) : (
                  <button
                    key={k}
                    role="menuitem"
                    disabled={it.disabled}
                    onClick={() => {
                      setOpen(null);
                      it.onClick?.();
                    }}
                  >
                    <span className="mb-check">{it.checked ? "✓" : ""}</span>
                    <span className="mb-label">{it.label}</span>
                    <span className="mb-key">{it.shortcut ?? ""}</span>
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export const IconBtn = ({ Icon, title, onClick, disabled }: { Icon: LucideIcon; title: string; onClick: () => void; disabled?: boolean }) => (
  <button className="icon-btn" title={title} aria-label={title} onClick={onClick} disabled={disabled}>
    <Icon size={16} strokeWidth={1.7} aria-hidden />
  </button>
);

/** Ins adds an activity after the selected one, Del deletes it, Ctrl+F finds. */
export function useClassicKeys(find: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest("input, textarea, select, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        find();
      } else if (!typing && e.key === "Insert") {
        e.preventDefault();
        addActivityAfterSelected();
      } else if (!typing && e.key === "Delete" && useStore.getState().selectedActivity) {
        e.preventDefault();
        deleteSelectedActivity();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [find]);
}


/**
 * Data date (MS Project: status date) as a date box. Moving it forward is the
 * first step of an update; the time of day is kept. Reschedule (F9) after.
 */
export function DataDateInput({ label }: { label: string }) {
  const schedule = useStore((s) => s.schedule);
  const ref = useRef<HTMLInputElement>(null);
  const DAY = 86_400_000;
  const dd = schedule?.dataDate ?? null;
  const value = dd !== null ? new Date(dd).toISOString().slice(0, 10) : "";
  return (
    <span className="dd-edit" title={`${label}: progress is recorded up to this date. Click to change it, then reschedule (F9).`}>
      {label}:
      <button
        type="button"
        disabled={!schedule}
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          try {
            el.showPicker();
          } catch {
            el.focus();
          }
        }}
      >
        {fmtDate(dd) || "—"}
        <CalendarDays size={12} aria-hidden />
      </button>
      <input
        ref={ref}
        type="date"
        className="dd-native"
        aria-label={label}
        value={value}
        disabled={!schedule}
        onChange={(e) => {
          const st = useStore.getState();
          if (!st.schedule || !e.target.value) return;
          const day = Date.parse(`${e.target.value}T00:00:00Z`);
          const time = st.schedule.dataDate !== null ? ((st.schedule.dataDate % DAY) + DAY) % DAY : 0;
          st.setSchedule({ ...st.schedule, dataDate: day + time }, { keepTime: true, dirty: true });
          st.setStatus(`${label} set to ${fmtDate(day + time)}. Press F9 to reschedule.`);
        }}
      />
    </span>
  );
}

export function EmptySample({ a }: { a: ClassicActions }) {
  return (
    <div className="empty-sample">
      <p>No project open. Open one from the database, import an XER / XML file, or try a sample project:</p>
      <button className="primary" onClick={() => a.sample("gis")}>
        220 kV GIS substation (UAE)
      </button>
      <button className="link" onClick={() => a.sample("rc")}>
        or a small RC building
      </button>
      <p className="empty-train">
        New to planning or to Stratum?{" "}
        <button className="link" onClick={() => useTraining.getState().openCatalog(true)}>
          Start training mode
        </button>{" "}
        for guided, hands-on lessons.
      </p>
    </div>
  );
}

