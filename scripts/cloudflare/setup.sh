#!/usr/bin/env bash
# One-time move of miqyaslabs.com from GitHub Pages to Cloudflare, so company
# firewalls that block GitHub can open the site and the downloads.
#  1. R2 bucket for the installers, public at downloads.miqyaslabs.com
#  2. Cloudflare Pages project "miqyaslabs" with the domain and www attached
#  3. DNS: the apex and www point at the Pages project (proxied), the GitHub A records go
# Safe to run again: each step checks what is already there.
set -euo pipefail
source "$(dirname "$0")/cf.sh"
DOMAIN=miqyaslabs.com
PROJECT=miqyaslabs
BUCKET=miqyas-downloads
DL=downloads.$DOMAIN
ACC=$CLOUDFLARE_ACCOUNT_ID

echo "== Token"
# User tokens and account-owned tokens (cfat_...) are checked at different addresses.
cf GET "/accounts/$ACC/tokens/verify" | ok || cf GET /user/tokens/verify | ok || { echo "The API token is not valid for account $ACC."; exit 1; }
zr=$(cf GET "/zones?name=$DOMAIN&account.id=$ACC")
ZONE=$(echo "$zr" | field 'result[0].id')
[ -n "$ZONE" ] || { zr=$(cf GET "/zones?name=$DOMAIN"); ZONE=$(echo "$zr" | field 'result[0].id'); }
ZONE=${ZONE:-${CF_ZONE_ID:-}}
if [ -z "$ZONE" ]; then
  echo "NOTE: the token cannot read the zone $DOMAIN (Zone > Zone > Read, Zone > DNS > Edit)."
  echo "      Pages and the download bucket are set up anyway; the DNS step is skipped."
fi
echo "zone $ZONE"

echo "== R2 bucket $BUCKET"
r=$(cf POST "/accounts/$ACC/r2/buckets" "{\"name\":\"$BUCKET\"}")
echo "$r" | ok && echo "created" || echo "exists or not created: $(echo "$r" | errors)"
[ -n "$ZONE" ] && r=$(cf POST "/accounts/$ACC/r2/buckets/$BUCKET/domains/custom" "{\"domain\":\"$DL\",\"zoneId\":\"$ZONE\",\"enabled\":true,\"minTLS\":\"1.2\"}")
if [ -n "$ZONE" ]; then echo "$r" | ok && echo "domain $DL attached" || echo "domain: $(echo "$r" | errors)"; fi
# Without the custom domain the bucket can still be public on its r2.dev address.
r=$(cf PUT "/accounts/$ACC/r2/buckets/$BUCKET/domains/managed" '{"enabled":true}')
R2DEV=$(echo "$r" | field 'result.domain')
[ -n "$R2DEV" ] && echo "public r2.dev address: https://$R2DEV" && echo "$R2DEV" > /tmp/r2dev || echo "r2.dev: $(echo "$r" | errors)"

echo "== Pages project $PROJECT"
r=$(cf GET "/accounts/$ACC/pages/projects/$PROJECT")
if ! echo "$r" | ok; then
  r=$(cf POST "/accounts/$ACC/pages/projects" "{\"name\":\"$PROJECT\",\"production_branch\":\"main\"}")
  echo "$r" | ok && echo "created" || { echo "Could not create the Pages project: $(echo "$r" | errors)"; exit 1; }
else echo "exists"; fi
SUB=$(cf GET "/accounts/$ACC/pages/projects/$PROJECT" | field 'result.subdomain')
echo "pages host $SUB"

echo "== First deploy (so the site is there before DNS moves)"
if [ -d public_site ]; then cp -r public_site public_cf && node "$(dirname "$0")/links.cjs" public_cf/index.html /downloads && bash "$(dirname "$0")/pages-deploy.sh" public_cf; fi

echo "== Attach $DOMAIN and www"
for d in "$DOMAIN" "www.$DOMAIN"; do
  r=$(cf POST "/accounts/$ACC/pages/projects/$PROJECT/domains" "{\"name\":\"$d\"}")
  echo "$r" | ok && echo "$d attached" || echo "$d: $(echo "$r" | errors)"
done

echo "== DNS"
[ -n "$ZONE" ] && for name in "$DOMAIN" "www.$DOMAIN"; do
  recs=$(cf GET "/zones/$ZONE/dns_records?name=$name&per_page=100")
  # Remove the GitHub Pages records (A / AAAA, and a CNAME that is not the Pages host).
  for id in $(echo "$recs" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8"));for(const x of r.result||[]) if(["A","AAAA"].includes(x.type)||(x.type==="CNAME"&&x.content!==process.argv[1])) console.log(x.id)' "$SUB"); do
    cf DELETE "/zones/$ZONE/dns_records/$id" | ok && echo "removed old record on $name"
  done
  have=$(cf GET "/zones/$ZONE/dns_records?name=$name&type=CNAME" | field 'result[0].id')
  if [ -z "$have" ]; then
    r=$(cf POST "/zones/$ZONE/dns_records" "{\"type\":\"CNAME\",\"name\":\"$name\",\"content\":\"$SUB\",\"proxied\":true,\"comment\":\"Cloudflare Pages\"}")
    echo "$r" | ok && echo "$name → $SUB (proxied)" || echo "DNS $name: $(echo "$r" | errors)"
  else
    cf PATCH "/zones/$ZONE/dns_records/$have" "{\"proxied\":true}" >/dev/null && echo "$name already points at $SUB"
  fi
done

echo "== HTTPS"
[ -n "$ZONE" ] && cf PATCH "/zones/$ZONE/settings/always_use_https" '{"value":"on"}' | ok && echo "Always Use HTTPS on" || echo "(Always Use HTTPS not changed: token needs Zone Settings Edit; optional)"
[ -n "$ZONE" ] || echo "To finish: in DNS, replace the 4 A records and the www CNAME with CNAME miqyaslabs.com → $SUB and CNAME www → $SUB (Proxied), and add a custom domain $DL to the R2 bucket $BUCKET."
echo "Done. Cloudflare checks the domains for a few minutes; then https://$DOMAIN and https://$DL work without GitHub."
