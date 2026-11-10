/** Players: the play log (worker/plays.ts), one row per life started whatever its consent. */
import { useCallback, useEffect, useState } from "react";
import { ApiError, AuthError, players } from "./api";
import { ago, dayTime } from "./model";
import type { PlayersResponse } from "./types";
import { AIcon, Chip, Empty } from "./ui";

const REFRESH_MS = 15_000;

export function PlayersPanel({ onAuthError, onOpen }: { onAuthError: (e: AuthError) => void; onOpen: (id: string) => void }) {
  const [data, setData] = useState<PlayersResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await players());
      setError(null);
      setLoadedAt(Date.now());
    } catch (e) {
      if (e instanceof AuthError) return onAuthError(e);
      setError(e instanceof ApiError && e.status === 0 ? "Can't reach the server." : `Couldn't load players (${(e as Error).message}).`);
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const rows = data?.rows ?? [];
  return (
    <main className="adm-main">
      <div className="adm-listhead">
        <div>
          <h1 className="adm-h1">Players</h1>
          <p className="meta muted">
            Every life started since Nov 9, whatever its consent: first name, age, country, speed and the boxes they chose. Kept 30 days.
            {data ? ` ${data.total} plays · ${data.today} in the last 24 h.` : ""}
            {data && data.legacy.shared + data.legacy.hidden > 0
              ? ` Before the log: ${data.legacy.shared} saved lives in Sessions, and ${data.legacy.hidden} saved lives whose owners chose not to share (count only); incognito lives from before Nov 9 left no record.`
              : ""}
          </p>
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
      {data && rows.length === 0 ? (
        <Empty>No plays logged yet. The next life someone starts shows up here.</Empty>
      ) : (
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Name</th>
                <th className="num">Age</th>
                <th>Country</th>
                <th>Speed</th>
                <th>Consent</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.session_id} onClick={r.shared ? () => onOpen(r.session_id) : undefined} style={r.shared ? { cursor: "pointer" } : undefined} title={r.shared ? "Open the life" : "Not shared with the team: play record only"}>
                  <td title={r.started_at}>{dayTime(r.started_at.replace(" ", "T") + "Z")}</td>
                  <td>{r.first_name ?? "—"}</td>
                  <td className="num">{r.age ?? "—"}</td>
                  <td>{r.country ?? "—"}</td>
                  <td>{r.speed ?? "—"}</td>
                  <td>{r.shared ? <Chip tone="up">Shared</Chip> : r.saved ? <Chip tone="quiet">Saved, private</Chip> : <Chip tone="quiet">Incognito</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
