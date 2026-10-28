// Enterprise data everyone using the same store should see: EPS nodes,
// portfolios, project code types and EPS managers. Read from a local cache so
// the UI stays synchronous; writes go to the cache and, when the store
// supports it (a cloud folder), to the shared file.

import { useConfig } from "../backend/config";
import type { Backend } from "../backend/types";

export const SHARED_KEYS = ["stratum.eps.v1", "stratum.portfolios.v1", "stratum.projectcodes.v1", "stratum.epsobs.v1"] as const;
export type SharedKey = (typeof SHARED_KEYS)[number];

export function sharedGet<T>(key: SharedKey, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function sharedSet(key: SharedKey, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window */
  }
  const b = useConfig.getState().backend;
  if (b.setShared) void b.setShared(key, value).catch((e) => console.warn("Shared settings not saved to the cloud folder:", e));
}

/** Pull the shared values from the store (cloud wins); push local ones it does not have yet. */
export async function syncShared(b: Backend) {
  if (!b.getShared || !b.setShared) return;
  let changed = false;
  for (const k of SHARED_KEYS) {
    const remote = await b.getShared(k).catch(() => undefined);
    if (remote !== undefined && remote !== null) {
      try {
        localStorage.setItem(k, JSON.stringify(remote));
      } catch {
        /* ignore */
      }
      changed = true;
    } else {
      const local = localStorage.getItem(k);
      if (local !== null) await b.setShared(k, JSON.parse(local)).catch(() => {});
    }
  }
  if (changed) window.dispatchEvent(new Event("stratum:portfolios"));
}
