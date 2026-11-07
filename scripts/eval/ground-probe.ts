/**
 * npx tsx scripts/eval/ground-probe.ts [personaKey,...] — the profile-time Google Search lookup
 * (worker/engine/profile.ts groundFacts) on made-up eval personas: facts, latency, queries, cost.
 * ~$0.03 per persona (a Flash-Lite call + ~2 search queries).
 */
import type { UsageEvent } from "../../worker/engine";
import { createCaller, DEFAULT_MODELS } from "../../worker/engine/models";
import { costOf } from "../../worker/engine/pricing";
import { groundFacts } from "../../worker/engine/profile";
import { nodeLlm } from "./env";
import { PERSONAS } from "./personas";

const keys = (process.argv[2] ?? "ines-33-durham,noor-29-montreal").split(",");
const usages: UsageEvent[] = [];
const call = createCaller({ llm: nodeLlm(), models: DEFAULT_MODELS, onUsage: (u) => usages.push(u) });
for (const p of PERSONAS.filter((x) => keys.includes(x.key))) {
  const before = usages.length;
  const t0 = Date.now();
  const facts = await groundFacts(call, p.input, p.docs);
  const u = usages.slice(before);
  console.log(`\n${p.key}: ${Date.now() - t0} ms, ${u.reduce((n, x) => n + (x.searchQueries ?? 0), 0)} searches, $${u.reduce((n, x) => n + costOf(x), 0).toFixed(4)}`);
  for (const f of facts ?? []) console.log(`  [${f.kind}] ${f.about}: ${f.text}`);
  if (!facts) console.log("  (no facts: timed out, failed or nothing to look up)");
}
