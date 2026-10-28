// User Preferences, the Schedule Log, and Excel export / import of the
// activity table (P6's "Export to Excel" and "Import from Excel").

import { download as saveFile } from "../files";
import { useMemo, useState } from "react";
import { fieldCtx, fieldsFor, fieldText, type DateFormat } from "../../core/fields";
import { scheduleLog, scheduleLogText } from "../../core/scheduleLog";
import { importTable, type Cell, type ImportResult } from "../../core/tableImport";
import { useStore } from "../store";
import { tableOrder } from "./commands";
import { close, Shell } from "./Dialogs";
import { DetailTabs, P6Dlg, SideBtn, SideGap, SideHelp } from "./P6Dlg";
import { useLayout } from "./layout";
import { usePrefs } from "./prefs";

const download = (name: string, data: BlobPart, type: string) => saveFile(name, data, type);

// ---------------------------------------------------------------- User Preferences

export function PreferencesDialog() {
  const p = usePrefs();
  const fmts: [DateFormat, string][] = [
    ["dd-Mmm-yy", "05-Mar-26"],
    ["dd-Mmm-yyyy", "05-Mar-2026"],
    ["dd/mm/yyyy", "05/03/2026"],
    ["mm/dd/yyyy", "03/05/2026"],
    ["yyyy-mm-dd", "2026-03-05"],
  ];
  const sample = 1234567.891;
  return (
    <P6Dlg
      title="User Preferences"
      width={640}
      onClose={close}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={close} />
          <SideGap />
          <SideHelp topic="user-preferences" />
        </>
      }
    >
      <DetailTabs
        tabs={[
          [
            "Time Units",
            <>
              <fieldset className="p6-fieldset">
                <legend>Units Format</legend>
                <label>
                  Show durations, float and lags in
                  <select value={p.durationUnit} onChange={(e) => p.set({ durationUnit: e.target.value as "d" | "h" })}>
                    <option value="d">Day</option>
                    <option value="h">Hour</option>
                  </select>
                </label>
                <label>
                  Decimal places
                  <select value={p.decimals} onChange={(e) => p.set({ decimals: Number(e.target.value) })}>
                    {[0, 1, 2].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <p className="muted small">Typed values use the same units: with hours selected, 16 in Original Duration means 16 hours. Applies to the activity table, filters and Global Change.</p>
            </>,
          ],
          [
            "Dates",
            <fieldset className="p6-fieldset">
              <legend>Date Format</legend>
              {fmts.map(([v, l]) => (
                <label key={v} className="p6-check">
                  <input type="radio" checked={p.dateFormat === v} onChange={() => p.set({ dateFormat: v })} /> {l}
                </label>
              ))}
              <label className="p6-check">
                <input type="checkbox" checked={p.showTime} onChange={(e) => p.set({ showTime: e.target.checked })} /> Show time (24-hour, 08:00)
              </label>
            </fieldset>,
          ],
          [
            "Currency",
            <>
              <label>
                View currency symbol
                <select value={p.currency} onChange={(e) => p.set({ currency: e.target.value })}>
                  <option value="">(none)</option>
                  {["AED", "SAR", "QAR", "OMR", "KWD", "BHD", "USD", "$", "EUR", "€", "GBP", "£", "INR", "₹", "PKR"].map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Decimal places
                <select value={p.currencyDecimals} onChange={(e) => p.set({ currencyDecimals: Number(e.target.value) })}>
                  {[0, 1, 2].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <p className="small">
                Sample: <b>{(p.currency ? `${p.currency} ` : "") + sample.toLocaleString(undefined, { minimumFractionDigits: p.currencyDecimals, maximumFractionDigits: p.currencyDecimals })}</b>
              </p>
            </>,
          ],
        ]}
      />
    </P6Dlg>
  );
}

// ---------------------------------------------------------------- Schedule Log

export function ScheduleLogDialog() {
  const schedule = useStore((s) => s.schedule);
  const report = useStore((s) => s.scheduleReport);
  const log = useMemo(() => report?.log ?? (schedule ? scheduleLog(schedule, report?.warnings ?? []) : null), [report, schedule]);
  const select = useStore((s) => s.setActivitySelection);
  if (!schedule || !log) return null;
  const byCode = new Map(schedule.activities.map((a) => [a.code, a.id]));
  return (
    <Shell
      title={`Schedule Log${report?.log ? ` – ${new Date(report.at).toLocaleString()}` : " (not scheduled yet)"}`}
      wide
      onClose={close}
      foot={
        <>
          <button onClick={() => download(`schedule-log-${schedule.projectCode}.txt`, scheduleLogText(schedule, log), "text/plain")}>Save as text file</button>
          <span className="spacer" />
          <button onClick={close}>Close</button>
        </>
      }
    >
      <div className="p6-scroll">
        {log.sections.map((sec) => (
          <details key={sec.title} open={sec.lines.length > 0 && sec.lines.length < 40}>
            <summary>
              <b>{sec.title}</b>
              {sec.lines.some((l) => l.code) && (
                <button
                  className="link"
                  onClick={(e) => {
                    e.preventDefault();
                    const ids = sec.lines.map((l) => (l.code ? byCode.get(l.code) : undefined)).filter((x): x is string => !!x);
                    select(new Set(ids), ids[0] ?? null);
                    close();
                  }}
                >
                  select these
                </button>
              )}
            </summary>
            {sec.lines.length ? (
              sec.lines.slice(0, 500).map((l, i) => (
                <div key={i} className="log-line">
                  {l.text}
                </div>
              ))
            ) : (
              <div className="log-line muted">none</div>
            )}
          </details>
        ))}
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- Excel

/** Export the activities shown, in the layout's columns, as an .xlsx workbook. */
export async function exportLayoutXlsx() {
  const s = useStore.getState().schedule;
  if (!s) return;
  const { default: ExcelJS } = await import("exceljs");
  const layout = useLayout.getState().layout;
  const fields = new Map(fieldsFor(s).map((f) => [f.id, f]));
  const cols = layout.columns.map((c) => fields.get(c.id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (!cols.some((f) => f.id === "code")) cols.unshift(fields.get("code")!);
  const c = fieldCtx(s);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stratum 4D";
  const ws = wb.addWorksheet("TASK");
  ws.columns = cols.map((f) => ({ header: f.label, key: f.id, width: Math.max(10, Math.round(f.width / 7)) }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const byId = new Map(s.activities.map((a) => [a.id, a]));
  const ids = tableOrder.ids.length ? tableOrder.ids : s.activities.map((a) => a.id);
  for (const id of ids) {
    const a = byId.get(id);
    if (!a) continue;
    const row: Record<string, string | number | Date | null> = {};
    for (const f of cols) {
      const v = f.get(a, c);
      row[f.id] = f.type === "date" ? (typeof v === "number" ? new Date(v) : null) : f.type === "duration" || f.type === "number" || f.type === "percent" ? (typeof v === "number" ? v : null) : fieldText(f, a, c);
    }
    ws.addRow(row);
  }
  cols.forEach((f, i) => {
    if (f.type === "date") ws.getColumn(i + 1).numFmt = "dd-mmm-yy";
  });
  const buf = await wb.xlsx.writeBuffer();
  download(`${s.projectCode}-activities.xlsx`, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  useStore.getState().setStatus(`Exported ${ids.length} activities with ${cols.length} columns to Excel.`);
}

async function readSheet(f: File): Promise<{ header: string[]; rows: Cell[][] }> {
  if (/\.(csv|txt)$/i.test(f.name)) {
    const text = await f.text();
    const sep = text.includes("\t") ? "\t" : ",";
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const split = (l: string) => {
      const out: string[] = [];
      let cur = "";
      let q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) {
          if (ch === '"' && l[i + 1] === '"') (cur += '"'), i++;
          else if (ch === '"') q = false;
          else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === sep) out.push(cur), (cur = "");
        else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const [h, ...rest] = lines.map(split);
    return { header: h, rows: rest };
  }
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await f.arrayBuffer());
  const ws = wb.worksheets.find((w) => /task|activit/i.test(w.name)) ?? wb.worksheets[0];
  const rows: Cell[][] = [];
  ws.eachRow((r) => {
    const vals = (r.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
        return (o.result ?? o.text ?? o.richText?.map((x) => x.text).join("") ?? null) as Cell;
      }
      return v as Cell;
    });
    rows.push(vals);
  });
  // P6 exports put field names in row 1 and titles in row 2: take the row with "Activity ID".
  const hi = rows.findIndex((r) => r.some((c) => /^(activity id|task_code|code)$/i.test(String(c ?? "").trim())));
  const h = rows[hi < 0 ? 0 : hi].map((c) => {
    const t = String(c ?? "").trim();
    return /^task_code$/i.test(t) ? "Activity ID" : t;
  });
  return { header: h, rows: rows.slice((hi < 0 ? 0 : hi) + 1) };
}

export function ExcelImportDialog() {
  const schedule = useStore((s) => s.schedule);
  const commit = useStore((s) => s.commit);
  const [data, setData] = useState<{ name: string; header: string[]; rows: Cell[][] } | null>(null);
  const [addNew, setAddNew] = useState(false);
  const [err, setErr] = useState("");
  const result: ImportResult | null = useMemo(() => (schedule && data ? importTable(schedule, data.header, data.rows, { addNew }) : null), [schedule, data, addNew]);
  if (!schedule) return null;
  return (
    <Shell
      title="Import from Excel"
      wide
      onClose={close}
      foot={
        <>
          <button onClick={exportLayoutXlsx}>Export current layout…</button>
          <span className="spacer" />
          <button
            className="primary"
            disabled={!result || (!result.changes && !result.added)}
            onClick={() => {
              if (!result) return;
              commit(result.schedule, `Import ${data?.name}`);
              useStore.getState().setStatus(`Imported ${data?.name}: ${result.updated} activities updated, ${result.added} added, ${result.changes} values changed. Press F9 to reschedule.`);
              close();
            }}
          >
            Import
          </button>
          <button onClick={close}>Cancel</button>
        </>
      }
    >
      <p>
        Updates activities from a spreadsheet, matched by <b>Activity ID</b>, as P6's Excel import does. The first row holds column titles as they appear in Columns (Activity Name, Original Duration, Actual Start…). Export the current layout, edit it in Excel and import it back.
      </p>
      <label className="p6-drop">
        Spreadsheet (.xlsx, .csv)
        <input
          type="file"
          accept=".xlsx,.csv,.txt"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setErr("");
            try {
              setData({ name: f.name, ...(await readSheet(f)) });
            } catch (x) {
              setErr(`Could not read ${f.name}: ${(x as Error).message}`);
            }
          }}
        />
      </label>
      <label className="p6-check">
        <input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} /> Add activities whose Activity ID is not in the project
      </label>
      {err && <p className="bad">{err}</p>}
      {data && result && (
        <>
          <table className="p6-grid">
            <tbody>
              <tr>
                <td>Rows read</td>
                <td>{data.rows.length}</td>
              </tr>
              <tr>
                <td>Activities updated</td>
                <td>
                  <b>{result.updated}</b> ({result.changes} values change)
                </td>
              </tr>
              <tr>
                <td>Activities added</td>
                <td>{result.added}</td>
              </tr>
              <tr>
                <td>Not in the project (skipped)</td>
                <td className="small">{result.skipped.length ? `${result.skipped.length}: ${result.skipped.slice(0, 12).join(", ")}${result.skipped.length > 12 ? "…" : ""}` : "none"}</td>
              </tr>
              <tr>
                <td>Columns not recognised</td>
                <td className="small">{result.unknownColumns.length ? result.unknownColumns.join(", ") : "none"}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">Read-only columns (float, early and late dates) are ignored. Nothing changes until you press Import; one Undo reverses it.</p>
        </>
      )}
    </Shell>
  );
}
