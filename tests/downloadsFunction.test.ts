import { describe, expect, it } from "vitest";
import { onRequest } from "../functions/downloads/[[path]]";

const files: Record<string, string> = {
  "latest/Stratum-4D-win-x64.exe": "EXE-BYTES",
  "latest/Stratum-4D-android.apk": "APK",
  "latest/latest.json": JSON.stringify({ version: "v0.11.0" }),
};
const obj = (k: string) => ({ body: new Response(files[k]).body!, size: files[k].length, httpEtag: '"e"', uploaded: new Date(), httpMetadata: { contentType: "application/octet-stream" } });
const bucket = {
  get: async (k: string) => (k in files ? obj(k) : null),
  head: async (k: string) => (k in files ? obj(k) : null),
  list: async ({ prefix }: { prefix: string }) => ({ objects: Object.keys(files).filter((k) => k.startsWith(prefix)).map((key) => ({ key, size: files[key].length, uploaded: new Date() })) }),
};
const get = (path: string, method = "GET") => onRequest({ request: new Request(`https://x/downloads/${path}`, { method }), env: { DOWNLOADS: bucket as never }, params: { path: path ? path.split("/") : [] } });

describe("miqyaslabs.com/downloads (Pages Function)", () => {
  it("lists the latest release", async () => {
    const r = await get("");
    const html = await r.text();
    expect(r.headers.get("Content-Type")).toContain("text/html");
    expect(html).toContain("Release v0.11.0");
    expect(html).toContain('href="/downloads/Stratum-4D-win-x64.exe"');
    expect(html).toContain("Android");
    expect(html).not.toContain("macOS (Intel)");
  });
  it("serves a file as a download", async () => {
    const r = await get("Stratum-4D-win-x64.exe");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toContain("attachment");
    expect(await r.text()).toBe("EXE-BYTES");
    expect((await get("Stratum-4D-win-x64.exe", "HEAD")).headers.get("Content-Length")).toBe("9");
  });
  it("refuses unknown files and paths", async () => {
    expect((await get("nope.exe")).status).toBe(404);
    expect((await get("..%2Fsecret")).status).toBe(404);
    const none = await onRequest({ request: new Request("https://x/downloads/"), env: {}, params: {} });
    expect(none.status).toBe(503);
  });
});
