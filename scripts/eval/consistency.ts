/**
 * Consistency checks on a finished eval session (code only, no model calls). Prints violations:
 *   decisions vs. the life at that moment (place, employer, retirement, people, ages, past season),
 *   repeated fork subjects, repeated small-card framings, years vs. the people ledger (phantom
 *   partner/child/pet, wrong ages and counts), scene people vs. the ledger, near-duplicate log
 *   lines, the ending's people line vs. the ledger, and a pet outliving its lifespan.
 *
 *   npx tsx scripts/eval/consistency.ts <run-file.json> [persona]
 */
import { readFileSync } from "node:fs";
import type { Profile } from "../../shared/schema";
import type { Branch, Decision, SimYear } from "../../shared/sim";
import { pastTimeIssues } from "../../worker/engine/calendar";
import { framingIssues, peopleIssues, repeatTopicIssues, similarity, stateIssues, type Issue } from "../../worker/engine/consistency";
import { advance, here, lifeAt, lifeOf, profileAsOf, type LifeNow } from "../../worker/engine/ledger";

export interface ConsistencyReport {
  counts: Record<string, number>;
  total: number;
  lines: string[];
}

interface Transcript {
  profile: Profile | null;
  decisions: (Decision & { answer?: { optionId: string | null } | null })[];
  years: SimYear[];
  branches: Branch[];
  ending: { verdict: string; branchVerdicts: Record<string, string>; people?: Record<string, string>; postcard?: string } | null;
  interludes?: { branchId: string; age: number; caption: string }[][];
}

function pathOf(t: Transcript, upto: number): LifeNow["path"] {
  return t.decisions
    .filter((d) => d.kind === "big" && d.status === "answered" && d.year <= upto)
    .map((d) => ({ year: d.year, age: d.age, title: d.options.find((o) => o.id === d.answer?.optionId)?.branchTitle ?? "?" }));
}

export function checkSession(t: Transcript, today = new Date()): ConsistencyReport {
  const counts: Record<string, number> = {};
  const lines: string[] = [];
  const add = (where: string, issues: Issue[]) => {
    for (const i of issues) {
      counts[i.kind] = (counts[i.kind] ?? 0) + 1;
      lines.push(`  [${i.kind}] ${where}: ${i.msg}`);
    }
  };
  // The transcript holds the FINAL profile: its occupation fact is from the end of the life, so it
  // must not stand in for the start (work comes from the years' life data, or stays unknown).
  // Same for people and family facts: only people the start line names exist from the start (a
  // partner named in a later answer would otherwise exist since year one and hide a phantom partner).
  const startText = (t.profile?.quotes ?? []).filter((q) => !/^d-/.test(q.questionId ?? "")).map((q) => q.text.toLowerCase()).join(" ");
  const p = t.profile
    ? {
        ...t.profile,
        facts: t.profile.facts.filter((f) => !["occupation", "relationship", "children"].includes(f.key)),
        people: t.profile.people.filter(
          (x) =>
            startText.includes(x.label.toLowerCase().replace(/^(my|your|the)\s+/, "")) ||
            (/partner|wife|husband|spouse/i.test(x.relation) && /\bmy (wife|husband|partner|girlfriend|boyfriend|fianc\w*)\b/.test(startText)) ||
            (/child|son|daughter|kid/i.test(x.relation) && /\b(my|the|our) (kids|children|son|daughter|boy|girl)\b/.test(startText)),
        ),
      }
    : null;
  if (!p) return { counts, total: 0, lines: ["(no profile)"] };
  const years = [...t.years].sort((a, b) => a.year - b.year);

  // 1. decisions vs. the life at that moment
  const smalls: Decision[] = [];
  const bigs: Decision[] = [];
  for (const d of [...t.decisions].sort((a, b) => a.year - b.year)) {
    const past = years.filter((y) => y.year < d.year);
    const now = lifeAt(p, past, d.year, pathOf(t, d.year - 1));
    const text = [d.prompt, d.whyAsking, ...d.options.map((o) => `${o.label}. ${o.hint ?? ""}`)].join(" ");
    const where = `${d.kind} card ${d.year} (${d.age}) "${d.prompt.slice(0, 70)}"`;
    add(where, stateIssues(`${d.prompt} ${d.whyAsking}`, now));
    add(where, peopleIssues(text, now));
    add(where, pastTimeIssues(`${d.prompt} ${d.whyAsking}`, today, p.country, d.year).map((msg) => ({ kind: "past_time" as const, msg })));
    if (d.kind === "big") {
      add(where, repeatTopicIssues(d, bigs, now, p.firstName ?? ""));
      bigs.push(d);
    } else {
      add(where, framingIssues(d.prompt, smalls));
      smalls.push(d);
    }
  }

  // 2. chosen-life years vs. the ledger; scene people; duplicate lines
  let now = lifeAt(p, [], p.startYear - 1);
  for (let i = 0; i < years.length; i++) {
    const y = years[i]!;
    const r = advance(now, y);
    now = r.now;
    const text = [y.summary, ...y.events.map((e) => `${e.title}. ${e.narrative}`), y.scene.caption].join(" ");
    const where = `year ${y.year} (${y.age})`;
    add(where, peopleIssues(text, now, { changes: r.changes }));
    if (i === 0) add(where, pastTimeIssues(text, today, p.country, y.year).map((msg) => ({ kind: "past_time" as const, msg })));
    const sp = y.scene.people;
    const issues: Issue[] = [];
    if (sp.some((x) => x.role === "partner") && !here(now, "partner").length) issues.push({ kind: "partner", msg: "scene shows a partner the ledger doesn't have" });
    const kidsScene = sp.filter((x) => x.role === "child").length;
    if (kidsScene > here(now, "child").length) issues.push({ kind: "child", msg: `scene shows ${kidsScene} children, ledger has ${here(now, "child").length}` });
    if (sp.some((x) => x.role === "pet") && !here(now, "pet").length && now.people.some((x) => x.role === "pet")) issues.push({ kind: "pet", msg: "scene shows a pet after its time" });
    add(`${where} scene`, issues);
    for (const prev of years.slice(Math.max(0, i - 3), i)) {
      if (similarity(prev.summary, y.summary) >= 0.7) add(where, [{ kind: "duplicate", msg: `summary repeats ${prev.year}: "${y.summary.slice(0, 70)}"` }]);
      for (const e of y.events)
        if (prev.events.some((pe) => similarity(pe.title, e.title) >= 0.8 && e.title.length > 12)) add(where, [{ kind: "duplicate", msg: `event "${e.title}" repeats ${prev.year}` }]);
    }
  }

  // 3. the ending: people line (last scene) vs. the ledger; verdicts vs. the ledger
  const endNow = lifeAt(p, years, years.at(-1)?.year ?? p.startYear, pathOf(t, 9999));
  const last = years.at(-1);
  if (last) {
    const sp = last.scene.people;
    const kids = here(endNow, "child").length;
    const issues: Issue[] = [];
    if (sp.filter((x) => x.role === "child").length !== kids) issues.push({ kind: "count", msg: `ending people line shows ${sp.filter((x) => x.role === "child").length} children; the ledger has ${kids}` });
    if (sp.some((x) => x.role === "partner") !== Boolean(here(endNow, "partner").length)) issues.push({ kind: "partner", msg: `ending people line ${sp.some((x) => x.role === "partner") ? "shows a partner the ledger doesn't have" : "is missing the partner"}` });
    add("ending (chosen)", issues);
    if (t.ending) add("ending verdict (chosen)", peopleIssues(t.ending.verdict, endNow));
  }
  for (const b of t.branches.filter((x) => x.status === "active")) {
    const shared = years.filter((y) => y.year < b.forkYear);
    const bl = b.years.at(-1);
    if (!bl) continue;
    const bn = lifeAt(profileAsOf(p, t.decisions, b.forkYear), [...shared, ...b.years], bl.year);
    const sp = bl.scene.people;
    const issues: Issue[] = [];
    if (sp.filter((x) => x.role === "child").length !== here(bn, "child").length) issues.push({ kind: "count", msg: `people line shows ${sp.filter((x) => x.role === "child").length} children; its ledger has ${here(bn, "child").length}` });
    if (sp.some((x) => x.role === "partner") && !here(bn, "partner").length) issues.push({ kind: "partner", msg: "people line shows a partner its ledger doesn't have" });
    add(`ending (${b.title})`, issues);
    if (t.ending?.branchVerdicts[b.id]) add(`ending verdict (${b.title})`, peopleIssues(t.ending.branchVerdicts[b.id]!, bn));
  }
  // 4. interlude captions vs. that branch's ledger at that moment
  for (const cuts of t.interludes ?? []) {
    for (const c of cuts) {
      const b = t.branches.find((x) => x.id === c.branchId);
      if (!b) continue;
      const yr = p.birthYear + c.age;
      const bn = lifeAt(profileAsOf(p, t.decisions, b.forkYear), [...years.filter((y) => y.year < b.forkYear), ...b.years.filter((y) => y.year <= yr)], yr);
      add(`interlude ${yr} (${b.title}) "${c.caption.slice(0, 60)}"`, peopleIssues(c.caption, bn));
    }
  }
  // structured life data present (after the fix)
  const withLife = years.filter((y) => lifeOf(y)).length;
  lines.push(`  life data on ${withLife}/${years.length} years; work at end: ${endNow.work}; people at end: ${endNow.people.filter((x) => x.status === "here").map((x) => `${x.name}(${x.role}${x.born !== null && x.ageKnown ? `,${endNow.year - x.born}` : ""})`).join(" ") || "none"}`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total, lines };
}

export function printReport(tag: string, r: ConsistencyReport): void {
  console.log(`consistency ${tag}: ${r.total} violations ${JSON.stringify(r.counts)}`);
  for (const l of r.lines) console.log(l);
}

// CLI: npx tsx scripts/eval/consistency.ts <run-file.json> [persona]
if (process.argv[1]?.endsWith("consistency.ts") && process.argv[2]) {
  const rows = JSON.parse(readFileSync(process.argv[2], "utf8")) as { result: { persona: string; heavy: string; transcript: Transcript; startedAt?: string } }[];
  const only = process.argv[3];
  const agg: Record<string, number> = {};
  for (const row of rows) {
    if (only && row.result.persona !== only) continue;
    const r = checkSession(row.result.transcript, row.result.startedAt ? new Date(row.result.startedAt) : new Date());
    printReport(`${row.result.persona} | ${row.result.heavy}`, r);
    for (const [k, v] of Object.entries(r.counts)) agg[k] = (agg[k] ?? 0) + v;
  }
  console.log(`\nTOTAL ${Object.values(agg).reduce((a, b) => a + b, 0)} ${JSON.stringify(agg)}`);
}
