// Shared data model for Stratum. Dates are stored as epoch milliseconds (UTC)
// so they serialise cleanly to JSON and compare cheaply during playback.

export type ActivityType = "task" | "milestone" | "finish-milestone" | "loe" | "wbs-summary" | "resource-dependent";
export type ActivityStatus = "not-started" | "in-progress" | "complete";
export type RelationshipType = "FS" | "SS" | "FF" | "SF";

export interface Activity {
  id: string; // internal P6 task_id
  code: string; // user-facing Activity ID (task_code)
  name: string;
  wbsId: string | null;
  type: ActivityType;
  status: ActivityStatus;
  percentComplete: number; // 0..100
  /** Current schedule: actual dates where they exist, otherwise early/remaining dates. */
  start: number | null;
  finish: number | null;
  /** Baseline / target dates from P6 (target_start_date / target_end_date). */
  baselineStart: number | null;
  baselineFinish: number | null;
  actualStart: number | null;
  actualFinish: number | null;
  totalFloatHours: number | null;
  originalDurationHours: number | null;
  remainingDurationHours: number | null;
  critical: boolean;
  calendarId: string | null;
  /** Activity code assignments: code type name -> code value. */
  codes: Record<string, string>;
  /** User-defined fields (P6 UDFs or added in Stratum): field name -> value. */
  userFields?: Record<string, string>;
  /** Late dates and free float, filled in by the CPM engine. */
  lateStart?: number | null;
  lateFinish?: number | null;
  freeFloatHours?: number | null;
  /** Primary date constraint. */
  constraint?: Constraint | null;
  /** Notebook text (P6 activity notebook). */
  notes?: string;
}

export type ConstraintType =
  | "start-on-or-after"
  | "start-on-or-before"
  | "finish-on-or-after"
  | "finish-on-or-before"
  | "start-on"
  | "finish-on"
  | "mandatory-start"
  | "mandatory-finish"
  | "as-late-as-possible";

export interface Constraint {
  type: ConstraintType;
  date: number | null;
}

/** Working time: hours worked on each weekday (0 = Sunday) as [startHour, endHour] spans, plus exceptions. */
export interface Calendar {
  id: string;
  name: string;
  /** Per weekday (0 = Sun .. 6 = Sat): working spans in hours from midnight, e.g. [[8,12],[13,17]]. */
  week: [number, number][][];
  /** Non-working dates (UTC midnight epoch ms). */
  holidays: number[];
  /** Working dates that override the weekly pattern, with their spans. */
  workdays?: { date: number; spans: [number, number][] }[];
  hoursPerDay: number;
}

export type ResourceType = "labor" | "equipment" | "material";

export interface Resource {
  id: string;
  code: string;
  name: string;
  type: ResourceType;
  unit: string;
  /** Default cost per unit (hour for labour/equipment). */
  pricePerUnit: number;
}

export interface Assignment {
  id: string;
  activityId: string;
  resourceId: string;
  budgetQty: number;
  actualQty: number;
  remainingQty: number;
  budgetCost: number;
  actualCost: number;
  remainingCost: number;
}

/** A saved set of model elements, e.g. "Tower crane 1" or "Level 2 formwork". */
export interface ElementGroup {
  id: string;
  name: string;
  color: string;
  elementIds: string[];
}

/** Moves elements along a keyframed path over an activity's duration (cranes, plant, deliveries). */
export interface MotionPath {
  id: string;
  name: string;
  activityId: string;
  elementIds: string[];
  /** World-space points; elements are offset so their start position follows the path. */
  points: [number, number, number][];
  /** Rotate elements to face the direction of travel (around the vertical axis). */
  orient: boolean;
}

export type GrowthDirection = "none" | "bottom-up" | "top-down" | "west-east" | "east-west" | "south-north" | "north-south";

/** A piece of a model element (a pour or bay), cut along one axis by fraction. */
export interface ElementSegment {
  id: string;
  parentId: string;
  name: string;
  axis: "x" | "y" | "z";
  from: number; // 0..1
  to: number; // 0..1
}

export interface WbsNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  seq: number;
}

export interface Relationship {
  id: string;
  predecessorId: string;
  successorId: string;
  type: RelationshipType;
  lagHours: number;
}

export interface Schedule {
  projectId: string;
  projectCode: string;
  projectName: string;
  dataDate: number | null;
  activities: Activity[];
  wbs: WbsNode[];
  relationships: Relationship[];
  calendars?: Calendar[];
  defaultCalendarId?: string | null;
  resources?: Resource[];
  assignments?: Assignment[];
  /** Original XER tables, kept so an exported XER round-trips everything Stratum does not edit. */
  sourceXer?: Record<string, Record<string, string>[]> | null;
  sourceFormat?: "xer" | "mspdi" | "stratum" | "p6-eppm" | "p6-db";
  /** Where the schedule was pulled from, for refresh and push-back. */
  p6Source?: { connectionId: string; projectObjectId: string; kind: string; pulledAt: string } | null;
  /** The baseline the baseline dates came from, when assigned from another schedule. */
  baselineInfo?: BaselineInfo | null;
  /** Baselines stored with the project (P6 Maintain Baselines). */
  baselines?: StoredBaseline[];
  /** Period performance snapshots (P6 Store Period Performance). */
  periods?: PeriodSnapshot[];
  /** Project registers: issues, risks, work products & documents, expenses, thresholds. */
  registers?: Partial<Record<RegisterKind, RegisterItem[]>>;
}

export interface StoredBaseline {
  id: string;
  name: string;
  createdAt: string;
  dataDate: number | null;
  /** Activity ID (code) -> planned [start, finish] when the baseline was stored. */
  dates: Record<string, [number | null, number | null]>;
}

export interface PeriodSnapshot {
  id: string;
  /** Period end (the data date when stored). */
  date: number;
  name: string;
  /** Activity internal id -> actuals to date. */
  actuals: Record<string, { pct: number; actualCost: number; actualUnits: number }>;
}

export type RegisterKind = "issues" | "risks" | "documents" | "expenses" | "thresholds";

/** A row in one of the project registers. Columns differ per register; values are kept as text. */
export interface RegisterItem {
  id: string;
  /** Linked activity (internal id), if any. */
  activityId?: string | null;
  values: Record<string, string>;
}

export interface BaselineInfo {
  /** e.g. "000-N-20016-BL – Contractual baseline" */
  name: string;
  /** Data date of the baseline schedule. */
  dataDate: number | null;
  assignedAt: string;
  matched: number;
  /** Activities in the current schedule with no baseline counterpart. */
  missing: number;
}

/** A model element (IFC product or demo element) as seen by the linking engine. */
export interface ModelElement {
  id: string; // stable key: GlobalId when available
  expressId: number;
  ifcType: string;
  name: string;
  properties: Record<string, string>;
}

export type ProfileAction = "install" | "remove" | "temporary" | "maintain" | "neutral";

/** How an element looks in one phase of its task (before / during / after). */
export interface PhaseAppearance {
  visible: boolean;
  /** Hex colour, or null to keep the element's original model colour. */
  color: string | null;
  /** 0 = opaque, 1 = fully transparent. */
  transparency: number;
}

export interface AppearanceProfile {
  id: string;
  name: string;
  action: ProfileAction;
  before: PhaseAppearance;
  active: PhaseAppearance;
  after: PhaseAppearance;
  /** During the task, fade the active transparency in proportion to task progress. */
  progressiveFade: boolean;
  /** During the task, build the element up progressively in this direction. */
  growth?: GrowthDirection;
}

export interface Link {
  elementId: string;
  activityId: string;
  profileId: string;
}

export type LinkMatch = "equals" | "contains" | "startsWith";

export interface LinkRule {
  id: string;
  /** Element property key, e.g. "Name", "IfcType", "Storey", "Pset_Stratum.ActivityID". */
  elementProperty: string;
  /** Activity field: "code" | "name" | "wbs" | "code:<Activity Code Type>". */
  activityField: string;
  match: LinkMatch;
  profileId: string;
  caseSensitive: boolean;
}

export type DateSource = "current" | "baseline";
export type ColorMode = "profile" | "status";
