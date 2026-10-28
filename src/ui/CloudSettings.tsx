// Settings › Data › Cloud folder: use a Google Drive or OneDrive folder as the
// shared database. Everyone with edit access to the folder works on the same
// projects, from the browser, the desktop or a tablet.

import { useState } from "react";
import { cloudDrive, googleClientIdOf, isDesktop, msClientIdOf, useConfig } from "../backend/config";
import { isNativeApp } from "./files";
import { browserBackend } from "../backend/browser";
import type { CloudFolder } from "../backend/cloud/drive";
import { msRedirectUri } from "../backend/cloud/onedrive";
import { useStore } from "./store";

type Kind = "gdrive" | "onedrive";

export function CloudSettings() {
  const { config, backend, update } = useConfig();
  const connected = config.storage === "gdrive" || config.storage === "onedrive";
  const [kind, setKind] = useState<Kind>(config.storage === "onedrive" ? "onedrive" : "gdrive");
  const [gid, setGid] = useState(config.googleClientId ?? "");
  const [mid, setMid] = useState(config.msClientId ?? "");
  const desktop = isDesktop();
  const [gsecret, setGsecret] = useState(config.googleDesktopClientSecret ?? "");
  const [path, setPath] = useState<CloudFolder[]>([]);
  const [folders, setFolders] = useState<CloudFolder[] | null>(null);
  const [who, setWho] = useState<{ email: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // The desktop app signs in through the system browser with a "Desktop app" Google client.
  const ids = desktop ? { googleDesktopClientId: gid || config.googleDesktopClientId, googleDesktopClientSecret: gsecret || config.googleDesktopClientSecret } : { googleClientId: gid || config.googleClientId };
  const cfg = { ...config, ...ids, msClientId: mid || config.msClientId };
  const saveIds = () => (desktop ? { googleDesktopClientId: gid || undefined, googleDesktopClientSecret: gsecret || undefined } : { googleClientId: gid || undefined });
  const clientId = kind === "gdrive" ? googleClientIdOf(cfg) : msClientIdOf(cfg);
  const drive = () => cloudDrive(kind, cfg);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = (parent: CloudFolder | null, trail: CloudFolder[]) =>
    run(async () => {
      setFolders(await drive().folders(parent?.id ?? null));
      setPath(trail);
    });
  const signIn = () =>
    run(async () => {
      update({ ...saveIds(), msClientId: mid || undefined });
      const d = drive();
      await d.signIn();
      setWho(await d.account());
      setFolders(await d.folders(null));
      setPath([]);
    });
  const here = path[path.length - 1] ?? null;
  const useFolder = (f: CloudFolder) =>
    run(async () => {
      const acc = who ?? (await drive().account());
      update({ storage: kind, cloudFolder: { id: f.id, name: f.name }, user: { email: acc.email, name: acc.name, role: "planner" }, ...saveIds(), msClientId: mid || undefined });
      useStore.getState().setCurrentProject(null, null);
      setMsg(`Connected to ${kind === "gdrive" ? "Google Drive" : "OneDrive"} folder "${f.name}". Projects you commit are saved there.`);
    });
  const copyLocal = () =>
    run(async () => {
      const local = browserBackend();
      const list = await local.listProjects();
      let n = 0;
      for (const p of list) {
        const r = await local.getProject(p.id);
        if (r) {
          await backend.saveProject(p.id, r.project);
          n++;
        }
      }
      setMsg(`Copied ${n} project${n === 1 ? "" : "s"} from this browser to the cloud folder.`);
    });

  if (isNativeApp())
    return (
      <section className="stack">
        <h4>Google Drive / OneDrive folder</h4>
        <p className="muted">
          Google and Microsoft do not allow sign-in inside this Android app. For the shared cloud folder on a phone or tablet, open the Stratum website in Chrome and choose Install app (Add to Home screen): it runs full screen like this app and signs in normally. This app keeps its own database on this device.
        </p>
      </section>
    );

  if (connected)
    return (
      <section className="stack">
        <h4>Cloud folder</h4>
        <p>
          Using <b>{backend.label}</b>
          {config.user ? ` as ${config.user.email}` : ""}. Everyone with edit access to this folder sees the same projects, EPS and portfolios.
        </p>
        <div className="row">
          <button disabled={busy} onClick={copyLocal}>
            Copy this browser&apos;s projects to the folder
          </button>
          <button disabled={busy} onClick={() => update({ storage: "local", cloudFolder: null, user: null })}>
            Disconnect (use this browser)
          </button>
        </div>
        {msg && <p className="muted">{msg}</p>}
      </section>
    );

  return (
    <section className="stack">
      <h4>Use a Google Drive or OneDrive folder</h4>
      <p className="muted">Share one folder with your team (edit access) and everyone opens and saves the same projects from the website, the desktop app or a tablet. When two people change the same project, the second save is stopped and offered as a copy, so no one overwrites anyone. Set-up steps: docs/CLOUD_STORAGE.md.</p>
      <div className="seg">
        <button className={kind === "gdrive" ? "active" : ""} onClick={() => (setKind("gdrive"), setFolders(null), setWho(null))}>
          Google Drive
        </button>
        <button className={kind === "onedrive" ? "active" : ""} onClick={() => (setKind("onedrive"), setFolders(null), setWho(null))}>
          OneDrive
        </button>
      </div>
      {kind === "gdrive" ? (
        desktop ? (
          <>
            <label>
              Google OAuth client ID (type: Desktop app)
              <input value={gid || googleClientIdOf(config)} onChange={(e) => setGid(e.target.value.trim())} placeholder="1234567890-abc….apps.googleusercontent.com" />
            </label>
            <label>
              Client secret of that Desktop client
              <input value={gsecret || config.googleDesktopClientSecret || ""} onChange={(e) => setGsecret(e.target.value.trim())} placeholder="GOCSPX-…" />
            </label>
            <p className="muted small">Sign-in opens in your web browser. Google treats a Desktop client's secret as public; it only identifies the app.</p>
          </>
        ) : (
          <label>
            Google OAuth client ID
            <input value={gid || googleClientIdOf(config)} onChange={(e) => setGid(e.target.value.trim())} placeholder="1234567890-abc….apps.googleusercontent.com" />
          </label>
        )
      ) : (
        <>
          <label>
            Microsoft application (client) ID
            <input value={mid || msClientIdOf(config)} onChange={(e) => setMid(e.target.value.trim())} placeholder="00000000-0000-0000-0000-000000000000" />
          </label>
          <p className="muted small">{desktop ? "Redirect URI to register (Mobile and desktop applications): http://localhost — sign-in opens in your web browser." : `Redirect URI to register (Single-page application): ${msRedirectUri()}`}</p>
        </>
      )}
      <div className="row">
        <button className="primary" disabled={busy || !clientId} onClick={signIn}>
          Sign in to {kind === "gdrive" ? "Google" : "Microsoft"}
        </button>
        {who && <span className="muted">Signed in as {who.email}</span>}
      </div>
      {folders && (
        <div className="stack">
          <div className="row small" style={{ gap: 4 }}>
            <button className="link" onClick={() => open(null, [])}>
              Start
            </button>
            {path.map((f, i) => (
              <span key={f.id}>
                ›{" "}
                <button className="link" onClick={() => open(f, path.slice(0, i + 1))}>
                  {f.name}
                </button>
              </span>
            ))}
          </div>
          <div className="cloud-folders">
            {folders.map((f) => (
              <button key={f.id} onClick={() => open(f, [...path, f])}>
                📁 {f.name}
              </button>
            ))}
            {!folders.length && <span className="muted small">No sub-folders.</span>}
          </div>
          <div className="row">
            <button
              disabled={busy || !here || here.id.startsWith("~")}
              onClick={() => here && useFolder(here)}
              className="primary"
            >
              Use “{here?.name ?? "…"}” as the Stratum folder
            </button>
            <button
              disabled={busy || !here}
              onClick={() =>
                run(async () => {
                  const f = await drive().createFolder(here?.id ?? null, "Stratum 4D");
                  await useFolder(f);
                })
              }
            >
              Create “Stratum 4D” folder here and use it
            </button>
          </div>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
    </section>
  );
}
