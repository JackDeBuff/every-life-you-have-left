/** makeDecision: big forks (heavy) and small get-to-know-you moments (fast). */
import type { DecisionSlot } from "../../shared/engine";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import type { Decision, DecisionOption, SessionState } from "../../shared/sim";
import { decisionsBlock, lifeSoFarBlock, personBlock, quotesBlock, worldBlock } from "./context";
import type { Caller } from "./models";
import { BIG_DECISION_SYSTEM, bigDecisionPrompt, SMALL_DECISION_SYSTEM, smallDecisionPrompt } from "./prompts/decision";
import { DecisionLLM, LEANS, type DecisionLLM as DecisionDraft } from "./schemas";
import { parseSlotReason } from "./slots";
import { rng, shuffled, truncateClean, truncateWords } from "./util";
import { worldTimeline } from "./world";

const IDS = ["a", "b", "c", "d"] as const;

export function decisionId(state: SessionState, age: number): string {
  const n = state.decisions.filter((d) => d.age === age).length + 1;
  return `d-${age}-${n}`;
}

function finalize(state: SessionState, slot: DecisionSlot, draft: DecisionDraft, kind: "big" | "small", domain: DomainKey): Decision {
  const profile = state.profile!;
  const quoteIds = new Set(profile.quotes.map((q) => q.id));
  const leans = new Set<string>();
  // one option per lean when possible; then shuffle so the bold one isn't always in the same slot
  const opts = draft.options.slice(0, 4).map((o, i) => {
    const lean = leans.has(o.lean) ? LEANS.find((l) => !leans.has(l)) ?? o.lean : o.lean;
    leans.add(lean);
    return { ...o, lean, i };
  });
  const order = shuffled(opts, rng(`opts:${profile.sessionId}:${slot.year}:${kind}`));
  const options: DecisionOption[] = order.map((o, i) => ({
    id: IDS[i]!,
    label: truncateClean(o.label, 11),
    hint: o.hint ? truncateClean(o.hint, 13) : null,
    branchTitle: kind === "big" ? truncateWords(o.branchTitle?.trim() || o.label, 4) : null,
  }));
  const domains = draft.domains.filter((d) => (DOMAIN_KEYS as readonly string[]).includes(d)).slice(0, 3);
  return {
    id: decisionId(state, slot.age),
    kind,
    year: slot.year,
    age: slot.age,
    domains: domains.length ? domains : [domain],
    prompt: draft.prompt.trim(),
    whyAsking: draft.whyAsking.trim(),
    whyQuoteId: draft.whyQuoteId && quoteIds.has(draft.whyQuoteId) ? draft.whyQuoteId : null,
    options,
    placeholder: draft.placeholder?.trim() || "Or tell me what you'd really do...",
    status: "pending",
  };
}

/** Deterministic fallback card if the model fails twice (keeps the run alive). */
function fallbackDecision(state: SessionState, slot: DecisionSlot, kind: "big" | "small", domain: DomainKey): Decision {
  const p = state.profile!;
  const big: [string, string, string][] = [
    ["Keep going the way I'm going", "Steady, and you'll know what it cost", "Stay the course"],
    ["Say yes to the bigger thing", "More upside, more risk, less time", "Take the leap"],
    ["Play it safe and protect what I have", "Security first, ambition later", "Play it safe"],
    ["Do the thing I'd do if nobody judged", "Less approval, more of you", "Do it my way"],
  ];
  return {
    id: decisionId(state, slot.age),
    kind,
    year: slot.year,
    age: slot.age,
    domains: [domain],
    prompt: `It's ${slot.year}. You're ${slot.age}. ${kind === "big" ? "Something has to give this year." : "A quiet moment, and a question."} What do you do?`,
    whyAsking: kind === "big" ? "This is one of the moments a life turns on." : "It helps your lives sound like you.",
    whyQuoteId: p.quotes[0]?.id ?? null,
    options: big.map(([label, hint, title], i) => ({ id: IDS[i]!, label, hint, branchTitle: kind === "big" ? title : null })),
    placeholder: "Or tell me what you'd really do...",
    status: "pending",
  };
}

export async function makeDecisionFor(call: Caller, state: SessionState, slot: DecisionSlot): Promise<Decision> {
  const profile = state.profile!;
  const r = parseSlotReason(slot.reason);
  const kind = slot.kind;
  const past = state.years.filter((y) => y.year < slot.year);
  const endYear = profile.birthYear + (state.endAge || profile.endAge);
  const world = worldTimeline(profile.sessionId, profile.startYear, endYear).filter((w) => Math.abs(w.year - slot.year) <= 3);
  const isFirst = kind === "big" && !state.decisions.some((d) => d.kind === "big");
  const startLine = profile.quotes.filter((q) => q.questionId === "start").map((q) => q.text).join(" ");

  const attempt = async () => {
    if (kind === "big") {
      return call.json({
        tier: "heavy",
        purpose: "decision.big",
        system: BIG_DECISION_SYSTEM,
        prompt: bigDecisionPrompt({
          person: personBlock(profile),
          quotes: quotesBlock(profile),
          lifeSoFar: lifeSoFarBlock(past, 24),
          decisions: decisionsBlock(state, slot.year),
          year: slot.year,
          age: slot.age,
          isFirst,
          startLine,
          stage: r.why,
          world: worldBlock(world),
        }),
        schema: DecisionLLM,
        maxOutputTokens: 2500,
        hedgeMs: 9000,
      });
    }
    const asked = state.decisions
      .filter((d) => d.kind === "small")
      .slice(-12)
      .map((d) => `- ${d.prompt}`)
      .join("\n");
    return call.json({
      tier: "fast",
      purpose: "decision.small",
      system: SMALL_DECISION_SYSTEM,
      prompt: smallDecisionPrompt({
        person: personBlock(profile),
        quotes: quotesBlock(profile),
        recent: lifeSoFarBlock(past.slice(-4), 4),
        year: slot.year,
        age: slot.age,
        domain: r.domain,
        gap: r.why,
        asked,
      }),
      schema: DecisionLLM,
      maxOutputTokens: 1500,
      hedgeMs: 5000,
    });
  };

  for (let i = 0; i < 2; i++) {
    try {
      const res = await attempt();
      if (res.data && res.data.options.length === 4) return finalize(state, slot, res.data, kind, r.domain);
    } catch {
      /* retry once */
    }
  }
  return fallbackDecision(state, slot, kind, r.domain);
}
