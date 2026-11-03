// Point the website's download buttons at our own files instead of GitHub Releases,
// one direct link per platform. Usage: links.cjs <index.html> <prefix>, where the
// prefix is "/downloads" (served by the site) or the bucket's ".../latest" address.
const fs = require("fs");
const file = process.argv[2];
const base = process.argv[3] || "/downloads";
const gh = "https://github.com/xunaidlnt-sudo/stratum-4d/releases/latest";
const map = [
  ["Windows", `${base}/Stratum-4D-win-x64.exe`],
  ["macOS", `${base}/Stratum-4D-mac-arm64.dmg`],
  ["Linux", `${base}/Stratum-4D-linux-x86_64.AppImage`],
  ["Android", `${base}/Stratum-4D-android.apk`],
];
let html = fs.readFileSync(file, "utf8");
for (const [label, url] of map) html = html.replace(`<a href="${gh}"><b>${label}</b>`, `<a href="${url}"><b>${label}</b>`);
html = html.replace("Installers for each release are on GitHub.", `Installers for the latest release${base === "/downloads" ? ' (<a href="/downloads/">all downloads</a>)' : ""}. Also: <a href="${base}/Stratum-4D-mac-x64.dmg">macOS Intel</a> · <a href="${base}/Stratum-4D-linux-amd64.deb">Linux .deb</a> · <a href="${base}/Stratum-4D-mcp.zip">AI assistant (MCP) server</a>.`);
fs.writeFileSync(file, html);
console.log(`Download links on ${base}`);
