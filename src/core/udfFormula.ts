// Formulas for user-defined fields. A number or cost UDF can be calculated
// from other columns, e.g. "[Budgeted Total Cost] * 0.05" or
// "max([Total Float], 0) / 8"; an indicator UDF can take its colour from
// thresholds on any numeric column (P6 indicator conditions). Expressions are
// parsed here, never passed to eval.

import type { Activity, UdfDef } from "./types";

/** `k` is passed through to the field getters (the field context). */
export type NumGetter = (a: Activity, k?: unknown) => number | null;

/** Resolve a [Field Name] to a numeric getter; null when the name is unknown. */
export type FieldLookup = (name: string) => NumGetter | null;

type Node = NumGetter;

const FUNCS: Record<string, (xs: number[]) => number> = {
  min: (xs) => Math.min(...xs),
  max: (xs) => Math.max(...xs),
  abs: (xs) => Math.abs(xs[0]),
  round: (xs) => (xs.length > 1 ? Math.round(xs[0] * 10 ** xs[1]) / 10 ** xs[1] : Math.round(xs[0])),
};

/** Compile a formula; throws an Error with a readable message when it is not valid. */
export function compileFormula(expr: string, lookup: FieldLookup): Node {
  const src = expr.trim();
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const fail = (msg: string): never => {
    throw new Error(`${msg} at position ${i + 1}`);
  };
  const peek = () => (ws(), src[i]);

  const primary = (): Node => {
    const c = peek();
    if (c === "(") {
      i++;
      const n = sum();
      if (peek() !== ")") fail("Missing )");
      i++;
      return n;
    }
    if (c === "-") {
      i++;
      const n = primary();
      return (a, k) => {
        const v = n(a, k);
        return v === null ? null : -v;
      };
    }
    if (c === "[") {
      const end = src.indexOf("]", i);
      if (end < 0) fail("Missing ]");
      const name = src.slice(i + 1, end).trim();
      const g = lookup(name);
      if (!g) fail(`Unknown field [${name}]`);
      i = end + 1;
      return g!;
    }
    const num = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      const v = Number(num[0]);
      return () => v;
    }
    const fn = /^[a-z]+/i.exec(src.slice(i));
    if (fn && FUNCS[fn[0].toLowerCase()]) {
      i += fn[0].length;
      if (peek() !== "(") fail(`Expected ( after ${fn[0]}`);
      i++;
      const args: Node[] = [sum()];
      while (peek() === ",") {
        i++;
        args.push(sum());
      }
      if (peek() !== ")") fail("Missing )");
      i++;
      const f = FUNCS[fn[0].toLowerCase()];
      return (a, k) => {
        const xs = args.map((n) => n(a, k));
        return xs.some((x) => x === null) ? null : f(xs as number[]);
      };
    }
    return fail(c === undefined ? "Formula ends early" : `Unexpected "${c}"`);
  };
  const product = (): Node => {
    let left = primary();
    for (let c = peek(); c === "*" || c === "/"; c = peek()) {
      i++;
      const l = left;
      const r = primary();
      left =
        c === "*"
          ? (a, k) => {
              const x = l(a, k);
              const y = r(a, k);
              return x === null || y === null ? null : x * y;
            }
          : (a, k) => {
              const x = l(a, k);
              const y = r(a, k);
              return x === null || y === null || y === 0 ? null : x / y;
            };
    }
    return left;
  };
  function sum(): Node {
    let left = product();
    for (let c = peek(); c === "+" || c === "-"; c = peek()) {
      i++;
      const l = left;
      const r = product();
      const sign = c === "+" ? 1 : -1;
      left = (a, k) => {
        const x = l(a, k);
        const y = r(a, k);
        return x === null || y === null ? null : x + sign * y;
      };
    }
    return left;
  }
  if (!src) throw new Error("Empty formula");
  const n = sum();
  if (peek() !== undefined) fail(`Unexpected "${src[i]}"`);
  return n;
}

/** Field names a formula refers to, for showing dependencies. */
export const formulaFields = (expr: string) => [...expr.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());

/** Colour of an indicator UDF from its rule: the first condition met wins, else `otherwise`. */
export function indicatorFromRule(rule: NonNullable<UdfDef["indicatorRule"]>, lookup: FieldLookup): (a: Activity, k?: unknown) => string {
  const g = lookup(rule.field);
  return (a, k) => {
    const v = g?.(a, k);
    if (v === null || v === undefined) return "";
    for (const r of rule.rules) {
      const hit = r.op === "<" ? v < r.value : r.op === "<=" ? v <= r.value : r.op === "=" ? v === r.value : r.op === ">=" ? v >= r.value : v > r.value;
      if (hit) return r.color;
    }
    return rule.otherwise ?? "";
  };
}
