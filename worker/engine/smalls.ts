/**
 * D-089: small decisions in batches (cost and latency at 1x/2x).
 *
 *   smallBatch   ONE fast call writes 3-5 independent small cards for the next ~2-3 years of
 *                slots, each on its own domain/gap. The session agent queues them and serves each
 *                one instantly when its moment comes (bindSmall re-checks it against the life then).
 *   quoteAnswer  a small answer becomes a quote immediately, in code (no model call).
 *   foldAnswers  answers are folded into the profile in batches (every few answers, or before the
 *                next year call) with ONE fast call. They shape the next years written; they never
 *                rewrite the buffered future (only big decisions and settings nudges do).
 *   newThread    code heuristics: an answer that opens a new thread (a new person named, a job
 *                quit, a move, a relationship or a baby) makes the agent drop its queue, fold at
 *                once and write a single follow-up card. The fold's profile delta is a second check.
 *
 * Prompts are stable-prefix-first (person, their words, the life; then the volatile task) so
 * Gemini's implicit cache can reuse the prefix across calls.
 */
import type { DecisionSlot } from "../../shared/engine";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import type { DomainWeights, Profile, Quote } from "../../shared/schema";
import type { Decision, DecisionAnswer, SessionState } from "../../shared/sim";
import { displayCurrency } from "../../shared/currency";
import { pastTimeIssues } from "./calendar";
import { fixPeopleNumbers, framingIssues, framingsOf, peopleIssues, recentFramings, similarity, stateIssues, type Issue } from "./consistency";
import { lifeSoFarBlock, nowContext, personBlock, quotesBlock } from "./context";
import { coerceDecision, decisionId, finalize } from "./decisions";
import { cityOf, driftedIssues, forksTaken, here, lifeAt, type LifeNow } from "./ledger";
import type { Caller } from "./models";
import { bornFrom, guardMoney, knowMeScore, nextQuoteIndex } from "./profile";
import { ANSWERS_SYSTEM, SMALL_BATCH_SYSTEM, smallBatchPrompt } from "./prompts/decision";
import { AnswersDeltaLLM, SmallBatchLLM, type DecisionLLM } from "./schemas";
import { kidsQuestionOpen } from "./kids";
import { coverage, parseSlotReason } from "./slots";
import { clamp, norm, truncateWords, wordCount } from "./util";

export interface FoldItem {
  decision: Decision;
  answer: DecisionAnswer;
}

/** A thread an answer opened: what kind, and a short note for the follow-up card. */
export interface Thread {
  kind: "person" | "work" | "move" | "relationship" | "child" | "plan";
  why: string;
}

export interface FoldResult {
  /** Apply the fold to the profile as it is when the call returns (answers may have come in meanwhile). */
  apply: (p: Profile) => Profile;
  /** The profile delta opened a new thread (new people, a new job or home, a dated plan). */
  thread: Thread | null;
}

export interface SmallDecisionKit {
  smallBatch(state: SessionState, slots: DecisionSlot[]): Promise<Decision[]>;
  bindSmall(state: SessionState, card: Decision, slot: DecisionSlot): Decision | null;
  quoteAnswer(state: SessionState, decision: Decision, answer: DecisionAnswer): { profile: Profile; quote: Quote | null };
  foldAnswers(state: SessionState, items: FoldItem[]): Promise<FoldResult>;
  newThread(state: SessionState, decision: Decision, answer: DecisionAnswer): Thread | null;
  followUpSlot(slot: DecisionSlot, decision: Decision, answer: DecisionAnswer, thread: Thread | null): DecisionSlot;
  /** An answer that begs a follow-up even without a new thread ("only if...", "it depends on..."). */
  begsFollowUp(answer: DecisionAnswer): boolean;
}

/**
 * The life in `year`, that year included when it's written: its place, work and people after the
 * latest fork. A fork's consequence starts the year after the fork, so a card served in that year
 * must see the move or the new job (owner's playtest, Sat Nov 7: a fork moved them to a new city
 * "from next year", and next year's card still said "in your [old city] apartment").
 */
const lifeNowAt = (state: SessionState, year: number): LifeNow => {
  const p = state.profile!;
  return lifeAt(p, state.years.filter((y) => y.year <= year), year, forksTaken(state, year));
};

/** Code checks for a small card against the life at `year` (place, work, people, date, framing). */
function smallIssues(d: Decision, now: LifeNow, today: Date, country: string, year: number, recent: Pick<Decision, "prompt">[]): Issue[] {
  const head = `${d.prompt} ${d.whyAsking}`;
  const all = [d.prompt, d.whyAsking, ...d.options.map((o) => `${o.label}. ${o.hint ?? ""}`)].join(" ");
  return [
    ...stateIssues(head, now),
    ...peopleIssues(all, now).filter((i) => i.kind !== "age"),
    ...driftedIssues(all, now).map((x) => ({ kind: "drifted" as const, msg: x.msg })),
    ...pastTimeIssues(head, today, country, year).map((msg) => ({ kind: "past_time" as const, msg })),
    ...framingIssues(d.prompt, recent),
  ];
}

/** A batch card that names a year, a season or an age can't be served in another year. */
const DATED = /\b(?:19|20)\d\d\b|\b(?:spring|summer|autumn|fall|winter)\b|\b(?:january|february|march|april|june|july|august|september|october|november|december)\b|\byou(?:'re| are) \d\d\b|\bat \d\d\b/i;

export function createSmallKit(call: Caller, today: () => Date, at: () => string): SmallDecisionKit {
  const fixNumbers = (d: Decision, now: LifeNow): Decision => {
    const f = (t: string) => fixPeopleNumbers(t, now).text;
    return { ...d, prompt: f(d.prompt), whyAsking: f(d.whyAsking), options: d.options.map((o) => ({ ...o, label: f(o.label), hint: o.hint ? f(o.hint) : o.hint })) };
  };

  async function smallBatch(state: SessionState, slots: DecisionSlot[]): Promise<Decision[]> {
    const profile = state.profile!;
    if (!slots.length) return [];
    const first = slots[0]!;
    const t = today();
    const past = state.years.filter((y) => y.year < first.year);
    // NOW includes the first card's own year when it's written (the agent waits for it): its place,
    // work and people after the latest fork. Each card is re-checked against its served year anyway.
    const ctx = nowContext({ profile, years: state.years.filter((y) => y.year <= first.year), atYear: first.year, path: forksTaken(state, first.year), today: t, title: "NOW (the life as it stands for these cards)" });
    // Every small card asked so far (served ones; the queue is the agent's), newest last.
    const smalls = state.decisions.filter((d) => d.kind === "small").sort((a, b) => a.year - b.year);
    const asked = smalls.slice(-24).map((d) => `- ${d.prompt}`).join("\n");
    const avoid = recentFramings(smalls, 6).join("; ");
    // One domain per card, chosen NOW (the plan was made at the start): worry-weighted, toward
    // what we still know least about, away from domains asked often or just now. Each domain
    // has several gaps, taken in turn, so 1x's ~150 cards don't ask the same thing again.
    const cov = coverage(profile, state);
    const askedIn = (d: DomainKey) => smalls.filter((x) => x.domains[0] === d).length;
    const recentD = new Set(smalls.slice(-3).map((x) => x.domains[0]));
    const used = new Set<DomainKey>();
    const plan = slots.map((sl) => {
      const r = parseSlotReason(sl.reason);
      // A follow-up keeps its domain; so does the kids question while it's still open (kids.ts:
      // under ~35 without kids, it is asked, never left to the weights).
      if (r.moment === "followup" || (r.moment === "kids" && !used.has("children") && kidsQuestionOpen(profile, state))) {
        used.add(r.domain);
        return { slot: sl, domain: r.domain, why: r.why };
      }
      const age = sl.age;
      const score = (d: DomainKey) => (1 + 1.5 * profile.worries[d]) * (1.15 - cov[d]) * (d === "children" && age > 50 ? 0.4 : 1) / (1 + 0.35 * askedIn(d)) - (recentD.has(d) ? 0.6 : 0) + (d === r.domain ? 0.15 : 0);
      const domain = DOMAIN_KEYS.filter((d) => !used.has(d)).sort((a, b) => score(b) - score(a))[0] ?? r.domain;
      used.add(domain);
      const gaps = GAPS[domain];
      const worry = profile.worries[domain];
      return { slot: sl, domain, why: `${worry >= 0.5 ? `they worry about ${domain} (${worry.toFixed(1)}); ` : ""}we don't know ${gaps[askedIn(domain) % gaps.length]}` };
    });
    const prompt = (feedback?: string, only?: number[]) =>
      smallBatchPrompt({
        person: personBlock(profile),
        quotes: quotesBlock(profile),
        recent: lifeSoFarBlock(past.slice(-4), 4),
        now: ctx.text,
        asked,
        avoid: avoid || undefined,
        cards: (only ?? plan.map((_, i) => i)).map((i) => `${plan[i]!.domain}: ${plan[i]!.why}`),
        feedback,
      });
    const ask = async (feedback?: string, only?: number[]) => {
      const n = only?.length ?? plan.length;
      const r = await call.json({
        tier: "fast",
        purpose: "decision.smallBatch",
        system: SMALL_BATCH_SYSTEM,
        prompt: prompt(feedback, only),
        schema: SmallBatchLLM,
        maxOutputTokens: 700 + 450 * n,
        hedgeMs: 5000,
      });
      const raw = (r.raw as { cards?: unknown[] } | null)?.cards ?? [];
      const drafts: (DecisionLLM | null)[] = r.data?.cards ?? raw.map((c) => coerceDecision(c));
      return drafts;
    };

    // Each card is checked in order against the cards before it (served + earlier in this batch).
    const finish = (draft: DecisionLLM | null, i: number, before: Pick<Decision, "prompt">[]): { d: Decision | null; issues: Issue[] } => {
      if (!draft) return { d: null, issues: [{ kind: "framing", msg: "missing card" }] };
      const { slot, domain } = plan[i]!;
      let d = finalize(state, slot, draft, "small", domain, `:b${i}`);
      d = fixNumbers(d, ctx.now);
      const issues = smallIssues(d, ctx.now, t, profile.country, slot.year, before);
      if (DATED.test(`${d.prompt} ${d.whyAsking}`)) issues.push({ kind: "past_time", msg: "names a year, month, season or age; this card must fit any moment in the next two years" });
      const dup = [...smalls, ...before].find((x) => similarity(x.prompt, d.prompt) >= 0.55);
      if (dup) issues.push({ kind: "framing", msg: `too close to an earlier card ("${dup.prompt.slice(0, 70)}"); ask about something else` });
      return { d, issues };
    };

    let drafts: (DecisionLLM | null)[];
    try {
      drafts = await ask();
    } catch {
      drafts = [];
    }
    const out: (Decision | null)[] = plan.map(() => null);
    const bad: { i: number; msg: string }[] = [];
    const accepted: Pick<Decision, "prompt">[] = [...smalls];
    plan.forEach((_, i) => {
      const { d, issues } = finish(drafts[i] ?? null, i, accepted);
      if (d && !issues.length) {
        out[i] = d;
        accepted.push(d);
      } else bad.push({ i, msg: issues.map((x) => x.msg).join("; ") || "missing card" });
    });
    // One rewrite for the cards that broke a rule (same call shape, only those cards).
    if (bad.length && bad.length <= plan.length) {
      try {
        const idx = bad.map((b) => b.i);
        const again = await ask(bad.map((b, k) => `- card ${k + 1}: ${b.msg}`).join("\n"), idx);
        idx.forEach((i, k) => {
          const { d, issues } = finish(again[k] ?? null, i, accepted);
          if (d && !issues.length) {
            out[i] = d;
            accepted.push(d);
          }
        });
      } catch {
        /* keep the good ones */
      }
    }
    return out.filter((d): d is Decision => d !== null);
  }

  function bindSmall(state: SessionState, card: Decision, slot: DecisionSlot): Decision | null {
    const profile = state.profile;
    if (!profile) return null;
    const now = lifeNowAt(state, slot.year);
    const smalls = state.decisions.filter((d) => d.kind === "small" && d.id !== card.id).sort((a, b) => a.year - b.year);
    const d = fixNumbers({ ...card, id: decisionId(state, slot.age), year: slot.year, age: slot.age, status: "pending" }, now);
    // Framing was checked when the batch was written; here only what the life may have changed since.
    const issues = smallIssues(d, now, today(), profile.country, slot.year, []).filter((i) => i.kind !== "framing");
    if (issues.length) return null;
    if (framingIssues(d.prompt, smalls).length && framingsOf(d.prompt).some((f) => f.startsWith("late night"))) return null;
    return d;
  }

  function quoteAnswer(state: SessionState, decision: Decision, answer: DecisionAnswer): { profile: Profile; quote: Quote | null } {
    const profile = state.profile!;
    const text = answer.text?.trim() ?? "";
    // The warm-up's answers count too (D-090): they were in the score the user saw before this one.
    const warm = (state as SessionState & { warmup?: { questions: { status: string }[] } | null }).warmup;
    const answered = state.answers.filter((a) => a.decisionId !== decision.id).length + 1 + (warm?.questions.filter((q) => q.status === "answered").length ?? 0);
    const quote: Quote | null =
      wordCount(text) >= 2 ? { id: `q${nextQuoteIndex(profile.quotes)}`, text, questionId: decision.id, source: "answer", shortForm: truncateWords(text, 12) } : null;
    const next: Profile = { ...profile, quotes: quote ? [...profile.quotes, quote] : profile.quotes, profileVersion: profile.profileVersion + 1, updatedAt: at() };
    return { profile: { ...next, knowMeScore: knowMeScore(next, answered) }, quote };
  }

  async function foldAnswers(state: SessionState, items: FoldItem[]): Promise<FoldResult> {
    const profile = state.profile!;
    const written = items.filter((x) => x.answer.quoteId && x.answer.text?.trim());
    const identity: FoldResult = { apply: (p) => p, thread: null };
    if (!written.length) return identity;
    const lines = items.map(({ decision: d, answer: a }) => {
      const opt = a.optionId ? d.options.find((o) => o.id === a.optionId) : undefined;
      return `(${d.kind}, ${d.year}, age ${d.age}) "${d.prompt}"\n  Options: ${d.options.map((o) => o.label).join(" | ")}\n  Tapped: ${opt ? `"${opt.label}"` : "(nothing)"}\n  Wrote${a.quoteId ? ` (quote ${a.quoteId})` : ""}: ${a.text?.trim() ? `"${a.text.trim()}"` : "(nothing)"}`;
    });
    let d: AnswersDeltaLLM | null = null;
    try {
      const r = await call.json({
        tier: "fast",
        purpose: "answer.fold",
        system: ANSWERS_SYSTEM,
        // Stable first: the profile and their words; then the answers being folded.
        prompt: `PROFILE\n${personBlock(profile)}\n\nTHEIR WORDS\n${quotesBlock(profile)}\n\nTHE ANSWERS (${items.length})\n${lines.join("\n\n")}\n\nReturn the profile delta JSON for these answers together.`,
        schema: AnswersDeltaLLM,
        maxOutputTokens: 1500 + 400 * written.length,
        hedgeMs: 6000,
      });
      d = r.data;
    } catch {
      d = null;
    }
    if (!d) return identity;
    const delta = d;
    const ids = new Set(written.map((x) => x.answer.quoteId!));
    const fallbackId = written.at(-1)!.answer.quoteId!;
    const textOf = new Map(written.map((x) => [x.answer.quoteId!, x.answer.text!.trim()]));
    // What the delta changes, for the agent's "new thread" check.
    const newPeople = delta.people.filter((p) => !profile.people.some((x) => norm(x.label) === norm(p.label)));
    const moved = delta.facts.find((f) => (f.key === "occupation" || f.key === "location") && !profile.facts.some((x) => x.key === f.key && norm(x.value) === norm(f.value)));
    const plans = delta.plans.filter((p) => !(profile.plans ?? []).some((h) => h.year === p.year && norm(h.text) === norm(p.text)));
    const thread: Thread | null = newPeople.length
      ? { kind: "person", why: `they mentioned ${newPeople.map((p) => `${p.label} (${p.relation})`).join(", ")}` }
      : moved
        ? { kind: moved.key === "location" ? "move" : "work", why: `${moved.label}: ${moved.value}` }
        : plans.length
          ? { kind: "plan", why: `a plan: ${plans[0]!.text}` }
          : null;

    const apply = (cur: Profile): Profile => {
      const valid = new Set(cur.quotes.map((q) => q.id));
      const cite = (xs: string[]) => {
        const c = xs.filter((id) => valid.has(id));
        return c.length ? c : valid.has(fallbackId) ? [fallbackId] : [];
      };
      const quotes = cur.quotes.map((q) => {
        if (!ids.has(q.id)) return q;
        const sf = delta.shortForms.find((s) => s.quoteId === q.id)?.shortForm?.trim();
        const text = textOf.get(q.id) ?? q.text;
        return sf && wordCount(sf) <= 12 && norm(text).includes(norm(sf).replace(/[.…]+$/, "")) ? { ...q, shortForm: sf } : q;
      });
      const people = [...cur.people];
      // ages said in these answers count from the year they were said
      const saidIn = Math.max(...items.map((x) => x.decision.year));
      for (const p of delta.people) {
        const i = people.findIndex((x) => norm(x.label) === norm(p.label));
        const born = bornFrom(p.age, saidIn);
        if (i >= 0) people[i] = { ...people[i]!, expectation: p.expectation ?? people[i]!.expectation, closeness: clamp(p.closeness, 0, 1), influence: clamp(p.influence, 0, 1), quoteIds: [...new Set([...people[i]!.quoteIds, ...cite(p.quoteIds)])], born: people[i]!.born ?? born };
        else people.push({ id: `p${people.length + 1}`, label: p.label, relation: p.relation, closeness: clamp(p.closeness, 0, 1), influence: clamp(p.influence, 0, 1), expectation: p.expectation, quoteIds: cite(p.quoteIds), born });
      }
      const facts = [...cur.facts];
      for (const f of delta.facts) {
        if (f.source === "inferred" && ETHNIC.test(`${f.label} ${f.value}`)) continue;
        const i = facts.findIndex((x) => x.key === f.key && norm(x.label) === norm(f.label));
        const fact = { id: i >= 0 ? facts[i]!.id : `f${facts.length + 1}`, key: f.key, label: f.label, value: f.value, source: f.source, quoteIds: cite(f.quoteIds), confidence: clamp(f.confidence, 0, 1) };
        if (i >= 0) facts[i] = fact;
        else facts.push(fact);
      }
      const prevW = cur.worries;
      const worries = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, clamp(delta.worries[k] ?? prevW[k], Math.max(0, prevW[k] - 0.2), Math.min(1, prevW[k] + 0.2))])) as DomainWeights;
      const money = delta.money
        ? guardMoney(
            {
              feel: delta.money.feel,
              incomeUsd: delta.money.incomeUsd ?? cur.money.incomeUsd,
              debtUsd: delta.money.debtUsd ?? cur.money.debtUsd,
              debtKind: delta.money.debtKind ?? cur.money.debtKind,
              savingsUsd: delta.money.savingsUsd ?? cur.money.savingsUsd,
              supportsFamily: delta.money.supportsFamily || cur.money.supportsFamily,
              assumed: delta.money.assumed && cur.money.assumed,
            },
            [...textOf.values()].join("\n"),
            displayCurrency(cur),
          )
        : cur.money;
      const had = cur.plans ?? [];
      const fresh = delta.plans
        .filter((x) => x.text.trim() && Number.isInteger(x.year) && x.year >= cur.startYear && x.year <= cur.startYear + 60)
        .filter((x) => !had.some((h) => h.year === x.year && norm(h.text) === norm(x.text)))
        .slice(0, 3)
        .map((x, i) => ({ id: `pl${had.length + i + 1}`, text: truncateWords(x.text.trim(), 16), year: x.year, when: x.when, kind: x.kind, certainty: x.certainty, quoteIds: cite(x.quoteIds) }));
      const next: Profile = {
        ...cur,
        quotes,
        facts,
        people,
        worries,
        fears: [...cur.fears, ...delta.fears.slice(0, 2).map((f, i) => ({ id: `x${cur.fears.length + i + 1}`, text: f.text, kind: f.kind, quoteIds: cite(f.quoteIds) }))].slice(-6),
        values: [...cur.values, ...delta.values.filter((v) => !cur.values.some((x) => norm(x.label) === norm(v.label))).slice(0, 2).map((v, i) => ({ id: `v${cur.values.length + i + 1}`, label: v.label, weight: clamp(v.weight, 0, 1), quoteIds: cite(v.quoteIds) }))].slice(-7),
        constraints: [...cur.constraints, ...delta.constraints.slice(0, 2).map((c, i) => ({ id: `k${cur.constraints.length + i + 1}`, kind: c.kind, text: c.text, personId: c.personLabel ? people.find((p) => norm(p.label) === norm(c.personLabel!))?.id ?? null : null, quoteIds: cite(c.quoteIds) }))].slice(-8),
        money,
        plans: fresh.length ? [...had, ...fresh].slice(-6) : cur.plans,
        profileVersion: cur.profileVersion + 1,
        updatedAt: at(),
      };
      return next;
    };
    return { apply, thread };
  }

  function newThread(state: SessionState, decision: Decision, answer: DecisionAnswer): Thread | null {
    const text = answer.text?.trim() ?? "";
    if (wordCount(text) < 3 || !state.profile) return null;
    return threadIn(text, state.profile, lifeNowAt(state, decision.year));
  }

  function followUpSlot(slot: DecisionSlot, decision: Decision, answer: DecisionAnswer, thread: Thread | null): DecisionSlot {
    const said = (answer.text ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
    const domain: DomainKey = thread?.kind === "person" || thread?.kind === "relationship" ? "relationships" : thread?.kind === "work" ? "career" : thread?.kind === "move" ? "lifeGoals" : thread?.kind === "child" ? "children" : decision.domains[0] ?? "lifeGoals";
    const about = thread ? `${thread.why}. ` : "";
    return {
      ...slot,
      reason: `small:${domain}:followup: a FOLLOW-UP to what they just said. Asked "${decision.prompt.replace(/\s+/g, " ").slice(0, 160)}", they wrote "${said}". ${about}Ask the natural next question about it, in a new moment; don't repeat their question or their words back`,
    };
  }

  function begsFollowUp(answer: DecisionAnswer): boolean {
    const t = answer.text?.trim() ?? "";
    return wordCount(t) >= 8 && /\b(only if|unless|it depends|depends on|not sure|i don'?t know|torn|can'?t decide|part of me)\b/i.test(t);
  }

  return { smallBatch, bindSmall, quoteAnswer, foldAnswers, newThread, followUpSlot, begsFollowUp };
}

const ETHNIC = /\b(race|racial|ethnic\w*|caucasian|white|black|asian|hispanic|latin[oax]|african[- ]american|arab|indigenous|gender|pronouns?)\b/i;

/** Several gaps per domain, asked in turn (the first matches slots.ts GAP_TEXT). */
const GAPS: Record<DomainKey, string[]> = {
  career: [
    "what they'd miss or be relieved to lose about their work, and what would make them quit",
    "who at work they trust, and who they're quietly competing with",
    "what a good working day looks like for them, hour by hour",
    "what they'd do for work if money didn't matter",
  ],
  wealth: [
    "the money thought they keep to themselves: debts, who depends on their money, what a windfall would really go to",
    "what they spend on without guilt, and what they feel guilty spending on",
    "how much would be 'enough', and what they'd do once they had it",
    "how they talk about money with the people closest to them",
  ],
  achievement: [
    "what they're proud of that would never show up on a CV",
    "what they'd want to have made or finished ten years from now",
    "whose praise still matters to them, and whose doesn't anymore",
  ],
  family: [
    "what their family assumed they'd become, and who would be disappointed if they changed course",
    "what they do for their family that nobody notices",
    "which family tradition they'd keep, and which they'd quietly drop",
    "who in the family they're most like, and whether they like that",
  ],
  relationships: [
    "who they'd call when things fall apart, and whether there's someone (or someone hoped for)",
    "what they need from a partner or close friend that they rarely ask for",
    "a friendship that faded, and whether they'd fix it",
    "how they make up after a fight",
  ],
  children: [
    "whether kids are in the picture: yes, no and 'honestly, I don't know' are all real",
    "what kind of grown-up they'd want to be for the children in their life",
    "what they'd do differently from how they were raised",
  ],
  mentalHealth: [
    "what's quietly draining them, and who gets to see them when things go badly",
    "what actually helps them reset after a hard week",
    "what they worry about that they'd never say out loud",
    "how they know they're running on empty",
  ],
  happiness: [
    "when they were last truly happy, and what they were doing",
    "the small ordinary thing that makes a week good",
    "what they'd do with a free day nobody knew about",
  ],
  lifeGoals: [
    "what they'd do if nobody judged them, and what they're waiting for permission to do",
    "the place or thing they keep saying 'someday' about",
    "what they'd regret not trying by seventy",
    "what they want people to say about them when they're not in the room",
  ],
  risk: [
    "the biggest risk they've taken, and what would have to be true before they'd take another",
    "a safe choice they're glad they made, and one they regret",
    "how much uncertainty they can live with before it keeps them up",
  ],
};

// ---------------------------------------------------------------------------------------------
// New-thread heuristics (code only)
// ---------------------------------------------------------------------------------------------

const RELATIONS = "girlfriend|boyfriend|partner|wife|husband|fianc[eé]e?|boss|manager|sister|brother|mom|mum|dad|mother|father|son|daughter|baby|best friend|friend|roommate|flatmate|cousin|aunt|uncle|grandma|grandpa|grandmother|grandfather|mentor|coworker|colleague|neighbou?r|therapist|ex";
const REL_RE = new RegExp(`\\bmy (?:new |old |little |big |older |younger |best )?(${RELATIONS})\\b(?:,?\\s+([A-Z][a-z]{2,}))?`, "gi");
const NAME_CUE = /\b(?:with|call|tell|ask|text|see|visit|meet|met|marry|date|dating|and)\s+([A-Z][a-z]{2,})\b|\b([A-Z][a-z]{2,})\s+(?:and I|says|said|would|thinks|wants|told me|asked me|is my|was my|has been)\b/g;
const NOT_NAMES = new Set(["Mom", "Mum", "Dad", "God", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Christmas", "English", "Spanish", "French", "Google", "Instagram", "LinkedIn", "Netflix", "Zoom", "Uber", "Amazon", "Then", "That", "This", "They", "There", "Honestly", "Maybe", "Probably", "Yes", "Not", "But"]);
// Decided, first person, not hypothetical ("I'd quit if" is an answer, not a thread).
const HYPO = /\b(would|wouldn't|'d|if|maybe|might|could|someday|one day|dream)\b/i;
const QUIT = /\b(?:i(?:'m| am| have| 've|'ve)?\s+(?:just\s+|finally\s+|actually\s+)?(?:quit|quitting|resign(?:ed|ing)?|handing in my notice|handed in my notice|leaving my job|left my job|got (?:fired|laid off)|going back to school|starting my own|taking the (?:job|offer)|accepted the (?:job|offer)|retir(?:ed|ing))|i(?:'m| am) going to (?:quit|resign|leave my job|start my own))\b/i;
const MOVE = /\b(?:(?:i|we)(?:'re|'m| are| am| have| 've|'ve)?\s+(?:just\s+|finally\s+|actually\s+)?(?:moving|moved|relocating|relocated|emigrating)|(?:i|we)(?:'re|'m| are| am) going to move|(?:i|we) (?:bought|signed (?:a|the) lease (?:on|for)) (?:a|the) (?:house|flat|apartment|place))\b/i;
const REL_EVENT = /\b(?:we(?:'re| are) (?:engaged|getting married|breaking up|splitting up|getting divorced)|i(?:'m| am) (?:engaged|getting married|getting divorced|seeing someone|dating someone)|we (?:broke up|split up|got engaged|got married)|(?:she|he|they) (?:left me|proposed|said yes)|i proposed)\b/i;
const CHILD_EVENT = /\b(?:(?:i|we)(?:'re|'m| are| am) (?:pregnant|expecting|having a baby|adopting)|(?:she|my wife|my partner) is pregnant|we had a baby)\b/i;

export function threadIn(text: string, profile: Profile, now: LifeNow): Thread | null {
  const clauses = text.split(/(?<=[.!?;])\s+|,\s+(?=but\b|and\b|so\b)/i);
  const decided = (re: RegExp) => clauses.find((c) => re.test(c) && !HYPO.test(c.replace(re, "")));
  const c1 = decided(REL_EVENT);
  if (c1) return { kind: "relationship", why: `a change in love: "${c1.trim().slice(0, 80)}"` };
  const c2 = decided(CHILD_EVENT);
  if (c2) return { kind: "child", why: `a child on the way: "${c2.trim().slice(0, 80)}"` };
  const c3 = decided(QUIT);
  if (c3) return { kind: "work", why: `a change at work: "${c3.trim().slice(0, 80)}"` };
  const c4 = decided(MOVE);
  if (c4) return { kind: "move", why: `a move: "${c4.trim().slice(0, 80)}"` };

  // A new person: a relation they've never mentioned, or a name the life doesn't have.
  const known = new Set<string>([
    ...profile.people.flatMap((p) => [norm(p.label), norm(p.relation), ...norm(p.label).split(" ")]),
    ...now.people.flatMap((p) => [norm(p.name), norm(p.relation), ...norm(p.name).split(" ")]),
    norm(profile.firstName ?? ""),
  ]);
  const places = new Set<string>([cityOf(now.place), ...now.pastPlaces.map((p) => cityOf(p.place)), norm(profile.city ?? ""), norm(profile.region ?? ""), ...norm(now.work).split(" ")]);
  const knownRel = (rel: string) => {
    const r = norm(rel).replace(/^mum$/, "mom").replace(/^mother$/, "mom").replace(/^father$/, "dad");
    if (["friend", "boss", "manager", "coworker", "colleague", "neighbor", "neighbour", "mentor", "therapist", "ex"].includes(r)) return true; // too common to be a thread alone
    const rels = [...profile.people.map((p) => `${norm(p.relation)} ${norm(p.label)}`), ...here(now).map((p) => `${norm(p.relation)} ${norm(p.name)}`)].join(" | ");
    const alias: Record<string, string[]> = { mom: ["mom", "mother", "mum", "parent"], dad: ["dad", "father", "parent"], partner: ["partner", "wife", "husband", "girlfriend", "boyfriend", "fianc", "spouse"], wife: ["wife", "partner", "spouse"], husband: ["husband", "partner", "spouse"], girlfriend: ["girlfriend", "partner"], boyfriend: ["boyfriend", "partner"] };
    return (alias[r] ?? [r]).some((a) => rels.includes(a));
  };
  for (const m of text.matchAll(REL_RE)) {
    const rel = m[1]!;
    const name = m[2];
    if (name && !NOT_NAMES.has(name) && !known.has(norm(name)) && !places.has(norm(name))) return { kind: "person", why: `they named their ${rel.toLowerCase()} ${name}` };
    if (!knownRel(rel)) return { kind: "person", why: `they mentioned their ${rel.toLowerCase()} for the first time` };
  }
  for (const m of text.matchAll(NAME_CUE)) {
    const name = m[1] ?? m[2];
    if (!name || NOT_NAMES.has(name) || known.has(norm(name)) || places.has(norm(name))) continue;
    return { kind: "person", why: `they mentioned ${name}` };
  }
  return null;
}
