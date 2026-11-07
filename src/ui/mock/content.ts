/**
 * Mock content bank: decisions (big forks + small ones), live settings, interlude captions,
 * verdicts, five-year answers and future-self replies. Personalised from the start line.
 */
import type { DomainKey } from "../../../shared/domains";
import type { Quote } from "../../../shared/schema";
import type { DecisionKind, LiveSetting, SceneSpec } from "../../../shared/sim";
import type { BaseRateId } from "../../../shared/baseRates";
import { KNOWN_PLACES, shortOf, tagQuote, type Traj, type WorkKind } from "./life";
import { pick, type Rng } from "./rng";

export interface Effect {
  drive?: number;
  caution?: number;
  family?: number;
  craft?: number;
  balance?: number;
  move?: { city: string; region: string | null; country: string; far: boolean } | null;
  work?: string;
  workKind?: WorkKind;
  kidsPlan?: Traj["kidsPlan"];
  seekPartner?: boolean;
  incomeMul?: number;
  netWorthAdd?: number;
  risk?: number;
  retireAge?: number;
  caring?: boolean;
  home?: SceneSpec["home"];
  leap?: boolean;
  invest?: Traj["invest"];
  /** An event this choice causes, `inYears` after the decision (0 = the same year). */
  queue?: {
    inYears: number;
    domain: DomainKey;
    category: import("../../../shared/schema").EventCategory;
    title: string;
    narrative: string;
    tone: "up" | "down" | "mixed";
    baseRate: BaseRateId | null;
    moment: SceneSpec["moment"];
    activity?: SceneSpec["activity"];
  }[];
}

export interface OptionDraft {
  label: string;
  hint: string | null;
  branchTitle: string | null;
  effect: Effect;
}

export interface DecisionDraft {
  domains: DomainKey[];
  prompt: string;
  whyAsking: string;
  whyQuoteId: string | null;
  placeholder: string;
  options: [OptionDraft, OptionDraft, OptionDraft, OptionDraft];
}

export interface Ctx {
  year: number;
  age: number;
  name: string;
  t: Traj;
  quotes: Quote[];
  line: string;
  r: Rng;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
export function offerPlaceOf(line: string, home: string): string | null {
  const known = Object.keys(KNOWN_PLACES).find((k) => line.toLowerCase().includes(k) && k !== home.toLowerCase());
  if (known) return known.replace(/\b\w/g, (c) => c.toUpperCase());
  const m = line.match(/\b(?:to|in|from)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
  if (m && m[1] && m[1] !== home && !["I", "My", "The"].includes(m[1])) return m[1];
  return null;
}

function moveTo(city: string, far = true): Effect["move"] {
  const k = KNOWN_PLACES[city.toLowerCase()];
  return { city, region: k?.region ?? null, country: k?.country ?? "US", far };
}

const q = (quotes: Quote[], d: DomainKey): Quote | null => {
  for (let i = quotes.length - 1; i >= 0; i--) if (tagQuote(quotes[i]!.text).includes(d)) return quotes[i]!;
  return null;
};
/** "You said “…” " when a quote fits; nothing otherwise (never cite a sentence that doesn't apply). */
const said = (x: Quote | null, verb = "You said") => (x ? `${verb} “${x.shortForm ?? shortOf(x.text, 9)}” ` : "");

const PLACEHOLDERS = [
  "Or tell me what you'd really do…",
  "Say it your way. “I'd stay, but only if…”",
  "What would you do, honestly?",
  "Anything the four answers miss…",
];

// ---------------------------------------------------------------------------------------------
// Big decisions
// ---------------------------------------------------------------------------------------------
type BigBuilder = (c: Ctx) => DecisionDraft;

/** The first fork, "today", read from what is on the user's mind. */
export function firstFork(c: Ctx): DecisionDraft {
  const l = c.line.toLowerCase();
  const offer = offerPlaceOf(c.line, c.t.city);
  if (offer && /offer|transfer|move|job|position|accepted|admit/.test(l)) return forkOffer(c, offer);
  if (/paint|art|draw|music|write|film|design|band|novel/.test(l)) return forkCraft(c);
  if (/money|loan|debt|rent|broke|savings/.test(l)) return forkMoney(c);
  if (/quit|job|boss|work|career|cubicle|desk|burn/.test(l)) return forkWork(c);
  if (/love|partner|lonely|girlfriend|boyfriend|dating|marry/.test(l)) return forkLove(c);
  if (/school|degree|grad|study|college|mba|phd/.test(l)) return forkSchool(c);
  return forkGeneric(c);
}

function base(c: Ctx, domains: DomainKey[], prompt: string, why: string, whyQ: Quote | null, options: DecisionDraft["options"]): DecisionDraft {
  return { domains, prompt, whyAsking: why, whyQuoteId: whyQ?.id ?? null, placeholder: pick(c.r, PLACEHOLDERS), options };
}

function forkOffer(c: Ctx, place: string): DecisionDraft {
  const { t, year } = c;
  const why = c.quotes.find((x) => x.text.toLowerCase().includes(place.toLowerCase())) ?? q(c.quotes, "risk");
  return base(c, ["career", "family", "risk"], `It's ${year}. ${place} wants an answer by Friday.`,
    `${said(why)}This is the first fork, and it splits everything after it.`, why, [
    {
      label: `Say yes and move to ${place}`, hint: "Bigger pay, new city, far from home", branchTitle: `Take ${place}`,
      effect: { move: moveTo(place), incomeMul: 1.34, drive: 0.2, family: -0.1, risk: 26, leap: true,
        queue: [{ inYears: 1, domain: "lifeGoals", category: "move", title: `You land in ${place}`, narrative: "Two suitcases, a work badge, a city that never cools down.", tone: "mixed", baseRate: "moving", moment: "travel_abroad", activity: "moving" }] },
    },
    {
      label: "Stay, and use the offer to ask for a raise", hint: "Leverage you only get once", branchTitle: "Stay, ask for a raise",
      effect: { incomeMul: 1.12, caution: 0.1, drive: 0.06,
        queue: [{ inYears: 0, domain: "career", category: "career_move", title: "The raise comes through", narrative: "Twelve percent and a new title. Nobody mentions the offer again.", tone: "up", baseRate: "earnings_growth", moment: "promotion", activity: "office_work" }] },
    },
    {
      label: `Turn it down and ${t.craftVerb} instead`, hint: "Less money, all of your own hours", branchTitle: `Quit to ${t.craftVerb.split(" ")[0]}`,
      effect: { workKind: "creative", work: `${t.craftPerson}, freelancing on the side`, incomeMul: 0.55, craft: 0.42, balance: 0.12, risk: 30, leap: true,
        queue: [{ inYears: 0, domain: "lifeGoals", category: "career_change", title: "You hand in your notice", narrative: "Your manager says the door is open. You don't look back at it.", tone: "mixed", baseRate: "occ_switch", moment: null, activity: "studio_creating" }] },
    },
    {
      label: `Go, but bring ${t.parent} over later`, hint: "Both, slowly. It costs more", branchTitle: `Go, bring ${t.parent} later`,
      effect: { move: moveTo(place), incomeMul: 1.28, family: 0.16, caution: 0.04, risk: 22, leap: true,
        queue: [
          { inYears: 1, domain: "lifeGoals", category: "move", title: `You land in ${place}`, narrative: "A smaller flat than you'd like, with a spare room on purpose.", tone: "mixed", baseRate: "moving", moment: "travel_abroad", activity: "moving" },
          { inYears: 3, domain: "family", category: "move", title: `${cap(t.parent)} ${t.parent === "your parents" ? "join" : "joins"} you in ${place}`, narrative: "Three years of video calls end at arrivals, holding a sign you made.", tone: "up", baseRate: "caregiving", moment: "reunion", activity: "family_time" },
        ] },
    },
  ]);
}

function forkCraft(c: Ctx): DecisionDraft {
  const { t, year } = c;
  const why = q(c.quotes, "lifeGoals");
  return base(c, ["lifeGoals", "career", "wealth"], `It's ${year}. A small gallery says they'd show your ${t.craftNoun}, if you have twelve pieces by spring.`,
    `${said(why)}Here's the door.`, why, [
    { label: "Say yes, and work every night until spring", hint: "Exhausting, and the job stays", branchTitle: "Make the twelve",
      effect: { craft: 0.3, drive: 0.1, balance: -0.12, queue: [{ inYears: 1, domain: "achievement", category: "achievement", title: "Your first show opens", narrative: "Twelve pieces, two sold, one to a stranger.", tone: "up", baseRate: null, moment: "first_show", activity: "studio_creating" }] } },
    { label: "Say not yet. Keep it a hobby", hint: "Safer, and it stays private", branchTitle: "Keep it a hobby", effect: { caution: 0.12, craft: -0.1, drive: 0.08 } },
    { label: "Cut to four days a week to make room", hint: "Less money, more of you", branchTitle: "Four-day week", effect: { incomeMul: 0.8, craft: 0.22, balance: 0.2 } },
    { label: `Quit and ${t.craftVerb} full time`, hint: "All in. Savings for a year", branchTitle: `${cap(t.craftVerb)} full time`,
      effect: { workKind: "creative", work: `${t.craftPerson}, full time`, incomeMul: 0.45, craft: 0.45, risk: 32, leap: true } },
  ]);
}

function forkMoney(c: Ctx): DecisionDraft {
  const { year } = c;
  const why = q(c.quotes, "wealth");
  const debt = Math.max(0, -c.t.netWorth);
  return base(c, ["wealth", "risk", "lifeGoals"],
    debt > 0 ? `It's ${year}. $${Math.round(debt / 1000)}k of loans, and a little left over each month. Where does it go?` : `It's ${year}. For the first time, there's money left at the end of the month. Where does it go?`,
    `${said(why)}This is your first big money move.`, why, [
    { label: "Throw everything at the debt", hint: "Debt-free in three years, nothing else", branchTitle: "Debt-free first", effect: { caution: 0.22, netWorthAdd: 6000, invest: "cash" } },
    { label: "Invest it, pay the minimum", hint: "Lets time do the work; feels risky", branchTitle: "Let it compound", effect: { invest: "index", caution: -0.05, risk: 6 } },
    { label: "Spend it on the move you keep postponing", hint: "A new city now, savings later", branchTitle: "Move now", effect: { move: moveTo("Chicago", false), incomeMul: 1.1, risk: 18, leap: true } },
    { label: "Fund a year of the thing nobody would judge", hint: "A year for you, on purpose", branchTitle: "Buy a year", effect: { craft: 0.35, incomeMul: 0.6, risk: 20, leap: true } },
  ]);
}

function forkWork(c: Ctx): DecisionDraft {
  const { year } = c;
  const why = q(c.quotes, "career");
  return base(c, ["career", "mentalHealth", "lifeGoals"], `It's ${year}. Another Monday at the same desk. What do you do about work?`,
    `${said(why)}So let's start here.`, why, [
    { label: "Ask for the harder role where you are", hint: "Climb, and stay in the same building", branchTitle: "Climb where you are", effect: { drive: 0.22, incomeMul: 1.1 } },
    { label: "Start interviewing elsewhere this month", hint: "New people, a pay bump, a reset", branchTitle: "Switch companies", effect: { drive: 0.1, incomeMul: 1.15, risk: 10 } },
    { label: "Go back to school for something else", hint: "Two lean years, a different career", branchTitle: "Retrain", effect: { workKind: "employee", work: "Student, then a new field", incomeMul: 0.4, netWorthAdd: -30000, risk: 22, leap: true } },
    { label: "Quit and give your own idea a year", hint: "Your name on it; no safety net", branchTitle: "Bet on yourself", effect: { workKind: "founder", work: "Founder of a tiny company", incomeMul: 0.5, risk: 34, leap: true } },
  ]);
}

function forkLove(c: Ctx): DecisionDraft {
  const { year } = c;
  const why = q(c.quotes, "relationships");
  return base(c, ["relationships", "family", "happiness"], `It's ${year}. The person you've been seeing asks if this is going somewhere.`,
    `${said(why)}This one decides who's in the picture.`, why, [
    { label: "Yes. Let's move in together", hint: "Fast, warm, a shared lease", branchTitle: "Move in together", effect: { family: 0.15, seekPartner: true, queue: [{ inYears: 0, domain: "relationships", category: "love_start", title: "You move in together", narrative: "A second toothbrush, then a second bookshelf.", tone: "up", baseRate: null, moment: "moving_in" }] } },
    { label: "I don't know yet. Slow down", hint: "Honest, and it might cost you", branchTitle: "Take it slow", effect: { caution: 0.1 } },
    { label: "No. End it kindly", hint: "Hard now, freer later", branchTitle: "End it kindly", effect: { balance: 0.08, drive: 0.1 } },
    { label: "Yes, and let's leave town together", hint: "Two leaps at once", branchTitle: "Leave together", effect: { move: moveTo("Denver", false), seekPartner: true, risk: 20, leap: true } },
  ]);
}

function forkSchool(c: Ctx): DecisionDraft {
  const { year } = c;
  const why = q(c.quotes, "achievement");
  return base(c, ["achievement", "career", "wealth"], `It's ${year}. The acceptance letter came. Classes start in August.`,
    `${said(why)}This one sets your next decade.`, why, [
    { label: "Go, and take the loans", hint: "Two years, a new ceiling", branchTitle: "Take the degree", effect: { netWorthAdd: -60000, drive: 0.15, incomeMul: 0.3, queue: [{ inYears: 2, domain: "achievement", category: "achievement", title: "You graduate", narrative: "A gown that doesn't fit and a job offer that does.", tone: "up", baseRate: "hh_income_edu", moment: "graduation" }] } },
    { label: "Defer a year and save first", hint: "Slower, calmer, less debt", branchTitle: "Defer a year", effect: { caution: 0.15 } },
    { label: "Skip it, learn on the job", hint: "Earn now, prove it later", branchTitle: "Learn on the job", effect: { drive: 0.15 } },
    { label: "Go somewhere far away to study", hint: "A different country, a different you", branchTitle: "Study abroad", effect: { move: moveTo("Berlin"), netWorthAdd: -20000, risk: 22, leap: true } },
  ]);
}

function forkGeneric(c: Ctx): DecisionDraft {
  const { year, age, t } = c;
  const why = q(c.quotes, "lifeGoals");
  return base(c, ["lifeGoals", "career", "relationships"], `It's ${year}. You're ${age}, in ${t.city}. If one thing changed this year, which would it be?`,
    `${said(why)}Let's start with what you'd change.`, why, [
    { label: "Where I live", hint: "A new city, new friends, a reset", branchTitle: "Move somewhere new", effect: { move: moveTo("Lisbon"), risk: 22, leap: true } },
    { label: "What I do for work", hint: "Different days, different people", branchTitle: "New line of work", effect: { drive: 0.2, workKind: "employee", work: "Starting over in a new field", incomeMul: 0.8, risk: 12 } },
    { label: "Who I spend my time with", hint: "People first for a while", branchTitle: "People first", effect: { family: 0.22, balance: 0.15 } },
    { label: "The thing I'd do if nobody judged", hint: "The secret want, finally", branchTitle: "The secret want", effect: { craft: 0.4, risk: 18, leap: true } },
  ]);
}

/** Later forks, keyed to life stage. */
export function laterFork(c: Ctx, used: Set<string>): { key: string; draft: DecisionDraft } {
  const { age } = c;
  const stages: [string, number, number, BigBuilder][] = [
    ["roots", 18, 33, forkRoots],
    ["family", 29, 41, c.t.partner === "none" ? forkSingle : forkKids],
    ["pivot", 37, 50, forkPivot],
    ["parents", 45, 60, forkParents],
    ["next", 54, 99, forkNext],
  ];
  const fit = stages.filter(([k, lo, hi]) => !used.has(k) && age >= lo && age <= hi);
  const choice = fit[0] ?? stages.find(([k]) => !used.has(k)) ?? stages[stages.length - 1]!;
  return { key: choice[0], draft: choice[3](c) };
}

function forkRoots(c: Ctx): DecisionDraft {
  const { year, t } = c;
  const why = q(c.quotes, "wealth");
  return base(c, ["wealth", "lifeGoals", "relationships"], `It's ${year}. Your lease is up in ${t.city}, and you've been saving.`,
    `${said(why)}Where you live decides a lot of what comes next.`, why, [
    { label: "Buy a small place here", hint: "Roots, a mortgage, a door to paint", branchTitle: "Put down roots", effect: { caution: 0.15, home: "townhouse", queue: [{ inYears: 0, domain: "wealth", category: "home", title: "Keys to a place of your own", narrative: "Two bedrooms, one bad radiator, all yours.", tone: "up", baseRate: "first_home", moment: "house_keys", activity: "moving" }] } },
    { label: "Move somewhere cheaper with more space", hint: "A yard and a longer drive", branchTitle: "Move for space", effect: { move: moveTo("Wilmington", false), home: "house", balance: 0.1 } },
    { label: "Move to a big city for the career", hint: "Smaller flat, bigger rooms at work", branchTitle: "Big city years", effect: { move: moveTo("New York", true), drive: 0.18, incomeMul: 1.25, home: "apartment_small", risk: 14 } },
    { label: "Keep renting and travel more", hint: "Light, free, nothing to sell later", branchTitle: "Stay light", effect: { balance: 0.18, caution: -0.08 } },
  ]);
}

function forkKids(c: Ctx): DecisionDraft {
  const { year, t } = c;
  const why = q(c.quotes, "children");
  const who = t.partnerName && t.partnerName !== "your partner" ? t.partnerName : "Your partner";
  return base(c, ["children", "relationships", "wealth"], `It's ${year}. ${who} asks the question you've both been circling: kids?`,
    `${said(why, "You told me")}This one changes the shape of every year after.`, why, [
    { label: "Yes, let's try this year", hint: "A fuller house, less sleep", branchTitle: "Have a child", effect: { kidsPlan: "yes", family: 0.18, balance: 0.06 } },
    { label: "Not yet. Ask me again in three years", hint: "Time to build first", branchTitle: "Wait a while", effect: { kidsPlan: "later", drive: 0.1 } },
    { label: "We'd rather not, and that's a full life too", hint: "Freedom, travel, other kinds of family", branchTitle: "Child-free", effect: { kidsPlan: "no", balance: 0.12, craft: 0.08 } },
    { label: "Foster or adopt, a little later", hint: "Family, another way", branchTitle: "Adopt later", effect: { kidsPlan: "later", family: 0.2, queue: [{ inYears: 4, domain: "children", category: "child", title: "A child comes home to you", narrative: "Paperwork for two years, then a small person with a big backpack.", tone: "up", baseRate: "tfr", moment: "new_baby", activity: "family_time" }] } },
  ]);
}

function forkSingle(c: Ctx): DecisionDraft {
  const { year, age } = c;
  const why = q(c.quotes, "relationships");
  return base(c, ["relationships", "family", "happiness"], `It's ${year}. You're ${age}, single, and your friends are pairing off.`,
    `${said(why)}Who's in your life next is worth deciding on purpose.`, why, [
    { label: "Try, seriously, to meet someone", hint: "Apps, set-ups, saying yes", branchTitle: "Look for love", effect: { seekPartner: true, balance: 0.12, kidsPlan: "yes" } },
    { label: "Build a life with friends instead", hint: "Chosen family, on purpose", branchTitle: "Chosen family", effect: { balance: 0.15, kidsPlan: "no" } },
    { label: "Move closer to family", hint: "Sunday dinners, smaller city", branchTitle: "Go home", effect: { family: 0.25, move: null } },
    { label: "Pour it into work for now", hint: "Momentum now, people later", branchTitle: "Work first", effect: { drive: 0.22, balance: -0.12 } },
  ]);
}

function forkPivot(c: Ctx): DecisionDraft {
  const { year } = c;
  const why = q(c.quotes, "career");
  return base(c, ["career", "mentalHealth", "achievement"], `It's ${year}. You're good at your job, and tired of it. A younger you would be surprised.`,
    `${said(why)}This is the middle, and middles can turn.`, why, [
    { label: "Push for the top job", hint: "More money, more weight", branchTitle: "Go for the top", effect: { drive: 0.22, incomeMul: 1.22, balance: -0.1 } },
    { label: "Step down to something calmer", hint: "Less pay, more evenings", branchTitle: "Downshift", effect: { drive: -0.2, balance: 0.24, incomeMul: 0.82 } },
    { label: "Start your own firm", hint: "Your clients, your risk", branchTitle: "Go independent", effect: { workKind: "founder", work: "Running your own small firm", incomeMul: 0.85, risk: 28, leap: true } },
    { label: "Teach what you know", hint: "A classroom, summers off", branchTitle: "Teach", effect: { workKind: "teacher", work: "Teaching at the community college", incomeMul: 0.7, balance: 0.2, craft: 0.1 } },
  ]);
}

function forkParents(c: Ctx): DecisionDraft {
  const { year, t } = c;
  const why = q(c.quotes, "family");
  const p = cap(t.parent);
  return base(c, ["family", "mentalHealth", "wealth"], `It's ${year}. ${t.parent === "your parents" ? "One of your parents" : p} fell in the kitchen. Nothing broken, but it scared everyone.`,
    `${said(why)}This is what that looks like now.`, why, [
    { label: `Move ${t.parent} in with you`, hint: "Close, and a lot on you", branchTitle: `Bring ${t.parent} home`, effect: { caring: true, family: 0.2, balance: -0.08 } },
    { label: "Move back to be nearby", hint: "Your city for theirs", branchTitle: "Move back", effect: { move: null, family: 0.2, caring: true } },
    { label: "Pay for good care close to them", hint: "Money instead of time", branchTitle: "Pay for care", effect: { netWorthAdd: -40000, caution: 0.05 } },
    { label: "Share it with family, rotate weekends", hint: "Fair, and complicated", branchTitle: "Share the care", effect: { family: 0.1, caring: true } },
  ]);
}

function forkNext(c: Ctx): DecisionDraft {
  const { year } = c;
  const why = q(c.quotes, "lifeGoals");
  return base(c, ["lifeGoals", "happiness", "wealth"], `It's ${year}. You could stop working in two years. What's the next part for?`,
    `${said(why)}The last fork is about what's left.`, why, [
    { label: "Retire early and live smaller", hint: "Time over money", branchTitle: "Retire early", effect: { retireAge: c.age + 1, balance: 0.25 } },
    { label: "Keep working. It's who you are", hint: "Purpose, and a later finish line", branchTitle: "Keep going", effect: { retireAge: 69, drive: 0.1 } },
    { label: "Start the thing you never did", hint: "A late beginning", branchTitle: "A late start", effect: { craft: 0.4, workKind: "creative", work: `${c.t.craftPerson}, finally`, leap: true } },
    { label: "Move somewhere new, near water", hint: "A last big move", branchTitle: "Move to the coast", effect: { move: moveTo("Charleston", false), balance: 0.2, retireAge: c.age + 2 } },
  ]);
}

// ---------------------------------------------------------------------------------------------
// Small decisions (they never stop the clock)
// ---------------------------------------------------------------------------------------------
const SMALL: { domain: DomainKey; build: (c: Ctx) => Omit<DecisionDraft, "placeholder" | "whyQuoteId"> }[] = [
  { domain: "relationships", build: (c) => ({ domains: ["relationships"], prompt: `It's ${c.year}. An old friend is in town one night only, the night before a deadline.`, whyAsking: "I want to know who you make room for.",
    options: [o("Go, and work late after", { balance: 0.04 }), o("Skip it, send a long text", { drive: 0.04 }), o("Bring them to the office", {}), o("Push the deadline instead", { balance: 0.06, drive: -0.03 })] }) },
  { domain: "wealth", build: (c) => ({ domains: ["wealth"], prompt: `It's ${c.year}. A bonus lands: $${(4 + Math.floor(c.r() * 8)) * 1000}.`, whyAsking: "Money tells me what you're afraid of.",
    options: [o("Into the index fund", { invest: "index" }), o("Pay down what I owe", { caution: 0.05 }), o("A trip I'll remember", { balance: 0.05 }), o(`Send some to ${c.t.parent}`, { family: 0.05 })] }) },
  { domain: "mentalHealth", build: (c) => ({ domains: ["mentalHealth"], prompt: `It's ${c.year}. You've slept five hours a night for a month.`, whyAsking: "I'm learning how you handle pressure.",
    options: [o("Take a real week off", { balance: 0.06 }), o("Start running before work", { balance: 0.03 }), o("Push through the quarter", { drive: 0.05, balance: -0.03 }), o("Talk to someone about it", { balance: 0.05 })] }) },
  { domain: "career", build: (c) => ({ domains: ["career"], prompt: `It's ${c.year}. Your manager offers you the project nobody wants.`, whyAsking: "Do you climb, or protect your time?",
    options: [o("Take it. It's visible", { drive: 0.06 }), o("Say no, politely", { balance: 0.04 }), o("Take it if I can pick the team", { drive: 0.04 }), o("Use it to ask for more money", { drive: 0.03, caution: 0.02 })] }) },
  { domain: "family", build: (c) => ({ domains: ["family"], prompt: `It's ${c.year}. ${cap(c.t.parent)} asks you to come home for a whole week this summer.`, whyAsking: "Family pulls on you. How hard?",
    options: [o("Go for the whole week", { family: 0.06 }), o("Go for a long weekend", { family: 0.03 }), o("Fly them out to me instead", { family: 0.04 }), o("Not this year", { drive: 0.03, family: -0.03 })] }) },
  { domain: "lifeGoals", build: (c) => ({ domains: ["lifeGoals"], prompt: `It's ${c.year}. A class you've always wanted to take starts Tuesday evenings.`, whyAsking: "I'm checking whether the secret want is still there.",
    options: [o("Sign up tonight", { craft: 0.07 }), o("Next term, maybe", {}), o("Teach myself instead", { craft: 0.04 }), o("I don't want that anymore", { craft: -0.05 })] }) },
  { domain: "happiness", build: (c) => ({ domains: ["happiness"], prompt: `It's ${c.year}. A free Saturday, nothing planned.`, whyAsking: "Small days add up. What fills yours?",
    options: [o("Sleep in, then nothing", { balance: 0.03 }), o("Catch up on work", { drive: 0.03 }), o("Call people, make a plan", { family: 0.02, balance: 0.02 }), o(`Spend it on ${c.t.craftNoun}`, { craft: 0.04 })] }) },
  { domain: "children", build: (c) => ({ domains: ["children"], prompt: `It's ${c.year}. A friend asks you to be their kid's godparent.`, whyAsking: "Kids, in your life or not: I'm still learning where you stand.",
    options: [o("Yes, honoured", { family: 0.04 }), o("Yes, but I'm nervous", { family: 0.02 }), o("Suggest someone closer", {}), o("It makes me want my own", { kidsPlan: "yes" })] }) },
  { domain: "risk", build: (c) => ({ domains: ["risk"], prompt: `It's ${c.year}. A friend wants you to put $10,000 into their start-up.`, whyAsking: "How much are you willing to put on the line?",
    options: [o("All ten", { risk: 8, caution: -0.05 }), o("Two, as a gesture", { risk: 2 }), o("None. Friendship stays clean", { caution: 0.05 }), o("Offer my time instead", { drive: 0.03 })] }) },
  { domain: "achievement", build: (c) => ({ domains: ["achievement"], prompt: `It's ${c.year}. You're asked to speak at a conference in front of 400 people.`, whyAsking: "I'm learning what you want to be known for.",
    options: [o("Yes, terrified", { drive: 0.05 }), o("Yes, if I can co-present", { drive: 0.03 }), o("No, I'd rather do the work", { balance: 0.02 }), o("Pitch a different talk", { craft: 0.04 })] }) },
];

function o(label: string, effect: Effect): OptionDraft {
  return { label, hint: null, branchTitle: null, effect };
}

export function smallDecision(c: Ctx, domain: DomainKey): DecisionDraft {
  const pool = SMALL.filter((s) => s.domain === domain);
  const s = pool.length ? pick(c.r, pool) : pick(c.r, SMALL);
  const d = s.build(c);
  return { ...d, whyQuoteId: null, placeholder: "Or say what you'd actually do…" } as DecisionDraft;
}

// ---------------------------------------------------------------------------------------------
// Live settings (SPEC §5)
// ---------------------------------------------------------------------------------------------
export function settingsFor(t: Traj, quotes: Quote[], prev: LiveSetting[], extraPlaces: string[]): LiveSetting[] {
  const qid = (d: DomainKey) => (q(quotes, d) ? [q(quotes, d)!.id] : []);
  const keep = (id: string, fallback: string) => prev.find((s) => s.id === id)?.value ?? fallback;
  const focus = t.workKind === "creative" ? "craft" : t.family > 0.6 ? "people" : t.drive > 0.6 ? "career" : t.balance > 0.6 ? "rest" : "career";
  const places = [...new Set([t.place, ...extraPlaces])].slice(0, 4);
  const out: LiveSetting[] = [
    { id: "focus", type: "chips", label: "What you're focusing on", hint: "Shifts where your time goes from next year.", multi: false, leftLabel: null, rightLabel: null,
      options: [{ value: "career", label: "Career" }, { value: "people", label: "People" }, { value: "craft", label: cap(t.craftNoun === "work" ? "Side project" : t.craftNoun) }, { value: "rest", label: "Rest" }],
      value: keep("focus", focus), sourceQuoteIds: qid("career") },
    { id: "invest", type: "select", label: "How you invest", hint: "Changes how your savings grow, and how hard a downturn hits.", multi: false, leftLabel: null, rightLabel: null,
      options: [{ value: "cash", label: "Cash in savings" }, { value: "index", label: "Index funds" }, { value: "property", label: "Property" }, { value: "business", label: "Your own business" }],
      value: keep("invest", t.invest), sourceQuoteIds: qid("wealth") },
    { id: "balance", type: "slider", label: "Work–life balance", hint: "More work earns more; more life sleeps better.", multi: false, leftLabel: "All work", rightLabel: "All life", options: [],
      value: keep("balance", String(Math.round(t.balance * 100))), sourceQuoteIds: qid("mentalHealth") },
    { id: "place", type: "select", label: "Where you live", hint: "A move takes effect next year.", multi: false, leftLabel: null, rightLabel: null,
      options: places.map((p) => ({ value: p, label: p })), value: t.place, sourceQuoteIds: qid("risk") },
    { id: "family", type: "toggle", label: `Saying yes to ${t.parent === "your parents" ? "family" : t.parent}`, hint: "Family asks get a yes by default.", multi: false, leftLabel: null, rightLabel: null, options: [],
      value: keep("family", String(t.family > 0.5)), sourceQuoteIds: qid("family") },
  ];
  return out;
}

export function nudgeEffect(id: string, to: string, t: Traj): Effect {
  switch (id) {
    case "focus":
      return to === "career" ? { drive: 0.15, balance: -0.05 } : to === "people" ? { family: 0.15, balance: 0.05 } : to === "craft" ? { craft: 0.18 } : { balance: 0.18, drive: -0.08 };
    case "invest":
      return { invest: to as Traj["invest"] };
    case "balance":
      return { balance: Number(to) / 100 - t.balance, drive: (t.balance - Number(to) / 100) * 0.5 };
    case "family":
      return to === "true" ? { family: 0.15 } : { family: -0.12 };
    case "place": {
      const city = to.split(",")[0]!.trim();
      const k = KNOWN_PLACES[city.toLowerCase()];
      return { move: { city, region: k?.region ?? to.split(",")[1]?.trim() ?? null, country: k?.country ?? "US", far: !!k && k.country !== "US" } };
    }
  }
  return {};
}

export function nudgeLine(id: string, label: string, toLabel: string, age: number): string {
  switch (id) {
    case "focus":
      return `At ${age} you shift your focus to ${toLabel.toLowerCase()}.`;
    case "invest":
      return `At ${age} you move your savings into ${toLabel.toLowerCase()}.`;
    case "balance":
      return `At ${age} you rebalance: ${toLabel}.`;
    case "place":
      return `At ${age} you decide to move to ${toLabel}.`;
    case "family":
      return toLabel === "On" ? `At ${age} you start saying yes to family first.` : `At ${age} you start protecting your own time.`;
  }
  return `At ${age} you change ${label.toLowerCase()} to ${toLabel}.`;
}

// ---------------------------------------------------------------------------------------------
// Endings, five-year answers, future selves
// ---------------------------------------------------------------------------------------------
export function verdictFor(t: Traj, r: Rng, used: Set<string> = new Set()): string {
  const lines: string[] = [];
  if (t.workKind === "creative" || t.craft > 0.6) lines.push("You made things, and some of them outlived the doubt.", `More ${t.craftNoun} than money. You'd sign up again.`);
  if (t.farFromHome) lines.push("Further from home than you planned, and closer to yourself.", `${t.city} became home somewhere around year five.`);
  if (t.kids.length > 1) lines.push("A loud house, a full table, and people who stayed.");
  if (t.kids.length === 1) lines.push("One child, a thousand Saturdays, no regrets about the sleep.");
  if (t.caution > 0.7) lines.push("Safe and solid, with a few doors you never opened.", "Nothing fell through. A few things never got tried.");
  if (t.drive > 0.7) lines.push("Louder than you planned. You'd tell yourself to rest more.", "You got to the top floor and found you liked the stairs better.");
  if (t.balance > 0.65) lines.push("Quieter than you planned, and mostly on your own terms.", "Long mornings, short commutes, enough.");
  if (t.workKind === "founder") lines.push("Your name on the door. It cost sleep, and it was yours.");
  if (t.workKind === "teacher") lines.push("Hundreds of students, and a few who still write.");
  if (t.caring) lines.push("You showed up for family when it counted.");
  if (t.partner === "married" && t.partnerName && t.partnerName !== "your partner") lines.push(`${t.partnerName} is still the first person you tell things.`);
  lines.push("Steady, and quieter than you planned.", "Not the life you pictured at the start. A good one anyway.");
  const fresh = lines.filter((l) => !used.has(l));
  const pool = fresh.length ? fresh : lines;
  const v = pool[Math.floor(r() * Math.min(pool.length, 3))]!;
  used.add(v);
  return v;
}

const PAST: [RegExp, string][] = [
  [/^You meet /, "I've met "], [/^You marry /, "I've married "], [/^You launch /, "I've launched "], [/^You land in /, "I've landed in "],
  [/^You hand in your notice/, "I've handed in my notice"], [/^You start /, "I've started "], [/^You graduate/, "I've graduated"],
  [/^Your first child is born/, "I've become a parent"], [/^Your /, "my "], [/^Promoted to /, "I've been promoted to "], [/^A new job/, "I've got a new job"],
  [/^Keys to a place of your own/, "I've got keys to a place of my own"], [/^The raise comes through/, "the raise has come through"],
  [/^You move in together/, "we've moved in together"], [/ moves in$/, " has moved in"],
];
const toFirstPerson = (title: string) => {
  for (const [re, to] of PAST) if (re.test(title)) return title.replace(re, to);
  return lowerFirst(title);
};

function doing(work: string): string {
  if (work === "Retired") return "finally retired";
  if (/^(Working|Running|Teaching|Making|Starting|Student)/.test(work)) return lowerFirst(work);
  const w = lowerFirst(work);
  return `working as ${/^[aeiou]/i.test(w) ? "an" : "a"} ${w}`;
}

export function fiveYearFor(name: string, startYear: number, years: { year: number; age: number; place: string; summary: string; events: { title: string; category: string }[] }[], t: Traj, quotes: Quote[]): string {
  const span = years.filter((y) => y.year > startYear && y.year <= startYear + 5);
  const end = span[span.length - 1] ?? years[years.length - 1];
  const milestones = span.flatMap((y) => y.events.filter((e) => e.category !== "texture").map((e) => toFirstPerson(e.title))).slice(0, 2);
  const youSaid = quotes[quotes.length - 1] ?? quotes[0];
  const place = end?.place ?? t.place;
  const parts = [
    `In five years I see myself in ${place}, ${doing(t.work)}.`,
    milestones.length ? `By then ${milestones.join(", and ")}.` : "It won't look dramatic from the outside, and that's on purpose.",
    youSaid ? `Not long ago I said “${youSaid.shortForm ?? shortOf(youSaid.text, 12)}” I'm building toward the version of me who doesn't have to say that anymore.` : "",
    `That's my honest answer${name ? `, from ${name}` : ""}.`,
  ];
  return parts.filter(Boolean).join(" ");
}

export function replyFrom(opts: { life: string; title: string; age: number; nowAge: number; t: Traj; year: { place: string; summary: string } | null; quotes: Quote[]; text: string; letter: boolean; name: string }): string {
  const { age, nowAge, t, year, quotes, text, letter, name, title } = opts;
  const youSaid = quotes.find((x) => tagQuote(x.text).some((d) => tagQuote(text).includes(d))) ?? quotes[quotes.length - 1];
  const where = year?.place ?? t.place;
  const people = [t.partner !== "none" && t.partnerName ? t.partnerName : null, t.kids.length ? (t.kids.length > 1 ? "the kids" : "our kid") : null].filter(Boolean).join(" and ");
  if (letter) {
    return [
      `Dear ${name},`,
      `I'm writing from ${where}. I'm ${age}. ${year?.summary ?? ""}`.trim(),
      youSaid ? `You once said “${youSaid.shortForm ?? shortOf(youSaid.text, 12)}” I remember the exact chair you were sitting in. It turned out to matter less, and differently, than you feared.` : "",
      people ? `${cap(people)} ${people.includes(" and ") ? "are" : "is"} the best part of most days.` : "Most days are quieter than you'd guess, and I like them.",
      title !== "Your life" ? `This is the life where you chose “${title}”. It isn't better or worse than yours. It's just the one I got.` : "",
      `If I could hand you one thing at ${nowAge}, it's this: decide the small things faster, and the big things slower.`,
      `With love, and a bit more patience than you have now,\n${name}, at ${age}`,
    ].filter(Boolean).join("\n\n");
  }
  const opener = /\?$/.test(text.trim()) ? "Honestly?" : "I hear you.";
  return `${opener} At ${age}, in ${where}, ${lowerFirst(year?.summary ?? "life is steadier than you'd think")} ${youSaid ? `You still sound like the person who said “${youSaid.shortForm ?? shortOf(youSaid.text, 10)}”.` : ""} What I'd tell you: you don't have to solve it all this year. Pick the next right thing.`;
}

export function interludeCaption(title: string, summary: string, age: number): string {
  const line = summary.replace(/\.$/, "");
  return `${title}. ${cap(line)}${/, at \d+$/.test(line) ? "" : `, at ${age}`}.`;
}

export const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string) => (s && !/^(I|Mom|Dad|[A-Z][a-z]+ [A-Z])/.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

export function decisionKindLabel(k: DecisionKind): string {
  return k === "big" ? "Splits your life" : "Small, won't stop the clock";
}
