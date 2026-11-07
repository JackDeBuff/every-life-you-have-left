/**
 * npx tsx scripts/qa/shock-stats.ts [n] — how often lives get life shocks (worker/engine/shocks.ts),
 * over n made-up sessions per persona: shocks per life, types, and world pandemics. No model calls.
 */
import { planShocks } from "../../worker/engine/shocks";
import { worldTimeline } from "../../worker/engine/world";
import { profileOf } from "./fixtures";

const n = Number(process.argv[2] ?? 2000);
const people = [
  profileOf({ firstName: "Rae", age: 25, city: "Tampa", region: "FL", country: "US", line: "I rent a place near the bay and work in logistics." }),
  profileOf({ firstName: "Ola", age: 40, city: "Leeds", region: "England", country: "GB", line: "We own a terraced house; my mum is 71." }),
  profileOf({ firstName: "Ken", age: 58, city: "Osaka", region: null, country: "JP", line: "Thirty years at the same firm." }),
];
for (const p of people) {
  const perLife: number[] = [0, 0, 0, 0];
  const types = new Map<string, number>();
  let pandemics = 0;
  let natural = 0;
  for (let i = 0; i < n; i++) {
    const seed = `stats_${i}`;
    const world = worldTimeline(seed, p.startYear, p.birthYear + p.endAge);
    if (world.some((w) => w.kind === "other")) pandemics++;
    const plan = planShocks(seed, "you", p, world);
    perLife[plan.length]!++;
    for (const s of plan) types.set(s.type, (types.get(s.type) ?? 0) + 1);
    if (plan.filter((s) => s.scope === "natural").length > 1) natural++;
  }
  const pct = (x: number) => `${((100 * x) / n).toFixed(0)}%`;
  console.log(`\n${p.firstName} (${p.age}, ${p.city}; span ${p.endAge - p.age} yrs), ${n} lives`);
  console.log(`  shocks per life: 0 ${pct(perLife[0]!)} | 1 ${pct(perLife[1]!)} | 2 ${pct(perLife[2]!)} | 3 ${pct(perLife[3]!)}`);
  console.log(`  by type: ${[...types].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t} ${pct(c)}`).join(", ")}`);
  console.log(`  sessions with a pandemic: ${pct(pandemics)}; lives with 2+ natural disasters: ${natural}`);
}
