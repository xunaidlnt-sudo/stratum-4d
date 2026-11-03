// More sample projects for the web demo: a dual carriageway, a solar PV plant,
// a hotel MEP fit-out and a water transmission pipeline. Fictional: names,
// quantities and values are illustrative only.
//
// Each sample is a compact list of activities (duration in working days and
// logic). The generator schedules it on the calendar twice: once as planned
// (the baseline) and once with the delays that happened (the current dates),
// sets the progress at the data date, and emits a real P6 XER through the
// same builder as the other samples, plus a simple box model whose elements
// carry the activity ID, so the 4D links come from the usual rule.

import { standardCalendar } from "./calendar";
import { buildDemoXer, type DemoBox, type DemoTask } from "./demo";
import { uaeCalendar } from "./demoGis";
import type { Calendar } from "./types";

const ACTIVITY_PSET = "Pset_Stratum.ActivityID";
type Rel = "FS" | "SS" | "FF";
type Pred = string | [string, Rel, number];
type Geo = { type: string; name: string; c: [number, number, number]; s: [number, number, number]; color: string; storey?: string };

export interface SampleAct {
  code: string;
  name: string;
  wbs: string;
  /** Working days; 0 makes a milestone. */
  d: number;
  preds?: Pred[];
  /** Working days the activity slipped (in the current schedule, not the baseline). */
  delay?: number;
  finishMilestone?: boolean;
  zone?: string;
  /** [resource code, units per hour (or a fixed quantity with true)] */
  res?: [string, number, boolean?][];
  geo?: Geo[];
  profile?: "install" | "remove" | "temporary" | "maintain";
}

export interface SampleSpec {
  kind: string;
  projId: string;
  code: string;
  name: string;
  /** EPS path in the P6 Projects window. */
  eps: string[];
  start: string;
  dataDate: string;
  sixDay?: boolean;
  wbs: [string, string][];
  zones?: Record<string, string>;
  /** [code, name, type, unit, rate] */
  resources: [string, string, string, string, number][];
  acts: SampleAct[];
  modelName: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dayStr = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Working days of the calendar from a start date, as UTC midnights. */
function workdays(cal: Calendar, start: string, count: number): number[] {
  const out: number[] = [];
  const hol = new Set(cal.holidays.map((h) => dayStr(h)));
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < count) {
    const dow = new Date(t).getUTCDay();
    if (cal.week[dow].length && !hol.has(dayStr(t))) out.push(t);
    t += 86_400_000;
  }
  return out;
}

interface Pass {
  es: Map<string, number>;
  ef: Map<string, number>;
  tf: Map<string, number>;
}

/** Forward and backward pass in working-day indices. */
function cpm(acts: SampleAct[], withDelays: boolean): Pass {
  const dur = (a: SampleAct) => a.d + (withDelays ? a.delay ?? 0 : 0);
  const by = new Map(acts.map((a) => [a.code, a]));
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  const norm = (p: Pred): [string, Rel, number] => (typeof p === "string" ? [p, "FS", 0] : p);
  const done = new Set<string>();
  const visit = (a: SampleAct) => {
    if (done.has(a.code)) return;
    let s = 0;
    for (const p of a.preds ?? []) {
      const [code, rel, lag] = norm(p);
      const pa = by.get(code);
      if (!pa) throw new Error(`Unknown predecessor ${code} of ${a.code}`);
      visit(pa);
      if (rel === "FS") s = Math.max(s, ef.get(code)! + lag);
      else if (rel === "SS") s = Math.max(s, es.get(code)! + lag);
      else s = Math.max(s, ef.get(code)! + lag - dur(a));
    }
    es.set(a.code, s);
    ef.set(a.code, s + dur(a));
    done.add(a.code);
  };
  acts.forEach(visit);
  const end = Math.max(...ef.values());
  const lf = new Map<string, number>(acts.map((a) => [a.code, end]));
  const ls = new Map<string, number>();
  for (const a of [...acts].sort((x, y) => es.get(y.code)! - es.get(x.code)!)) {
    for (const b of acts) {
      for (const p of b.preds ?? []) {
        const [code, rel, lag] = norm(p);
        if (code !== a.code) continue;
        const bls = ls.get(b.code) ?? lf.get(b.code)! - dur(b);
        if (rel === "FS") lf.set(a.code, Math.min(lf.get(a.code)!, bls - lag));
        else if (rel === "SS") lf.set(a.code, Math.min(lf.get(a.code)!, bls - lag + dur(a)));
        else lf.set(a.code, Math.min(lf.get(a.code)!, lf.get(b.code)! - lag));
      }
    }
    ls.set(a.code, lf.get(a.code)! - dur(a));
  }
  const tf = new Map(acts.map((a) => [a.code, Math.max(0, ls.get(a.code)! - es.get(a.code)!)]));
  return { es, ef, tf };
}

export interface BuiltSample {
  xer: string;
  boxes: DemoBox[];
  profileFor: (code: string) => string;
}

export function buildSample(x: SampleSpec): BuiltSample {
  const cal = x.sixDay ? uaeCalendar() : standardCalendar("1", "Standard 5-day");
  const [h0] = cal.week[1][0];
  const h1 = cal.week[1][cal.week[1].length - 1][1];
  const base = cpm(x.acts, false);
  const cur = cpm(x.acts, true);
  // Enough working days for the whole schedule and for the data date, whichever is later.
  const span = Math.ceil((Date.parse(`${x.dataDate}T00:00:00Z`) - Date.parse(`${x.start}T00:00:00Z`)) / 86_400_000) + 5;
  const days = workdays(cal, x.start, Math.max(...cur.ef.values(), ...base.ef.values(), span) + 5);
  const at = (i: number, end: boolean) => `${dayStr(days[Math.max(0, i)])} ${pad(end ? h1 : h0)}:00`;
  const dd = Date.parse(`${x.dataDate}T00:00:00Z`);
  const ddIdx = days.findIndex((t) => t >= dd);
  const wbsId = new Map(x.wbs.map(([k], i) => [k, String(Number(x.projId) * 10 + i + 1)]));
  const tasks: (DemoTask & { codes?: Record<string, string> })[] = x.acts.map((a, i) => {
    const s = cur.es.get(a.code)!;
    const f = cur.ef.get(a.code)!;
    const bs = base.es.get(a.code)!;
    const bf = base.ef.get(a.code)!;
    const ms = a.d === 0;
    const start = ms && a.finishMilestone ? at(s - 1, true) : at(s, false);
    const finish = ms ? start : at(f - 1, true);
    const bStart = ms && a.finishMilestone ? at(bs - 1, true) : at(bs, false);
    const bFinish = ms ? bStart : at(bf - 1, true);
    const status: DemoTask["status"] = (ms ? s <= ddIdx - 1 : f <= ddIdx) ? "TK_Complete" : !ms && s < ddIdx ? "TK_Active" : "TK_NotStart";
    const pct = status === "TK_Complete" ? 100 : status === "TK_Active" ? Math.min(95, Math.round(((ddIdx - s) / (f - s)) * 100)) : 0;
    return {
      id: String(Number(x.projId) * 1000 + i),
      code: a.code,
      name: a.name,
      wbs: wbsId.get(a.wbs)!,
      start,
      finish,
      status,
      pct,
      ...(bStart !== start || bFinish !== finish ? { bStart, bFinish } : {}),
      float: (cur.tf.get(a.code) ?? 0) * cal.hoursPerDay,
      type: ms ? (a.finishMilestone ? "TT_FinMile" : "TT_Mile") : "TT_Task",
      codes: a.zone ? { Zone: a.zone } : undefined,
    };
  });
  const idOf = new Map(x.acts.map((a, i) => [a.code, String(Number(x.projId) * 1000 + i)]));
  const rels: [string, string, string, number][] = [];
  for (const a of x.acts)
    for (const p of a.preds ?? []) {
      const [code, rel, lag] = typeof p === "string" ? [p, "FS" as Rel, 0] : p;
      rels.push([idOf.get(code)!, idOf.get(a.code)!, `PR_${rel}`, lag * cal.hoursPerDay]);
    }
  const resId = new Map(x.resources.map(([code], i) => [code, String(Number(x.projId) * 10 + i + 1)]));
  const loading: Record<string, [string, number, boolean?][]> = {};
  for (const a of x.acts) if (a.res) loading[a.code] = a.res.map(([code, n, fixed]) => [resId.get(code)!, n, fixed]);
  const units = [...new Set(x.resources.map((r) => r[3]))].map((u) => [u, u === "h" ? "Hour" : u] as [string, string]);
  const xer = buildDemoXer({
    projId: x.projId,
    projCode: x.code,
    projName: x.name,
    dataDate: `${x.dataDate} ${pad(h0)}:00`,
    calendar: cal,
    wbs: [[String(Number(x.projId) * 10), "", x.code, x.name], ...x.wbs.map(([k, name]) => [wbsId.get(k)!, String(Number(x.projId) * 10), k, name] as [string, string, string, string])],
    tasks,
    codeNames: x.zones ? { Zone: x.zones } : {},
    resources: x.resources.map(([code, name, type, unit, rate]) => [resId.get(code)!, code, name, type, unit, rate]),
    loading,
    rels,
    units,
    currency: "AED",
    remainingFromDataDate: true,
  });
  const boxes: DemoBox[] = [];
  let n = 0;
  for (const a of x.acts)
    for (const g of a.geo ?? []) {
      n++;
      const r = (v: number) => (Math.round(v * 100) / 100).toString();
      const [sx, sy, sz] = g.s;
      boxes.push({
        element: {
          id: `${x.kind}-${String(n).padStart(4, "0")}`,
          expressId: n,
          ifcType: g.type,
          name: g.name,
          properties: { Storey: g.storey ?? a.zone ?? "Site", [ACTIVITY_PSET]: a.code, "BaseQuantities.NetVolume": r(sx * sy * sz), ...(a.zone ? { Zone: a.zone } : {}) },
        },
        center: g.c,
        size: g.s,
        color: g.color,
      });
    }
  const prof = new Map(x.acts.map((a) => [a.code, a.profile ?? "install"]));
  return { xer, boxes, profileFor: (code) => prof.get(code) ?? "install" };
}

// ---------------------------------------------------------------- the samples

const G = (type: string, name: string, c: [number, number, number], s: [number, number, number], color: string, storey?: string): Geo => ({ type, name, c, s, color, storey });

/** 12 km dual carriageway in three 4 km sections (model shortened 1:25 along the road). */
function roadSpec(): SampleSpec {
  const acts: SampleAct[] = [
    { code: "RD-0000", name: "Notice to Proceed", wbs: "GEN", d: 0 },
    { code: "RD-0010", name: "Mobilisation and site camp", wbs: "GEN", d: 20, preds: ["RD-0000"], res: [["LAB", 6]] },
    { code: "RD-0020", name: "Survey and setting out", wbs: "GEN", d: 15, preds: ["RD-0000"], res: [["SURV", 2]] },
    { code: "RD-0100", name: "Detailed design – roads and drainage", wbs: "ENG", d: 40, preds: ["RD-0000"], res: [["ENGR", 3]] },
    { code: "RD-0110", name: "Authority approvals (DoT, utilities NOC)", wbs: "ENG", d: 30, preds: ["RD-0100"], delay: 8 },
  ];
  const sec = [
    ["S1", "km 0–4", 0],
    ["S2", "km 4–8", 1],
    ["S3", "km 8–12", 2],
  ] as const;
  const L = 160;
  const W = 24;
  const layer = (_code: string, name: string, s: string, y0: number, h: number, color: string, idx: number, type = "IfcCourse") =>
    G(type, `${name} ${s}`, [idx * L + L / 2, y0 + h / 2, 0], [L, h, W], color, s);
  sec.forEach(([s, label, i], k) => {
    const prev = k ? sec[k - 1][0] : null;
    const p = (c: string) => `RD-${s}-${c}`;
    acts.push(
      { code: p("10"), name: `Clearing and grubbing ${label}`, wbs: "EW", zone: s, d: 8, preds: prev ? [[`RD-${prev}-10`, "SS", 10]] : ["RD-0020", "RD-0010"], res: [["DOZ", 1], ["LAB", 4]], profile: "remove", geo: [layer("", "Existing ground", s, -0.6, 0.4, "#c9b58b", i, "IfcGeographicElement")] },
      { code: p("20"), name: `Cut and fill ${label}`, wbs: "EW", zone: s, d: 25, preds: [p("10"), "RD-0110"], delay: s === "S2" ? 6 : 0, res: [["EXC", 2], ["DOZ", 1], ["TRK", 6]], geo: [layer("", "Embankment", s, -0.4, 0.6, "#b49a6a", i, "IfcEarthworksFill")] },
      { code: p("30"), name: `Subgrade preparation ${label}`, wbs: "EW", zone: s, d: 12, preds: [p("20")], res: [["GRAD", 1], ["ROLL", 1]], geo: [layer("", "Subgrade", s, 0.2, 0.3, "#a48b5f", i)] },
      { code: p("40"), name: `Granular subbase ${label}`, wbs: "PAV", zone: s, d: 12, preds: [p("30")], res: [["GRAD", 1], ["ROLL", 2], ["AGG", 4800, true]], geo: [layer("", "Subbase", s, 0.5, 0.3, "#9c9a92", i)] },
      { code: p("50"), name: `Road base ${label}`, wbs: "PAV", zone: s, d: 12, preds: [p("40")], res: [["GRAD", 1], ["ROLL", 2], ["AGG", 3600, true]], geo: [layer("", "Road base", s, 0.8, 0.2, "#7f7d76", i)] },
      { code: p("60"), name: `Asphalt base course ${label}`, wbs: "PAV", zone: s, d: 8, preds: [p("50")], res: [["PAVR", 1], ["ROLL", 2], ["ASPH", 2900, true]], geo: [layer("", "Asphalt base course", s, 1.0, 0.12, "#4b4b4f", i)] },
      { code: p("70"), name: `Wearing course ${label}`, wbs: "PAV", zone: s, d: 6, preds: [p("60")], res: [["PAVR", 1], ["ROLL", 2], ["ASPH", 1900, true]], geo: [layer("", "Wearing course", s, 1.12, 0.06, "#2f3034", i)] },
    );
  });
  acts.push(
    { code: "RD-0300", name: "Box culvert at km 2.5", wbs: "STR", zone: "S1", d: 35, preds: ["RD-S1-10"], res: [["LAB", 8], ["CONC", 420, true]], geo: [G("IfcCivilElement", "Box culvert km 2.5", [L * 0.625, -0.2, 0], [12, 3, W + 6], "#b9b4aa", "S1")] },
    { code: "RD-0310", name: "Vehicle underpass at km 7", wbs: "STR", zone: "S2", d: 60, preds: ["RD-S2-10"], delay: 10, res: [["LAB", 12], ["CONC", 1650, true], ["CRANE", 0.5]], geo: [G("IfcBridge", "Underpass deck km 7", [L * 1.75, 1.2, 0], [30, 1.2, W + 10], "#b9b4aa", "S2"), G("IfcWall", "Underpass abutment west", [L * 1.75 - 14, -1, 0], [2, 4, W + 10], "#a9a49a", "S2"), G("IfcWall", "Underpass abutment east", [L * 1.75 + 14, -1, 0], [2, 4, W + 10], "#a9a49a", "S2")] },
    { code: "RD-0400", name: "Kerbs, safety barriers and fencing", wbs: "RF", d: 30, preds: ["RD-S3-60", "RD-0300", "RD-0310"], res: [["LAB", 10]], geo: [0, 1, 2].flatMap((i) => [G("IfcRailing", `Barrier north ${sec[i][1]}`, [i * L + L / 2, 1.6, W / 2], [L, 0.8, 0.3], "#c9ced6", sec[i][0]), G("IfcRailing", `Barrier south ${sec[i][1]}`, [i * L + L / 2, 1.6, -W / 2], [L, 0.8, 0.3], "#c9ced6", sec[i][0])]) },
    { code: "RD-0410", name: "Street lighting", wbs: "RF", d: 25, preds: [["RD-0400", "SS", 10]], res: [["ELEC", 6]], geo: Array.from({ length: 12 }, (_, j) => G("IfcLightFixture", `Lighting column ${j + 1}`, [L / 8 + (j * L) / 4, 6, 0], [0.5, 10, 0.5], "#e0b84a", sec[Math.min(2, Math.floor(j / 4))][0])) },
    { code: "RD-0420", name: "Road marking and traffic signs", wbs: "RF", d: 15, preds: ["RD-S3-70", "RD-0400"], res: [["LAB", 4]] },
    { code: "RD-0900", name: "Road opened to traffic", wbs: "RF", d: 0, preds: ["RD-0410", "RD-0420"], finishMilestone: true },
  );
  return {
    kind: "road",
    projId: "310",
    code: "HWY-12",
    name: "Al Wathba Link Road – 12 km dual carriageway",
    eps: ["Miqyas Demo", "Infrastructure"],
    start: "2026-05-31",
    dataDate: "2026-10-19",
    sixDay: true,
    wbs: [
      ["GEN", "General and preliminaries"],
      ["ENG", "Engineering and approvals"],
      ["EW", "Earthworks"],
      ["PAV", "Pavement"],
      ["STR", "Structures"],
      ["RF", "Road furniture and lighting"],
    ],
    zones: { S1: "Section 1 (km 0–4)", S2: "Section 2 (km 4–8)", S3: "Section 3 (km 8–12)" },
    resources: [
      ["LAB", "General labour", "RT_Labor", "h", 25],
      ["ENGR", "Design engineers", "RT_Labor", "h", 180],
      ["SURV", "Survey crew", "RT_Labor", "h", 90],
      ["ELEC", "Electricians", "RT_Labor", "h", 45],
      ["EXC", "Excavator 30 t", "RT_Equip", "h", 160],
      ["DOZ", "Dozer D8", "RT_Equip", "h", 210],
      ["TRK", "Dump truck 25 t", "RT_Equip", "h", 95],
      ["GRAD", "Motor grader", "RT_Equip", "h", 150],
      ["ROLL", "Roller", "RT_Equip", "h", 85],
      ["PAVR", "Asphalt paver", "RT_Equip", "h", 260],
      ["CRANE", "Crawler crane 100 t", "RT_Equip", "h", 420],
      ["AGG", "Aggregate", "RT_Mat", "t", 38],
      ["ASPH", "Asphalt mix", "RT_Mat", "t", 245],
      ["CONC", "Concrete C40", "RT_Mat", "m3", 330],
    ],
    acts,
    modelName: "Demo model: 12 km dual carriageway",
  };
}

/** 50 MWp solar PV plant in four blocks. */
function solarSpec(): SampleSpec {
  const acts: SampleAct[] = [
    { code: "PV-0000", name: "Notice to Proceed", wbs: "PM", d: 0 },
    { code: "PV-0010", name: "Mobilisation", wbs: "PM", d: 15, preds: ["PV-0000"], res: [["LAB", 6]] },
    { code: "PV-0100", name: "Geotechnical survey and pull-out tests", wbs: "ENG", d: 15, preds: ["PV-0000"], res: [["ENGR", 2]] },
    { code: "PV-0110", name: "Detailed design and layout", wbs: "ENG", d: 30, preds: ["PV-0100"], res: [["ENGR", 4]] },
    { code: "PV-0200", name: "Supply of PV modules (lead time)", wbs: "PRC", d: 70, preds: ["PV-0110"], delay: 12 },
    { code: "PV-0210", name: "Supply of trackers and piles", wbs: "PRC", d: 55, preds: ["PV-0110"] },
    { code: "PV-0220", name: "Supply of inverter stations", wbs: "PRC", d: 80, preds: ["PV-0110"] },
    { code: "PV-0300", name: "Site grading and access roads", wbs: "CIV", d: 25, preds: ["PV-0010", "PV-0110"], res: [["DOZ", 2], ["GRAD", 1]], profile: "install", geo: [G("IfcGeographicElement", "Graded site", [100, -0.1, 70], [210, 0.2, 150], "#d8c39a", "Site")] },
  ];
  const blocks = ["B1", "B2", "B3", "B4"];
  blocks.forEach((b, k) => {
    const bx = (k % 2) * 105 + 5;
    const bz = Math.floor(k / 2) * 72 + 5;
    const rows = 6;
    const piles: Geo[] = [];
    const trackers: Geo[] = [];
    const modules: Geo[] = [];
    for (let r = 0; r < rows; r++) {
      const z = bz + 6 + r * 10;
      for (let c = 0; c < 5; c++) piles.push(G("IfcPile", `Pile ${b}-R${r + 1}-${c + 1}`, [bx + 10 + c * 20, 0.8, z], [0.25, 1.6, 0.25], "#7e8a96", b));
      trackers.push(G("IfcMember", `Tracker torque tube ${b}-R${r + 1}`, [bx + 50, 1.7, z], [92, 0.25, 0.4], "#9aa5b1", b));
      modules.push(G("IfcSolarDevice", `PV modules ${b}-R${r + 1}`, [bx + 50, 1.9, z], [92, 0.08, 4.4], "#1f3c88", b));
    }
    const prev = k ? blocks[k - 1] : null;
    acts.push(
      { code: `PV-${b}-10`, name: `Piling ${b}`, wbs: "MECH", zone: b, d: 15, preds: prev ? [[`PV-${prev}-10`, "SS", 8]] : ["PV-0300", "PV-0210"], res: [["PILE", 2], ["LAB", 6]], geo: piles },
      { code: `PV-${b}-20`, name: `Tracker installation ${b}`, wbs: "MECH", zone: b, d: 15, preds: [`PV-${b}-10`], res: [["LAB", 12]], geo: trackers },
      { code: `PV-${b}-30`, name: `Module installation ${b}`, wbs: "MECH", zone: b, d: 12, preds: [`PV-${b}-20`, "PV-0200"], res: [["LAB", 16], ["TELE", 2]], geo: modules },
      { code: `PV-${b}-40`, name: `DC cabling and string tests ${b}`, wbs: "ELEC", zone: b, d: 10, preds: [`PV-${b}-30`], res: [["ELEC", 8]] },
    );
  });
  acts.push(
    { code: "PV-0500", name: "Inverter stations installation", wbs: "ELEC", d: 15, preds: ["PV-0220", "PV-0300"], res: [["ELEC", 6], ["CRANE", 0.4]], geo: blocks.map((b, k) => G("IfcElectricDistributionBoard", `Inverter station ${b}`, [(k % 2) * 105 + 103, 1.5, Math.floor(k / 2) * 72 + 36], [6, 3, 2.5], "#f2f4f6", b)) },
    { code: "PV-0510", name: "MV cabling and trenching", wbs: "ELEC", d: 25, preds: ["PV-0500", ["PV-B2-40", "SS", 0]], res: [["ELEC", 8], ["EXC", 1]] },
    { code: "PV-0520", name: "132 kV substation and grid tie-in", wbs: "ELEC", d: 30, preds: ["PV-0300"], delay: 5, res: [["ELEC", 6], ["ENGR", 1]], geo: [G("IfcTransformer", "Step-up transformer 132/33 kV", [205, 2.5, 140], [8, 5, 6], "#8fa3b8", "Substation"), G("IfcBuilding", "Substation control building", [190, 2, 140], [12, 4, 8], "#e6e1d8", "Substation")] },
    { code: "PV-0600", name: "Cold commissioning", wbs: "COM", d: 10, preds: ["PV-B4-40", "PV-0510", "PV-0520"], res: [["ENGR", 3]] },
    { code: "PV-0610", name: "Hot commissioning and grid synchronisation", wbs: "COM", d: 10, preds: ["PV-0600"], res: [["ENGR", 3]] },
    { code: "PV-0900", name: "Commercial operation date (COD)", wbs: "COM", d: 0, preds: ["PV-0610"], finishMilestone: true },
  );
  return {
    kind: "solar",
    projId: "320",
    code: "PV-50",
    name: "Sweihan 50 MWp solar PV plant",
    eps: ["Miqyas Demo", "Energy"],
    start: "2026-05-26",
    dataDate: "2026-10-19",
    sixDay: true,
    wbs: [
      ["PM", "Project management"],
      ["ENG", "Engineering"],
      ["PRC", "Procurement"],
      ["CIV", "Civil works"],
      ["MECH", "Mechanical installation"],
      ["ELEC", "Electrical works"],
      ["COM", "Commissioning"],
    ],
    zones: { B1: "Block 1", B2: "Block 2", B3: "Block 3", B4: "Block 4" },
    resources: [
      ["LAB", "Installation crew", "RT_Labor", "h", 28],
      ["ELEC", "Electricians", "RT_Labor", "h", 48],
      ["ENGR", "Engineers", "RT_Labor", "h", 190],
      ["PILE", "Pile driver", "RT_Equip", "h", 240],
      ["TELE", "Telehandler", "RT_Equip", "h", 110],
      ["DOZ", "Dozer", "RT_Equip", "h", 210],
      ["GRAD", "Motor grader", "RT_Equip", "h", 150],
      ["EXC", "Excavator", "RT_Equip", "h", 160],
      ["CRANE", "Mobile crane 60 t", "RT_Equip", "h", 300],
    ],
    acts,
    modelName: "Demo model: 50 MWp solar PV plant",
  };
}

/** MEP fit-out of a G+6 hotel: services floor by floor, plant on the roof. */
function hotelSpec(): SampleSpec {
  const floors = 6;
  const H = 3.6;
  const acts: SampleAct[] = [
    { code: "HT-0000", name: "Access to floors 1–6 (structure handed over)", wbs: "GEN", d: 0, geo: Array.from({ length: floors + 1 }, (_, i) => G("IfcSlab", `Slab level ${i + 1}`, [20, i * H + H, 10], [40, 0.3, 20], "#cfcac0", `L${i + 1}`)).concat(Array.from({ length: floors }, (_, i) => G("IfcColumn", `Core level ${i + 1}`, [20, i * H + H / 2 + 0.15, 10], [6, H, 6], "#bdb8ae", `L${i + 1}`))), profile: "maintain" },
    { code: "HT-0010", name: "MEP shop drawings and approvals", wbs: "ENG", d: 30, preds: ["HT-0000"], res: [["ENGR", 3]] },
    { code: "HT-0020", name: "Chillers and AHUs supply (lead time)", wbs: "PRC", d: 60, preds: ["HT-0010"], delay: 9 },
    { code: "HT-0030", name: "LV panels and MDB supply", wbs: "PRC", d: 45, preds: ["HT-0010"] },
  ];
  for (let f = 1; f <= floors; f++) {
    const y = (f - 1) * H + H;
    const prev = f > 1 ? `HT-L${f - 1}` : null;
    const L = `L${f}`;
    acts.push(
      { code: `HT-L${f}-10`, name: `Ductwork first fix level ${f}`, wbs: "FLR", zone: L, d: 8, preds: prev ? [[`${prev}-10`, "SS", 5]] : ["HT-0010"], res: [["DUCT", 6]], geo: [G("IfcDuctSegment", `Main duct level ${f}`, [20, y + H - 0.7, 4], [36, 0.6, 1.2], "#9ccbe8", L), G("IfcDuctSegment", `Branch duct level ${f}`, [20, y + H - 0.7, 16], [36, 0.5, 0.9], "#9ccbe8", L)] },
      { code: `HT-L${f}-20`, name: `Plumbing and sprinkler first fix level ${f}`, wbs: "FLR", zone: L, d: 8, preds: [[`HT-L${f}-10`, "SS", 3]], res: [["PLMB", 6]], geo: [G("IfcPipeSegment", `Sprinkler main level ${f}`, [20, y + H - 0.25, 8], [36, 0.2, 0.2], "#e05a4f", L), G("IfcPipeSegment", `Water riser branch level ${f}`, [20, y + H - 0.3, 12], [36, 0.15, 0.15], "#4fa3e0", L)] },
      { code: `HT-L${f}-30`, name: `Cable trays and containment level ${f}`, wbs: "FLR", zone: L, d: 6, preds: [[`HT-L${f}-10`, "SS", 2]], delay: f === 3 ? 4 : 0, res: [["ELEC", 6]], geo: [G("IfcCableCarrierSegment", `Cable tray level ${f}`, [20, y + H - 0.45, 10], [36, 0.1, 0.6], "#c8a24a", L)] },
      { code: `HT-L${f}-40`, name: `Above-ceiling inspection level ${f}`, wbs: "FLR", zone: L, d: 2, preds: [`HT-L${f}-10`, `HT-L${f}-20`, `HT-L${f}-30`], res: [["ENGR", 1]] },
      { code: `HT-L${f}-50`, name: `Second fix and terminals level ${f}`, wbs: "FLR", zone: L, d: 6, preds: [`HT-L${f}-40`], res: [["ELEC", 4], ["PLMB", 3], ["DUCT", 2]] },
    );
  }
  const roof = floors * H + H;
  acts.push(
    { code: "HT-0100", name: "Chillers and AHUs installation (roof)", wbs: "PLT", d: 15, preds: ["HT-0020"], res: [["DUCT", 4], ["CRANE", 0.5]], geo: [G("IfcChiller", "Chiller 1", [10, roof + 1.2, 6], [6, 2.4, 2.5], "#8fa3b8", "Roof"), G("IfcChiller", "Chiller 2", [10, roof + 1.2, 14], [6, 2.4, 2.5], "#8fa3b8", "Roof"), G("IfcUnitaryEquipment", "AHU roof", [28, roof + 1, 10], [8, 2, 3], "#aab7c4", "Roof")] },
    { code: "HT-0110", name: "LV panels and MDB installation", wbs: "PLT", d: 15, preds: ["HT-0030"], res: [["ELEC", 6]] },
    { code: "HT-0120", name: "BMS and fire alarm systems", wbs: "PLT", d: 20, preds: [["HT-L6-30", "FS", 0]], res: [["ELEC", 4], ["ENGR", 1]] },
    { code: "HT-0200", name: "Testing and commissioning", wbs: "TC", d: 25, preds: ["HT-0100", "HT-0110", "HT-0120", "HT-L6-50"], res: [["ENGR", 4]] },
    { code: "HT-0210", name: "Civil Defence inspection and approval", wbs: "TC", d: 5, preds: ["HT-0200"] },
    { code: "HT-0900", name: "MEP handover", wbs: "TC", d: 0, preds: ["HT-0210"], finishMilestone: true },
  );
  return {
    kind: "hotel",
    projId: "330",
    code: "HTL-MEP",
    name: "Corniche Hotel – MEP fit-out (G+6)",
    eps: ["Miqyas Demo", "Buildings"],
    start: "2026-07-13",
    dataDate: "2026-10-19",
    wbs: [
      ["GEN", "General"],
      ["ENG", "Engineering"],
      ["PRC", "Procurement"],
      ["FLR", "Floors – MEP first and second fix"],
      ["PLT", "Central plant and systems"],
      ["TC", "Testing, commissioning and handover"],
    ],
    zones: Object.fromEntries(Array.from({ length: floors }, (_, i) => [`L${i + 1}`, `Level ${i + 1}`])),
    resources: [
      ["DUCT", "Duct fitters", "RT_Labor", "h", 42],
      ["PLMB", "Plumbers", "RT_Labor", "h", 44],
      ["ELEC", "Electricians", "RT_Labor", "h", 46],
      ["ENGR", "MEP engineers", "RT_Labor", "h", 170],
      ["CRANE", "Mobile crane 80 t", "RT_Equip", "h", 380],
    ],
    acts,
    modelName: "Demo model: hotel MEP fit-out",
  };
}

/** 25 km DN1200 water transmission pipeline in five sections, with a pump station (model shortened 1:200). */
function pipelineSpec(): SampleSpec {
  const acts: SampleAct[] = [
    { code: "WP-0000", name: "Notice to Proceed", wbs: "PM", d: 0 },
    { code: "WP-0010", name: "Route survey and design", wbs: "ENG", d: 35, preds: ["WP-0000"], res: [["ENGR", 3], ["SURV", 2]] },
    { code: "WP-0020", name: "Supply of DN1200 steel pipes (lead time)", wbs: "PRC", d: 40, preds: ["WP-0010"], delay: 7 },
    { code: "WP-0030", name: "Right-of-way permits", wbs: "ENG", d: 25, preds: ["WP-0010"] },
  ];
  const secs = ["A", "B", "C", "D", "E"];
  const SL = 25;
  secs.forEach((s, k) => {
    const x0 = k * SL;
    const prev = k ? secs[k - 1] : null;
    const z = `S${s}`;
    acts.push(
      { code: `WP-${s}-10`, name: `ROW clearance section ${s}`, wbs: "PIPE", zone: z, d: 6, preds: prev ? [[`WP-${prev}-10`, "SS", 6]] : ["WP-0030"], res: [["DOZ", 1]] },
      { code: `WP-${s}-20`, name: `Trench excavation section ${s}`, wbs: "PIPE", zone: z, d: 12, preds: [`WP-${s}-10`], delay: s === "C" ? 5 : 0, res: [["EXC", 2]], profile: "temporary", geo: [G("IfcEarthworksCut", `Open trench section ${s}`, [x0 + SL / 2, -1.5, 0], [SL, 3, 4], "#c9a36b", z)] },
      { code: `WP-${s}-30`, name: `Pipe stringing and welding section ${s}`, wbs: "PIPE", zone: z, d: 14, preds: [[`WP-${s}-20`, "SS", 4], "WP-0020"], res: [["WELD", 6], ["SIDE", 1]], geo: [G("IfcPipeSegment", `DN1200 pipe section ${s}`, [x0 + SL / 2, -2.2, 0], [SL, 1.2, 1.2], "#4c6a85", z)] },
      { code: `WP-${s}-40`, name: `Lowering, bedding and backfill section ${s}`, wbs: "PIPE", zone: z, d: 12, preds: [`WP-${s}-30`], res: [["EXC", 1], ["LAB", 6]], geo: [G("IfcEarthworksFill", `Backfill section ${s}`, [x0 + SL / 2, -0.75, 0], [SL, 1.5, 4], "#b49a6a", z)] },
      { code: `WP-${s}-50`, name: `Hydrostatic test section ${s}`, wbs: "PIPE", zone: z, d: 4, preds: [`WP-${s}-40`], res: [["ENGR", 1]] },
    );
  });
  acts.push(
    { code: "WP-0400", name: "Pump station civil works", wbs: "PS", d: 50, preds: ["WP-0010"], res: [["LAB", 10], ["CONC", 900, true]], geo: [G("IfcBuilding", "Pump station building", [-14, 2.5, 0], [12, 5, 9], "#d9d3c7", "Pump station")] },
    { code: "WP-0410", name: "Pumps and MEP installation", wbs: "PS", d: 30, preds: ["WP-0400"], delay: 6, res: [["WELD", 2], ["ELEC", 4]], geo: [0, 1, 2].map((i) => G("IfcPump", `Pump ${i + 1}`, [-18 + i * 4, 0.8, 0], [2, 1.6, 1.6], "#3d7dd8", "Pump station")) },
    { code: "WP-0500", name: "Flushing, disinfection and commissioning", wbs: "COM", d: 15, preds: ["WP-E-50", "WP-0410"], res: [["ENGR", 2]] },
    { code: "WP-0900", name: "Pipeline in service", wbs: "COM", d: 0, preds: ["WP-0500"], finishMilestone: true },
  );
  return {
    kind: "pipeline",
    projId: "340",
    code: "WTP-25",
    name: "Al Ain water transmission pipeline – 25 km DN1200",
    eps: ["Miqyas Demo", "Water"],
    start: "2026-06-29",
    dataDate: "2026-10-19",
    sixDay: true,
    wbs: [
      ["PM", "Project management"],
      ["ENG", "Engineering and permits"],
      ["PRC", "Procurement"],
      ["PIPE", "Pipeline construction"],
      ["PS", "Pump station"],
      ["COM", "Testing and commissioning"],
    ],
    zones: Object.fromEntries(secs.map((s, i) => [`S${s}`, `Section ${s} (km ${i * 5}–${i * 5 + 5})`])),
    resources: [
      ["LAB", "General labour", "RT_Labor", "h", 25],
      ["WELD", "Pipe welders", "RT_Labor", "h", 65],
      ["ELEC", "Electricians", "RT_Labor", "h", 46],
      ["ENGR", "Engineers", "RT_Labor", "h", 180],
      ["SURV", "Survey crew", "RT_Labor", "h", 90],
      ["EXC", "Excavator 45 t", "RT_Equip", "h", 190],
      ["DOZ", "Dozer", "RT_Equip", "h", 210],
      ["SIDE", "Pipelayer side boom", "RT_Equip", "h", 260],
      ["CONC", "Concrete C35", "RT_Mat", "m3", 310],
    ],
    acts,
    modelName: "Demo model: 25 km water pipeline",
  };
}

export const SAMPLE_SPECS: Record<string, () => SampleSpec> = { road: roadSpec, solar: solarSpec, hotel: hotelSpec, pipeline: pipelineSpec };
