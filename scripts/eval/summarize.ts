/**
 * Summary table for one or more eval runs (grouped by heavy model, or by model + tag).
 *   npx tsx scripts/eval/summarize.ts run-A.json [run-B.json ...] [--tag label-for-each]
 * Also used by index.ts at the end of a run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Verdict } from "./judge";
import type { SessionResult } from "./session";

export interface Row {
  result: SessionResult;
  verdict: Verdict | null;
  judgeCost: number;
  tag?: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-");

export function summarize(rows: Row[]) {
  const groups = [...new Set(rows.map((r) => `${r.result.heavy}${r.tag ? ` (${r.tag})` : ""}`))];
  return groups.map((g) => {
    const rs = rows.filter((r) => `${r.result.heavy}${r.tag ? ` (${r.tag})` : ""}` === g);
    const m = rs[0]!.result.heavy;
    const v = rs.map((r) => r.verdict).filter((x): x is Verdict => Boolean(x));
    const years = rs.reduce((s, r) => s + r.result.validity.years, 0);
    const crit = (k: keyof Verdict) => mean(v.map((x) => x[k] as number));
    // every fork (each generateYears call right after an answer), not just the first one
    const firstYears = rs.flatMap((r) => r.result.timings.firstYearMs).filter((x) => Number.isFinite(x) && x > 0);
    return {
      group: g,
      model: m,
      personas: rs.map((r) => r.result.persona.split("-")[0]).join(", "),
      sessions: rs.length,
      ok: rs.filter((r) => r.result.ok).length,
      judged: v.length,
      overall: crit("overall"),
      personal: crit("personal"),
      believable: crit("believable"),
      no_melodrama: crit("no_melodrama"),
      forks: crit("forks"),
      specificity: crit("specificity"),
      ending: crit("ending"),
      safety: crit("safety"),
      schemaValidPct: years ? (100 * rs.reduce((s, r) => s + r.result.validity.schemaOk, 0)) / years : NaN,
      ruleValidPct: years ? (100 * (years - rs.reduce((s, r) => s + r.result.validity.hardErrorYears, 0))) / years : NaN,
      repaired: rs.reduce((s, r) => s + r.result.validity.repaired, 0),
      fallback: rs.reduce((s, r) => s + r.result.validity.fallback, 0),
      filler: rs.reduce((s, r) => s + r.result.validity.filler, 0),
      years,
      contractErrors: rs.reduce((s, r) => s + r.result.validity.contractErrors.length, 0),
      tpPerLife: mean(rs.map((r) => r.result.validity.turningPoints)),
      tpCitedPct:
        (100 * rs.reduce((s, r) => s + r.result.validity.tpWithQuote, 0)) / Math.max(1, rs.reduce((s, r) => s + r.result.validity.turningPoints, 0)),
      quietPct: (100 * rs.reduce((s, r) => s + r.result.validity.quietYears, 0)) / Math.max(1, rs.reduce((s, r) => s + r.result.transcript.years.length, 0)),
      firstYearMsMean: mean(firstYears),
      firstYearMsMedian: median(firstYears),
      perYearMs: mean(rs.map((r) => r.result.timings.perYearMs)),
      decisionMs: mean(rs.flatMap((r) => r.result.timings.decisionMs)),
      profileMs: mean(rs.map((r) => r.result.timings.profileMs)),
      firstCardMs: mean(rs.map((r) => r.result.timings.firstCardMs ?? 0).filter((x) => x > 0)),
      sessionMin: mean(rs.map((r) => r.result.timings.sessionMs)) / 60000,
      costPerSession: mean(rs.map((r) => r.result.cost.session)),
      heavyCostPerSession: mean(rs.map((r) => r.result.cost.byModel[m] ?? 0)),
      branchCostPerSession: mean(rs.map((r) => (r.result.cost.byPurpose["branch.coarse"] ?? 0) + (r.result.cost.byPurpose["branch.fine"] ?? 0))),
      tokensPerSession: mean(rs.map((r) => r.result.tokens.input + r.result.tokens.output + r.result.tokens.thought)),
      judgeCost: rs.reduce((s, r) => s + r.judgeCost, 0),
      hedges: rs.reduce((s, r) => s + r.result.hedges, 0),
      cliches: rs.reduce((s, r) => s + r.result.validity.cliches, 0),
    };
  });
}

export function table(summary: ReturnType<typeof summarize>): string {
  const lines = [
    `| Heavy model | Sessions | Overall | Personal | Believable | No melodrama | Forks | Specific | Ending | Safety | Schema-valid | Rule-valid (1st pass) | First year after a fork (median, all forks) | Per year | $/session |`,
    `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
  ];
  for (const s of summary)
    lines.push(
      `| ${s.group} | ${s.ok}/${s.sessions} | ${f1(s.overall)} | ${f1(s.personal)} | ${f1(s.believable)} | ${f1(s.no_melodrama)} | ${f1(s.forks)} | ${f1(s.specificity)} | ${f1(s.ending)} | ${f1(s.safety)} | ${f1(s.schemaValidPct)}% | ${f1(s.ruleValidPct)}% | ${(s.firstYearMsMedian / 1000).toFixed(1)} s | ${(s.perYearMs / 1000).toFixed(2)} s | $${s.costPerSession.toFixed(2)} |`,
    );
  return lines.join("\n");
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const tagI = args.indexOf("--tag");
  const tags = tagI >= 0 ? args[tagI + 1]!.split(",") : [];
  const files = args.filter((a, i) => a.endsWith(".json") && !(tagI >= 0 && i === tagI + 1));
  const rows: Row[] = files.flatMap((f, i) =>
    (JSON.parse(readFileSync(new URL(`./results/${f.replace(/^.*results\//, "")}`, import.meta.url), "utf8")) as Row[]).map((r) => ({ ...r, tag: tags[i] })),
  );
  const s = summarize(rows);
  console.log(table(s));
  console.log(JSON.stringify(s.map(({ group, personas, firstCardMs, profileMs, decisionMs, firstYearMsMean, repaired, fallback, filler, years, tpPerLife, tpCitedPct, quietPct, heavyCostPerSession, branchCostPerSession, tokensPerSession, judgeCost, hedges, cliches, sessionMin, contractErrors }) => ({ group, personas, firstCardMs, profileMs, decisionMs, firstYearMsMean, repaired, fallback, filler, years, tpPerLife, tpCitedPct, quietPct, heavyCostPerSession, branchCostPerSession, tokensPerSession, judgeCost, hedges, cliches, sessionMin, contractErrors })), null, 1));
  const out = args.includes("--write") ? `summary-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json` : null;
  if (out) writeFileSync(new URL(`./results/${out}`, import.meta.url), JSON.stringify({ files, summary: s, notes: rows.map((r) => ({ persona: r.result.persona, model: r.result.heavy, tag: r.tag ?? null, verdict: r.verdict, error: r.result.error })) }, null, 1));
}
