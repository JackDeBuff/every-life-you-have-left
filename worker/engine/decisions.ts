/** makeDecision: big forks (heavy) and small get-to-know-you moments (fast). */
import type { DecisionSlot } from "../../shared/engine";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import type { Decision, DecisionOption, SessionState } from "../../shared/sim";
import { pastTimeIssues } from "./calendar";
import { fixPeopleNumbers, forkIssues, forksFrom, framingIssues, peopleIssues, recentFramings, stateIssues, type Issue } from "./consistency";
import { decisionLine, decisionsBlock, lifeSoFarBlock, nowContext, personBlock, quotesBlock, worldBlock } from "./context";
import { cardFocus } from "./focus";
import { forksTaken, lifeAt } from "./ledger";
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


const CLAIMS_WORDS = /\b(you said|you told me|you wrote|you mentioned|in your words|your words)\b/i;
const STOP = new Set("the a an and or but to of in on for with at by from is are was were be been it its this that you your i me my we our they them their so if as not no just".split(" "));
const contentWords = (t: string) => new Set((t.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => w.length > 2 && !STOP.has(w)));

/**
 * A "why I'm asking" line may only claim the user said something when it cites a real quote
 * that it actually echoes. Otherwise (no valid quote, or a "you said ..." that shares no words with
 * the quote) fall back to a grounded, non-attributing line. Guards against the model copying the
 * prompt's example ("You said money scares you...") or inventing a quote. QA bug, Sat Nov 7.
 */
export function groundWhy(why: string, quoteText: string | null, kind: "big" | "small"): string {
  const neutral = kind === "big" ? "This is one of the moments a life turns on." : "It helps your lives sound like you.";
  const w = why.trim();
  if (!w) return neutral;
  if (!CLAIMS_WORDS.test(w)) return w;
  if (!quoteText) return neutral;
  const q = contentWords(quoteText);
  let shared = 0;
  for (const word of contentWords(w)) if (q.has(word)) shared++;
  return shared >= 2 || (shared >= 1 && q.size <= 4) ? w : neutral;
}

export function finalize(state: SessionState, slot: DecisionSlot, draft: DecisionDraft, kind: "big" | "small", domain: DomainKey, seed = ""): Decision {
  const profile = state.profile!;
  const quoteIds = new Set(profile.quotes.map((q) => q.id));
  const leans = new Set<string>();
  // one option per lean when possible; then shuffle so the bold one isn't always in the same slot
  const opts = draft.options.slice(0, 4).map((o, i) => {
    const lean = leans.has(o.lean) ? LEANS.find((l) => !leans.has(l)) ?? o.lean : o.lean;
    leans.add(lean);
    return { ...o, lean, i };
  });
  const order = shuffled(opts, rng(`opts:${profile.sessionId}:${slot.year}:${kind}${seed}`));
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
    whyQuoteId: draft.whyQuoteId && quoteIds.has(draft.whyQuoteId) ? draft.whyQuoteId : null,
    whyAsking: groundWhy(
      draft.whyAsking,
      draft.whyQuoteId && quoteIds.has(draft.whyQuoteId) ? profile.quotes.find((q) => q.id === draft.whyQuoteId)?.text ?? null : null,
      kind,
    ),
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

/**
 * The years a big card is written from: every year before it, plus the fork's own year once it has
 * been written (the playhead shows that year before the card opens, so it is history the card must
 * know: a separation, a move). The first fork ("today") never sees the start year's placeholder scene.
 */
export function cardPast(state: SessionState, slot: Pick<DecisionSlot, "year" | "kind">, isFirst: boolean): SessionState["years"] {
  return state.years.filter((y) => y.year < slot.year || (slot.kind === "big" && !isFirst && y.year === slot.year));
}

/**
 * Everything wrong with a big card given the life as it stands NOW (the years written so far,
 * through its own year when written) and every fork already taken. Code only; the agent calls it
 * again when the years before a card written ahead land (a stale card is rewritten before it opens).
 */
export function bigCardIssues(state: SessionState, d: Pick<Decision, "id" | "year" | "prompt" | "whyAsking" | "options" | "domains">, today: Date = new Date()): Issue[] {
  const profile = state.profile!;
  const isFirst = !state.decisions.some((x) => x.kind === "big" && x.id !== d.id && (x.year < d.year || x.status !== "pending"));
  const past = cardPast(state, { year: d.year, kind: "big" }, isFirst);
  const now = lifeAt(profile, past, d.year, forksTaken(state, d.year - 1));
  const forks = forksFrom(state, d.year, d.id);
  const earlier = state.decisions.filter((x) => x.kind === "big" && x.id !== d.id && x.year <= d.year && x.status !== "pending");
  const all = [d.prompt, d.whyAsking, ...d.options.map((o) => `${o.label}. ${o.hint ?? ""}`)].join(" ");
  return [
    ...forkIssues(d, now, forks, { firstName: profile.firstName ?? "", earlier }),
    ...peopleIssues(all, now).filter((i) => i.kind !== "age"),
    ...pastTimeIssues(`${d.prompt} ${d.whyAsking}`, today, profile.country, d.year).map((msg) => ({ kind: "past_time" as const, msg })),
  ];
}

export async function makeDecisionFor(call: Caller, state: SessionState, slot: DecisionSlot, today: Date = new Date()): Promise<Decision> {
  const profile = state.profile!;
  const r = parseSlotReason(slot.reason);
  const kind = slot.kind;
  // (a card rewritten in place is still pending: it doesn't count against itself)
  const isFirst = kind === "big" && !state.decisions.some((d) => d.kind === "big" && (d.year < slot.year || d.status !== "pending"));
  const past = cardPast(state, slot, isFirst);
  const endYear = profile.birthYear + (state.endAge || profile.endAge);
  const world = worldTimeline(profile.sessionId, profile.startYear, endYear).filter((w) => Math.abs(w.year - slot.year) <= 3);
  const startLine = profile.quotes.filter((q) => q.questionId === "start").map((q) => q.text).join(" ");
  // The life as it stands in the slot's year, with today's date.
  const ctx = nowContext({ profile, years: past, atYear: slot.year, path: forksTaken(state, slot.year), today });
  const earlierBig = state.decisions.filter((d) => d.kind === "big" && d.year <= slot.year && d.status !== "pending");
  const forks = forksFrom(state, slot.year);
  const earlier = earlierBig.map((d) => decisionLine(state, d)).join("\n");
  const smalls = state.decisions.filter((d) => d.kind === "small" && d.year <= slot.year).sort((a, b) => a.year - b.year);
  const avoid = recentFramings(smalls, 6).join("; ");
  // life axes, no work fork twice in a row, and a life shock that just landed (focus.ts)
  const focus = cardFocus(state, slot) || undefined;

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
          focus,
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
        focus,
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
      // big: the question AND every option against the ledger and every fork already taken
      ...(kind === "big" ? forkIssues(d, ctx.now, forks, { firstName: profile.firstName ?? "", earlier: earlierBig }) : stateIssues(head, ctx.now)),
      ...peopleIssues(all, ctx.now).filter((i) => i.kind !== "age"),
      ...pastTimeIssues(head, today, profile.country, slot.year).map((msg) => ({ kind: "past_time" as const, msg })),
      ...(kind === "big" ? [] : framingIssues(d.prompt, smalls)),
    ];
  };
  /** Ages and children counts are rewritten from the ledger, never left to the model. */
  const fixNumbers = (d: Decision): Decision => {
    const f = (t: string) => fixPeopleNumbers(t, ctx.now).text;
    return { ...d, prompt: f(d.prompt), whyAsking: f(d.whyAsking), options: d.options.map((o) => ({ ...o, label: f(o.label), hint: o.hint ? f(o.hint) : o.hint })) };
  };

  // A card that contradicts the life as it stands gets ONE repair on the same tier, with the
  // problems listed. A big card still wrong after it is regenerated once from scratch (a fresh
  // draft, still told what to avoid). The card with the fewest problems wins.
  // (once the heavy/fast race has a card, the loser stops: no repair or regeneration nobody will use)
  let settled = false;
  const card = async (tier: Tier): Promise<Decision> => {
    const res = await attempt(tier);
    const draft = res.data ?? coerceDecision(res.raw);
    if (!draft) throw new Error("decision: no usable card");
    let c = fixNumbers(finalize(state, slot, draft, kind, r.domain));
    let issues = issuesOf(c);
    const tryAgain = async (t: Tier, feedback: string, seed: string) => {
      if (settled) return;
      try {
        const again = await attempt(t, feedback);
        const d2 = again.data ?? coerceDecision(again.raw);
        if (!d2) return;
        const c2 = fixNumbers(finalize(state, slot, d2, kind, r.domain, seed));
        const i2 = issuesOf(c2);
        if (i2.length < issues.length) (c = c2), (issues = i2);
      } catch {
        /* keep the best card so far */
      }
    };
    if (issues.length && !settled) console.log(`[card] ${kind} ${slot.year} (${tier}): ${issues.map((x) => x.kind).join(", ")}: repairing`);
    if (issues.length) await tryAgain(tier, issues.map((x) => `- ${x.msg}`).join("\n"), "");
    if (issues.length && kind === "big" && !settled) console.log(`[card] big ${slot.year} (${tier}): still ${issues.map((x) => x.kind).join(", ")}: regenerating`);
    if (issues.length && kind === "big") {
      const all = [...new Set(issues.map((x) => `- ${x.msg}`))].join("\n");
      await tryAgain(tier, `${all}\nWrite a NEW card from scratch about a different moment of this life as it stands now.`, ":regen");
    }
    return c;
  };

  // Big cards race the fast model when the heavy one is slow: the first card after ~3 s (the user
  // is looking at an empty card; 3.8 Flash took 4.8-16.7 s there), later ones after 7 s (they are
  // written ahead of the playhead, but a late one holds it). First usable card wins.
  if (kind === "big") {
    const raced = await raceAfter(() => card("heavy"), () => card("fast"), isFirst ? FIRST_CARD_RACE_MS : BIG_CARD_RACE_MS).catch(() => null);
    settled = true;
    if (raced) return raced;
    settled = false;
  }

  // Two tries on the slot's model, then one on the other tier; a strict-schema miss is coerced
  // from the raw JSON first (argon returned near-valid cards that zod rejected in the eval).
  const tiers: Tier[] = kind === "big" ? ["heavy", "fast"] : ["fast", "fast", "heavy"];
  for (const tier of tiers) {
    try {
      return await card(tier);
    } catch {
      /* next try */
    }
  }
  return fallbackDecision(state, slot, kind, r.domain, r.why);
}

export const FIRST_CARD_RACE_MS = 3000;
export const BIG_CARD_RACE_MS = 7000;

/**
 * Run `a`; if it hasn't succeeded after `ms` (or fails), run `b` too. Resolves with the first
 * success, rejects only when both fail. The loser runs to completion (its spend is small).
 */
export function raceAfter<T>(a: () => Promise<T>, b: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    let failures = 0;
    let started = 1;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startB = () => {
      if (done || started > 1) return;
      started = 2;
      run(b);
    };
    const run = (f: () => Promise<T>) =>
      f().then(
        (v) => {
          if (done) return;
          done = true;
          if (timer !== undefined) clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          failures++;
          if (done) return;
          if (started === 1) startB();
          else if (failures >= started) {
            done = true;
            reject(e);
          }
        },
      );
    run(a);
    timer = setTimeout(startB, ms);
  });
}

/** Best-effort repair of a near-valid card: needs a prompt and 4 labelled options. */
export function coerceDecision(raw: unknown): DecisionDraft | null {
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
