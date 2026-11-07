/**
 * The warm-up (D-090): up to five questions between Start and the first fork, in every mode.
 *
 * Code-only (the session agent calls these directly, no model):
 *   warmQuestions()            the five questions with pre-written quick answers (instant first card)
 *   quickCoverage(line, docs)  a keyword guess at what the start line already answers; it only
 *                              decides which question is shown first, before the model check lands
 *   warmQuote(profile, text)   an answer becomes a verbatim quote at once (ids from q20, so they
 *                              never collide with the start profile's own doc quotes, <= q14)
 *   applyWarmDelta(...)        merge a fold result into a profile (pure; re-applied over the start
 *                              profile when it lands after the answers)
 * Model (fast tier, through createWarmup()):
 *   coverage(input, docs)      one call: which of the five are already answered, with confidence.
 *                              On any error: nothing is covered (ask everything).
 *   fold(...)                  one answer → facts, people, fears, money, worries, plans + its seed
 *   personalize(...)           a later question's four answers rewritten for this person (never
 *                              blocks: used only if it lands before the question is shown)
 */
import { z } from "zod";
import { DOMAIN_KEYS } from "../../shared/domains";
import type { DocInput } from "../../shared/engine";
import type { DomainWeights, Profile, Quote } from "../../shared/schema";
import type { DecisionOption, StartInput } from "../../shared/sim";
import { WARM_KEYS, type WarmKey, type WarmQuestion, type WarmSource } from "../agent/protocol";
import { personBlock, quotesBlock } from "./context";
import type { Caller } from "./models";
import { bornFrom, emptyProfile, guardMoney, knowMeScore, nextQuoteIndex, quotesFromText } from "./profile";
import { COVERAGE_SYSTEM, coveragePrompt, FOLD_SYSTEM, PERSONAL_SYSTEM, SEED_MEANING, WARM_BANK } from "./prompts/warmup";
import { AnswerDeltaLLM } from "./schemas";
import { clamp, norm, truncateClean, truncateWords, wordCount } from "./util";
import { CURRENCIES, displayCurrency, type CurrencyCode } from "../../shared/currency";

export { WARM_KEYS };
export type { WarmKey };

const IDS = ["a", "b", "c", "d"] as const;
/** Warm-up answers take quote ids from here up (the start profile uses q1..q14 at most). */
export const WARM_QUOTE_BASE = 20;
/** Skip a question only when the model is at least this sure it is already answered. */
export const COVERED_AT = 0.6;

/** Which of the four seeded lives each question feeds (research/03 §1.2). */
export const SEED_OF: Record<WarmKey, keyof Profile["seeds"] | null> = {
  now: "path",
  crossroads: "leap",
  people: null,
  fear: "careful",
  unjudged: "unjudged",
};

const LABEL_OF: Record<WarmKey, string> = {
  now: "Right now",
  crossroads: "On your mind",
  people: "Who has a say",
  fear: "Your 10-year fear",
  unjudged: "If nobody judged",
};
export const warmLabel = (k: WarmKey) => LABEL_OF[k];

/** "dollar", "naira", "euro", "baht": a currency's unit, singular, for pre-written copy. */
export function moneyUnit(cur: CurrencyCode): string {
  const word = CURRENCIES[cur].name.split(/\s+/).at(-1)!.toLowerCase();
  return word === "renminbi" ? "yuan" : word;
}

/** The five questions, with copy in the currency they think in ("watching every naira", never "every dollar" to a naira user). */
export function warmQuestions(currency: CurrencyCode = "USD"): WarmQuestion[] {
  const unit = moneyUnit(currency);
  return WARM_BANK.map((b) => ({
    id: `w-${b.key}`,
    key: b.key,
    prompt: b.prompt,
    whyAsking: b.whyAsking,
    whyQuoteId: null,
    options: b.options.map(([label, hint], i) => ({ id: IDS[i]!, label: label.replace(/\{unit\}/g, unit), hint, branchTitle: null })),
    placeholder: b.placeholder,
    domains: [...b.domains],
    status: "queued",
    covered: null,
    answer: null,
    personal: false,
  }));
}

/** Code-only profile from the start screen (same as the engine's provisionalProfile). */
export function warmProvisional(input: StartInput, now: Date = new Date()): Profile {
  const quotes = quotesFromText(input.line, 1, "start", "answer");
  return emptyProfile(input, now.getFullYear(), "s_provisional", quotes, now.toISOString());
}

// ---------------------------------------------------------------------------------------------
// The instant guess (code): only picks the first card while the model check is in flight
// ---------------------------------------------------------------------------------------------

const RX: Record<WarmKey, RegExp[]> = {
  now: [
    /\b(work(ing|s)?|job|career|employ\w*|intern\w*|student|stud(y|ying|ies)|school|college|university|grad(uat\w*)?|major|degree|phd|engineer|nurse|analyst|designer|developer|teacher|manager|consultant|barista|server|freelanc\w*|founder|unemployed|laid off|between jobs|retired|self-employed|startup|shift|clinic|hospital|office)\b/i,
    /(\$\s?\d|€|£|¥|\b\d+\s?k\b|\b(money|loans?|debt|salary|income|rent|savings?|saved|broke|tight|afford|paycheck|bills|budget|comfortable|paid|pay)\b)/i,
  ],
  crossroads: [/\b(should i|whether|torn|deciding|decide|decision|offer(ed)?|thinking (about|of)|considering|can't decide|choose|choice|quit|leave|leaving|move|moving|transfer|go back|propos\w*|haven't answered)\b/i],
  people: [
    /\b(mom|mum|mother|dad|father|parents?|family|wife|husband|partner|boyfriend|girlfriend|fianc\w*|kids?|children|son|daughter|boss|sister|brother|grand\w+|in-laws?)\b/i,
    /\b(expect\w*|wants? me|pressure|depend\w*|counting on|disappoint\w*|approv\w*|send(ing)? money|obligat\w*|insist\w*|would kill me|proud)\b/i,
  ],
  fear: [/\b(afraid|scared|scares|fear\w*|terrified|dread\w*|nightmare|regret\w*|end up)\b/i],
  unjudged: [/\b(if nobody judged|if no one judged|nobody judged|no one judged|secretly|always wanted|would love to|i'd love to|wish i could|deep down|for a living|dream\w*)\b/i],
};

/** true = the start line (+ docs) plainly answers it already. Only used to choose the first card. */
export function quickCoverage(line: string, docs: DocInput[]): Record<WarmKey, boolean> {
  const text = [line, ...docs.map((d) => d.text.slice(0, 20_000))].join("\n");
  const enough = wordCount(text) >= 6;
  const out = {} as Record<WarmKey, boolean>;
  for (const k of WARM_KEYS) out[k] = enough && RX[k].every((r) => r.test(text));
  return out;
}

/** Long uploads: the keyword guess is unreliable, so the first card waits for the model (briefly). */
export const waitsForCheck = (docs: DocInput[]) => docs.reduce((n, d) => n + d.text.trim().length, 0) >= 400;

// ---------------------------------------------------------------------------------------------
// Quotes and profile merging (code)
// ---------------------------------------------------------------------------------------------

/** A warm-up answer as a verbatim quote (questionId "start": it is part of what's on their mind). */
export function warmQuote(profile: Profile, text: string): Quote {
  const n = Math.max(WARM_QUOTE_BASE, nextQuoteIndex(profile.quotes));
  return { id: `q${n}`, text, questionId: "start", source: "answer", shortForm: truncateWords(text, 12) };
}

/** Quotes in id order (start line, docs, warm-up, later answers), deduplicated by id. */
export function mergeQuotes(a: Quote[], b: Quote[]): Quote[] {
  const byId = new Map<string, Quote>();
  for (const q of [...a, ...b]) if (!byId.has(q.id)) byId.set(q.id, q);
  return [...byId.values()].sort((x, y) => (Number(x.id.slice(1)) || 0) - (Number(y.id.slice(1)) || 0));
}

/** Facts the coverage check found in an upload, for the first card before the full profile lands. */
export function coverageFacts(questions: WarmQuestion[]): Profile["facts"] {
  return questions
    .filter((q) => q.status === "covered" && q.covered && q.covered.by !== "start")
    .map((q, i) => ({
      id: `fw${i + 1}`,
      key: "other",
      label: LABEL_OF[q.key],
      value: q.covered!.evidence,
      source: "upload" as const,
      quoteIds: [],
      confidence: clamp(q.covered!.confidence, 0, 1),
    }));
}

export const WarmDeltaLLM = AnswerDeltaLLM.extend({
  seed: z.string().nullable().describe("<= 14 words: the seeded life for this question, specific to them; null if this answer doesn't inform it"),
});
export type WarmDelta = z.infer<typeof WarmDeltaLLM>;

const ETHNIC = /\b(race|racial|ethnic\w*|caucasian|white|black|asian|hispanic|latin[oax]|african[- ]american|arab|indigenous|gender|pronouns?)\b/i;

/** Merge one fold result into the profile (pure). `quoteId` = the answer's quote (citations fall back to it). */
export function applyWarmDelta(profile: Profile, key: WarmKey, quoteId: string | null, d: WarmDelta): Profile {
  const valid = new Set(profile.quotes.map((q) => q.id));
  const cite = (ids: string[]) => {
    const c = ids.filter((id) => valid.has(id));
    return c.length ? c : quoteId && valid.has(quoteId) ? [quoteId] : [];
  };
  const people = [...profile.people];
  for (const p of d.people) {
    const i = people.findIndex((x) => norm(x.label) === norm(p.label));
    const born = bornFrom(p.age, profile.startYear);
    if (i >= 0) people[i] = { ...people[i]!, expectation: p.expectation ?? people[i]!.expectation, closeness: clamp(p.closeness, 0, 1), influence: clamp(p.influence, 0, 1), quoteIds: [...new Set([...people[i]!.quoteIds, ...cite(p.quoteIds)])], born: people[i]!.born ?? born };
    else {
      let id = `p${people.length + 1}`;
      while (people.some((x) => x.id === id)) id = `p${Number(id.slice(1)) + 1}`;
      people.push({ id, label: p.label, relation: p.relation, closeness: clamp(p.closeness, 0, 1), influence: clamp(p.influence, 0, 1), expectation: p.expectation, quoteIds: cite(p.quoteIds), born });
    }
  }
  const facts = [...profile.facts];
  for (const f of d.facts) {
    if (f.source === "inferred" && ETHNIC.test(`${f.label} ${f.value}`)) continue;
    const i = facts.findIndex((x) => x.key === f.key && norm(x.label) === norm(f.label));
    let id = i >= 0 ? facts[i]!.id : `f${facts.length + 1}`;
    if (i < 0) while (facts.some((x) => x.id === id)) id = `f${Number(id.slice(1)) + 1}`;
    const fact = { id, key: f.key, label: f.label, value: f.value, source: f.source, quoteIds: cite(f.quoteIds), confidence: clamp(f.confidence, 0, 1) };
    if (i >= 0) facts[i] = fact;
    else facts.push(fact);
  }
  const prevW = profile.worries;
  const worries = Object.fromEntries(
    DOMAIN_KEYS.map((k) => [k, clamp(d.worries[k] ?? prevW[k], Math.max(0, prevW[k] - 0.2), Math.min(1, prevW[k] + 0.2))]),
  ) as DomainWeights;
  const uniq = <T extends { id: string }>(xs: T[], prefix: string) => xs.map((x, i) => ({ ...x, id: `${prefix}${i + 1}` }));
  const fears = uniq(
    [...profile.fears, ...d.fears.filter((f) => !profile.fears.some((x) => norm(x.text) === norm(f.text))).slice(0, 2).map((f) => ({ id: "", text: f.text, kind: f.kind, quoteIds: cite(f.quoteIds) }))].slice(-6),
    "x",
  );
  const values = uniq(
    [...profile.values, ...d.values.filter((v) => !profile.values.some((x) => norm(x.label) === norm(v.label))).slice(0, 2).map((v) => ({ id: "", label: v.label, weight: clamp(v.weight, 0, 1), quoteIds: cite(v.quoteIds) }))].slice(-7),
    "v",
  );
  const constraints = uniq(
    [
      ...profile.constraints,
      ...d.constraints
        .filter((c) => !profile.constraints.some((x) => norm(x.text) === norm(c.text)))
        .slice(0, 2)
        .map((c) => ({ id: "", kind: c.kind, text: c.text, personId: c.personLabel ? people.find((p) => norm(p.label) === norm(c.personLabel!))?.id ?? null : null, quoteIds: cite(c.quoteIds) })),
    ],
    "k",
  );
  const m = d.money;
  const money = m
    ? guardMoney(
        {
          feel: m.feel,
          incomeUsd: m.incomeUsd ?? profile.money.incomeUsd,
          debtUsd: m.debtUsd ?? profile.money.debtUsd,
          debtKind: m.debtKind ?? profile.money.debtKind,
          savingsUsd: m.savingsUsd ?? profile.money.savingsUsd,
          supportsFamily: m.supportsFamily || profile.money.supportsFamily,
          assumed: m.assumed && profile.money.assumed,
        },
        profile.quotes.find((q) => q.id === quoteId)?.text ?? "",
        displayCurrency(profile),
      )
    : profile.money;
  const assumptions = m && !m.assumed ? profile.assumptions.filter((a) => a.field !== "money.feel") : profile.assumptions;
  const had = profile.plans ?? [];
  const fresh = d.plans
    .filter((p) => p.text.trim() && Number.isInteger(p.year) && p.year >= profile.startYear && p.year <= profile.startYear + 60)
    .filter((p) => !had.some((h) => h.year === p.year && norm(h.text) === norm(p.text)))
    .slice(0, 3)
    .map((p, i) => ({ id: `pl${had.length + i + 1}`, text: truncateWords(p.text.trim(), 16), year: p.year, when: p.when, kind: p.kind, certainty: p.certainty, quoteIds: cite(p.quoteIds) }));
  const seedKey = SEED_OF[key];
  const seedText = d.seed?.trim() ? truncateClean(d.seed.trim(), 14) : null;
  const seeds = seedKey && seedText ? { ...profile.seeds, [seedKey]: { text: seedText, quoteIds: quoteId && valid.has(quoteId) ? [quoteId] : profile.seeds[seedKey].quoteIds } } : profile.seeds;
  let quotes = profile.quotes;
  if (quoteId && d.shortForm && wordCount(d.shortForm) <= 12) {
    const q = quotes.find((x) => x.id === quoteId);
    if (q && norm(q.text).includes(norm(d.shortForm).replace(/[.…]+$/, ""))) quotes = quotes.map((x) => (x.id === quoteId ? { ...x, shortForm: d.shortForm!.trim() } : x));
  }
  return { ...profile, quotes, facts, people, worries, fears, values, constraints, money, assumptions, plans: [...had, ...fresh].slice(-6), seeds };
}

/** Know-me (D-026) during the warm-up: their own words plus a point per answer. */
export const warmKnowMe = (p: Profile, answered: number) => knowMeScore(p, answered);

// ---------------------------------------------------------------------------------------------
// Model calls (fast tier)
// ---------------------------------------------------------------------------------------------

const CovItem = z.object({
  covered: z.boolean(),
  confidence: z.number().min(0).max(1),
  evidence: z.string().nullable().describe("<= 14 words, second person; null if not covered"),
  source: z.enum(["start", "cv", "linkedin", "ai_export", "none"]),
});
export const CoverageLLM = z.object({ now: CovItem, crossroads: CovItem, people: CovItem, fear: CovItem, unjudged: CovItem });
export type Coverage = Record<WarmKey, { covered: boolean; confidence: number; evidence: string | null; by: WarmSource | null }>;

const PersonalLLM = z.object({
  whyAsking: z.string().describe("<= 20 words"),
  whyQuoteId: z.string().nullable(),
  options: z.array(z.object({ label: z.string().describe("<= 10 words, first person"), hint: z.string().nullable() })).min(4).max(4),
});

export interface Personalized {
  whyAsking: string;
  whyQuoteId: string | null;
  options: DecisionOption[];
}

export interface WarmupPort {
  coverage(input: StartInput, docs: DocInput[]): Promise<Coverage>;
  fold(profile: Profile, q: WarmQuestion, quote: Quote | null, tapped: string | null): Promise<WarmDelta | null>;
  personalize(profile: Profile, q: WarmQuestion): Promise<Personalized | null>;
}

export function warmupWith(call: Caller): WarmupPort {
  return {
    async coverage(input, docs) {
      const r = await call.json({
        tier: "fast",
        purpose: "warmup.coverage",
        system: COVERAGE_SYSTEM,
        prompt: coveragePrompt(input.line, docs, input.firstName, input.age),
        schema: CoverageLLM,
        maxOutputTokens: 900,
        hedgeMs: 2500,
        timeoutMs: 9000,
      });
      if (!r.data) throw new Error("warmup.coverage: no usable JSON");
      const kinds = new Set<string>(docs.map((d) => d.kind));
      const out = {} as Coverage;
      for (const k of WARM_KEYS) {
        const c = r.data[k];
        // A source we weren't given can't be the evidence (e.g. "cv" with no CV): trust only the start line then.
        const by: WarmSource | null = c.source === "start" ? "start" : c.source !== "none" && kinds.has(c.source) ? c.source : docs.length ? null : "start";
        const evidence = c.evidence?.trim() ? truncateWords(c.evidence.trim(), 16) : null;
        out[k] = { covered: c.covered && !!evidence && !!by, confidence: clamp(c.confidence, 0, 1), evidence, by };
      }
      return out;
    },

    async fold(profile, q, quote, tapped) {
      const seedKey = SEED_OF[q.key];
      const text = quote?.text ?? "";
      const r = await call.json({
        tier: "fast",
        purpose: "warmup.fold",
        system: FOLD_SYSTEM,
        prompt: `PROFILE\n${personBlock(profile)}\n\nTHEIR WORDS\n${quotesBlock(profile)}\n\nTHE WARM-UP QUESTION (${q.key})\n"${q.prompt}"\nQuick answers offered: ${q.options.map((o) => o.label).join(" | ")}\n\nTHEIR ANSWER\nTapped: ${tapped ? `"${tapped}"` : "(nothing)"}\n${quote ? `Their answer (quote ${quote.id}): "${text}"` : "(no quote)"}\n\nSEED FOR THIS QUESTION: ${seedKey ? SEED_MEANING[seedKey] : "none (return seed null)"}\n\nReturn the profile delta JSON.`,
        schema: WarmDeltaLLM,
        maxOutputTokens: 2000,
        hedgeMs: 5000,
        timeoutMs: 15_000,
      });
      return r.data;
    },

    async personalize(profile, q) {
      const r = await call.json({
        tier: "fast",
        purpose: "warmup.personalize",
        system: PERSONAL_SYSTEM,
        prompt: `PROFILE\n${personBlock(profile)}\n\nTHEIR WORDS\n${quotesBlock(profile)}\n\nTHE QUESTION (stays as is)\n"${q.prompt}"\nWhat it is for: ${WARM_BANK.find((b) => b.key === q.key)?.fills ?? ""}\nThe generic answers, for tone: ${q.options.map((o) => o.label).join(" | ")}\n\nWrite this person's four quick answers.`,
        schema: PersonalLLM,
        maxOutputTokens: 700,
        hedgeMs: 3000,
        timeoutMs: 9000,
      });
      const d = r.data;
      if (!d) return null;
      const labels = d.options.map((o) => truncateClean(o.label.trim(), 11).replace(/\.+$/, "")).filter((l) => l.length > 2);
      if (labels.length < 4 || new Set(labels.map(norm)).size < 4) return null;
      const quoteIds = new Set(profile.quotes.map((x) => x.id));
      return {
        whyAsking: truncateClean(d.whyAsking.trim(), 22) || q.whyAsking,
        whyQuoteId: d.whyQuoteId && quoteIds.has(d.whyQuoteId) ? d.whyQuoteId : null,
        options: d.options.slice(0, 4).map((o, i) => ({ id: IDS[i]!, label: labels[i]!, hint: o.hint?.trim() ? truncateClean(o.hint.trim(), 9) : null, branchTitle: null })),
      };
    },
  };
}
