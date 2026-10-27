// Sign-in screen for the hosted web build. Only active when the build sets
// VITE_LOGIN_HASH (SHA-256 of "user:password"); the desktop app and local
// builds skip it. It runs in the browser, so it keeps out casual visitors but
// is not server-side security.

import { useState, type FormEvent, type ReactNode } from "react";

const HASH = (import.meta.env.VITE_LOGIN_HASH as string | undefined)?.trim().toLowerCase() || "";
const KEY = "stratum.login.v1";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const signedIn = () => {
  try {
    return localStorage.getItem(KEY) === HASH;
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

export function LoginGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(() => !HASH || signedIn());
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (ok) return <>{children}</>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const h = await sha256(`${user.trim()}:${pass}`);
    setBusy(false);
    if (h === HASH) {
      try {
        localStorage.setItem(KEY, HASH);
      } catch {
        /* session only */
      }
      setOk(true);
    } else setErr("Wrong user name or password.");
  };
  return (
    <div className="login-back">
      <form className="login-card" onSubmit={submit}>
        <h1>
          Stratum <span>4D</span>
        </h1>
        <p className="muted">Sign in to continue</p>
        <label>
          User name
          <input autoFocus autoComplete="username" value={user} onChange={(e) => (setUser(e.target.value), setErr(""))} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={pass} onChange={(e) => (setPass(e.target.value), setErr(""))} />
        </label>
        {err && <p className="login-err" role="alert">{err}</p>}
        <button className="primary" type="submit" disabled={busy || !user || !pass}>
          Sign in
        </button>
        <p className="muted small">Schedules you open stay in this browser.</p>
      </form>
    </div>
  );
}
