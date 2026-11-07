/**
 * The decision card (SPEC §3): the question, why I'm asking, four genuinely different answers,
 * an always-visible "say more" box with hold-to-talk, and submit. Small ones slow the clock and
 * can slide; big ones dim the world and end in the fork moment.
 * The warm-up (D-090) uses the same card (`warm`): no clock, a step count, Skip, and Next.
 * Keys: 1–4 select · Enter submits · Shift+Enter new line. Enter is the card's only while the card
 * has focus (or nothing does): on a timeline ◆ or a setting it belongs to that control. The card
 * takes focus when it opens, and peeks hand it back when they close (TimelineBar).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SPEED_CONFIG, type Decision } from "../../../shared/sim";
import { rightPaneBusy } from "../activity";
import { clock } from "../clock";
import { HoldToTalk } from "../HoldToTalk";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { playForkMoment } from "../motion/forkMoment";
import { sim, useSim } from "../session";
import { useUi } from "../uiStore";

/** A warm-up question on the decision card: where it sits in the warm-up. */
export interface WarmCard {
  /** 1-based position among the questions being asked. */
  step: number;
  /** How many will be asked (known once the coverage check lands; null before). */
  total: number | null;
  /** Steps for the pips: done / now / next. */
  pips: ("done" | "now" | "next")[];
}

export function DecisionCard({ d, warm }: { d: Decision; warm?: WarmCard }) {
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
  const timeout = !big && !warm ? SPEED_CONFIG[speed].smallTimeoutSec : null;
  // 1× has no countdown, but a card can still be let go (the year waits for an open one).
  const slideAnyTime = !big && !warm && timeout === null;
  const canSubmit = (!!sel || text.trim().length > 1) && !busy;
  const lastWarm = !!warm && warm.total !== null && warm.step >= warm.total;

  // Take focus when the card opens, unless they're typing somewhere else (a setting, the composer).
  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const ae = document.activeElement as HTMLElement | null;
    const elsewhere = !!ae && ae !== document.body && !el.contains(ae) && !!ae.closest("input, textarea, select, [contenteditable=true], [role=slider], [role=combobox]");
    if (!elsewhere) el.focus({ preventScroll: true });
  }, []);

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

  // "Let it slide" (2×/4× only; 1× waits forever): a hairline drains over the timeout. It counts
  // only while life is playing, the card is on screen and the user is idle: any scroll, pointer,
  // key or focus in the right pane, an open dropdown, or the pointer resting on the card holds
  // it, and it resumes ~4 s after the last one. Choosing or typing stops it for good.
  useEffect(() => {
    if (!timeout || engaged || busy) return;
    const el = card.current;
    let remaining = timeout;
    let shown = timeout;
    let lastT = performance.now();
    let onScreen = true;
    let raf = 0;
    setLeft(timeout);
    const io = el && typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((e) => (onScreen = e[0]?.isIntersecting ?? true), { threshold: 0.5 }) : null;
    if (el && io) io.observe(el);
    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastT) / 1000);
      lastT = now;
      const s = sim();
      const counting = s.phase === "playing" && !s.playhead.paused && !document.hidden && onScreen && !rightPaneBusy(el);
      if (counting) remaining = Math.max(0, remaining - dt);
      if (drain.current) drain.current.style.transform = `scaleX(${remaining / timeout})`;
      if (Math.ceil(remaining) !== shown) setLeft((shown = Math.ceil(remaining)));
      if (remaining <= 0) {
        void slide();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeout, engaged, busy]);

  async function slide() {
    if (busy) return;
    setBusy(true);
    if (card.current && !reducedMotion()) await gsap.to(card.current, { opacity: 0, y: 16, height: 0, duration: 0.35, ease: "expo.in" });
    await sim().answer({ decisionId: d.id, optionId: null, text: null, via: "tap", slid: true });
  }

  /** Warm-up: send at once (the next question replaces this card when it lands); fade meanwhile. */
  async function sendWarm(skip: boolean) {
    if (busy || !card.current) return;
    if (!skip && !canSubmit) return;
    setBusy(true);
    const t = text.trim();
    const p = sim().answerWarmup(skip ? { questionId: d.id, optionId: null, text: null, via: "tap", skip: true } : { questionId: d.id, optionId: sel, text: t || null, via: t ? via : "tap" });
    if (!reducedMotion()) gsap.to(card.current, { opacity: 0.35, y: -6, duration: 0.2, ease: "expo.in" });
    try {
      await p;
    } catch {
      setBusy(false);
      if (card.current) gsap.to(card.current, { opacity: 1, y: 0, duration: 0.2 });
    }
  }

  async function submit() {
    if (!canSubmit || !card.current) return;
    if (warm) return sendWarm(false);
    setBusy(true);
    const answer = { decisionId: d.id, optionId: sel, text: text.trim() || null, via: text.trim() ? via : ("tap" as const) };
    if (big) {
      // Typed without a tap = their own path: never guess an option from shared words (QA: "I keep the
      // UK job..." was filed as "Quit the bank..."). The engine names the path from their words; all
      // four tiles fade as lives not chosen.
      const chosen = sel ?? "own";
      const titles = Object.fromEntries(d.options.map((o) => [o.id, o.branchTitle ?? o.label]));
      setForking({ decisionId: d.id, optionId: chosen });
      clock.hold("fork", true);
      const anim = playForkMoment(card.current, d.id, chosen, titles);
      await sim().answer(answer);
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
      // On the Steer tab the card is mounted but hidden: its keys are off.
      if (!card.current || card.current.getClientRects().length === 0) return;
      const typing = document.activeElement === ta.current;
      const other = (document.activeElement as HTMLElement | null)?.closest("input, select, [role=slider], [role=combobox]");
      if (other) return;
      if (!typing && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        setSel(d.options[Number(e.key) - 1]!.id);
        setEngaged(true);
      } else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        const ae = document.activeElement as HTMLElement | null;
        // Another control has focus (a timeline ◆ after a peek, a speed key): Enter is its own.
        if (ae && ae !== document.body && !card.current?.contains(ae)) return;
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
    <article
      className="dcard"
      ref={card}
      tabIndex={-1}
      data-kind={warm ? "warmup" : d.kind}
      aria-label={warm ? `Getting to know you, question ${warm.step}${warm.total ? ` of ${warm.total}` : ""}` : big ? "A big decision" : "A small decision"}
    >
      {timeout && !engaged && (
        <div className="dcard-drain" aria-hidden="true">
          <div ref={drain} />
        </div>
      )}
      <header className="dcard-head">
        {warm ? (
          <>
            <span className="dk">Before your life starts{warm.total ? ` · ${warm.step} of ${warm.total}` : ""}</span>
            <span className="warm-pips" aria-hidden="true">
              {warm.pips.map((p, i) => (
                <i key={i} data-p={p} />
              ))}
            </span>
          </>
        ) : big ? (
          <span className="dk big">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.3" />
            </svg>
            This one splits your life
          </span>
        ) : (
          <span className="dk">Small · time slows, it won't stop</span>
        )}
        {!warm && (
          <span className="label faint">
            {d.age} · {d.year}
          </span>
        )}
      </header>

      {/* Long questions step down a size so they stay within ~4 lines in the default pane width. */}
      <h2 className="dq" data-len={d.prompt.length > 170 ? "xl" : d.prompt.length > 110 ? "l" : undefined}>
        {d.prompt}
      </h2>
      {d.whyAsking && (
        <p className="dwhy">
          <span className="dwhy-k">Why I'm asking</span>
          <span className="dwhy-t">{quote ? <WhyWithQuote text={d.whyAsking} quote={quote.shortForm ?? quote.text} /> : d.whyAsking}</span>
        </p>
      )}

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
            {/* Key badge in its own column, the words in the other: the label wraps under itself, not under the key. */}
            <span className="tile-in">
              <span className="kc" aria-hidden="true">
                {sel === o.id ? <Icon name="check" size={12} /> : i + 1}
              </span>
              <span className="tile-words">
                {big && o.branchTitle && <span className="tile-fork">{o.branchTitle}</span>}
                <span className="tile-label">{o.label}</span>
                {o.hint && <span className="tile-hint">{o.hint}</span>}
              </span>
            </span>
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
            placeholder={sel && !warm ? `“I'd ${d.options.find((o) => o.id === sel)?.label.toLowerCase().replace(/^i'?d?\s/, "") ?? "do that"}, but only if…”` : sel ? "Add the details, in your own words…" : d.placeholder}
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
          {warm ? (
            <span>
              Your own words count most.<span className="say-micro-more"> I keep them, and every life will quote them back to you.</span>
            </span>
          ) : (
            <span>
              Your own words steer this life more than a tap.<span className="say-micro-more"> I keep them, and later turning points will quote them back to you.</span>
            </span>
          )}
        </p>
      </div>

      <footer className="dcard-foot">
        {warm ? (
          <button className="btn quiet sm skip" disabled={busy} onClick={() => void sendWarm(true)}>
            Skip this one
          </button>
        ) : timeout && !engaged && left !== null ? (
          <button className="btn quiet sm slide" onClick={() => void slide()}>
            Let it slide · {left}s
          </button>
        ) : slideAnyTime && !engaged ? (
          <button className="btn quiet sm slide" onClick={() => void slide()}>
            Let it slide
          </button>
        ) : (
          <span className="keys-hint faint meta">
            <span className="kbd">1</span>–<span className="kbd">4</span> pick · <span className="kbd">↵</span> decide<span className="kh-nl"> · <span className="kbd">⇧↵</span> new line</span>
          </span>
        )}
        <button className={`btn ${big || lastWarm ? "sun" : ""} decide`} disabled={!canSubmit} onClick={() => void submit()}>
          {warm ? (lastWarm ? "Start my life" : "Next") : big ? "Split here" : "Decide"} <Icon name="enter" size={14} />
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
