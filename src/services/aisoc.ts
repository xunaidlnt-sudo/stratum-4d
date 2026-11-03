// AiSOC connection for Stratum Server.
//
// AiSOC (https://github.com/beenuar/AiSOC, MIT) is an open-source, self-hosted
// security operations center. Stratum Server sends its audit events (sign-ins,
// lockouts, role changes, approvals, P6 pushes, a broken audit chain) to
// AiSOC's ingest API, so the security team sees Stratum next to the company's
// other systems, and AiSOC's detections and AI triage run on them. The admin
// panel links to the AiSOC console.
//
// Ingest: POST {ingestUrl}/v1/ingest/batch, "Authorization: Bearer <push token>",
// "X-Tenant-ID: <tenant>", body { connector_id, connector_type, source_format, events }.

import os from "node:os";
import type { AuditEntry } from "./audit";

export interface AisocSettings {
  enabled: boolean;
  /** The AiSOC console, opened from the admin panel (e.g. https://aisoc.company.local:3000). */
  consoleUrl: string;
  /** AiSOC's ingest service (default port 8081). */
  ingestUrl: string;
  tenantId: string;
  /** Push-ingest token from AiSOC (stored encrypted). */
  token: string;
  /** "security": sign-ins, users, approvals, P6, settings and the audit log itself. "all": every audit entry. */
  forward: "security" | "all";
  connectorId: string;
}

export const DEFAULT_AISOC: AisocSettings = {
  enabled: false,
  consoleUrl: "",
  ingestUrl: "",
  tenantId: "00000000-0000-0000-0000-000000000001",
  token: "",
  forward: "security",
  connectorId: "stratum-server",
};

export interface AisocStatus {
  enabled: boolean;
  queued: number;
  sent: number;
  dropped: number;
  lastSentAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
}

type Severity = "info" | "low" | "medium" | "high" | "critical";

const SECURITY_PREFIXES = ["login.", "setup.", "user.", "approval.", "p6.", "settings.", "security.", "audit.", "server."];

/** How serious an audit entry is for a security team. */
export function severityOf(e: Pick<AuditEntry, "action" | "detail">): Severity {
  const d = e.detail ?? {};
  switch (e.action) {
    case "audit.broken":
    case "approval.tampered":
      return "critical";
    case "login.locked":
      return "high";
    case "login.failed":
      return d.known ? "low" : "medium";
    case "user.create":
    case "user.update":
      return d.role === "admin" && (e.action === "user.create" || (d.from as { role?: string } | undefined)?.role !== "admin") ? "high" : "low";
    case "user.delete":
    case "security.policy":
    case "settings.p6":
    case "settings.smtp":
    case "audit.retention":
    case "audit.export":
      return "medium";
    case "approval.reject":
    case "approval.failed":
    case "p6.push":
      return "low";
    default:
      return "info";
  }
}

const TITLES: Record<string, string> = {
  "login.ok": "Stratum sign-in",
  "login.failed": "Stratum: wrong password",
  "login.locked": "Stratum: sign-in locked after repeated wrong passwords",
  "setup.admin": "Stratum Server set up (first admin)",
  "user.create": "Stratum: user added",
  "user.update": "Stratum: user changed",
  "user.delete": "Stratum: user removed",
  "settings.p6": "Stratum: P6 connections changed",
  "settings.smtp": "Stratum: mail server settings changed",
  "security.policy": "Stratum: security policy changed",
  "p6.import": "Stratum: schedule pulled from P6",
  "p6.push": "Stratum: progress sent to P6",
  "approval.request": "Stratum: approval requested",
  "approval.approve": "Stratum: change approved",
  "approval.reject": "Stratum: change rejected",
  "approval.failed": "Stratum: approved change failed",
  "approval.tampered": "Stratum: approval request changed after it was made",
  "audit.broken": "Stratum: AUDIT LOG DOES NOT VERIFY",
  "audit.retention": "Stratum: old audit entries removed by retention",
  "audit.export": "Stratum: audit log exported",
  "audit.verify": "Stratum: audit log verified",
  "server.start": "Stratum Server started",
};

export function shouldForward(action: string, mode: AisocSettings["forward"]) {
  return mode === "all" || SECURITY_PREFIXES.some((p) => action.startsWith(p));
}

/** One audit entry as an AiSOC event. */
export function toAisocEvent(e: AuditEntry, host = os.hostname()) {
  const d = e.detail ?? {};
  const role = typeof d.role === "string" ? d.role : undefined;
  return {
    severity: severityOf(e),
    title: TITLES[e.action] ?? `Stratum: ${e.action}`,
    description: [`${e.actor} ${e.action}${e.target ? ` on ${e.target}` : ""}`, ...Object.entries(d).map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)].join("; ").slice(0, 2000),
    host,
    user: e.actor,
    src_ip: e.ip || undefined,
    event_type: e.action,
    category: e.action.split(".")[0],
    outcome: /failed|locked|reject|tampered|broken/.test(e.action) ? "failure" : "success",
    timestamp: e.at,
    product: "Stratum 4D Server",
    vendor: "Miqyas Labs",
    ...(role ? { target_role: role } : {}),
    stratum: { seq: e.seq, hash: e.hash, prev_hash: e.prevHash, target: e.target, detail: d },
  };
}

/** Batches audit entries to AiSOC; retries with back-off and keeps at most `max` waiting. */
export class AisocForwarder {
  private queue: AuditEntry[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private backoff = 0;
  private st: AisocStatus = { enabled: false, queued: 0, sent: 0, dropped: 0, lastSentAt: null, lastError: null, lastErrorAt: null };

  constructor(
    private settings: () => Promise<AisocSettings>,
    private o: { fetch?: typeof fetch; batch?: number; delayMs?: number; max?: number; host?: string } = {},
  ) {}

  status(): AisocStatus {
    return { ...this.st, queued: this.queue.length };
  }

  /** Called for every audit entry. */
  async offer(e: AuditEntry) {
    const s = await this.settings();
    this.st.enabled = s.enabled;
    if (!s.enabled || !s.ingestUrl || !s.token || !shouldForward(e.action, s.forward)) return;
    this.queue.push(e);
    const max = this.o.max ?? 5000;
    if (this.queue.length > max) {
      this.st.dropped += this.queue.length - max;
      this.queue.splice(0, this.queue.length - max);
    }
    this.schedule(severityOf(e) === "critical" || severityOf(e) === "high" ? 0 : (this.o.delayMs ?? 5000));
  }

  private schedule(ms: number) {
    if (this.timer || this.busy) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms + this.backoff);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** Sends what is waiting now. */
  async flush(): Promise<void> {
    if (this.busy || !this.queue.length) return;
    this.busy = true;
    try {
      const s = await this.settings();
      while (this.queue.length) {
        const batch = this.queue.slice(0, this.o.batch ?? 100);
        await send(s, batch.map((e) => toAisocEvent(e, this.o.host)), this.o.fetch);
        this.queue.splice(0, batch.length);
        this.st.sent += batch.length;
        this.st.lastSentAt = new Date().toISOString();
        this.backoff = 0;
      }
    } catch (err) {
      this.st.lastError = (err as Error).message;
      this.st.lastErrorAt = new Date().toISOString();
      this.backoff = Math.min(Math.max(this.backoff * 2, 5000), 300_000);
    } finally {
      this.busy = false;
      if (this.queue.length) this.schedule(0);
    }
  }
}

/** Posts events to AiSOC's ingest API. Throws with AiSOC's answer when it refuses them. */
export async function send(s: AisocSettings, events: unknown[], fetchImpl: typeof fetch = fetch) {
  if (!s.ingestUrl) throw new Error("Set the AiSOC ingest address first");
  if (!s.token) throw new Error("Set the AiSOC push token first");
  let r: Response;
  try {
    r = await fetchImpl(`${s.ingestUrl.replace(/\/+$/, "")}/v1/ingest/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.token}`, "X-Tenant-ID": s.tenantId || DEFAULT_AISOC.tenantId },
      body: JSON.stringify({ connector_id: s.connectorId || DEFAULT_AISOC.connectorId, connector_type: "stratum", source_format: "json", events }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(`Cannot reach AiSOC at ${s.ingestUrl}: ${(e as Error).message}`);
  }
  if (!r.ok) {
    const text = (await r.text().catch(() => "")).slice(0, 300);
    throw new Error(`AiSOC refused the events (HTTP ${r.status})${text ? `: ${text}` : ""}`);
  }
}
