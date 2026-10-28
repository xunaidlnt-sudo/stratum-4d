import { cloudBackend, memoryDrive } from "../src/backend/cloud/drive";
import { ConflictError } from "../src/backend/types";
import type { StratumProject } from "../src/core/project";
import { demoXer } from "../src/core/demo";
import { parseXer } from "../src/core/xer";

const project = (name: string): StratumProject => ({ format: "stratum-project", version: 2, savedAt: "", schedule: { ...parseXer(demoXer()), projectName: name } } as unknown as StratumProject);

describe("cloud folder store", () => {
  it("saves, lists and opens projects through a catalog", async () => {
    const drive = memoryDrive();
    const ann = cloudBackend(drive, { id: "F", name: "Stratum 4D" }, { email: "ann@x", name: "Ann", role: "planner" });
    const v1 = await ann.saveProject("p1", project("One"));
    expect(v1).toBe(1);
    const list = await ann.listProjects();
    expect(list).toMatchObject([{ id: "p1", name: "One", version: 1, updatedBy: "Ann" }]);
    const got = await ann.getProject("p1");
    expect(got?.project.schedule?.projectName).toBe("One");
    expect([...drive.files.values()].map((f) => f.name).sort()).toEqual(["p1.stratum.json", "stratum-catalog.json"]);
  });

  it("stops a colleague's stale save from overwriting newer work", async () => {
    const drive = memoryDrive();
    const ann = cloudBackend(drive, { id: "F", name: "S" }, { email: "ann@x", name: "Ann", role: "planner" });
    const bob = cloudBackend(drive, { id: "F", name: "S" }, { email: "bob@x", name: "Bob", role: "planner" });
    await ann.saveProject("p1", project("v1"));
    const opened = (await bob.getProject("p1"))!.version; // Bob opens version 1
    await ann.saveProject("p1", project("v2"), 1); // Ann saves version 2
    await expect(bob.saveProject("p1", project("bob"), opened)).rejects.toBeInstanceOf(ConflictError);
    expect((await bob.getProject("p1"))!.project.schedule?.projectName).toBe("v2");
    // Saving as new keeps Bob's work.
    expect(await bob.saveProject("p2", project("bob"))).toBe(1);
    expect((await ann.listProjects()).map((p) => p.id)).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("shares enterprise settings and dashboards, and deletes projects", async () => {
    const drive = memoryDrive();
    const a = cloudBackend(drive, { id: "F", name: "S" }, null);
    const b = cloudBackend(drive, { id: "F", name: "S" }, null);
    await a.setShared!("stratum.portfolios.v1", [{ id: "pf", name: "Substations", description: "", projectIds: [] }]);
    await a.setShared!("stratum.eps.v1", [["NEWEPS | L&T"]]);
    expect(await b.getShared!("stratum.portfolios.v1")).toEqual([{ id: "pf", name: "Substations", description: "", projectIds: [] }]);
    expect(await b.getShared!("stratum.eps.v1")).toEqual([["NEWEPS | L&T"]]);
    await a.saveDashboard({ id: "d1", name: "Weekly", projectId: null, widgets: [] } as never);
    expect((await b.listDashboards()).map((d) => d.name)).toEqual(["Weekly"]);
    await a.saveProject("p1", project("x"));
    await a.deleteProject("p1");
    expect(await b.listProjects()).toEqual([]);
  });
});
