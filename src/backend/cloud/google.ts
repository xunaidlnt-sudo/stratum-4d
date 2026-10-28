// Google Drive through the Drive v3 REST API, signed in with Google Identity
// Services (a popup; the token lasts an hour and is renewed on demand).

import { PreconditionFailed, type CloudDrive, type CloudFile, type CloudFolder } from "./drive";

const SCOPE = "https://www.googleapis.com/auth/drive openid email profile";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER = "application/vnd.google-apps.folder";

interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
  callback: (r: { access_token?: string; expires_in?: number; error?: string }) => void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(o: { client_id: string; scope: string; callback: TokenClient["callback"] }): TokenClient } } };
  }
}

let scriptLoad: Promise<void> | null = null;
const loadScript = () =>
  (scriptLoad ??= new Promise<void>((resolve, reject) => {
    if (window.google?.accounts) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check the internet connection."));
    document.head.appendChild(s);
  }));

const TOKEN_KEY = "stratum.gdrive.token";

export function googleDrive(clientId: string): CloudDrive & { signIn(): Promise<void>; signedIn(): boolean } {
  let token: { value: string; until: number } | null = null;
  try {
    const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
    if (t && t.until > Date.now() + 60_000) token = t;
  } catch {
    /* none */
  }
  let client: TokenClient | null = null;
  const getToken = async (prompt?: string): Promise<string> => {
    if (token && token.until > Date.now() + 60_000 && prompt === undefined) return token.value;
    if (!clientId) throw new Error("No Google client ID. Add it in Settings › Data (see docs/CLOUD_STORAGE.md).");
    await loadScript();
    return new Promise<string>((resolve, reject) => {
      client ??= window.google!.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: () => {} });
      client.callback = (r) => {
        if (!r.access_token) return reject(new Error(r.error ? `Google sign-in: ${r.error}` : "Google sign-in was cancelled."));
        token = { value: r.access_token, until: Date.now() + (r.expires_in ?? 3600) * 1000 };
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
        } catch {
          /* ignore */
        }
        resolve(r.access_token);
      };
      client.requestAccessToken({ prompt: prompt ?? "" });
    });
  };
  const call = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const r = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await getToken()}` } });
    if (r.status === 401) {
      token = null;
      const again = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${await getToken()}` } });
      if (!again.ok) throw new Error(`Google Drive: ${again.status} ${await again.text()}`);
      return again;
    }
    if (!r.ok) throw new Error(`Google Drive: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r;
  };
  const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const meta = (f: { id: string; name: string; version?: string }): CloudFile => ({ id: f.id, name: f.name, etag: String(f.version ?? "") });
  const common = "supportsAllDrives=true&includeItemsFromAllDrives=true";

  const drive: CloudDrive & { signIn(): Promise<void>; signedIn(): boolean } = {
    provider: "gdrive",
    label: "Google Drive",
    signedIn: () => !!token && token.until > Date.now(),
    async signIn() {
      await getToken("consent");
    },
    async account() {
      const r = await (await call(`${API}/about?fields=user`)).json();
      return { email: r.user?.emailAddress ?? "", name: r.user?.displayName ?? "" };
    },
    async list(folderId) {
      const out: CloudFile[] = [];
      let page = "";
      do {
        const r = await (await call(`${API}/files?q=${encodeURIComponent(`'${q(folderId)}' in parents and trashed=false and mimeType!='${FOLDER}'`)}&fields=nextPageToken,files(id,name,version)&pageSize=1000&${common}${page ? `&pageToken=${page}` : ""}`)).json();
        out.push(...(r.files ?? []).map(meta));
        page = r.nextPageToken ?? "";
      } while (page);
      return out;
    },
    async find(folderId, name) {
      const r = await (await call(`${API}/files?q=${encodeURIComponent(`'${q(folderId)}' in parents and name='${q(name)}' and trashed=false`)}&fields=files(id,name,version)&${common}`)).json();
      return r.files?.[0] ? meta(r.files[0]) : null;
    },
    async read(f) {
      return (await call(`${API}/files/${f.id}?alt=media&supportsAllDrives=true`)).text();
    },
    async write(folderId, name, text, opts) {
      const existing = opts?.existing === undefined ? await drive.find(folderId, name) : opts.existing;
      if (opts?.ifMatch !== undefined) {
        // Drive v3 has no conditional write: compare the version just before writing.
        const now = existing ? await drive.find(folderId, name) : null;
        if (existing && (!now || now.etag !== opts.ifMatch)) throw new PreconditionFailed("changed");
        if (!existing && now) throw new PreconditionFailed("created meanwhile");
      }
      if (existing) {
        const r = await (await call(`${UPLOAD}/files/${existing.id}?uploadType=media&fields=id,name,version&supportsAllDrives=true`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: text })).json();
        return meta(r);
      }
      const boundary = `stratum${Date.now()}`;
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [folderId], mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${boundary}--`;
      const r = await (await call(`${UPLOAD}/files?uploadType=multipart&fields=id,name,version&supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body })).json();
      return meta(r);
    },
    async remove(f) {
      await call(`${API}/files/${f.id}?supportsAllDrives=true`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
    },
    async folders(parent) {
      if (parent === null)
        return [
          { id: "root", name: "My Drive" },
          { id: "~shared", name: "Shared with me" },
        ];
      const where = parent === "~shared" ? "sharedWithMe and" : `'${q(parent)}' in parents and`;
      const r = await (await call(`${API}/files?q=${encodeURIComponent(`${where} mimeType='${FOLDER}' and trashed=false`)}&fields=files(id,name)&orderBy=name&pageSize=500&${common}`)).json();
      return (r.files ?? []).map((f: CloudFolder) => ({ id: f.id, name: f.name }));
    },
    async createFolder(parent, name) {
      const r = await (await call(`${API}/files?fields=id,name&supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent && parent !== "~shared" ? parent : "root"] }) })).json();
      return { id: r.id, name: r.name };
    },
  };
  return drive;
}
