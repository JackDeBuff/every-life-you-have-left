/**
 * npm run eval — synthetic-persona evals for the engine (docs/EVAL.md).
 *
 *   npm run eval                                  all 8 personas x 3 heavy models, judged by argon
 *   npm run eval -- --models gemini-3.8-flash     one model
 *   npm run eval -- --personas maya-19-columbus   one persona (comma list ok)
 *   npm run eval -- --n 2 --budget 3 --no-judge   first 2 personas, $3 cap, no judge
 *   npm run eval -- --concurrency 4
 *
 * Every model call is priced (scripts/eval/pricing.ts) into one ledger; no new session starts
 * once the projected spend would pass the budget, and a running session stops between steps if
 * the cap is crossed. Results: scripts/eval/results/run-<stamp>.json (+ summary-<stamp>.json).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { UsageEvent } from "../../worker/engine";
import { nodeLlm } from "./env";
import { judgeSession, type Verdict } from "./judge";
import { PERSONAS } from "./personas";
import { Ledger } from "./pricing";
import { runSession, type SessionResult } from "./session";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name: string) => args.includes(`--${name}`);

const MODELS = (opt("models") ?? "gemini-3.8-flash,gemini-4-argon,openai/gpt-oss-120b-maas,gemini-3.5-flash-lite").split(",");
const budget = Number(opt("budget") ?? 8);
const concurrency = Number(opt("concurrency") ?? 5);
const judge = !flag("no-judge");
let personas = PERSONAS;
if (opt("personas")) personas = PERSONAS.filter((p) => opt("personas")!.split(",").includes(p.key));
if (opt("n")) personas = personas.slice(0, Number(opt("n")));

const llm = nodeLlm();
const ledger = new Ledger(budget);
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = new URL("./results/", import.meta.url);
mkdirSync(outDir, { recursive: true });

interface Row {
  result: SessionResult;
  verdict: Verdict | null;
  judgeCost: number;
}
const rows: Row[] = [];
const jobs = personas.flatMap((p) => MODELS.map((m) => ({ p, m })));
console.log(`eval: ${personas.length} personas x ${MODELS.length} models = ${jobs.length} sessions; budget $${budget}; judge ${judge ? "gemini-4-argon" : "off"}`);

// projected per-session cost by model, updated as sessions finish
const projected: Record<string, number> = { "gemini-3.8-flash": 0.3, "gemini-4-argon": 0.8, "openai/gpt-oss-120b-maas": 0.15, "gemini-3.5-flash-lite": 0.15 };
let running = 0;
const projectedRunning = new Map<number, number>();

async function worker(id: number) {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    const proj = (projected[job.m] ?? 0.5) + (judge ? 0.05 : 0);
    const inflight = [...projectedRunning.values()].reduce((a, b) => a + b, 0);
    if (ledger.spent + inflight + proj > budget) {
      console.log(`skip ${job.p.key} / ${job.m}: projected spend $${(ledger.spent + inflight + proj).toFixed(2)} > $${budget}`);
      continue;
    }
    running++;
    projectedRunning.set(id, proj);
    const tag = `[${job.p.key} | ${job.m}]`;
    const logs: string[] = [];
    const t0 = Date.now();
    const result = await runSession(llm, job.p, job.m, ledger, (s) => logs.push(s));
    let verdict: Verdict | null = null;
    let judgeCost = 0;
    if (judge && result.transcript.profile && result.transcript.years.length) {
      const before = ledger.spent;
      verdict = await judgeSession(llm, result, job.p.input.line, (u: UsageEvent) => ledger.add(u));
      judgeCost = ledger.spent - before;
    }
    projectedRunning.delete(id);
    running--;
    projected[job.m] = Math.max(projected[job.m] ?? 0, result.cost.session * 1.1);
    rows.push({ result, verdict, judgeCost });
    console.log(
      `${tag} ${result.ok ? "ok" : "FAIL"} ${Math.round((Date.now() - t0) / 1000)}s | years ${result.validity.years} schemaOk ${result.validity.schemaOk} repaired ${result.validity.repaired} fallback ${result.validity.fallback} filler ${result.validity.filler} | first year ${result.timings.firstYearMs[0] ?? "-"}ms, ${result.timings.perYearMs}ms/yr | $${result.cost.session.toFixed(3)} | judge ${verdict ? `${verdict.overall} (P${verdict.personal} B${verdict.believable} M${verdict.no_melodrama} F${verdict.forks} S${verdict.specificity} E${verdict.ending})` : "-"} | spent $${ledger.spent.toFixed(2)}`,
    );
    if (flag("verbose")) console.log(logs.join("\n"));
    writeFileSync(new URL(`run-${stamp}.json`, outDir), JSON.stringify(rows, null, 1));
  }
}

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, i) => worker(i)));

// ---- summary table
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};
const f1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "-");
const summary = MODELS.map((m) => {
  const rs = rows.filter((r) => r.result.heavy === m);
  const v = rs.map((r) => r.verdict).filter((x): x is Verdict => Boolean(x));
  const years = rs.reduce((s, r) => s + r.result.validity.years, 0);
  const crit = (k: keyof Verdict) => mean(v.map((x) => x[k] as number));
  return {
    model: m,
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
    contractErrors: rs.reduce((s, r) => s + r.result.validity.contractErrors.length, 0),
    tpPerLife: mean(rs.map((r) => r.result.validity.turningPoints)),
    tpCitedPct: 100 * (rs.reduce((s, r) => s + r.result.validity.tpWithQuote, 0) / Math.max(1, rs.reduce((s, r) => s + r.result.validity.turningPoints, 0))),
    quietPct: years ? (100 * rs.reduce((s, r) => s + r.result.validity.quietYears, 0)) / Math.max(1, rs.reduce((s, r) => s + r.result.transcript.years.length, 0)) : NaN,
    firstYearMsMean: mean(rs.map((r) => r.result.timings.firstYearMs[0] ?? NaN).filter(Number.isFinite)),
    firstYearMsMedian: median(rs.map((r) => r.result.timings.firstYearMs[0] ?? NaN).filter(Number.isFinite)),
    anyChunkFirstYearMsMean: mean(rs.flatMap((r) => r.result.timings.firstYearMs).filter((x) => x > 0)),
    perYearMs: mean(rs.map((r) => r.result.timings.perYearMs)),
    decisionMs: mean(rs.flatMap((r) => r.result.timings.decisionMs)),
    profileMs: mean(rs.map((r) => r.result.timings.profileMs)),
    firstCardMs: mean(rs.map((r) => r.result.timings.firstCardMs ?? 0).filter((x) => x > 0)),
    sessionMin: mean(rs.map((r) => r.result.timings.sessionMs)) / 60000,
    costPerSession: mean(rs.map((r) => r.result.cost.session)),
    heavyCostPerSession: mean(rs.map((r) => r.result.cost.byModel[m] ?? 0)),
    tokensPerSession: mean(rs.map((r) => r.result.tokens.input + r.result.tokens.output + r.result.tokens.thought)),
    hedges: rs.reduce((s, r) => s + r.result.hedges, 0),
    cliches: rs.reduce((s, r) => s + r.result.validity.cliches, 0),
  };
});
writeFileSync(new URL(`summary-${stamp}.json`, outDir), JSON.stringify({ stamp, budget, spent: ledger.spent, summary, notes: rows.map((r) => ({ persona: r.result.persona, model: r.result.heavy, verdict: r.verdict, error: r.result.error })) }, null, 1));

console.log(`\n| Model | Sessions | Overall | Personal | Believable | No melodrama | Forks | Specific | Ending | Safety | Schema-valid | Rule-valid | First year (median) | Per year | $/session |`);
console.log(`|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const s of summary)
  console.log(
    `| ${s.model} | ${s.ok}/${s.sessions} | ${f1(s.overall)} | ${f1(s.personal)} | ${f1(s.believable)} | ${f1(s.no_melodrama)} | ${f1(s.forks)} | ${f1(s.specificity)} | ${f1(s.ending)} | ${f1(s.safety)} | ${f1(s.schemaValidPct)}% | ${f1(s.ruleValidPct)}% | ${(s.firstYearMsMedian / 1000).toFixed(1)}s | ${(s.perYearMs / 1000).toFixed(2)}s | $${s.costPerSession.toFixed(3)} |`,
  );
console.log(`\nspent $${ledger.spent.toFixed(2)} of $${budget} (${ledger.calls} calls). Results: scripts/eval/results/run-${stamp}.json`);
void running;
