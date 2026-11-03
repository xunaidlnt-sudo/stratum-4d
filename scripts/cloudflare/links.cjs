// Point the website's download buttons at downloads.miqyaslabs.com (Cloudflare R2)
// instead of GitHub Releases, one direct link per platform.
const fs = require("fs");
const file = process.argv[2];
const base = "https://downloads.miqyaslabs.com/latest";
const gh = "https://github.com/xunaidlnt-sudo/stratum-4d/releases/latest";
const map = [
  ["Windows", `${base}/Stratum-4D-win-x64.exe`],
  ["macOS", `${base}/Stratum-4D-mac-arm64.dmg`],
  ["Linux", `${base}/Stratum-4D-linux-x86_64.AppImage`],
  ["Android", `${base}/Stratum-4D-android.apk`],
];
let html = fs.readFileSync(file, "utf8");
for (const [label, url] of map) html = html.replace(`<a href="${gh}"><b>${label}</b>`, `<a href="${url}"><b>${label}</b>`);
html = html.replace("Installers for each release are on GitHub.", `Installers for the latest release. Also: <a href="${base}/Stratum-4D-mac-x64.dmg">macOS Intel</a> · <a href="${base}/Stratum-4D-linux-amd64.deb">Linux .deb</a> · <a href="${base}/Stratum-4D-mcp.zip">AI assistant (MCP) server</a>.`);
fs.writeFileSync(file, html);
console.log(`Download links: ${(html.match(/downloads\.miqyaslabs\.com/g) || []).length} on ${base}`);
