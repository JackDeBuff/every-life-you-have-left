/**
 * npm run check:demo — validates every shared/demo/*.json against the zod contracts and the
 * invariants in shared/validate.ts. Exits 1 on any problem.
 */
import { readdirSync, readFileSync } from "node:fs";
import { DemoBundle, geminiSchema, Life, LifePlan, ProfileDraft } from "../shared/schema";
import { checkLife } from "../shared/validate";
import { LIFE_KEYS } from "../shared/lives";

const dir = new URL("../shared/demo/", import.meta.url);
let failed = 0;

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const raw = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  const parsed = DemoBundle.safeParse(raw);
  if (!parsed.success) {
    failed++;
    console.error(`x ${file}: schema`);
    for (const i of parsed.error.issues.slice(0, 20)) console.error(`   ${i.path.join(".")}: ${i.message}`);
    continue;
  }
  const b = parsed.data;
  const errs: string[] = [];
  const keys = b.lives.map((l) => l.key).join(",");
  if (keys !== LIFE_KEYS.join(",")) errs.push(`lives must be in order ${LIFE_KEYS.join(",")}, got ${keys}`);
  for (const life of b.lives) errs.push(...checkLife(life, b.profile));
  for (const r of b.retunes) {
    const withQuote = { ...b.profile, quotes: [...b.profile.quotes, r.quote] };
    for (const life of r.lives) errs.push(...checkLife(life, withQuote).map((e) => `retune ${r.pauseId}: ${e}`));
  }
  if (errs.length) {
    failed++;
    console.error(`x ${file}`);
    for (const e of errs) console.error(`   ${e}`);
  } else {
    const tps = b.lives.map((l) => `${l.key}=${l.years.flatMap((y) => y.events).filter((e) => e.isTurningPoint).length}`);
    console.log(`ok ${file}: ${b.lives.length} lives x ${b.lives[0]!.years.length} years; turning points ${tps.join(" ")}`);
  }
}

// The Gemini schemas must serialise (and stay reasonably small).
for (const [name, s] of Object.entries({ Life, LifePlan, ProfileDraft })) {
  const size = JSON.stringify(geminiSchema(s)).length;
  console.log(`ok geminiSchema(${name}): ${size} bytes`);
}

process.exit(failed ? 1 : 0);
