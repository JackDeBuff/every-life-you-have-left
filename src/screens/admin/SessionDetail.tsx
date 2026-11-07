/** One session: header (who, where, cost, live), copy summary / export, and the tabs. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../Admin";
import { ApiError, AuthError, sessionChecks, sessionDetail } from "./api";
import { ago, buildView, capLine, cost, dayTime, isLive, money, moneyTitle, type SessionView } from "./model";
import { sessionSummary } from "./report";
import { ChatTab, EndingTab, PortraitsTab, SettingsTab, UploadsTab } from "./tabs-misc";
import { DecisionsTab } from "./tabs-decisions";
import { HealthTab } from "./tabs-health";
import { LifeTab, LivesTab } from "./tabs-life";
import { ProfileTab } from "./tabs-profile";
import type { ChecksResponse, DetailResponse, Tab, Violation } from "./types";
import { AIcon, Chip, CopyButton } from "./ui";

const REFRESH_MS = 10_000;

export interface TabProps {
  v: SessionView;
  checks: ChecksResponse | null;
  /** Jump to a tab + anchor ("y-2031", "d-<id>", "e-<eventId>", "b-<branchId>"). */
  jump: (tab: Tab, anchor?: string) => void;
  /** Show a violation in the Health tab. */
  openCheck: (x: Violation) => void;
}

export function SessionDetail({ route, go, onAuthError }: { route: Route; go: (r: Partial<Route>, o?: { replace?: boolean }) => void; onAuthError: (e: AuthError) => void }) {
  const id = route.s!;
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [checks, setChecks] = useState<ChecksResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [auto, setAuto] = useState(true);
  const [focusCheck, setFocusCheck] = useState<string | null>(null);
  const [, tick] = useState(0);
  const busy = useRef(false);

  const load = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const [d, c] = await Promise.all([sessionDetail(id), sessionChecks(id).catch((e) => (e instanceof AuthError ? Promise.reject(e) : null))]);
      setDetail(d);
      setChecks(c);
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      if (e instanceof AuthError) onAuthError(e);
      else setError(e instanceof ApiError && e.status === 404 ? "No session with this id." : e instanceof ApiError && e.status === 0 ? "Can't reach the server." : `Couldn't load the session (${(e as Error).message}).`);
    } finally {
      busy.current = false;
    }
  }, [id, onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);
  const live = !!detail?.live && isLive(detail.live.updatedAt);
  useEffect(() => {
    if (!auto || !live) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [auto, live, load]);
  useEffect(() => {
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const v = useMemo(() => (detail ? buildView(detail, checks) : null), [detail, checks]);

  // A new tab starts at the top; an anchor scrolls to it once the tab has rendered, and flashes it.
  useEffect(() => {
    if (!route.hash) window.scrollTo({ top: 0 });
  }, [route.tab, route.hash]);
  useEffect(() => {
    if (!v || !route.hash) return;
    const el = document.getElementById(route.hash);
    if (!el) return;
    el.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.remove("adm-flash");
    void el.offsetWidth;
    el.classList.add("adm-flash");
  }, [v, route.hash, route.tab]);

  const jump = useCallback((tab: Tab, anchor?: string) => go({ s: id, tab, hash: anchor ?? "" }), [go, id]);
  const openCheck = useCallback(
    (x: Violation) => {
      setFocusCheck(x.id);
      go({ s: id, tab: "health", hash: `c-${x.id}` });
    },
    [go, id],
  );

  if (error && !detail)
    return (
      <main className="adm-main">
        <BackLink go={go} />
        <p className="adm-error" role="alert">
          <AIcon name="warning" size={14} /> {error}
        </p>
      </main>
    );
  if (!detail || !v)
    return (
      <main className="adm-main">
        <BackLink go={go} />
        <p className="muted">{detail && !detail.live ? "This session has nothing stored yet." : "Loading the session…"}</p>
      </main>
    );

  const st = v.st;
  const p = st.profile;
  const last = v.years.filter((y) => y.year <= v.playheadYear).at(-1);
  const counts = checks?.counts;
  const tabs: [Tab, string, number | null][] = [
    ["life", "Life", v.years.length],
    ["decisions", "Decisions", v.rows.length],
    ["profile", "Profile", p?.quotes.length ?? null],
    ["lives", "Other lives", st.branches.length],
    ["settings", "Settings & nudges", st.nudges.length || null],
    ["chat", "Chat & letters", st.chat.length || null],
    ["uploads", "Uploads", detail.uploads.length || null],
    ["portraits", "Portraits", st.portraits.length || null],
    ["ending", "Ending", null],
    ["health", "Health", counts ? counts.error + counts.warn : null],
  ];
  const created = detail.session.created_at as string | undefined;
  const props: TabProps = { v, checks, jump, openCheck };

  return (
    <main className="adm-main adm-detail">
      <BackLink go={go} />
      <header className="adm-dhead">
        <div className="adm-dwho">
          <h1 className="adm-h1">
            {live && <span className="adm-live" title="Updated in the last 2 minutes" />}
            <span>
              {p?.firstName ?? "(no name)"}
              <span className="adm-dage">{p ? `, ${p.age}` : ""}</span>
            </span>
          </h1>
          <p className="meta muted">
            {[p?.city, p?.region, p?.country].filter(Boolean).join(", ") || "—"} · shows {v.currency} · {p?.gender ?? "gender not set"} · end age {st.endAge}
          </p>
          <div className="adm-chips">
            <Chip tone="quiet">{st.speed}</Chip>
            <Chip tone={st.phase === "ended" ? "quiet" : "sun"}>{st.phase}</Chip>
            <Chip tone={st.engine === "mock" ? "info" : "quiet"}>engine {st.engine}</Chip>
            <Chip tone={detail.source === "durable_object" ? "quiet" : "warn"} title={detail.source === "durable_object" ? (detail.liveAwake ? "Read from the session's Durable Object (running)" : "Read from the session's Durable Object (stored state)") : `D1 copy only (${detail.liveError ?? "no Durable Object state"}): no life log, played years only`}>
              {detail.source === "durable_object" ? "Durable Object" : "D1 copy"}
            </Chip>
            {st.thinking && <Chip tone="sun">thinking</Chip>}
            {st.error && (
              <Chip tone="error" title={st.error}>
                engine error
              </Chip>
            )}
          </div>
          <p className="adm-id meta">
            {v.id}{" "}
            <CopyButton compact text={() => v.id} title="Copy session id" />
          </p>
        </div>
        <dl className="adm-dstats">
          <div>
            <dt>Playhead</dt>
            <dd>
              {st.playhead.year} · {st.playhead.age}
            </dd>
          </div>
          <div>
            <dt>Now</dt>
            <dd>{last ? `${last.place} · ${last.life?.work ?? "?"}` : "—"}</dd>
          </div>
          <div>
            <dt>Net worth</dt>
            <dd title={moneyTitle(last?.money.netWorth, v.currency)}>{money(last?.money.netWorth, v.currency)}</dd>
          </div>
          <div>
            <dt>Model cost</dt>
            <dd>
              {v.cost && v.cost.oldRates !== "no" ? (
                <span title={`Recorded ${cost(v.cost.recorded)} at the old rates; corrected to the real prices`}>
                  {cost(v.cost.corrected)} <Chip tone="warn">{v.cost.oldRates === "partly" ? "partly old rates" : "old rates"}</Chip>
                </span>
              ) : (
                cost(st.usage?.usd)
              )}{" "}
              <span className="faint">{st.usage ? `${st.usage.calls} calls` : ""}</span>
              {st.usage && detail.sessionCaps && (
                <span className={`adm-capline${capLine(st.usage.usd, detail.sessionCaps).over !== "none" ? " adm-bad" : " faint"}`} title="The caps are checked against the recorded tally (worker/spend.ts)">
                  {capLine(st.usage.usd, detail.sessionCaps).text}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Checks</dt>
            <dd>
              {counts ? (
                <button type="button" className="adm-linkbtn" onClick={() => jump("health", "checks")}>
                  <span className={counts.error ? "adm-bad" : ""}>{counts.error} err</span> · {counts.warn} warn · {counts.info} info
                </button>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt>Created · updated</dt>
            <dd>
              {dayTime(created)} · {ago(st.updatedAt)}
            </dd>
          </div>
        </dl>
        <div className="adm-dactions">
          <CopyButton label="Copy session summary" text={() => sessionSummary(v, checks)} />
          <button type="button" className="btn ghost sm" onClick={() => exportJson(v, checks)}>
            <AIcon name="download" size={14} /> Export JSON
          </button>
          <div className="adm-refresh meta muted">
            {live && (
              <button type="button" className="adm-toggle" data-on={auto} onClick={() => setAuto((a) => !a)} title="Refresh every 10 seconds while the session is live">
                <span className="led" data-on={auto} /> Live refresh
              </button>
            )}
            <span>{loadedAt ? `loaded ${ago(new Date(loadedAt))}` : ""}</span>
            <button type="button" className="btn quiet sm" onClick={() => void load()}>
              <AIcon name="refresh" size={13} /> Refresh
            </button>
          </div>
        </div>
      </header>
      {error && (
        <p className="adm-error" role="alert">
          <AIcon name="warning" size={14} /> {error} Showing the last copy.
        </p>
      )}

      <nav className="adm-tabs" role="tablist" aria-label="Session sections">
        {tabs.map(([t, label, n]) => (
          <button key={t} type="button" role="tab" aria-selected={route.tab === t} data-on={route.tab === t} onClick={() => go({ s: id, tab: t })}>
            {label}
            {n !== null && <span className="adm-tabn" data-bad={t === "health" && !!counts?.error}>{n}</span>}
          </button>
        ))}
      </nav>

      <div className="adm-tabbody" role="tabpanel">
        {route.tab === "life" && <LifeTab {...props} />}
        {route.tab === "decisions" && <DecisionsTab {...props} />}
        {route.tab === "profile" && <ProfileTab {...props} />}
        {route.tab === "lives" && <LivesTab {...props} />}
        {route.tab === "settings" && <SettingsTab {...props} />}
        {route.tab === "chat" && <ChatTab {...props} />}
        {route.tab === "uploads" && <UploadsTab {...props} />}
        {route.tab === "portraits" && <PortraitsTab {...props} />}
        {route.tab === "ending" && <EndingTab {...props} />}
        {route.tab === "health" && <HealthTab {...props} focus={focusCheck} />}
      </div>
    </main>
  );
}

function BackLink({ go }: { go: (r: Partial<Route>) => void }) {
  return (
    <a
      className="adm-back meta"
      href="/admin"
      onClick={(e) => {
        e.preventDefault();
        go({ s: null });
      }}
    >
      <AIcon name="arrowLeft" size={13} /> All sessions
    </a>
  );
}

/** The whole session as one JSON file (D1 rows + the Durable Object state + the checks), via a Blob link. */
function exportJson(v: SessionView, checks: ChecksResponse | null) {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const body = { exportedAt: new Date().toISOString(), origin: location.origin, sessionId: v.id, source: v.detail.source, state: v.st, d1: { ...v.detail, live: undefined }, checks };
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `elyl-${v.id}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
