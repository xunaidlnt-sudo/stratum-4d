import { describe, expect, it } from "vitest";
import { onRequestGet, onRequestPost } from "../functions/api/contact";

function fakeBucket() {
  const files = new Map<string, string>();
  return {
    files,
    put: async (k: string, v: string) => void files.set(k, v),
    list: async ({ prefix }: { prefix: string }) => ({ objects: [...files.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }),
    get: async (k: string) => (files.has(k) ? { text: async () => files.get(k)! } : null),
  };
}
const good = { name: "Test Planner", email: "planner@example.com", message: "Please show us the demo.", company: "Example Co", interest: "Team", elapsed: "8000", lang: "ar" };
const post = (env: object, body: unknown) => onRequestPost({ request: new Request("https://x/api/contact", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "CF-IPCountry": "AE" } }), env });

describe("contact form (Pages Function)", () => {
  it("stores a valid enquiry in the leads bucket", async () => {
    const b = fakeBucket();
    const r = await post({ LEADS: b }, good);
    expect(await r.json()).toEqual({ ok: true });
    expect(b.files.size).toBe(1);
    const [key, text] = [...b.files][0];
    expect(key).toMatch(/^leads\/\d{4}-\d{2}\/.+\.json$/);
    const rec = JSON.parse(text);
    expect(rec).toMatchObject({ name: "Test Planner", interest: "Team", lang: "ar", country_ip: "AE" });
  });
  it("drops bots silently: the hidden field, or a form sent too fast", async () => {
    const b = fakeBucket();
    expect((await (await post({ LEADS: b }, { ...good, website: "x" })).json()).ok).toBe(true);
    expect((await (await post({ LEADS: b }, { ...good, elapsed: "500" })).json()).ok).toBe(true);
    expect(b.files.size).toBe(0);
  });
  it("rejects missing fields, a bad email, long fields and bad JSON", async () => {
    const b = fakeBucket();
    expect((await post({ LEADS: b }, { ...good, message: "" })).status).toBe(400);
    expect((await post({ LEADS: b }, { ...good, email: "nope" })).status).toBe(400);
    expect((await post({ LEADS: b }, { ...good, name: "x".repeat(200) })).status).toBe(400);
    expect((await post({ LEADS: b }, "{bad")).status).toBe(400);
    expect((await post({}, good)).status).toBe(503);
    expect(b.files.size).toBe(0);
  });
  it("lists enquiries only with the right key", async () => {
    const b = fakeBucket();
    await post({ LEADS: b }, good);
    const env = { LEADS: b, LEADS_KEY: "a-long-secret-key" };
    const get = (q: string) => onRequestGet({ request: new Request(`https://x/api/contact${q}`), env });
    expect((await get("")).status).toBe(404);
    expect((await get("?key=wrong-key-here")).status).toBe(404);
    const r = await get("?key=a-long-secret-key");
    const j = await r.json();
    expect(j.count).toBe(1);
    expect(j.leads[0].email).toBe("planner@example.com");
  });
});
