# Connecting Stratum Server to AiSOC

[AiSOC](https://github.com/beenuar/AiSOC) is an open-source (MIT), self-hosted security operations center. Stratum Server sends its audit events to AiSOC, and admins open the AiSOC console from **Settings › AiSOC**. AiSOC is a separate project; Miqyas Labs is not affiliated with it.

## What Stratum sends

Each audit entry becomes one AiSOC event (`connector_type: "stratum"`), with severity, user, client address, host, outcome, time, and the entry's place in Stratum's hash chain (`stratum.seq`, `stratum.hash`), so an analyst can match an AiSOC alert to the Stratum audit log.

| Stratum event | Severity |
|---|---|
| Audit log does not verify; approval request changed after it was made | critical |
| Sign-in locked; a user made admin | high |
| Wrong password for an unknown account; user removed; security policy, P6 or mail settings changed; audit export or retention | medium |
| Wrong password; P6 push; rejected or failed approval; other user changes | low |
| Sign-ins, approvals, imports, server start | info |

*Security events* (default) sends sign-ins, users, approvals, P6, settings and the audit log itself. *Everything* adds project, dashboard and report changes.

Events go in batches within a few seconds (high and critical at once). If AiSOC cannot be reached, they wait (up to 5,000) and go again with back-off; the AiSOC tab shows how many wait and the last error.

## Set up

1. Install AiSOC on a server your security team controls:

   ```bash
   git clone https://github.com/beenuar/AiSOC && cd AiSOC
   make up        # prints the console address and the admin password
   make smoke     # optional: proves the pipeline works
   ```

   It needs Docker Compose v2 with 8 GB of memory and 20 GB of disk (see the AiSOC README).

2. Make a push token for Stratum: in the AiSOC console add a connector and click **Reveal push URL**, or run

   ```bash
   docker compose run --rm -T api python -m app.scripts.mint_ingest_token
   ```

3. In Stratum: **Settings › AiSOC**. Enter the console address (default port 3000), the ingest address (default port 8081), the push token and the tenant ID. Tick *Send Stratum audit events to AiSOC*, **Save**, then **Send a test event**.

4. **Open AiSOC console** opens AiSOC in a new tab. Sign in there with your AiSOC account.

The token is stored encrypted (AES-256-GCM with `STRATUM_SECRET`) and is not shown again. Changes to the AiSOC settings are in the audit log.

## Network

Stratum Server must reach AiSOC's ingest port, and the admin's browser must reach the console port. Use HTTPS between them when they are on different hosts.
