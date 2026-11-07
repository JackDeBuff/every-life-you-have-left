/**
 * Offline check of planSlots (pure) and logFor on the demo profile, for every speed and a few
 * ages. No model calls.   npx tsx scripts/eval/slots-check.ts
 */
import demo from "../../shared/demo/alex.json";
import { DemoBundle, endAgeFor, type Profile } from "../../shared/schema";
import { SPEED_MODES, type SessionState } from "../../shared/sim";
import { createEngine } from "../../worker/engine";
import type { LlmPort } from "../../worker/engine/llm-port";

const bundle = DemoBundle.parse(demo);
const noLlm = {} as LlmPort;
const engine = createEngine({ llm: noLlm });

function stateFor(profile: Profile, speed: SessionState["speed"]): SessionState {
  return {
    sessionId: profile.sessionId, phase: "playing", speed, profile, appearance: null, portraits: [], settings: [], nudges: [],
    decisions: [], answers: [], years: [], playhead: { year: profile.startYear, age: profile.age, paused: false }, branches: [], log: [],
    status: null, budgets: { smallLeft: 0, bigLeft: 0 }, endAge: profile.endAge, verdictAtEnd: null, updatedAt: "",
  };
}

for (const age of [19, 25, 42, 58]) {
  const p: Profile = { ...bundle.profile, age, birthYear: bundle.profile.startYear - age, endAge: endAgeFor(age) };
  for (const speed of SPEED_MODES) {
    const slots = engine.planSlots(stateFor(p, speed));
    const big = slots.filter((s) => s.kind === "big");
    const small = slots.filter((s) => s.kind === "small");
    const domains: Record<string, number> = {};
    for (const s of small) {
      const d = s.reason.split(":")[1]!;
      domains[d] = (domains[d] ?? 0) + 1;
    }
    console.log(
      `age ${age} ${speed.padEnd(4)} big ${big.length} [${big.map((s) => `${s.age}:${s.reason.split(":")[2]}`).join(" ")}] small ${small.length} ${JSON.stringify(domains)}`,
    );
  }
}
// logFor on a demo year
const st = stateFor(bundle.profile, "auto");
const y = bundle.lives[0]!.years[3]!;
console.log(engine.logFor(st, { ...y, scene: { setting: "suburb", flavor: "us_south", placeLabel: y.place, home: "apartment", activity: "office_work", people: [{ role: "self", ageBand: "adult" }], season: "spring", timeOfDay: "day", weather: "clear", mood: "calm", moment: null, caption: "" }, decisionIds: [] }));
