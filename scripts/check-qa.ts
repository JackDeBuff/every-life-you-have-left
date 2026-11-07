/**
 * npm run check:qa — regression checks for the final QA pass (Sat Nov 7).
 *
 *   npx tsx scripts/check-qa.ts            code checks only (no model, no cost): the QA's exact
 *                                          failures as fixtures (scripts/qa/fixtures.ts)
 *   npx tsx scripts/check-qa.ts --live <baseUrl> [--personas sam,chidi,margo] [--out dir]
 *                                          also plays Sam, Chidi and Margo against a running
 *                                          SessionAgent (real engine) and counts violations in
 *                                          the finished sessions (scripts/qa/live.ts)
 *
 * Exit code 1 when a code check fails.
 */
import { resolveBig, chosenOf } from "../worker/engine/answers";
import { bigCardIssues } from "../worker/engine/decisions";
import { ANSWER_CASES, CLEAN_CASES, FORK_CASES, TODAY } from "./qa/fixtures";
import { PEOPLE_CASES, HISTORY_CASES, MONEY_CASES, COPY_CASES } from "./qa/code-cases";
import { KIDS_CASES, MONEY_GUARD_CASES, PACE_CASES, STALE_CASES } from "./qa/engine-cases";

let failed = 0;
const ok = (name: string, pass: boolean, detail = "") => {
  if (!pass) failed++;
  console.log(`${pass ? "ok  " : "FAIL"} ${name}${detail ? `\n       ${detail}` : ""}`);
};

console.log("\n1. Forks against the ledger and every fork taken");
for (const c of FORK_CASES) {
  const bad = bigCardIssues(c.state, c.bad, TODAY);
  const kinds = new Set(bad.map((i) => i.kind));
  const missing = c.expect.filter((k) => !kinds.has(k as never));
  ok(`${c.name}: flagged`, !missing.length, missing.length ? `missing ${missing.join(", ")}; got: ${bad.map((i) => `${i.kind}: ${i.msg}`).join(" | ") || "nothing"}` : bad.map((i) => i.kind).join(", "));
  const goodState = { ...c.state, decisions: c.state.decisions.map((d) => (d.id === c.bad.id ? c.good : d)) };
  const good = bigCardIssues(goodState, c.good, TODAY);
  ok(`${c.name}: a sound card passes`, !good.length, good.map((i) => `${i.kind}: ${i.msg}`).join(" | "));
}

for (const c of CLEAN_CASES) {
  const got = bigCardIssues(c.state, c.card, TODAY);
  ok(`${c.name}: passes clean`, !got.length, got.map((i) => `${i.kind}: ${i.msg}`).join(" | "));
}

console.log("\n2. Answers in their own words");
for (const c of ANSWER_CASES) {
  const r = resolveBig(c.d, c.optionId, c.text);
  const ch = chosenOf(c.d, { optionId: r.optionId, text: c.text });
  const pass = r.own === c.own && (!c.title || ch.title === c.title) && (!c.log || ch.label === c.log);
  ok(`${c.name}`, pass, `${r.how}: "${ch.title}" / You chose: ${ch.label}`);
}

for (const [title, cases] of [
  ["3. People from uploads", PEOPLE_CASES],
  ["4. History and people over time", HISTORY_CASES],
  ["5. Money anchors and copy", [...MONEY_CASES, ...COPY_CASES]],
  ["6. 1x small-card cadence (owner's playtest, Nov 7)", PACE_CASES],
  ["7. Small cards against the year they're served in", STALE_CASES],
  ["8. Money continuity", MONEY_GUARD_CASES],
  ["9. Kids only through a door they opened", KIDS_CASES],
] as const) {
  console.log(`\n${title}`);
  for (const c of cases) {
    const r = c.run();
    ok(c.name, r.pass, r.detail);
  }
}

const live = process.argv.indexOf("--live");
if (live >= 0) {
  const { runLive } = await import("./qa/live");
  await runLive(process.argv.slice(live + 1));
}

console.log(failed ? `\n${failed} code check(s) failed` : "\nAll code checks pass");
process.exit(failed ? 1 : 0);
