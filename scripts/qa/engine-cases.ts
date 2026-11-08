/**
 * Code checks for the owner's 1x playtest (Sat Nov 7): small-card cadence, stale cards after a
 * fork, money that ignores what they said, kids nobody chose. Made-up personas only (Riley, 26,
 * Raleigh; Jun, 31, Denver), never real session data.
 */
import { timeFactor } from "../../shared/pace";
import { CURRENCY_CODES, toLocal, toUsd } from "../../shared/currency";
import type { DecisionSlot } from "../../shared/engine";
import type { Profile } from "../../shared/schema";
import type { Decision, DecisionAnswer, SessionState } from "../../shared/sim";
import { BIRTH_RE, kidsDoor, kidsDoorFor, kidsQuestionOpen } from "../../worker/engine/kids";
import type { Caller } from "../../worker/engine/models";
import { anchorNetWorth, startNetWorth, steadyMoney, type MoneyYear } from "../../worker/engine/money";
import { owedThisYear, smallLookahead } from "../../worker/engine/small-pace";
import { createSmallKit } from "../../worker/engine/smalls";
import { parseSlotReason, planSlotsFor } from "../../worker/engine/slots";
import { moneyAnchor } from "../../worker/engine/world";
import type { CodeCase } from "./code-cases";
import { answered, card, profileOf, stateOf, TODAY, year } from "./fixtures";
import { rileyProfile, simulatePace } from "./pace-sim";

const riley = rileyProfile();
const stateFor = (p: Profile, speed: SessionState["speed"], extra: Partial<SessionState> = {}): SessionState => ({
  ...stateOf(p, [], []),
  speed,
  playhead: { year: p.startYear, age: p.age, paused: false },
  ...extra,
});
const perYear = (slots: DecisionSlot[], kind: "small" | "big") => {
  const m = new Map<number, number>();
  for (const s of slots) if (s.kind === kind) m.set(s.year, (m.get(s.year) ?? 0) + 1);
  return m;
};

// ---------------------------------------------------------------------------------------------
// 1x cadence
// ---------------------------------------------------------------------------------------------
export const PACE_CASES: CodeCase[] = [
  {
    name: "1x plan for Riley (26), subjective time (D-100): 6 small a year for 4 years, 3-4 to ~40, 2 to ~50, then 1; forks yearly at first, then further apart",
    run: () => {
      const slots = planSlotsFor(stateFor(riley, "1x"));
      const sm = perYear(slots, "small");
      const at = (lo: number, hi: number) => [...sm].filter(([y]) => y - riley.birthYear >= lo && y - riley.birthYear <= hi).map(([, n]) => n);
      const big = slots.filter((s) => s.kind === "big").map((s) => s.age);
      const gaps = big.slice(1).map((a, i) => a - big[i]!);
      const firstHalf = big.filter((a) => a < 48).length;
      const small = slots.filter((s) => s.kind === "small").length;
      const pass =
        at(27, 30).every((n) => n === 6) && at(31, 40).every((n) => n >= 3 && n <= 4) && at(41, 50).every((n) => n === 2) && at(51, 69).every((n) => n === 1) &&
        gaps.slice(0, 4).every((g) => g === 1) && gaps.slice(-3).every((g) => g >= 3) && firstHalf >= 2 * (big.length - firstHalf) && big.length >= 15 && small >= 90;
      return { pass, detail: `${small} small, ${big.length} forks at ${big.join(",")}; 27-30: ${at(27, 30).join(",")}; 31-40: ${at(31, 40).join(",")}; 51-69: ${at(51, 69).join(",")}` };
    },
  },
  {
    name: "every speed front-loads its forks (more in the first half of the life); Auto keeps 5, >= 3 years apart, the last >= 4 years before 70",
    run: () => {
      const out: string[] = [];
      let pass = true;
      for (const speed of ["1x", "2x", "4x", "auto"] as const) {
        const big = planSlotsFor(stateFor(riley, speed)).filter((s) => s.kind === "big").map((s) => s.age);
        const gaps = big.slice(1).map((a, i) => a - big[i]!);
        const front = big.filter((a) => a < 48).length > big.filter((a) => a >= 48).length;
        const growing = gaps.at(-1)! >= gaps[0]!;
        if (!front || !growing) pass = false;
        if (speed === "auto" && (big.length !== 5 || gaps.some((g) => g < 3) || big.at(-1)! > 66)) pass = false;
        out.push(`${speed}: ${big.join(",")}`);
      }
      return { pass, detail: out.join(" | ") };
    },
  },
  {
    name: "a new chapter slows time: the year after an answered fork gets 2 more small cards at 1x and plays slower",
    run: () => {
      const base = stateFor(riley, "1x");
      const y = riley.startYear + 8;
      const fork = { ...card("d-fork", y, y - riley.birthYear, "Move to Lisbon?", [["Go", "Go"], ["Stay", "Stay"]]), status: "answered" as const };
      const withFork = { ...base, playhead: { ...base.playhead, year: y }, decisions: [...base.decisions, fork] };
      const noFork = { ...base, playhead: { ...base.playhead, year: y } };
      const n = (st: typeof base) => planSlotsFor(st).filter((s) => s.kind === "small" && s.year === y + 1).length;
      const slow = timeFactor("1x", 9, true) > timeFactor("1x", 9, false);
      return { pass: n(withFork) === n(noFork) + 2 && slow, detail: `small in ${y + 1}: ${n(noFork)} -> ${n(withFork)}; time x${timeFactor("1x", 9, false).toFixed(2)} -> x${timeFactor("1x", 9, true).toFixed(2)}` };
    },
  },
  {
    name: "the clock: early years slower than base, late years faster, Auto softer (its 3-minute run)",
    run: () => {
      const f = (sp: "1x" | "auto", i: number) => timeFactor(sp, i, false);
      const pass = f("1x", 0) > 1 && f("1x", 30) < 1 && f("auto", 0) < f("1x", 0) && f("auto", 30) > f("1x", 30) && f("auto", 30) >= 0.8;
      return { pass, detail: `1x ${f("1x", 0)}..${f("1x", 30)}, auto ${f("auto", 0).toFixed(2)}..${f("auto", 30).toFixed(2)}` };
    },
  },
  {
    name: "1x sim, slow writer (answers 12 s, batches 14 s, queue dropped every 2nd answer): every year shows every planned card, one at a time",
    run: () => {
      const r = simulatePace({ policy: "new", years: 10, answerMs: 12000, batchMs: 14000, dropEvery: 2 });
      const short = [...r.perYear].filter(([, [p, s]]) => s < p);
      const old = simulatePace({ policy: "old", years: 10, answerMs: 12000, batchMs: 14000, dropEvery: 2 });
      return {
        pass: !short.length && r.maxOpen === 1 && r.shown >= 30,
        detail: `new ${r.shown}/${r.planned} (${r.waitedSeconds} s waiting on the writer, ${(r.seconds / 60).toFixed(1)} min); before the fix ${old.shown}/${old.planned}`,
      };
    },
  },
  {
    name: "1x sim, typical (answers 8 s, batches 9 s): every planned card, little dead air (<= 60 s in the 10 densest years: a fork a year drops the queue)",
    run: () => {
      const r = simulatePace({ policy: "new", years: 10, answerMs: 8000, batchMs: 9000, dropEvery: 4 });
      return { pass: r.shown === r.planned && r.maxOpen === 1 && r.waitedSeconds <= 60, detail: `${r.shown}/${r.planned}, ${r.waitedSeconds} s waiting, ${(r.seconds / 60).toFixed(1)} min for 10 years` };
    },
  },
  {
    name: "1x sim, a writer that never answers: years give their cards up after the give-up time instead of freezing",
    run: () => {
      const r = simulatePace({ policy: "new", years: 5, answerMs: 8000, batchMs: Infinity, dropEvery: 1000 });
      return { pass: r.shown === 0 && r.seconds < 5 * 45 + 4 * 15, detail: `${r.shown} shown, 5 years in ${r.seconds} s` };
    },
  },
  {
    name: "2x/4x keep their old rules (a year of lookahead, no year-end hold)",
    run: () => {
      const st = stateFor(riley, "2x");
      const slots = planSlotsFor(st);
      const y = slots.find((s) => s.kind === "small")!.year;
      const owed = owedThisYear({ speed: "2x", ph: y, slots, decisions: st.decisions });
      return { pass: owed === 0 && smallLookahead("2x") === 1 && smallLookahead("4x") === 1 && smallLookahead("1x") === 0, detail: `owed at 2x: ${owed}` };
    },
  },
  {
    name: "1x: a year with an open fork owes nothing (the fork comes first); after it, the year owes its cards",
    run: () => {
      const slots = planSlotsFor(stateFor(riley, "1x"));
      const fy = slots.find((s) => s.kind === "big" && s.year > riley.startYear)!.year;
      const open: Pick<Decision, "kind" | "year" | "status">[] = [{ kind: "big", year: riley.startYear, status: "answered" }, { kind: "big", year: fy, status: "pending" }];
      const before = owedThisYear({ speed: "1x", ph: fy, slots, decisions: open });
      const after = owedThisYear({ speed: "1x", ph: fy, slots, decisions: open.map((d) => ({ ...d, status: "answered" as const })), quiet: true });
      return { pass: before === 0 && after >= 3, detail: `fork ${fy}: owed ${before} while open, ${after} after (quiet moment counts)` };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Stale context: a card written before a fork moved them
// ---------------------------------------------------------------------------------------------
const jun = profileOf({ firstName: "Jun", age: 31, city: "Denver", region: "CO", country: "US", line: "I keep thinking about moving abroad." });
const junFork = card("d-31-1", 2026, 31, "A design studio in Lisbon offers you a job starting next year. Go?", [
  ["Take the Lisbon job", "Move to Lisbon"],
  ["Stay in Denver", "Stay in Denver"],
]);
const junPast = [year(jun, 2026, "Denver, CO", "Product designer at Fieldnote")];
const junMoved = [...junPast, year(jun, 2027, "Lisbon, Portugal", "Product designer at a Lisbon studio")];
const smallCard = (prompt: string): Decision => ({
  id: "d-32-1", kind: "small", year: 2027, age: 32, domains: ["happiness"], prompt, whyAsking: "It helps your lives sound like you.", whyQuoteId: null,
  options: [{ id: "a", label: "Cook", hint: null, branchTitle: null }, { id: "b", label: "Go out", hint: null, branchTitle: null }, { id: "c", label: "Sleep", hint: null, branchTitle: null }, { id: "d", label: "Call a friend", hint: null, branchTitle: null }],
  placeholder: "", status: "pending",
});
const kit = createSmallKit({} as Caller, () => TODAY, () => TODAY.toISOString());
const slot2027: DecisionSlot = { year: 2027, age: 32, kind: "small", reason: "small:happiness: we don't know what makes a week good" };

export const STALE_CASES: CodeCase[] = [
  {
    name: "a card written in Denver ('your Denver apartment') is dropped when served the year the fork moved them to Lisbon",
    run: () => {
      const st = stateOf(jun, junMoved, [answered(junFork, "a")]);
      const got = kit.bindSmall(st, smallCard("A quiet Sunday in your Denver apartment. What do you do with it?"), slot2027);
      return { pass: got === null, detail: got ? `served: ${got.prompt}` : "dropped" };
    },
  },
  {
    name: "the same kind of card set in their new city is served",
    run: () => {
      const st = stateOf(jun, junMoved, [answered(junFork, "a")]);
      const got = kit.bindSmall(st, smallCard("A quiet Sunday in your new flat in Lisbon. What do you do with it?"), slot2027);
      return { pass: got !== null, detail: got ? "served" : "dropped" };
    },
  },
  {
    name: "a Denver card served in the fork's own year (they still live there) is fine",
    run: () => {
      const st = stateOf(jun, junMoved, [answered(junFork, "a")]);
      const got = kit.bindSmall(st, { ...smallCard("A quiet Sunday in your Denver apartment. What do you do with it?"), year: 2026, age: 31 }, { ...slot2027, year: 2026, age: 31 });
      return { pass: got !== null, detail: got ? "served" : "dropped" };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------
const my = (y: number, age: number, income: number, netWorth: number, events: MoneyYear["events"] = [], summary = "An ordinary year."): MoneyYear => ({ year: y, age, summary, money: { income, netWorth }, events });

export const MONEY_GUARD_CASES: CodeCase[] = [
  {
    name: "year 1 starts from what they have: $85k saved, the model's $17k becomes ~$85k",
    run: () => {
      const start = { netWorth: startNetWorth(riley.money), income: riley.money.incomeUsd };
      const r = steadyMoney(my(2026, 26, 52000, 17000), null, start);
      return { pass: Math.abs(r.netWorth - 85000) <= 10000, detail: `$${r.netWorth} (${r.notes.join("; ") || "kept"})` };
    },
  },
  {
    name: "the writer's anchor for year 1 is their $85k, not the age median (~$17k), and keeps a head start later",
    run: () => {
      const med0 = moneyAnchor(riley, riley.age).netWorthMedian;
      const a0 = anchorNetWorth(med0, startNetWorth(riley.money), med0, 0);
      const med10 = moneyAnchor(riley, riley.age + 10).netWorthMedian;
      const a10 = anchorNetWorth(med10, startNetWorth(riley.money), med0, 10);
      return { pass: a0 === 85000 && a10 > med10 + 85000 - med0, detail: `median at 26 $${med0} -> anchor $${a0}; at 36 median $${med10} -> $${a10}` };
    },
  },
  {
    name: "debt counts: $30k of student loans and $5k saved start at about -$25k (a mortgage doesn't)",
    run: () => {
      const a = startNetWorth({ savingsUsd: 5000, debtUsd: 30000, debtKind: "student_loans" });
      const b = startNetWorth({ savingsUsd: 5000, debtUsd: 300000, debtKind: "mortgage" });
      return { pass: a === -25000 && b === 5000, detail: `loans ${a}, mortgage ${b}` };
    },
  },
  {
    name: "the playtest's swings (35k, 30k, 26k, 8k, 18k, 24k, 11k) with nothing in the years: no unexplained cliff",
    run: () => {
      const raw = [35000, 30000, 26000, 8000, 18000, 24000, 11000];
      let prev: { year: number; money: { income: number; netWorth: number } } = { year: 2026, money: { income: 36000, netWorth: 85000 } };
      const out: number[] = [];
      const nws: number[] = [];
      raw.forEach((inc, i) => {
        const r = steadyMoney(my(2027 + i, 27 + i, inc, 60000), prev, { netWorth: 85000, income: 36000 });
        out.push(r.income);
        nws.push(r.netWorth);
        prev = { year: 2027 + i, money: { income: r.income, netWorth: r.netWorth } };
      });
      const worstDrop = Math.min(...out.map((x, i) => x / (i ? out[i - 1]! : 36000)));
      const nwStep = Math.min(...nws.map((x, i) => x - (i ? nws[i - 1]! : 85000)));
      return { pass: worstDrop >= 0.9 && nwStep >= -12000, detail: `income ${out.join(" → ")}; net worth ${nws.join(" → ")}` };
    },
  },
  {
    name: "a layoff explains a drop: 52k → 8k stays when the year says they were laid off",
    run: () => {
      const r = steadyMoney(
        my(2029, 29, 8000, 70000, [{ category: "job_loss", title: "The agency lets you go", narrative: "Budget cuts; you're laid off in March." }]),
        { year: 2028, money: { income: 52000, netWorth: 90000 } },
        { netWorth: 85000, income: 52000 },
      );
      return { pass: r.income === 8000 && r.netWorth === 70000, detail: `$${r.income}, nw $${r.netWorth}` };
    },
  },
  {
    name: "part-time study explains a lower income (no event category, the words say it)",
    run: () => {
      const r = steadyMoney(my(2030, 30, 21000, 88000, [{ category: "texture", title: "Back to school", narrative: "You go part-time to finish the master's." }]), { year: 2029, money: { income: 50000, netWorth: 90000 } }, { netWorth: 85000, income: 50000 });
      return { pass: r.income === 21000, detail: `$${r.income}` };
    },
  },
  {
    name: "currency switch shows the same money: every currency round-trips $85,000 within $1",
    run: () => {
      const bad = CURRENCY_CODES.filter((c) => Math.abs(toUsd(toLocal(85000, c), c) - 85000) > 1);
      return { pass: !bad.length, detail: bad.length ? bad.join(", ") : `${CURRENCY_CODES.length} currencies` };
    },
  },
];

// ---------------------------------------------------------------------------------------------
// Kids
// ---------------------------------------------------------------------------------------------
const withQuote = (p: Profile, text: string): Profile => ({ ...p, quotes: [...p.quotes, { id: `q${p.quotes.length + 1}`, text, questionId: "w1", source: "answer", shortForm: text.slice(0, 40) }] });
const kidsCard: Decision = {
  id: "d-27-2", kind: "small", year: 2027, age: 27, domains: ["children"], prompt: "Your sister's toddler falls asleep on you. Are kids in your picture?", whyAsking: "It shapes every life.", whyQuoteId: null,
  options: [{ id: "a", label: "Yes, I'd love kids one day", hint: null, branchTitle: null }, { id: "b", label: "Honestly, I don't know", hint: null, branchTitle: null }, { id: "c", label: "No, not for me", hint: null, branchTitle: null }, { id: "d", label: "Only with the right person", hint: null, branchTitle: null }],
  placeholder: "", status: "answered",
};
const tap = (optionId: string): Pick<SessionState, "profile" | "decisions" | "answers"> => {
  const a: DecisionAnswer = { decisionId: kidsCard.id, optionId, text: null, via: "tap", quoteId: null, answeredAt: TODAY.toISOString() };
  return { profile: riley, decisions: [kidsCard], answers: [a] };
};
const kidsSlot = (p: Profile, speed: SessionState["speed"]) => planSlotsFor(stateFor(p, speed)).find((s) => s.kind === "small" && parseSlotReason(s.reason).moment === "kids");

export const KIDS_CASES: CodeCase[] = [
  {
    name: "Riley (26, no kids, never asked): a kids card is planned early, before 35, at 1x and at 2x",
    run: () => {
      const a = kidsSlot(riley, "1x");
      const b = kidsSlot(riley, "2x");
      return { pass: !!a && a.age < 35 && !!b && b.age < 35 && parseSlotReason(a.reason).domain === "children", detail: `1x at ${a?.age}, 2x at ${b?.age}` };
    },
  },
  {
    name: "a 41-year-old who never said: asked within a few years; a 50-year-old: not forced",
    run: () => {
      const p41 = profileOf({ firstName: "Sam", age: 41, city: "Austin", region: "TX", country: "US", line: "Work is fine, life is quiet." });
      const p50 = profileOf({ firstName: "Lee", age: 50, city: "Austin", region: "TX", country: "US", line: "Work is fine, life is quiet." });
      const a = kidsSlot(p41, "1x");
      const b = kidsSlot(p50, "1x");
      return { pass: !!a && a.age <= 44 && !b, detail: `41 -> ${a?.age ?? "none"}; 50 -> ${b?.age ?? "none"}` };
    },
  },
  {
    name: "already said (\"I want kids someday\" / \"no kids for me\"): no forced card",
    run: () => {
      const a = kidsQuestionOpen(withQuote(riley, "I want kids someday, just not yet."));
      const b = kidsQuestionOpen(withQuote(riley, "Honestly no kids for me, I like my freedom."));
      const fact = (value: string): Profile => ({ ...riley, facts: [...riley.facts, { id: "f9", key: "children", label: "Kids", value, source: "answer", quoteIds: [], confidence: 0.8 }] });
      const c = kidsQuestionOpen(fact("No kids yet"));
      const d = kidsQuestionOpen(fact("Doesn't want children"));
      return { pass: !a && !b && c && !d, detail: `said yes: ${a}, said no: ${b}, fact 'No kids yet': ${c} (still asked), fact 'Doesn't want children': ${d}` };
    },
  },
  {
    name: "the door: closed by default, open on their words or a tapped 'yes', still closed on 'I don't know'",
    run: () => {
      const d0 = kidsDoor(riley);
      const d1 = kidsDoor(withQuote(riley, "I want kids someday, just not yet."));
      const d2 = kidsDoor(withQuote(riley, "I don't know if I want kids."));
      const d3 = kidsDoorFor(tap("a"));
      const d4 = kidsDoorFor(tap("b"));
      const d5 = kidsDoor(riley, ["Start a family"]);
      const pass = d0 === "closed" && d1 === "open" && d2 === "closed" && d3 === "open" && d4 === "closed" && d5 === "open";
      return { pass, detail: `default ${d0}, words ${d1}, unsure ${d2}, tap yes ${d3}, tap unsure ${d4}, fork 'Start a family' ${d5}` };
    },
  },
  {
    name: "a life that already has kids stays 'has' (their kids aren't new births)",
    run: () => {
      const p = { ...riley, people: [{ id: "p1", label: "Mia", relation: "daughter", closeness: 0.9, influence: 0.5, expectation: null, quoteIds: [], born: 2022 }] };
      return { pass: kidsDoor(p) === "has", detail: kidsDoor(p) };
    },
  },
  {
    name: "a birth line is recognised (what a closed life never keeps)",
    run: () => {
      const yes = ["Your daughter is born in April", "You and Sam welcome a son", "A baby on the way", "You're pregnant"];
      const no = ["Your sister's toddler visits", "You decide kids can wait", "A newborn idea at work"];
      const miss = yes.filter((t) => !BIRTH_RE.test(t));
      const extra = no.filter((t) => BIRTH_RE.test(t) && /\b(baby|son|daughter|child|pregnan)/i.test(t));
      return { pass: !miss.length && !extra.length, detail: `${miss.length ? `missed: ${miss.join(" | ")}` : "all births caught"}${extra.length ? `; false: ${extra.join(" | ")}` : ""}` };
    },
  },
];

