/**
 * What the UI reads beyond `SessionState`. The mock store fills these today; the real session agent
 * should expose the same fields (see the CONTRACT-REQUESTs below) so the lead can swap the client.
 */
import type { Ending, InterludeCut, SafetyResult } from "../../shared/engine";
import type { SessionCalls, SessionState } from "../../shared/sim";

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

// CONTRACT-REQUEST: SessionState has no chat transcript, interlude cuts, ending payload or safety
// flag. The UI needs them as synced state. Proposed additions to SessionState:
//   chat: ChatEntry[]; interlude: InterludeCut[] | null; ending: Ending | null; safety: SafetyResult | null
export interface ClientExtras {
  chat: ChatEntry[];
  interlude: InterludeCut[] | null;
  ending: Ending | null;
  safety: SafetyResult | null;
}

export type ClientState = SessionState & ClientExtras;

/**
 * Calls. Everything is `SessionCalls` except two client conveniences.
 * Conventions the UI relies on (tell the engine side):
 *  - "Let it slide": answer({ decisionId, optionId: null, text: null, via: "tap" }) marks a small decision slid.
 *  - Interlude finished: pause(false) moves phase "interlude" → "playing".
 */
export interface ClientCalls extends SessionCalls {
  /** Back to the start screen with a fresh session. */
  reset(): void;
  dismissSafety(): void;
}

export type { Ending, InterludeCut, SafetyResult };
