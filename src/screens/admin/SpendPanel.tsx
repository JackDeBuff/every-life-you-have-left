/** Spend: the app-wide ledger against its cap (worker/spend.ts), the per-session caps and the price table. */
import { useCallback, useEffect, useState } from "react";
import { ApiError, AuthError, spend } from "./api";
import { ago, cost, dayTime } from "./model";
import type { SpendResponse } from "./types";
import { AIcon, Chip, Empty, KV, Meter, Section } from "./ui";

const REFRESH_MS = 15_000;
const usd2 = (x: number) => `$${x.toFixed(2)}`;
const perM = (x: number) => `$${x.toFixed(2)}`;
const MEDIA_LABEL: Record<string, string> = { image: "Portrait (image)", tts: "Voice line (TTS)", transcribe: "Transcription" };

export function SpendPanel({ onAuthError }: { onAuthError: (e: AuthError) => void }) {
  const [data, setData] = useState<SpendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      setData(await spend());
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      if (e instanceof AuthError) return onAuthError(e);
      setError(e instanceof ApiError && e.status === 0 ? "Can't reach the server." : `Couldn't load spend (${(e as Error).message}).`);
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    const c = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => (window.clearInterval(t), window.clearInterval(c));
  }, [load]);

  const s = data?.status ?? null;
  const left = s ? Math.max(0, s.cap - s.usd) : null;
  const prices = data ? Object.entries(data.prices).sort((a, b) => b[1].out - a[1].out) : [];

  return (
    <main className="adm-main adm-spend">
      <div className="adm-listhead">
        <div>
          <h1 className="adm-h1">Spend</h1>
          <p className="meta muted">App-wide ledger in D1: every model call and media call since the ledger started. Refreshes every 15 s.</p>
        </div>
        <div className="adm-refresh meta muted">
          <span>{loadedAt ? `updated ${ago(new Date(loadedAt))}` : "loading"}</span>
          <button type="button" className="btn quiet sm" onClick={() => void load()}>
            <AIcon name="refresh" size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <p className="adm-error" role="alert">
          <AIcon name="warning" size={14} /> {error}
        </p>
      )}

      <p className="adm-note meta">
        <AIcon name="info" size={13} /> Hackathon credit: $100, $58.76 left at Sat Nov 7 4:45pm EST (GCP Billing → Credits); billing lags a few hours.
      </p>

      <div className="adm-cols">
        <Section title="App-wide cap" aside={s ? <Chip tone={s.capped ? "error" : "quiet"}>{s.capped ? "capped: model calls stopped" : "not capped"}</Chip> : null}>
          {s ? (
            <>
              <div className="adm-spendbig">
                <span className="adm-spendnum">{usd2(s.usd)}</span>
                <span className="muted"> of {usd2(s.cap)} cap</span>
                <span className="faint"> · {usd2(left ?? 0)} left · {Math.round((s.usd / s.cap) * 100)}%</span>
              </div>
              <Meter value={s.usd} max={s.cap} marks={[{ at: s.cap * 0.8, label: "80%" }]} label="App-wide spend against the cap" />
              <KV
                rows={[
                  ["Capped", s.capped ? <span className="adm-bad">yes: every model call throws like the kill switch; new sessions get the offline engine</span> : "no"],
                  ["Cap (SPEND_CAP_USD)", usd2(s.cap)],
                  ["Counts", "text models (session agent usage, at pricing.ts) + media at per-call estimates"],
                  ["Not counted", "local dev and eval runs (they write the local D1)"],
                ]}
              />
            </>
          ) : data ? (
            <Empty>No ledger here (no D1 binding, or it couldn't be read{data.error ? `: ${data.error}` : ""}).</Empty>
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>

        <Section title="Per-session caps">
          {data ? (
            <KV
              rows={[
                ["Soft (SESSION_SOFT_CAP_USD)", <span>{usd2(data.sessionCaps.soft)}: no more small cards for the rest of the life</span>],
                ["Hard (SESSION_HARD_CAP_USD)", <span>{usd2(data.sessionCaps.hard)}: no more model calls; the offline engine finishes the life</span>],
                ["Checked against", "the session's recorded tally (Health tab of each session)"],
              ]}
            />
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>
      </div>

      <Section title={`Ledger by day (UTC)${data ? ` · ${data.rows.length}` : ""}`}>
        {data?.rows.length ? (
          <div className="adm-tablewrap">
            <table className="adm-table adm-table-tight">
              <thead>
                <tr>
                  <th>Day</th>
                  <th className="num">Spend</th>
                  <th className="num">Share of cap</th>
                  <th>Last write</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.day}>
                    <td className="nowrap">{r.day}</td>
                    <td className="num">{cost(r.usd)}</td>
                    <td className="num">{s ? `${Math.round((r.usd / s.cap) * 100)}%` : "—"}</td>
                    <td className="nowrap" title={r.updated_at}>
                      {dayTime(r.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{data ? "Nothing recorded yet." : "Loading…"}</Empty>
        )}
      </Section>

      <div className="adm-cols">
        <Section title="Prices (USD per 1M tokens)" aside={<span className="meta faint">worker/engine/pricing.ts, as deployed</span>}>
          {data ? (
            <>
              <div className="adm-tablewrap">
                <table className="adm-table adm-table-tight">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th className="num">Input</th>
                      <th className="num">Cached input</th>
                      <th className="num">Output + thinking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prices.map(([m, p]) => (
                      <tr key={m}>
                        <td>
                          {m} {p.note && <Chip tone="quiet">{p.note}</Chip>}
                        </td>
                        <td className="num">{perM(p.in)}</td>
                        <td className="num">{perM(p.in * data.cachedInputFactor)}</td>
                        <td className="num">{perM(p.out)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="meta faint">
                Checked against GCP Billing (SKU report, Sat Nov 7). Search grounding {usd2(data.searchQueryUsd * 1000)} per 1,000 queries. Per-session costs recorded before {new Date(data.pricesFixedAt).toUTCString().replace(":00 GMT", " UTC")} priced 3.8 / 3.6 Flash at half these rates; the sessions list shows them corrected.
              </p>
            </>
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>
        <Section title="Media (per call, estimates)" aside={<span className="meta faint">worker/spend.ts</span>}>
          {data ? (
            <KV rows={Object.entries(data.media).map(([k, x]) => [MEDIA_LABEL[k] ?? k, cost(x)] as [string, string])} />
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Section>
      </div>
    </main>
  );
}
