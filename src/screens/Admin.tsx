/**
 * /admin: the owner's playtest console (D-033). Sessions list → one session in full (life year by
 * year, every decision, profile, other lives, health and the engine's code checks), with "copy bug
 * report for Claude" on every year, decision and event.
 *
 * Loaded on its own (src/main.tsx), so it never opens a session socket. Passcode → sessionStorage →
 * `x-admin-passcode` (src/screens/admin/api.ts). The page is noindex (meta here, header from the
 * API and public/_headers).
 */
import { useCallback, useEffect, useState } from "react";
import "../styles/admin.css";
import { AuthError, passcode, ping, rememberPasscode } from "./admin/api";
import { SessionDetail } from "./admin/SessionDetail";
import { SessionList } from "./admin/SessionList";
import { AIcon } from "./admin/ui";
import type { Tab } from "./admin/types";

export interface Route {
  s: string | null;
  tab: Tab;
  hash: string;
}

const TABS: Tab[] = ["life", "decisions", "profile", "lives", "settings", "chat", "uploads", "portraits", "ending", "health"];

function readRoute(): Route {
  const q = new URLSearchParams(location.search);
  const t = q.get("tab") as Tab | null;
  return { s: q.get("s"), tab: t && TABS.includes(t) ? t : "life", hash: decodeURIComponent(location.hash.slice(1)) };
}

export function useRoute(): [Route, (next: Partial<Route>, opts?: { replace?: boolean }) => void] {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const on = () => setRoute(readRoute());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = useCallback((next: Partial<Route>, opts?: { replace?: boolean }) => {
    const cur = readRoute();
    const r: Route = { ...cur, hash: "", ...next };
    const q = new URLSearchParams();
    if (r.s) q.set("s", r.s);
    if (r.s && r.tab) q.set("tab", r.tab);
    const qs = q.toString();
    const url = `/admin${qs ? `?${qs}` : ""}${r.hash ? `#${encodeURIComponent(r.hash)}` : ""}`;
    if (opts?.replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    setRoute(r);
  }, []);
  return [route, go];
}

function useNoindex() {
  useEffect(() => {
    const m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    document.head.appendChild(m);
    const title = document.title;
    document.title = "Admin · Every Life You Have Left";
    // ?theme=dark|light forces a theme (as on the main app), otherwise the system's
    const t = new URLSearchParams(location.search).get("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    return () => {
      m.remove();
      document.title = title;
    };
  }, []);
}

export default function Admin() {
  useNoindex();
  const [authed, setAuthed] = useState<boolean | null>(passcode() ? null : false);
  const [notice, setNotice] = useState<string | null>(null);
  const [route, go] = useRoute();

  // A stored passcode is checked once on load.
  useEffect(() => {
    const p = passcode();
    if (!p) return;
    ping(p)
      .then(() => setAuthed(true))
      .catch((e) => {
        if (e instanceof AuthError) {
          rememberPasscode(null);
          setNotice(e.code === "admin_disabled" ? "Admin is off: ADMIN_PASSCODE isn't set on the server." : "That passcode isn't accepted any more. Enter it again.");
          setAuthed(false);
        } else setAuthed(true); // offline: the views show their own errors
      });
  }, []);

  const onAuthError = useCallback((e: AuthError) => {
    rememberPasscode(null);
    setNotice(e.code === "admin_disabled" ? "Admin is off: ADMIN_PASSCODE isn't set on the server." : "The passcode stopped working. Enter it again.");
    setAuthed(false);
  }, []);

  if (authed === null) return <div className="adm adm-boot">Checking the passcode…</div>;
  if (!authed) return <Login notice={notice} onDone={() => (setNotice(null), setAuthed(true))} />;

  return (
    <div className="adm">
      <header className="adm-top">
        <a
          className="adm-brand"
          href="/admin"
          onClick={(e) => {
            e.preventDefault();
            go({ s: null });
          }}
        >
          <span className="adm-sun" aria-hidden="true" />
          <span className="label">Every Life You Have Left</span>
          <span className="adm-brand-sub">Admin</span>
        </a>
        <button
          type="button"
          className="btn quiet sm"
          onClick={() => {
            rememberPasscode(null);
            setAuthed(false);
          }}
        >
          <AIcon name="signOut" size={14} /> Lock
        </button>
      </header>
      {route.s ? <SessionDetail key={route.s} route={route} go={go} onAuthError={onAuthError} /> : <SessionList go={go} onAuthError={onAuthError} />}
    </div>
  );
}

function Login({ notice, onDone }: { notice: string | null; onDone: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);
  return (
    <div className="adm adm-login">
      <form
        className="adm-login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim() || busy) return;
          setBusy(true);
          setError(null);
          try {
            await ping(value.trim());
            rememberPasscode(value.trim());
            onDone();
          } catch (err) {
            if (err instanceof AuthError) setError(err.code === "admin_disabled" ? "Admin is off: ADMIN_PASSCODE isn't set on the server." : "Wrong passcode. Try again.");
            else setError("Can't reach the server. Check the connection and try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="adm-brand">
          <span className="adm-sun" aria-hidden="true" />
          <span className="label">Every Life You Have Left</span>
          <span className="adm-brand-sub">Admin</span>
        </div>
        <h1>Playtest sessions</h1>
        <p className="muted small">For the team only. The passcode stays in this tab and is gone when you close it.</p>
        <label className="field">
          <span className="label">Passcode</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={value}
            aria-invalid={!!error}
            aria-describedby={error ? "adm-login-error" : undefined}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && (
          <p className="adm-error" id="adm-login-error" role="alert">
            <AIcon name="warning" size={14} /> {error}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || !value.trim()}>
          {busy ? "Checking…" : "Open admin"}
        </button>
      </form>
    </div>
  );
}
