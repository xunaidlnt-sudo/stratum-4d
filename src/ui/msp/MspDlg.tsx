// The MS Project dialog frame: title bar, tabs along the top, the page, and
// Help on the left with OK / Cancel on the right of the bottom row.

import { HelpCircle, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { fmtDate } from "../store";

export function MspDlg({
  title,
  children,
  onClose,
  onOk,
  okLabel = "OK",
  width = 560,
  tabs,
  tab,
  onTab,
  extra,
  noCancel,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onOk?: () => void;
  okLabel?: string;
  width?: number;
  tabs?: [string, string][];
  tab?: string;
  onTab?: (t: string) => void;
  /** Buttons left of OK (e.g. Details…, Statistics…). */
  extra?: ReactNode;
  noCancel?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("input:not([type=checkbox]):not([type=radio]):not([disabled]), select, textarea");
    first?.focus();
  }, []);
  return (
    <div className="help-backdrop msp-dlg-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="msp-dlg"
        ref={ref}
        style={{ width: `min(${width}px, calc(100vw - 24px))` }}
        role="dialog"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && onOk && !(e.target as HTMLElement).closest("textarea, button, select")) (e.preventDefault(), onOk());
        }}
      >
        <div className="msp-dlg-title">
          <span>{title}</span>
          <button onClick={onClose} aria-label="Close" title="Close">
            <X size={14} aria-hidden />
          </button>
        </div>
        {tabs && (
          <div className="msp-dlg-tabs" role="tablist">
            {tabs.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => onTab?.(k)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className={`msp-dlg-body ${tabs ? "tabbed" : ""}`}>{children}</div>
        <div className="msp-dlg-foot">
          <button className="msp-help" title="Help" onClick={() => window.dispatchEvent(new CustomEvent("stratum:help"))}>
            <HelpCircle size={15} aria-hidden />
          </button>
          <span className="spacer" />
          {extra}
          {onOk && (
            <button className="msp-btn primary" onClick={onOk}>
              {okLabel}
            </button>
          )}
          {!noCancel && (
            <button className="msp-btn" onClick={onClose}>
              {onOk ? "Cancel" : "Close"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A labelled row of a dialog form. */
export const Row = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
  <label className={`msp-frow ${wide ? "wide" : ""}`}>
    <span>{label}</span>
    {children}
  </label>
);

/** Date as an <input type=date> value (UTC). */
export const dateVal = (t: number | null | undefined) => (t === null || t === undefined ? "" : new Date(t).toISOString().slice(0, 10));
/** <input type=date> value back to a UTC time, keeping the time of day of the old value (or a given hour). */
export const fromDateVal = (v: string, keep: number | null | undefined, hour = 8): number | null => {
  if (!v) return null;
  const day = Date.parse(`${v}T00:00:00Z`);
  const tod = keep !== null && keep !== undefined ? ((keep % 86_400_000) + 86_400_000) % 86_400_000 : hour * 3_600_000;
  return day + tod;
};

export const Fieldset = ({ legend, children }: { legend: string; children: ReactNode }) => (
  <fieldset className="msp-fs">
    <legend>{legend}</legend>
    {children}
  </fieldset>
);

export { fmtDate };
