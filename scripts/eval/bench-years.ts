/**
 * Latency/token benchmark for one generateYears chunk, from a saved eval session.
 *   npx tsx scripts/eval/bench-years.ts <run-file.json> <model> [thinking] [years]
 */
import { readFileSync } from "node:fs";
import type { SessionState } from "../../shared/sim";
import { createEngine, type UsageEvent } from "../../worker/engine";
import type { ThinkingLevel } from "../../worker/engine/llm-port";
import { nodeLlm } from "./env";
import { costOf } from "./pricing";
import type { SessionResult } from "./session";

const [file, model = "gemini-3.8-flash", thinking = "low", n = "8"] = process.argv.slice(2);
const rows = JSON.parse(readFileSync(new URL(`./results/${file}`, import.meta.url), "utf8")) as { result: SessionResult }[];
const r = rows[0]!.result;
const t = r.transcript;
const profile = t.profile!;
const from = profile.startYear + 10;
const state: SessionState = {
  sessionId: profile.sessionId, phase: "playing", speed: "auto", profile, appearance: null, portraits: [], settings: t.settings, nudges: [],
  decisions: t.decisions.map(({ answer: _a, ...d }) => d), answers: t.decisions.map((d) => d.answer!).filter(Boolean),
  years: t.years.filter((y) => y.year < from), playhead: { year: from, age: from - profile.birthYear, paused: false },
  branches: [], log: [], status: null, budgets: { smallLeft: 0, bigLeft: 0 }, endAge: profile.endAge, verdictAtEnd: null, updatedAt: "",
};
const usages: UsageEvent[] = [];
const engine = createEngine({ llm: nodeLlm(), models: { heavy: model, heavyThinking: thinking as ThinkingLevel }, onUsage: (u) => usages.push(u), onMetric: (m) => m.errors.length && console.log(`  ${m.year} errors: ${m.errors.join(" | ")} repaired=${m.repaired} fallback=${m.fallback}`) });
const t0 = Date.now();
const stamps: number[] = [];
const ys = await engine.generateYears(state, from, Number(n), () => stamps.push(Date.now() - t0));
console.log(`${model} thinking=${thinking}: ${ys.length} years, first ${stamps[0]}ms, total ${Date.now() - t0}ms, per year ${Math.round((Date.now() - t0) / ys.length)}ms`);
console.log(`  stamps ${stamps.join(" ")}`);
for (const u of usages) console.log(`  ${u.purpose} in ${u.inputTokens} out ${u.outputTokens} thought ${u.thoughtTokens} ms ${u.ms} first ${u.firstTokenMs ?? "-"} hedged ${u.hedged} $${costOf(u).toFixed(4)}`);
console.log(`  sample: ${JSON.stringify(ys[1]).length} chars/year; ${ys[1]?.summary} | ${ys[1]?.events.map((e) => e.title).join("; ")}`);
