/**
 * Right pane (SPEC §1): live settings on top, the dialogue as the largest area, the decision card
 * at the foot. The dialogue is a single column in the Disco Elysium manner: no bubbles, speaker
 * tags in small caps, and your own words always in the serif.
 *
 * Layout contract (play.css `.right`): one flex column. The card (or composer) takes its natural
 * height first; the settings fold to a one-line bar while a card is open; the dialogue gets what is
 * left (flex-basis 0) and scrolls on its own. Nothing overlaps the card.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "../../../shared/schema";
import type { Decision } from "../../../shared/sim";
import { HoldToTalk } from "../HoldToTalk";
import { Icon } from "../icons";
import { Learned } from "../middle/Learned";
import { sim, useSim } from "../session";
import type { ChatEntry, WarmQuestion, WarmupState } from "../types";
import { useUi } from "../uiStore";
import { CardPending } from "./CardPending";
import { DecisionCard, type WarmCard } from "./DecisionCard";
import { LiveSettings } from "./LiveSettings";

/** A warm-up question on the decision card (D-090). */
function warmDecision(q: WarmQuestion, p: Profile | null): Decision {
  return {
    id: q.id, kind: "small", year: p?.startYear ?? 0, age: p?.age ?? 0, domains: q.domains, prompt: q.prompt,
    whyAsking: q.whyAsking, whyQuoteId: q.whyQuoteId, options: q.options, placeholder: q.placeholder, status: "pending",
  };
}

function warmInfo(w: WarmupState, current: string): WarmCard {
  const asked = w.questions.filter((q) => q.status !== "covered");
  const pips = asked.map((q): WarmCard["pips"][number] => (q.id === current ? "now" : q.status === "answered" || q.status === "skipped" ? "done" : "next"));
  return { step: Math.max(1, asked.findIndex((q) => q.id === current) + 1), total: w.checked ? asked.length : null, pips };
}

export function RightPane() {
  const decisions = useSim((s) => s.decisions);
  const forking = useUi((s) => s.forking);
  const deciding = useSim((s) => s.phase === "deciding");
  const warm = useSim((s) => (s.phase === "warmup" ? (s.warmup ?? null) : null));
  const profile = useSim((s) => s.profile);
  // A due fork always takes the pane (it preempts a small card; the agent shelves that one).
  const pendingBig = deciding ? decisions.find((d) => d.kind === "big" && d.status === "pending") : undefined;
  const active = forking ? decisions.find((d) => d.id === forking.decisionId) : (pendingBig ?? decisions.find((d) => d.status === "pending"));
  const big = active?.kind === "big";
  // The first fork is being written: its card's place shows that (never an empty pane).
  const firstPending = useSim((s) => s.phase !== "ended" && !!s.profile && !s.decisions.some((d) => d.kind === "big"));
  const wq = warm?.current ? warm.questions.find((q) => q.id === warm.current) : undefined;
  const wd = useMemo(() => (wq ? warmDecision(wq, profile) : null), [wq, profile?.startYear, profile?.age]); // eslint-disable-line react-hooks/exhaustive-deps
  if (warm) {
    // The warm-up (D-090): its questions on the decision card; settings come after it.
    return (
      <aside className="pane right" data-region="right" data-card="true" data-warm="true" aria-label="Getting to know you">
        <Learned compact />
        <Dialogue hidden={false} />
        {wq && wd ? <DecisionCard key={wq.id} d={wd} warm={warmInfo(warm, wq.id)} /> : <CardPending variant={warm.status === "checking" ? "reading" : "fork"} />}
      </aside>
    );
  }
  return (
    <aside className="pane right" data-region="right" data-big={big} data-card={!!active} aria-label="Settings and conversation">
      <LiveSettings pending={active ? { id: active.id, big } : null} />
      <Dialogue hidden={big} />
      {active ? <DecisionCard key={active.id} d={active} /> : firstPending ? <CardPending /> : <Composer />}
    </aside>
  );
}

function Dialogue({ hidden }: { hidden: boolean }) {
  const chat = useSim((s) => s.dialogue);
  const decisions = useSim((s) => s.decisions);
  const forking = useUi((s) => s.forking);
  const highlight = useUi((s) => s.highlight);
  const box = useRef<HTMLDivElement>(null);
  const main = useMemo(() => chat.filter((c) => c.channel === "main"), [chat]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: main.length < 4 ? "auto" : "smooth" });
  }, [main.length, hidden]);

  // When the pane grows back after a big decision, keep the newest line in view.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      el.scrollTop = el.scrollHeight;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!highlight || !box.current) return;
    const el = box.current.querySelector<HTMLElement>(`[data-quote-id="${highlight.quoteId}"] mark`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("hl-sweep");
    void el.offsetWidth;
    el.classList.add("hl-sweep");
  }, [highlight]);

  return (
    <div className="dialogue scroll" ref={box} data-hidden={hidden} aria-hidden={hidden} role="log" aria-label="Conversation">
      {main.map((c, i) => {
        if (c.decisionId && c.role === "guide") {
          const d = decisions.find((x) => x.id === c.decisionId);
          if (!d || d.status === "pending" || forking?.decisionId === d.id) return null;
          return (
            <div key={c.id} className="dl dl-q" data-kind={d.kind}>
              <span className="dl-tag label">
                {d.kind === "big" ? "Fork" : "Asked"} · {d.age}
              </span>
              <p>{d.prompt}</p>
            </div>
          );
        }
        const prev = main[i - 1];
        const cont = !!prev && prev.role === "you" && c.role === "you" && prev.age === c.age && !prev.decisionId && !c.decisionId;
        return <Entry key={c.id} c={c} cont={cont} />;
      })}
    </div>
  );
}

function Entry({ c, cont = false }: { c: ChatEntry; cont?: boolean }) {
  if (c.role === "you") {
    return (
      <div className="dl dl-you" data-cont={cont} data-quote-id={c.quoteId ?? undefined}>
        {!cont && <span className="dl-tag label you">You{c.age !== null ? ` · ${c.age}` : ""}</span>}
        {c.quoteId ? (
          <p className="voice">
            <mark>{c.text}</mark>
          </p>
        ) : (
          <p className="dl-pick">
            <Icon name="check" size={12} /> {c.text}
          </p>
        )}
      </div>
    );
  }
  if (c.role === "system") return <p className="dl dl-sys small faint">{c.text}</p>;
  return (
    <div className="dl dl-guide">
      <p>{c.text}</p>
    </div>
  );
}

/** When no decision is open: say anything, any time. It becomes a quote and shapes next year. */
function Composer() {
  const [text, setText] = useState("");
  const [micNote, setMicNote] = useState<string | null>(null);
  const phase = useSim((s) => s.phase);
  const age = useSim((s) => s.playhead.age);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    void sim().sayTo("interviewer", age, t);
    setText("");
  };
  return (
    <div className="composer">
      <div className="say-field">
        <textarea
          className="textarea voice-input"
          rows={2}
          value={text}
          disabled={phase === "ended"}
          placeholder="Tell me anything about you, any time. It shapes the years ahead."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <HoldToTalk compact hint="free" onText={(t) => setText((x) => (x.trim() ? `${x.trim()} ${t}` : t))} onNotice={setMicNote} />
        <button className="btn sm send" disabled={!text.trim()} onClick={send} aria-label="Send">
          <Icon name="send" size={14} />
        </button>
      </div>
      {micNote && (
        <p className="say-note" role="status">
          <Icon name="info" size={12} /> {micNote}
        </p>
      )}
    </div>
  );
}
