// The sample projects that ship with Stratum 4D, in one place: the two
// original samples (220 kV GIS substation, small RC building) and the demo
// set (dual carriageway, solar PV plant, hotel MEP fit-out, water pipeline).
//
// sampleProject() returns a complete project (schedule, links, rules,
// profiles, paths) without touching the UI, so the web demo can seed a fresh
// session with all of them and the File menu can open any one of them.
// The model itself is rebuilt from the model name when a project is opened.

import { demoModel, demoPaths, demoProfileFor, demoXer, DEMO_LINK_RULE, type DemoBox } from "./demo";
import { gisModel, gisPaths, gisProfileFor, gisXer } from "./demoGis";
import { buildSample, SAMPLE_SPECS, type BuiltSample } from "./demoSets";
import { applyRules } from "./linking";
import { EMPTY_PRESENTATION } from "./presentation";
import { demoProfiles } from "./profiles";
import { PROJECT_FORMAT, PROJECT_VERSION, type StratumProject } from "./project";
import type { LinkRule, MotionPath } from "./types";
import { parseXerTables, xerToSchedule } from "./xer";

export type SampleKind = "gis" | "rc" | "road" | "solar" | "hotel" | "pipeline";

export interface SampleDef {
  label: string;
  model: () => DemoBox[];
  xer: () => string;
  paths: (b: DemoBox[]) => MotionPath[];
  profileFor: (code: string, ifcType: string) => string;
  modelName: string;
  eps: string[];
  done: string;
}

const built = new Map<string, BuiltSample>();
const fromSet = (kind: string): BuiltSample => {
  if (!built.has(kind)) built.set(kind, buildSample(SAMPLE_SPECS[kind]()));
  return built.get(kind)!;
};
const setDef = (kind: "road" | "solar" | "hotel" | "pipeline", label: string): SampleDef => {
  const spec = SAMPLE_SPECS[kind]();
  return {
    label,
    model: () => fromSet(kind).boxes,
    xer: () => fromSet(kind).xer,
    paths: () => [],
    profileFor: (code) => fromSet(kind).profileFor(code),
    modelName: spec.modelName,
    eps: spec.eps,
    done: `Sample loaded: ${spec.name} (fictional). Data date ${new Date(`${spec.dataDate}T00:00:00Z`).toUTCString().slice(5, 16)}.`,
  };
};

export const SAMPLES: Record<SampleKind, SampleDef> = {
  gis: {
    label: "220 kV GIS substation (UAE)",
    model: gisModel,
    xer: gisXer,
    paths: gisPaths,
    profileFor: gisProfileFor,
    modelName: "Demo model: 220 kV GIS substation",
    eps: ["Miqyas Demo", "Energy"],
    done: "Sample loaded: 220/33 kV GIS substation, Abu Dhabi (fictional). Data date 19-Oct-2026.",
  },
  rc: {
    label: "Small RC building",
    model: demoModel,
    xer: demoXer,
    paths: demoPaths,
    profileFor: (code, ifcType) => {
      const p = demoProfileFor(code);
      if (p === "install" && ifcType === "IfcSlab") return "install-pour";
      if (p === "install" && ifcType === "IfcWall") return "install-rise";
      return p;
    },
    modelName: "Demo model",
    eps: ["Miqyas Demo", "Buildings"],
    done: "Demo loaded: two-storey RC building.",
  },
  road: setDef("road", "12 km dual carriageway"),
  solar: setDef("solar", "50 MWp solar PV plant"),
  hotel: setDef("hotel", "Hotel MEP fit-out (G+6)"),
  pipeline: setDef("pipeline", "25 km water pipeline"),
};

/** Samples in the order the File menu and a new demo session list them. */
export const SAMPLE_ORDER: SampleKind[] = ["gis", "road", "solar", "pipeline", "hotel", "rc"];

export const sampleKindOf = (modelFileName: string | null | undefined): SampleKind | null =>
  (Object.keys(SAMPLES) as SampleKind[]).find((k) => SAMPLES[k].modelName === modelFileName) ?? null;

/** A complete project for a sample: schedule (with its EPS), 4D links, rules, profiles and paths. */
export function sampleProject(kind: SampleKind): StratumProject {
  const d = SAMPLES[kind];
  const boxes = d.model();
  const els = boxes.map((b) => b.element);
  const schedule = { ...xerToSchedule(parseXerTables(d.xer())), eps: d.eps };
  const rule: LinkRule = { ...DEMO_LINK_RULE, profileId: "install" };
  const typeOf = new Map(els.map((e) => [e.id, e.ifcType]));
  const codeOf = new Map(schedule.activities.map((a) => [a.id, a.code]));
  const links = applyRules([rule], els, schedule).map((l) => ({ ...l, profileId: d.profileFor(codeOf.get(l.activityId) ?? "", typeOf.get(l.elementId) ?? "") }));
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    modelFileName: d.modelName,
    schedule,
    links,
    rules: [rule],
    profiles: demoProfiles(),
    segments: [],
    groups: [],
    paths: d.paths(boxes),
    presentation: EMPTY_PRESENTATION,
  };
}
