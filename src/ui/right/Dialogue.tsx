/**
 * Right pane (SPEC §1): two tabs, "Decisions" (the dialogue, with the decision card or the composer
 * at its foot) and "Steer this life" (the live settings, LiveSettings.tsx). The dialogue is a single
 * column in the Disco Elysium manner: no bubbles, speaker tags in small caps, and your own words
 * always in the serif.
 *
 * Layout contract (play.css `.right`): one flex column, the tab bar then the shown panel. In
 * Decisions, the card (or composer) takes its natural height first and the dialogue gets what is
 * left (flex-basis 0) and scrolls on its own. Both panels stay mounted (a half-typed answer
 * survives a look at Steer). A new card brings Decisions forward; a fork also locks Steer.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { LiveSettings, useFreshNudge } from "./LiveSettings";

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

type Tab = "decide" | "steer";
/** The Steer tab's "new" dot: shown until it is first opened (per page load, not per mount). */
let steerSeen = false;

/** `tabs={false}`: the phone's sheet (the phone has its own Steer tab). */
export function RightPane({ tabs = true }: { tabs?: boolean }) {
  const decisions = useSim((s) => s.decisions);
  const forking = useUi((s) => s.forking);
  const deciding = useSim((s) => s.phase === "deciding");
  const warm = useSim((s) => (s.phase === "warmup" ? (s.warmup ?? null) : null));
  const profile = useSim((s) => s.profile);
  // A due fork always takes the pane (it preempts a small card; the agent shelves that one).
  // (Two forks can be pending at once: the next one is written ~2 years ahead. Only the earliest is
  // due; a written-ahead fork never shows while life plays.)
  const pendingBig = deciding ? decisions.filter((d) => d.kind === "big" && d.status === "pending").sort((a, b) => a.year - b.year)[0] : undefined;
  const active = forking ? decisions.find((d) => d.id === forking.decisionId) : (pendingBig ?? decisions.find((d) => d.status === "pending" && d.kind === "small"));
  const big = active?.kind === "big";
  // The first fork is being written: its card's place shows that (never an empty pane).
  const firstPending = useSim((s) => s.phase !== "ended" && !!s.profile && !s.decisions.some((d) => d.kind === "big"));
  const wq = warm?.current ? warm.questions.find((q) => q.id === warm.current) : undefined;
  const wd = useMemo(() => (wq ? warmDecision(wq, profile) : null), [wq, profile?.startYear, profile?.age]); // eslint-disable-line react-hooks/exhaustive-deps
  const settingsCount = useSim((s) => s.settings.length);
  const highlight = useUi((s) => s.highlight);
  const fresh = useFreshNudge();
  const [tab, setTabState] = useState<Tab>("decide");
  const [seen, setSeen] = useState(steerSeen);
  const steerAt = useRef(0);
  const ids = useId();
  const setTab = (t: Tab) => {
    setTabState(t);
    if (t === "steer" && !steerSeen) {
      steerSeen = true;
      setSeen(true);
    }
  };
  const activeId = active?.id ?? null;
  // A new card brings the Decisions tab forward, unless they are mid-nudge (touched Steer in the
  // last few seconds): then the Decisions tab says a card is waiting. A fork always comes forward.
  useLayoutEffect(() => {
    if (!activeId) return;
    if (big || performance.now() - steerAt.current > 4000) setTabState("decide");
  }, [activeId, big]);
  // "Show me where I said that" lives in the conversation.
  useEffect(() => {
    if (highlight) setTabState("decide");
  }, [highlight]);
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
  const decide = (
    <>
      <Dialogue hidden={big} />
      {active ? <DecisionCard key={active.id} d={active} /> : firstPending ? <CardPending /> : <Composer />}
    </>
  );
  if (!tabs) {
    return (
      <aside className="pane right" data-region="right" data-big={big} data-card={!!active} aria-label="Conversation">
        {decide}
      </aside>
    );
  }
  const shown: Tab = big ? "decide" : tab;
  const waiting = !!active && shown === "steer";
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const to: Tab = e.key === "Home" ? "decide" : e.key === "End" ? "steer" : shown === "decide" ? "steer" : "decide";
    if (to === "steer" && big) return;
    setTab(to);
    document.getElementById(`${ids}-tab-${to}`)?.focus();
  };
  return (
    <aside className="pane right" data-region="right" data-big={big} data-card={!!active} data-tab={shown} aria-label="Decisions and life settings">
      <div className="rp-tabs" role="tablist" aria-label="Right pane" onKeyDown={onTabKey}>
        <button
          type="button"
          role="tab"
          id={`${ids}-tab-decide`}
          className="rp-tab"
          aria-selected={shown === "decide"}
          aria-controls={`${ids}-panel-decide`}
          tabIndex={shown === "decide" ? 0 : -1}
          onClick={() => setTab("decide")}
        >
          <Icon name="chat" size={15} />
          <span>Decisions</span>
          {waiting && (
            <span className="rp-badge" data-tone="sun" aria-label="a decision is waiting">
              1 waiting
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          id={`${ids}-tab-steer`}
          className="rp-tab"
          aria-selected={shown === "steer"}
          aria-controls={`${ids}-panel-steer`}
          aria-disabled={big}
          tabIndex={shown === "steer" ? 0 : -1}
          title={big ? "Decide the fork first" : "Nudge this life from next year on"}
          onClick={() => !big && setTab("steer")}
        >
          <Icon name="sliders" size={15} />
          <span>Steer this life</span>
          {settingsCount > 0 && <span className="rp-badge">{settingsCount}</span>}
          {(fresh || (!seen && settingsCount > 0)) && shown !== "steer" && <span className="rp-dot" aria-label={fresh ? "a nudge was just applied" : "new"} />}
        </button>
      </div>
      <div
        className="rp-panel rp-decide"
        role="tabpanel"
        id={`${ids}-panel-decide`}
        aria-labelledby={`${ids}-tab-decide`}
        hidden={shown !== "decide"}
      >
        {decide}
      </div>
      <div
        className="rp-panel rp-steer"
        role="tabpanel"
        id={`${ids}-panel-steer`}
        aria-labelledby={`${ids}-tab-steer`}
        hidden={shown !== "steer"}
        onPointerDownCapture={() => (steerAt.current = performance.now())}
        onKeyDownCapture={() => (steerAt.current = performance.now())}
        onFocusCapture={() => (steerAt.current = performance.now())}
      >
        <LiveSettings />
        {active && !big && (
          <button type="button" className="rp-back" onClick={() => setTab("decide")}>
            <span className="rp-back-dot" aria-hidden="true" />A decision is waiting <Icon name="arrowRight" size={13} />
          </button>
        )}
      </div>
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
