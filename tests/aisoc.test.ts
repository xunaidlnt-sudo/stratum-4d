import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server/app";
import { severityOf, shouldForward, toAisocEvent } from "../src/services/aisoc";
import { StratumApi } from "../src/services/api";
import { Repository } from "../src/services/repo";
import { aesBox } from "../src/services/secrets";
import { openSqlite } from "../src/services/sql";

const SECRET = "aisoc-test-secret-0123456789";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("AiSOC mapping", () => {
  it("rates and maps audit entries", () => {
    expect(severityOf({ action: "login.locked", detail: {} })).toBe("high");
    expect(severityOf({ action: "login.failed", detail: { known: false } })).toBe("medium");
    expect(severityOf({ action: "user.update", detail: { role: "admin", from: { role: "planner" } } })).toBe("high");
    expect(severityOf({ action: "user.update", detail: { role: "admin", from: { role: "admin" } } })).toBe("low");
    expect(severityOf({ action: "audit.broken", detail: {} })).toBe("critical");
    expect(shouldForward("project.save", "security")).toBe(false);
    expect(shouldForward("project.save", "all")).toBe(true);
    expect(shouldForward("login.ok", "security")).toBe(true);
    const ev = toAisocEvent({ seq: 7, at: "2026-11-03T10:00:00.000Z", actor: "a@co.com", action: "login.failed", target: "a@co.com", detail: { known: true }, ip: "10.1.1.1", prevHash: "p", hash: "h" }, "stratum-host");
    expect(ev).toMatchObject({ severity: "low", user: "a@co.com", src_ip: "10.1.1.1", host: "stratum-host", outcome: "failure", event_type: "login.failed", stratum: { seq: 7, hash: "h" } });
  });
});

describe("AiSOC connection on Stratum Server", () => {
  it("stores the token encrypted, sends a test event, forwards security events and retries", async () => {
    const db = await openSqlite(null);
    const repo = new Repository(db);
    await repo.migrate();
    const api = new StratumApi({ repo, box: aesBox(SECRET), renderPdf: null });
    const got: { url: string; auth: string; tenant: string; body: { connector_id: string; connector_type: string; events: { title: string; severity: string; event_type: string }[] } }[] = [];
    let down = false;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      if (down) throw new Error("connect ECONNREFUSED");
      const h = init.headers as Record<string, string>;
      if (h.Authorization !== "Bearer push-token-123") return new Response('{"error":"invalid token"}', { status: 401 });
      got.push({ url, auth: h.Authorization, tenant: h["X-Tenant-ID"], body: JSON.parse(String(init.body)) });
      return new Response('{"accepted":1}', { status: 202 });
    }) as unknown as typeof fetch;
    const { app, aisoc } = await buildServer({ repo, api, jwtSecret: SECRET, aisocFetch: fakeFetch });
    const call = async (method: string, url: string, token?: string, payload?: unknown) => {
      const r = await app.inject({ method: method as "GET", url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload: payload as object });
      return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null };
    };
    const admin = (await call("POST", "/api/setup", undefined, { email: "admin@co.com", name: "Admin", password: "correct horse" })).body.token as string;
    await call("PUT", "/api/users/u-v", admin, { email: "v@co.com", name: "V", role: "viewer", password: "viewer-pass" });
    const viewer = (await call("POST", "/api/login", undefined, { email: "v@co.com", password: "viewer-pass" })).body.token as string;
    expect((await call("GET", "/api/aisoc", viewer)).status).toBe(403);

    expect((await call("PUT", "/api/aisoc", admin, { ingestUrl: "not a url" })).status).toBe(400);
    const saved = await call("PUT", "/api/aisoc", admin, { enabled: true, consoleUrl: "https://aisoc.co.local:3000/", ingestUrl: "https://aisoc.co.local:8081", token: "push-token-123", tenantId: "t-1" });
    expect(saved.body).toMatchObject({ enabled: true, consoleUrl: "https://aisoc.co.local:3000", token: "••••••••" });
    // The token is encrypted in the database and never comes back.
    const raw = JSON.stringify(await repo.getSetting("aisoc"));
    expect(raw).not.toContain("push-token-123");
    expect(JSON.stringify((await call("GET", "/api/aisoc", admin)).body)).not.toContain("push-token-123");
    // Saving again with the mask keeps the token.
    await call("PUT", "/api/aisoc", admin, { token: "••••••••", forward: "security" });

    const test = await call("POST", "/api/aisoc/test", admin, {});
    expect(test.body.ok).toBe(true);
    expect(got.at(-1)).toMatchObject({ url: "https://aisoc.co.local:8081/v1/ingest/batch", tenant: "t-1", body: { connector_id: "stratum-server", connector_type: "stratum" } });
    expect((await call("POST", "/api/aisoc/test", admin, { token: "wrong" })).body.error).toMatch(/HTTP 401/);

    // A wrong password and a project save: only the first is a security event.
    got.length = 0;
    await call("POST", "/api/login", undefined, { email: "v@co.com", password: "nope" });
    await call("PUT", "/api/projects/p1", admin, { project: { format: "stratum-project", version: 2, schedule: null, links: [], rules: [], profiles: [] } });
    await wait(50);
    await aisoc.flush();
    const types = got.flatMap((g) => g.body.events.map((e) => e.event_type));
    expect(types).toContain("login.failed");
    expect(types).not.toContain("project.save");

    // AiSOC down: events wait, and go once it is back.
    down = true;
    await call("POST", "/api/login", undefined, { email: "v@co.com", password: "nope2" });
    await wait(50);
    await aisoc.flush();
    expect(aisoc.status()).toMatchObject({ queued: 1, lastError: expect.stringMatching(/Cannot reach AiSOC/) });
    expect((await call("GET", "/api/aisoc", admin)).body.status.queued).toBe(1);
    down = false;
    got.length = 0;
    const st = (await call("POST", "/api/aisoc/flush", admin)).body;
    expect(st.queued).toBe(0);
    expect(got.flatMap((g) => g.body.events.map((e) => e.event_type))).toContain("login.failed");
    await app.close();
  });
});
