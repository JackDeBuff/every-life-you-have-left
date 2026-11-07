/** Code checks for items 3-5 of the final QA (people from uploads, history, money anchors, copy). */
import { displayCurrency } from "../../shared/currency";
import type { Profile } from "../../shared/schema";
import { lifeAt, parentDeathPlan, yearLife } from "../../worker/engine/ledger";
import { anchorIncome } from "../../worker/engine/profile";
import { warmQuestions } from "../../worker/engine/warmup";
import { withParentDeath } from "../../worker/engine/years";
import { PROFILES, profileOf, year } from "./fixtures";

export interface CodeCase {
  name: string;
  run: () => { pass: boolean; detail?: string };
}

// Margo's people as the start profile reads them from her AI export (scratchpad final-qa/export.txt):
// partner Dev (44), son Theo (9), the dog Biscuit (6), her mother Ngozi (70), her best friend Hanna.
const margoExport: Profile = {
  ...PROFILES.margo,
  people: [
    { id: "p1", label: "Dev", relation: "partner", closeness: 0.9, influence: 0.7, expectation: null, quoteIds: [], born: 2026 - 44 },
    { id: "p2", label: "Theo", relation: "son", closeness: 0.95, influence: 0.6, expectation: null, quoteIds: [], born: 2026 - 9 },
    { id: "p3", label: "Biscuit", relation: "dog", closeness: 0.8, influence: 0.1, expectation: null, quoteIds: [], born: 2026 - 6 },
    { id: "p4", label: "Ngozi", relation: "mother", closeness: 0.6, influence: 0.6, expectation: "teaching is a job for life", quoteIds: [], born: 2026 - 70 },
    { id: "p5", label: "Hanna", relation: "best friend", closeness: 0.7, influence: 0.4, expectation: null, quoteIds: [] },
    { id: "p6", label: "a recruiter", relation: "recruiter", closeness: 0.1, influence: 0.2, expectation: null, quoteIds: [] },
  ],
};
// An older profile (no birth years on people): ages come from the facts' own words.
const margoFacts: Profile = {
  ...PROFILES.margo,
  people: margoExport.people.map(({ born: _b, ...p }) => p),
  facts: [...PROFILES.margo.facts, { id: "f9", key: "living", label: "Home", value: "Rents in Leslieville with Dev (44, a nurse); Theo, who is 9; a 6-year-old rescue dog, Biscuit", source: "upload", quoteIds: [], confidence: 0.6 }],
};

const peopleAt = (p: Profile, y: number) => yearLife(lifeAt(p, [], y), "", []).people;
const show = (ps: { name: string; age: number | null }[]) => ps.map((x) => `${x.name}${x.age !== null ? ` ${x.age}` : ""}`).join(", ");

export const PEOPLE_CASES: CodeCase[] = [
  {
    name: "Margo's export: Dev 44, Theo 9, Biscuit, Ngozi 70 and Hanna are all in People, the recruiter isn't",
    run: () => {
      const ps = peopleAt(margoExport, 2026);
      const age = (n: string) => ps.find((x) => x.name === n)?.age;
      const pass = age("Dev") === 44 && age("Theo") === 9 && ps.some((x) => x.name === "Biscuit" && x.role === "pet") && age("Ngozi") === 70 && ps.some((x) => x.name === "Hanna") && !ps.some((x) => /recruiter/i.test(x.name));
      return { pass, detail: show(ps) };
    },
  },
  {
    name: "the household comes first (the bio shows five): Dev, Theo, Biscuit, Ngozi, Hanna",
    run: () => {
      const ps = peopleAt(margoExport, 2026).slice(0, 5).map((x) => x.name);
      return { pass: ps.join(",") === "Dev,Theo,Biscuit,Ngozi,Hanna", detail: ps.join(", ") };
    },
  },
  {
    name: "ages from the facts' own words when the profile has no birth years ('Dev (44, a nurse)', 'Theo, who is 9')",
    run: () => {
      const ps = peopleAt(margoFacts, 2030);
      const age = (n: string) => ps.find((x) => x.name === n)?.age;
      return { pass: age("Dev") === 48 && age("Theo") === 13, detail: show(ps) };
    },
  },
  {
    name: "Biscuit (6 in 2026) leaves on a dog's real lifespan, not 6 + a dog's lifespan",
    run: () => {
      const gone = [2030, 2031, 2032, 2033, 2034, 2035].find((y) => !peopleAt(margoExport, y).some((x) => x.name === "Biscuit"));
      return { pass: gone !== undefined && gone <= 2035, detail: `gone by ${gone ?? "never (<=2035)"}` };
    },
  },
];

// Sam: parents on estimated ages (no age ever stated).
const sam = PROFILES.sam;
const samEnd = sam.birthYear + 70;
export const HISTORY_CASES: CodeCase[] = [
  {
    name: "Sam's parents never silently vanish: still in People at 65 and 70 (no age shown past ~93)",
    run: () => {
      const at65 = peopleAt(sam, sam.birthYear + 65).filter((x) => x.role === "parent");
      const at70 = peopleAt(sam, samEnd).filter((x) => x.role === "parent");
      return { pass: at65.length === 2 && at70.length === 2, detail: `65: ${show(at65)} | 70: ${show(at70)}` };
    },
  },
  {
    name: "a parent's old-age death is planned once, late (85-90), after Sam is 48",
    run: () => {
      const plan = parentDeathPlan(sam, samEnd);
      const pass = !!plan && plan.age >= 85 && plan.age <= 92 && plan.year - sam.birthYear >= 48;
      return { pass, detail: plan ? `${plan.name} (${plan.relation}) in ${plan.year}, at ~${plan.age}; Sam ${plan.year - sam.birthYear}` : "no plan" };
    },
  },
  {
    name: "the planned death reaches the ledger AND the log when the model leaves it out",
    run: () => {
      const plan = parentDeathPlan(sam, samEnd)!;
      const before = lifeAt(sam, [], plan.year - 1);
      const who = before.people.find((p) => p.name === plan.name)!;
      const y = year(sam, plan.year, "San Francisco, CA", "Design director");
      const r = withParentDeath(y, [], before, who, 0, "you");
      const ev = r.events.at(-1);
      return { pass: r.ch.includes(`-parent:${plan.name}`) && !!ev && /dies/.test(ev.title) && !ev.isTurningPoint, detail: `${r.ch.join(" ")} | ${ev?.title}: ${ev?.narrative}` };
    },
  },
  {
    name: "a second parent's death is dropped (at most once), and a death the model wrote gets its tag",
    run: () => {
      const plan = parentDeathPlan(sam, samEnd)!;
      const before = lifeAt(sam, [], plan.year - 1);
      const y = { ...year(sam, plan.year, "San Francisco, CA", "Design director"), events: [{ id: "you-x-1", domain: "family" as const, category: "texture" as const, title: "Your mother passes away", narrative: "She dies peacefully at 87.", isTurningPoint: false, cause: null, baseRate: null, tone: "mixed" as const }] };
      const first = withParentDeath(y, [], before, null, 0, "you");
      const second = withParentDeath(y, ["-parent:your father"], before, null, 1, "you");
      return { pass: first.ch.includes("-parent:your mother") && !second.ch.some((c) => c.startsWith("-parent")), detail: `${first.ch.join(" ")} | second: ${second.ch.join(" ") || "(dropped)"}` };
    },
  },
];

// Chidi said "₦600k a month": the profile's income must stay within 10% of it at the start.
const chidi = PROFILES.chidi;
export const MONEY_CASES: CodeCase[] = [
  {
    name: "Chidi's '₦600k a month' anchors income (the model's $7,200 becomes ~$4,645)",
    run: () => {
      const text = chidi.quotes.map((q) => q.text).join(" ");
      const fixed = anchorIncome(7200, text, displayCurrency(chidi));
      const want = (600_000 * 12) / 1550;
      return { pass: fixed !== null && Math.abs(fixed - want) / want <= 0.1, detail: `$${fixed} (stated ≈ $${Math.round(want)})` };
    },
  },
  {
    name: "an income within 10% of the stated amount is kept as is",
    run: () => {
      const fixed = anchorIncome(4800, "I make ₦600k a month", "NGN");
      return { pass: fixed === 4800, detail: `$${fixed}` };
    },
  },
  {
    name: "a stated yearly salary anchors too ('$85,000 a year')",
    run: () => {
      const fixed = anchorIncome(120_000, "I earn $85,000 a year as a nurse", "USD");
      return { pass: fixed === 85_000, detail: `$${fixed}` };
    },
  },
  {
    name: "savings or rent aren't income ('$2,000 rent', '$28k in loans')",
    run: () => {
      const fixed = anchorIncome(60_000, "Rent is $2,000 a month and I still have $28k in loans", "USD");
      return { pass: fixed === 60_000, detail: `$${fixed}` };
    },
  },
];

export const COPY_CASES: CodeCase[] = [
  {
    name: "warm-up copy for a naira user says naira, never dollars",
    run: () => {
      const text = warmQuestions("NGN").flatMap((q) => [q.prompt, q.whyAsking, q.placeholder, ...q.options.map((o) => o.label)]).join(" | ");
      return { pass: !/dollar|\$/i.test(text) && /naira/.test(text), detail: text.match(/[^|]*naira[^|]*/)?.[0]?.trim() };
    },
  },
  {
    name: "warm-up copy for a US user still reads naturally",
    run: () => {
      const text = warmQuestions("USD").flatMap((q) => q.options.map((o) => o.label)).join(" | ");
      return { pass: /every dollar/.test(text), detail: text.match(/[^|]*every[^|]*/)?.[0]?.trim() };
    },
  },
];

export { profileOf };
