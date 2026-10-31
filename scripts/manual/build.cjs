// Builds the Stratum 4D user manual from docs/manual:
//   docs/manual/dist/        web pages (index + one page per chapter), for the website
//   docs/Stratum-4D-Manual.pdf
// and checks the text against the ASD-STE100 rules a script can check (docs/manual/STE.md).
//
//   node scripts/manual/build.cjs            build web pages, PDF and STE report
//   node scripts/manual/build.cjs --no-pdf   web pages and STE report only

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const src = path.join(root, "docs/manual");
const out = path.join(src, "dist");
const version = require(path.join(root, "package.json")).version;
const noPdf = process.argv.includes("--no-pdf");

// ---------------------------------------------------------------- chapters

const files = fs.readdirSync(path.join(src, "chapters")).filter((f) => f.endsWith(".html")).sort();
const chapters = files.map((f, i) => {
  let html = fs.readFileSync(path.join(src, "chapters", f), "utf8");
  // <!--fig:name--> pulls in figures/name.svg so the infographics stay sharp in print.
  html = html.replace(/<!--fig:([\w-]+)-->/g, (_, n) => fs.readFileSync(path.join(src, "figures", `${n}.svg`), "utf8"));
  const title = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? f).replace(/<[^>]+>/g, "").trim();
  const num = i + 1;
  html = html.replace(/<h1([^>]*)>/, `<h1$1><span class="num">${num}</span>`);
  return { file: f, num, title, html, page: `ch${String(num).padStart(2, "0")}.html` };
});

// ---------------------------------------------------------------- STE check

const UNAPPROVED = {
  utilize: "use", utilise: "use", employ: "use", ensure: "make sure", verify: "make sure", require: "must / it is necessary", requires: "must / it is necessary", required: "necessary",
  commence: "start", initiate: "start", terminate: "stop", perform: "do", execute: "do", adjacent: "next to", approximately: "about", additional: "more",
  assist: "help", subsequent: "next", "prior": "before", via: "with / through", should: "must / imperative", may: "can", might: "can", please: "(leave out)",
  obtain: "get", provide: "give", provides: "gives", allow: "let", allows: "lets", enable: "let", enables: "lets", appropriate: "correct", sufficient: "enough",
  numerous: "many", various: "different", desire: "want", desired: "necessary", indicate: "show", indicates: "shows", modify: "change", modified: "changed",
};
const ING_OK = new Set(["setting", "settings", "string", "nothing", "something", "anything", "everything", "during", "bring", "thing", "things", "king", "ring", "spring", "wing", "building", "ceiling", "drawing", "drawings", "ring", "morning", "evening", "warning", "warnings", "heading", "headings", "pricing", "spacing", "rendering", "marking", "loading", "missing", "existing", "padding", "planning", "scheduling", "levelling", "leveling", "tracking", "commissioning", "engineering", "training", "reporting", "costing", "linking", "processing", "logging", "sharing"]);
const report = [];
const textOf = (h) =>
  h
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<(code|kbd)[^>]*>[\s\S]*?<\/\1>/g, " X ")
    .replace(/<span class="ui">[\s\S]*?<\/span>/g, " X ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const sentences = (t) => t.split(/(?<=[.!?:])\s+(?=[A-Z0-9"“(])/).map((s) => s.trim()).filter((s) => s.length > 2);
const words = (s) => s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
for (const c of chapters) {
  const body = c.html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<table[\s\S]*?<\/table>/g, " ").replace(/<figcaption[\s\S]*?<\/figcaption>/g, " ");
  const stepTexts = [...body.matchAll(/<ol class="steps">([\s\S]*?)<\/ol>/g)].flatMap((m) => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1].replace(/<span class="result">[\s\S]*?<\/span>/, "")));
  const descr = body.replace(/<ol class="steps">[\s\S]*?<\/ol>/g, " ");
  const check = (raw, limit, kind) => {
    for (const s of sentences(textOf(raw))) {
      const n = words(s).length;
      if (n > limit) report.push(`${c.file}: ${kind} sentence has ${n} words (max ${limit}): "${s.slice(0, 90)}…"`);
    }
  };
  for (const t of stepTexts) check(t, 20, "procedural");
  for (const m of descr.matchAll(/<(p|li|div class="note"|div class="caution")[^>]*>([\s\S]*?)<\/(p|li|div)>/g)) check(m[2], 25, "descriptive");
  const plain = textOf(body).toLowerCase();
  for (const [w, alt] of Object.entries(UNAPPROVED)) if (new RegExp(`\\b${w}\\b`).test(plain)) report.push(`${c.file}: unapproved word "${w}" (use ${alt})`);
  for (const m of textOf(body).matchAll(/\b([a-z]+ing)\b/g)) if (!ING_OK.has(m[1])) report.push(`${c.file}: "-ing" word "${m[1]}"`);
  const paras = [...descr.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  for (const p of paras) if (sentences(textOf(p[1])).length > 6) report.push(`${c.file}: paragraph with more than 6 sentences: "${textOf(p[1]).slice(0, 70)}…"`);
}
const uniq = [...new Set(report)];
console.log(uniq.length ? `STE check: ${uniq.length} item(s)\n  ${uniq.join("\n  ")}` : "STE check: no items");

// ---------------------------------------------------------------- web pages

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, "fonts"), { recursive: true });
fs.copyFileSync(path.join(src, "style.css"), path.join(out, "style.css"));
fs.copyFileSync(path.join(root, "node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2"), path.join(out, "fonts/montserrat.woff2"));
fs.copyFileSync(path.join(root, "node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2"), path.join(out, "fonts/inter.woff2"));
for (const f of ["stratum-lockup.png", "stratum-lockup-dark.png", "miqyas-labs.png"]) fs.copyFileSync(path.join(root, "brand", f), path.join(out, f));
fs.cpSync(path.join(src, "shots"), path.join(out, "shots"), { recursive: true });

const head = (title) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="stylesheet" href="style.css"></head>`;
const nav = (on) =>
  `<nav><a href="index.html"><img src="stratum-lockup-dark.png" alt="Stratum 4D by Miqyas Labs"></a>${chapters
    .map((c) => `<a href="${c.page}" class="${c.page === on ? "on" : ""}"><span class="num">${c.num}</span>${c.title}</a>`)
    .join("")}<a class="pdf" href="Stratum-4D-Manual.pdf">Download the PDF</a></nav>`;
const footer = `<p class="related">Stratum 4D User Manual, release ${version}. Stratum 4D by Miqyas Labs, developed by <a href="https://www.linkedin.com/in/junaidquamar/">Junaid Quamar</a>. Written in ASD-STE100 Simplified Technical English.</p>`;
chapters.forEach((c, i) => {
  const prev = chapters[i - 1];
  const next = chapters[i + 1];
  const pager = `<div class="pager">${prev ? `<a href="${prev.page}">← ${prev.num}. ${prev.title}</a>` : "<span></span>"}${next ? `<a href="${next.page}">${next.num}. ${next.title} →</a>` : "<span></span>"}</div>`;
  fs.writeFileSync(path.join(out, c.page), `${head(`${c.num}. ${c.title} – Stratum 4D User Manual`)}<body class="web">${nav(c.page)}<main>${c.html}${pager}${footer}</main></body></html>`);
});
const tocList = `<ol>${chapters.map((c) => `<li><span class="num">${c.num}</span><a href="${c.page}">${c.title}</a></li>`).join("")}</ol>`;
fs.writeFileSync(
  path.join(out, "index.html"),
  `${head("Stratum 4D User Manual")}<body class="web">${nav("")}<main><img src="stratum-lockup.png" alt="Stratum 4D by Miqyas Labs" style="width:340px;max-width:100%"><h1>User Manual</h1><p class="purpose">Release ${version}. This manual tells you how to install and use Stratum 4D: planning in the P6 and MS Project layouts, 4D simulation, dashboards and reports.</p><div class="toc" style="break-before:auto">${tocList}</div>${footer}</main></body></html>`,
);

// Print version: cover, contents and all chapters in one page.
const date = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
fs.writeFileSync(
  path.join(out, "print.html"),
  `${head("Stratum 4D User Manual")}<body><section class="cover"><div><img class="lockup" src="stratum-lockup.png" alt="Stratum 4D by Miqyas Labs"><h1>User Manual</h1><p class="sub">Release ${version} · Planning, 4D simulation, dashboards and reports</p></div><div class="meta">Written in ASD-STE100 Simplified Technical English.<br>Stratum 4D by Miqyas Labs · developed by Junaid Quamar · linkedin.com/in/junaidquamar<br>${date}. The sample projects in this manual are fictional.</div></section><section class="toc"><h1>Contents</h1>${tocList.replace(/<a href="[^"]+">/g, "<span>").replace(/<\/a>/g, "</span>")}</section>${chapters.map((c) => c.html).join("")}</body></html>`,
);
console.log(`Web pages: ${path.relative(root, out)} (${chapters.length} chapters)`);

// ---------------------------------------------------------------- PDF

if (!noPdf) {
  (async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    const p = await b.newPage();
    await p.goto(`file://${path.join(out, "print.html")}`, { waitUntil: "networkidle" });
    await p.evaluate(() => document.fonts.ready);
    const pdf = path.join(root, "docs/Stratum-4D-Manual.pdf");
    await p.pdf({
      path: pdf,
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font:7.5pt sans-serif;color:#5d6b7a;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Stratum 4D User Manual</span><span>Release ${version}</span></div>`,
      footerTemplate: `<div style="font:7.5pt sans-serif;color:#5d6b7a;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>Stratum 4D by Miqyas Labs</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    fs.copyFileSync(pdf, path.join(out, "Stratum-4D-Manual.pdf"));
    await b.close();
    console.log(`PDF: ${path.relative(root, pdf)}`);
  })();
}
