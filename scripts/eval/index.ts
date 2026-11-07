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
import { summarize, table } from "./summarize";
import { PERSONAS } from "./personas";
import { Ledger } from "./pricing";
import { runSession, type SessionResult } from "./session";
import { checkSession, printReport } from "./consistency";

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
const smalls = Number(opt("smalls") ?? 0);
const singleSmalls = flag("single-smalls");
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
const projected: Record<string, number> = { "gemini-3.8-flash": 0.35, "gemini-4-argon": 0.65, "openai/gpt-oss-120b-maas": 0.15, "gemini-3.5-flash-lite": 0.25, "gemini-3.8-flash+auto:gemini-3.5-flash-lite": 0.3 };
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
    const result = await runSession(llm, job.p, job.m, ledger, (s) => logs.push(s), { smalls, singleSmalls });
    let verdict: Verdict | null = null;
    let judgeCost = 0;
    if (judge && result.transcript.profile && result.transcript.years.length) {
      // the judge's own usage only (a ledger delta would include concurrent sessions' spend)
      verdict = await judgeSession(llm, result, job.p.input.line, (u: UsageEvent) => (judgeCost += ledger.add(u)));
    }
    projectedRunning.delete(id);
    running--;
    projected[job.m] = Math.max(projected[job.m] ?? 0, result.cost.session * 1.1);
    rows.push({ result, verdict, judgeCost });
    console.log(
      `${tag} ${result.ok ? "ok" : "FAIL"} ${Math.round((Date.now() - t0) / 1000)}s | years ${result.validity.years} schemaOk ${result.validity.schemaOk} repaired ${result.validity.repaired} fallback ${result.validity.fallback} filler ${result.validity.filler} | first year ${result.timings.firstYearMs[0] ?? "-"}ms, ${result.timings.perYearMs}ms/yr | $${result.cost.session.toFixed(3)} | judge ${verdict ? `${verdict.overall} (P${verdict.personal} B${verdict.believable} M${verdict.no_melodrama} F${verdict.forks} S${verdict.specificity} E${verdict.ending})` : "-"} | spent $${ledger.spent.toFixed(2)}`,
    );
    if (flag("verbose")) console.log(logs.join("\n"));
    printReport(tag, checkSession(result.transcript, new Date(result.startedAt)));
    writeFileSync(new URL(`run-${stamp}.json`, outDir), JSON.stringify(rows, null, 1));
  }
}

await Promise.all(Array.from({ length: Math.max(1, concurrency) }, (_, i) => worker(i)));

// ---- summary table
const summary = summarize(rows);
writeFileSync(
  new URL(`summary-${stamp}.json`, outDir),
  JSON.stringify({ stamp, budget, spent: ledger.spent, summary, notes: rows.map((r) => ({ persona: r.result.persona, model: r.result.heavy, verdict: r.verdict, error: r.result.error })) }, null, 1),
);
console.log(`\n${table(summary)}`);
console.log(`\nspent $${ledger.spent.toFixed(2)} of $${budget} (${ledger.calls} calls). Results: scripts/eval/results/run-${stamp}.json`);
void running;
