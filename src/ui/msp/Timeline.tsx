// MS Project's Timeline: the project span with month ticks, tasks added with
// "Add to Timeline" as bars, milestones as diamonds, and the status date.

import { useMemo } from "react";
import { monthShort } from "../../core/dates";
import { scheduleRange } from "../../core/simulation";
import { fmtDate, useStore } from "../store";
import { useMsp } from "./state";

export function MspTimeline() {
  const schedule = useStore((s) => s.schedule);
  const selectActivity = useStore((s) => s.selectActivity);
  const range = useMemo(() => (schedule ? scheduleRange(schedule) : null), [schedule]);
  if (!schedule || !range) return <div className="msp-tl empty-tl">Add tasks with dates to the timeline</div>;
  const span = range.finish - range.start || 1;
  const pos = (t: number) => Math.min(100, Math.max(0, ((t - range.start) / span) * 100));
  const months: number[] = [];
  const s = new Date(range.start);
  for (let m = Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1); m < range.finish; m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)) months.push(m);
  const step = Math.max(1, Math.ceil(months.length / 14));
  const isMs = (t: string) => t === "milestone" || t === "finish-milestone";
  const miles = schedule.activities.filter((x) => isMs(x.type) && x.start !== null && (x.onTimeline || !schedule.activities.some((y) => y.onTimeline)));
  const bars = schedule.activities.filter((x) => x.onTimeline && !isMs(x.type) && x.start !== null && x.finish !== null).slice(0, 12);
  return (
    <div className="msp-tl" onDoubleClick={() => useMsp.getState().open("taskInfo")}>
      <div className="tl-ends">
        <span>
          Start
          <br />
          <b>{fmtDate(range.start)}</b>
        </span>
      </div>
      <div className="tl-track">
        <div className="tl-months">
          {months.map((m, i) =>
            i % step === 0 ? (
              <span key={m} style={{ left: `${pos(m)}%` }}>
                {monthShort(new Date(m))} '{String(new Date(m).getUTCFullYear()).slice(2)}
              </span>
            ) : null,
          )}
        </div>
        <div className="tl-bar">
          {bars.map((b, i) => (
            <button key={b.id} className={`tl-task c${i % 4}`} style={{ left: `${pos(b.start!)}%`, width: `${Math.max(1, pos(b.finish!) - pos(b.start!))}%` }} title={`${b.name}\n${fmtDate(b.start)} – ${fmtDate(b.finish)}`} onClick={() => selectActivity(b.id)}>
              {b.name}
            </button>
          ))}
        </div>
        {schedule.dataDate !== null && (
          <div className="tl-today" style={{ left: `${pos(schedule.dataDate)}%` }} title={`Status date ${fmtDate(schedule.dataDate)}`}>
            <span>Status date</span>
          </div>
        )}
        {miles.slice(0, 40).map((m, i) => (
          <div key={m.id} className={`tl-ms ${i % 2 ? "low" : ""} ${pos(m.start!) > 80 ? "end" : ""}`} style={{ left: `${pos(m.start!)}%` }} title={m.name} onClick={() => selectActivity(m.id)}>
            <i />
            <span>
              {m.name}
              <br />
              {fmtDate(m.start)}
            </span>
          </div>
        ))}
      </div>
      <div className="tl-ends right">
        <span>
          Finish
          <br />
          <b>{fmtDate(range.finish)}</b>
        </span>
      </div>
    </div>
  );
}
