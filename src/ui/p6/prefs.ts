// P6 User Preferences that change how values read (Edit → User Preferences):
// date format, time units for durations and decimals. Kept per user.

import { create } from "zustand";
import { displayPrefs, setDisplayPrefs, type DateFormat } from "../../core/fields";

export interface Prefs {
  dateFormat: DateFormat;
  showTime: boolean;
  durationUnit: "d" | "h";
  decimals: number;
  currency: string;
  currencyDecimals: number;
  /** P6 User Preferences › Application › Startup Window. */
  startupWindow?: string;
  /** Visual style of the P6 layout: P6 Professional's Windows look, or Stratum's modern one. */
  p6Look?: "classic" | "modern";
}

const KEY = "stratum.p6.prefs.v1";
function load(): Prefs {
  try {
    return { ...displayPrefs, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...displayPrefs };
  }
}

const initial = load();
setDisplayPrefs(initial);

export const usePrefs = create<Prefs & { set: (p: Partial<Prefs>) => void }>((set, get) => ({
  ...initial,
  set: (p) => {
    set(p);
    const { set: _s, ...rest } = get();
    void _s;
    setDisplayPrefs(rest);
    try {
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      /* private window */
    }
  },
}));
