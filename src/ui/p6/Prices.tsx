// P6's five Price/Unit columns (rate types), shared by the Resources and
// Roles Units & Prices tabs.

import { RATE_TYPE_NAMES } from "../../core/resources";

type Priced = { pricePerUnit: number; prices?: number[] };

const get = (x: Priced, k: number) =>
  k === 0 ? x.pricePerUnit : (x.prices?.[k] ?? 0);

/** The same object with Price/Unit k set (k = 0..4); index 0 also sets pricePerUnit. */
export function withPrice<T extends Priced>(x: T, k: number, v: number): T {
  const prices = [0, 1, 2, 3, 4].map((i) => (i === k ? v : get(x, i)));
  // Only keep the list when a second price is set; undefined (not deleted) so merges clear it too.
  return {
    ...x,
    prices: prices.slice(1).some((p) => p) ? prices : undefined,
    ...(k === 0 ? { pricePerUnit: v } : {}),
  };
}

export function PriceHeads() {
  return (
    <>
      {RATE_TYPE_NAMES.map((n) => (
        <td key={n}>{n}</td>
      ))}
    </>
  );
}

export function PriceCells<T extends Priced>({
  x,
  set,
}: {
  x: T;
  set: (next: T) => void;
}) {
  return (
    <>
      {RATE_TYPE_NAMES.map((n, k) => (
        <td key={n}>
          <input
            className="cell num"
            type="number"
            min={0}
            aria-label={n}
            value={get(x, k)}
            onChange={(e) =>
              set(withPrice(x, k, Math.max(0, Number(e.target.value) || 0)))
            }
            style={{ width: 68 }}
          />
        </td>
      ))}
    </>
  );
}

/** Default (undated) prices as one grid row under the five rate-type headings. */
export function BasePrices<T extends Priced>({
  x,
  set,
}: {
  x: T;
  set: (next: T) => void;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="p6-grid">
        <thead>
          <tr>
            <PriceHeads />
          </tr>
        </thead>
        <tbody>
          <tr>
            <PriceCells x={x} set={set} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
