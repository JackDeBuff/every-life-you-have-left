/**
 * Profile: quotes are code-owned and verbatim (D-013); the model extracts facts, people, worries
 * and seeds and may only cite existing quote ids. Never infer race (D-011).
 */
import { currencyForCountry, displayCurrency, fixUnconverted, statedAmounts, type CurrencyCode } from "../../shared/currency";
import type { DocInput } from "../../shared/engine";
import { DOMAIN_KEYS } from "../../shared/domains";
import { endAgeFor, type DomainWeights, type PlannedEvent, type Profile, type Quote } from "../../shared/schema";
import type { Decision, DecisionAnswer, SessionState, StartInput } from "../../shared/sim";
import { personBlock, quotesBlock } from "./context";
import type { Caller } from "./models";
import { ANSWER_SYSTEM } from "./prompts/decision";
import { PROFILE_SYSTEM, profilePrompt } from "./prompts/profile";
import { AnswerDeltaLLM, ProfileLLM } from "./schemas";
import { clamp, norm, sentences, shortId, truncateWords, wordCount } from "./util";

const ETHNIC = /\b(race|racial|ethnic\w*|caucasian|white|black|asian|hispanic|latin[oax]|african[- ]american|arab|indigenous|gender|pronouns?)\b/i;

/** Split free text into verbatim quotes; tiny fragments are merged into a neighbour. */
export function quotesFromText(text: string, startIndex: number, questionId: string | null, source: Quote["source"]): Quote[] {
  const parts = sentences(text);
  const merged: string[] = [];
  for (const s of parts) {
    if (merged.length && (wordCount(s) < 4 || wordCount(merged[merged.length - 1]!) < 4)) merged[merged.length - 1] += ` ${s}`;
    else merged.push(s);
  }
  // keep at most 8 quotes per answer: fold the tail into the last one
  while (merged.length > 8) merged[merged.length - 2] += ` ${merged.pop()!}`;
  return merged.map((t, i) => ({
    id: `q${startIndex + i}`,
    text: t,
    questionId,
    source,
    shortForm: truncateWords(t, 12),
  }));
}

export const nextQuoteIndex = (quotes: Quote[]) =>
  quotes.reduce((m, q) => Math.max(m, Number(q.id.replace(/^q/, "")) || 0), 0) + 1;

/** "How well I know you" (D-026): own words count most, then answers, then documents. */
export function knowMeScore(profile: Profile, answered: number): number {
  const own = profile.quotes.filter((q) => q.source === "answer" || q.source === "pause");
  const ownWords = own.reduce((n, q) => n + wordCount(q.text), 0);
  const docQuotes = profile.quotes.length - own.length;
  const uploadFacts = profile.facts.filter((f) => f.source === "upload").length;
  const score = 10 + Math.min(45, ownWords * 0.25) + Math.min(20, answered * 4) + Math.min(25, docQuotes * 3 + uploadFacts * 2);
  return Math.round(clamp(score, 0, 100));
}

function defaultWorries(): DomainWeights {
  return Object.fromEntries(DOMAIN_KEYS.map((d) => [d, 0.1])) as DomainWeights;
}

/**
 * Money fields are USD. If the model copied an amount they stated in another currency without
 * converting it ("3 million baht" -> savingsUsd 3,000,000), use the code-converted USD instead.
 */
export function guardMoney(m: Profile["money"], text: string, prefer: CurrencyCode): Profile["money"] {
  const stated = statedAmounts(text, prefer);
  if (!stated.some((s) => s.code !== "USD")) return m;
  return { ...m, incomeUsd: fixUnconverted(m.incomeUsd, stated), debtUsd: fixUnconverted(m.debtUsd, stated), savingsUsd: fixUnconverted(m.savingsUsd, stated) };
}

/** Turn the model's draft into Profile fields; ids assigned here; citations filtered to real quotes. */
function applyDraft(base: Profile, draft: ProfileLLM, quotes: Quote[]): Profile {
  const valid = new Set(quotes.map((q) => q.id));
  const cite = (ids: string[]) => ids.filter((id) => valid.has(id));
  const anyQuote = quotes.find((q) => q.source === "answer")?.id ?? quotes[0]?.id;
  const people = draft.people.map((p, i) => {
    const existing = base.people.find((x) => norm(x.label) === norm(p.label));
    return {
      id: existing?.id ?? `p${i + 1}`,
      label: p.label,
      relation: p.relation,
      closeness: clamp(p.closeness, 0, 1),
      influence: clamp(p.influence, 0, 1),
      expectation: p.expectation,
      quoteIds: cite(p.quoteIds),
    };
  });
  // make person ids unique
  const used = new Set<string>();
  let n = people.length + base.people.length + 1;
  for (const p of people) {
    if (used.has(p.id)) p.id = `p${n++}`;
    used.add(p.id);
  }
  const facts = draft.facts
    .filter((f) => !(f.source === "inferred" && ETHNIC.test(`${f.label} ${f.value}`)))
    .map((f, i) => ({ id: `f${i + 1}`, key: f.key, label: f.label, value: f.value, source: f.source, quoteIds: cite(f.quoteIds), confidence: clamp(f.confidence, 0, 1) }));
  const seed = (s: { text: string; quoteIds: string[] }) => {
    const ids = cite(s.quoteIds);
    return { text: s.text, quoteIds: ids.length ? ids : anyQuote ? [anyQuote] : [] };
  };
  const w = draft.worries;
  return {
    ...base,
    facts,
    values: draft.values.slice(0, 6).map((v, i) => ({ id: `v${i + 1}`, label: v.label, weight: clamp(v.weight, 0, 1), quoteIds: cite(v.quoteIds) })),
    fears: draft.fears.slice(0, 5).map((f, i) => ({ id: `x${i + 1}`, text: f.text, kind: f.kind, quoteIds: cite(f.quoteIds) })),
    people,
    constraints: draft.constraints.map((c, i) => ({
      id: `k${i + 1}`,
      kind: c.kind,
      text: c.text,
      personId: c.personLabel ? people.find((p) => norm(p.label) === norm(c.personLabel!))?.id ?? null : null,
      quoteIds: cite(c.quoteIds),
    })),
    money: {
      feel: draft.money.feel,
      incomeUsd: draft.money.incomeUsd != null ? Math.max(0, Math.round(draft.money.incomeUsd)) : null,
      debtUsd: draft.money.debtUsd != null ? Math.max(0, Math.round(draft.money.debtUsd)) : null,
      debtKind: draft.money.debtKind,
      savingsUsd: draft.money.savingsUsd != null ? Math.max(0, Math.round(draft.money.savingsUsd)) : null,
      supportsFamily: draft.money.supportsFamily,
      assumed: draft.money.assumed,
    },
    worries: Object.fromEntries(DOMAIN_KEYS.map((d) => [d, clamp(w[d] ?? 0.1, 0, 1)])) as DomainWeights,
    seeds: { path: seed(draft.seeds.path), leap: seed(draft.seeds.leap), careful: seed(draft.seeds.careful), unjudged: seed(draft.seeds.unjudged) },
    assumptions: draft.assumptions.slice(0, 8),
    plans: plansFrom(draft.plans, cite, base.startYear),
    quotes,
  };
}

/** Dated plans from the model: ids by code, citations to real quotes, years from today on. */
function plansFrom(drafts: ProfileLLM["plans"], cite: (ids: string[]) => string[], startYear: number, offset = 0): PlannedEvent[] {
  return drafts
    .filter((d) => d.text.trim() && Number.isInteger(d.year) && d.year >= startYear && d.year <= startYear + 60)
    .slice(0, 5)
    .map((d, i) => ({ id: `pl${offset + i + 1}`, text: truncateWords(d.text.trim(), 16), year: d.year, when: d.when, kind: d.kind, certainty: d.certainty, quoteIds: cite(d.quoteIds) }));
}

/** Verbatim doc quotes → real quotes; returns them and the ref → id map. */
function docQuotesToQuotes(draft: ProfileLLM, docs: DocInput[], startIndex: number): { quotes: Quote[]; refMap: Map<string, string> } {
  const quotes: Quote[] = [];
  const refMap = new Map<string, string>();
  let i = startIndex;
  for (const dq of draft.docQuotes.slice(0, 6)) {
    const doc = docs[dq.docIndex];
    const text = dq.text.trim();
    if (!doc || text.length < 8 || !norm(doc.text).includes(norm(text))) continue; // not verbatim: drop
    const id = `q${i++}`;
    refMap.set(dq.ref, id);
    quotes.push({ id, text, questionId: null, source: doc.kind, shortForm: truncateWords(text, 12) });
  }
  return { quotes, refMap };
}

function remapRefs(draft: ProfileLLM, refMap: Map<string, string>): ProfileLLM {
  const m = (ids: string[]) => ids.map((id) => refMap.get(id) ?? id);
  return {
    ...draft,
    facts: draft.facts.map((f) => ({ ...f, quoteIds: m(f.quoteIds) })),
    values: draft.values.map((v) => ({ ...v, quoteIds: m(v.quoteIds) })),
    fears: draft.fears.map((f) => ({ ...f, quoteIds: m(f.quoteIds) })),
    people: draft.people.map((p) => ({ ...p, quoteIds: m(p.quoteIds) })),
    constraints: draft.constraints.map((c) => ({ ...c, quoteIds: m(c.quoteIds) })),
    seeds: {
      path: { ...draft.seeds.path, quoteIds: m(draft.seeds.path.quoteIds) },
      leap: { ...draft.seeds.leap, quoteIds: m(draft.seeds.leap.quoteIds) },
      careful: { ...draft.seeds.careful, quoteIds: m(draft.seeds.careful.quoteIds) },
      unjudged: { ...draft.seeds.unjudged, quoteIds: m(draft.seeds.unjudged.quoteIds) },
    },
  };
}

function applyShortForms(quotes: Quote[], draft: ProfileLLM): Quote[] {
  return quotes.map((q) => {
    const sf = draft.shortForms.find((s) => s.quoteId === q.id)?.shortForm?.trim();
    if (sf && wordCount(sf) <= 12 && norm(q.text).includes(norm(sf).replace(/[.…]+$/, ""))) return { ...q, shortForm: sf };
    return q;
  });
}

export function emptyProfile(input: StartInput, startYear: number, sessionId: string, quotes: Quote[], at: string): Profile {
  const q1 = quotes[0]?.id;
  const cites = q1 ? [q1] : [];
  return {
    sessionId,
    profileVersion: 1,
    firstName: input.firstName,
    gender: input.appearance?.gender ?? null, // self-identified on the start screen; never inferred
    age: input.age,
    birthYear: startYear - input.age,
    country: input.country.toUpperCase(),
    currency: input.currency ?? currencyForCountry(input.country),
    region: input.region,
    city: input.city || null,
    startYear,
    endAge: endAgeFor(input.age),
    facts: [{ id: "f1", key: "location", label: "Home", value: [input.city, input.region, input.country].filter(Boolean).join(", "), source: "answer", quoteIds: [], confidence: 0.9 }],
    values: [],
    fears: [],
    people: [],
    constraints: [],
    money: { feel: "okay", incomeUsd: null, debtUsd: null, debtKind: null, savingsUsd: null, supportsFamily: false, assumed: true },
    worries: defaultWorries(),
    seeds: {
      path: { text: "Keeps going as things are", quoteIds: cites },
      leap: { text: "Says yes to the thing on their mind", quoteIds: cites },
      careful: { text: "Lets caution decide", quoteIds: cites },
      unjudged: { text: "Does what they'd do if nobody judged", quoteIds: cites },
    },
    quotes,
    assumptions: [{ field: "money.feel", value: "okay", reason: "Not asked yet" }],
    plans: [],
    knowMeScore: 10,
    updatedAt: at,
  };
}

export async function buildStartProfile(call: Caller, input: StartInput, docs: DocInput[], startYear: number, at: string): Promise<Profile> {
  const sessionId = `s_${shortId()}`; // CONTRACT-REQUEST: StartInput has no sessionId; the session agent should overwrite profile.sessionId.
  const lineQuotes = quotesFromText(input.line, 1, "start", "answer");
  const base = emptyProfile(input, startYear, sessionId, lineQuotes, at);
  try {
    const r = await call.json({
      tier: "heavy",
      purpose: "profile.start",
      system: PROFILE_SYSTEM,
      prompt: profilePrompt(input, lineQuotes, docs, null),
      schema: ProfileLLM,
      maxOutputTokens: 6000,
      hedgeMs: 14000,
    });
    if (!r.data) return { ...base, knowMeScore: knowMeScore(base, 0) };
    const { quotes: dq, refMap } = docQuotesToQuotes(r.data, docs, lineQuotes.length + 1);
    const draft = remapRefs(r.data, refMap);
    const quotes = applyShortForms([...lineQuotes, ...dq], draft);
    const p = applyDraft(base, draft, quotes);
    p.money = guardMoney(p.money, [input.line, ...docs.map((d) => d.text)].join("\n"), displayCurrency(base));
    if (!p.facts.some((f) => f.key === "location")) p.facts.unshift(base.facts[0]!);
    return { ...p, knowMeScore: knowMeScore(p, 0) };
  } catch {
    return { ...base, knowMeScore: knowMeScore(base, 0) };
  }
}

export async function enrich(call: Caller, profile: Profile, docs: DocInput[], freeText: string | null, at: string): Promise<{ profile: Profile; quotes: Quote[] }> {
  const start = nextQuoteIndex(profile.quotes);
  const textQuotes = freeText?.trim() ? quotesFromText(freeText, start, "more", "answer") : [];
  const allBefore = [...profile.quotes, ...textQuotes];
  const input: StartInput = {
    firstName: profile.firstName ?? "", age: profile.age, city: profile.city ?? "", region: profile.region, country: profile.country,
    line: "", via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: profile.currency ?? null,
  };
  try {
    const r = await call.json({
      tier: "heavy",
      purpose: "profile.enrich",
      system: PROFILE_SYSTEM,
      prompt: profilePrompt(input, allBefore, docs, profile),
      schema: ProfileLLM,
      maxOutputTokens: 6000,
      hedgeMs: 14000,
    });
    if (!r.data) {
      const p = { ...profile, quotes: allBefore, profileVersion: profile.profileVersion + 1, updatedAt: at };
      return { profile: { ...p, knowMeScore: knowMeScore(p, 0) }, quotes: textQuotes };
    }
    const { quotes: dq, refMap } = docQuotesToQuotes(r.data, docs, start + textQuotes.length);
    const draft = remapRefs(r.data, refMap);
    const quotes = applyShortForms([...allBefore, ...dq], draft);
    const merged = applyDraft(profile, draft, quotes);
    merged.money = guardMoney(merged.money, [freeText ?? "", ...docs.map((d) => d.text)].join("\n"), displayCurrency(profile));
    const p = { ...merged, profileVersion: profile.profileVersion + 1, updatedAt: at };
    return { profile: { ...p, knowMeScore: knowMeScore(p, answeredCount(p)) }, quotes: [...textQuotes, ...dq] };
  } catch {
    const p = { ...profile, quotes: allBefore, profileVersion: profile.profileVersion + 1, updatedAt: at };
    return { profile: p, quotes: textQuotes };
  }
}

const answeredCount = (p: Profile) => new Set(p.quotes.filter((q) => q.questionId?.startsWith("d-")).map((q) => q.questionId)).size;

/** Fold one decision answer into the profile (fast model; skipped for a bare tap). */
export async function foldAnswer(
  call: Caller,
  state: SessionState,
  decision: Decision,
  answer: DecisionAnswer,
  at: string,
): Promise<{ profile: Profile; quote: Quote | null }> {
  const profile = state.profile!;
  const text = answer.text?.trim() ?? "";
  const opt = answer.optionId ? decision.options.find((o) => o.id === answer.optionId) : undefined;
  let quote: Quote | null = null;
  if (wordCount(text) >= 2) {
    quote = { id: `q${nextQuoteIndex(profile.quotes)}`, text, questionId: decision.id, source: "answer", shortForm: truncateWords(text, 12) };
  }
  const quotes = quote ? [...profile.quotes, quote] : profile.quotes;
  const answered = state.answers.filter((a) => a.decisionId !== decision.id).length + 1;
  let next: Profile = { ...profile, quotes, profileVersion: profile.profileVersion + 1, updatedAt: at };
  if (!quote) return { profile: { ...next, knowMeScore: knowMeScore(next, answered) }, quote: null };

  try {
    const r = await call.json({
      tier: "fast",
      purpose: "answer.fold",
      system: ANSWER_SYSTEM,
      prompt: `PROFILE\n${personBlock(profile)}\n\nTHEIR WORDS\n${quotesBlock(profile)}\n\nTHE DECISION (${decision.kind}, ${decision.year}, age ${decision.age})\n"${decision.prompt}"\nOptions: ${decision.options.map((o) => o.label).join(" | ")}\n\nTHEIR ANSWER\nTapped: ${opt ? `"${opt.label}"` : "(nothing)"}\nWrote (quote ${quote.id}): "${text}"\n\nReturn the profile delta JSON.`,
      schema: AnswerDeltaLLM,
      maxOutputTokens: 2000,
      hedgeMs: 6000,
    });
    const d = r.data;
    if (d) {
      const valid = new Set(quotes.map((q) => q.id));
      const cite = (ids: string[]) => {
        const c = ids.filter((id) => valid.has(id));
        return c.length ? c : [quote!.id];
      };
      if (d.shortForm && wordCount(d.shortForm) <= 12 && norm(text).includes(norm(d.shortForm).replace(/[.…]+$/, "")))
        quote = { ...quote, shortForm: d.shortForm.trim() };
      const people = [...profile.people];
      for (const p of d.people) {
        const i = people.findIndex((x) => norm(x.label) === norm(p.label));
        if (i >= 0) people[i] = { ...people[i]!, expectation: p.expectation ?? people[i]!.expectation, closeness: clamp(p.closeness, 0, 1), influence: clamp(p.influence, 0, 1), quoteIds: [...new Set([...people[i]!.quoteIds, ...cite(p.quoteIds)])] };
        else people.push({ id: `p${people.length + 1}`, label: p.label, relation: p.relation, closeness: clamp(p.closeness, 0, 1), influence: clamp(p.influence, 0, 1), expectation: p.expectation, quoteIds: cite(p.quoteIds) });
      }
      const facts = [...profile.facts];
      for (const f of d.facts) {
        if (f.source === "inferred" && ETHNIC.test(`${f.label} ${f.value}`)) continue;
        const i = facts.findIndex((x) => x.key === f.key && norm(x.label) === norm(f.label));
        const fact = { id: i >= 0 ? facts[i]!.id : `f${facts.length + 1}`, key: f.key, label: f.label, value: f.value, source: f.source, quoteIds: cite(f.quoteIds), confidence: clamp(f.confidence, 0, 1) };
        if (i >= 0) facts[i] = fact;
        else facts.push(fact);
      }
      const prevW = profile.worries;
      const worries = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, clamp(d.worries[k] ?? prevW[k], Math.max(0, prevW[k] - 0.2), Math.min(1, prevW[k] + 0.2))])) as DomainWeights;
      next = {
        ...next,
        quotes: quotes.map((q) => (q.id === quote!.id ? quote! : q)),
        facts,
        people,
        worries,
        fears: [...profile.fears, ...d.fears.slice(0, 2).map((f, i) => ({ id: `x${profile.fears.length + i + 1}`, text: f.text, kind: f.kind, quoteIds: cite(f.quoteIds) }))].slice(-6),
        values: [...profile.values, ...d.values.filter((v) => !profile.values.some((x) => norm(x.label) === norm(v.label))).slice(0, 2).map((v, i) => ({ id: `v${profile.values.length + i + 1}`, label: v.label, weight: clamp(v.weight, 0, 1), quoteIds: cite(v.quoteIds) }))].slice(-7),
        constraints: [...profile.constraints, ...d.constraints.slice(0, 2).map((c, i) => ({ id: `k${profile.constraints.length + i + 1}`, kind: c.kind, text: c.text, personId: c.personLabel ? people.find((p) => norm(p.label) === norm(c.personLabel!))?.id ?? null : null, quoteIds: cite(c.quoteIds) }))],
        money: d.money
          ? {
              feel: d.money.feel,
              incomeUsd: d.money.incomeUsd ?? profile.money.incomeUsd,
              debtUsd: d.money.debtUsd ?? profile.money.debtUsd,
              debtKind: d.money.debtKind ?? profile.money.debtKind,
              savingsUsd: d.money.savingsUsd ?? profile.money.savingsUsd,
              supportsFamily: d.money.supportsFamily || profile.money.supportsFamily,
              assumed: d.money.assumed && profile.money.assumed,
            }
          : profile.money,
      };
      next.money = guardMoney(next.money, text, displayCurrency(profile));
      const had = profile.plans ?? [];
      const fresh = plansFrom(d.plans, cite, profile.startYear, had.length).filter((x) => !had.some((h) => h.year === x.year && norm(h.text) === norm(x.text)));
      if (fresh.length) next.plans = [...had, ...fresh].slice(-6);
    }
  } catch {
    /* keep the quote even if the fold failed */
  }
  return { profile: { ...next, knowMeScore: knowMeScore(next, answered) }, quote };
}
