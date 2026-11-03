#!/usr/bin/env bash
# Deploy the site to Cloudflare Pages with its functions:
#   functions/api/demo   the demo's per-session store, D1 database bound as DB
#   functions/downloads  the installers at miqyaslabs.com/downloads, R2 bucket bound as DOWNLOADS
# If the database cannot be made (the token needs D1 Edit), the site is still
# deployed; the demo then keeps each session in the visitor's browser.
# Usage: pages-deploy.sh [site folder, default public_site]
set -euo pipefail
OUT=${1:-public_site}
W="npx --yes wrangler@3.99.0"
PROJECT=miqyaslabs
DBNAME=stratum-demo
BUCKET=miqyas-downloads

$W pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true
$W d1 create "$DBNAME" >/dev/null 2>&1 || true
DBID=$($W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);const d=l.find(x=>x.name===process.argv[1]);console.log(d?d.uuid:"")}catch{console.log("")}})' "$DBNAME" || true)

{
  echo "name = \"$PROJECT\""
  echo "pages_build_output_dir = \"$OUT\""
  echo 'compatibility_date = "2024-09-23"'
  echo ''
  echo '[[r2_buckets]]'
  echo 'binding = "DOWNLOADS"'
  echo "bucket_name = \"$BUCKET\""
  if [ -n "$DBID" ]; then
    echo ''
    echo '[[d1_databases]]'
    echo 'binding = "DB"'
    echo "database_name = \"$DBNAME\""
    echo "database_id = \"$DBID\""
  fi
} > wrangler.toml
if [ -n "$DBID" ]; then echo "Demo database: $DBNAME ($DBID)"; else echo "NOTE: no D1 database (token needs Account > D1 > Edit); the demo keeps sessions in the browser."; fi
$W pages deploy --branch main --commit-dirty=true
