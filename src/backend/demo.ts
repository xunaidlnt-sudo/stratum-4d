// Web demo sessions. Every visitor gets their own copy of the sample projects
// and can change, create and delete projects in it. A new browser tab, a new
// visit or "Sign out" starts a fresh session with the same samples again.
//
// Where the session lives:
//   - Cloudflare D1 behind /api/demo (functions/api/demo/[[path]].ts) when the
//     site is served by Cloudflare Pages: the session is kept on the server,
//     keyed by a random session id, and expires after a day without use;
//   - otherwise IndexedDB in this browser, under a name per session.
// The session id is kept in sessionStorage, so it ends with the browser tab.

import { browserBackend, idbKv, type Kv, type Store, type StoredProjectRecord } from "./browser";
import type { Backend, ProjectSummary } from "./types";

/** Set at build time for the hosted demo (see .github/workflows/pages.yml). */
export const DEMO_SESSIONS = (import.meta.env.VITE_DEMO_SESSIONS as string | undefined) === "1";

const SESSION_KEY = "stratum.demo.session";
const LOCAL_LIST = "stratum.demo.localSessions";
const API = "/api/demo";

function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** The session of this tab: its id, and whether it was just created (then it needs the samples). */
export const demoSession: { id: string; fresh: boolean } = (() => {
  if (!DEMO_SESSIONS) return { id: "", fresh: false };
  try {
    const old = sessionStorage.getItem(SESSION_KEY);
    if (old) return { id: old, fresh: false };
    const id = newId();
    sessionStorage.setItem(SESSION_KEY, id);
    return { id, fresh: true };
  } catch {
    return { id: newId(), fresh: true };
  }
})();

// ---------------------------------------------------------------- Cloudflare

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "X-Demo-Session": demoSession.id, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    keepalive: method === "DELETE" && path === "/session",
  });
  if (res.status === 404 && method === "GET") return undefined as T;
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Demo server error ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;
const httpKv: Kv = {
  get: <T>(store: Store, key: string) => call<T | undefined>("GET", `/kv/${store}/${enc(key)}`),
  all: async <T>(store: Store) => (await call<T[]>("GET", `/kv/${store}`)) ?? [],
  put: (store, key, value) => call<void>("PUT", `/kv/${store}/${enc(key)}`, value),
  del: (store, key) => call<void>("DELETE", `/kv/${store}/${enc(key)}`),
};

/** Is the Cloudflare demo store there? (Not on GitHub Pages or a local build.) */
async function cloudflareUp(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const res = await fetch(`${API}/health`, { signal: ctl.signal, headers: { "X-Demo-Session": demoSession.id } });
    clearTimeout(t);
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- the store

const where: Promise<"cloudflare" | "browser"> = DEMO_SESSIONS ? cloudflareUp().then((up) => (up ? "cloudflare" : "browser")) : Promise.resolve("browser");

/** IndexedDB for this session; databases of older sessions in this browser are removed. */
function localKv(): Kv {
  const name = `stratum-demo-${demoSession.id}`;
  if (demoSession.fresh) {
    try {
      const old: string[] = JSON.parse(localStorage.getItem(LOCAL_LIST) ?? "[]");
      for (const n of old) if (n !== name) indexedDB.deleteDatabase(n);
      localStorage.setItem(LOCAL_LIST, JSON.stringify([name]));
    } catch {
      /* storage blocked */
    }
  }
  return idbKv(name);
}

let chosen: Kv | null = null;
const kv = async (): Promise<Kv> => (chosen ??= (await where) === "cloudflare" ? httpKv : localKv());
const lazy: Kv = {
  get: async (s, k) => (await kv()).get(s, k),
  all: async (s) => (await kv()).all(s),
  put: async (s, k, v) => (await kv()).put(s, k, v),
  del: async (s, k) => (await kv()).del(s, k),
};

export function demoBackend(): Backend {
  const b = browserBackend(lazy, "Demo session", async () => {
    if ((await where) === "cloudflare") return (await call<ProjectSummary[]>("GET", "/kv/projects?field=summary")) ?? [];
    return (await (await kv()).all<StoredProjectRecord>("projects")).map((p) => p.summary);
  });
  void where.then((w) => (b.label = w === "cloudflare" ? "Demo session (Cloudflare)" : "Demo session (this browser)"));
  return b;
}

export const demoStoreKind = () => where;

/** End this session: its data is removed and the next load starts a new one with fresh samples. */
export async function endDemoSession() {
  if (!DEMO_SESSIONS) return;
  try {
    if ((await where) === "cloudflare") await call("DELETE", "/session");
    else indexedDB.deleteDatabase(`stratum-demo-${demoSession.id}`);
  } catch {
    /* the server forgets old sessions anyway */
  }
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
