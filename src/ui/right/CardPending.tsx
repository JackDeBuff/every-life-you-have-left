/**
 * While the first fork is being written (3-16 s on a slow model call), its place in the right pane
 * is never empty: the card's frame is already there, says honestly what is happening, shows the
 * sentence it is being written from, and draws its four answers in as quiet outlines.
 */
import { useEffect, useState } from "react";
import "../../styles/pending.css";
import { useSim } from "../session";

const STAGES = ["Reading what you said", "Finding the crossroads in it", "Writing four ways it could go", "Nearly there"];
const DILEMMA = /\?|\b(offer|offered|transfer|job|move|moving|leave|quit|should|whether|or not|haven't answered|thinking about|torn|decide)\b/i;

export function CardPending() {
  const year = useSim((s) => s.playhead.year);
  const age = useSim((s) => s.profile?.age ?? s.playhead.age);
  const quote = useSim((s) => {
    const qs = (s.profile?.quotes ?? []).filter((q) => q.questionId === "start" || q.questionId === "start.line");
    return (qs.find((q) => DILEMMA.test(q.text)) ?? qs[0])?.text ?? null;
  });
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => Math.min(x + 1, STAGES.length - 1)), 2400);
    return () => window.clearInterval(id);
  }, []);

  return (
    <article className="dcard card-pending" data-kind="pending" aria-busy="true" aria-label="Your first fork is being written">
      <header className="dcard-head">
        <span className="dk big">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="none" stroke="var(--ink)" strokeWidth="1.3" />
          </svg>
          Your first fork
        </span>
        <span className="label faint">
          {age} · {year}
        </span>
      </header>
      <p className="cp-stage" role="status" aria-live="polite">
        <span key={n} className="cp-line">
          {STAGES[n]}
        </span>
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
      {quote && (
        <p className="cp-quote">
          <span className="label">From your words</span>
          <span className="voice">“{quote}”</span>
        </p>
      )}
      <div className="tiles cp-tiles" aria-hidden="true">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="tile cp-tile" style={{ ["--k" as string]: k }}>
            <span className="kc">{k}</span>
            <span className="cp-bar" />
            <span className="cp-bar short" />
          </div>
        ))}
      </div>
      <p className="cp-note small">Each answer splits your life. The ones you don't pick keep running.</p>
    </article>
  );
}
