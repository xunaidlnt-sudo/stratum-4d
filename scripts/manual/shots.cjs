// Screenshots for the user manual, taken from the sample projects (no project data of any user).
// Run against a preview build:  npm run build && npx vite preview --port 18081
//   node scripts/manual/shots.cjs [http://localhost:18081]

const path = require("path");
const { chromium } = require("playwright");

const base = process.argv[2] || "http://localhost:18081/";
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
