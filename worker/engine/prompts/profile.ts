/** Profile extraction: start line (+ CV / LinkedIn / AI export) → profile draft. Heavy model. */
import { CURRENCIES, RATES_AS_OF, currencyForCountry, statedAmounts, type CurrencyCode } from "../../../shared/currency";
import type { DocInput } from "../../../shared/engine";
import type { Profile } from "../../../shared/schema";
import type { StartInput } from "../../../shared/sim";

export const PROFILE_SYSTEM = `You build the starting profile for "Every Life You Have Left", a life simulator that plays out the lives a person could still live, from today to 70.

You read what the person told us (their quotes, verbatim, with ids) and any documents they uploaded. You return a structured profile. Rules:

1. Cite, don't invent. Every fact, value, fear, person, constraint and seed lists the quote ids it came from (quoteIds). Use the ids you are given (q1, q2, ...) or the doc quote refs you create (d1, d2, ...). If something is a guess, set source "inferred", give it low confidence (0.3), and add an assumption.
2. Confidence by source: what they said = 0.9; CV/LinkedIn facts = 0.8 (feelings from a CV = 0.2); an AI-app export = 0.6 (it may be stale or flattering); a guess = 0.3.
3. docQuotes: if there are documents, copy up to 6 sentences EXACTLY as written that reveal something personal (a goal, a worry, a role, a value). Never paraphrase inside docQuotes. [] if no documents.
4. shortForms: for each quote, a <= 12 word excerpt copied verbatim from it, the part a person would recognise as theirs.
5. People: everyone they mentioned, from their words AND the documents: partner, children, parents, siblings, close friends, and pets (a pet is a person here: label = its name, relation = "dog", "cat", ...). Label them the way they did ("my mom" -> "Mom"; "your mother, Ngozi" -> "Ngozi" with relation "mother"). Never invent names. age = their age as stated ("Theo, who is 9" -> 9, "Dev (44, a nurse)" -> 44, "a 6-year-old rescue dog, Biscuit" -> 6), else null; never guess an age. expectation only if said or clearly implied.
6. Money: every money field is USD (income per year). Convert any amount they state in another currency with the rate in MONEY CONTEXT: 3,000,000 THB is about $85,000, never $3,000,000. When MONEY CONTEXT lists an amount already converted by code, use that number. Assets and savings they mention go in savingsUsd. If they didn't say, estimate from their job, age and country, and set assumed=true with an assumption entry. feel = tight | okay | comfortable.
7. Worries: 0..1 per domain (default 0.1). What they keep coming back to gets 0.6-0.9. Worry means attention, not bad luck.
8. Seeds, each <= 14 words, specific to them:
   - path: momentum, what happens if nothing changes.
   - leap: the bold yes to the opportunity or crossroads they named or implied.
   - careful: the life where their fear decides every fork, protecting security and others' expectations.
   - unjudged: what they'd do if nobody judged them.
   If they only gave one line, infer the seeds from it, honestly, and cite the quote anyway.
9. Never record, guess or use race, ethnicity, religion, sexual orientation, gender, health diagnoses or immigration status (gender comes from the start screen, separately). If they volunteered one, keep only their own framing, as an "other" or "background" fact sourced to their quote.
10. Facts use keys: occupation, education, location, living, relationship, children, background, health_habits, interests, other. Labels are 1-2 words ("Work", "Home", "Love").
11. Plans: every concrete plan they state with a time goes in plans, even in passing ("I'll return to Thailand in early 2027 for a Management Associate program", "we're moving to Denver in June", "the wedding is next spring"). year = the year it happens (resolve "next year" from today's year), when = their finer timing or null, kind = move | job | study | family | money | other, certainty = fixed if it's committed (a contract, a scholarship bond, a signed offer, a booked date), likely if they intend it, hoped if they only wish it. Cite the quote. Keep it in their framing; a plan is not a guess, so never invent one. Also record what it implies elsewhere (a location constraint, a fact). [] if there are none.`;

/** The currency they think in, the fixed rates, and every amount they wrote, converted by code. */
export function moneyContext(input: Pick<StartInput, "currency" | "country">, text: string): string {
  const prefer: CurrencyCode = input.currency ?? currencyForCountry(input.country);
  const stated = statedAmounts(text, prefer);
  const codes = [...new Set<CurrencyCode>([prefer, ...stated.map((s) => s.code)])].filter((c) => c !== "USD");
  const lines = [`MONEY CONTEXT: every money field is USD. They think in ${prefer === "USD" ? "US dollars" : `${CURRENCIES[prefer].name} (${prefer})`}.`];
  for (const c of codes) lines.push(`Fixed rate (${RATES_AS_OF}): 1 USD = ${CURRENCIES[c].perUsd} ${c}. To convert ${c} to USD, divide by ${CURRENCIES[c].perUsd}.`);
  const foreign = stated.filter((s) => s.code !== "USD");
  if (foreign.length)
    lines.push(`Amounts they wrote, converted by code (use these USD numbers): ${foreign.map((s) => `"${s.text}" = ${s.amount.toLocaleString("en-US")} ${s.code} = about $${s.usd.toLocaleString("en-US")}`).join("; ")}.`);
  else if (prefer !== "USD") lines.push(`A bare amount with no currency is probably ${prefer}.`);
  return lines.join("\n");
}

export function profilePrompt(input: StartInput, quotes: { id: string; text: string }[], docs: DocInput[], existing: Profile | null): string {
  const parts: string[] = [];
  parts.push(
    `PERSON: ${input.firstName}, ${input.age}, lives in ${[input.city, input.region, input.country].filter(Boolean).join(", ")}. Today is ${new Date().getUTCFullYear()}. They answered "What's on your mind lately?" (${input.via}).`,
  );
  parts.push(moneyContext(input, [input.line, ...quotes.map((q) => q.text), ...docs.map((d) => d.text)].join("\n")));
  parts.push(`THEIR WORDS (verbatim, cite these ids):\n${quotes.map((q) => `${q.id}: "${q.text}"`).join("\n") || "(none)"}`);
  if (existing) {
    parts.push(
      `CURRENT PROFILE (update it; keep what is still true, correct what new material contradicts, keep people labels stable):\n${JSON.stringify({
        facts: existing.facts.map(({ key, label, value, source, quoteIds, confidence }) => ({ key, label, value, source, quoteIds, confidence })),
        values: existing.values.map(({ label, weight, quoteIds }) => ({ label, weight, quoteIds })),
        fears: existing.fears.map(({ text, kind, quoteIds }) => ({ text, kind, quoteIds })),
        people: existing.people.map(({ label, relation, closeness, influence, expectation, quoteIds }) => ({ label, relation, closeness, influence, expectation, quoteIds })),
        constraints: existing.constraints.map(({ kind, text, quoteIds }) => ({ kind, text, quoteIds })),
        money: existing.money,
        worries: existing.worries,
        seeds: existing.seeds,
        plans: (existing.plans ?? []).map(({ text, year, when, kind, certainty, quoteIds }) => ({ text, year, when, kind, certainty, quoteIds })),
      })}`,
    );
  }
  docs.forEach((d, i) => {
    parts.push(`DOCUMENT ${i} (${d.kind === "ai_export" ? "pasted from their own AI app" : d.kind === "cv" ? "CV" : "LinkedIn PDF"}):\n"""\n${d.text.slice(0, 24000)}\n"""`);
  });
  parts.push(`Return the profile JSON.`);
  return parts.join("\n\n");
}
