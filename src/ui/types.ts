/**
 * What the UI reads. One shared session type end to end: `AgentState` from the wire protocol
 * (worker/agent/protocol.ts) = SessionState + chat, interlude, ending, safety, thinking, bufferedTo,
 * engine, error. The UI adds two derived fields on top (never sent to the agent):
 *   dialogue    the right-pane conversation, derived from decisions + answers + quotes + chat
 *   connection  the socket status (live) or "open" (offline mock)
 *
 * Both backends fill `ClientState`: the live agent (src/ui/live.ts) and the offline mock
 * (src/ui/mock/store.ts, `?demo=alex`).
 */
import type { Ending, InterludeCut, SafetyResult } from "../../shared/engine";
import type { SessionCalls } from "../../shared/sim";
import type { AgentState, AnswerInput, ChatMessage } from "../../worker/agent/protocol";

export type ChatRole = "guide" | "you" | "future" | "system";

/** One entry in the right-pane dialogue, or in a "talk to any version of you" thread. */
export interface ChatEntry {
  id: string;
  role: ChatRole;
  text: string;
  /** "main" = the right pane; `talk:<life>:<age>` = a thread with a future self. */
  channel: string;
  year: number | null;
  age: number | null;
  /** Set when this entry is a decision (rendered as a card) or an answer to one. */
  decisionId: string | null;
  /** Set when the text is the user's own words saved as a quote (serif italic + highlight target). */
  quoteId: string | null;
  /** true while text is still streaming in. */
  streaming: boolean;
  /** Twin replies vs letters (D-026). */
  form: "message" | "letter";
  at: number;
}

export type ConnectionStatus = "connecting" | "open" | "closed";
export type Backend = "live" | "mock";

export interface UiDerived {
  dialogue: ChatEntry[];
  connection: ConnectionStatus;
  backend: Backend;
}

export type ClientState = AgentState & UiDerived;

/**
 * Calls. `SessionCalls` with the agent's answer shape, plus client conveniences.
 * Conventions (same on both backends):
 *  - "Let it slide": answer({ decisionId, optionId: null, text: null, via: "tap", slid: true }).
 *  - Interlude finished (or skipped): pause(false) moves phase "interlude" → "playing".
 *  - sayTo(life, age, text): life = "interviewer" | "chosen" | branchId.
 */
export interface ClientCalls extends Omit<SessionCalls, "answer" | "addDocument"> {
  answer(a: AnswerInput): Promise<void>;
  /** Text from pdf.js (or a paste); the raw file, when there is one, goes to R2 via /api/upload. */
  addDocument(kind: "cv" | "linkedin" | "ai_export", text: string, file?: File | null): Promise<void>;
  /** Back to the start screen with a fresh session. */
  reset(): void;
  dismissSafety(): void;
}

export type { AgentState, AnswerInput, ChatMessage, Ending, InterludeCut, SafetyResult };
