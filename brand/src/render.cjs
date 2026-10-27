// Renders the brand PNGs and SVGs with real Montserrat. Run: node brand/src/render.cjs
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { C, stratumMark, miqyasMark } = require("./marks.cjs");
const ROOT = path.resolve(__dirname, "../..");
const FONT = path.join(ROOT, "node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2");
const OUT = path.join(ROOT, "brand");

const svg = (inner, vb = "0 0 112 100", w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${w ? ` width="${w}" height="${h}"` : ""}>${inner}</svg>`;

const variants = {
  light: { text: C.navy, sub: C.steel, mark: {}, fourD: C.navy, miq: {} },
  dark: { text: C.white, sub: "#C9D3E0", mark: { upper: [C.white, C.gold, "#8FA9C6"], lower: C.white, node: C.navy }, fourD: C.white, miq: { navy: C.white } },
  mono: { text: C.navy, sub: C.navy, mark: { upper: [C.navy, C.navy, C.navy], lower: C.navy, slim: C.navy, line: C.navy, node: C.white }, fourD: C.navy, miq: { navy: C.navy, gold: C.navy } },
};

/** "4D" with the red line sweeping under it to a node, as in the brand sheet. */
const fourD = (v, red) =>
  `<span class="fourd" style="color:${v.fourD}">4D<svg class="swoosh" viewBox="0 0 160 124"><path d="M154,116 L36,116 C18,116 9,104 9,88 C9,70 12,54 16,36" fill="none" stroke="${red}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><g transform="translate(23 18) rotate(18)"><rect x="-13" y="-13" width="26" height="26" rx="7" fill="${v.mark.node ?? C.white}" stroke="${red}" stroke-width="9.5"/></g></svg></span>`;

function lockup(kind, vName) {
  const v = variants[vName];
  const red = vName === "mono" ? C.navy : C.red;
  if (kind === "stratum-full")
    return `<div class="lock"><svg class="mark" viewBox="0 0 165 170">${stratumMark(v.mark)}</svg><div class="words"><div class="name" style="color:${v.text}">Stratum ${fourD(v, red)}</div><div class="by" style="color:${v.text}">by <b>Miqyas</b> Labs</div><div class="tag" style="color:${v.text}">PLAN &nbsp;| &nbsp;SIMULATE &nbsp;| &nbsp;ANALYSE &nbsp;| &nbsp;DELIVER</div></div></div>`;
  if (kind === "stratum-compact")
    return `<div class="lock compact"><svg class="mark" viewBox="0 0 165 170">${stratumMark(v.mark)}</svg><div class="name" style="color:${v.text}">Stratum ${fourD(v, red)}</div></div>`;
  if (kind === "miqyas")
    return `<div class="lock miq"><svg class="mark" viewBox="0 0 92 100">${miqyasMark(v.miq)}</svg><div class="words"><div class="name" style="color:${v.text}"><b>Miqyas</b> Labs</div><div class="tag2" style="color:${v.text}">ENGINEERING INTELLIGENCE</div></div></div>`;
}

const FONT64 = fs.readFileSync(FONT).toString("base64");
const css = `@font-face{font-family:M;src:url(data:font/woff2;base64,${FONT64}) format("woff2");font-weight:100 900}
*{margin:0;padding:0;box-sizing:border-box} body{background:transparent;font-family:M}
.lock{display:inline-flex;align-items:flex-end;gap:18px;padding:46px 26px 18px 18px}
.lock .mark{width:236px;height:243px;flex:none;margin-bottom:-6px}
.name{font-weight:800;font-size:94px;letter-spacing:-3px;line-height:1;white-space:nowrap;display:flex;align-items:flex-end;gap:14px}
.fourd{position:relative;display:inline-block;padding-left:34px;padding-right:8px;letter-spacing:-1px}
.swoosh{position:absolute;left:-4px;top:-28px;width:156px;height:133px;overflow:visible}
.by{font-weight:500;font-size:42px;margin:12px 40px 0 0;text-align:right;letter-spacing:-0.5px} .by b{font-weight:800}
.tag{font-weight:600;font-size:19px;letter-spacing:5px;margin-top:12px;white-space:nowrap;text-align:right}
.compact{padding:40px 14px 12px 8px;gap:16px} .compact .mark{width:118px;height:121px} .compact .name{font-size:84px}
.miq{padding:14px 18px} .miq .mark{width:116px;height:126px} .miq .name{font-weight:400;font-size:86px;letter-spacing:-2px} .miq .name b{font-weight:800}
.tag2{font-weight:600;font-size:23px;letter-spacing:9px;margin-top:10px}`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 2 });
  const shots = [
    ["stratum-lockup", "stratum-full", "light"],
    ["stratum-lockup-dark", "stratum-full", "dark"],
    ["stratum-lockup-mono", "stratum-full", "mono"],
    ["stratum-logo", "stratum-compact", "light"],
    ["stratum-logo-dark", "stratum-compact", "dark"],
    ["miqyas-labs", "miqyas", "light"],
    ["miqyas-labs-dark", "miqyas", "dark"],
  ];
  for (const [file, kind, v] of shots) {
    await p.setContent(`<!doctype html><html><head><style>${css}</style></head><body>${lockup(kind, v)}</body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    const el = await p.$(".lock");
    await el.screenshot({ path: path.join(OUT, `${file}.png`), omitBackground: true });
  }
  // App icons: rounded tile with the mark.
  const tiles = { "stratum-icon": [C.navy, { upper: [C.white, C.gold, "#8FA9C6"], lower: C.white, node: C.navy }], "stratum-icon-light": [C.white, {}], "stratum-icon-dark": ["#111111", { upper: [C.white, "#BDBDBD", "#8C8C8C"], lower: C.white, slim: "#BDBDBD", line: C.white, node: "#111111" }] };
  for (const [name, [bg, m]] of Object.entries(tiles)) {
    const s = svg(`<rect x="0" y="0" width="128" height="128" rx="28" fill="${bg}"/><g transform="translate(18 16) scale(0.58)">${stratumMark(m)}</g>`, "0 0 128 128", 512, 512);
    fs.writeFileSync(path.join(OUT, `${name}.svg`), s);
    await p.setViewportSize({ width: 512, height: 512 });
    await p.setContent(`<html><body style="margin:0;background:transparent">${s}</body></html>`);
    await p.screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
  }
  fs.writeFileSync(path.join(OUT, "stratum-mark.svg"), svg(stratumMark(), "0 0 165 170"));
  fs.writeFileSync(path.join(OUT, "miqyas-mark.svg"), svg(miqyasMark(), "0 0 92 100"));
  await b.close();
  console.log("brand assets written to", OUT);
})();
