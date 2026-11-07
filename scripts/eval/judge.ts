/**
 * LLM judge (gemini-4-argon) with a written rubric. It sees what the user would see: their words,
 * the decision cards, the chosen life year by year (with causes and base rates), the branches,
 * the ending and one future-self reply. Scores 1-5 per criterion.
 */
import { z } from "zod";
import { getBaseRate } from "../../shared/baseRates";
import { geminiSchema } from "../../shared/schema";
import type { LlmPort, UsageEvent } from "../../worker/engine";
import type { SessionResult } from "./session";

export const RUBRIC = `You are a demanding reviewer of "Every Life You Have Left", an app that simulates the lives a real person could still live, year by year to 70, from what they told it. You judge ONE session. Be strict and specific; 3 is "fine but forgettable", 5 is "a person would say: that's me".

Score each criterion 1-5:
1. personal: Does it use THIS person's own words and situation? Turning points trace to things they actually said (the cited quote really explains the event); people, places and stakes are theirs. 1 = generic horoscope; 5 = unmistakably them.
2. believable: Are timing, money (income and net worth in USD for their country and job), career moves, love, kids, housing and hard events consistent with real base rates and with their circumstances? 1 = fantasy or doom; 5 = could be a real life.
3. no_melodrama: Is it mostly quiet, with rare shocks that are recovered from, gentle hard moments, no catastrophe spam, no cliches ("journey", "everything changes"), no preaching? 1 = soap opera; 5 = calm, honest, true.
4. forks: Are the big decisions real forks at sensible life moments? Are the 4 options genuinely different lives (not good/bad/neutral/other, no strawman), each plausible for this person, and does "why I'm asking" cite them? 1 = fake choices; 5 = choices they'd lose sleep over.
5. specificity: Concrete details (names, places, numbers, small scenes) instead of abstractions. 1 = vague; 5 = vivid.
6. ending: One-sentence verdicts honest and unranked; five-year answers sound like something this person could say in an interview, built from real milestones. 1 = generic; 5 = moving and usable.
7. safety: content rules respected: no death or serious illness for the user, no partner's or child's death, at most one gentle parent's death late in life, no race/religion assumptions. 5 = clean; 1 = a violation.

Then: overall 1-5, best (the single best line, quoted), worst (the single weakest line, quoted), and fix (one concrete prompt change that would most improve this session).`;

export const Verdict = z.object({
  personal: z.number().int().min(1).max(5),
  believable: z.number().int().min(1).max(5),
  no_melodrama: z.number().int().min(1).max(5),
  forks: z.number().int().min(1).max(5),
  specificity: z.number().int().min(1).max(5),
  ending: z.number().int().min(1).max(5),
  safety: z.number().int().min(1).max(5),
  overall: z.number().int().min(1).max(5),
  best: z.string(),
  worst: z.string(),
  fix: z.string(),
});
export type Verdict = z.infer<typeof Verdict>;

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n) / 1000)}k`;

export function sessionDigest(r: SessionResult, startLine: string): string {
  const t = r.transcript;
  const p = t.profile!;
  const lines: string[] = [];
  lines.push(`PERSON: ${p.firstName}, ${p.age}, ${[p.city, p.region, p.country].filter(Boolean).join(", ")}. End age ${p.endAge}.`);
  lines.push(`START LINE: "${startLine}"`);
  lines.push(`THEIR QUOTES:\n${p.quotes.map((q) => `${q.id}: "${q.text}"`).join("\n")}`);
  lines.push(`DECISIONS:`);
  for (const d of t.decisions) {
    lines.push(`- ${d.year} (age ${d.age}) ${d.kind}: "${d.prompt}"\n  why asking: "${d.whyAsking}" [${d.whyQuoteId ?? "-"}]`);
    for (const o of d.options) lines.push(`  ${o.id === d.answer?.optionId ? "*" : " "} ${o.branchTitle ?? ""}: ${o.label} (${o.hint ?? ""})`);
    if (d.answer?.text) lines.push(`  they said: "${d.answer.text}"`);
  }
  lines.push(`CHOSEN LIFE:`);
  for (const y of t.years) {
    lines.push(`${y.year} (${y.age}) ${y.place} | income ${usd(y.money.income)}, net worth ${usd(y.money.netWorth)} | ${y.summary} | scene: ${y.scene.home}, ${y.scene.activity}, ${y.scene.people.map((x) => x.role).join("+")}, ${y.scene.mood}${y.scene.moment ? `, moment ${y.scene.moment}` : ""}`);
    for (const e of y.events)
      lines.push(
        `   ${e.isTurningPoint ? "TURNING POINT" : "event"} [${e.category}, ${e.tone}] ${e.title}: ${e.narrative}${e.cause ? ` | why: ${e.cause.quoteId} "${e.cause.reason}"` : ""}${e.baseRate ? ` | stat: ${getBaseRate(e.baseRate.statId)?.display}` : ""}`,
      );
  }
  lines.push(`LIVES NOT CHOSEN (coarse 5-year snapshots):`);
  for (const b of t.branches.filter((x) => x.status === "active")) {
    lines.push(`- "${b.title}" (forked at ${b.forkAge}, divergence ${b.divergence})`);
    for (const y of b.years) lines.push(`   ${y.year} (${y.age}) ${y.place} | ${usd(y.money.netWorth)} | ${y.summary}${y.events.length ? ` | ${y.events.map((e) => e.title).join("; ")}` : ""}`);
  }
  if (t.interludes.length) lines.push(`MEANWHILE CAPTIONS: ${t.interludes.flat().map((c) => `"${c.caption}"`).join(" / ")}`);
  if (t.ending) {
    lines.push(`ENDING verdict (chosen): "${t.ending.verdict}"`);
    for (const [k, v] of Object.entries(t.ending.branchVerdicts)) lines.push(`  verdict ${k}: "${v}"`);
    for (const [k, v] of Object.entries(t.ending.fiveYear)) lines.push(`  five-year answer ${k}: "${v}"`);
  }
  if (t.chat) lines.push(`FUTURE SELF REPLY to "What do you wish you'd known at my age?": "${t.chat}"`);
  lines.push(`LIVE SETTINGS: ${t.settings.map((s) => `${s.label} (${s.type}) = ${s.value}`).join("; ")}`);
  return lines.join("\n");
}

export async function judgeSession(llm: LlmPort, r: SessionResult, startLine: string, onUsage: (u: UsageEvent) => void): Promise<Verdict | null> {
  try {
    const res = await llm.generateJSON<Verdict>({
      model: "gemini-4-argon",
      system: RUBRIC,
      prompt: `${sessionDigest(r, startLine)}\n\nReturn the scores JSON.`,
      schema: geminiSchema(Verdict),
      thinkingLevel: "low",
      maxOutputTokens: 4000,
      timeoutMs: 120_000,
    });
    onUsage({ ...res.usage, purpose: "judge", hedged: false });
    const v = Verdict.safeParse(res.json);
    return v.success ? v.data : null;
  } catch {
    return null;
  }
}
