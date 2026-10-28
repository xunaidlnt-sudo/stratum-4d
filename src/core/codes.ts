// Activity code types with P6 scopes. Project codes live in the schedule;
// global codes apply to every project and EPS codes to the projects under an
// EPS node, so those two are also kept in the shared enterprise store and
// merged in when a project is open.

import { epsNode } from "./multiproject";
import type { CodeType, Schedule } from "./types";

export type CodeScope = NonNullable<CodeType["scope"]>;

export const scopeOf = (t: CodeType): CodeScope => t.scope ?? "project";

/** EPS node ids on the project's EPS path, lower-cased. */
export const epsIdsOf = (s: Schedule) => (s.eps ?? []).map((x) => epsNode(x).id.toLowerCase());

/** Does a code type apply to this project? */
export function codeApplies(t: CodeType, s: Schedule): boolean {
  const sc = scopeOf(t);
  if (sc !== "eps") return true;
  return !!t.epsNode && epsIdsOf(s).includes(t.epsNode.toLowerCase());
}

/**
 * Every code type the project can use: its own dictionary, shared global and
 * EPS types that apply to it, and any code names found on activities.
 * Values are sorted; the schedule's copy of a type wins over the shared one.
 */
export function allCodeTypes(s: Schedule, shared: CodeType[] = []): CodeType[] {
  const map = new Map<string, CodeType>();
  for (const t of shared) if (codeApplies(t, s)) map.set(t.name, { ...t, values: [...t.values] });
  for (const t of s.codeTypes ?? []) map.set(t.name, { ...t, values: [...t.values] });
  for (const a of s.activities)
    for (const k in a.codes) {
      const t = map.get(k) ?? map.set(k, { name: k, values: [] }).get(k)!;
      if (!t.values.some((v) => v.value === a.codes[k])) t.values.push({ value: a.codes[k] });
    }
  for (const t of map.values()) t.values.sort((x, y) => x.value.localeCompare(y.value, undefined, { numeric: true }));
  return [...map.values()].sort((x, y) => x.name.localeCompare(y.name));
}

/**
 * The shared list after editing this project's code types: global and EPS
 * types in `next` replace the shared ones of the same name; shared types the
 * project could see but `next` no longer has were deleted; the rest are kept.
 */
export function mergeSharedCodes(shared: CodeType[], visibleBefore: string[], next: CodeType[]): CodeType[] {
  const mine = next.filter((t) => scopeOf(t) !== "project");
  const names = new Set([...visibleBefore, ...next.map((t) => t.name)]);
  return [...shared.filter((t) => !names.has(t.name)), ...mine].sort((x, y) => x.name.localeCompare(y.name));
}
