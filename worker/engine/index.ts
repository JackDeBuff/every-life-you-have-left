/**
 * The simulation engine (shared/engine.ts). Owns prompts, generation and rules; never touches
 * storage or sockets. Dependencies are injected so node scripts (scripts/eval) can run it.
 *
 *   const engine = createEngine({ llm: createFetchLlm({ apiKey, project }) });
 *
 * Architecture: "code owns the odds, the LLM owns the story" (research/03 §3.2).
 *   - code: world timeline (≤2 world events, shared by every life), base-rate hazards and
 *     sampled beats, budgets + cooldowns, money anchors, quiet years, validator, scene sanity
 *   - model: the words: decisions, years, captions, verdicts, chat
 *   - validator + one repair call per bad year, then a code fallback
 * Models: heavy = gemini-3.8-flash (thinking low) for lives/big decisions/profile/ending/chat;
 * fast = gemini-3.5-flash-lite for small decisions, answer folding, safety, captions and the
 * coarse hidden branches. Calls are hedged against the slow-first-token tail.
 *
 * WIRING (for the session agent; this is what scripts/eval/session.ts does):
 *   start(input)      IN PARALLEL: profile = startProfile(input, docs)   (~10 s)
 *                                  card0 = makeDecision({...state, profile: provisionalProfile(input)}, today slot)  (~5 s)
 *                     then state.profile = profile; state.endAge = profile.endAge;
 *                     slots = planSlots(state) (slot 0 = today; card0 answers it); budgets = budgetsFor(slots);
 *                     settingsFor(state) in the background
 *   answer(a)         safety(a.text) first (flagged → crisis card, stop)
 *                     { profile, quote } = applyAnswer(state, decision, a); store a.quoteId = quote?.id
 *                     decision.status = "answered"; then IN PARALLEL:
 *                       spawnBranches(state, decision, a.optionId) → replaces the active branches
 *                         (anything not returned is retired)
 *                       generateYears(state, decision.year, 4..5, onYear)  (stream years to the client)
 *                       settingsFor(state)
 *                     then interlude(state) → 3 cuts ("Meanwhile, in your other lives...")
 *   tick(year)        keep >= 2 years buffered: generateYears(state, lastYear + 1, 3..5, onYear);
 *                     before a slot's year, makeDecision(state, slot) so the card is ready
 *   nudge(id, to)     push a SettingNudge {year: playhead.year}; regenerate from playhead.year + 1
 *   setSpeed(s)       planSlots(state) again (it rescales the remaining budget)
 *   peekBranch(id)    stepBranch(state, branch, playhead.year, true)
 *   end               ending(state) → verdicts + five-year answers
 *   sayTo(life, age)  replyAs(...) streams text; safety() the user's text first
 * Years returned for year >= fromYear replace the provisional ones in state.years.
 * interlude()/ending() also write advanced branch years back into state.branches (in place).
 */
import type { DocInput, Engine, PreparedFork } from "../../shared/engine";
import type { Branch, Decision, DecisionAnswer, SessionState, SimYear, StartInput } from "../../shared/sim";
import { captionsFor, coarseYears, selectDiverse, stepBranchTo, interludeCuts, type BranchEnv } from "./branches";
import { reply } from "./chat";
import { decisionsBlock, settingsBlock } from "./context";
import { makeDecisionFor } from "./decisions";
import { endingFor, logLines, safetyCheck, settingsForState } from "./extras";
import type { LlmPort } from "./llm-port";
import { createCaller, DEFAULT_MODELS, type EngineModels, type UsageEvent } from "./models";
import { buildStartProfile, emptyProfile, enrich, foldAnswer, quotesFromText } from "./profile";
import type { Profile } from "../../shared/schema";
import { planSlotsFor } from "./slots";
import { nowIso } from "./util";
import { worldTimeline } from "./world";
import { chosenPath } from "./money";
import { decisionIdsIn, writeYears, type WriterEnv, type YearMetric } from "./years";
import { warmupWith, type WarmupPort } from "./warmup";

export type { EngineModels, UsageEvent, YearMetric, WarmupPort };
export { createFetchLlm } from "./llm-port";
export type { LlmPort } from "./llm-port";

export interface EngineDeps {
  llm: LlmPort;
  /** Override any model (the eval swaps `heavy`). If heavy is set and repair isn't, repair = heavy. */
  models?: Partial<EngineModels>;
  now?: () => Date;
  /** Every model call's tokens and latency (cost accounting, admin, eval). */
  onUsage?: (u: UsageEvent) => void;
  /** Per-year validator outcome (schema-valid, repaired, fallback...). */
  onMetric?: (m: YearMetric) => void;
}

const endYearOf = (s: SessionState) => s.profile!.birthYear + (s.endAge || s.profile!.endAge);

/** The shared world timeline for a session (deterministic; the same for every life). */
export function worldFor(state: SessionState) {
  const p = state.profile!;
  return worldTimeline(p.sessionId, p.startYear, endYearOf(state));
}

export function createEngine(deps: EngineDeps): Engine {
  const models: EngineModels = {
    ...DEFAULT_MODELS,
    ...deps.models,
    repair: deps.models?.repair ?? deps.models?.heavy ?? DEFAULT_MODELS.repair,
    // an explicit yearsBySpeed replaces the default ({} = heavy model at every speed)
    yearsBySpeed: deps.models?.yearsBySpeed ?? DEFAULT_MODELS.yearsBySpeed,
  };
  const call = createCaller({ llm: deps.llm, models, onUsage: deps.onUsage });
  const at = () => nowIso(deps.now);

  const writerEnv = (state: SessionState): WriterEnv => {
    const p = state.profile!;
    return {
      call,
      profile: p,
      world: worldFor(state),
      span: Math.max(10, (state.endAge || p.endAge) - p.age),
      seed: p.sessionId,
      onMetric: deps.onMetric,
    };
  };
  const branchEnv = (state: SessionState): BranchEnv => ({ writer: writerEnv(state), call });

  /** What the chosen life must show in [from, to]: answered decisions, slides and nudges. */
  function mustShowFor(state: SessionState, from: number, to: number): { text: string; focus: string[] } {
    const lines: string[] = [];
    const focus: string[] = [];
    for (const d of state.decisions.filter((x) => x.year >= from - 1 && x.year <= to && x.status !== "pending")) {
      const a = state.answers.find((x) => x.decisionId === d.id);
      const opt = a?.optionId ? d.options.find((o) => o.id === a.optionId) : undefined;
      const qid = a?.quoteId ?? d.whyQuoteId ?? state.profile!.quotes[0]?.id;
      if (a?.quoteId) focus.push(a.quoteId);
      if (d.whyQuoteId) focus.push(d.whyQuoteId);
      if (d.status === "slid") {
        lines.push(`${d.year}: they let "${d.prompt}" slide. Life follows its inertia there; no dramatic consequence.`);
      } else if (d.kind === "big") {
        lines.push(
          `${d.year} (${d.age}): they chose "${opt?.label ?? "their own answer"}"${opt?.branchTitle ? ` (${opt.branchTitle})` : ""}${a?.text ? ` and said, in their words: "${a.text}"` : ""}. Show the consequence in ${d.year}-${d.year + 1} as a turning point with cause.quoteId ${qid}. If they added conditions in their own words, honour them: their words count more than the tap.`,
        );
      } else {
        lines.push(
          `${d.year}: small moment "${d.prompt}" -> ${opt ? `"${opt.label}"` : "their own answer"}${a?.text ? `, "${a.text}"` : ""}. Let it colour this year or the next (texture, or a turning point citing ${qid} if it really turns something).`,
        );
      }
    }
    for (const n of state.nudges.filter((x) => x.year >= from - 1 && x.year < to)) {
      const s = state.settings.find((x) => x.id === n.settingId);
      if (s) lines.push(`From ${n.year + 1}: the setting "${s.label}" changed (${s.hint}). Make it visible within 1-2 years in a summary or an event${s.sourceQuoteIds[0] ? `, citing ${s.sourceQuoteIds[0]} if it turns something` : ""}.`);
    }
    return { text: lines.join("\n"), focus };
  }

  /** Ensure branch years reach `untilYear` (coarse) and write the result back into state in place. */
  async function advanceBranches(state: SessionState, untilYear: number, needSnapshotNear: boolean): Promise<Branch[]> {
    const endYear = endYearOf(state);
    const env = branchEnv(state);
    const active = state.branches.filter((b) => b.status === "active");
    const stepped = await Promise.all(
      active.map(async (b) => {
        const years = coarseYears(b, untilYear, endYear);
        const lastYear = years.at(-1) ?? b.years.at(-1)?.year ?? b.forkYear - 1;
        if (needSnapshotNear && lastYear < untilYear - 2 && untilYear <= endYear) years.push(untilYear);
        if (!years.length) return b;
        try {
          return await stepBranchTo(env, state, b, years, false);
        } catch {
          return b;
        }
      }),
    );
    // CONTRACT-REQUEST: interlude()/ending() should return updated branches; until then they are
    // written back into state.branches in place so the agent persists them with the state.
    for (const b of stepped) {
      const i = state.branches.findIndex((x) => x.id === b.id);
      if (i >= 0) state.branches[i] = b;
    }
    return stepped;
  }

  const engine: Engine = {
    async startProfile(input, docs: DocInput[]) {
      const now = deps.now ? deps.now() : new Date();
      return buildStartProfile(call, input, docs, now.getFullYear(), at());
    },

    async enrichProfile(profile, docs, freeText) {
      return enrich(call, profile, docs, freeText, at());
    },

    planSlots(state) {
      return planSlotsFor(state);
    },

    async makeDecision(state, slot) {
      return makeDecisionFor(call, state, slot);
    },

    async applyAnswer(state: SessionState, decision: Decision, answer: DecisionAnswer) {
      return foldAnswer(call, state, decision, answer, at());
    },

    async generateYears(state, fromYear, count, onYear) {
      const p = state.profile;
      if (!p) throw new Error("generateYears: state.profile is null");
      const endYear = endYearOf(state);
      const last = Math.min(endYear, fromYear + Math.max(1, count) - 1);
      const years: number[] = [];
      for (let y = Math.max(fromYear, p.startYear); y <= last; y++) years.push(y);
      if (!years.length) return [];
      const past = state.years.filter((y) => y.year < years[0]!);
      const { text: mustShow, focus } = mustShowFor(state, years[0]!, last);
      const latestFork = state.decisions.filter((d) => d.kind === "big" && d.status === "answered" && d.year <= last).at(-1);
      const forkOpt = latestFork?.options.find((o) => o.id === state.answers.find((a) => a.decisionId === latestFork.id)?.optionId);
      const spec = {
        idPrefix: "you",
        lifeLabel: `Their chosen life ("Your Path"): the one they steer with their own decisions and settings.${forkOpt?.branchTitle ? ` Latest fork: "${forkOpt.branchTitle}" at ${latestFork!.age}.` : ""}`,
        past,
        decisions: decisionsBlock(state, last),
        mustShow,
        focusQuoteIds: [...new Set([...focus, ...p.quotes.slice(-3).map((q) => q.id)])].slice(0, 6),
        settings: settingsBlock(state.settings, state.nudges, last),
        coarse: false,
        tier: "heavy" as const,
        model: models.yearsBySpeed[state.speed],
        // hybrid: right after a fork the heavy model writes the consequence years, the speed model the rest
        lead: models.yearsBySpeed[state.speed] && state.decisions.some((d) => d.kind === "big" && d.status === "answered" && d.year === years[0])
          ? { count: models.forkLeadYears, model: models.heavy }
          : undefined,
        decisionIdsFor: decisionIdsIn(state.decisions),
        money: chosenPath(state.decisions, state.answers, p.sessionId),
      };
      return writeYears(writerEnv(state), spec, years, onYear);
    },

    logFor(state, year: SimYear) {
      return logLines(state, year);
    },

    async spawnBranches(state, decision, chosenOptionId, prepared) {
      const p = state.profile!;
      const endYear = endYearOf(state);
      const env = branchEnv(state);
      const ready = prepared?.decisionId === decision.id ? prepared : null;
      const fresh: Branch[] = decision.options
        .filter((o) => o.id !== chosenOptionId)
        .map((o) => ({
          id: `b-${decision.id}-${o.id}`,
          forkDecisionId: decision.id,
          optionId: o.id,
          title: o.branchTitle ?? o.label,
          forkYear: decision.year,
          forkAge: decision.year - p.birthYear,
          status: "active" as const,
          years: [],
          verdictAtEnd: null,
          divergence: 0,
        }));
      const until = Math.min(endYear, decision.year + 10);
      const stepped = await Promise.all(
        fresh.map(async (b) => {
          // Written while the card was open (prepareFork): use it as is.
          const pre = ready?.fresh.find((x) => x.id === b.id && x.years.length);
          if (pre) return { ...pre, status: "active" as const };
          try {
            return await stepBranchTo(env, state, b, coarseYears(b, until, endYear), false);
          } catch {
            return b;
          }
        }),
      );
      const advanced = new Map((ready?.advanced ?? []).map((b) => [b.id, b]));
      const existing = state.branches
        .filter((b) => b.status === "active" && !stepped.some((s) => s.id === b.id))
        .map((b) => {
          const a = advanced.get(b.id);
          return a && a.years.length >= b.years.length ? { ...b, years: a.years } : b;
        });
      const { keep } = selectDiverse([...existing, ...stepped], state.years, 3);
      return keep;
    },

    async prepareFork(state, decision): Promise<PreparedFork> {
      const p = state.profile!;
      const endYear = endYearOf(state);
      const env = branchEnv(state);
      // Every option, as if it were the one not chosen: the chosen one is dropped at the answer
      // (one extra coarse branch per fork, ~+10% of a session's spend).
      const fresh = decision.options.map((o) => ({
        id: `b-${decision.id}-${o.id}`,
        forkDecisionId: decision.id,
        optionId: o.id,
        title: o.branchTitle ?? o.label,
        forkYear: decision.year,
        forkAge: decision.year - p.birthYear,
        status: "active" as const,
        years: [] as SimYear[],
        verdictAtEnd: null,
        divergence: 0,
      }));
      // Four calls at a time (one round for a first fork): a Worker holds ~6 open connections, and the chosen life's own
      // stream must never queue behind speculative work.
      const limit = gate(4);
      const step = (b: Branch, years: number[]) => (years.length ? limit(() => stepBranchTo(env, state, b, years, false)).catch(() => b) : Promise.resolve(b));
      const [written, advanced] = await Promise.all([
        // Only the fork-year snapshot (what the interlude shows); kept branches are stepped on in
        // 5-year steps as the playhead moves, so the option that wins costs a single snapshot.
        Promise.all(fresh.map((b) => step(b, [decision.year]))),
        // The interlude shows each life near the fork year: the same work interlude() would do.
        Promise.all(
          state.branches
            .filter((b) => b.status === "active")
            .map((b) => {
              const years = coarseYears(b, decision.year, endYear);
              const lastYear = years.at(-1) ?? b.years.at(-1)?.year ?? b.forkYear - 1;
              if (lastYear < decision.year - 2 && decision.year <= endYear) years.push(decision.year);
              return step(b, years);
            }),
        ),
      ]);
      const atFork = { ...state, playhead: { ...state.playhead, year: decision.year, age: decision.age } };
      const captions = await captionsFor(env, atFork, [...advanced, ...written], decision.year);
      return { decisionId: decision.id, fresh: written, advanced, captions: Object.fromEntries(captions) };
    },

    async stepBranch(state, branch, untilYear, fine) {
      const endYear = endYearOf(state);
      const env = branchEnv(state);
      if (fine) {
        const years: number[] = [];
        for (let y = branch.forkYear; y <= Math.min(untilYear, endYear); y++) years.push(y);
        return stepBranchTo(env, state, branch, years, true);
      }
      return stepBranchTo(env, state, branch, coarseYears(branch, untilYear, endYear), false);
    },

    async interlude(state, prepared) {
      const stepped = await advanceBranches(state, state.playhead.year, true);
      const known = prepared && state.decisions.some((d) => d.id === prepared.decisionId && d.year === state.playhead.year) ? prepared.captions : undefined;
      return interludeCuts(branchEnv(state), state, stepped, known);
    },

    async settingsFor(state) {
      return settingsForState(call, state);
    },

    async ending(state) {
      const stepped = await advanceBranches(state, endYearOf(state), false);
      return endingFor(call, state, stepped);
    },

    replyAs(state, life, age, history, text) {
      return reply(call, state, life, age, history, text);
    },

    async safety(text) {
      return safetyCheck(call, text);
    },
  };
  return engine;
}

/**
 * Code-only profile from the start screen (no model call), so the agent can write the FIRST
 * decision card in parallel with startProfile (~10 s): makeDecision({ ...state, profile:
 * provisionalProfile(input) }, slots[0]). Quote ids (q1..qn from the start line) match the ones
 * startProfile creates, so the card's whyQuoteId stays valid.
 */
export function provisionalProfile(input: StartInput, now: Date = new Date()): Profile {
  const quotes = quotesFromText(input.line, 1, "start", "answer");
  return emptyProfile(input, now.getFullYear(), "s_provisional", quotes, now.toISOString());
}

/**
 * The warm-up's model calls (D-090, worker/engine/warmup.ts): coverage check, answer folds and
 * personalized quick answers, all on the fast tier. The session agent loads it with the engine.
 */
export function createWarmup(deps: EngineDeps): WarmupPort {
  const models: EngineModels = { ...DEFAULT_MODELS, ...deps.models, yearsBySpeed: deps.models?.yearsBySpeed ?? DEFAULT_MODELS.yearsBySpeed };
  return warmupWith(createCaller({ llm: deps.llm, models, onUsage: deps.onUsage }));
}

/** At most `n` of the wrapped tasks run at once. */
function gate(n: number) {
  let running = 0;
  const queue: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (running >= n) await new Promise<void>((r) => queue.push(r));
    running++;
    try {
      return await task();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

/** Helper for the session agent: decision budgets after planning (SessionState.budgets). */
export function budgetsFor(slots: { kind: "small" | "big" }[]): { smallLeft: number; bigLeft: number } {
  return { smallLeft: slots.filter((s) => s.kind === "small").length, bigLeft: slots.filter((s) => s.kind === "big").length };
}
