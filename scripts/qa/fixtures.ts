/**
 * The final QA pass's exact failures (Sat Nov 7), rebuilt as code fixtures: a profile, the years a
 * life had written, the forks taken, and the card that was shown. Code only (no model): each case
 * says which checks must fire, and a sound card for the same moment must pass clean.
 */
import { DOMAIN_KEYS } from "../../shared/domains";
import type { Profile, Quote } from "../../shared/schema";
import type { Decision, DecisionAnswer, SessionState, SimYear, StartInput } from "../../shared/sim";
import { emptyProfile } from "../../worker/engine/profile";

export const TODAY = new Date("2026-11-07T14:30:00Z");

export function profileOf(input: Pick<StartInput, "firstName" | "age" | "city" | "region" | "country" | "line">, extra: Partial<Profile> = {}): Profile {
  const quotes: Quote[] = input.line ? [{ id: "q1", text: input.line, questionId: "start", source: "answer", shortForm: input.line.slice(0, 60) }] : [];
  const base = emptyProfile(
    { ...input, via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: null } as StartInput,
    2026,
    `s_qa_${input.firstName.toLowerCase()}`,
    quotes,
    TODAY.toISOString(),
  );
  return { ...base, ...extra, facts: [...base.facts, ...(extra.facts ?? [])], quotes: [...base.quotes, ...(extra.quotes ?? [])] };
}

export function year(p: Profile, y: number, place: string, work: string, opts: { ch?: string[]; summary?: string } = {}): SimYear {
  return {
    year: y,
    age: y - p.birthYear,
    place,
    summary: opts.summary ?? `${y}: an ordinary year of ${work.toLowerCase()}.`,
    states: Object.fromEntries(DOMAIN_KEYS.map((d) => [d, 50])) as SimYear["states"],
    money: { income: 60000, netWorth: 20000 },
    events: [],
    scene: {
      setting: "city_midrise", flavor: "us_midwest", placeLabel: place, home: "apartment", activity: "office_work",
      people: [{ role: "self", ageBand: "adult" }], season: "autumn", timeOfDay: "day", weather: "clear", mood: "calm", moment: null, caption: "",
    },
    decisionIds: [],
    life: { work, ch: opts.ch ?? [], people: [] },
  };
}

export function card(id: string, y: number, age: number, prompt: string, options: [string, string][], domains: Decision["domains"] = ["career"]): Decision {
  return {
    id, kind: "big", year: y, age, domains, prompt, whyAsking: "This is one of the moments a life turns on.", whyQuoteId: null,
    options: options.map(([label, title], i) => ({ id: "abcd"[i]!, label, hint: null, branchTitle: title })),
    placeholder: "", status: "pending",
  };
}

export function answered(d: Decision, optionId: string | null, text: string | null = null): { d: Decision; a: DecisionAnswer } {
  return { d: { ...d, status: "answered" }, a: { decisionId: d.id, optionId, text, via: text ? "text" : "tap", quoteId: null, answeredAt: TODAY.toISOString() } };
}

export function stateOf(profile: Profile, years: SimYear[], forks: { d: Decision; a: DecisionAnswer }[], pending: Decision[] = []): SessionState {
  return {
    sessionId: profile.sessionId, phase: "playing", speed: "auto", profile, appearance: null, portraits: [], settings: [], nudges: [],
    decisions: [...forks.map((f) => f.d), ...pending], answers: forks.map((f) => f.a), years, playhead: { year: years.at(-1)?.year ?? profile.startYear, age: 0, paused: false },
    branches: [], log: [], status: null, budgets: { smallLeft: 0, bigLeft: 5 }, endAge: 70, verdictAtEnd: null, updatedAt: TODAY.toISOString(),
  };
}

export interface ForkCase {
  name: string;
  state: SessionState;
  bad: Decision;
  /** Issue kinds that must fire on the QA card (at least one of each listed). */
  expect: string[];
  /** A sound card for the same moment: must pass with no issues. */
  good: Decision;
}

// ---------------------------------------------------------------------------------------------
// Sam, 22, Chicago, minimal start line
// ---------------------------------------------------------------------------------------------
const sam = profileOf(
  { firstName: "Sam", age: 22, city: "Chicago", region: "IL", country: "US", line: "idk, stressed about jobs" },
  {
    people: [{ id: "p1", label: "my parents", relation: "parents", closeness: 0.7, influence: 0.7, expectation: "a steady office job", quoteIds: [] }],
    facts: [{ id: "f2", key: "occupation", label: "Work", value: "Between jobs", source: "answer", quoteIds: [], confidence: 0.8 }],
  },
);
const samFork1 = card("d-22-1", 2026, 22, "It's November 2026 in Chicago. Your parents ask if you've applied for the admin job yet. Do you take it or hold out for UX?", [
  ["Take the stable office job in Chicago", "Take the office job"],
  ["Turn down the office job and push UX", "Commit to UX"],
  ["Apply to both and let whoever hires first win", "Let the market decide"],
  ["Start the independent studio from scratch instead", "Build your own studio"],
]);
const samYears27 = [
  year(sam, 2026, "Chicago, IL", "Between jobs"),
  year(sam, 2027, "Chicago, IL", "Junior product designer, small agency"),
  year(sam, 2028, "Chicago, IL", "Junior product designer, small agency"),
  year(sam, 2029, "Chicago, IL", "Product Designer, mid-size firm", { summary: "You move to a River North software firm, designing core product features." }),
  year(sam, 2030, "Chicago, IL", "Product Designer, mid-size firm"),
  year(sam, 2031, "Chicago, IL", "Product Designer, mid-size firm"),
];
const samFork2Bad = card("d-27-1", 2031, 27, "It is 2031 in Chicago. A corporate operations desk offers steady pay, while a junior UX contract opens at an agency. Which do you take?", [
  ["Take the agency UX contract and keep freelancing", "The agency contract"],
  ["Take the steady corporate operations desk", "The stable desk"],
  ["Move to a tech hub for full-time product design", "The product leap"],
  ["Start your own tiny independent design studio from scratch", "Independent studio"],
]);
const samFork2Good = card("d-27-1", 2031, 27, "It's 2031. Your firm wants you to lead the design of its new payments app, and a Chicago agency wants you as a senior designer. What do you do?", [
  ["Lead the payments app at the firm", "Lead the payments app"],
  ["Join the agency as a senior designer", "Senior at the agency"],
  ["Go freelance with two of the firm's clients", "Go freelance"],
  ["Take six months off to travel and draw", "Six months off"],
]);

const samYears32 = [
  ...samYears27,
  year(sam, 2032, "Chicago, IL", "Product Designer, mid-size firm"),
  year(sam, 2033, "San Francisco, CA", "Product designer, tech startup", { summary: "You move to San Francisco for a startup design job." }),
  year(sam, 2034, "San Francisco, CA", "Senior Product Designer, tech startup"),
  year(sam, 2035, "San Francisco, CA", "Senior Product Designer, tech startup"),
  year(sam, 2036, "San Francisco, CA", "Senior Product Designer, tech startup"),
];
const samFork2Done = answered({ ...samFork2Good, id: "d-27-1" }, "c");
const samFork3Bad = card("d-32-1", 2036, 32, "It's 2036 in Chicago. You turn 32 this year. Your firm offers a comfortable lead designer track, but your old dream of an independent studio resurfaces. What do you do?", [
  ["Take the lead product designer promotion at the firm", "Lead product designer"],
  ["Turn down the promotion and launch an independent studio", "Launch the studio"],
  ["Keep your current designer seat without the added pressure", "Keep the seat"],
  ["Cut to four days weekly to test freelance clients", "Carve out time"],
]);
const samFork3Good = card("d-32-1", 2036, 32, "It's 2036 in San Francisco. Your startup offers you the lead designer track, and an old Chicago friend wants a co-founder for a design tools company. What do you do?", [
  ["Take the lead designer track at the startup", "Lead designer"],
  ["Co-found the design tools company", "Co-found"],
  ["Ask for a four-day week to paint again", "Four-day week"],
  ["Take a year to teach design at a community college", "Teach a year"],
]);

// ---------------------------------------------------------------------------------------------
// Chidi, 34, Lagos, engineer, partner + toddler, naira
// ---------------------------------------------------------------------------------------------
const chidi = profileOf(
  {
    firstName: "Chidi", age: 34, city: "Lagos", region: null, country: "NG",
    line: "I'm a software engineer at a bank in Lagos, ₦600k a month. Fifty-hour weeks and three hours of traffic. A UK company offered me a remote role, and I keep sketching a fintech of my own. Ada and our daughter Zara (2) come first.",
  },
  {
    people: [
      { id: "p1", label: "Ada", relation: "partner", closeness: 0.9, influence: 0.8, expectation: null, quoteIds: ["q1"] },
      { id: "p2", label: "Zara", relation: "daughter", closeness: 0.9, influence: 0.5, expectation: null, quoteIds: ["q1"] },
    ],
    facts: [{ id: "f2", key: "occupation", label: "Work", value: "Software engineer at a bank", source: "answer", quoteIds: ["q1"], confidence: 0.9 }],
  },
);
const chidiFork1 = card("d-34-1", 2026, 34, "It's November 2026 on Victoria Island. Fifty-hour bank weeks and three hours of Lagos traffic leave you exhausted. Do you take a UK remote job or start your own fintech?", [
  ["Launch your own fintech startup in Lagos now", "Found your fintech"],
  ["Take the UK remote engineering role for foreign currency", "Take UK remote role"],
  ["Quit the bank and code your fintech full-time", "Build full-time"],
  ["Stay at the bank, keep the steady monthly salary", "Stay at the bank"],
], ["career", "wealth"]);
const chidiFork1Good = card("d-34-1", 2026, 34, "It's November 2026 on Victoria Island. Fifty-hour bank weeks and three hours of Lagos traffic leave you exhausted. Do you take a UK remote job or start your own fintech?", [
  ["Launch your own fintech startup in Lagos now", "Found your fintech"],
  ["Take the UK remote engineering role for foreign currency", "Take UK remote role"],
  ["Stay at the bank and build the fintech on weekends", "Bank and weekends"],
  ["Ask the bank for a transfer to Abuja, closer to family", "Move to Abuja"],
], ["career", "wealth"]);
const chidiYears37 = [
  year(chidi, 2026, "Lagos, NG", "Software engineer at a bank"),
  year(chidi, 2027, "Lagos, NG", "Remote engineer for a UK fintech"),
  year(chidi, 2028, "Lagos, NG", "Remote engineer for a UK fintech"),
  year(chidi, 2029, "Lagos, NG", "Remote engineer for a UK fintech"),
];
const chidiFork1Done = answered(chidiFork1, "b");
const chidiFork2Bad = card("d-37-1", 2029, 37, "It's 2029 in Lagos. A London firm offers you a two-year UK contract, and the bank wants you back as a team lead. Which way do you go?", [
  ["Take the UK contract and move the family", "Take the UK contract"],
  ["Stay at the bank as team lead", "Stay at the bank"],
  ["Go full-time on your own fintech", "Build the fintech"],
  ["Take a slower year with Ada and Zara", "A slower year"],
]);
const chidiFork2Good = card("d-37-1", 2029, 37, "It's 2029 in Lagos. Your UK employer wants you to lead a new payments team, and your fintech sketches have a first paying client. Which way do you go?", [
  ["Lead the new payments team for the UK employer", "Lead the team"],
  ["Go full-time on your own fintech", "Build the fintech"],
  ["Keep the remote role and hire one engineer for the fintech", "Hire for the fintech"],
  ["Cut to four days to be home for Zara's school runs", "Four days"],
]);
// typed at 37 without tapping (item 2), then the fork at 47 founded the academy
const chidiFork2Typed = answered(card("d-37-1", 2029, 37, "It's 2029 in Lagos. The fintech has its first paying client. Do you go all in?", [
  ["Quit the bank to build the Lagos fintech full-time", "Build it full-time"],
  ["Sell the fintech's first client to a bigger firm", "Sell the client"],
  ["Hand the fintech to a co-founder and step back", "Step back"],
  ["Move the family to London and close the fintech", "London, no fintech"],
]), null, "I keep the UK job and build the fintech on weekends");
const chidiFork3 = answered(card("d-47-1", 2039, 47, "It's 2039. Lagos teenagers keep asking you to teach them to code. What do you do with that?", [
  ["Start a coding academy in Lagos", "Found the academy"],
  ["Mentor a few students on weekends", "Mentor on weekends"],
  ["Fund scholarships at an existing school", "Fund scholarships"],
  ["Say no and focus on your work", "Say no"],
]), "a");
const chidiYears49 = [
  ...chidiYears37,
  ...[2030, 2031, 2032, 2033, 2034, 2035, 2036, 2037, 2038, 2039].map((y) => year(chidi, y, "Lagos, NG", "Remote engineer for a UK fintech")),
  year(chidi, 2040, "Lagos, NG", "Founder, Lagos coding academy", { summary: "The academy opens with forty students." }),
  year(chidi, 2041, "Lagos, NG", "Founder, Lagos coding academy"),
];
const chidiFork4Bad = card("d-49-1", 2041, 49, "It's 2041. A Lagos bank wants a CTO, and a Nairobi fintech wants you to head its engineering. Which way do you go?", [
  ["Take the CTO job at the bank", "Bank CTO"],
  ["Move to Nairobi to head engineering", "Nairobi"],
  ["Consult for both, part-time", "Consult for both"],
  ["Take a year off with Ada and Zara", "A year off"],
]);
const chidiFork4Good = card("d-49-1", 2041, 49, "It's 2041. The academy has a waiting list of 400, and a Nairobi fintech wants to fund a second campus. Which way do you go?", [
  ["Open a second academy campus in Nairobi", "Second campus"],
  ["Keep the academy small and teach more yourself", "Stay small"],
  ["Hand the academy to your head teacher and rest", "Hand it over"],
  ["Partner with a bank to hire every graduate", "Bank partnership"],
]);

// ---------------------------------------------------------------------------------------------
// Margo, 41, Toronto, teacher (rich AI export): consecutive forks repeating the sabbatical
// ---------------------------------------------------------------------------------------------
const margo = profileOf(
  { firstName: "Margo", age: 41, city: "Toronto", region: "ON", country: "CA", line: "" },
  {
    people: [
      { id: "p1", label: "Dev", relation: "partner", closeness: 0.9, influence: 0.7, expectation: null, quoteIds: [] },
      { id: "p2", label: "Theo", relation: "son", closeness: 0.95, influence: 0.6, expectation: null, quoteIds: [] },
    ],
    facts: [{ id: "f2", key: "occupation", label: "Work", value: "Grade 7/8 science teacher in East York, 14 years", source: "upload", quoteIds: [], confidence: 0.8 }],
  },
);
const margoFork1 = answered(card("d-41-1", 2026, 41, "It's November 2026 in Toronto. An ed-tech curriculum startup makes an offer, while your Grade 8 classroom waits on Monday. Do you leave teaching?", [
  ["Keep teaching, but take contract curriculum work on evenings", "Teach and moonlight"],
  ["Take a self-funded sabbatical to travel and build games", "Take the year off"],
  ["Take the startup offer and leave teaching now", "Take the ed-tech leap"],
  ["Stay in your classroom and finish the school year", "Finish the school year"],
]), "a");
const margoYears = [2026, 2027, 2028].map((y) => year(margo, y, "Toronto, ON", "Grade 7/8 science teacher, East York"));
const margoFork2Bad = card("d-43-1", 2028, 43, "It's 2028 in Toronto. Your evening curriculum work has a waiting client list. What's next?", [
  ["Apply for a department head role", "Department head"],
  ["Take a year off to travel to Nigeria and Sweden with Theo and Dev", "The family year abroad"],
  ["Turn the curriculum work into a small company", "Curriculum company"],
  ["Drop the evening work and protect your summers", "Protect summers"],
]);
const margoFork2Good = card("d-43-1", 2028, 43, "It's 2028 in Toronto. Your evening curriculum work has a waiting client list. What's next?", [
  ["Apply for a department head role", "Department head"],
  ["Turn the curriculum work into a small company", "Curriculum company"],
  ["Drop the evening work and protect your summers", "Protect summers"],
  ["Coach the robotics club to the provincial finals", "Robotics finals"],
]);

export const FORK_CASES: ForkCase[] = [
  { name: "Sam at 27: junior UX contract after 5 years as a product designer, fork 1 again", state: stateOf(sam, samYears27, [answered(samFork1, "b")], [samFork2Bad]), bad: samFork2Bad, expect: ["work_stage", "repeat_topic"], good: samFork2Good },
  { name: "Sam at 32: 'in Chicago' while living in San Francisco", state: stateOf(sam, samYears32, [answered(samFork1, "b"), samFork2Done], [samFork3Bad]), bad: samFork3Bad, expect: ["place"], good: samFork3Good },
  { name: "Chidi at 34: two options are the same choice (fintech now / fintech full-time)", state: stateOf(chidi, [year(chidi, 2026, "Lagos, NG", "Software engineer at a bank")], [], [chidiFork1]), bad: chidiFork1, expect: ["same_options"], good: chidiFork1Good },
  { name: "Chidi at 37: 'take the UK contract / stay at the bank' after taking the UK job at 34", state: stateOf(chidi, chidiYears37, [chidiFork1Done], [chidiFork2Bad]), bad: chidiFork2Bad, expect: ["repeat_chosen", "left_behind"], good: chidiFork2Good },
  { name: "Chidi at 49: a work fork that ignores the academy he founded at 47", state: stateOf(chidi, chidiYears49, [chidiFork1Done, chidiFork2Typed, chidiFork3], [chidiFork4Bad]), bad: chidiFork4Bad, expect: ["ignores_now"], good: chidiFork4Good },
  { name: "Margo at 43: the sabbatical abroad again, one fork later", state: stateOf(margo, margoYears, [margoFork1], [margoFork2Bad]), bad: margoFork2Bad, expect: ["repeat_option"], good: margoFork2Good },
];

/** Item 2: answers in their own words. */
export const ANSWER_CASES: { name: string; d: Decision; optionId: string | null; text: string | null; own: boolean; title?: string; log?: string }[] = [
  { name: "typed without a tap (Chidi)", d: chidiFork2Typed.d, optionId: null, text: "I keep the UK job and build the fintech on weekends", own: true, title: "Keep the UK job", log: "Keep the UK job and build the fintech on weekends" },
  { name: "tapped 'quit to build full-time', typed the opposite", d: chidiFork2Typed.d, optionId: "a", text: "I keep the UK job and build the fintech on weekends", own: true },
  { name: "tapped and refined ('only if...')", d: chidiFork1, optionId: "d", text: "I'd stay, but only if they give me Fridays at home", own: false },
  { name: "tapped and said yes, and more", d: chidiFork1, optionId: "b", text: "Yes, and I'd keep building the fintech on weekends", own: false },
  { name: "tapped, then 'actually no'", d: chidiFork1, optionId: "a", text: "Actually no, I'd stay at the bank another year", own: true },
  { name: "a bare tap", d: chidiFork1, optionId: "c", text: null, own: false },
];

export const PROFILES = { sam, chidi, margo };
export { chidiFork2Typed, chidiYears49 };
