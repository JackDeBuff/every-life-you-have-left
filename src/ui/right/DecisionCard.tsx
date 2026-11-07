/**
 * The decision card (SPEC §3): the question, why I'm asking, four genuinely different answers,
 * an always-visible "say more" box with hold-to-talk, and submit. Small ones slow the clock and
 * can slide; big ones dim the world and end in the fork moment.
 * Keys: 1–4 select · Enter submits · Shift+Enter new line.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPEED_CONFIG, type Decision } from "../../../shared/sim";
import { clock } from "../clock";
import { HoldToTalk } from "../HoldToTalk";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { playForkMoment } from "../motion/forkMoment";
import { sim, useSim } from "../session";
import { useUi } from "../uiStore";

export function DecisionCard({ d }: { d: Decision }) {
  const speed = useSim((s) => s.speed);
  const quote = useSim((s) => (d.whyQuoteId ? s.profile?.quotes.find((q) => q.id === d.whyQuoteId) : undefined));
  const setForking = useUi((s) => s.setForking);
  const [sel, setSel] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [via, setVia] = useState<"text" | "voice">("text");
  const [micNote, setMicNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const card = useRef<HTMLElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const drain = useRef<HTMLDivElement>(null);
  const big = d.kind === "big";
  const timeout = !big ? SPEED_CONFIG[speed].smallTimeoutSec : null;
  const canSubmit = (!!sel || text.trim().length > 1) && !busy;

  // Arrive: small ones rise from the bottom of the dialogue; big ones settle into the whole pane.
  useEffect(() => {
    if (!card.current || reducedMotion()) return;
    const q = gsap.utils.selector(card.current);
    const tl = gsap.timeline();
    tl.fromTo(card.current, { y: big ? 24 : 40, opacity: 0 }, { y: 0, opacity: 1, duration: big ? 0.7 : 0.5, ease: "expo.out", delay: big ? 0.25 : 0 });
    tl.fromTo(q(".dq"), { yPercent: 40, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7, ease: "expo.out" }, "<0.1");
    tl.fromTo(q("[data-option]"), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "expo.out", stagger: 0.06 }, "<0.15");
    tl.fromTo(q(".say"), { opacity: 0 }, { opacity: 1, duration: 0.5 }, "<0.2");
    return () => {
      tl.kill();
    };
  }, [big]);

  // "Let it slide": a hairline drains over the timeout at 2×/4×. Engaging stops it.
  const drainTw = useRef<gsap.core.Tween | null>(null);
  // The countdown only runs while life is playing (not during an interlude or a fork).
  const running = useSim((s) => s.phase === "playing" && !s.playhead.paused);
  useEffect(() => {
    drainTw.current?.paused(!running);
  }, [running]);
  useEffect(() => {
    if (!timeout || engaged || busy) return;
    const p = { v: 1 };
    setLeft(timeout);
    const tw = (drainTw.current = gsap.to(p, {
      v: 0,
      duration: timeout,
      ease: "none",
      onUpdate: () => {
        if (drain.current) drain.current.style.transform = `scaleX(${p.v})`;
        setLeft(Math.ceil(p.v * timeout));
      },
      onComplete: () => void slide(),
      paused: sim().phase !== "playing" || sim().playhead.paused,
    }));
    return () => {
      tw.kill();
      drainTw.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout, engaged, busy]);

  async function slide() {
    if (busy) return;
    setBusy(true);
    if (card.current && !reducedMotion()) await gsap.to(card.current, { opacity: 0, y: 16, height: 0, duration: 0.35, ease: "expo.in" });
    await sim().answer({ decisionId: d.id, optionId: null, text: null, via: "tap", slid: true });
  }

  async function submit() {
    if (!canSubmit || !card.current) return;
    setBusy(true);
    const answer = { decisionId: d.id, optionId: sel, text: text.trim() || null, via: text.trim() ? via : ("tap" as const) };
    if (big) {
      const chosen = sel ?? bestGuess(d, text);
      const titles = Object.fromEntries(d.options.map((o) => [o.id, o.branchTitle ?? o.label]));
      setForking({ decisionId: d.id, optionId: chosen });
      clock.hold("fork", true);
      const anim = playForkMoment(card.current, d.id, chosen, titles);
      await sim().answer({ ...answer, optionId: answer.optionId ?? chosen });
      await anim;
      clock.hold("fork", false);
      setForking(null);
    } else {
      if (!reducedMotion()) await gsap.to(card.current, { opacity: 0, y: 10, duration: 0.3, ease: "expo.in" });
      await sim().answer(answer);
    }
  }

  // Say more starts at one line and grows with the words (CSS caps it, then it scrolls inside), so
  // an empty box doesn't cost the answers their room on a 720 px screen.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    if (text) el.style.height = `${el.scrollHeight + 2}px`;
    else el.style.height = "";
  }, [text]);

  // Keyboard: 1–4 select (when not typing), Enter submits, Shift+Enter is a newline.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement === ta.current;
      const other = (document.activeElement as HTMLElement | null)?.closest("input, select, [role=slider], [role=combobox]");
      if (other) return;
      if (!typing && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        setSel(d.options[Number(e.key) - 1]!.id);
        setEngaged(true);
      } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        const ae = document.activeElement as HTMLElement | null;
        const tile = !typing ? ae?.closest<HTMLElement>("[data-option]") : null;
        if (tile && card.current?.contains(tile)) {
          // A mouse pick leaves focus on the tile, and the browser would "click" it again on Enter
          // (un-picking it). Enter decides with the pick; on a tile that isn't picked yet, it picks.
          e.preventDefault();
          const id = tile.dataset.option!;
          if (sel !== id) {
            setSel(id);
            setEngaged(true);
            return;
          }
          void submit();
          return;
        }
        if (!typing && ae?.tagName === "BUTTON") return;
        e.preventDefault();
        void submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <article className="dcard" ref={card} data-kind={d.kind} aria-label={big ? "A big decision" : "A small decision"}>
      {timeout && !engaged && (
        <div className="dcard-drain" aria-hidden="true">
          <div ref={drain} />
        </div>
      )}
      <header className="dcard-head">
        {big ? (
          <span className="dk big">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.3" />
            </svg>
            This one splits your life
          </span>
        ) : (
          <span className="dk">Small · time slows, it won't stop</span>
        )}
        <span className="label faint">
          {d.age} · {d.year}
        </span>
      </header>

      <h2 className="dq" data-len={d.prompt.length > 170 ? "xl" : d.prompt.length > 110 ? "l" : undefined}>
        {d.prompt}
      </h2>
      <p className="dwhy">
        <span className="label">Why I'm asking</span>{" "}
        {quote ? <WhyWithQuote text={d.whyAsking} quote={quote.shortForm ?? quote.text} /> : d.whyAsking}
      </p>

      <div className="tiles" role="radiogroup" aria-label="Answers">
        {d.options.map((o, i) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={sel === o.id}
            className="tile"
            data-option={o.id}
            data-on={sel === o.id}
            title={o.hint ?? undefined}
            disabled={busy}
            onClick={() => {
              setSel(sel === o.id ? null : o.id);
              setEngaged(true);
            }}
          >
            <span className="kc" aria-hidden="true">
              {sel === o.id ? <Icon name="check" size={11} /> : i + 1}
            </span>
            {big && o.branchTitle && <span className="tile-fork">{o.branchTitle}</span>}
            <span className="tile-label">{o.label}</span>
            {o.hint && <span className="tile-hint">{o.hint}</span>}
          </button>
        ))}
      </div>

      <div className="say">
        <label className="say-l" htmlFor={`say-${d.id}`}>
          <span className="label">{sel ? "Say more, on top of your pick" : "Or say it your way"}</span>
        </label>
        <div className="say-field">
          <textarea
            id={`say-${d.id}`}
            ref={ta}
            className="textarea voice-input"
            rows={1}
            value={text}
            placeholder={sel ? `“I'd ${d.options.find((o) => o.id === sel)?.label.toLowerCase().replace(/^i'?d?\s/, "") ?? "do that"}, but only if…”` : d.placeholder}
            disabled={busy}
            onFocus={() => setEngaged(true)}
            onChange={(e) => {
              setText(e.target.value);
              setEngaged(true);
            }}
          />
          <HoldToTalk
            compact
            hint={d.prompt}
            disabled={busy}
            onText={(t) => {
              setText((x) => (x.trim() ? `${x.trim()} ${t}` : t));
              setVia("voice");
              setEngaged(true);
              ta.current?.focus();
            }}
            onNotice={(n) => {
              setMicNote(n);
              if (n) setEngaged(true);
            }}
          />
        </div>
        {micNote && (
          <p className="say-note" role="status">
            <Icon name="info" size={12} /> {micNote}
          </p>
        )}
        <p className="say-micro">
          <Icon name="quotes" size={12} />
          <span>
            Your own words steer this life more than a tap.<span className="say-micro-more"> I keep them, and later turning points will quote them back to you.</span>
          </span>
        </p>
      </div>

      <footer className="dcard-foot">
        {timeout && !engaged && left !== null ? (
          <button className="btn quiet sm slide" onClick={() => void slide()}>
            Let it slide · {left}s
          </button>
        ) : (
          <span className="keys-hint faint meta">
            <span className="kbd">1</span>–<span className="kbd">4</span> pick · <span className="kbd">↵</span> decide<span className="kh-nl"> · <span className="kbd">⇧↵</span> new line</span>
          </span>
        )}
        <button className={`btn ${big ? "sun" : ""} decide`} disabled={!canSubmit} onClick={() => void submit()}>
          {big ? "Split here" : "Decide"} <Icon name="enter" size={14} />
        </button>
      </footer>
    </article>
  );
}

function WhyWithQuote({ text, quote }: { text: string; quote: string }) {
  const m = text.match(/^(.*?)“([^”]+)”(.*)$/);
  if (!m) return <>{text}</>;
  return (
    <>
      {m[1]}
      <span className="voice">
        <mark>“{m[2] ?? quote}”</mark>
      </span>
      {m[3]}
    </>
  );
}

function bestGuess(d: Decision, text: string): string {
  const words = new Set(text.toLowerCase().match(/[a-z']{3,}/g) ?? []);
  let best = d.options[0]!.id;
  let score = -1;
  for (const o of d.options) {
    const sc = (`${o.label} ${o.branchTitle ?? ""}`.toLowerCase().match(/[a-z']{3,}/g) ?? []).filter((w) => words.has(w)).length;
    if (sc > score) (score = sc), (best = o.id);
  }
  return best;
}
