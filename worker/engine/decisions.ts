/** makeDecision: big forks (heavy) and small get-to-know-you moments (fast). */
import type { DecisionSlot } from "../../shared/engine";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import type { Decision, DecisionOption, SessionState } from "../../shared/sim";
import { pastTimeIssues } from "./calendar";
import { fixPeopleNumbers, framingIssues, peopleIssues, recentFramings, repeatTopicIssues, stateIssues, type Issue } from "./consistency";
import { decisionLine, decisionsBlock, lifeSoFarBlock, nowContext, personBlock, quotesBlock, worldBlock } from "./context";
import { chosenPath } from "./ledger";
import type { Caller, Tier } from "./models";
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
function fallbackDecision(state: SessionState, slot: DecisionSlot, kind: "big" | "small", domain: DomainKey, stage = ""): Decision {
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
    prompt: `It's ${slot.year}. You're ${slot.age}. ${stage ? `${stage.replace(/\s*\([^)]*\)/g, "").replace(/^./, (c) => c.toUpperCase()).replace(/[.:;]?$/, ".")}` : kind === "big" ? "Something has to give this year." : "A quiet moment, and a question."} What do you do?`,
    whyAsking: kind === "big" ? "This is one of the moments a life turns on." : "It helps your lives sound like you.",
    whyQuoteId: p.quotes[0]?.id ?? null,
    options: big.map(([label, hint, title], i) => ({ id: IDS[i]!, label, hint, branchTitle: kind === "big" ? title : null })),
    placeholder: "Or tell me what you'd really do...",
    status: "pending",
  };
}

export async function makeDecisionFor(call: Caller, state: SessionState, slot: DecisionSlot, today: Date = new Date()): Promise<Decision> {
  const profile = state.profile!;
  const r = parseSlotReason(slot.reason);
  const kind = slot.kind;
  const past = state.years.filter((y) => y.year < slot.year);
  const endYear = profile.birthYear + (state.endAge || profile.endAge);
  const world = worldTimeline(profile.sessionId, profile.startYear, endYear).filter((w) => Math.abs(w.year - slot.year) <= 3);
  const isFirst = kind === "big" && !state.decisions.some((d) => d.kind === "big");
  const startLine = profile.quotes.filter((q) => q.questionId === "start").map((q) => q.text).join(" ");
  // The life as it stands in the slot's year (only the years before it), with today's date.
  const ctx = nowContext({ profile, years: past, atYear: slot.year, path: chosenPath(state, slot.year), today });
  const earlierBig = state.decisions.filter((d) => d.kind === "big" && d.year <= slot.year && d.status !== "pending");
  const earlier = earlierBig.map((d) => decisionLine(state, d)).join("\n");
  const smalls = state.decisions.filter((d) => d.kind === "small" && d.year <= slot.year).sort((a, b) => a.year - b.year);
  const avoid = recentFramings(smalls, 6).join("; ");

  const attempt = async (tier: Tier, feedback?: string) => {
    if (kind === "big") {
      return call.json({
        tier,
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
          now: ctx.text,
          earlier: earlier || undefined,
          feedback,
        }),
        schema: DecisionLLM,
        maxOutputTokens: 2500,
        hedgeMs: 9000,
      });
    }
    const asked = smalls
      .slice(-12)
      .map((d) => `- ${d.prompt}`)
      .join("\n");
    return call.json({
      tier,
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
        now: ctx.text,
        avoid: avoid || undefined,
        feedback,
      }),
      schema: DecisionLLM,
      maxOutputTokens: 1500,
      hedgeMs: 5000,
    });
  };

  /** What's wrong with a card, given the life as it stands (place, job, retirement, people, date, repeats). */
  const issuesOf = (d: Decision): Issue[] => {
    const head = `${d.prompt} ${d.whyAsking}`;
    const all = [d.prompt, d.whyAsking, ...d.options.map((o) => `${o.label}. ${o.hint ?? ""}`)].join(" ");
    return [
      ...stateIssues(head, ctx.now),
      ...peopleIssues(all, ctx.now).filter((i) => i.kind !== "age"),
      ...pastTimeIssues(head, today, profile.country, slot.year).map((msg) => ({ kind: "past_time" as const, msg })),
      ...(kind === "big" ? repeatTopicIssues(d, earlierBig, ctx.now, profile.firstName ?? "") : framingIssues(d.prompt, smalls)),
    ];
  };
  /** Ages and children counts are rewritten from the ledger, never left to the model. */
  const fixNumbers = (d: Decision): Decision => {
    const f = (t: string) => fixPeopleNumbers(t, ctx.now).text;
    return { ...d, prompt: f(d.prompt), whyAsking: f(d.whyAsking), options: d.options.map((o) => ({ ...o, label: f(o.label), hint: o.hint ? f(o.hint) : o.hint })) };
  };

  // Two tries on the slot's model, then one on the other tier; a strict-schema miss is coerced
  // from the raw JSON first (argon returned near-valid cards that zod rejected in the eval).
  // A card that contradicts the life gets ONE rewrite with the problems listed; the better one wins.
  const tiers: Tier[] = kind === "big" ? ["heavy", "heavy", "fast"] : ["fast", "fast", "heavy"];
  for (const tier of tiers) {
    try {
      const res = await attempt(tier);
      const draft = res.data ?? coerceDecision(res.raw);
      if (!draft) continue;
      let card = fixNumbers(finalize(state, slot, draft, kind, r.domain));
      const issues = issuesOf(card);
      if (issues.length) {
        try {
          const again = await attempt(tier, issues.map((i) => `- ${i.msg}`).join("\n"));
          const d2 = again.data ?? coerceDecision(again.raw);
          if (d2) {
            const card2 = fixNumbers(finalize(state, slot, d2, kind, r.domain));
            if (issuesOf(card2).length < issues.length) card = card2;
          }
        } catch {
          /* keep the first card */
        }
      }
      return card;
    } catch {
      /* next try */
    }
  }
  return fallbackDecision(state, slot, kind, r.domain, r.why);
}

/** Best-effort repair of a near-valid card: needs a prompt and 4 labelled options. */
function coerceDecision(raw: unknown): DecisionDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const opts = Array.isArray(o.options) ? (o.options as Record<string, unknown>[]) : [];
  const good = opts.filter((x) => x && typeof x.label === "string" && x.label.trim());
  if (typeof o.prompt !== "string" || !o.prompt.trim() || good.length < 4) return null;
  return {
    domains: Array.isArray(o.domains) ? (o.domains.filter((d) => (DOMAIN_KEYS as readonly unknown[]).includes(d)) as DomainKey[]) : [],
    prompt: o.prompt,
    whyAsking: typeof o.whyAsking === "string" ? o.whyAsking : "",
    whyQuoteId: typeof o.whyQuoteId === "string" ? o.whyQuoteId : null,
    options: good.slice(0, 4).map((x, i) => ({
      lean: (LEANS as readonly unknown[]).includes(x.lean) ? (x.lean as (typeof LEANS)[number]) : LEANS[i]!,
      label: String(x.label),
      hint: typeof x.hint === "string" ? x.hint : null,
      branchTitle: typeof x.branchTitle === "string" ? x.branchTitle : null,
    })),
    placeholder: typeof o.placeholder === "string" ? o.placeholder : "",
  };
}
