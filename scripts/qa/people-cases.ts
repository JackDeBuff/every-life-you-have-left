/**
 * People over time (owner playtest, Sat Nov 7), code only. A made-up persona, Ploy, 27, a product
 * designer in Bangkok whose best friend Mint "keeps her here"; she moves to Berlin in 2028, names a
 * new friend (Jonas) in an answer at 30 and says she lost touch with him at 36.
 *
 *   - a name typed in an answer joins the ledger from that year on (not before; not in a branch
 *     that forked before it was said)
 *   - a friend from a city left 5+ years ago is no longer featured nor in People (drifted), and
 *     comes back only through a reunion
 *   - "I lost touch with Jonas" drifts him; family never drifts silently
 *   - invented names: candidates differ by session, never reuse a ledger name, follow the place
 */
import type { Profile } from "../../shared/schema";
import type { SimYear } from "../../shared/sim";
import { peopleSaid } from "../../worker/engine/answers";
import { advance, featuredPeople, lifeAt, newNameCandidates, nowBlock, profileAsOf, yearLife, type LifeNow } from "../../worker/engine/ledger";
import { peopleIssues } from "../../worker/engine/consistency";
import type { CodeCase } from "./code-cases";
import { profileOf, year } from "./fixtures";

const ploy = (sessionId = "s_qa_ploy"): Profile => {
  const base = profileOf({ firstName: "Ploy", age: 27, city: "Bangkok", region: null, country: "TH", line: "I want to design abroad, but my best friend Mint keeps me here." });
  return {
    ...base,
    sessionId,
    people: [{ id: "p1", label: "Mom", relation: "mother", closeness: 0.8, influence: 0.7, expectation: null, quoteIds: [] }],
    quotes: [
      ...base.quotes,
      { id: "q2", text: "I'd go to the climbing gym with my friend Jonas from work every week.", questionId: "d-30-1", source: "answer", shortForm: null },
      { id: "q3", text: "Honestly I lost touch with Jonas after I changed jobs.", questionId: "d-36-2", source: "answer", shortForm: null },
    ],
  };
};
const P = ploy();
const WORK = "Product designer";
const placeOf = (y: number) => (y < 2028 ? "Bangkok, Thailand" : "Berlin, Germany");
const YEARS: SimYear[] = Array.from({ length: 2045 - 2026 + 1 }, (_, i) => year(P, 2026 + i, placeOf(2026 + i), WORK));
const upTo = (y: number, ys = YEARS) => ys.filter((x) => x.year <= y);
const at = (y: number, p = P, ys = YEARS) => lifeAt(p, upTo(y, ys), y);
const listed = (now: LifeNow) => yearLife(now, WORK, []).people.map((x) => x.name);
const featured = (now: LifeNow) => featuredPeople(now).map((f) => f.person.name);

export const PEOPLE_MODEL_CASES: CodeCase[] = [
  {
    name: "no children in the life: a card with a hypothetical child ('a child who wants to drop out') is flagged; a friend's newborn and the kids question are not",
    run: () => {
      const now = at(2040);
      const bad = peopleIssues("Your partner asks how you would handle a child who wants to drop out of university to film street life.", now).filter((i) => i.kind === "child");
      const fine = peopleIssues("You hold your friend's newborn at a cafe. What crosses your mind about having kids of your own?", now).filter((i) => i.kind === "child");
      return { pass: bad.length === 1 && fine.length === 0, detail: bad[0]?.msg ?? "not flagged" };
    },
  },
  {
    name: "names with a relation cue are read from typed words ('my friend Jonas', 'Kai, my climbing buddy'); a fear is not a drift",
    run: () => {
      const a = peopleSaid("I'd go to the climbing gym with my friend Jonas from work every week.");
      const b = peopleSaid("Kai, my climbing buddy, and my old college roommate Dana would come.");
      const c = peopleSaid("I'd hate to lose touch with Kai if I moved.");
      const d = peopleSaid("Honestly I lost touch with Jonas after I changed jobs.");
      const e = peopleSaid("My ex girlfriend Lin texted me in May.");
      const pass =
        a.joins.some((j) => j.name === "Jonas" && j.relation === "friend") &&
        b.joins.some((j) => j.name === "Kai" && j.relation === "climbing buddy") && b.joins.some((j) => j.name === "Dana" && /roommate/.test(j.relation)) &&
        !c.drifted.length && d.drifted.includes("Jonas") && !e.joins.length;
      return { pass, detail: `a=${JSON.stringify(a.joins)} b=${JSON.stringify(b.joins)} c.drifted=${c.drifted} d.drifted=${d.drifted} e=${JSON.stringify(e.joins)}` };
    },
  },
  {
    name: "Mint (named only in the start line) is in People and featured in Bangkok",
    run: () => {
      const now = at(2026);
      return { pass: listed(now).includes("Mint") && featured(now).includes("Mint"), detail: `People: ${listed(now).join(", ")}` };
    },
  },
  {
    name: "Jonas, typed in an answer at 30 (2029), joins People that year, not before",
    run: () => {
      const before = listed(at(2028));
      const then = listed(at(2029));
      const later = listed(at(2032));
      return { pass: !before.includes("Jonas") && then.includes("Jonas") && later.includes("Jonas"), detail: `2028: ${before.join(", ")} | 2029: ${then.join(", ")} | 2032: ${later.join(", ")}` };
    },
  },
  {
    name: "a branch forked before the answer (2027) never has Jonas; one forked after (2031) does",
    run: () => {
      const decisions = [{ id: "d-30-1", year: 2029 }, { id: "d-36-2", year: 2035 }];
      const early = listed(at(2032, profileAsOf(P, decisions, 2027)));
      const late = listed(at(2032, profileAsOf(P, decisions, 2031)));
      return { pass: !early.includes("Jonas") && late.includes("Jonas"), detail: `forked 2027: ${early.join(", ")} | forked 2031: ${late.join(", ")}` };
    },
  },
  {
    name: "Mint, a friend from Bangkok, is no longer featured or in People 5+ years after the move to Berlin (drifted)",
    run: () => {
      const now = at(2033);
      const mint = now.people.find((p) => p.name === "Mint");
      const block = nowBlock(now);
      const pass = !featured(now).includes("Mint") && !listed(now).includes("Mint") && mint?.status === "drifted" && /Drifted apart[^\n]*Mint/.test(block) && !/Close friends[^\n]*Mint/.test(block);
      return { pass, detail: `Mint ${mint?.status} ${mint?.closeness.toFixed(2)} | featured: ${featured(now).join(", ")}` };
    },
  },
  {
    name: "'I lost touch with Jonas' at 36 drifts him; her mother stays in People at 46 (family never drifts silently)",
    run: () => {
      const n35 = at(2035);
      const n45 = at(2045);
      const jonas = n35.people.find((p) => p.name === "Jonas");
      const pass = jonas?.status === "drifted" && !featured(n35).includes("Jonas") && listed(n45).includes("your mom");
      return { pass, detail: `Jonas ${jonas?.status} | 2045 People: ${listed(n45).join(", ")}` };
    },
  },
  {
    name: "a drifted friend comes back only through a reunion the life writes ('runs into Mint ... after years')",
    run: () => {
      const ys = YEARS.map((y) => (y.year === 2040 ? { ...y, summary: "Back in Bangkok for a wedding, Ploy runs into Mint at a night market after years apart." } : y.year === 2038 ? { ...y, summary: "Ploy wonders what Mint is doing." } : y));
      const n39 = at(2039, P, ys);
      const n40 = at(2040, P, ys);
      return { pass: !listed(n39).includes("Mint") && listed(n40).includes("Mint"), detail: `2039: ${listed(n39).join(", ")} | 2040: ${listed(n40).join(", ")}` };
    },
  },
  {
    name: "year-by-year advance gives the same People as a full replay (2034)",
    run: () => {
      let cur = lifeAt(P, upTo(2029), 2029);
      for (const y of YEARS.filter((x) => x.year > 2029 && x.year <= 2034)) cur = advance(cur, y).now;
      const a = JSON.stringify(yearLife(cur, WORK, []).people);
      const b = JSON.stringify(yearLife(at(2034), WORK, []).people);
      return { pass: a === b, detail: a === b ? listed(cur).join(", ") : `advance ${a} vs replay ${b}` };
    },
  },
  {
    name: "two session ids get different partner names; none reuse Ploy, Mint or Jonas; never Lin or May",
    run: () => {
      const a = newNameCandidates(at(2032, ploy("s_qa_ploy")), "partner");
      const b = newNameCandidates(at(2032, ploy("s_qa_ploy_2")), "partner");
      const firsts = new Set(Array.from({ length: 30 }, (_, i) => newNameCandidates(at(2026, ploy(`s_qa_many_${i}`)), "partner")[0]));
      const all = [...a, ...b];
      const pass = a[0] !== b[0] && a.join() !== b.join() && !all.some((n) => ["Ploy", "Mint", "Jonas", "Lin", "May"].includes(n)) && firsts.size >= 11;
      return { pass, detail: `s_qa_ploy: ${a.join(", ")} | s_qa_ploy_2: ${b.join(", ")} | ${firsts.size} distinct first picks over 30 sessions` };
    },
  },
  {
    name: "candidates follow the place: Thai names in Bangkok; German then Thai once she lives in Berlin; the NOW block offers them",
    run: () => {
      const bkk = newNameCandidates(at(2026), "partner");
      const ber = newNameCandidates(at(2032), "partner");
      const block = nowBlock(at(2032));
      const thai = ["Ploy", "Fah", "Nok", "Kwan", "Mint", "Praew", "Fon", "Pim", "Aom", "Bow", "Nan", "Jum", "Gift", "Noon", "Ice", "Prang", "Ton", "Beam", "Golf", "Book", "Bank", "Tee", "Pond", "Arm", "Mek", "Nat", "Krit", "Win", "Oat", "Boss", "Pete", "Tor"];
      const pass = bkk.every((n) => thai.includes(n)) && !thai.includes(ber[0]!) && thai.includes(ber[2]!) && block.includes(ber[0]!) && /New people's names/.test(block);
      return { pass, detail: `Bangkok: ${bkk.join(", ")} | Berlin: ${ber.join(", ")}` };
    },
  },
];

// Standalone: npx tsx scripts/qa/people-cases.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  let failed = 0;
  for (const c of PEOPLE_MODEL_CASES) {
    const r = c.run();
    if (!r.pass) failed++;
    console.log(`${r.pass ? "ok  " : "FAIL"} ${c.name}${r.detail ? `\n       ${r.detail}` : ""}`);
  }
  process.exit(failed ? 1 : 0);
}
