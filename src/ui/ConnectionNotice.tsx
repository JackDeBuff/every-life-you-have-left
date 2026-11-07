/**
 * Bad Wi-Fi at the expo (SPEC §10): if the session socket can't connect within ~6 s, offer the
 * offline demo (the local mock, `?demo=alex`). A dropped socket shows "Reconnecting…" at once and
 * the same offer after 6 s. The agent client keeps retrying underneath; if it gets through, the
 * notice goes away by itself.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { playOfflineDemo, useSim } from "./session";

const WAIT_MS = 6000;

export function ConnectionNotice() {
  const backend = useSim((s) => s.backend);
  const connection = useSim((s) => s.connection);
  const hasProfile = useSim((s) => !!s.profile);
  const [late, setLate] = useState(false);
  const [hidden, setHidden] = useState(false);
  const everOpen = useRef(false);
  const down = backend === "live" && connection !== "open";
  if (connection === "open") everOpen.current = true;

  useEffect(() => {
    if (!down) {
      setLate(false);
      setHidden(false);
      return;
    }
    const id = window.setTimeout(() => setLate(true), WAIT_MS);
    return () => window.clearTimeout(id);
  }, [down]);

  if (!down || hidden || (!late && !everOpen.current)) return null;
  return (
    <aside className="conn-note" role="status" aria-live="polite">
      <span className="conn-dot" aria-hidden="true" />
      <div>
        <p>
          <b>{late ? "I can't reach the life engine." : "Reconnecting…"}</b>{" "}
          {late && (hasProfile ? "The Wi-Fi may be slow. I'll keep trying; your life is saved where you left it." : "The Wi-Fi may be slow. I'll keep trying.")}
        </p>
        {late && (
          <div className="actions">
            <button className="btn sm sun" onClick={playOfflineDemo}>
              Play the offline demo <Icon name="arrowRight" size={13} />
            </button>
            <button className="btn quiet sm" onClick={() => setHidden(true)}>
              Keep trying
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
