// Keeps the main window and its display windows (views opened on other
// monitors) in step over a BroadcastChannel: the schedule, the selection,
// filters, collapsed bands and the data date travel both ways, so an edit
// or a click in any window shows in all of them.
//
// The raw XER tables kept for round-trip export (schedule.sourceXer) can be
// tens of megabytes; they never travel. Each window keeps its own copy and
// the main window's copy is the one that gets exported.

import type { Schedule } from "../../core/types";
import { useStore, type AppState } from "../store";

const CHANNEL = "stratum-sync-v1";

/** State that is shared between windows. */
const KEYS = ["schedule", "selectedActivity", "selectedActivities", "collapsedWbs", "ganttFilter", "ganttTracking", "scheduleDirty", "scheduleReport", "time", "currentProjectId"] as const;
type Key = (typeof KEYS)[number];
type Shared = Partial<Pick<AppState, Key>>;

type Msg =
  | { t: "hello"; from: string; view?: string }
  | { t: "host-up"; from: string }
  | { t: "snapshot"; from: string; to: string; state: Shared }
  | { t: "state"; from: string; state: Shared; label?: string }
  | { t: "bye"; from: string }
  | { t: "bounds?"; from: string }
  | { t: "bounds"; from: string; view: string; x: number; y: number; w: number; h: number }
  | { t: "close"; from: string; to?: string }
  | { t: "focus"; from: string; to: string };

const strip = (s: Schedule | null | undefined) => (s && s.sourceXer ? { ...s, sourceXer: null } : s ?? null);

export interface SyncHandle {
  id: string;
  peers: () => Map<string, string>;
  post: (m: Msg) => void;
  on: (fn: (m: Msg) => void) => () => void;
  stop: () => void;
}

let handle: SyncHandle | null = null;

/** Start syncing this window. `host` is the main window; display windows pass their id and view. */
export function startSync(opts: { host: true } | { host: false; id: string; view: string }): SyncHandle | null {
  if (handle) return handle;
  if (typeof BroadcastChannel === "undefined") return null;
  const ch = new BroadcastChannel(CHANNEL);
  const id = opts.host ? "main" : opts.id;
  const peers = new Map<string, string>(); // id -> view
  const listeners = new Set<(m: Msg) => void>();
  let applying = false;
  let pending: Shared = {};
  let timer: ReturnType<typeof setTimeout> | null = null;

  const post = (m: Msg) => ch.postMessage(m);
  const pick = (st: AppState, keys: readonly Key[]): Shared => {
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = k === "schedule" ? strip(st.schedule) : st[k];
    return out as Shared;
  };

  const flush = () => {
    timer = null;
    if (!peers.size && opts.host) {
      pending = {};
      return;
    }
    const state = pending;
    pending = {};
    if (Object.keys(state).length) post({ t: "state", from: id, state });
  };

  const unsub = useStore.subscribe((st, prev) => {
    if (applying) return;
    let any = false;
    for (const k of KEYS) {
      if (st[k] !== prev[k]) {
        (pending as Record<string, unknown>)[k] = k === "schedule" ? strip(st.schedule) : st[k];
        any = true;
      }
    }
    if (!any) return;
    // Schedules are big: coalesce bursts (typing in a cell) into one message.
    if (timer === null) timer = setTimeout(flush, "schedule" in pending ? 80 : 0);
  });

  const apply = (state: Shared, label?: string) => {
    const st = useStore.getState();
    const patch: Partial<AppState> = { ...state };
    if (state.schedule !== undefined) {
      const remote = state.schedule;
      // Keep this window's raw XER tables for round-trip export.
      patch.schedule = remote && st.schedule?.sourceXer && st.schedule.projectId === remote.projectId ? { ...remote, sourceXer: st.schedule.sourceXer } : remote;
      // In the main window an edit made in a display is one undoable step.
      if (opts.host && st.schedule && remote && st.schedule !== remote) patch.past = [...st.past.slice(-59), { s: st.schedule, label: label ?? "Edit in display window" }];
    }
    applying = true;
    try {
      useStore.setState(patch);
    } finally {
      applying = false;
    }
  };

  ch.onmessage = (e: MessageEvent<Msg>) => {
    const m = e.data;
    if (!m || m.from === id) return;
    if ("to" in m && m.to && m.to !== id) return;
    switch (m.t) {
      case "hello":
        peers.set(m.from, m.view ?? "");
        if (opts.host) post({ t: "snapshot", from: id, to: m.from, state: pick(useStore.getState(), KEYS) });
        break;
      case "host-up":
        if (!opts.host) post({ t: "hello", from: id, view: (opts as { view: string }).view });
        peers.set(m.from, "");
        break;
      case "snapshot":
        apply(m.state);
        peers.set(m.from, "");
        break;
      case "state":
        peers.set(m.from, peers.get(m.from) ?? "");
        apply(m.state);
        break;
      case "bye":
        peers.delete(m.from);
        break;
      case "bounds?":
        if (!opts.host) post({ t: "bounds", from: id, view: (opts as { view: string }).view, x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
        break;
      case "close":
        if (!opts.host) window.close();
        break;
      case "focus":
        window.focus();
        break;
    }
    for (const fn of listeners) fn(m);
  };

  if (opts.host) post({ t: "host-up", from: id });
  else post({ t: "hello", from: id, view: opts.view });
  const bye = () => post({ t: "bye", from: id });
  window.addEventListener("pagehide", bye);

  handle = {
    id,
    peers: () => peers,
    post,
    on: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    stop: () => {
      bye();
      unsub();
      window.removeEventListener("pagehide", bye);
      ch.close();
      handle = null;
    },
  };
  return handle;
}

export const syncHandle = () => handle;
