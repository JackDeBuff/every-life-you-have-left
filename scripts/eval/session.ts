/**
 * Runs one Auto-mode session the way the session agent would: start → profile → 5 big decisions
 * (answered by a persona-consistent user simulator) → years to the end age, with forks,
 * interludes and settings → ending → one future-self reply. Records latency, validity and cost.
 */
import { z } from "zod";
import { endAgeFor, geminiSchema } from "../../shared/schema";
import type { Branch, Decision, DecisionAnswer, SessionState, SimYear } from "../../shared/sim";
import type { Ending, InterludeCut } from "../../shared/engine";
import { createEngine, provisionalProfile, type LlmPort, type UsageEvent, type YearMetric } from "../../worker/engine";
import { checkYearsContract } from "./checks";
import type { Persona } from "./personas";
import { costOf, type Ledger } from "./pricing";

export interface SessionResult {
  persona: string;
  startedAt: string;
  heavy: string;
  ok: boolean;
  error: string | null;
  timings: {
    profileMs: number;
    /** Start screen → first decision card ready (built from the provisional profile in parallel). */
    firstCardMs: number;
    decisionMs: number[];
    firstYearMs: number[];
    perYearMs: number;
    totalGenMs: number;
    sessionMs: number;
  };
  validity: {
    years: number;
    schemaOk: number;
    hardErrorYears: number;
    repaired: number;
    fallback: number;
    filler: number;
    turningPoints: number;
    tpWithQuote: number;
    quietYears: number;
    worldEvents: number;
    cliches: number;
    contractErrors: string[];
  };
  cost: { session: number; byPurpose: Record<string, number>; byModel: Record<string, number>; simulator: number };
  tokens: { input: number; output: number; thought: number };
  hedges: number;
  transcript: {
    profile: SessionState["profile"];
    decisions: (Decision & { answer: DecisionAnswer | null })[];
    years: SimYear[];
    branches: Branch[];
    interludes: InterludeCut[][];
    settings: SessionState["settings"];
    ending: Ending | null;
    chat: string | null;
  };
}

const SimAnswer = z.object({ optionId: z.string(), text: z.string() });

/** The user simulator: picks a persona-consistent option and writes a sentence in their voice. */
async function simulateAnswer(llm: LlmPort, persona: Persona, d: Decision, onUsage: (u: UsageEvent) => void): Promise<{ optionId: string; text: string }> {
  const r = await llm.generateJSON<{ optionId: string; text: string }>({
    model: "gemini-3.5-flash-lite",
    system: `You role-play a real person answering a decision card in a life-simulation app. Stay true to who they are. Pick the option this person would most plausibly pick (not always the safe or the bold one; be realistic), and write 1-2 sentences in their own voice saying what they'd really do, often with a condition or a feeling. Never mention being simulated.`,
    prompt: `WHO YOU ARE (hidden truth)\n${persona.truth}\nYour voice: ${persona.voice}\nWhat you told the app at the start: "${persona.input.line}"\n\nTHE CARD (${d.year}, you are ${d.age})\n${d.prompt}\nWhy it's asking: ${d.whyAsking}\nOptions:\n${d.options.map((o) => `${o.id}: ${o.label}${o.hint ? ` (${o.hint})` : ""}`).join("\n")}\n\nReturn {"optionId": "a"|"b"|"c"|"d", "text": "..."}.`,
    schema: geminiSchema(SimAnswer),
    maxOutputTokens: 400,
  });
  onUsage({ ...r.usage, purpose: "simulator", hedged: false });
  const ok = SimAnswer.safeParse(r.json);
  const optionId = ok.success && d.options.some((o) => o.id === ok.data.optionId) ? ok.data.optionId : d.options[0]!.id;
  return { optionId, text: ok.success ? ok.data.text : "" };
}

function initialState(persona: Persona): SessionState {
  const year = new Date().getFullYear();
  return {
    sessionId: `eval_${persona.key}`,
    phase: "start",
    speed: "auto",
    profile: null,
    appearance: null,
    portraits: [],
    settings: [],
    nudges: [],
    decisions: [],
    answers: [],
    years: [],
    playhead: { year, age: persona.input.age, paused: false },
    branches: [],
    log: [],
    status: null,
    budgets: { smallLeft: 0, bigLeft: 5 },
    endAge: endAgeFor(persona.input.age),
    verdictAtEnd: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function runSession(llm: LlmPort, persona: Persona, heavy: string, ledger: Ledger, log: (s: string) => void, opts: { smalls?: number } = {}): Promise<SessionResult> {
  const t0 = Date.now();
  const usages: UsageEvent[] = [];
  const metrics: YearMetric[] = [];
  const onUsage = (u: UsageEvent) => {
    usages.push(u);
    ledger.add(u);
  };
  // fallback off: each arm is judged on its own reliability (production keeps gemini-3.6-flash)
  // "<heavy>+auto:<model>" = hybrid arm: Auto-mode years by <model>, fork years + everything else by <heavy>
  const [heavyModel, autoYears] = heavy.split("+auto:") as [string, string | undefined];
  const engine = createEngine({
    llm,
    models: { heavy: heavyModel, fallback: "", yearsBySpeed: autoYears ? { auto: autoYears } : {} },
    onUsage,
    onMetric: (m) => metrics.push(m),
  });
  const state = initialState(persona);
  const result: SessionResult = {
    persona: persona.key, startedAt: new Date().toISOString(), heavy, ok: false, error: null,
    timings: { profileMs: 0, firstCardMs: 0, decisionMs: [], firstYearMs: [], perYearMs: 0, totalGenMs: 0, sessionMs: 0 },
    validity: { years: 0, schemaOk: 0, hardErrorYears: 0, repaired: 0, fallback: 0, filler: 0, turningPoints: 0, tpWithQuote: 0, quietYears: 0, worldEvents: 0, cliches: 0, contractErrors: [] },
    cost: { session: 0, byPurpose: {}, byModel: {}, simulator: 0 },
    tokens: { input: 0, output: 0, thought: 0 },
    hedges: 0,
    transcript: { profile: null, decisions: [], years: [], branches: [], interludes: [], settings: [], ending: null, chat: null },
  };
  let genMs = 0;
  let genYears = 0;
  const gen = async (from: number, count: number) => {
    const g0 = Date.now();
    let first = 0;
    const ys = await engine.generateYears(state, from, count, () => {
      if (!first) first = Date.now() - g0;
    });
    genMs += Date.now() - g0;
    genYears += ys.length;
    result.timings.firstYearMs.push(first);
    state.years = [...state.years.filter((y) => y.year < from), ...ys];
    return ys;
  };

  try {
    // 1. profile, and in parallel the first card from the code-only provisional profile
    let s0 = Date.now();
    const prov = provisionalProfile(persona.input);
    const provState: SessionState = { ...state, profile: prov, endAge: prov.endAge };
    const todaySlot = engine.planSlots(provState).find((s) => s.kind === "big")!;
    const [profile0, card0] = await Promise.all([
      engine.startProfile(persona.input, persona.docs).then((p) => ((result.timings.profileMs = Date.now() - s0), p)),
      engine.makeDecision(provState, todaySlot).then((d) => ((result.timings.firstCardMs = Date.now() - s0), d)),
    ]);
    state.profile = profile0;
    state.sessionId = state.profile.sessionId;
    state.endAge = state.profile.endAge;
    state.phase = "playing";
    log(`  profile ${result.timings.profileMs}ms, ${state.profile.quotes.length} quotes, know-me ${state.profile.knowMeScore}`);
    ledger.check();

    const settingsP = engine.settingsFor(state).then((s) => (state.settings = s));
    const slots = engine.planSlots(state).filter((s) => s.kind === "big");
    // --smalls N: also write the first N small cards (as at 2x) and let them slide, to check
    // framing variety and that small cards respect the life as it stands.
    let smallsLeft = opts.smalls ?? 0;
    const smallSlots = smallsLeft ? engine.planSlots({ ...state, speed: "2x" }).filter((s) => s.kind === "small") : [];
    const writeSmalls = async (from: number, to: number) => {
      for (const sl of smallSlots.filter((s) => s.year >= from && s.year <= to)) {
        if (smallsLeft <= 0) return;
        smallsLeft--;
        const sd = await engine.makeDecision(state, sl);
        sd.status = "slid";
        state.decisions.push(sd);
        log(`     small ${sd.year} (${sd.age}): ${sd.prompt}`);
      }
    };
    log(`  slots: ${slots.map((s) => `${s.age}(${s.reason.split(":").slice(1, 3).join(":")})`).join(" ")}`);
    const endYear = state.profile.birthYear + state.endAge;

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i]!;
      // play up to the slot
      const lastYear = state.years.at(-1)?.year ?? state.profile.startYear - 1;
      if (lastYear < slot.year - 1) await gen(lastYear + 1, slot.year - 1 - lastYear);
      state.playhead = { year: slot.year, age: slot.age, paused: true };
      state.phase = "deciding";
      ledger.check();

      s0 = Date.now();
      const d = i === 0 && card0.year === slot.year ? card0 : await engine.makeDecision(state, slot);
      if (d !== card0) result.timings.decisionMs.push(Date.now() - s0);
      state.decisions.push(d);
      const sim = await simulateAnswer(llm, persona, d, onUsage);
      const safety = await engine.safety(sim.text);
      const { profile, quote } = await engine.applyAnswer(state, d, { decisionId: d.id, optionId: sim.optionId, text: sim.text, via: "text", quoteId: null, answeredAt: new Date().toISOString() });
      state.profile = profile;
      const answer: DecisionAnswer = { decisionId: d.id, optionId: sim.optionId, text: sim.text, via: "text", quoteId: quote?.id ?? null, answeredAt: new Date().toISOString() };
      state.answers.push(answer);
      d.status = "answered";
      const opt = d.options.find((o) => o.id === sim.optionId);
      log(`  ${d.year} (${d.age}) "${d.prompt}"\n     -> ${opt?.branchTitle} | "${sim.text.slice(0, 90)}"${safety.flagged ? " [SAFETY FLAG]" : ""}`);

      // the fork: branches, the next stretch of the chosen life and settings, in parallel
      const nextSlot = slots[i + 1];
      const until = nextSlot ? nextSlot.year - 1 : endYear;
      state.phase = "playing";
      state.playhead.paused = false;
      const [branches] = await Promise.all([
        engine.spawnBranches(state, d, sim.optionId),
        gen(slot.year, until - slot.year + 1),
        settingsP,
      ]);
      await writeSmalls(slot.year + 1, until);
      const keep = new Set(branches.map((b) => b.id));
      state.branches = [...state.branches.filter((b) => !keep.has(b.id)).map((b) => ({ ...b, status: "retired" as const })), ...branches];
      state.settings = await engine.settingsFor(state);
      // interlude at the fork year
      state.playhead = { year: slot.year, age: slot.age, paused: false };
      const cuts = await engine.interlude(state);
      result.transcript.interludes.push(cuts);
      log(`     meanwhile: ${cuts.map((c) => `[${c.title}] ${c.caption}`).join(" / ")}`);
      ledger.check();
    }
    // play to the end
    const lastYear = state.years.at(-1)?.year ?? state.profile.startYear - 1;
    if (lastYear < endYear) await gen(lastYear + 1, endYear - lastYear);
    state.playhead = { year: endYear, age: state.endAge, paused: false };
    state.phase = "ended";
    ledger.check();

    const ending = await engine.ending(state);
    result.transcript.ending = ending;
    log(`  verdict: ${ending.verdict}`);
    // one future-self reply (twin or letter voice)
    const chatAge = Math.min(state.endAge, state.profile.age + 20);
    let chat = "";
    for await (const t of engine.replyAs(state, "chosen", chatAge, [], "What do you wish you'd known at my age?")) chat += t;
    result.transcript.chat = chat;
    result.ok = true;
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    log(`  ERROR ${result.error}`);
  }

  // ---- metrics
  const ys = state.years;
  result.timings.totalGenMs = genMs;
  result.timings.perYearMs = genYears ? Math.round(genMs / genYears) : 0;
  result.timings.sessionMs = Date.now() - t0;
  const chosenMetrics = metrics.filter((m) => m.lifeId === "you");
  result.validity.years = chosenMetrics.length;
  result.validity.schemaOk = chosenMetrics.filter((m) => m.schemaOk).length;
  result.validity.hardErrorYears = chosenMetrics.filter((m) => m.hardErrors > 0).length;
  result.validity.repaired = chosenMetrics.filter((m) => m.repaired).length;
  result.validity.fallback = chosenMetrics.filter((m) => m.fallback && !m.filler).length;
  result.validity.filler = chosenMetrics.filter((m) => m.filler).length;
  result.validity.cliches = chosenMetrics.reduce((s, m) => s + m.cliches, 0);
  const tps = ys.flatMap((y) => y.events).filter((e) => e.isTurningPoint);
  result.validity.turningPoints = tps.length;
  result.validity.tpWithQuote = tps.filter((e) => e.cause && state.profile?.quotes.some((q) => q.id === e.cause!.quoteId)).length;
  result.validity.quietYears = ys.filter((y) => !y.events.some((e) => e.isTurningPoint)).length;
  result.validity.worldEvents = ys.flatMap((y) => y.events).filter((e) => e.category === "world_context").length;
  if (state.profile) result.validity.contractErrors = checkYearsContract(ys, state.profile);
  for (const u of usages) {
    const c = costOf(u);
    if (u.purpose === "simulator") {
      result.cost.simulator += c;
      continue;
    }
    result.cost.session += c;
    result.cost.byPurpose[u.purpose] = (result.cost.byPurpose[u.purpose] ?? 0) + c;
    result.cost.byModel[u.model] = (result.cost.byModel[u.model] ?? 0) + c;
    result.tokens.input += u.inputTokens;
    result.tokens.output += u.outputTokens;
    result.tokens.thought += u.thoughtTokens;
    if (u.hedged) result.hedges++;
  }
  result.transcript.profile = state.profile;
  result.transcript.decisions = state.decisions.map((d) => ({ ...d, answer: state.answers.find((a) => a.decisionId === d.id) ?? null }));
  result.transcript.years = ys;
  result.transcript.branches = state.branches;
  result.transcript.settings = state.settings;
  return result;
}
