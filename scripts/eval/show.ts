/**
 * Print a readable digest of an eval run (the same text the judge sees).
 *   npx tsx scripts/eval/show.ts [run-file.json] [persona-substring] [model-substring]
 */
import { readdirSync, readFileSync } from "node:fs";
import { sessionDigest } from "./judge";
import { PERSONAS } from "./personas";
import type { SessionResult } from "./session";

const dir = new URL("./results/", import.meta.url);
const [fileArg, who, model] = process.argv.slice(2);
const file =
  fileArg && fileArg.endsWith(".json")
    ? fileArg
    : readdirSync(dir)
        .filter((f) => f.startsWith("run-"))
        .sort()
        .at(-1)!;
const rows = JSON.parse(readFileSync(new URL(file.replace(/^.*results\//, ""), dir), "utf8")) as { result: SessionResult; verdict: unknown }[];
for (const r of rows) {
  if (who && !r.result.persona.includes(who)) continue;
  if (model && !r.result.heavy.includes(model)) continue;
  const p = PERSONAS.find((x) => x.key === r.result.persona)!;
  console.log(`\n==================== ${r.result.persona} | ${r.result.heavy} ====================`);
  if (r.result.transcript.profile) console.log(sessionDigest(r.result, p.input.line));
  console.log(`\nVERDICT ${JSON.stringify(r.verdict, null, 1)}`);
  console.log(`COST ${JSON.stringify(r.result.cost)}\nTIMINGS ${JSON.stringify(r.result.timings)}\nVALIDITY ${JSON.stringify(r.result.validity)}`);
}
