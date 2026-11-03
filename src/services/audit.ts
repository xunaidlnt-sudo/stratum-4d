// Tamper-evident audit log for Stratum Server.
//
// Every entry stores the hash of the entry before it, so an entry that is
// changed, removed or put in a different order breaks the chain from that
// point. The hash is an HMAC keyed from STRATUM_SECRET: someone who can write
// to the database but does not know the secret cannot rebuild a valid chain
// after an edit. Database triggers refuse UPDATE on the log, and refuse DELETE
// of entries that a retention checkpoint does not cover.
//
// Retention: `truncate(days)` first writes a checkpoint (how many entries went,
// the hash of the last one removed, and the hash the oldest kept entry points
// to), then removes the old entries. Verification starts from the checkpoint,
// so a log that was shortened by retention still verifies, and the removal is
// a recorded fact rather than a gap.
//
// The idea follows the hash-chained audit log of AiSOC (MIT,
// https://github.com/beenuar/AiSOC); this is a separate implementation.

import crypto from "node:crypto";
import type { SqlDriver } from "./sql";

export interface AuditEntry {
  seq: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  ip: string;
  prevHash: string;
  hash: string;
}

export interface AuditCheckpoint {
  id: number;
  at: string;
  actor: string;
  /** Entries with seq <= cutSeq were removed. */
  cutSeq: number;
  removed: number;
  days: number;
  lastRemovedHash: string;
  firstKeptPrevHash: string;
}

export interface VerifyResult {
  ok: boolean;
  checked: number;
  /** First entry that does not verify. */
  brokenAt?: number;
  reason?: string;
  anchoredOn?: number;
  /**
   * The newest entry. A chain cannot show that entries were cut off its end,
   * so the server also writes the head to its own log (outside the database);
   * compare the two to detect that.
   */
  head?: { seq: number; hash: string };
}

export interface AuditInput {
  actor: string;
  action: string;
  target?: string;
  detail?: Record<string, unknown>;
  ip?: string;
}

const GENESIS = "genesis";

/** JSON with sorted keys, so the same entry always hashes the same. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

const SCHEMA = {
  sqlite: [
    `create table if not exists audit_log (
       seq integer primary key, at text not null, actor text not null, action text not null,
       target text not null, detail text not null, ip text not null, prev_hash text not null, hash text not null)`,
    `create table if not exists audit_checkpoints (
       id integer primary key autoincrement, at text not null, actor text not null, cut_seq integer not null,
       removed integer not null, days integer not null, last_removed_hash text not null, first_kept_prev_hash text not null)`,
    `create trigger if not exists audit_log_no_update before update on audit_log
       begin select raise(abort, 'The audit log is append-only'); end`,
    `create trigger if not exists audit_log_no_delete before delete on audit_log
       when old.seq > coalesce((select max(cut_seq) from audit_checkpoints), 0)
       begin select raise(abort, 'Audit entries are removed only by retention, after a checkpoint'); end`,
    `create trigger if not exists audit_checkpoints_no_change before update on audit_checkpoints
       begin select raise(abort, 'Audit checkpoints cannot be changed'); end`,
    `create trigger if not exists audit_checkpoints_no_delete before delete on audit_checkpoints
       begin select raise(abort, 'Audit checkpoints cannot be removed'); end`,
  ],
  postgres: [
    `create table if not exists audit_log (
       seq bigint primary key, at text not null, actor text not null, action text not null,
       target text not null, detail text not null, ip text not null, prev_hash text not null, hash text not null)`,
    `create table if not exists audit_checkpoints (
       id bigserial primary key, at text not null, actor text not null, cut_seq bigint not null,
       removed integer not null, days integer not null, last_removed_hash text not null, first_kept_prev_hash text not null)`,
    `create or replace function stratum_audit_guard() returns trigger language plpgsql as $$
     begin
       if tg_table_name = 'audit_checkpoints' then raise exception 'Audit checkpoints cannot be changed or removed'; end if;
       if tg_op = 'UPDATE' then raise exception 'The audit log is append-only'; end if;
       if old.seq > coalesce((select max(cut_seq) from audit_checkpoints), 0) then
         raise exception 'Audit entries are removed only by retention, after a checkpoint';
       end if;
       return old;
     end $$`,
    `drop trigger if exists audit_log_guard on audit_log`,
    `create trigger audit_log_guard before update or delete on audit_log for each row execute function stratum_audit_guard()`,
    `drop trigger if exists audit_checkpoints_guard on audit_checkpoints`,
    `create trigger audit_checkpoints_guard before update or delete on audit_checkpoints for each row execute function stratum_audit_guard()`,
  ],
};

export class AuditLog {
  private key: Buffer;
  /** Appends are serialised in this process; the primary key on seq refuses a fork from another process. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private db: SqlDriver,
    secret: string,
  ) {
    this.key = crypto.createHmac("sha256", secret).update("stratum-audit-v1").digest();
  }

  async migrate() {
    for (const sql of SCHEMA[this.db.dialect]) await this.db.exec(sql);
  }

  hashOf(e: Omit<AuditEntry, "hash">): string {
    const body = canonical({ seq: e.seq, at: e.at, actor: e.actor, action: e.action, target: e.target, detail: e.detail, ip: e.ip, prev: e.prevHash });
    return crypto.createHmac("sha256", this.key).update(body).digest("hex");
  }

  append(input: AuditInput): Promise<AuditEntry> {
    const run = async (): Promise<AuditEntry> => {
      for (let attempt = 0; ; attempt++) {
        const [last] = await this.db.query<{ seq: number | string; hash: string }>("select seq, hash from audit_log order by seq desc limit 1");
        const cp = last ? null : await this.lastCheckpoint();
        const seq = last ? Number(last.seq) + 1 : (cp?.cutSeq ?? 0) + 1;
        const prevHash = last ? last.hash : (cp?.lastRemovedHash ?? GENESIS);
        const e: Omit<AuditEntry, "hash"> = {
          seq,
          at: new Date().toISOString(),
          actor: input.actor || "unknown",
          action: input.action,
          target: input.target ?? "",
          detail: input.detail ?? {},
          ip: input.ip ?? "",
          prevHash,
        };
        const entry = { ...e, hash: this.hashOf(e) };
        try {
          await this.db.exec("insert into audit_log (seq, at, actor, action, target, detail, ip, prev_hash, hash) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
            entry.seq,
            entry.at,
            entry.actor,
            entry.action,
            entry.target,
            canonical(entry.detail),
            entry.ip,
            entry.prevHash,
            entry.hash,
          ]);
          return entry;
        } catch (err) {
          // Another server process took this seq: read the new tail and try again.
          if (attempt >= 4) throw err;
        }
      }
    };
    const p = this.tail.then(run, run);
    this.tail = p.catch(() => undefined);
    return p;
  }

  private row(r: Record<string, unknown>): AuditEntry {
    return {
      seq: Number(r.seq),
      at: String(r.at),
      actor: String(r.actor),
      action: String(r.action),
      target: String(r.target),
      detail: JSON.parse(String(r.detail)),
      ip: String(r.ip),
      prevHash: String(r.prev_hash),
      hash: String(r.hash),
    };
  }

  /** Newest first. `before` pages back from a seq; `action` filters by prefix (for example "login"). */
  async list(o: { limit?: number; before?: number; action?: string; actor?: string } = {}): Promise<AuditEntry[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (o.before) (where.push("seq < ?"), params.push(o.before));
    if (o.action) (where.push("action like ?"), params.push(`${o.action}%`));
    if (o.actor) (where.push("lower(actor) = lower(?)"), params.push(o.actor));
    params.push(Math.min(Math.max(o.limit ?? 100, 1), 1000));
    const rows = await this.db.query<Record<string, unknown>>(`select * from audit_log ${where.length ? `where ${where.join(" and ")}` : ""} order by seq desc limit ?`, params);
    return rows.map((r) => this.row(r));
  }

  async lastCheckpoint(): Promise<AuditCheckpoint | null> {
    const [r] = await this.db.query<Record<string, unknown>>("select * from audit_checkpoints order by id desc limit 1");
    return r
      ? {
          id: Number(r.id),
          at: String(r.at),
          actor: String(r.actor),
          cutSeq: Number(r.cut_seq),
          removed: Number(r.removed),
          days: Number(r.days),
          lastRemovedHash: String(r.last_removed_hash),
          firstKeptPrevHash: String(r.first_kept_prev_hash),
        }
      : null;
  }

  async checkpoints(): Promise<AuditCheckpoint[]> {
    const rows = await this.db.query<Record<string, unknown>>("select * from audit_checkpoints order by id desc");
    return rows.map((r) => ({
      id: Number(r.id),
      at: String(r.at),
      actor: String(r.actor),
      cutSeq: Number(r.cut_seq),
      removed: Number(r.removed),
      days: Number(r.days),
      lastRemovedHash: String(r.last_removed_hash),
      firstKeptPrevHash: String(r.first_kept_prev_hash),
    }));
  }

  /** Replays the whole log oldest first, from the genesis or the last checkpoint. */
  async verify(): Promise<VerifyResult> {
    const cp = await this.lastCheckpoint();
    if (cp && cp.lastRemovedHash !== cp.firstKeptPrevHash && cp.firstKeptPrevHash !== "") return { ok: false, checked: 0, reason: "The last retention checkpoint does not agree with itself", anchoredOn: cp.id };
    let prev = cp ? cp.lastRemovedHash : GENESIS;
    let expectSeq = (cp?.cutSeq ?? 0) + 1;
    let checked = 0;
    const page = 500;
    for (;;) {
      const rows = await this.db.query<Record<string, unknown>>("select * from audit_log where seq >= ? order by seq limit ?", [expectSeq, page]);
      for (const r of rows) {
        const e = this.row(r);
        if (e.seq !== expectSeq) return { ok: false, checked, brokenAt: expectSeq, reason: `Entry ${expectSeq} is missing`, anchoredOn: cp?.id };
        if (e.prevHash !== prev) return { ok: false, checked, brokenAt: e.seq, reason: `Entry ${e.seq} does not point to the entry before it`, anchoredOn: cp?.id };
        if (this.hashOf(e) !== e.hash) return { ok: false, checked, brokenAt: e.seq, reason: `Entry ${e.seq} was changed after it was written`, anchoredOn: cp?.id };
        prev = e.hash;
        expectSeq++;
        checked++;
      }
      if (rows.length < page) break;
    }
    return { ok: true, checked, anchoredOn: cp?.id, head: checked ? { seq: expectSeq - 1, hash: prev } : undefined };
  }

  /** Removes entries older than `days`, keeping the chain verifiable. Returns the checkpoint, or null when nothing was old enough. */
  async truncate(days: number, actor: string): Promise<AuditCheckpoint | null> {
    if (!Number.isFinite(days) || days < 30) throw new Error("Audit entries are kept for at least 30 days");
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const [last] = await this.db.query<{ seq: number | string; hash: string }>("select seq, hash from audit_log where at < ? order by seq desc limit 1", [cutoff]);
    if (!last) return null;
    const cutSeq = Number(last.seq);
    const [kept] = await this.db.query<{ prev_hash: string }>("select prev_hash from audit_log where seq > ? order by seq limit 1", [cutSeq]);
    const [n] = await this.db.query<{ n: number | string }>("select count(*) as n from audit_log where seq <= ?", [cutSeq]);
    // The checkpoint is written first: the trigger allows the delete only for entries it covers.
    await this.db.exec("insert into audit_checkpoints (at, actor, cut_seq, removed, days, last_removed_hash, first_kept_prev_hash) values (?, ?, ?, ?, ?, ?, ?)", [
      new Date().toISOString(),
      actor,
      cutSeq,
      Number(n?.n ?? 0),
      Math.round(days),
      last.hash,
      kept?.prev_hash ?? "",
    ]);
    await this.db.exec("delete from audit_log where seq <= ?", [cutSeq]);
    const cp = await this.lastCheckpoint();
    await this.append({ actor, action: "audit.retention", target: `entries 1-${cutSeq}`, detail: { removed: cp?.removed ?? 0, days: Math.round(days), checkpoint: cp?.id } });
    return cp;
  }
}

/** CSV of entries, for export to an auditor. */
export function auditCsv(entries: AuditEntry[]): string {
  const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = "seq,at,actor,action,target,ip,detail,prev_hash,hash";
  return [head, ...entries.map((e) => [String(e.seq), e.at, e.actor, e.action, e.target, e.ip, canonical(e.detail), e.prevHash, e.hash].map(q).join(","))].join("\n") + "\n";
}
