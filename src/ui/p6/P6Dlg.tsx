// The P6 Professional dialog frame: content on the left, a column of command
// buttons on the right (OK / Close, Cancel, Add, Delete, Cut, Copy, Paste,
// move arrows, Help) and, for dictionaries, detail tabs under the list.

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  ClipboardPaste,
  Copy,
  FilePen,
  HelpCircle,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  X,
  XCircle,
} from "lucide-react";
import { Children, cloneElement, Fragment, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { useP6 } from "./commands";

export function P6Dlg({ title, children, side, onClose, width = 760 }: { title: string; children: ReactNode; side: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="help-backdrop p6-dlg-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="p6-dlg p6-dlg2" style={{ width: `min(${width}px, calc(100vw - 32px))` }} role="dialog" aria-label={title} onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="p6-dlg-title">
          <span>{title}</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close" title="Close">
            <X size={14} aria-hidden />
          </button>
        </div>
        <div className="p6-dlg2-body">
          <div className="p6-dlg2-main p6-dlg-body">{children}</div>
          <div className="p6-dlg2-side">{side}</div>
        </div>
      </div>
    </div>
  );
}

const ICONS = {
  ok: <Check size={15} color="#2e8540" aria-hidden />,
  close: <XCircle size={15} aria-hidden />,
  cancel: <XCircle size={15} color="#c4321f" aria-hidden />,
  apply: <Play size={14} color="#2e8540" aria-hidden />,
  add: <Plus size={15} color="#1f5fa8" aria-hidden />,
  delete: <X size={15} color="#c4321f" aria-hidden />,
  cut: <Scissors size={14} aria-hidden />,
  copy: <Copy size={14} aria-hidden />,
  paste: <ClipboardPaste size={14} aria-hidden />,
  modify: <FilePen size={14} aria-hidden />,
  default: <RotateCcw size={14} color="#2e8540" aria-hidden />,
  help: <HelpCircle size={15} color="#c49a00" aria-hidden />,
  run: <Play size={14} color="#2e8540" aria-hidden />,
} as const;

export function SideBtn({ kind, label, onClick, disabled, primary }: { kind?: keyof typeof ICONS; label: string; onClick: () => void; disabled?: boolean; primary?: boolean }) {
  return (
    <button className={`p6-side-btn ${primary ? "primary-side" : ""}`} onClick={onClick} disabled={disabled}>
      {kind ? ICONS[kind] : null}
      <span>{label}</span>
    </button>
  );
}

export const SideGap = () => <div className="p6-side-gap" />;

/** Up / down / left / right arrows, as in P6's dictionaries. */
export function SideArrows({ up, down, left, right }: { up?: () => void; down?: () => void; left?: () => void; right?: () => void }) {
  return (
    <div className="p6-side-arrows">
      <button aria-label="Move up" disabled={!up} onClick={up}>
        <ArrowUp size={13} aria-hidden />
      </button>
      <button aria-label="Move left" disabled={!left} onClick={left}>
        <ArrowLeft size={13} aria-hidden />
      </button>
      <button aria-label="Move right" disabled={!right} onClick={right}>
        <ArrowRight size={13} aria-hidden />
      </button>
      <button aria-label="Move down" disabled={!down} onClick={down}>
        <ArrowDown size={13} aria-hidden />
      </button>
    </div>
  );
}

/** Help opens the matching chapter of the user guide. */
export function SideHelp({ topic }: { topic: string }) {
  return <SideBtn kind="help" label="Help" onClick={() => window.dispatchEvent(new CustomEvent("stratum:help", { detail: topic }))} />;
}

/** "Display: …" header bar above a P6 list. */
export const ListHead = ({ children }: { children: ReactNode }) => <div className="p6-listhead">▿ Display: {children}</div>;

/** Detail tabs under a dictionary list (General, Resources, Units & Prices…). */
export function DetailTabs({ tabs }: { tabs: [string, ReactNode][] }) {
  const [i, setI] = useState(0);
  return (
    <div className="p6-detail">
      <div className="p6-detail-tabs" role="tablist">
        {tabs.map(([t], k) => (
          <button key={t} role="tab" aria-selected={i === k} className={i === k ? "on" : ""} onClick={() => setI(k)}>
            {t}
          </button>
        ))}
      </div>
      <div className="p6-detail-body">{tabs[Math.min(i, tabs.length - 1)]?.[1]}</div>
    </div>
  );
}

export const closeDlg = () => useP6.getState().open(null);

/** Icon for a command button, picked from its label (P6 puts an icon on every command button). */
function iconFor(label: string): keyof typeof ICONS | null {
  const t = label.toLowerCase();
  if (/^ok\b/.test(t)) return "ok";
  if (/^close/.test(t)) return "close";
  if (/^cancel/.test(t)) return "cancel";
  if (/^apply/.test(t)) return "apply";
  if (/^(add|new|insert)/.test(t)) return "add";
  if (/^(delete|remove|clear|unassign)/.test(t)) return "delete";
  if (/^(default|reset|p6 defaults)/.test(t)) return "default";
  if (/^(modify|edit|rename)/.test(t)) return "modify";
  if (/^copy/.test(t)) return "copy";
  if (/^paste/.test(t)) return "paste";
  if (/^help/.test(t)) return "help";
  return "run";
}

const textOf = (n: ReactNode): string =>
  typeof n === "string" || typeof n === "number" ? String(n) : Array.isArray(n) ? n.map(textOf).join("") : isValidElement(n) ? textOf((n.props as { children?: ReactNode }).children) : "";

/** Turn a row of footer buttons into P6's command column: spacers become gaps, buttons get icons. */
export function SideColumn({ children }: { children: ReactNode }) {
  const out: ReactNode[] = [];
  const walk = (n: ReactNode) =>
    Children.forEach(n, (c) => {
      if (!isValidElement(c)) return;
      if (c.type === Fragment) return walk((c.props as { children?: ReactNode }).children);
      const props = c.props as { className?: string; children?: ReactNode };
      if (c.type === "span" && /spacer/.test(props.className ?? "")) return out.push(<SideGap key={`g${out.length}`} />);
      if (c.type === "button") {
        const label = textOf(props.children).trim();
        const k = iconFor(label);
        out.push(
          cloneElement(c as ReactElement<{ className?: string; children?: ReactNode }>, {
            key: `b${out.length}`,
            className: `p6-side-btn ${/primary/.test(props.className ?? "") ? "primary-side" : ""} ${(props.className ?? "").replace(/\bprimary\b/, "")}`,
            children: (
              <>
                {k ? ICONS[k] : null}
                <span>{props.children}</span>
              </>
            ),
          }),
        );
        return;
      }
      out.push(c);
    });
  walk(children);
  return <>{out}</>;
}
