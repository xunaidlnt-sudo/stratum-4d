// Sign-in screen for the hosted web build. Only active when the build sets
// VITE_LOGIN_HASH (SHA-256 of "user:password"); the desktop app and local
// builds skip it. It runs in the browser, so it keeps out casual visitors but
// is not server-side security.
//
// A public demo account (VITE_DEMO_USER / VITE_DEMO_PASS) is shown on the page
// with copy buttons, so visitors can try the app; the owner's own account
// (the hash) is not shown anywhere.

import { Check, Copy } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

const HASH = (import.meta.env.VITE_LOGIN_HASH as string | undefined)?.trim().toLowerCase() || "";
const DEMO_USER = (import.meta.env.VITE_DEMO_USER as string | undefined)?.trim() || "";
const DEMO_PASS = (import.meta.env.VITE_DEMO_PASS as string | undefined) || "";
const KEY = "stratum.login.v1";
const BASE = import.meta.env.BASE_URL;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const signedIn = () => {
  try {
    const v = localStorage.getItem(KEY);
    return v === HASH || (!!DEMO_USER && v === `demo:${DEMO_USER}`);
  } catch {
    return false;
  }
};

export function signOut() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  location.reload();
}

export const loginEnabled = !!HASH;

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Older browsers: select a temporary field and copy.
      const t = document.createElement("textarea");
      t.value = value;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  };
  return (
    <div className="login-demo-row">
      <span className="login-demo-k">{label}</span>
      <code>{value}</code>
      <button type="button" className="login-copy" onClick={() => void copy()} aria-label={`Copy ${label.toLowerCase()}`} title={`Copy ${label.toLowerCase()}`}>
        {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        <span>{done ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

export function LoginGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(() => !HASH || signedIn());
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (ok) return <>{children}</>;
  const remember = (v: string) => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* session only */
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const u = user.trim();
    if (DEMO_USER && u.toLowerCase() === DEMO_USER.toLowerCase() && pass === DEMO_PASS) {
      remember(`demo:${DEMO_USER}`);
      setBusy(false);
      setOk(true);
      return;
    }
    const h = await sha256(`${u}:${pass}`);
    setBusy(false);
    if (h === HASH) {
      remember(HASH);
      setOk(true);
    } else setErr("The user name or password is not correct.");
  };
  const year = new Date().getFullYear();
  return (
    <div className="login-page">
      <main className="login-main">
        <section className="login-brand" aria-label="Stratum 4D">
          <img className="login-lockup" src={`${BASE}stratum-lockup-dark.png`} alt="Stratum 4D" />
          <h2>Planning and 4D simulation for construction projects</h2>
          <ul>
            <li>Primavera P6 and Microsoft Project layouts, with CPM scheduling</li>
            <li>Link the schedule to the IFC model and play the sequence day by day</li>
            <li>Dashboards, reports and earned value from the same data</li>
          </ul>
        </section>

        <section className="login-panel">
          <form className="login-card" onSubmit={submit}>
            <img className="login-logo" src={`${BASE}miqyas-labs.png`} alt="Miqyas Labs" />
            <h1>Sign in to Stratum 4D</h1>
            <p className="login-sub">Web demo. Your schedules stay in this browser.</p>
            <label>
              User name
              <input autoFocus autoComplete="username" value={user} onChange={(e) => (setUser(e.target.value), setErr(""))} />
            </label>
            <label>
              Password
              <input type="password" autoComplete="current-password" value={pass} onChange={(e) => (setPass(e.target.value), setErr(""))} />
            </label>
            {err && (
              <p className="login-err" role="alert">
                {err}
              </p>
            )}
            <button className="primary login-submit" type="submit" disabled={busy || !user || !pass}>
              Sign in
            </button>

            {DEMO_USER && DEMO_PASS && (
              <div className="login-demo" aria-label="Demo account">
                <div className="login-demo-head">
                  <b>Demo account</b>
                  <button type="button" className="login-fill" onClick={() => (setUser(DEMO_USER), setPass(DEMO_PASS), setErr(""))}>
                    Fill in
                  </button>
                </div>
                <CopyField label="User name" value={DEMO_USER} />
                <CopyField label="Password" value={DEMO_PASS} />
                <p className="login-sub">The demo opens sample projects. Nothing you do here is sent to a server.</p>
              </div>
            )}
          </form>
        </section>
      </main>

      <footer className="login-foot">
        <span>© {year} Miqyas Labs. All rights reserved.</span>
        <nav aria-label="Links">
          <a href="https://miqyaslabs.com/">Home</a>
          <a href="https://miqyaslabs.com/manual/">User manual</a>
          <a href="https://miqyaslabs.com/#download">Download</a>
          <a href="https://www.linkedin.com/in/junaidquamar/" target="_blank" rel="noopener noreferrer">
            Developed by Junaid Quamar
          </a>
        </nav>
      </footer>
    </div>
  );
}
