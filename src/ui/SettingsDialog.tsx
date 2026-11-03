import { X } from "lucide-react";
import { CloudSettings } from "./CloudSettings";
import { useEffect, useState } from "react";
import { isDesktop, useConfig } from "../backend/config";
import { serverLogin, serverStatus, type AisocConfig, type Approval, type AuditEntry, type AuditVerify, type SecurityPolicy, type serverBackend } from "../backend/server";
import type { CheckStep, P6Diagnosis, SessionUser } from "../backend/types";
import { uid, type InterfaceMode, type P6Connection, type P6ConnectionKind, type SmtpSettings } from "../core/reporting";
import { FONTS } from "./appearance";
import { MODE_INFO } from "./terms";

type Tab = "interface" | "data" | "p6" | "email" | "users" | "security" | "aisoc";

export function SettingsDialog({ initialTab = "interface", onClose }: { initialTab?: Tab; onClose: () => void }) {
  const { backend } = useConfig();
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabs: [Tab, string][] = [
    ["interface", "Interface"],
    ["data", "Data & sign-in"],
    ["p6", "Primavera P6"],
    ["email", "Email"],
    ...(backend.kind === "server" && backend.user?.role === "admin"
      ? ([
          ["users", "Users"],
          ["security", "Security"],
          ["aisoc", "AiSOC"],
        ] as [Tab, string][])
      : []),
  ];
  return (
    <div className="help-backdrop" onClick={onClose}>
      <div className="help settings" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <div className="settings-head">
          <h2>Settings</h2>
          <button className="tb icon-only" onClick={onClose} title="Close" aria-label="Close">
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="tabs">
          {tabs.map(([t, l]) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {l}
            </button>
          ))}
        </div>
        <div className="settings-body">
          {tab === "interface" && <InterfaceTab />}
          {tab === "data" && <DataTab />}
          {tab === "p6" && <P6Tab />}
          {tab === "email" && <EmailTab />}
          {tab === "users" && <UsersTab />}
          {tab === "security" && <SecurityTab />}
          {tab === "aisoc" && <AisocTab />}
        </div>
      </div>
    </div>
  );
}

function InterfaceTab() {
  const { config, update } = useConfig();
  const seg = <T extends string>(value: T, opts: [T, string][], set: (v: T) => void) => (
    <div className="seg">
      {opts.map(([v, l]) => (
        <button key={v} className={value === v ? "active" : ""} onClick={() => set(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  return (
    <div className="stack">
      <h4>Layout</h4>
      <p className="muted">Same data and engine in every layout; only the arrangement, wording and default columns change. You can also switch from the top bar or with Ctrl+Alt+1/2/3.</p>
      <div className="mode-cards">
        {(Object.keys(MODE_INFO) as InterfaceMode[]).map((m) => (
          <button key={m} className={`mode-card ${config.mode === m ? "active" : ""}`} onClick={() => update({ mode: m })}>
            <b>{MODE_INFO[m].title}</b>
            <span className="muted">{MODE_INFO[m].blurb}</span>
          </button>
        ))}
      </div>

      <h4>Font</h4>
      <div className="font-list" role="radiogroup" aria-label="Font">
        {FONTS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={config.font === f.id}
            className={`font-card ${config.font === f.id ? "active" : ""}`}
            style={{ fontFamily: f.stack, fontFeatureSettings: f.features }}
            onClick={() => update({ font: f.id })}
          >
            <span className="font-name">{f.label}</span>
            <span className="font-sample">ST-210 Level 1 Slab · 15d · 70.0% · 24-Apr-26</span>
            <span className="font-note">{f.note}</span>
          </button>
        ))}
      </div>
      <div className="row wrap appearance-row">
        <label className="inline">
          Text size
          {seg(String(config.fontSize), [["12", "Small"], ["13", "Normal"], ["14", "Large"], ["15", "Larger"]], (v) => update({ fontSize: Number(v) }))}
        </label>
        <label className="inline">
          Theme
          {seg(config.theme, [["mode", "Match layout"], ["light", "Light"], ["dark", "Dark"]], (v) => update({ theme: v }))}
        </label>
        <label className="inline">
          Density
          {seg(config.density, [["compact", "Compact"], ["comfortable", "Comfortable"]], (v) => update({ density: v }))}
        </label>
      </div>
      <p className="muted">
        All fonts are installed with Stratum and work offline. Stratum Sans is Inter (SIL Open Font License) set with its own stylistic alternates; the others are IBM Plex Sans,
        Source Sans 3, Nunito Sans and JetBrains Mono, also under the Open Font License.
      </p>
    </div>
  );
}

function DataTab() {
  const { config, backend, update, signOut } = useConfig();
  const [url, setUrl] = useState(config.serverUrl || (location.protocol.startsWith("http") ? location.origin : ""));
  const [email, setEmail] = useState(config.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [dbFile, setDbFile] = useState("");
  useEffect(() => {
    window.stratumDesktop?.info?.().then((i) => setDbFile(i.dbFile)).catch(() => {});
  }, []);
  return (
    <div className="stack">
      <section>
        <h4>Current</h4>
        <p>
          <b>{backend.label}</b>
          {backend.user ? ` · signed in as ${backend.user.email} (${backend.user.role})` : ""}
        </p>
        {backend.kind === "desktop" && dbFile && <p className="muted">Database file: {dbFile}</p>}
        {backend.kind === "browser" && !(config.storage === "gdrive" || config.storage === "onedrive") && <p className="muted">Data is kept in this browser. Use a cloud folder to share it, or the desktop app or a Stratum Server for P6 and emailed reports.</p>}
      </section>
      {backend.kind !== "server" && <CloudSettings />}
      {backend.kind === "server" ? (
        <section>
          <button
            onClick={() => {
              signOut();
              setMsg("Signed out. Now using local storage.");
            }}
          >
            Sign out and use local storage
          </button>
        </section>
      ) : (
        <section className="stack">
          <h4>Connect to a Stratum Server</h4>
          <label>
            Server address
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://stratum.yourcompany.com" />
          </label>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          <div className="row">
            <button
              className="primary"
              disabled={!url || !email || !password}
              onClick={async () => {
                try {
                  const st = await serverStatus(url);
                  if (st.needsSetup) return setMsg("This server has no accounts yet. Run the setup from the wizard (Settings → Interface → re-run setup) or open the server address in a browser.");
                  const r = await serverLogin(url, email, password);
                  update({ storage: "server", serverUrl: url, token: r.token, user: r.user, serverPdf: st.pdf });
                  setMsg("Connected.");
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              Sign in
            </button>
          </div>
          <p className="muted">Projects in your local {isDesktop() ? "database" : "browser"} stay there; open them and Save to copy them to the server.</p>
        </section>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}

const KIND_LABEL: Record<P6ConnectionKind, string> = {
  eppm: "P6 EPPM (web services / REST API)",
  "p6-sqlserver": "P6 Professional – SQL Server database",
  "p6-oracle": "P6 Professional – Oracle database",
  "p6-sqlite": "P6 Professional – standalone SQLite file",
};

function P6Tab() {
  const { backend } = useConfig();
  const [list, setList] = useState<P6Connection[]>([]);
  const [edit, setEdit] = useState<P6Connection | null>(null);
  const [msg, setMsg] = useState("");
  const [diag, setDiag] = useState<{ name: string; d: P6Diagnosis } | null>(null);
  const [testing, setTesting] = useState(false);
  const runTest = async (c: P6Connection) => {
    setMsg("");
    setDiag(null);
    setTesting(true);
    try {
      setDiag({ name: c.name, d: await backend.p6Test(c) });
    } catch (e) {
      setMsg(`${c.name}: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => {
    backend.getP6().then(setList).catch((e) => setMsg(e.message));
  }, [backend]);
  if (!backend.caps.p6) return <p className="muted">Connecting to P6 needs the Stratum desktop app or a Stratum Server. In the browser, exchange data with P6 through XER files (Import schedule / Export → P6 XER).</p>;
  const canEdit = backend.kind !== "server" || backend.user?.role === "admin";

  const save = async (next: P6Connection[]) => {
    await backend.setP6(next);
    setList(await backend.getP6());
  };

  return (
    <div className="stack">
      <p className="muted">
        Pull projects from P6 into Stratum. EPPM connections can also push progress (actual dates, % complete, remaining duration) back. P6 Professional databases are read-only: send changes back with an XER.
      </p>
      <ul className="list">
        {list.map((c) => (
          <li key={c.id}>
            <b>{c.name}</b> · {KIND_LABEL[c.kind]}{" "}
            {canEdit && (
              <>
                <button className="link" onClick={() => setEdit(c)}>
                  edit
                </button>
                <button className="link" onClick={() => save(list.filter((x) => x.id !== c.id))}>
                  remove
                </button>
              </>
            )}
            <button className="link" disabled={testing} onClick={() => runTest(c)}>
              test
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <p className="muted">No connections yet.</p>}
      {canEdit && !edit && (
        <button onClick={() => setEdit({ id: uid("p6"), name: "Company P6", kind: "eppm", auth: "session", url: "", database: "", user: "", password: "" })}>+ Add connection</button>
      )}
      {edit && (
        <section className="stack form">
          <label>
            Name
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          </label>
          <label>
            Type
            <select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as P6ConnectionKind, schema: e.target.value === "p6-sqlserver" ? "dbo" : e.target.value === "p6-oracle" ? "ADMUSER" : undefined })}>
              {(Object.keys(KIND_LABEL) as P6ConnectionKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          {edit.kind === "eppm" && (
            <>
              <label>
                REST API address
                <input value={edit.url ?? ""} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://p6.company.com/p6ws/restapi" />
              </label>
              <label>
                Database name (as on the P6 login page)
                <input value={edit.database ?? ""} onChange={(e) => setEdit({ ...edit, database: e.target.value })} placeholder="PMDB" />
              </label>
              <label>
                Sign-in
                <select value={edit.auth ?? "session"} onChange={(e) => setEdit({ ...edit, auth: e.target.value as "session" | "bearer" })}>
                  <option value="session">P6 username and password</option>
                  <option value="bearer">OAuth token (Oracle-hosted P6)</option>
                </select>
              </label>
              {edit.auth === "bearer" ? (
                <label>
                  Token
                  <input type="password" value={edit.token ?? ""} onChange={(e) => setEdit({ ...edit, token: e.target.value })} />
                </label>
              ) : (
                <UserPass edit={edit} setEdit={setEdit} />
              )}
              <details className="cert-box" open={!!edit.caCert}>
                <summary>Company certificate (optional)</summary>
                <p className="muted">
                  Only needed if the P6 server uses a certificate from your company's own authority and it isn't installed on {backend.kind === "desktop" ? "this PC" : "the Stratum Server"}. Paste the root certificate (PEM text starting with -----BEGIN CERTIFICATE-----). IT can export it from the browser's padlock → certificate → root → export as Base-64.
                </p>
                <textarea rows={4} value={edit.caCert ?? ""} onChange={(e) => setEdit({ ...edit, caCert: e.target.value || undefined })} placeholder="-----BEGIN CERTIFICATE-----" spellCheck={false} />
                {edit.caCert && !/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(edit.caCert) && <p className="bad">That doesn't look like a PEM certificate.</p>}
              </details>
            </>
          )}
          {(edit.kind === "p6-sqlserver" || edit.kind === "p6-oracle") && (
            <>
              <div className="row">
                <label style={{ flex: 2 }}>
                  Host
                  <input value={edit.host ?? ""} onChange={(e) => setEdit({ ...edit, host: e.target.value })} placeholder="p6db.company.local" />
                </label>
                <label style={{ flex: 1 }}>
                  Port
                  <input type="number" value={edit.port ?? (edit.kind === "p6-oracle" ? 1521 : 1433)} onChange={(e) => setEdit({ ...edit, port: Number(e.target.value) })} />
                </label>
              </div>
              <div className="row">
                <label style={{ flex: 2 }}>
                  {edit.kind === "p6-oracle" ? "Service name" : "Database"}
                  <input value={edit.service ?? ""} onChange={(e) => setEdit({ ...edit, service: e.target.value })} placeholder={edit.kind === "p6-oracle" ? "PMDB" : "PMDB"} />
                </label>
                <label style={{ flex: 1 }}>
                  Schema / owner
                  <input value={edit.schema ?? ""} onChange={(e) => setEdit({ ...edit, schema: e.target.value })} />
                </label>
              </div>
              <UserPass edit={edit} setEdit={setEdit} />
              <p className="muted">Use a read-only database login. Stratum only runs SELECT queries.</p>
            </>
          )}
          {edit.kind === "p6-sqlite" && (
            <label>
              Path to the P6 Professional database file
              <input value={edit.file ?? ""} onChange={(e) => setEdit({ ...edit, file: e.target.value })} placeholder="C:\\Users\\you\\Documents\\Oracle\\Primavera P6\\P6 Professional\\PPMDBSQLite.db" />
            </label>
          )}
          <div className="row">
            <button
              className="primary"
              onClick={async () => {
                const next = list.some((x) => x.id === edit.id) ? list.map((x) => (x.id === edit.id ? edit : x)) : [...list, edit];
                await save(next);
                setEdit(null);
              }}
            >
              Save
            </button>
            <button disabled={testing} onClick={() => runTest(edit)}>
              {testing ? "Checking…" : "Test connection"}
            </button>
            <button onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </section>
      )}
      {testing && <p className="muted">Checking the connection step by step…</p>}
      {diag && <DiagnosisView name={diag.name} d={diag.d} />}
      {msg && <p className={/fail|error|cannot|refused|not found|denied|401|403/i.test(msg) ? "bad" : "good"}>{msg}</p>}
    </div>
  );
}

const STEP_ICON: Record<CheckStep["status"], string> = { ok: "✓", warn: "!", fail: "✕", skip: "–" };

function DiagnosisView({ name, d }: { name: string; d: P6Diagnosis }) {
  const [copied, setCopied] = useState(false);
  const report = () =>
    [`Stratum 4D connection check: ${name}`, `Result: ${d.summary}`, "", ...d.steps.map((s) => `[${s.status.toUpperCase()}] ${s.label}: ${s.detail}${s.hint ? `\n       → ${s.hint}` : ""}`)].join("\n");
  return (
    <div className={`diag ${d.ok ? "diag-ok" : "diag-bad"}`}>
      <div className="diag-head">
        <b>{d.ok ? "Connection works" : "Connection failed"}</b>
        <span className="spacer" />
        <button
          className="link"
          onClick={() => {
            void navigator.clipboard?.writeText(report()).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy report for IT"}
        </button>
      </div>
      <ol className="diag-steps">
        {d.steps.map((s) => (
          <li key={s.id} className={`step-${s.status}`}>
            <span className="step-icon" aria-label={s.status}>
              {STEP_ICON[s.status]}
            </span>
            <div>
              <div>
                <b>{s.label}</b> <span className="muted">{s.detail}</span>
              </div>
              {s.hint && <div className="step-hint">{s.hint}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function UserPass({ edit, setEdit }: { edit: P6Connection; setEdit: (c: P6Connection) => void }) {
  return (
    <div className="row">
      <label style={{ flex: 1 }}>
        Username
        <input value={edit.user ?? ""} onChange={(e) => setEdit({ ...edit, user: e.target.value })} autoComplete="off" />
      </label>
      <label style={{ flex: 1 }}>
        Password
        <input type="password" value={edit.password ?? ""} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" />
      </label>
    </div>
  );
}

const PRESETS: { label: string; s: Partial<SmtpSettings> }[] = [
  { label: "Office 365 / Outlook", s: { host: "smtp.office365.com", port: 587, secure: false } },
  { label: "Gmail", s: { host: "smtp.gmail.com", port: 587, secure: false } },
  { label: "Other (TLS 465)", s: { port: 465, secure: true } },
];

function EmailTab() {
  const { backend } = useConfig();
  const [s, setS] = useState<SmtpSettings>({ host: "", port: 587, secure: false, user: "", password: "", from: "" });
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    backend
      .getSmtp()
      .then((x) => x && setS(x))
      .catch(() => {});
  }, [backend]);
  if (!backend.caps.email) return <p className="muted">Email needs the Stratum desktop app or a Stratum Server.</p>;
  const canEdit = backend.kind !== "server" || backend.user?.role === "admin";
  return (
    <div className="stack">
      <p className="muted">
        Scheduled reports are sent through your mail server.{" "}
        {backend.caps.alwaysOn ? "The server sends them on schedule around the clock." : "The desktop app sends them while it is open; anything missed goes out when you next start it."}
      </p>
      <div className="row wrap">
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setS({ ...s, ...p.s })} disabled={!canEdit}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="row">
        <label style={{ flex: 2 }}>
          SMTP server
          <input value={s.host} onChange={(e) => setS({ ...s, host: e.target.value })} disabled={!canEdit} />
        </label>
        <label style={{ flex: 1 }}>
          Port
          <input type="number" value={s.port} onChange={(e) => setS({ ...s, port: Number(e.target.value) })} disabled={!canEdit} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.secure} onChange={(e) => setS({ ...s, secure: e.target.checked })} disabled={!canEdit} /> TLS from the start (port 465). Leave off for STARTTLS on 587.
      </label>
      <div className="row">
        <label style={{ flex: 1 }}>
          Username
          <input value={s.user} onChange={(e) => setS({ ...s, user: e.target.value })} disabled={!canEdit} autoComplete="off" />
        </label>
        <label style={{ flex: 1 }}>
          Password / app password
          <input type="password" value={s.password} onChange={(e) => setS({ ...s, password: e.target.value })} disabled={!canEdit} autoComplete="new-password" />
        </label>
      </div>
      <label>
        Send as (From)
        <input value={s.from} onChange={(e) => setS({ ...s, from: e.target.value })} placeholder="planning@yourcompany.com" disabled={!canEdit} />
      </label>
      <div className="row">
        <button
          className="primary"
          disabled={!canEdit}
          onClick={async () => {
            try {
              await backend.setSmtp(s);
              setMsg("Saved.");
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Save
        </button>
        <input placeholder="Send a test to…" value={to} onChange={(e) => setTo(e.target.value)} style={{ flex: 1 }} />
        <button
          onClick={async () => {
            setMsg("Testing…");
            try {
              setMsg(await backend.testSmtp(s, to || undefined));
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Test
        </button>
      </div>
      {msg && <p className={/fail|error|invalid|refused|timeout|auth/i.test(msg) ? "bad" : "good"}>{msg}</p>}
    </div>
  );
}

function UsersTab() {
  const backend = useConfig((s) => s.backend) as ReturnType<typeof serverBackend>;
  const [users, setUsers] = useState<(SessionUser & { id: string })[]>([]);
  const [edit, setEdit] = useState<{ id: string; email: string; name: string; role: string; password: string; reason?: string } | null>(null);
  const [msg, setMsg] = useState("");
  const load = () =>
    backend
      .listUsers()
      .then((u) => setUsers(u as never))
      .catch((e) => setMsg(e.message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="stack">
      <table className="data">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td>
                <button className="link" onClick={() => setEdit({ id: u.id, email: u.email, name: u.name, role: u.role, password: "" })}>
                  edit
                </button>
                <button
                  className="link"
                  onClick={async () => {
                    try {
                      await backend.deleteUser(u.id);
                      load();
                    } catch (e) {
                      setMsg((e as Error).message);
                    }
                  }}
                >
                  delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Admins manage users and settings; planners edit projects, dashboards and reports; viewers read and receive reports. A new password or role signs the user out of their other sessions.</p>
      {!edit && <button onClick={() => setEdit({ id: uid("usr"), email: "", name: "", role: "planner", password: "" })}>+ Add user</button>}
      {edit && (
        <section className="stack form">
          <div className="row">
            <label style={{ flex: 1 }}>
              Name
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </label>
            <label style={{ flex: 1 }}>
              Email
              <input value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </label>
          </div>
          <div className="row">
            <label style={{ flex: 1 }}>
              Role
              <select value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                <option value="admin">Admin</option>
                <option value="planner">Planner</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label style={{ flex: 1 }}>
              Password {users.some((u) => u.id === edit.id) ? "(leave blank to keep)" : ""}
              <input type="password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} autoComplete="new-password" />
            </label>
          </div>
          <label>
            Reason (kept in the audit log)
            <input value={edit.reason ?? ""} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="New planner for the substation project" maxLength={500} />
          </label>
          <div className="row">
            <button
              className="primary"
              onClick={async () => {
                try {
                  await backend.saveUser(edit.id, { email: edit.email, name: edit.name, role: edit.role, password: edit.password || undefined, reason: edit.reason });
                  setEdit(null);
                  load();
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              Save
            </button>
            <button onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </section>
      )}
      {msg && <p className="bad">{msg}</p>}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "login.ok": "Signed in",
  "login.failed": "Wrong password",
  "login.locked": "Sign-in locked",
  "setup.admin": "Server set up",
  "user.create": "User added",
  "user.update": "User changed",
  "user.delete": "User removed",
  "project.save": "Project saved",
  "project.delete": "Project deleted",
  "dashboard.save": "Dashboard saved",
  "dashboard.delete": "Dashboard deleted",
  "report.save": "Report saved",
  "report.delete": "Report deleted",
  "report.run": "Report sent",
  "settings.smtp": "Email settings",
  "settings.p6": "P6 connections",
  "settings.general": "Setting changed",
  "security.policy": "Security policy",
  "p6.import": "Pulled from P6",
  "p6.push": "Sent to P6",
  "approval.request": "Approval asked",
  "approval.approve": "Approved",
  "approval.reject": "Rejected",
  "approval.failed": "Approved, push failed",
  "approval.tampered": "Request changed",
  "audit.verify": "Log verified",
  "audit.export": "Log exported",
  "audit.retention": "Old entries removed",
  "server.start": "Server started",
  "settings.aisoc": "AiSOC settings",
  "aisoc.test": "AiSOC test event",
  "audit.broken": "LOG DOES NOT VERIFY",
};

const short = (d: Record<string, unknown>) =>
  Object.entries(d)
    .filter(([k]) => k !== "sha256")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ")
    .slice(0, 160);

function SecurityTab() {
  const backend = useConfig((s) => s.backend) as ReturnType<typeof serverBackend>;
  const me = backend.user?.email ?? "";
  const [pol, setPol] = useState<SecurityPolicy | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [open, setOpen] = useState<Approval | null>(null);
  const [reason, setReason] = useState("");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [verify, setVerify] = useState<AuditVerify | null>(null);
  const [msg, setMsg] = useState("");
  const fail = (e: unknown) => setMsg((e as Error).message);
  const loadAudit = (before?: number) =>
    backend
      .listAudit({ action: filter || undefined, before, limit: 50 })
      .then((l) => setEntries((cur) => (before ? [...cur, ...l] : l)))
      .catch(fail);
  const loadApprovals = () => backend.listApprovals().then(setApprovals).catch(fail);
  useEffect(() => {
    backend.getSecurity().then(setPol).catch(fail);
    loadApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  const save = async (p: Partial<SecurityPolicy>) => {
    try {
      setPol(await backend.setSecurity(p));
      setMsg("Saved.");
      loadAudit();
    } catch (e) {
      fail(e);
    }
  };
  const decide = async (approve: boolean) => {
    if (!open) return;
    try {
      const r = await backend.decideApproval(open.id, approve, reason);
      const res = r.result as { updated?: number } | undefined;
      setMsg(approve ? `Approved. Sent progress for ${res?.updated ?? 0} activities to P6.` : "Rejected.");
      setOpen(null);
      setReason("");
      loadApprovals();
      loadAudit();
    } catch (e) {
      fail(e);
      setOpen(null);
      loadApprovals();
      loadAudit();
    }
  };
  const pending = approvals.filter((a) => a.status === "pending");
  return (
    <div className="stack">
      <section className="stack">
        <h3>Changes that need approval</h3>
        {pol && (
          <label>
            Sending progress to Primavera P6
            <select value={pol.p6Approval} onChange={(e) => void save({ p6Approval: e.target.value as SecurityPolicy["p6Approval"] })}>
              <option value="admin">Planners ask; an admin approves (admins send at once)</option>
              <option value="two-person">Everyone asks; an admin other than the requester approves</option>
              <option value="off">No approval: send at once</option>
            </select>
          </label>
        )}
        {pending.length === 0 && <p className="muted">No requests are waiting.</p>}
        {pending.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Request</th>
                <th>Asked by</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>{a.requestedBy}</td>
                  <td>{new Date(a.requestedAt).toLocaleString()}</td>
                  <td>
                    <button className="link" onClick={() => backend.getApproval(a.id).then(setOpen).catch(fail)}>
                      review
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {open && (
          <section className="stack form">
            <b>{open.title}</b>
            {open.summary && (
              <p>
                {open.summary.projectCode} {open.summary.projectName}: {open.summary.activities} activities, {open.summary.started} started, {open.summary.finished} finished
                {open.summary.dataDate ? `, data date ${new Date(open.summary.dataDate).toISOString().slice(0, 10)}` : ""}.
              </p>
            )}
            <p className="muted">
              Asked by {open.requestedBy} on {new Date(open.requestedAt).toLocaleString()}
              {open.reason ? `: "${open.reason}"` : ""}. Content fingerprint (SHA-256) <code>{open.payloadHash.slice(0, 16)}…</code>; the approval sends exactly this content.
            </p>
            {pol?.p6Approval === "two-person" && open.requestedBy.toLowerCase() === me.toLowerCase() && <p className="bad">You asked for this change: another admin must approve it.</p>}
            <label>
              Reason (required to reject)
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </label>
            <div className="row">
              <button className="primary" onClick={() => void decide(true)}>
                Approve and send
              </button>
              <button onClick={() => void decide(false)} disabled={!reason.trim() && open.requestedBy.toLowerCase() !== me.toLowerCase()}>
                Reject
              </button>
              <button onClick={() => setOpen(null)}>Close</button>
            </div>
          </section>
        )}
        {approvals.some((a) => a.status !== "pending") && (
          <details>
            <summary>Decided requests</summary>
            <table className="data">
              <tbody>
                {approvals
                  .filter((a) => a.status !== "pending")
                  .slice(0, 30)
                  .map((a) => (
                    <tr key={a.id}>
                      <td>{a.title}</td>
                      <td>{a.status}</td>
                      <td>{a.decidedBy}</td>
                      <td>{a.reason}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <section className="stack">
        <h3>Audit log</h3>
        <p className="muted">Every sign-in and every change on this server, in order. Each entry is chained to the one before it with a keyed hash, so a changed or removed entry shows when the log is verified.</p>
        <div className="row">
          <button
            onClick={() =>
              backend
                .verifyAudit()
                .then((v) => (setVerify(v), loadAudit()))
                .catch(fail)
            }
          >
            Verify the log
          </button>
          <button
            onClick={async () => {
              try {
                const b = await backend.exportAudit();
                const a = document.createElement("a");
                a.href = URL.createObjectURL(b);
                a.download = `stratum-audit-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 2000);
              } catch (e) {
                fail(e);
              }
            }}
          >
            Export CSV
          </button>
          <label style={{ marginLeft: "auto" }}>
            Show{" "}
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Everything</option>
              <option value="login">Sign-ins</option>
              <option value="user">Users</option>
              <option value="project">Projects</option>
              <option value="p6">P6</option>
              <option value="approval">Approvals</option>
              <option value="settings">Settings</option>
              <option value="security">Security policy</option>
              <option value="aisoc">AiSOC</option>
            </select>
          </label>
        </div>
        {verify && (
          <p className={verify.ok ? "good" : "bad"}>
            {verify.ok
              ? `Verified: ${verify.checked} entries are intact${verify.head ? ` (latest ${verify.head.seq}, ${verify.head.hash.slice(0, 12)}…)` : ""}.${verify.checkpoints.length ? ` ${verify.checkpoints[0].removed} older entries were removed by retention on ${verify.checkpoints[0].at.slice(0, 10)}.` : ""}`
              : `Not intact: ${verify.reason}.`}
          </p>
        )}
        <table className="data audit">
          <thead>
            <tr>
              <th>#</th>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>On</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.seq} className={/failed|locked|tampered|reject/.test(e.action) ? "warn" : ""}>
                <td>{e.seq}</td>
                <td>{new Date(e.at).toLocaleString()}</td>
                <td>{e.actor}</td>
                <td title={e.action}>{ACTION_LABEL[e.action] ?? e.action}</td>
                <td>{e.target}</td>
                <td title={JSON.stringify(e.detail)}>{short(e.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length > 0 && entries.length % 50 === 0 && <button onClick={() => void loadAudit(entries[entries.length - 1].seq)}>Show older</button>}
        {pol && (
          <label>
            Keep audit entries
            <select value={pol.auditDays} onChange={(e) => void save({ auditDays: Number(e.target.value) })}>
              <option value={0}>Always</option>
              <option value={365}>1 year</option>
              <option value={730}>2 years</option>
              <option value={1825}>5 years</option>
              <option value={90}>90 days</option>
            </select>
          </label>
        )}
      </section>
      {msg && <p className={/fail|error|not|cannot|must|needs|already/i.test(msg) ? "bad" : "good"}>{msg}</p>}
    </div>
  );
}

function AisocTab() {
  const backend = useConfig((s) => s.backend) as ReturnType<typeof serverBackend>;
  const [c, setC] = useState<AisocConfig | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () =>
    backend
      .getAisoc()
      .then(setC)
      .catch((e) => setMsg({ ok: false, text: e.message }));
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!c) return <p className="muted">{msg?.text ?? "Loading…"}</p>;
  const set = (patch: Partial<AisocConfig>) => setC({ ...c, ...patch });
  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      setMsg({ ok: true, text: await fn() });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const st = c.status;
  const consoleOk = /^https?:\/\//i.test(c.consoleUrl);
  return (
    <div className="stack">
      <section className="stack aisoc-head">
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <h3>AiSOC security operations</h3>
            <p className="muted">
              AiSOC is an open-source, self-hosted security operations center. Stratum sends its audit events to AiSOC (sign-ins, lockouts, user and role changes, approvals, P6 pushes, and an audit log that does not verify), so your security team sees Stratum with the company&apos;s other systems and AiSOC&apos;s detections and AI triage run on them.
            </p>
          </div>
          <button className="primary" disabled={!consoleOk} title={consoleOk ? c.consoleUrl : "Set the console address first"} onClick={() => window.open(c.consoleUrl, "_blank", "noopener,noreferrer")}>
            Open AiSOC console ↗
          </button>
        </div>
        <p className={st?.lastError ? "bad" : "muted"}>
          {!c.enabled
            ? "Sending is off."
            : st?.lastError
              ? `Last attempt failed (${st.lastErrorAt ? new Date(st.lastErrorAt).toLocaleString() : ""}): ${st.lastError}. ${st.queued} events wait and are sent again automatically.`
              : `Sending is on. ${st?.sent ?? 0} events sent since the server started${st?.lastSentAt ? `, last at ${new Date(st.lastSentAt).toLocaleString()}` : ""}${st?.queued ? `; ${st.queued} waiting` : ""}.`}
        </p>
      </section>

      <section className="stack form">
        <label className="check">
          <input type="checkbox" checked={c.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> Send Stratum audit events to AiSOC
        </label>
        <div className="row">
          <label style={{ flex: 1 }}>
            AiSOC console address
            <input value={c.consoleUrl} onChange={(e) => set({ consoleUrl: e.target.value })} placeholder="https://aisoc.company.local:3000" />
          </label>
          <label style={{ flex: 1 }}>
            Ingest address
            <input value={c.ingestUrl} onChange={(e) => set({ ingestUrl: e.target.value })} placeholder="https://aisoc.company.local:8081" />
          </label>
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>
            Push token
            <input type="password" value={c.token} onChange={(e) => set({ token: e.target.value })} autoComplete="off" placeholder="From AiSOC: Connectors › Reveal push URL" />
          </label>
          <label style={{ flex: 1 }}>
            Tenant ID
            <input value={c.tenantId} onChange={(e) => set({ tenantId: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label style={{ flex: 1 }}>
            Events to send
            <select value={c.forward} onChange={(e) => set({ forward: e.target.value as AisocConfig["forward"] })}>
              <option value="security">Security events: sign-ins, users, approvals, P6, settings, audit log</option>
              <option value="all">Everything in the audit log, including project and report changes</option>
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Connector name in AiSOC
            <input value={c.connectorId} onChange={(e) => set({ connectorId: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { status: _s, ...body } = c;
                await backend.setAisoc(body);
                await load();
                return "Saved.";
              })
            }
          >
            Save
          </button>
          <button
            disabled={busy || !c.ingestUrl}
            onClick={() =>
              void run(async () => {
                const { status: _s, ...body } = c;
                return (await backend.testAisoc(body)).message;
              })
            }
          >
            Send a test event
          </button>
          {!!st?.queued && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await backend.flushAisoc();
                  await load();
                  return r.lastError ? `Still failing: ${r.lastError}` : `Sent. ${r.queued} waiting.`;
                })
              }
            >
              Send waiting events now
            </button>
          )}
        </div>
        {msg && <p className={msg.ok ? "good" : "bad"}>{msg.text}</p>}
      </section>

      <details>
        <summary>How to connect AiSOC</summary>
        <ol className="steps">
          <li>
            Install AiSOC on a server your team controls: <code>git clone https://github.com/beenuar/AiSOC &amp;&amp; cd AiSOC &amp;&amp; make up</code>. It needs Docker with 8 GB of memory. <code>make up</code> prints the console address and the admin password.
          </li>
          <li>
            Make a push token for Stratum: in the AiSOC console add a connector and click <b>Reveal push URL</b>, or run <code>docker compose run --rm -T api python -m app.scripts.mint_ingest_token</code>.
          </li>
          <li>Enter the console address (port 3000), the ingest address (port 8081), the token and the tenant ID here. Save, then send a test event.</li>
          <li>Keep the token secret. It is stored encrypted on Stratum Server and is never shown again here.</li>
        </ol>
        <p className="muted">AiSOC is a separate open-source project (MIT licence) by its own authors; Miqyas Labs is not affiliated with it.</p>
      </details>
    </div>
  );
}
