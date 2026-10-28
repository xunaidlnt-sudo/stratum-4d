// Cloud-folder sign-in for the desktop app. Google and Microsoft block sign-in
// inside embedded app windows, so this uses the system browser with OAuth 2.0
// authorization code + PKCE and a one-off loopback redirect
// (http://127.0.0.1:<port>/ for Google, http://localhost:<port>/ for Microsoft).
// The refresh token is kept in the user's profile, encrypted with the OS key
// store (safeStorage); without one it lasts until the app closes.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { app, shell, safeStorage } = require("electron");

const PROVIDERS = {
  gdrive: {
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/drive openid email profile",
    host: "127.0.0.1",
    extra: { access_type: "offline", prompt: "consent" },
    scopeOnToken: false,
  },
  onedrive: {
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "Files.ReadWrite.All User.Read offline_access",
    host: "localhost",
    extra: { prompt: "select_account" },
    scopeOnToken: true,
  },
};

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const storeFile = () => path.join(app.getPath("userData"), "cloud-signin.json");
const memory = new Map();

function readStore() {
  try {
    return JSON.parse(fs.readFileSync(storeFile(), "utf8"));
  } catch {
    return {};
  }
}
function saveRefresh(key, token) {
  if (!token) return;
  memory.set(key, token);
  if (!safeStorage.isEncryptionAvailable()) return;
  const s = readStore();
  s[key] = safeStorage.encryptString(token).toString("base64");
  fs.writeFileSync(storeFile(), JSON.stringify(s));
}
function loadRefresh(key) {
  if (memory.has(key)) return memory.get(key);
  const v = readStore()[key];
  if (!v || !safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(v, "base64"));
  } catch {
    return null;
  }
}
function forget(key) {
  memory.delete(key);
  const s = readStore();
  if (s[key]) {
    delete s[key];
    fs.writeFileSync(storeFile(), JSON.stringify(s));
  }
}

async function postForm(url, form) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(form).toString() });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || `Sign-in failed (${r.status})`);
  return j;
}

const PAGE = (msg) =>
  `<!doctype html><meta charset="utf-8"><title>Stratum 4D</title><body style="font:15px system-ui;margin:60px auto;max-width:480px;color:#1d2733"><h2>Stratum 4D</h2><p>${msg}</p><p>You can close this tab and return to Stratum.</p></body>`;

/** Open the system browser, wait for the redirect, exchange the code. */
function signIn({ provider, clientId, clientSecret }) {
  const p = PROVIDERS[provider];
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  return new Promise((resolve, reject) => {
    let done = false;
    const server = http.createServer(async (req, res) => {
      const u = new URL(req.url, `http://${p.host}`);
      if (u.pathname !== "/" || (!u.searchParams.has("code") && !u.searchParams.has("error"))) {
        res.writeHead(404).end();
        return;
      }
      const finish = (ok, msg, value) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE(msg));
        if (done) return;
        done = true;
        clearTimeout(timer);
        server.close();
        ok ? resolve(value) : reject(new Error(msg));
      };
      if (u.searchParams.get("state") !== state) return finish(false, "Sign-in was refused: the response did not match the request.");
      if (u.searchParams.has("error")) return finish(false, `Sign-in was cancelled (${u.searchParams.get("error")}).`);
      try {
        const port = server.address().port;
        const t = await postForm(p.token, {
          client_id: clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          code: u.searchParams.get("code"),
          code_verifier: verifier,
          redirect_uri: `http://${p.host}:${port}/`,
          grant_type: "authorization_code",
          ...(p.scopeOnToken ? { scope: p.scope } : {}),
        });
        saveRefresh(`${provider}|${clientId}`, t.refresh_token);
        finish(true, "Signed in.", { access_token: t.access_token, expires_in: t.expires_in });
      } catch (e) {
        finish(false, e.message);
      }
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      server.close();
      reject(new Error("Sign-in timed out. Try again."));
    }, 5 * 60_000);
    server.on("error", (e) => !done && ((done = true), clearTimeout(timer), reject(e)));
    server.listen(0, p.host, () => {
      const port = server.address().port;
      const q = new URLSearchParams({ client_id: clientId, redirect_uri: `http://${p.host}:${port}/`, response_type: "code", scope: p.scope, code_challenge: challenge, code_challenge_method: "S256", state, ...p.extra });
      shell.openExternal(`${p.auth}?${q}`);
    });
  });
}

/** A fresh access token from the saved refresh token, or null when the user must sign in. */
async function token({ provider, clientId, clientSecret }) {
  const p = PROVIDERS[provider];
  const key = `${provider}|${clientId}`;
  const refresh = loadRefresh(key);
  if (!refresh) return null;
  try {
    const t = await postForm(p.token, { client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), refresh_token: refresh, grant_type: "refresh_token", ...(p.scopeOnToken ? { scope: p.scope } : {}) });
    if (t.refresh_token) saveRefresh(key, t.refresh_token);
    return { access_token: t.access_token, expires_in: t.expires_in };
  } catch {
    forget(key);
    return null;
  }
}

/** IPC entry point: ("signIn" | "token" | "signOut", { provider, clientId, clientSecret? }). */
async function handle(op, args) {
  const a = args || {};
  if (!PROVIDERS[a.provider] || typeof a.clientId !== "string" || !a.clientId) throw new Error("Unknown cloud provider or missing client ID.");
  if (op === "signIn") return signIn(a);
  if (op === "token") return token(a);
  if (op === "signOut") return forget(`${a.provider}|${a.clientId}`);
  throw new Error("Unknown sign-in request.");
}

module.exports = { handle };
