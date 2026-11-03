// Cloudflare Pages Function: the contact / demo request form of miqyaslabs.com.
//
//   POST /api/contact          store one enquiry (JSON body), answer { ok: true }
//   GET  /api/contact?key=...  the latest enquiries, for the owner (needs the LEADS_KEY secret)
//
// Enquiries are JSON files in the private R2 bucket "miqyas-leads" (binding
// LEADS), one per enquiry, so they can also be read in the Cloudflare
// dashboard (R2 > miqyas-leads > leads/). Spam: a hidden field that people
// leave empty, a minimum time on the page, and size limits.

interface R2Put {
  put(key: string, value: string, o?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  list(o: { prefix: string; limit?: number }): Promise<{ objects: { key: string }[] }>;
  get(key: string): Promise<{ text(): Promise<string> } | null>;
}
interface Ctx {
  request: Request;
  env: { LEADS?: R2Put; LEADS_KEY?: string };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const FIELDS: [string, number][] = [
  ["name", 120],
  ["company", 160],
  ["role", 120],
  ["email", 160],
  ["phone", 40],
  ["country", 80],
  ["interest", 80],
  ["message", 4000],
];

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const bucket = ctx.env.LEADS;
  if (!bucket) return json({ ok: false, error: "The form is not configured yet. Please try again later." }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await ctx.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "Please fill in the form again." }, 400);
  }
  // People leave the hidden "website" field empty, and take more than 3 seconds to fill the form.
  if (body.website || Number(body.elapsed ?? 0) < 3000) return json({ ok: true });
  const lead: Record<string, string> = {};
  for (const [k, max] of FIELDS) {
    const v = String(body[k] ?? "").trim();
    if (v.length > max) return json({ ok: false, error: `The ${k} is too long.` }, 400);
    lead[k] = v;
  }
  if (!lead.name || !lead.email || !lead.message) return json({ ok: false, error: "Please give your name, email and message." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) return json({ ok: false, error: "Please check the email address." }, 400);
  const at = new Date();
  const id = `${at.toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  const record = { ...lead, receivedAt: at.toISOString(), page: String(body.page ?? "").slice(0, 200), lang: String(body.lang ?? "en").slice(0, 5), country_ip: ctx.request.headers.get("CF-IPCountry") ?? "" };
  await bucket.put(`leads/${at.toISOString().slice(0, 7)}/${id}.json`, JSON.stringify(record, null, 2), { httpMetadata: { contentType: "application/json" } });
  return json({ ok: true });
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const bucket = ctx.env.LEADS;
  const key = new URL(ctx.request.url).searchParams.get("key") ?? "";
  if (!bucket || !ctx.env.LEADS_KEY || key.length < 12 || key !== ctx.env.LEADS_KEY) return json({ ok: false }, 404);
  const months = [0, 1, 2].map((i) => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - i);
    return d.toISOString().slice(0, 7);
  });
  const keys: string[] = [];
  for (const m of months) keys.push(...(await bucket.list({ prefix: `leads/${m}/`, limit: 200 })).objects.map((o) => o.key));
  keys.sort().reverse();
  const leads = [];
  for (const k of keys.slice(0, 100)) {
    const o = await bucket.get(k);
    if (o) leads.push(JSON.parse(await o.text()));
  }
  return json({ ok: true, count: leads.length, leads });
}
