/**
 * The boundary between the session agent (worker/agent, owns state + transport + storage) and the
 * simulation engine (worker/engine, owns prompts + generation + rules). The agent calls these; the
 * engine never touches storage or sockets. Keep functions deterministic where marked (pure, no LLM).
 */
import type { Profile, Quote } from "./schema";
import type {
  Branch,
  Decision,
  DecisionAnswer,
  DecisionKind,
  LiveSetting,
  LogLine,
  SceneSpec,
  SessionState,
  SimYear,
  StartInput,
} from "./sim";

export type DocKind = "cv" | "linkedin" | "ai_export";
export interface DocInput { kind: DocKind; text: string }

/** Pure: which years get decisions, given speed budgets, years left and worry weights. */
export interface DecisionSlot { year: number; age: number; kind: DecisionKind; reason: string }

export interface InterludeCut { branchId: string; title: string; age: number; scene: SceneSpec; caption: string }

export interface Ending {
  verdict: string;
  branchVerdicts: Record<string, string>;
  /** "Where do you see yourself in five years?" — key "chosen" or a branchId. */
  fiveYear: Record<string, string>;
}

export interface SafetyResult { flagged: boolean; kind: "self_harm" | "abuse" | "other" | null }

/**
 * A fork worked out while its card is still being read (speculative): the coarse branch for EVERY
 * option, the active branches advanced to the fork year, and interlude captions for all of them.
 * Passing it to spawnBranches() and interlude() makes the "meanwhile" cuts ready at once.
 */
export interface PreparedFork {
  decisionId: string;
  fresh: Branch[];
  advanced: Branch[];
  /** branchId → caption at the fork's year. */
  captions: Record<string, string>;
}

export interface Engine {
  /** Build the first profile from the start line (+ any docs). Quotes are verbatim from the user. */
  startProfile(input: StartInput, docs: DocInput[]): Promise<Profile>;
  /** Add an uploaded document or a free-text answer to the profile; returns new quotes created. */
  enrichProfile(profile: Profile, docs: DocInput[], freeText: string | null): Promise<{ profile: Profile; quotes: Quote[] }>;

  /** PURE. Schedule decisions for the remaining life (re-run when speed changes). */
  planSlots(state: SessionState): DecisionSlot[];
  /** Write the decision for a slot. Big → 4 genuinely different forks with branchTitle. */
  makeDecision(state: SessionState, slot: DecisionSlot): Promise<Decision>;
  /** Fold an answer into the profile (text → quote, worries/values updated). */
  applyAnswer(state: SessionState, decision: Decision, answer: DecisionAnswer): Promise<{ profile: Profile; quote: Quote | null }>;

  /** Generate the chosen life from `fromYear` for `count` years, streaming each finished year. */
  generateYears(state: SessionState, fromYear: number, count: number, onYear: (y: SimYear) => void): Promise<SimYear[]>;
  /** PURE. Log lines for one year (summary, events with why, nudges, decisions). */
  logFor(state: SessionState, year: SimYear): LogLine[];

  /** After a big decision: the 3 unchosen options become branches; return the 3 most divergent active ones overall. */
  spawnBranches(state: SessionState, decision: Decision, chosenOptionId: string, prepared?: PreparedFork | null): Promise<Branch[]>;
  /** Optional, speculative: prepare a fork while its card is open (see PreparedFork). */
  prepareFork?(state: SessionState, decision: Decision): Promise<PreparedFork>;
  /** Advance a hidden branch coarsely (5-year steps) up to `untilYear`; `fine` = yearly (on peek). */
  stepBranch(state: SessionState, branch: Branch, untilYear: number, fine: boolean): Promise<Branch>;
  /** "Meanwhile, in your other lives…" — one cut per active branch at the current year. */
  interlude(state: SessionState, prepared?: PreparedFork | null): Promise<InterludeCut[]>;

  /** 3–5 live settings generated from the user's answers (start + after each big decision). */
  settingsFor(state: SessionState): Promise<LiveSetting[]>;

  /** Verdicts at the end age + five-year answers. */
  ending(state: SessionState): Promise<Ending>;
  /** Chat as the interviewer ("interviewer"), the chosen life ("chosen"), or a branch, at an age. Streams text. */
  replyAs(state: SessionState, life: string, age: number, history: { role: "user" | "assistant"; text: string }[], text: string): AsyncIterable<string>;

  /** Screen any free text before use; flagged → UI shows crisis resources (988). */
  safety(text: string): Promise<SafetyResult>;
}
