import { describe, expect, it } from "vitest";
import { demoXer } from "../src/core/demo";
import { decodeXer, parseXer } from "../src/core/xer";
import { exportXer } from "../src/core/xerExport";
import type { Schedule } from "../src/core/types";

/** Add Stratum-made data of every kind, export to XER, read it back. */
function enrich(s: Schedule): Schedule {
  const [a1, a2] = s.activities;
  return {
    ...s,
    strategicPriority: 250,
    roles: [
      {
        id: "role-pe",
        code: "PE",
        name: "Planning Engineer",
        pricePerUnit: 80,
        prices: [80, 95, 0, 0, 0],
        responsibilities: "Owns the schedule",
      },
    ],
    shifts: [
      {
        id: "sh1",
        name: "Day/Night",
        periods: [
          { start: 0, maxUnits: 1 },
          { start: 12, maxUnits: 2 },
        ],
      },
    ],
    curves: [
      {
        id: "cv1",
        name: "Front loaded",
        values: Array.from({ length: 21 }, (_, i) => 20 - i),
      },
    ],
    costAccounts: [
      { id: "ca1", parentId: null, code: "CA-100", name: "Civil" },
    ],
    obs: [{ id: "obs1", parentId: null, name: "Project Controls" }],
    obsId: "obs1",
    resources: [
      ...s.resources!,
      {
        id: "r-new",
        code: "CRANE-1",
        name: "Tower crane",
        type: "equipment",
        unit: "h",
        pricePerUnit: 150,
        prices: [150, 175, 200, 0, 0],
        roleIds: ["role-pe"],
        codes: { Trade: "Lifting" },
      },
    ],
    resourceCodeTypes: [
      {
        name: "Trade",
        values: [{ value: "Lifting", description: "Lifting plant" }],
      },
    ],
    assignments: [
      ...s.assignments!,
      {
        id: "as-new",
        activityId: a1.id,
        resourceId: "r-new",
        budgetQty: 40,
        actualQty: 0,
        remainingQty: 40,
        budgetCost: 7000,
        actualCost: 0,
        remainingCost: 7000,
        rateType: 2,
        costAccountId: "ca1",
        curveId: "cv1",
      },
    ],
    codeTypes: [
      {
        name: "Zone",
        scope: "global",
        values: [{ value: "Z1", description: "North zone", color: "#ff0000" }],
      },
    ],
    udfDefs: [
      { name: "Package", type: "text" },
      { name: "Weight", type: "number" },
      { name: "RAG", type: "indicator" },
    ],
    activities: s.activities.map((a) =>
      a.id === a1.id
        ? {
            ...a,
            codes: { ...a.codes, Zone: "Z1" },
            userFields: { Package: "PKG-01", Weight: "12.5", RAG: "Green" },
            steps: [
              { id: "st1", name: "Excavate", weight: 2, pct: 50 },
              { id: "st2", name: "Backfill", weight: 1, pct: 0 },
            ],
            notebook: { Notes: "Check <access> & permits\nwith client" },
          }
        : a.id === a2.id
          ? { ...a, codes: { ...a.codes, Zone: "Z1" } }
          : a,
    ),
    expenseCategories: ["Travel"],
    registers: {
      ...(s.registers ?? {}),
      expenses: [
        {
          id: "ex1",
          activityId: a2.id,
          values: {
            "Expense Item": "Survey",
            Category: "Travel",
            Vendor: "ACME",
            "Budgeted Cost": "1200",
            "Actual Cost": "0",
            "Remaining Cost": "1200",
            "Accrual Type": "End of Activity",
            "Cost Account": "CA-100",
          },
        },
      ],
    },
    budgetChanges: [
      {
        id: "bc1",
        wbsId: null,
        date: Date.UTC(2026, 0, 5),
        amount: 5000,
        reason: "Scope add",
        responsible: "PM",
        status: "approved",
      },
    ],
    fundingSources: [{ id: "fs1", parentId: null, name: "Client" }],
    funding: [{ id: "f1", wbsId: null, sourceId: "fs1", amount: 100000 }],
    spendingPlan: [{ wbsId: null, month: "2026-02", spending: 20000 }],
  } as Schedule;
}

describe("XER export of Stratum-created data", () => {
  const base = parseXer(demoXer());
  const s = enrich(base);
  const back = parseXer(decodeXer(exportXer(s)));
  const a1 = back.activities.find((a) => a.code === s.activities[0].code)!;

  it("keeps resources, five prices, roles and resource codes", () => {
    const r = back.resources!.find((x) => x.code === "CRANE-1")!;
    expect(r).toBeTruthy();
    expect(r.type).toBe("equipment");
    expect(r.pricePerUnit).toBe(150);
    expect(r.prices).toEqual([150, 175, 200, 0, 0]);
    expect(r.codes).toEqual({ Trade: "Lifting" });
    const role = back.roles!.find((x) => x.code === "PE")!;
    expect(role.prices?.[1]).toBe(95);
    expect(role.responsibilities).toBe("Owns the schedule");
    expect(r.roleIds).toEqual([role.id]);
    expect(back.resources!.length).toBe(s.resources!.length);
  });

  it("keeps assignments with rate type, curve and cost account", () => {
    const asg = back.assignments!.find(
      (x) =>
        back.resources!.find((r) => r.id === x.resourceId)?.code === "CRANE-1",
    )!;
    expect(asg.activityId).toBe(a1.id);
    expect(asg.budgetQty).toBe(40);
    expect(asg.rateType).toBe(2);
    expect(
      back.costAccounts!.find((c) => c.id === asg.costAccountId)?.code,
    ).toBe("CA-100");
    expect(back.curves!.find((c) => c.id === asg.curveId)?.name).toBe(
      "Front loaded",
    );
    expect(back.assignments!.length).toBe(s.assignments!.length);
  });

  it("keeps activity codes with scope, UDFs, steps and notebook", () => {
    expect(a1.codes.Zone).toBe("Z1");
    const zone = back.codeTypes!.find((c) => c.name === "Zone")!;
    expect(zone.scope).toBe("global");
    expect(zone.values.find((v) => v.value === "Z1")).toMatchObject({
      value: "Z1",
      description: "North zone",
      color: "#ff0000",
    });
    expect(a1.userFields).toMatchObject({
      Package: "PKG-01",
      Weight: "12.5",
      RAG: "Green",
    });
    expect(back.udfDefs!.find((u) => u.name === "RAG")?.type).toBe("indicator");
    expect(a1.steps!.map((x) => [x.name, x.weight, x.pct])).toEqual([
      ["Excavate", 2, 50],
      ["Backfill", 1, 0],
    ]);
    expect(a1.notebook?.Notes).toBe("Check <access> & permits\nwith client");
  });

  it("keeps OBS, shifts, expenses, budget log, funding and spending plan", () => {
    expect(back.obs?.map((o) => o.name)).toContain("Project Controls");
    expect(back.obs!.find((o) => o.id === back.obsId)?.name).toBe(
      "Project Controls",
    );
    expect(back.shifts?.[0].periods.map((p) => p.start)).toEqual([0, 12]);
    const ex = back.registers!.expenses![0];
    expect(ex.values).toMatchObject({
      "Expense Item": "Survey",
      Category: "Travel",
      "Budgeted Cost": "1200",
      "Accrual Type": "End of Activity",
      "Cost Account": "CA-100",
    });
    expect(back.budgetChanges?.[0]).toMatchObject({
      amount: 5000,
      reason: "Scope add",
      status: "approved",
    });
    expect(back.funding?.[0].amount).toBe(100000);
    expect(back.fundingSources?.[0].name).toBe("Client");
    expect(back.spendingPlan?.[0]).toMatchObject({
      month: "2026-02",
      spending: 20000,
    });
    expect(back.strategicPriority).toBe(250);
  });

  it("exporting twice gives the same tables (ids are stable)", () => {
    const again = parseXer(decodeXer(exportXer(back)));
    expect(again.resources!.map((r) => r.id)).toEqual(
      back.resources!.map((r) => r.id),
    );
    expect(again.assignments!.length).toBe(back.assignments!.length);
    expect(again.activities.find((a) => a.id === a1.id)?.steps?.length).toBe(2);
  });
});
