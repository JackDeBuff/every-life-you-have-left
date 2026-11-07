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
import type { Ending, InterludeCut, SafetyResult } from "../../shared/engine";
import type { SessionState } from "../../shared/sim";

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
  engine: "mock" | "real";
  /** Last non-fatal engine error code, for debugging. */
  error: string | null;
  /** Model spend so far in this session (USD, list prices; hedge losers that were aborted aren't counted). */
  usage?: SessionUsage | null;
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
