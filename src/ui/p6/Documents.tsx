// Work Product and Document details (P6 WPs & Docs): General, Assignments
// to activities and WBS elements, and a review log whose decision sets the
// document status. Also the WPs & Docs tab of Activity Details.

import { useState } from "react";
import { assignDoc, docActivities, docsOfActivity, DOC_STATUSES, REVIEW_DECISIONS, reviewDoc, unassignDoc } from "../../core/documents";
import type { RegisterItem } from "../../core/types";
import { useStore } from "../store";
import { useP6 } from "./commands";
import { closeDlg, DetailTabs, ListHead, P6Dlg, SideBtn, SideGap, SideHelp } from "./P6Dlg";

let target: string | null = null;
export const openDocument = (id: string) => {
  target = id;
  useP6.getState().open("documentDetail");
};

const docTitle = (d: RegisterItem) => d.values.Title || d.values["Reference No."] || "Untitled document";

/** A web link only when the location is an http(s) URL; file paths are shown as text. */
export const safeUrl = (v: string | undefined) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

export function DocumentDialog() {
  const s = useStore((x) => x.schedule);
  const commit = useStore((x) => x.commit);
  const selected = useStore((x) => x.selectedActivity);
  const [id] = useState(target);
  const [rev, setRev] = useState({ by: "", decision: REVIEW_DECISIONS[0], comment: "" });
  const [wbsPick, setWbsPick] = useState("");
  if (!s || !id) return null;
  const d = (s.registers?.documents ?? []).find((x) => x.id === id);
  if (!d) return null;
  const acts = new Map(s.activities.map((a) => [a.id, a]));
  const wbs = new Map(s.wbs.map((w) => [w.id, w]));
  const put = (patch: Partial<RegisterItem>, label: string) => {
    const cur = useStore.getState().schedule!;
    commit({ ...cur, registers: { ...(cur.registers ?? {}), documents: (cur.registers?.documents ?? []).map((x) => (x.id === d.id ? { ...x, ...patch } : x)) } }, label);
  };
  const val = (k: string) => d.values[k] ?? (k === "Public Location" ? d.values["Location / URL"] : undefined) ?? "";
  const setVal = (k: string, v: string) => put({ values: { ...d.values, [k]: v } }, `Document ${k}`);
  const linkedActs = docActivities(d);
  const url = safeUrl(val("Public Location"));
  return (
    <P6Dlg
      title={`Work Product / Document – ${docTitle(d)}`}
      width={820}
      onClose={closeDlg}
      side={
        <>
          <SideBtn kind="close" label="Close" primary onClick={closeDlg} />
          <SideGap />
          <SideBtn kind="add" label="Assign Activity" disabled={!selected || linkedActs.includes(selected)} onClick={() => selected && commit(assignDoc(s, d.id, { activityId: selected }), "Assign document")} />
          {url && <SideBtn kind="run" label="Open Document" onClick={() => window.open(url, "_blank", "noopener")} />}
          <SideGap />
          <SideHelp topic="documents" />
        </>
      }
    >
      <DetailTabs
        tabs={[
          [
            "General",
            <div className="stack" key="g">
              <div className="grid2">
                {["Title", "Reference No.", "Version", "Category", "Author", "Reviewer"].map((k) => (
                  <label key={k}>
                    {k}
                    <input value={val(k)} onChange={(e) => setVal(k, e.target.value)} />
                  </label>
                ))}
                <label>
                  Status
                  <select value={val("Status")} onChange={(e) => setVal("Status", e.target.value)}>
                    <option value="" />
                    {DOC_STATUSES.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Revision Date
                  <input type="date" value={val("Revision Date")} onChange={(e) => setVal("Revision Date", e.target.value)} />
                </label>
                <label>
                  Public Location (URL)
                  <input value={val("Public Location")} placeholder="https://…" onChange={(e) => setVal("Public Location", e.target.value)} />
                </label>
                <label>
                  Private Location
                  <input value={val("Private Location")} placeholder="\\server\share\… or a folder path" onChange={(e) => setVal("Private Location", e.target.value)} />
                </label>
              </div>
              <label className="p6-check">
                <input type="checkbox" checked={val("Deliverable") === "Yes"} onChange={(e) => setVal("Deliverable", e.target.checked ? "Yes" : "")} /> Deliverable (a work product the project hands over)
              </label>
              <label>
                Description
                <textarea rows={4} value={d.description ?? ""} onChange={(e) => put({ description: e.target.value || undefined }, "Document description")} />
              </label>
            </div>,
          ],
          [
            "Assignments",
            <div className="stack" key="a">
              <ListHead>Activities</ListHead>
              <div className="p6-list2">
                <table>
                  <thead>
                    <tr>
                      <td style={{ width: 110 }}>Activity ID</td>
                      <td>Activity Name</td>
                      <td style={{ width: 30 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {linkedActs.map((aid) => (
                      <tr key={aid}>
                        <td>{acts.get(aid)?.code ?? "(deleted)"}</td>
                        <td>{acts.get(aid)?.name}</td>
                        <td>
                          <button className="link" aria-label="Unassign" onClick={() => commit(unassignDoc(s, d.id, { activityId: aid }), "Unassign document")}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!linkedActs.length && (
                      <tr>
                        <td colSpan={3} className="muted small">
                          Not assigned to an activity. Select one in the Activities window and click Assign Activity.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <ListHead>WBS</ListHead>
              <div className="p6-list2">
                <table>
                  <tbody>
                    {(d.links?.wbs ?? []).map((wid) => (
                      <tr key={wid}>
                        <td style={{ width: 110 }}>{wbs.get(wid)?.code ?? "(deleted)"}</td>
                        <td>{wbs.get(wid)?.name}</td>
                        <td style={{ width: 30 }}>
                          <button className="link" aria-label="Unassign WBS" onClick={() => commit(unassignDoc(s, d.id, { wbsId: wid }), "Unassign document")}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <select value={wbsPick} onChange={(e) => setWbsPick(e.target.value)}>
                  <option value="">Assign to WBS…</option>
                  {s.wbs
                    .filter((w) => !d.links?.wbs?.includes(w.id))
                    .map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.code} {w.name}
                      </option>
                    ))}
                </select>
                <button disabled={!wbsPick} onClick={() => (commit(assignDoc(s, d.id, { wbsId: wbsPick }), "Assign document to WBS"), setWbsPick(""))}>
                  Assign
                </button>
              </div>
            </div>,
          ],
          [
            "Review",
            <div className="stack" key="r">
              <ListHead>Review log</ListHead>
              <div className="p6-list2">
                <table>
                  <thead>
                    <tr>
                      <td style={{ width: 150 }}>Date</td>
                      <td style={{ width: 120 }}>Reviewer</td>
                      <td style={{ width: 170 }}>Decision</td>
                      <td>Comment</td>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(d.reviews ?? [])].reverse().map((r, i) => (
                      <tr key={i}>
                        <td>{new Date(r.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</td>
                        <td>{r.by}</td>
                        <td>{r.decision}</td>
                        <td style={{ whiteSpace: "normal" }}>{r.comment}</td>
                      </tr>
                    ))}
                    {!d.reviews?.length && (
                      <tr>
                        <td colSpan={4} className="muted small">
                          Not reviewed yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid2">
                <label>
                  Reviewer
                  <input value={rev.by} placeholder={val("Reviewer") || "Name"} onChange={(e) => setRev({ ...rev, by: e.target.value })} />
                </label>
                <label>
                  Decision
                  <select value={rev.decision} onChange={(e) => setRev({ ...rev, decision: e.target.value })}>
                    {REVIEW_DECISIONS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Comment
                <textarea rows={2} value={rev.comment} onChange={(e) => setRev({ ...rev, comment: e.target.value })} />
              </label>
              <div className="row">
                <button
                  onClick={() => {
                    commit(reviewDoc(s, d.id, { by: rev.by.trim() || val("Reviewer") || "Reviewer", decision: rev.decision, comment: rev.comment.trim() }), "Review document");
                    setRev({ ...rev, comment: "" });
                  }}
                >
                  Record review
                </button>
                <span className="muted small">The decision becomes the document's Status.</span>
              </div>
            </div>,
          ],
        ]}
      />
    </P6Dlg>
  );
}

/** WPs & Docs tab of Activity Details: documents assigned to the selected activity. */
export function ActivityDocs({ activityId }: { activityId: string }) {
  const s = useStore((x) => x.schedule);
  const commit = useStore((x) => x.commit);
  const [pick, setPick] = useState("");
  if (!s) return null;
  const docs = docsOfActivity(s, activityId);
  const others = (s.registers?.documents ?? []).filter((d) => !docs.includes(d));
  return (
    <div className="stack">
      <table className="p6-grid">
        <thead>
          <tr>
            <td>Title</td>
            <td>Reference No.</td>
            <td>Version</td>
            <td>Status</td>
            <td>Deliverable</td>
            <td />
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td>
                <button className="link" onClick={() => openDocument(d.id)}>
                  {docTitle(d)}
                </button>
              </td>
              <td>{d.values["Reference No."]}</td>
              <td>{d.values.Version}</td>
              <td>{d.values.Status}</td>
              <td>{d.values.Deliverable === "Yes" ? "Yes" : ""}</td>
              <td>
                <button className="link" aria-label="Unassign" onClick={() => commit(unassignDoc(s, d.id, { activityId }), "Unassign document")}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {!docs.length && (
            <tr>
              <td colSpan={6} className="muted small">
                No work products or documents assigned.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="row">
        <select value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Assign a document…</option>
          {others.map((d) => (
            <option key={d.id} value={d.id}>
              {docTitle(d)}
            </option>
          ))}
        </select>
        <button disabled={!pick} onClick={() => (commit(assignDoc(s, pick, { activityId }), "Assign document"), setPick(""))}>
          Assign
        </button>
        <button onClick={() => useP6.getState().show("documents")}>WPs & Docs window</button>
      </div>
    </div>
  );
}
