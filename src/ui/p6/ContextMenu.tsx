// Right-click menu, positioned at the pointer and kept on screen.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";

export type CtxItem = { label: string; onClick?: () => void; disabled?: boolean; checked?: boolean; shortcut?: string; sub?: CtxItem[] } | "sep";

interface CtxState {
  at: { x: number; y: number } | null;
  items: CtxItem[];
  show: (x: number, y: number, items: CtxItem[]) => void;
  hide: () => void;
}

export const useCtx = create<CtxState>((set) => ({
  at: null,
  items: [],
  show: (x, y, items) => set({ at: { x, y }, items }),
  hide: () => set({ at: null, items: [] }),
}));

function List({ items, x, y, onDone }: { items: CtxItem[]; x: number; y: number; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [sub, setSub] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  return (
    <div className="ctx-menu" ref={ref} style={{ left: pos.x, top: pos.y }} role="menu" onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === "sep" ? (
          <hr key={`s${i}`} />
        ) : (
          <div key={it.label} className="ctx-row" onMouseEnter={() => setSub(it.sub ? i : null)}>
            <button
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                if (it.sub) return setSub(i);
                onDone();
                it.onClick?.();
              }}
            >
              <span className="mb-check">{it.checked ? "✓" : ""}</span>
              <span className="mb-label">{it.label}</span>
              <span className="mb-key">{it.sub ? "▸" : it.shortcut ?? ""}</span>
            </button>
            {sub === i && it.sub && ref.current && (
              <List items={it.sub} x={pos.x + ref.current.offsetWidth - 4} y={pos.y + (ref.current.children[i] as HTMLElement).offsetTop} onDone={onDone} />
            )}
          </div>
        ),
      )}
    </div>
  );
}

export function ContextMenuHost() {
  const { at, items, hide } = useCtx();
  useEffect(() => {
    if (!at) return;
    const close = (e: MouseEvent) => !(e.target as HTMLElement).closest(".ctx-menu") && hide();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", hide);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", hide);
    };
  }, [at, hide]);
  if (!at) return null;
  return <List items={items} x={at.x} y={at.y} onDone={hide} />;
}
