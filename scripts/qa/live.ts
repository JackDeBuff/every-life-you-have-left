/**
 * Live QA runs (npm run check:qa -- --live ...): Sam, Chidi and Margo played against a running
 * SessionAgent (real engine) by scripts/judge-run.ts, then every finished session is checked in code
 * for the final QA's failures. The same yardstick (this code) scores any engine, old or new.
 *
 *   --live <baseUrl> [--personas sam,chidi,margo] [--out dir] [--legacy-answer]
 *        plays the personas in parallel (Sam: Auto, whole life; Chidi: 2x, 14 years; Margo: 2x, 9 years)
 *   --live --analyze <dump.json ...>
 *        re-scores saved runs (no model calls)
 */
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { SimYear } from "../../shared/sim";
import type { AgentState } from "../../worker/agent/protocol";
import { ownShort } from "../../worker/engine/answers";
import { bigCardIssues } from "../../worker/engine/decisions";
import { moneyUnit } from "../../worker/engine/warmup";
import { TODAY } from "./fixtures";

interface Dump {
  persona: string;
  legacyAnswer: boolean;
  sessionId: string;
  ended: number | null;
  wall: number;
  warmEnd: { questions: { key: string; status: string }[]; facts: number; people: string[]; quotes: number; fears: number; plans: number; money: string } | null;
  seenYears: Record<string, { summary: string; ch: string[]; people: string[]; events: string[] }>;
  shownCards: Record<string, { year: number; age: number; prompt: string; options: string[] }>;
  forks: { id: string; choice: string }[];
  state: AgentState;
}

const RUNS: Record<string, string[]> = {
  sam: ["--speed", "auto"],
  chidi: ["--speed", "2x", "--years", "14", "--small-read", "2"],
  margo: ["--speed", "2x", "--years", "9", "--small-read", "2"],
};

type Counts = Record<string, number>;
interface Finding {
  kind: string;
  where: string;
  msg: string;
}

const FORK_KINDS = ["place", "employer", "retired", "work_stage", "repeat_chosen", "left_behind", "repeat_topic", "repeat_option", "ignores_now", "same_options", "partner", "child", "pet", "count"];

export function analyze(d: Dump): { counts: Counts; findings: Finding[]; spend: number; years: number; forks: number } {
  const s = d.state;
  const p = s.profile!;
  const findings: Finding[] = [];
  const add = (kind: string, where: string, msg: string) => findings.push({ kind, where, msg });
  const yearOf = (y: number) => s.years.find((x) => x.year === y);
  const life = (y: SimYear | undefined) => (y as (SimYear & { life?: { work: string; ch: string[]; people: { name: string; role: string; relation: string; age: number | null }[] } }) | undefined)?.life ?? null;

  // 1. forks against the life and every fork taken (each card as it was shown)
  const bigs = s.decisions.filter((x) => x.kind === "big").sort((a, b) => a.year - b.year);
  for (const dd of bigs) {
    const shown = d.shownCards[dd.id];
    if (!shown) continue;
    const view: AgentState = {
      ...s,
      decisions: s.decisions.filter((x) => x.kind === "big" && (x.year < dd.year || x.id === dd.id)).map((x) => (x.id === dd.id ? { ...x, status: "pending" as const } : x)),
      answers: s.answers.filter((a) => a.decisionId !== dd.id),
    };
    for (const i of bigCardIssues(view, dd, TODAY).filter((x) => FORK_KINDS.includes(x.kind))) add(`fork:${i.kind}`, `fork at ${dd.age} (${dd.year})`, `${i.msg}  | card: "${shown.prompt}"`);
  }

  // 2. typed fork answers: their own path, in their own words
  for (const f of d.forks) {
    const dd = s.decisions.find((x) => x.id === f.id);
    const a = s.answers.find((x) => x.decisionId === f.id);
    if (!dd || !a?.text) continue;
    const typedOnly = f.choice.startsWith("typed:");
    const refuses = /^\s*(no|none of these|neither)\b/i.test(a.text);
    if (!typedOnly && !refuses) continue;
    if (a.optionId) add("typed:filed_under_option", `fork at ${dd.age}`, `"${a.text}" was filed as "${dd.options.find((o) => o.id === a.optionId)?.label}"`);
    const line = s.log.find((l) => l.refId === dd.id && l.kind === "decision");
    const want = `You chose: ${ownShort(a.text)}`;
    if (line && line.text !== want) add("typed:log_line", `fork at ${dd.age}`, `log says "${line.text}", want "${want}"`);
  }

  // 3. people from what they said and uploaded
  const first = life(s.years[0]);
  const ppl = first?.people ?? [];
  const person = (n: RegExp) => ppl.find((x) => n.test(x.name));
  const expectPeople: Record<string, [RegExp, boolean][]> = {
    margo: [[/^Dev$/, true], [/^Theo$/, true], [/^Biscuit$/, false], [/^Ngozi$/, false], [/^Hanna$/, false]],
    chidi: [[/^Ada$/, false], [/^Zara$/, true]],
    sam: [],
  };
  for (const [re, needAge] of expectPeople[d.persona] ?? []) {
    const x = person(re);
    if (!x) add("people:missing", `${s.years[0]?.year}`, `${re.source.replace(/[\^$]/g, "")} is not in People (${ppl.map((q) => q.name).join(", ") || "nobody"})`);
    else if (needAge && x.age === null) add("people:no_age", `${s.years[0]?.year}`, `${x.name} has no age`);
  }
  if (d.warmEnd) {
    const asked = d.warmEnd.questions.filter((q) => q.status === "answered" || q.status === "skipped").length;
    if (!asked && d.warmEnd.facts + d.warmEnd.people.length === 0) add("people:learned_empty", "warm-up", `nothing was asked and the learned panel had no facts or people (quotes ${d.warmEnd.quotes})`);
  }

  // 4. history and people over time
  for (const [k, seen] of Object.entries(d.seenYears)) {
    const y = Number(k);
    if (y === p.startYear) continue; // the first fork rewrites "today" by design
    const fin = yearOf(y);
    if (!fin) continue;
    const ch = life(fin)?.ch ?? [];
    if (fin.summary !== seen.summary || ch.join("|") !== seen.ch.join("|")) add("history:rewritten", `${y}`, `played as "${seen.summary}" [${seen.ch.join(" ")}], now "${fin.summary}" [${ch.join(" ")}]`);
  }
  const ROLES = new Set(["partner", "child", "parent", "sibling"]);
  let parentDeaths = 0;
  for (let i = 1; i < s.years.length; i++) {
    const a = life(s.years[i - 1]);
    const b = life(s.years[i]);
    if (!a || !b) continue;
    for (const x of a.people.filter((q) => ROLES.has(q.role))) {
      if (b.people.some((q) => q.name === x.name)) continue;
      if (!b.ch.some((c) => c.startsWith(`-${x.role}`) || (x.role === "partner" && c.startsWith("+partner")))) add("people:vanished", `${s.years[i]!.year}`, `${x.name} (${x.relation}) left People with no change logged`);
    }
    for (const c of b.ch.filter((c) => c.startsWith("-parent"))) {
      parentDeaths++;
      const y = s.years[i]!;
      const logged = s.log.some((l) => l.year === y.year && /\b(dies|died|passes|passed|death|funeral)\b/i.test(l.text)) || y.events.some((e) => /\b(dies|died|passes|passed|death|funeral)\b/i.test(`${e.title} ${e.narrative}`));
      if (!logged) add("people:death_not_logged", `${y.year}`, `${c} with no line in the log`);
    }
  }
  if (parentDeaths > 1) add("people:two_parent_deaths", "life", `${parentDeaths} parent deaths`);

  // 5. money anchors, copy
  if (d.persona === "chidi") {
    const want = (600_000 * 12) / 1550;
    const inc = s.years[0]?.money.income ?? 0;
    if (Math.abs(inc - want) > want * 0.1) add("money:stated_income", `${s.years[0]?.year}`, `first-year income $${inc}, stated ₦600k a month = $${Math.round(want)}`);
  }
  // pre-written copy in another currency's unit ("every dollar" to a naira user; a CAD user's unit is the dollar)
  if (p.currency && moneyUnit(p.currency) !== "dollar")
    for (const q of s.warmup?.questions ?? []) for (const o of q.options) if (/dollar/i.test(o.label)) add("copy:dollar", `warm-up ${q.key}`, `"${o.label}" for a ${p.currency} user`);

  const counts: Counts = {};
  for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
  return { counts, findings, spend: s.usage?.usd ?? 0, years: s.years.length, forks: bigs.filter((x) => x.status === "answered").length };
}

function report(dumps: Dump[], label: string): Counts {
  const total: Counts = {};
  let spend = 0;
  console.log(`\n== Live runs: ${label} ==`);
  for (const d of dumps) {
    const r = analyze(d);
    spend += r.spend;
    console.log(`\n${d.persona} (${d.state.speed}, ${r.years} years, ${r.forks} forks, $${r.spend.toFixed(3)}${d.legacyAnswer ? ", old card's typed-answer guess" : ""}): ${r.findings.length} violation(s)`);
    for (const f of r.findings) console.log(`  - ${f.kind} @ ${f.where}: ${f.msg.slice(0, 260)}`);
    for (const [k, v] of Object.entries(r.counts)) total[k] = (total[k] ?? 0) + v;
  }
  console.log(`\nTotal by kind: ${JSON.stringify(total)}  (${Object.values(total).reduce((a, b) => a + b, 0)} violations, model spend $${spend.toFixed(3)})`);
  return total;
}

export async function runLive(args: string[]): Promise<void> {
  const flag = (n: string, dflt: string) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 && args[i + 1] ? args[i + 1]! : dflt;
  };
  const ai = args.indexOf("--analyze");
  if (ai >= 0) {
    const files = args.slice(ai + 1).filter((a) => !a.startsWith("--"));
    report(files.map((f) => JSON.parse(readFileSync(f, "utf8")) as Dump), files.join(", "));
    return;
  }
  const url = args.find((a) => /^https?:\/\//.test(a));
  if (!url) throw new Error("--live needs a base URL (a running dev server) or --analyze <dumps>");
  const personas = flag("personas", "sam,chidi,margo").split(",").filter((x) => RUNS[x]);
  const out = flag("out", join(tmpdir(), `elyl-qa-${Date.now().toString(36)}`));
  if (!existsSync(out)) mkdirSync(out, { recursive: true });
  const legacy = args.includes("--legacy-answer") ? ["--legacy-answer"] : [];
  console.log(`\nPlaying ${personas.join(", ")} against ${url} (logs and dumps in ${out})`);
  await Promise.all(
    personas.map(
      (p) =>
        new Promise<void>((resolve) => {
          const dump = `${out}/${p}.json`;
          const child = spawn("npx", ["tsx", "scripts/judge-run.ts", url, "--persona", p, "--read", "2", "--pick", "random", "--timeout", "900000", "--dump", dump, ...RUNS[p]!, ...legacy], { stdio: ["ignore", "pipe", "pipe"] });
          let log = "";
          child.stdout.on("data", (b) => (log += String(b)));
          child.stderr.on("data", (b) => (log += String(b)));
          child.on("close", (code) => {
            writeFileSync(`${out}/${p}.log`, log);
            console.log(`  ${p}: exit ${code}${existsSync(dump) ? "" : " (no dump)"}`);
            resolve();
          });
        }),
    ),
  );
  const dumps = personas.map((p) => `${out}/${p}.json`).filter(existsSync).map((f) => JSON.parse(readFileSync(f, "utf8")) as Dump);
  const total = report(dumps, url);
  writeFileSync(`${out}/summary.json`, JSON.stringify(total, null, 2));
}

