// Screenshots for the user manual, taken from the sample projects (no project data of any user).
// Run against a preview build:  npm run build && npx vite preview --port 18081
//   node scripts/manual/shots.cjs [http://localhost:18081]

const path = require("path");
const { chromium } = require("playwright");

const base = process.argv.slice(2).find((a) => a.startsWith("http")) || "http://localhost:18081/";
const dir = path.resolve(__dirname, "../../docs/manual/shots");
const config = (mode) => JSON.stringify({ configured: true, mode, storage: "local", theme: "light" });

async function page(b, cfg) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1.5 });
  await ctx.addInitScript((c) => {
    localStorage.clear();
    if (c) localStorage.setItem("stratum.config.v1", c);
  }, cfg);
  const p = await ctx.newPage();
  await p.goto(base);
  await p.waitForTimeout(1500);
  return p;
}
const shot = (p, name, clip) => p.screenshot({ path: path.join(dir, `${name}.png`), ...(clip ? { clip } : {}) });

(async () => {
  if (process.argv.includes("--part2")) return;
  const b = await chromium.launch();

  // First start: setup wizard.
  let p = await page(b, null);
  await shot(p, "setup-layout");
  await p.click('button:has-text("Next")');
  await p.waitForTimeout(400);
  await shot(p, "setup-storage");
  await p.close();

  // Empty workspace and the three layouts with the GIS sample.
  for (const [mode, name] of [
    ["p6", "layout-p6"],
    ["msp", "layout-msp"],
    ["4d", "layout-4d"],
  ]) {
    p = await page(b, config(mode));
    if (mode === "p6") await shot(p, "empty-workspace");
    // The 4D layout has the sample in its File menu; the schedule layouts show it in the empty workspace.
    if (mode === "4d") {
      await p.click('summary[title="File"]');
      await p.click("text=Sample: 220 kV GIS substation (UAE)");
    } else await p.click("text=220 kV GIS substation (UAE)");
    await p.waitForTimeout(mode === "4d" ? 4000 : 2000);
    await shot(p, name);
    if (mode === "p6") {
      await p.click('.mb-item button:has-text("File")');
      await p.waitForTimeout(300);
      await shot(p, "p6-file-menu");
      await p.keyboard.press("Escape");
    }
    if (mode === "msp") {
      await p.click(".msp-filetab");
      await p.waitForTimeout(300);
      await p.click('.msp-bs-nav button:has-text("Save As")');
      await p.waitForTimeout(300);
      await shot(p, "msp-save-as");
    }
    await p.close();
  }
  await b.close();
  console.log("Screenshots in", dir);
})();

// Part 2: chapters 5-7 (P6 layout, Project layout, 4D layout).
(async () => {
  if (!process.argv.includes("--part2")) return;
  const b = await chromium.launch();
  const open = async (mode) => {
    const p = await page(b, config(mode));
    if (mode === "4d") {
      await p.click('summary[title="File"]');
      await p.click("text=Sample: 220 kV GIS substation (UAE)");
    } else await p.click("text=220 kV GIS substation (UAE)");
    await p.waitForTimeout(mode === "4d" ? 4000 : 2000);
    return p;
  };
  const dlg = async (p, name) => {
    const box = await p.locator('[role="dialog"]').last().boundingBox();
    await p.screenshot({ path: path.join(dir, `${name}.png`), clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: box.width + 16, height: box.height + 16 } });
  };
  // P6
  let p = await open("p6");
  const menu = async (m, item) => {
    await p.click(`.mb-item button:has-text("${m}")`);
    await p.click(`.mb-drop button:has-text("${item}")`);
    await p.waitForTimeout(500);
  };
  await menu("Project", "Schedule…");
  await dlg(p, "p6-schedule");
  await p.locator('[role="dialog"] button[aria-label="Close"]').last().click();
  await menu("Project", "Maintain Baselines…");
  await dlg(p, "p6-baselines");
  await p.locator('[role="dialog"] button[aria-label="Close"]').last().click();
  await menu("Tools", "Update Progress…");
  await dlg(p, "p6-update-progress");
  await p.locator('[role="dialog"] button[aria-label="Close"]').last().click();
  await p.close();
  // MS Project
  p = await open("msp");
  await p.locator(".mspg-row.task").nth(5).dblclick({ position: { x: 20, y: 10 } });
  await p.waitForTimeout(400);
  await dlg(p, "msp-task-info");
  await p.click('.msp-dlg-foot button:has-text("Cancel")');
  await p.click('.msp-tabrow button:has-text("Project")');
  await p.click('.msp-ribbon button:has-text("Change Working Time")');
  await p.waitForTimeout(400);
  await dlg(p, "msp-working-time");
  await p.click('.msp-dlg-foot button:has-text("Cancel")');
  await p.click('.msp-tabrow button:has-text("View")');
  await p.click('.msp-ribbon button:has-text("Task Usage")');
  await p.waitForTimeout(700);
  await shot(p, "msp-task-usage");
  await p.click('.msp-ribbon button:has-text("Team Planner")');
  await p.waitForTimeout(700);
  await shot(p, "msp-team-planner");
  await p.close();
  // 4D teardown
  p = await open("4d");
  await p.click(".td-toggle");
  await p.check('.td-row:has-text("Work under way") input');
  await p.waitForTimeout(800);
  await shot(p, "4d-teardown");
  await p.locator('input[aria-label="Explode"]').fill("0.7");
  await p.waitForTimeout(1600);
  await shot(p, "4d-explode");
  await p.close();
  await b.close();
  console.log("Part 2 screenshots done");
})();
