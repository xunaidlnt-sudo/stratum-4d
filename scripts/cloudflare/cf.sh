#!/usr/bin/env bash
# Small helpers for the Cloudflare API. Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
set -euo pipefail
API=https://api.cloudflare.com/client/v4
cf() { # cf METHOD PATH [JSON]
  local args=(-sS -X "$1" "$API$2" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H "Content-Type: application/json")
  if [ $# -ge 3 ]; then args+=(--data "$3"); fi
  curl "${args[@]}"
}
ok() { node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));process.exit(r.success?0:1)'; }
field() { node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));const v=eval("r."+process.argv[1]);console.log(v??"")' "$1"; }
errors() { node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log(JSON.stringify(r.errors||r))'; }
