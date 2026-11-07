/**
 * While the first fork is being written (3-16 s on a slow model call), its place in the right pane
 * is never empty: the card's frame is already there, says honestly what is happening, shows the
 * sentence it is being written from, and draws its four answers in as quiet outlines.
 *
 * variant "reading" (the warm-up, D-090): the uploads are being read to see which questions they
 * already answer (1-2 s), before the first question.
 */
import { useEffect, useState } from "react";
import "../../styles/pending.css";
import { useSim } from "../session";

const STAGES = ["Reading what you said", "Finding the crossroads in it", "Writing four ways it could go", "Nearly there"];
const AFTER_WARMUP = ["Putting your answers together", "Finding the crossroads in them", "Writing four ways it could go", "Nearly there"];
const READING = ["Reading what you gave me", "Seeing what it already answers", "Nearly there"];
const DILEMMA = /\?|\b(offer|offered|transfer|job|move|moving|leave|quit|should|whether|or not|haven't answered|thinking about|torn|decide)\b/i;

export function CardPending({ variant = "fork" }: { variant?: "fork" | "reading" }) {
  const year = useSim((s) => s.playhead.year);
  const age = useSim((s) => s.profile?.age ?? s.playhead.age);
  const warmed = useSim((s) => !!s.warmup?.questions.some((q) => q.status === "answered"));
  const quote = useSim((s) => {
    // After the warm-up: their answer to "the decision that keeps coming back", when they gave one.
    const cross = s.warmup?.questions.find((q) => q.key === "crossroads")?.answer?.quoteId;
    const crossQ = cross ? s.profile?.quotes.find((q) => q.id === cross) : undefined;
    if (crossQ) return crossQ.text;
    const qs = (s.profile?.quotes ?? []).filter((q) => q.questionId === "start" || q.questionId === "start.line");
    return (qs.find((q) => DILEMMA.test(q.text)) ?? qs[0])?.text ?? null;
  });
  const reading = variant === "reading";
  const stages = reading ? READING : warmed ? AFTER_WARMUP : STAGES;
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => Math.min(x + 1, stages.length - 1)), reading ? 1400 : 2400);
    return () => window.clearInterval(id);
  }, [reading, stages.length]);

  return (
    <article
      className="dcard card-pending"
      data-kind="pending"
      data-variant={variant}
      aria-busy="true"
      aria-label={reading ? "Reading what you gave me" : "Your first fork is being written"}
    >
      <header className="dcard-head">
        {reading ? (
          <span className="dk">Before your life starts</span>
        ) : (
          <span className="dk big">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="none" stroke="var(--ink)" strokeWidth="1.3" />
            </svg>
            Your first fork
          </span>
        )}
        <span className="label faint">
          {age} · {year}
        </span>
      </header>
      <p className="cp-stage" role="status" aria-live="polite">
        <span key={n} className="cp-line">
          {stages[n]}
        </span>
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </p>
      {quote && !reading && (
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
      <p className="cp-note small">
        {reading ? "I'll only ask what you haven't already told me." : "Each answer splits your life. The ones you don't pick keep running."}
      </p>
    </article>
  );
}
