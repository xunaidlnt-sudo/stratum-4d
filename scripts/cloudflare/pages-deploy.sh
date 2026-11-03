#!/usr/bin/env bash
# Deploy public_site to Cloudflare Pages, with the demo's session store:
# the Pages Function in functions/ and a D1 database bound as DB.
# If the database cannot be made (the token needs D1 Edit), the site is still
# deployed; the demo then keeps each session in the visitor's browser.
set -euo pipefail
W="npx --yes wrangler@3.99.0"
PROJECT=miqyaslabs
DBNAME=stratum-demo

$W pages project create "$PROJECT" --production-branch main >/dev/null 2>&1 || true
$W d1 create "$DBNAME" >/dev/null 2>&1 || true
DBID=$($W d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);const d=l.find(x=>x.name===process.argv[1]);console.log(d?d.uuid:"")}catch{console.log("")}})' "$DBNAME" || true)

{
  echo "name = \"$PROJECT\""
  echo 'pages_build_output_dir = "public_site"'
  echo 'compatibility_date = "2024-09-23"'
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
