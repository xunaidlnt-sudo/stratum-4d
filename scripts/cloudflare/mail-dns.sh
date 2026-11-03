#!/usr/bin/env bash
# DNS for Zoho Mail on miqyaslabs.com: domain verification, MX, SPF, DKIM, DMARC,
# and mail.miqyaslabs.com as the webmail address. Safe to run again.
# Env: ZOHO_REGION (com | eu | in | com.au | jp | sa | ae), ZOHO_VERIFY (zb... code), DKIM_SELECTOR, DKIM_VALUE (optional, later)
set -euo pipefail
source "$(dirname "$0")/cf.sh"
DOMAIN=miqyaslabs.com
R=${ZOHO_REGION:-com}
ZONE=$(cf GET "/zones?name=$DOMAIN&account.id=$CLOUDFLARE_ACCOUNT_ID" | field 'result[0].id')
[ -n "$ZONE" ] || { echo "Zone $DOMAIN not found"; exit 1; }

# Put one record, replacing an older record of the same type and name (and, for TXT, the same kind).
put() { # type name content [priority] [match]
  local type=$1 name=$2 content=$3 prio=${4:-} match=${5:-}
  local recs ids body
  recs=$(cf GET "/zones/$ZONE/dns_records?type=$type&name=$name&per_page=100")
  ids=$(echo "$recs" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));const m=process.argv[1];for(const x of r.result||[]) if(!m||x.content.replace(/^"|"$/g,"").startsWith(m)) console.log(x.id)' "$match")
  for id in $ids; do cf DELETE "/zones/$ZONE/dns_records/$id" >/dev/null; done
  body=$(node -e 'const [t,n,c,p]=process.argv.slice(1);const b={type:t,name:n,content:c,ttl:1,proxied:false,comment:"Zoho Mail"};if(p)b.priority=+p;console.log(JSON.stringify(b))' "$type" "$name" "$content" "$prio")
  cf POST "/zones/$ZONE/dns_records" "$body" | ok && echo "  $type $name → $content${prio:+ (priority $prio)}" || echo "  FAILED: $type $name"
}

echo "== Cloudflare Email Routing records (if any) are replaced by Zoho's"
for id in $(cf GET "/zones/$ZONE/dns_records?type=MX&name=$DOMAIN" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const x of r.result||[]) if(!/zoho/.test(x.content)) console.log(x.id)'); do cf DELETE "/zones/$ZONE/dns_records/$id" >/dev/null && echo "  removed old MX"; done

[ -n "${ZOHO_VERIFY:-}" ] && { echo "== Verification"; put TXT "$DOMAIN" "$ZOHO_VERIFY" "" "zoho-verification"; }
echo "== MX"
put MX "$DOMAIN" "mx.zoho.$R" 10
cf GET "/zones/$ZONE/dns_records?type=MX&name=$DOMAIN" >/dev/null
for p in "mx2.zoho.$R 20" "mx3.zoho.$R 50"; do
  set -- $p
  body=$(node -e 'console.log(JSON.stringify({type:"MX",name:process.argv[1],content:process.argv[2],priority:+process.argv[3],ttl:1,comment:"Zoho Mail"}))' "$DOMAIN" "$1" "$2")
  cf POST "/zones/$ZONE/dns_records" "$body" | ok && echo "  MX $DOMAIN → $1 (priority $2)" || echo "  MX $1 exists"
done
echo "== SPF"
put TXT "$DOMAIN" "v=spf1 include:zoho.$R ~all" "" "v=spf1"
echo "== DMARC (report only, to start)"
put TXT "_dmarc.$DOMAIN" "v=DMARC1; p=none; sp=none; adkim=r; aspf=r" "" "v=DMARC1"
if [ -n "${DKIM_SELECTOR:-}" ] && [ -n "${DKIM_VALUE:-}" ]; then
  echo "== DKIM"
  put TXT "$DKIM_SELECTOR._domainkey.$DOMAIN" "$DKIM_VALUE"
fi
echo "== Webmail at mail.$DOMAIN"
put CNAME "mail.$DOMAIN" "business.zoho.$R"
echo "Done. In Zoho: Verify the domain, then Admin Console > Domains > MX / SPF / DKIM > Verify."
