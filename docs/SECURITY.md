# Security controls

This page describes how Stratum 4D protects project data, what each control does, and what it does not do. Several controls follow ideas from [AiSOC](https://github.com/beenuar/AiSOC) (MIT licence): a hash-chained audit log, human approval before an action reaches another system, and treating text from files as data rather than instructions. The code here is a separate implementation.

## Where data is kept

| Setup | Data | Who can open it |
|---|---|---|
| Desktop app | SQLite file on the user's computer | That user |
| Shared folder | The company's Google Drive or OneDrive folder | People with access to the folder |
| Stratum Server | PostgreSQL (or SQLite) on the company's server | Signed-in users, by role |
| Web demo | Sample projects for one browser session | The visitor |

Stored passwords for P6 and the mail server are encrypted: AES-256-GCM with a key from `STRATUM_SECRET` on the server, the operating system key store on the desktop.

## Stratum Server

### Audit log

Every sign-in (and failed sign-in), user and role change, project save and delete, dashboard and report change, settings change, security-policy change, P6 import and push, and approval decision is written to the `audit_log` table.

- **Chained.** Each entry contains the hash of the entry before it. The hash is an HMAC keyed from `STRATUM_SECRET`, so a person who can write to the database but does not know the secret cannot rebuild a valid chain after an edit.
- **Append-only in the database.** Triggers refuse `UPDATE` on the log, and refuse `DELETE` of any entry that a retention checkpoint does not cover. On PostgreSQL the guard is a `plpgsql` trigger; on SQLite, `raise(abort)` triggers.
- **Verified.** Settings › Security › *Verify the log* replays the chain and names the first entry that does not verify (changed, missing, or pointing to the wrong predecessor). The server verifies at start-up and once a day and writes the result, with the newest entry (the head), to its own log.
- **Tail cut-off.** A chain cannot show that entries were removed from its end. Compare the head in the server's log output (kept outside the database, for example by Docker or your log collector) with the head that *Verify* reports.
- **No secrets.** For settings changes the log records what changed (host, user, connection names) and whether a password changed, never the password.
- **Retention.** Settings › Security › *Keep audit entries* (at least 30 days, or always). Old entries are removed after a checkpoint is written that records how many went, the hash of the last one removed and the hash the oldest kept entry points to. Verification starts from the checkpoint, so a log shortened by retention still verifies, and the removal itself is in the log (`audit.retention`). Checkpoints cannot be changed or removed.
- **Export.** *Export CSV* gives the full log with hashes, for an auditor.

### Sign-in and sessions

- Passwords are stored as bcrypt hashes.
- **Lockout.** After 5 wrong passwords from one address for one account, that address is locked for 15 minutes; after 10 for one account from any address, the account is locked for 15 minutes. Lockouts are in the audit log. Behind a reverse proxy set `STRATUM_TRUST_PROXY=1`, so the server sees the client address.
- **Role from the database.** The role is read on every request, so a role change applies at once.
- **Sessions end on change.** A new password or a new role ends the user's other sessions. Deleting a user ends theirs.
- **Last admin.** The only admin cannot be demoted or deleted.
- Role changes take a reason, which goes into the audit log.

### Approval before a push to P6

Sending progress to Primavera P6 changes another system, so by default it needs an admin's approval (Settings › Security):

| Policy | Planner | Admin |
|---|---|---|
| Planners ask; an admin approves (default) | Request waits for approval | Sends at once |
| Two-person rule | Request waits | Request waits; another admin approves |
| No approval | Sends at once | Sends at once |

The request stores the exact schedule to send and its SHA-256. The approver sees a summary (project, activities, started, finished, data date) and approves exactly that content: if the stored request changes afterwards, it cannot be approved. A rejection needs a reason; the requester can withdraw their own request. Two people deciding at the same moment cannot both win.

### HTTP

API responses carry `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and HSTS over HTTPS. The API uses bearer tokens, never cookies.

## MCP server (AI assistants)

The MCP server runs on the user's computer. Its controls are in `mcp/guard.ts`:

- **Tool ledger.** Every tool call (tool, arguments, success, duration, result size) is appended to `~/.stratum/mcp-ledger.jsonl`, chained with an HMAC whose key is kept next to it (`mcp-ledger.jsonl.key`, readable only by the user). `node stratum-mcp.cjs --verify-ledger` checks it. `STRATUM_MCP_LEDGER` sets the file, `off` turns it off.
- **Read-only mode.** `STRATUM_MCP_READONLY=1` refuses `export` and `save_project`.
- **Folders.** `STRATUM_MCP_ROOTS` limits the files the server reads and writes to the given folders. Paths that leave them, with `..` or a link, are refused.
- **Text from files is data.** Activity names, codes and notes come from schedule files that other people wrote. The server tells the assistant to treat that text as data. When text in a result reads like an instruction to an assistant ("ignore previous instructions", role markers, requests to call a tool or send data somewhere), the result carries a note that names it, and the ledger records the flag.

These checks raise the cost of a planted instruction and make it visible; they do not make a language model immune to one. Keep the assistant's per-tool confirmation on for `export` and `save_project`.

## Website

miqyaslabs.com is served by Cloudflare over HTTPS with `nosniff`, `SAMEORIGIN`, a strict referrer policy and HSTS (`site/_headers`). The contact form has a hidden field and a minimum time on the page against bots, and stores enquiries in a private R2 bucket.

## Not yet

- Desktop installers are not code-signed.
- Single sign-on (SAML / OpenID Connect) for Stratum Server.
- Multi-factor sign-in.

## Report a problem

Use the contact form at <https://miqyaslabs.com/#contact> and mark it as a security report.
