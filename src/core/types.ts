// Shared data model for Stratum. Dates are stored as epoch milliseconds (UTC)
// so they serialise cleanly to JSON and compare cheaply during playback.

export type ActivityType = "task" | "milestone" | "finish-milestone" | "loe" | "wbs-summary" | "resource-dependent";
export type ActivityStatus = "not-started" | "in-progress" | "complete";
export type RelationshipType = "FS" | "SS" | "FF" | "SF";

export interface Activity {
  /** Project the activity belongs to when several projects are open together (key into Schedule.projects). */
  projectId?: string;
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
  /** Notebook entries by topic (P6 notebook topics). */
  notebook?: Record<string, string>;
  /** Secondary date constraint (P6 allows two). */
  secondaryConstraint?: Constraint | null;
  /** Set by CPM: on the longest path to the project finish. */
  longestPath?: boolean;
  /** Set by "multiple float paths": 1 = the driving path to the chosen end activity. */
  floatPath?: number | null;
  floatPathOrder?: number | null;
  /** Activity steps (P6 Steps tab); weighted, they give the physical % complete. */
  steps?: ActivityStep[];
  /** How % complete is measured (P6 Percent Complete Type). */
  pctType?: "duration" | "physical" | "units";
  /** Physical % complete (0–100), entered or rolled up from steps. */
  physicalPercent?: number;
  /** P6 Duration Type; kept for round trips and shown in the table. */
  durationType?: "fixed-duration-units-time" | "fixed-duration-units" | "fixed-units" | "fixed-units-time";
  /** P6 Expected Finish: remaining duration is recalculated to finish on this date when Schedule Options use it. */
  expectedFinish?: number | null;
  /** P6 Suspend / Resume: an in-progress activity stops at suspend and its remaining work restarts at resume. */
  suspendDate?: number | null;
  resumeDate?: number | null;
  /** Set by levelling: the start was delayed for resources. */
  leveledDelayHours?: number | null;
}

export interface ActivityStep {
  id: string;
  name: string;
  weight: number;
  /** 0–100 */
  pct: number;
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
  /** Max units per working hour (labour/equipment), for levelling; default 1 per resource unit. */
  maxUnitsPerHour?: number;
  /** Price and max units that change over time (P6 resource rates); entries apply from their date. */
  rates?: { from: number; pricePerUnit: number; maxUnitsPerHour?: number }[];
  /** Shift that sets max units by hour of day (P6 resource shifts). */
  shiftId?: string | null;
  /** Roles this resource can fill. */
  roleIds?: string[];
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
  /** Role of the assignment; with an empty resourceId the assignment is unstaffed (P6 role assignment). */
  roleId?: string | null;
  /** Resource curve that spreads the units over the activity (P6 resource curves). */
  curveId?: string | null;
  /** Cost account the cost is booked to. */
  costAccountId?: string | null;
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
  /** Responsible manager (OBS element). */
  obsId?: string | null;
  /** Original budget of this WBS element (P6 budget log). */
  originalBudget?: number;
}

export interface Relationship {
  id: string;
  predecessorId: string;
  successorId: string;
  type: RelationshipType;
  lagHours: number;
  /** Set by CPM: this link controls the successor's early date (relationship free float 0). */
  driving?: boolean;
  /** Set by CPM: relationship free float in working hours. */
  freeFloatHours?: number | null;
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
  /** P6 Schedule Options (F9 dialog). */
  scheduleOptions?: ScheduleOptions;
  /** P6 Level Resources options (F10 dialog). */
  levelingOptions?: LevelingOptions;
  /** Planned start and must-finish-by from the project's Dates tab. */
  plannedStart?: number | null;
  mustFinishBy?: number | null;
  /** Activity code types and values defined for the project (P6 Activity Codes dictionary). */
  codeTypes?: CodeType[];
  /** User-defined field definitions (P6 User Defined Fields). */
  udfDefs?: UdfDef[];
  /** Roles (P6 Roles dictionary). */
  roles?: Role[];
  /** Resource shifts. */
  shifts?: Shift[];
  /** Resource curves (standard ones are built in). */
  curves?: ResourceCurve[];
  /** Cost account hierarchy and the project default. */
  costAccounts?: CostAccount[];
  defaultCostAccountId?: string | null;
  /** Stored baselines used as the 2nd and 3rd comparison baselines (P6 primary/secondary/tertiary). */
  compareBaselines?: { bl2?: string | null; bl3?: string | null };
  /** Activity step templates. */
  stepTemplates?: { name: string; steps: { name: string; weight: number }[] }[];
  /** Notebook topics offered on the Notebook tab. */
  notebookTopics?: string[];
  /** Baselines stored with the project (P6 Maintain Baselines). */
  baselines?: StoredBaseline[];
  /** Period performance snapshots (P6 Store Period Performance). */
  periods?: PeriodSnapshot[];
  /** Project registers: issues, risks, work products & documents, expenses, thresholds. */
  registers?: Partial<Record<RegisterKind, RegisterItem[]>>;
  /** Organisational breakdown structure (responsible managers). */
  obs?: ObsNode[];
  /** Project-level responsible manager and original budget. */
  obsId?: string | null;
  originalBudget?: number;
  /** Budget change log, funding sources and their assignments, monthly spending plan. */
  budgetChanges?: BudgetChange[];
  fundingSources?: FundingSource[];
  funding?: FundingAssignment[];
  spendingPlan?: SpendingPlanRow[];
  /** Probability × impact scoring matrix used to score risks. */
  riskMatrix?: RiskMatrix;
  /** EPS path of the project, top first. Each node is "ID | Name" or just a name (e.g. ["NEWEPS | L&T Projects - TAQA"]). */
  eps?: string[];
  /** P6 strategic priority (1 highest – 10000, default 500). */
  strategicPriority?: number;
  /** Projects open together: one entry per project in this combined view. */
  projects?: ProjectPart[];
  /** Relationships to activities of other projects, kept while the project is open alone. */
  externalRelationships?: ExternalRelationship[];
  /** Set on a reflection: the project it copies and the copy's starting point. */
  reflectionOf?: { dbId: string; code: string; createdAt: string } | null;
}

export interface ProjectPart {
  /** Key used as the activity/WBS id prefix and in Activity.projectId. */
  key: string;
  /** Database id when the project was opened from the database. */
  dbId: string | null;
  version?: number | null;
  code: string;
  name: string;
  /** Everything in the project's own schedule that the combined view does not show. */
  rest: Omit<Schedule, "activities" | "wbs" | "relationships" | "assignments" | "registers" | "projects">;
}

export interface ExternalRelationship {
  /** Project code and Activity ID of the predecessor in the other project. */
  predecessorProject: string;
  predecessorCode: string;
  successorId: string;
  type: RelationshipType;
  lagHours: number;
}

export interface ObsNode {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
}

/** wbsId null = the project itself. */
export interface BudgetChange {
  id: string;
  wbsId: string | null;
  date: number;
  amount: number;
  reason: string;
  responsible: string;
  status: "pending" | "approved" | "not-approved";
}

export interface FundingSource {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
}

export interface FundingAssignment {
  id: string;
  wbsId: string | null;
  sourceId: string;
  amount: number;
  fiscalYear?: string;
}

export interface SpendingPlanRow {
  wbsId: string | null;
  /** Month as YYYY-MM. */
  month: string;
  spending: number;
  benefit?: number;
}

export interface RiskMatrix {
  /** Labels from lowest to highest, with the threshold (probability %, or schedule days / cost) each starts at. */
  probability: { label: string; from: number }[];
  impact: { label: string; scheduleDays: number; cost: number }[];
  /** scores[p][i] */
  scores: number[][];
  /** Score at or above which a risk is high / medium. */
  high: number;
  medium: number;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  pricePerUnit: number;
  /** Role limit for planning, units per hour. */
  maxUnitsPerHour?: number;
}

export interface Shift {
  id: string;
  name: string;
  /** Periods of the day from their start hour, each with its max units per hour. */
  periods: { start: number; maxUnits: number }[];
}

export interface ResourceCurve {
  id: string;
  name: string;
  /** 21 points at 0%, 5% … 100% of the duration; the units fall in proportion to the area under them. */
  values: number[];
}

export interface CostAccount {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
}

export interface ScheduleOptions {
  /** Out-of-sequence progress. */
  outOfSequence: "retained-logic" | "progress-override" | "actual-dates";
  /** Total float is finish float, start float or the smaller. */
  floatType: "finish" | "start" | "smallest";
  /** Critical activities: total float at or below the threshold, or on the longest path. */
  criticalBy: "float" | "longest-path";
  criticalFloatHours: number;
  /** Measure SS lags of in-progress predecessors from their actual start or their remaining early start. */
  ssLagFrom: "actual-start" | "early-start";
  /** Activities without a predecessor or successor are made critical. */
  openEndsCritical: boolean;
  /** Level resources (F10) right after scheduling. */
  levelWhenScheduling: boolean;
  /** Reschedule automatically after every change that affects dates. */
  autoSchedule?: boolean;
  /** Recalculate remaining duration from each activity's Expected Finish. */
  useExpectedFinish?: boolean;
  /** Multiple float paths to an end activity (internal id); null = off. */
  floatPaths: { endActivityId: string | null; count: number } | null;
}

export interface LevelingOptions {
  /** Keep the project finish? If false, levelling may extend it. */
  preserveFinish: boolean;
  /** Only delay activities within their total float. */
  levelWithinFloat: boolean;
  /** Priority order: earliest late start first, then total float, then ID. */
  priority: "late-start" | "total-float" | "early-start" | "activity-id";
  resourceIds: string[] | null;
}

export interface CodeType {
  name: string;
  values: { value: string; description?: string; color?: string }[];
}

export interface UdfDef {
  name: string;
  type: "text" | "number" | "date" | "cost" | "indicator";
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
