// Change Working Time: pick a calendar, see a month with working, nonworking
// and exception days, add exceptions (holidays, extra working days) and edit
// the default work week. Applied on OK as one undo step.

import { useMemo, useState } from "react";
import { WEEKDAYS, MONTHS } from "../../core/dates";
import { standardCalendar } from "../../core/calendar";
import { uid } from "../../core/ops";
import type { Calendar, Schedule } from "../../core/types";
import { useStore } from "../store";
import { commitEdit } from "./actions";
import { MspDlg, Row, dateVal, fromDateVal } from "./MspDlg";

const DAY = 86_400_000;
const dayOf = (t: number) => Date.UTC(new Date(t).getUTCFullYear(), new Date(t).getUTCMonth(), new Date(t).getUTCDate());
const hm = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
const parseHm = (v: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  return m ? +m[1] + +m[2] / 60 : null;
};

interface Exception {
  key: string;
  name: string;
  from: number;
  to: number;
  working: boolean;
  spans: [number, number][];
}

/** Holidays and working-day exceptions folded into named ranges. */
function exceptionsOf(c: Calendar): Exception[] {
  const out: Exception[] = [];
  const names = c.exceptionNames ?? {};
  const days = [...new Set(c.holidays.map(dayOf))].sort((a, b) => a - b);
  for (const d of days) {
    const last = out[out.length - 1];
    if (last && !last.working && d - last.to === DAY && !names[String(d)]) last.to = d;
    else out.push({ key: uid("ex"), name: names[String(d)] ?? "Nonworking", from: d, to: d, working: false, spans: [] });
  }
  for (const w of c.workdays ?? []) out.push({ key: uid("ex"), name: names[String(dayOf(w.date))] ?? "Working", from: dayOf(w.date), to: dayOf(w.date), working: true, spans: w.spans });
  return out.sort((a, b) => a.from - b.from);
}

function applyExceptions(c: Calendar, list: Exception[], week: [number, number][][]): Calendar {
  const holidays: number[] = [];
  const workdays: { date: number; spans: [number, number][] }[] = [];
  const exceptionNames: Record<string, string> = {};
  for (const e of list) {
    exceptionNames[String(e.from)] = e.name;
    for (let d = e.from; d <= e.to; d += DAY) {
      if (e.working) workdays.push({ date: d, spans: e.spans.length ? e.spans : [[8, 12], [13, 17]] });
      else holidays.push(d);
    }
  }
  const work = week.filter((d) => d.length);
  const hoursPerDay = work.length ? Math.round((work.reduce((t, d) => t + d.reduce((h, [a, b]) => h + (b - a), 0), 0) / work.length) * 100) / 100 : c.hoursPerDay;
  return { ...c, week, holidays, workdays, exceptionNames, hoursPerDay };
}

export function WorkingTimeDialog({ onClose }: { onClose: () => void }) {
  const s = useStore((x) => x.schedule)!;
  const [cals, setCals] = useState<Calendar[]>(() => (s.calendars?.length ? s.calendars : [standardCalendar()]).map((c) => ({ ...c })));
  const [calId, setCalId] = useState(s.defaultCalendarId ?? cals[0].id);
  const cal = cals.find((c) => c.id === calId) ?? cals[0];
  const [exc, setExc] = useState<Record<string, Exception[]>>(() => Object.fromEntries(cals.map((c) => [c.id, exceptionsOf(c)])));
  const [week, setWeek] = useState<Record<string, [number, number][][]>>(() => Object.fromEntries(cals.map((c) => [c.id, c.week.map((d) => d.map((x) => [...x] as [number, number]))])));
  const [tab, setTab] = useState<"exceptions" | "weeks">("exceptions");
  const today = s.dataDate ?? Date.now();
  const [month, setMonth] = useState(Date.UTC(new Date(today).getUTCFullYear(), new Date(today).getUTCMonth(), 1));
  const [pickDay, setPickDay] = useState(dayOf(today));
  const [wdSel, setWdSel] = useState<number[]>([1]);
  const list = exc[cal.id] ?? [];
  const wk = week[cal.id] ?? cal.week;

  const preview = useMemo(() => applyExceptions(cal, list, wk), [cal, list, wk]);
  const dayInfo = (d: number) => {
    const w = preview.workdays?.find((x) => x.date === d);
    if (w) return { spans: w.spans, kind: "exception-work" as const };
    if (preview.holidays.includes(d)) return { spans: [] as [number, number][], kind: "exception-off" as const };
    // Edited working hours: a day whose hours differ from the calendar's other working days.
    const spans = preview.week[new Date(d).getUTCDay()];
    const usual = JSON.stringify(preview.week.find((x) => x.length) ?? []);
    const edited = spans.length > 0 && JSON.stringify(spans) !== usual;
    return { spans, kind: spans.length ? (edited ? ("edited" as const) : ("work" as const)) : ("off" as const) };
  };

  const grid: (number | null)[] = [];
  const first = new Date(month).getUTCDay();
  for (let i = 0; i < first; i++) grid.push(null);
  const m = new Date(month);
  const days = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  for (let d = 0; d < days; d++) grid.push(month + d * DAY);
  const info = dayInfo(pickDay);

  const newCalendar = () => {
    const name = prompt("Name of the new calendar:", `Copy of ${cal.name}`);
    if (!name) return;
    const c: Calendar = { ...applyExceptions(cal, list, wk), id: uid("cal"), name };
    setCals([...cals, c]);
    setExc({ ...exc, [c.id]: exceptionsOf(c) });
    setWeek({ ...week, [c.id]: c.week.map((d) => d.map((x) => [...x] as [number, number])) });
    setCalId(c.id);
  };
  const ok = () => {
    const out = cals.map((c) => applyExceptions(c, exc[c.id] ?? [], week[c.id] ?? c.week));
    const next: Schedule = { ...s, calendars: out, defaultCalendarId: s.defaultCalendarId ?? out[0]?.id ?? null };
    commitEdit(next, "Change Working Time");
    onClose();
  };
  const setList = (l: Exception[]) => setExc({ ...exc, [cal.id]: l });
  const setDays = (spans: [number, number][]) => {
    const w = wk.map((d, i) => (wdSel.includes(i) ? spans.map((x) => [...x] as [number, number]) : d));
    setWeek({ ...week, [cal.id]: w });
  };
  const selSpans = wk[wdSel[0] ?? 1] ?? [];
  const [from1, setFrom1] = useState<string[]>([]);

  return (
    <MspDlg
      title="Change Working Time"
      width={760}
      onClose={onClose}
      onOk={ok}
      extra={
        <button className="msp-btn" onClick={newCalendar}>
          Create New Calendar…
        </button>
      }
    >
      <div className="msp-inline">
        <Row label="For calendar:">
          <select value={cal.id} onChange={(e) => setCalId(e.target.value)}>
            {cals.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.id === s.defaultCalendarId ? " (Project Calendar)" : ""}
              </option>
            ))}
          </select>
        </Row>
      </div>
      <p className="msp-note">Calendar '{cal.name}' is a base calendar.</p>
      <div className="msp-wt">
        <div className="msp-wt-legend">
          <b>Legend:</b>
          <span><i className="lg work" /> Working</span>
          <span><i className="lg off" /> Nonworking</span>
          <span><i className="lg edited" /> Edited working hours</span>
          <span><i className="lg exc" /> Exception day</span>
        </div>
        <div className="msp-wt-cal">
          <div className="msp-wt-nav">
            <button onClick={() => setMonth(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() - 1, 1))} aria-label="Previous month">
              ◀
            </button>
            <b>
              {MONTHS[m.getUTCMonth()]} {m.getUTCFullYear()}
            </b>
            <button onClick={() => setMonth(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))} aria-label="Next month">
              ▶
            </button>
          </div>
          <div className="msp-wt-grid">
            {WEEKDAYS.map((w) => (
              <span key={w} className="hd">
                {w[0]}
              </span>
            ))}
            {grid.map((d, i) =>
              d === null ? (
                <span key={`e${i}`} />
              ) : (
                <button key={d} className={`d ${dayInfo(d).kind} ${d === pickDay ? "pick" : ""}`} onClick={() => setPickDay(d)}>
                  {new Date(d).getUTCDate()}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="msp-wt-info">
          <b>
            Working times for {new Date(pickDay).getUTCDate()} {MONTHS[new Date(pickDay).getUTCMonth()]} {new Date(pickDay).getUTCFullYear()}:
          </b>
          {info.spans.length ? (
            <ul>
              {info.spans.map(([a, b]) => (
                <li key={a}>
                  {hm(a)} to {hm(b)}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nonworking.</p>
          )}
          <p className="muted">
            Based on:{" "}
            {info.kind.startsWith("exception") ? `Exception '${list.find((e) => pickDay >= e.from && pickDay <= e.to)?.name ?? ""}' on calendar '${cal.name}'.` : `Default work week on calendar '${cal.name}'.`}
          </p>
        </div>
      </div>
      <div className="msp-dlg-tabs inner">
        <button className={tab === "exceptions" ? "on" : ""} onClick={() => setTab("exceptions")}>
          Exceptions
        </button>
        <button className={tab === "weeks" ? "on" : ""} onClick={() => setTab("weeks")}>
          Work Weeks
        </button>
      </div>
      {tab === "exceptions" ? (
        <div className="msp-ti-grid">
          <table className="msp-tbl">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                <th>Name</th>
                <th style={{ width: 140 }}>Start</th>
                <th style={{ width: 140 }}>Finish</th>
                <th style={{ width: 90 }}>Working</th>
                <th style={{ width: 24 }} />
              </tr>
            </thead>
            <tbody>
              {list.map((e, i) => (
                <tr key={e.key}>
                  <td className="num">{i + 1}</td>
                  <td>
                    <input value={e.name} onChange={(ev) => setList(list.map((x) => (x.key === e.key ? { ...x, name: ev.target.value } : x)))} aria-label="Name" />
                  </td>
                  <td>
                    <input type="date" value={dateVal(e.from)} onChange={(ev) => setList(list.map((x) => (x.key === e.key ? { ...x, from: fromDateVal(ev.target.value, null, 0) ?? x.from, to: Math.max(x.to, fromDateVal(ev.target.value, null, 0) ?? x.to) } : x)))} aria-label="Start" />
                  </td>
                  <td>
                    <input type="date" value={dateVal(e.to)} onChange={(ev) => setList(list.map((x) => (x.key === e.key ? { ...x, to: Math.max(x.from, fromDateVal(ev.target.value, null, 0) ?? x.to) } : x)))} aria-label="Finish" />
                  </td>
                  <td>
                    <select value={e.working ? "yes" : "no"} onChange={(ev) => setList(list.map((x) => (x.key === e.key ? { ...x, working: ev.target.value === "yes", spans: ev.target.value === "yes" && !x.spans.length ? [[8, 12], [13, 17]] : x.spans } : x)))} aria-label="Working">
                      <option value="no">Nonworking</option>
                      <option value="yes">Working</option>
                    </select>
                  </td>
                  <td>
                    <button className="msp-x" onClick={() => setList(list.filter((x) => x.key !== e.key))} aria-label="Delete" title="Delete">
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="msp-btn" onClick={() => setList([...list, { key: uid("ex"), name: "Holiday", from: pickDay, to: pickDay, working: false, spans: [] }])}>
            Add exception on {new Date(pickDay).getUTCDate()} {MONTHS[new Date(pickDay).getUTCMonth()].slice(0, 3)}
          </button>
        </div>
      ) : (
        <div className="msp-wt-week">
          <div>
            <b>Select day(s):</b>
            <div className="msp-wt-days">
              {WEEKDAYS.map((w, i) => (
                <label key={w}>
                  <input type="checkbox" checked={wdSel.includes(i)} onChange={(e) => (setFrom1([]), setWdSel(e.target.checked ? [...wdSel, i].sort() : wdSel.filter((x) => x !== i)))} /> {w}
                  <span className="muted"> {wk[i].length ? wk[i].map(([a, b]) => `${hm(a)}–${hm(b)}`).join(", ") : "Nonworking"}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="msp-radios">
            <label>
              <input type="radio" checked={false} onChange={() => setDays(standardCalendar().week[wdSel[0] ?? 1])} /> Use the default times for these days
            </label>
            <label>
              <input type="radio" checked={!selSpans.length} onChange={() => setDays([])} /> Set days to nonworking time
            </label>
            <label>
              <input type="radio" checked={selSpans.length > 0} onChange={() => !selSpans.length && setDays([[8, 12], [13, 17]])} /> Set day(s) to these specific working times:
            </label>
            <table className="msp-tbl">
              <thead>
                <tr>
                  <th />
                  <th>From</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((k) => {
                  const sp = selSpans[k];
                  const val = (j: 0 | 1) => from1[k * 2 + j] ?? (sp ? hm(sp[j]) : "");
                  const put = (j: 0 | 1, v: string) => {
                    const next = [...from1];
                    next[k * 2 + j] = v;
                    setFrom1(next);
                    const spans: [number, number][] = [];
                    for (let r = 0; r < 3; r++) {
                      const a = parseHm(next[r * 2] ?? (selSpans[r] ? hm(selSpans[r][0]) : ""));
                      const b = parseHm(next[r * 2 + 1] ?? (selSpans[r] ? hm(selSpans[r][1]) : ""));
                      if (a !== null && b !== null && b > a) spans.push([a, b]);
                    }
                    setDays(spans);
                  };
                  return (
                    <tr key={k}>
                      <td className="num">{k + 1}</td>
                      <td>
                        <input value={val(0)} onChange={(e) => put(0, e.target.value)} placeholder="08:00" aria-label={`From ${k + 1}`} disabled={!selSpans.length} />
                      </td>
                      <td>
                        <input value={val(1)} onChange={(e) => put(1, e.target.value)} placeholder="17:00" aria-label={`To ${k + 1}`} disabled={!selSpans.length} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </MspDlg>
  );
}
