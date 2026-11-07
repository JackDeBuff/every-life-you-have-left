/**
 * Code checks for the content feedback of Sat Nov 7 playtests (made-up people only):
 *   life shocks (rare, once each, never stacked), the world's one pandemic, the validator's
 *   repeated/invented catastrophe rule, card focus (axes, no two work forks in a row, respond to a
 *   shock), the charitable-reading prompt rules, and the grounded lookup failing silently.
 */
import type { SessionState, SimYear } from "../../shared/sim";
import { cardFocus } from "../../worker/engine/focus";
import type { LlmPort } from "../../worker/engine/llm-port";
import { createCaller, DEFAULT_MODELS } from "../../worker/engine/models";
import { groundFacts, namedByThem } from "../../worker/engine/profile";
import { YEARS_SYSTEM } from "../../worker/engine/prompts/years";
import { GroundLLM } from "../../worker/engine/schemas";
import { maxShocks, planShocks, SHOCK_GAP, shocksFor } from "../../worker/engine/shocks";
import { checkYear, coerceYear } from "../../worker/engine/validate";
import { ledgerFrom, worldTimeline } from "../../worker/engine/world";
import type { CodeCase } from "./code-cases";
import { answered, card, profileOf, stateOf, year } from "./fixtures";

// Made-up people: a renter on the Gulf coast, a homeowner in Leeds, a remote worker with a visa.
const rae = profileOf({ firstName: "Rae", age: 25, city: "Tampa", region: "FL", country: "US", line: "I rent a place near the bay and work in logistics." });
const ola = profileOf({ firstName: "Ola", age: 40, city: "Leeds", region: "England", country: "GB", line: "We own a terraced house and my mum is 71." });
const ines = profileOf(
  { firstName: "Ines", age: 33, city: "Durham", region: "NC", country: "US", line: "I'm a UX researcher, fully remote. On weekends I shoot short documentaries. My work visa renews next year." },
  {
    axes: [
      { id: "a1", label: "UX research, fully remote", domain: "career", detail: "the job that pays for everything else", quoteIds: ["q1"] },
      { id: "a2", label: "Weekend documentaries", domain: "achievement", detail: "the films she makes with two friends", quoteIds: ["q1"] },
      { id: "a3", label: "Parents in Porto", domain: "family", detail: "her dad keeps asking when she's coming back", quoteIds: ["q1"] },
    ],
  },
);
const end = (p: typeof rae) => p.birthYear + p.endAge;

const ev = (t: string, n: string, c: string, tone = "down", tp = true) => ({ t, n, c, d: "wealth", tone, tp, q: "q1", why: "Because you said so.", st: null, w: null });
const draftOf = (y: number, events: ReturnType<typeof ev>[]) => coerceYear({ y, p: "Tampa, FL", s: "A year.", e: events, inc: 50000, nw: 20000, k: [50, 50, 50, 50, 50, 50, 50, 50, 50, 50] }, null).draft;
const ctxOf = (p: typeof rae, y: number, past: SimYear[], shocks?: ReturnType<typeof planShocks>) => ({
  profile: p, expectedYear: y, prev: past.at(-1) ?? null, ledger: ledgerFrom(past), world: [], span: 45, idPrefix: "you", coarse: false, decisionIds: [], shocks,
});
const withEvent = (y: SimYear, title: string, narrative: string, category: SimYear["events"][number]["category"] = "money_down"): SimYear => ({
  ...y,
  events: [{ id: `you-${y.year}-1`, domain: "wealth", category, title, narrative, isTurningPoint: true, cause: { quoteId: "q1", reason: "x" }, baseRate: null, tone: "down" }],
});

export const SHOCK_CASES: CodeCase[] = [
  {
    name: "shock plans over 1500 made-up lives: at most one of each type, one natural disaster, the per-life cap, >= 4 years apart",
    run: () => {
      let bad = 0;
      const counts = [0, 0, 0, 0];
      for (const p of [rae, ola, ines]) {
        for (let i = 0; i < 500; i++) {
          const world = worldTimeline(`qa_${i}`, p.startYear, end(p));
          const plan = planShocks(`qa_${i}`, "you", p, world);
          counts[plan.length]!++;
          const types = new Set(plan.map((s) => s.type));
          const gaps = plan.slice(1).every((s, k) => s.year - plan[k]!.year >= SHOCK_GAP);
          if (types.size !== plan.length || plan.filter((s) => s.scope === "natural").length > 1 || plan.length > maxShocks(end(p) - p.startYear) || !gaps) bad++;
          if (plan.some((s) => s.year === p.startYear)) bad++;
        }
      }
      const pct = (x: number) => `${Math.round((100 * x) / 1500)}%`;
      return { pass: bad === 0 && counts[0]! + counts[1]! + counts[2]! >= 1500 * 0.6, detail: `${bad} bad plans; shocks per life 0: ${pct(counts[0]!)}, 1: ${pct(counts[1]!)}, 2: ${pct(counts[2]!)}, 3: ${pct(counts[3]!)}` };
    },
  },
  {
    name: "the world gets at most one pandemic per session, never within 3 years of a downturn, and then only 2 world events",
    run: () => {
      let bad = 0;
      let with_ = 0;
      for (let i = 0; i < 2000; i++) {
        const w = worldTimeline(`qa_${i}`, 2026, 2071);
        const pan = w.filter((x) => x.kind === "other");
        if (pan.length > 1) bad++;
        if (pan.length) {
          with_++;
          if (w.length > 2 || w.some((x) => x.kind === "downturn" && Math.abs(x.year - pan[0]!.year) < 3)) bad++;
        }
      }
      return { pass: bad === 0 && with_ > 0, detail: `${bad} bad timelines; ${Math.round(with_ / 20)}% of 45-year sessions have one (2%/yr)` };
    },
  },
  {
    name: "a flood already in the life's past (a branch's shared past too) uses up the natural disaster: none planned after it",
    run: () => {
      const past = [withEvent(year(rae, 2030, "Tampa, FL", "Dispatcher"), "The storm floods the ground floor", "Hurricane water reaches the counters; you sleep at Mia's for three weeks.")];
      let leaks = 0;
      for (let i = 0; i < 300; i++) {
        const world = worldTimeline(`qa_${i}`, rae.startYear, end(rae));
        for (const life of ["you", "b-d-30-1-a", "b-d-30-1-c"]) if (shocksFor(`qa_${i}`, life, rae, world, past, 2031, end(rae)).some((s) => s.type === "home_disaster")) leaks++;
      }
      return { pass: leaks === 0, detail: `${leaks} lives planned a second natural disaster` };
    },
  },
  {
    name: "the validator rejects a second hurricane in a life (repeated catastrophe)",
    run: () => {
      const past = [withEvent(year(rae, 2030, "Tampa, FL", "Dispatcher"), "The storm floods the ground floor", "Hurricane water reaches the counters.")];
      const c = checkYear(draftOf(2036, [ev("Another hurricane hits", "A hurricane tears the roof off the new place.", "money_down")]), ctxOf(rae, 2036, past));
      return { pass: c.hard.some((h) => /repeats a catastrophe/.test(h)), detail: c.hard.join(" | ") || "nothing flagged" };
    },
  },
  {
    name: "the validator rejects an invented break-in, keeps a planned one (exempt from the money_down budget), and ignores 'flooded with messages'",
    run: () => {
      const y = 2034;
      const planned = [{ type: "burglary", scope: "personal" as const, year: y, age: y - rae.birthYear, tone: "down" as const, cats: ["money_down" as const], domain: "wealth" as const, statId: "burglary", what: "a break-in", ask: "" }];
      // two money_down turning points already used: the budget is full
      const past = [2027, 2031].map((yy) => withEvent(year(rae, yy, "Tampa, FL", "Dispatcher"), "A big repair bill", "The car needs a new transmission."));
      const invented = checkYear(draftOf(y, [ev("A break-in", "Someone is burgled while you're out: the laptop is gone.", "money_down")]), ctxOf(rae, y, past, []));
      const ok = checkYear(draftOf(y, [ev("A break-in", "Your place is broken into while you're out: the laptop is gone.", "money_down")]), ctxOf(rae, y, past, planned));
      const words = checkYear(draftOf(y, [ev("Launch week", "Your inbox is flooded with messages after the launch.", "achievement", "up")]), ctxOf(rae, y, past, []));
      const pass = invented.hard.some((h) => /didn't roll/.test(h)) && ok.hard.length === 0 && words.hard.length === 0;
      return { pass, detail: `invented: ${invented.hard.join(" | ") || "-"} | planned: ${ok.hard.join(" | ") || "clean"} | flooded-with: ${words.hard.join(" | ") || "clean"}` };
    },
  },
];

// Card focus: Ines's first fork was a work question; the next one must not be, and it lands on another axis.
const work = card("d-33-1", 2026, 33, "SAS offers you a lead role with weekly on-site management. Do you take it?", [["Take the lead role", "x"], ["Stay an IC", "x"], ["Ask to stay remote", "x"], ["Go freelance", "x"]], ["career", "wealth"]);
const focusState: SessionState = { ...stateOf(ines, [year(ines, 2026, "Durham, NC", "UX researcher"), year(ines, 2027, "Durham, NC", "UX researcher")], [answered(work, "b")]), playhead: { year: 2031, age: 38, paused: true } };
const slot = { year: 2031, age: 38, kind: "big" as const, reason: "big:career:career_crossroads: a job offer or a promotion that changes the shape of work" };

export const FOCUS_CASES: CodeCase[] = [
  {
    name: "after a work fork the next big card is told NOT to be about work, and is built on a non-work life axis",
    run: () => {
      const f = cardFocus(focusState, slot);
      const pass = /NOT about work/.test(f) && /(Weekend documentaries|Parents in Porto)/.test(f) && !/thread[^"]*"UX research/.test(f);
      return { pass, detail: f.replace(/\n/g, " / ") };
    },
  },
  {
    name: "a life shock written the year before a card turns that card into 'how do you respond?'",
    run: () => {
      // find a made-up session where the chosen life has a shock, write it into its year, then ask the next card
      for (let i = 0; i < 400; i++) {
        const p = { ...ines, sessionId: `s_qa_focus_${i}` };
        const plan = planShocks(p.sessionId, "you", p, worldTimeline(p.sessionId, p.startYear, end(p))).filter((s) => s.type === "burglary" || s.type === "scam");
        const s = plan[0];
        if (!s) continue;
        const years: SimYear[] = [];
        for (let yy = p.startYear; yy <= s.year; yy++) years.push(year(p, yy, "Durham, NC", "UX researcher"));
        years[years.length - 1] = withEvent(years.at(-1)!, s.type === "scam" ? "A convincing scam call" : "A break-in", s.type === "scam" ? "A fake bank call talks you out of $3,000." : "Your apartment is broken into while you're in Porto.");
        const state: SessionState = { ...stateOf(p, years, []), playhead: { year: s.year + 1, age: s.age + 1, paused: true } };
        const f = cardFocus(state, { year: s.year + 1, age: s.age + 1, kind: "small", reason: "small:family: we don't know..." });
        return { pass: /how they respond/.test(f), detail: `${s.type} in ${s.year}: ${f.replace(/\n/g, " / ").slice(0, 220)}` };
      }
      return { pass: false, detail: "no made-up session with a burglary or scam in 400 seeds" };
    },
  },
  {
    name: "the year writer is told to read their words generously and match the statistic to the claim",
    run: () => {
      const pass = /admission inside a warm answer is context/.test(YEARS_SYSTEM) && /friendship that holds -> close_friends, not loneliness/.test(YEARS_SYSTEM) && /Never invent an office district/.test(YEARS_SYSTEM);
      return { pass };
    },
  },
];

/** A port whose grounded call never answers (it only stops when aborted). */
const hangingPort = {
  generateJSON: async () => {
    throw new Error("unused");
  },
  streamText: async function* () {},
  chatCompletionsOpenAI: async () => {
    throw new Error("unused");
  },
  groundedText: (req: { signal?: AbortSignal }) =>
    new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
} as unknown as LlmPort;

/** Async checks (the runner awaits these). */
export async function groundAsync(): Promise<{ name: string; pass: boolean; detail: string }[]> {
  const call = createCaller({ llm: hangingPort, models: DEFAULT_MODELS });
  const t0 = Date.now();
  const r = await call.grounded({ purpose: "profile.ground", system: "", prompt: "", schema: GroundLLM, timeoutMs: 50 });
  const ms = Date.now() - t0;
  const noPort = createCaller({ llm: { ...hangingPort, groundedText: undefined } as LlmPort, models: DEFAULT_MODELS });
  const r2 = await groundFacts(noPort, { age: 33, city: "Durham", region: "NC", country: "US", line: "I work at a bank." }, []);
  const cv = "Software Engineer, Paystack-style payments startup, Lagos. B.Sc., University of Lagos.";
  const named = namedByThem("University of Lagos", cv) && namedByThem("SAS", "I'm a UX researcher at SAS") && !namedByThem("Paystack", cv) && !namedByThem("Google", "a company like Google");
  return [
    { name: "grounded facts only about what they named ('Paystack-style' and 'like Google' are not employers)", pass: named, detail: String(named) },
    { name: "a hanging grounded call returns null within its time box", pass: r === null && ms < 1000, detail: `${ms} ms` },
    { name: "a port without grounding (mock engine) gives no grounded facts, no error", pass: r2 === null, detail: String(r2) },
  ];
}

