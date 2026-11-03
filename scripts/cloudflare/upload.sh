#!/usr/bin/env bash
# Upload the release files in a folder to R2 under latest/ with fixed names, so the
# website links never change: Stratum-4D-win-x64.exe, Stratum-4D-mac-arm64.dmg, ...
# Usage: upload.sh <folder> <version>
set -euo pipefail
DIR=$1
VER=$2
BUCKET=miqyas-downloads
W="npx --yes wrangler@3.99.0"
put() { $W r2 object put "$BUCKET/latest/$2" --file "$1" --remote --content-type "$3" >/dev/null && echo "uploaded latest/$2"; }
shopt -s nullglob
for f in "$DIR"/*; do
  b=$(basename "$f")
  case "$b" in
    *win-x64.exe) put "$f" Stratum-4D-win-x64.exe application/vnd.microsoft.portable-executable ;;
    *mac-arm64.dmg) put "$f" Stratum-4D-mac-arm64.dmg application/x-apple-diskimage ;;
    *mac-x64.dmg) put "$f" Stratum-4D-mac-x64.dmg application/x-apple-diskimage ;;
    *.AppImage) put "$f" Stratum-4D-linux-x86_64.AppImage application/octet-stream ;;
    *.deb) put "$f" Stratum-4D-linux-amd64.deb application/vnd.debian.binary-package ;;
    *android.apk) put "$f" Stratum-4D-android.apk application/vnd.android.package-archive ;;
    *mcp.zip) put "$f" Stratum-4D-mcp.zip application/zip ;;
  esac
done
printf '{"version":"%s","date":"%s"}\n' "$VER" "$(date -u +%F)" > /tmp/latest.json
put /tmp/latest.json latest.json application/json
