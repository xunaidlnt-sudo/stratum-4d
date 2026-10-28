// Work products and documents (P6 WPs & Docs): a document can be assigned to
// any number of activities and WBS elements, carries a status from a review
// cycle, and keeps a log of reviews.

import type { RegisterItem, Schedule } from "./types";

export const DOC_STATUSES = ["Draft", "In Progress", "Submitted", "Under Review", "Approved", "Approved with Comments", "Revise and Resubmit", "Rejected", "Superseded"];
export const REVIEW_DECISIONS = ["Approved", "Approved with Comments", "Revise and Resubmit", "Rejected"];
export const DOC_COLUMNS = ["Title", "Reference No.", "Version", "Category", "Status", "Deliverable", "Author", "Reviewer", "Revision Date", "Public Location", "Private Location"];

/** Activity ids a document is assigned to (its main activity plus further links). */
export const docActivities = (d: RegisterItem): string[] => [...new Set([...(d.activityId ? [d.activityId] : []), ...(d.links?.activities ?? [])])];

export const docsOfActivity = (s: Schedule, activityId: string) => (s.registers?.documents ?? []).filter((d) => docActivities(d).includes(activityId));

/** Documents of a WBS element, including those assigned to its activities when `withActivities` is set. */
export function docsOfWbs(s: Schedule, wbsId: string, withActivities = false): RegisterItem[] {
  const acts = withActivities ? new Set(s.activities.filter((a) => a.wbsId === wbsId).map((a) => a.id)) : new Set<string>();
  return (s.registers?.documents ?? []).filter((d) => d.links?.wbs?.includes(wbsId) || docActivities(d).some((x) => acts.has(x)));
}

function setDocs(s: Schedule, fn: (d: RegisterItem) => RegisterItem): Schedule {
  return { ...s, registers: { ...(s.registers ?? {}), documents: (s.registers?.documents ?? []).map(fn) } };
}

export function assignDoc(s: Schedule, docId: string, to: { activityId?: string; wbsId?: string }): Schedule {
  return setDocs(s, (d) => {
    if (d.id !== docId) return d;
    if (to.activityId) {
      if (docActivities(d).includes(to.activityId)) return d;
      return d.activityId ? { ...d, links: { ...d.links, activities: [...(d.links?.activities ?? []), to.activityId] } } : { ...d, activityId: to.activityId };
    }
    if (to.wbsId && !d.links?.wbs?.includes(to.wbsId)) return { ...d, links: { ...d.links, wbs: [...(d.links?.wbs ?? []), to.wbsId] } };
    return d;
  });
}

export function unassignDoc(s: Schedule, docId: string, from: { activityId?: string; wbsId?: string }): Schedule {
  return setDocs(s, (d) => {
    if (d.id !== docId) return d;
    if (from.activityId) {
      const rest = (d.links?.activities ?? []).filter((x) => x !== from.activityId);
      if (d.activityId === from.activityId) return { ...d, activityId: rest[0] ?? null, links: { ...d.links, activities: rest.slice(1) } };
      return { ...d, links: { ...d.links, activities: rest } };
    }
    if (from.wbsId) return { ...d, links: { ...d.links, wbs: (d.links?.wbs ?? []).filter((x) => x !== from.wbsId) } };
    return d;
  });
}

/** Record a review: the decision becomes the document status. */
export function reviewDoc(s: Schedule, docId: string, review: { by: string; decision: string; comment: string }, at = new Date().toISOString()): Schedule {
  return setDocs(s, (d) => (d.id === docId ? { ...d, values: { ...d.values, Status: review.decision }, reviews: [...(d.reviews ?? []), { at, ...review }] } : d));
}
