// Cloudflare Pages Function: miqyaslabs.com/downloads
//
// Serves the installers from the R2 bucket "miqyas-downloads" (binding
// DOWNLOADS) on the site's own domain, so visitors behind firewalls that block
// GitHub can still download them.
//
//   /downloads/              a page that lists the files of the latest release
//   /downloads/<file>        the file itself (latest/<file> in the bucket)

interface R2Obj {
  body: ReadableStream;
  size: number;
  httpEtag: string;
  uploaded: Date;
  httpMetadata?: { contentType?: string };
}
interface R2List {
  objects: { key: string; size: number; uploaded: Date }[];
}
interface R2Bucket {
  get(key: string): Promise<R2Obj | null>;
  head(key: string): Promise<Omit<R2Obj, "body"> | null>;
  list(o: { prefix: string }): Promise<R2List>;
}
interface Ctx {
  request: Request;
  env: { DOWNLOADS?: R2Bucket };
  params: { path?: string[] | string };
}

const LABELS: [RegExp, string, string][] = [
  [/win-x64\.exe$/, "Windows", "Installer for Windows 10 and 11 (64-bit)"],
  [/mac-arm64\.dmg$/, "macOS (Apple silicon)", "M1, M2, M3 and later"],
  [/mac-x64\.dmg$/, "macOS (Intel)", "Intel Macs"],
  [/\.AppImage$/, "Linux AppImage", "Runs on most distributions"],
  [/\.deb$/, "Linux .deb", "Debian and Ubuntu"],
  [/android\.apk$/, "Android", "Phones and tablets"],
  [/mcp\.zip$/, "AI assistants (MCP server)", "For Claude Desktop and Claude Code; needs Node.js 20"],
];

const mb = (n: number) => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function page(bucket: R2Bucket): Promise<Response> {
  const list = await bucket.list({ prefix: "latest/" });
  let version = "";
  try {
    const v = await bucket.get("latest/latest.json");
    if (v) version = (JSON.parse(await new Response(v.body).text()) as { version?: string }).version ?? "";
  } catch {
    /* no version file */
  }
  const files = list.objects.filter((o) => !o.key.endsWith(".json"));
  const rows = LABELS.flatMap(([re, name, note]) => {
    const f = files.find((o) => re.test(o.key));
    if (!f) return [];
    const file = f.key.slice("latest/".length);
    return [`<a class="dl" href="/downloads/${encodeURIComponent(file)}"><b>${esc(name)}</b><span>${esc(note)}</span><small>${esc(file)} · ${mb(f.size)}</small></a>`];
  }).join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Download Stratum 4D – Miqyas Labs</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/site.css">
<style>.dlwrap{max-width:900px;margin:0 auto;padding:40px 20px 60px}.dlwrap h1{color:#0b2545;margin:0 0 6px}.dlgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:22px}
.dl{display:flex;flex-direction:column;gap:4px;padding:16px;border:1px solid #dde3ea;border-radius:10px;background:#fff;color:#1d2733;text-decoration:none}.dl:hover{border-color:#e10600;box-shadow:0 6px 18px rgba(11,37,69,.1)}
.dl b{color:#0b2545}.dl span{font-size:13px;color:#5d6b7a}.dl small{font-size:12px;color:#8a95a3}.muted{color:#5d6b7a}</style></head>
<body><main class="dlwrap"><p><a href="/">← Miqyas Labs</a></p><h1>Download Stratum 4D</h1>
<p class="muted">${version ? `Release ${esc(version)}. ` : ""}The installers are not signed yet: Windows and macOS ask you to confirm the first time you open the app. The web demo needs no installation: <a href="/demo/">open the demo</a>.</p>
<div class="dlgrid">${rows || '<p class="muted">The files are being uploaded. Try again in a few minutes.</p>'}</div>
<p class="muted" style="margin-top:28px">Read the <a href="/manual/">user manual</a> for installation steps.</p></main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}

export async function onRequest(ctx: Ctx): Promise<Response> {
  const bucket = ctx.env.DOWNLOADS;
  if (!bucket) return new Response("Downloads are not configured yet.", { status: 503 });
  const parts = Array.isArray(ctx.params.path) ? ctx.params.path : ctx.params.path ? [ctx.params.path] : [];
  const name = parts.map(decodeURIComponent).join("/");
  if (!name) return page(bucket);
  if (!/^[\w.-]+$/.test(name)) return new Response("Not found.", { status: 404 });
  const key = `latest/${name}`;
  const method = ctx.request.method;
  if (method !== "GET" && method !== "HEAD") return new Response("Method not allowed.", { status: 405 });
  const obj = method === "HEAD" ? await bucket.head(key) : await bucket.get(key);
  if (!obj) return new Response("Not found.", { status: 404 });
  const headers = new Headers({
    "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
    "Content-Length": String(obj.size),
    ETag: obj.httpEtag,
    "Cache-Control": name.endsWith(".json") ? "no-cache" : "public, max-age=3600",
  });
  if (!name.endsWith(".json")) headers.set("Content-Disposition", `attachment; filename="${name}"`);
  return new Response(method === "HEAD" ? null : (obj as R2Obj).body, { headers });
}
