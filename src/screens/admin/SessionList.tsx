/** Sessions list: newest first, search + filters, auto-refresh every 10 s, a live dot for the last 2 minutes. */
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import type { Route } from "../Admin";
import { ApiError, AuthError, listSessions } from "./api";
import { ago, cost, dayTime, isLive, toDate } from "./model";
import type { ListRow } from "./types";
import { AIcon, Chip } from "./ui";

const REFRESH_MS = 10_000;
const SPEEDS = ["all", "1x", "2x", "4x", "auto"] as const;
const PHASES = ["all", "warmup", "playing", "deciding", "interlude", "ended", "start"] as const;

/** Filters survive opening a session and coming back. */
const useFilters = create<{ q: string; speed: string; phase: string; hideScripted: boolean; sort: "created" | "updated" | "cost" }>(() => ({
  q: "",
  speed: "all",
  phase: "all",
  hideScripted: false,
  sort: "created",
}));

const scripted = (id: string) => /^(smoke|judge|qa|eval)-/.test(id);

export function SessionList({ go, onAuthError }: { go: (r: Partial<Route>) => void; onAuthError: (e: AuthError) => void }) {
  const [rows, setRows] = useState<ListRow[] | null>(null);
  const [migrated, setMigrated] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);
  const [, tick] = useState(0);
  const f = useFilters();
  const search = useRef<HTMLInputElement>(null);

  const load = useMemo(
    () => async () => {
      try {
        const r = await listSessions();
        setRows(r.sessions);
        setMigrated(r.migrated);
        setError(null);
        setLoadedAt(Date.now());
      } catch (e) {
        if (e instanceof AuthError) return onAuthError(e);
        setError(e instanceof ApiError && e.status === 0 ? "Can't reach the server." : `Couldn't load sessions (${(e as Error).message}).`);
      }
    },
    [onAuthError],
  );

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [auto, load]);
  // "updated 4s ago" and live dots stay current between loads
  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const now = Date.now();
  const shown = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const out = (rows ?? []).filter(
      (r) =>
        (!q || r.id.toLowerCase().includes(q) || (r.first_name ?? "").toLowerCase().includes(q)) &&
        (f.speed === "all" || r.speed === f.speed) &&
        (f.phase === "all" || r.phase === f.phase) &&
        (!f.hideScripted || !scripted(r.id)),
    );
    const t = (s: string) => toDate(s)?.getTime() ?? 0;
    if (f.sort === "updated") out.sort((a, b) => t(b.updated_at) - t(a.updated_at));
    else if (f.sort === "cost") out.sort((a, b) => (b.usage_usd ?? -1) - (a.usage_usd ?? -1));
    else out.sort((a, b) => t(b.created_at) - t(a.created_at));
    return out;
  }, [rows, f]);
  const liveCount = (rows ?? []).filter((r) => isLive(r.updated_at, now)).length;
  const totalCost = shown.reduce((n, r) => n + (r.usage_usd ?? 0), 0);

  return (
    <main className="adm-main">
      <div className="adm-listhead">
        <div>
          <h1 className="adm-h1">Sessions</h1>
          <p className="meta muted">
            {rows ? `${shown.length} of ${rows.length}` : "…"} · <span className="adm-livecount">{liveCount} live now</span>
            {shown.some((r) => typeof r.usage_usd === "number") ? ` · ${cost(totalCost)} model cost in view` : ""}
          </p>
        </div>
        <div className="adm-refresh meta muted">
          <button type="button" className="adm-toggle" data-on={auto} onClick={() => setAuto((a) => !a)} title="Refresh every 10 seconds">
            <span className="led" data-on={auto} /> Auto-refresh
          </button>
          <span>{loadedAt ? `updated ${ago(new Date(loadedAt), now)}` : "loading"}</span>
          <button type="button" className="btn quiet sm" onClick={() => void load()}>
            <AIcon name="refresh" size={13} /> Refresh
          </button>
        </div>
      </div>

      <div className="adm-filters" role="search">
        <label className="adm-search">
          <AIcon name="search" size={14} />
          <input ref={search} className="input" placeholder="Name or session id  ( / )" value={f.q} onChange={(e) => useFilters.setState({ q: e.target.value })} />
        </label>
        <Seg label="Speed" value={f.speed} options={SPEEDS} onChange={(speed) => useFilters.setState({ speed })} />
        <Seg label="Phase" value={f.phase} options={PHASES} onChange={(phase) => useFilters.setState({ phase })} />
        <label className="adm-check meta">
          <input type="checkbox" checked={f.hideScripted} onChange={(e) => useFilters.setState({ hideScripted: e.target.checked })} /> Hide scripted runs
        </label>
        <label className="adm-sort meta">
          Sort
          <select value={f.sort} onChange={(e) => useFilters.setState({ sort: e.target.value as "created" })}>
            <option value="created">Newest</option>
            <option value="updated">Last active</option>
            <option value="cost">Cost</option>
          </select>
        </label>
      </div>

      {!migrated && (
        <p className="adm-note meta">
          <AIcon name="info" size={13} /> Cost, warm-up and engine-error columns need <code>migrations/0004_admin.sql</code> on this database. Until then they show “—” here; each session’s detail still has them.
        </p>
      )}
      {error && (
        <p className="adm-error" role="alert">
          <AIcon name="warning" size={14} /> {error}
        </p>
      )}

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th aria-label="Live" />
              <th>Name</th>
              <th className="num">Age</th>
              <th>Place</th>
              <th>Speed</th>
              <th>Phase</th>
              <th className="num" title="Warm-up questions answered or skipped">Warm-up</th>
              <th className="num" title="Decisions written (forks in brackets)">Decisions</th>
              <th className="num" title="Decisions answered (+ let slide)">Answers</th>
              <th className="num" title="Years played (mirrored)">Years</th>
              <th className="num">Cost</th>
              <th className="num" title="Engine errors (warnings)">Errors</th>
              <th>Created</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const live = isLive(r.updated_at, now);
              const warm = r.warm_asked ?? (r.warm_answered || null);
              const errs = (r.errors ?? 0) || (r.last_error ? 1 : 0);
              return (
                <tr
                  key={r.id}
                  tabIndex={0}
                  onClick={() => go({ s: r.id, tab: "life" })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") go({ s: r.id, tab: "life" });
                  }}
                  data-live={live}
                >
                  <td>{live ? <span className="adm-live" title={`Updated ${ago(r.updated_at, now)}`} /> : null}</td>
                  <td>
                    <div className="adm-name">{r.first_name ?? <span className="faint">(no name)</span>}</div>
                    <div className="adm-id">{r.id}</div>
                  </td>
                  <td className="num">{r.age ?? "—"}</td>
                  <td>{[r.city, r.country].filter(Boolean).join(", ") || "—"}</td>
                  <td>
                    <Chip tone="quiet">{r.speed ?? "—"}</Chip>
                  </td>
                  <td>
                    <Chip tone={r.phase === "ended" ? "quiet" : r.phase === "deciding" || r.phase === "warmup" ? "sun" : undefined}>{r.phase ?? "—"}</Chip>
                    {r.engine === "mock" && <Chip tone="info">mock</Chip>}
                  </td>
                  <td className="num">{warm ?? "—"}</td>
                  <td className="num">
                    {r.decisions} <span className="faint">({r.forks})</span>
                  </td>
                  <td className="num">
                    {r.answered}
                    {r.slid ? <span className="faint"> +{r.slid}</span> : null}
                  </td>
                  <td className="num">{r.years}</td>
                  <td className="num">{cost(r.usage_usd)}</td>
                  <td className="num" title={r.last_error ?? undefined}>
                    {errs ? <span className="adm-bad">{errs}</span> : r.errors === undefined ? "—" : "0"}
                    {r.warnings ? <span className="faint"> ({r.warnings})</span> : null}
                  </td>
                  <td className="nowrap" title={r.created_at}>
                    {dayTime(r.created_at)}
                  </td>
                  <td className="nowrap" title={r.updated_at}>
                    {ago(r.updated_at, now)}
                  </td>
                </tr>
              );
            })}
            {rows && !shown.length && (
              <tr>
                <td colSpan={14} className="adm-empty">
                  No sessions match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: string; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="adm-seg" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {options.map((o) => (
        <button key={o} type="button" data-on={value === o} onClick={() => onChange(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
