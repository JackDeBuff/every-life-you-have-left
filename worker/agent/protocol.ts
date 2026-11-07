/**
 * Wire protocol between SessionAgent (worker/agent/session-agent.ts) and the browser
 * (src/lib/agent-client.ts). Pure TS, no Worker or DOM APIs: imported by both sides and by
 * scripts/smoke-session.ts.
 *
 * Why not the SDK's built-in state sync: it re-sends the WHOLE state on every setState. Our state
 * grows to ~150 KB (45 years + branches + log), and changes several times a second (ticks, streamed
 * years, chat deltas). So the agent turns SDK protocol messages off, persists with setState
 * (debounced), and sends:
 *   { type: "elyl:snapshot", rev, state }   on connect (and after a cold start)
 *   { type: "elyl:patch", rev, set, splice } at most every ~50 ms
 * `set` replaces top-level keys. `splice[key] = { at, items }` means
 *   next[key] = prev[key].slice(0, at).concat(items)
 * which covers append (years streaming in), truncate (re-tune drops the buffered future), and
 * edit-in-place of the last item (a streaming chat message).
 *
 * RPC: the SDK's standard { type: "rpc", id, method, args } → { type: "rpc", id, success, result | error }.
 */
import type { DocKind, Ending, InterludeCut, SafetyResult } from "../../shared/engine";
import type { DomainKey } from "../../shared/domains";
import type { DecisionOption, SessionState } from "../../shared/sim";

// ---------------------------------------------------------------------------------------------
// The warm-up (D-090): up to 5 questions between Start and the first fork, in every mode.
// ---------------------------------------------------------------------------------------------

/** The research fast-path set (research/03 §1.2), in ask order. */
export const WARM_KEYS = ["now", "crossroads", "people", "fear", "unjudged"] as const;
export type WarmKey = (typeof WARM_KEYS)[number];

/** Where a covered answer came from: the start line or one of the uploads. */
export type WarmSource = "start" | DocKind;

export interface WarmQuestion {
  /** "w-<key>" */
  id: string;
  key: WarmKey;
  prompt: string;
  whyAsking: string;
  /** Quote the whyAsking line cites (personalized questions only). */
  whyQuoteId: string | null;
  /** 4 quick answers, first person (pre-written; later ones may be personalized in the background). */
  options: DecisionOption[];
  placeholder: string;
  domains: DomainKey[];
  /**
   * queued   not shown yet (will be asked)
   * asking   on screen now (warmup.current)
   * answered tapped and/or said
   * skipped  the user skipped it
   * covered  the start line or an upload already answers it: never asked
   */
  status: "queued" | "asking" | "answered" | "skipped" | "covered";
  covered: { by: WarmSource; confidence: number; evidence: string } | null;
  answer: { optionId: string | null; text: string | null; via: "text" | "voice" | "tap"; quoteId: string | null; at: string } | null;
  /** The options were rewritten for this person (fast model, before it was shown). */
  personal: boolean;
}

export interface WarmupState {
  /**
   * checking   reading the start line + uploads to see what's already answered (nothing on screen yet)
   * asking     a question is on screen (current)
   * finishing  all answered; the first fork is being written / refreshed
   * done       the first fork exists (phase moves to "deciding")
   */
  status: "checking" | "asking" | "finishing" | "done";
  questions: WarmQuestion[];
  current: string | null;
  /** The coverage check (one fast-model call) has landed, or failed (then everything is asked). */
  checked: boolean;
  /** Upload kinds they gave us (labels the "Here's what I learned" items). */
  docKinds: DocKind[];
  startedAt: string;
  doneAt: string | null;
}

/** answerWarmup(): a tap, words, or both; `skip` moves on without an answer. */
export interface WarmAnswerInput {
  questionId: string;
  optionId: string | null;
  text: string | null;
  via: "text" | "voice" | "tap";
  skip?: boolean;
}

/** forget(): remove one learned item from the profile ("warm" = a covered warm-up answer; it is asked instead). */
export type ForgetKind = "quote" | "fact" | "person" | "fear" | "value" | "plan" | "warm";

export interface ChatMessage {
  id: string;
  /** "interviewer" | "chosen" | branchId */
  life: string;
  age: number;
  role: "user" | "assistant";
  text: string;
  /** false while the assistant reply is still streaming */
  done: boolean;
  at: string;
}

/**
 * Fields the UI needs that shared/sim.ts SessionState doesn't have yet.
 * CONTRACT-REQUEST: fold these into SessionState (chat, interlude cuts, ending, safety, thinking).
 */
export interface SessionExtras {
  /** sayTo() conversation, all lives; filter by `life`. */
  chat: ChatMessage[];
  /** The current "Meanwhile, in your other lives…" cuts while phase === "interlude". */
  interlude: InterludeCut[] | null;
  /** Set when phase === "ended": verdicts + five-year answers ("chosen" or branchId). */
  ending: Ending | null;
  /** Last safety screen result for user free text; flagged → show 988 / crisis resources. */
  safety: SafetyResult | null;
  /** The engine is working (start, fork, buffer behind the playhead). Show "life is thinking…". */
  thinking: boolean;
  /** Last generated year of the chosen life (years > playhead.year are provisional). */
  bufferedTo: number | null;
  /**
   * The year of the next fork not answered yet (written or still planned), null = none left. The
   * clock holds the end of the year before it while a small card is open: a fork never cuts one off.
   */
  nextFork?: number | null;
  /**
   * 1x: this year's next small card is on its way (being written: a batch or a follow-up). The
   * clock holds the year's end for it, for a few seconds at most.
   */
  smallDue?: boolean;
  /** The ending is written (for the life as it stands): Auto plays its last years quicker then. */
  endingReady?: boolean;
  engine: "mock" | "real";
  /** Last non-fatal engine error code, for debugging. */
  error: string | null;
  /** Model spend so far in this session (USD, list prices; hedge losers that were aborted aren't counted). */
  usage?: SessionUsage | null;
  /** The warm-up (phase "warmup"); kept after it ends for the dialogue. null = none (offline demo, old sessions). */
  warmup?: WarmupState | null;
}

/** Session cost tally (admin + timing runs). The optional fields are for scripts/judge-run.ts. */
export interface SessionUsage {
  /** With implicit-cache hits billed at the cache discount (worker/engine/pricing.ts). */
  usd: number;
  calls: number;
  byPurpose: Record<string, number>;
  /** Same calls at list price (no cache discount). */
  listUsd?: number;
  /** Per full purpose ("decision.small", "decision.smallBatch", "answer.fold", "years", ...). */
  detail?: Record<string, { calls: number; usd: number; inTok: number; cachedTok: number; outTok: number }>;
  /** Per model id (recorded from Sat Nov 7 evening on; older sessions don't have it). Out includes thought tokens. */
  byModel?: Record<string, { calls: number; usd: number; inTok: number; outTok: number }>;
  /** D-089 small-card serving: cards served, how many came straight from the written-ahead queue, the wait for the rest. */
  smalls?: { served: number; fromQueue: number; waitMs: number; maxWaitMs: number; batches: number; discarded: number; followUps: number; folds: number; folded: number };
}

export type AgentState = SessionState & SessionExtras;

export const ARRAY_KEYS = [
  "years", "log", "decisions", "answers", "branches", "nudges", "portraits", "settings", "chat",
] as const satisfies readonly (keyof AgentState)[];
type ArrayKey = (typeof ARRAY_KEYS)[number];

export interface SnapshotMsg {
  type: "elyl:snapshot";
  rev: number;
  state: AgentState;
}
export interface PatchMsg {
  type: "elyl:patch";
  rev: number;
  set?: Partial<AgentState>;
  splice?: Partial<Record<ArrayKey, { at: number; items: unknown[] }>>;
}
export type ServerMsg = SnapshotMsg | PatchMsg;

const isArrayKey = (k: string): k is ArrayKey => (ARRAY_KEYS as readonly string[]).includes(k);

/**
 * Diff by reference: the agent updates state immutably, so an unchanged item is the same object.
 * Returns null when nothing changed.
 */
export function diffState(prev: AgentState, next: AgentState, rev: number): PatchMsg | null {
  const set: Record<string, unknown> = {};
  const splice: Record<string, { at: number; items: unknown[] }> = {};
  let changed = false;
  for (const key of Object.keys(next) as (keyof AgentState)[]) {
    const a = prev[key];
    const b = next[key];
    if (a === b) continue;
    if (isArrayKey(key) && Array.isArray(a) && Array.isArray(b)) {
      let i = 0;
      const n = Math.min(a.length, b.length);
      while (i < n && a[i] === b[i]) i++;
      if (i === a.length && i === b.length) continue;
      splice[key] = { at: i, items: b.slice(i) };
    } else {
      set[key] = b;
    }
    changed = true;
  }
  if (!changed) return null;
  const msg: PatchMsg = { type: "elyl:patch", rev };
  if (Object.keys(set).length) msg.set = set as Partial<AgentState>;
  if (Object.keys(splice).length) msg.splice = splice;
  return msg;
}

/** Apply a snapshot or patch. Returns a new object (top level) so React re-renders. */
export function applyServerMsg(state: AgentState | null, msg: ServerMsg): AgentState | null {
  if (msg.type === "elyl:snapshot") return msg.state;
  if (!state) return state; // patch before snapshot: wait for the snapshot
  const next = { ...state, ...(msg.set ?? {}) } as AgentState;
  const rec = next as unknown as Record<string, unknown[]>;
  for (const [key, sp] of Object.entries(msg.splice ?? {})) {
    if (!sp) continue;
    const cur = (rec[key] ?? []) as unknown[];
    rec[key] = cur.slice(0, sp.at).concat(sp.items);
  }
  return next;
}

export const isServerMsg = (m: unknown): m is ServerMsg =>
  !!m && typeof m === "object" && ((m as { type?: string }).type === "elyl:snapshot" || (m as { type?: string }).type === "elyl:patch");

/** Extra fields `answer()` accepts beyond the contract: `slid` = the user let a small decision slide. */
export type AnswerInput = {
  decisionId: string;
  optionId: string | null;
  text: string | null;
  via: "text" | "voice" | "tap";
  slid?: boolean;
};

/** URL path of a session agent (same origin). The Agents SDK routes /agents/<kebab-class>/<name>. */
export const agentPath = (sessionId: string) => `/agents/session-agent/${encodeURIComponent(sessionId)}`;
