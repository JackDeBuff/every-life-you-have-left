/**
 * Builds shared/demo/alex.json from prototypes/PERSONA.md (hand-written, no AI calls).
 * Keyframes are interpolated so every year 2026→2071 has states and money.
 *   npx tsx scripts/demo/build-alex.ts && npm run check:demo
 */
import { writeFileSync } from "node:fs";
import type { BaseRateId } from "../../shared/baseRates";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import { ARCHETYPES, type LifeKey } from "../../shared/lives";
import type {
  DemoBundle, DomainStates, EventCategory, Life, LifeEvent, LifePlan, PauseQuestion, Profile, Quote, Year,
} from "../../shared/schema";

const BIRTH = 2001;
const START = 2026;
const END_AGE = 70;
const END = BIRTH + END_AGE;

// [year, career, wealth, achievement, family, relationships, children, mentalHealth, happiness, lifeGoals, risk, income, netWorth]
type K = [number, number, number, number, number, number, number, number, number, number, number, number, number];
type Ev = {
  year: number; domain: DomainKey; category: EventCategory; title: string; narrative: string;
  tp: boolean; quote: string | null; reason?: string; stat: BaseRateId | null; tone: "up" | "down" | "mixed";
};
interface Spec {
  key: LifeKey; title: string; tagline: string; verdict: string;
  keys: K[]; places: [number, string][]; events: Ev[]; textures: string[];
}

const ev = (
  year: number, domain: DomainKey, category: EventCategory, title: string, narrative: string,
  o: { tp?: boolean; quote?: string; reason?: string; stat?: BaseRateId; tone: Ev["tone"] },
): Ev => ({
  year, domain, category, title, narrative, tp: o.tp ?? false, quote: o.quote ?? null, reason: o.reason,
  stat: o.stat ?? null, tone: o.tone,
});

// ------------------------------------------------------------------------------------------
// Profile
// ------------------------------------------------------------------------------------------
const quotes: Quote[] = [
  { id: "q1", text: "I can't say no to my mom.", questionId: "fast.q3", source: "answer", shortForm: "I can't say no to my mom." },
  { id: "q2", text: "Money scares me. I still have $28k in loans.", questionId: "fast.q1", source: "answer", shortForm: "Money scares me." },
  { id: "q3", text: "If nobody judged me, I'd go to art school and draw for a living.", questionId: "fast.q5", source: "answer", shortForm: "I'd go to art school and draw for a living." },
  { id: "q4", text: "My biggest fear is waking up at 40 in the same cubicle.", questionId: "fast.q4", source: "answer", shortForm: "Waking up at 40 in the same cubicle." },
  { id: "q5", text: "Singapore offered me a transfer and I haven't answered.", questionId: "fast.q2", source: "answer", shortForm: "Singapore offered me a transfer." },
];

const profile: Profile = {
  sessionId: "demo_alex",
  profileVersion: 1,
  firstName: "Alex",
  age: START - BIRTH,
  birthYear: BIRTH,
  country: "US",
  region: "NC",
  city: "Durham",
  startYear: START,
  endAge: END_AGE,
  facts: [
    { id: "f1", key: "occupation", label: "Work", value: "Data analyst at a regional bank, 2 years", source: "answer", quoteIds: [], confidence: 0.9 },
    { id: "f2", key: "education", label: "Education", value: "College in Durham, graduated 2023", source: "answer", quoteIds: [], confidence: 0.8 },
    { id: "f3", key: "location", label: "Home", value: "Durham, NC since 2019", source: "answer", quoteIds: [], confidence: 0.9 },
    { id: "f4", key: "background", label: "Family", value: "Raised by a single mom, who lives 20 minutes away", source: "answer", quoteIds: ["q1"], confidence: 0.9 },
    { id: "f5", key: "interests", label: "Nights", value: "Paints at night", source: "answer", quoteIds: ["q3"], confidence: 0.8 },
    { id: "f6", key: "relationship", label: "Love", value: "Single", source: "inferred", quoteIds: [], confidence: 0.4 },
  ],
  values: [
    { id: "v1", label: "Loyalty", weight: 0.9, quoteIds: ["q1"] },
    { id: "v2", label: "Creativity", weight: 0.8, quoteIds: ["q3"] },
    { id: "v3", label: "Security", weight: 0.7, quoteIds: ["q2"] },
  ],
  fears: [
    { id: "x1", text: "Waking up at 40 in the same cubicle", kind: "boldness", quoteIds: ["q4"] },
    { id: "x2", text: "Not having enough money", kind: "foundation", quoteIds: ["q2"] },
  ],
  people: [
    { id: "p1", label: "Mom", relation: "mother", closeness: 0.9, influence: 0.9, expectation: "Stay close, keep a stable job", quoteIds: ["q1"] },
  ],
  constraints: [
    { id: "k1", kind: "debt", text: "$28k in student loans", personId: null, quoteIds: ["q2"] },
    { id: "k2", kind: "family_obligation", text: "Hard to say no to Mom", personId: "p1", quoteIds: ["q1"] },
  ],
  money: { feel: "tight", incomeUsd: 68000, debtUsd: 28000, debtKind: "student_loans", savingsUsd: 8000, supportsFamily: false, assumed: true },
  worries: {
    career: 0.85, wealth: 0.7, achievement: 0.4, family: 0.6, relationships: 0.3, children: 0.1,
    mentalHealth: 0.3, happiness: 0.3, lifeGoals: 0.6, risk: 0.2,
  },
  seeds: {
    path: { text: "Stays at the bank in Durham, near Mom", quoteIds: ["q1"] },
    leap: { text: "Says yes to the Singapore transfer", quoteIds: ["q5"] },
    careful: { text: "Lets money fear decide every fork: pay the loans, stay put", quoteIds: ["q2", "q4"] },
    unjudged: { text: "Goes to art school and draws for a living", quoteIds: ["q3"] },
  },
  quotes,
  assumptions: [
    { field: "money.incomeUsd", value: "68000", reason: "Typical for a bank data analyst in Durham; not asked" },
    { field: "relationship", value: "single", reason: "Not asked in the fast path" },
  ],
  knowMeScore: 35,
  updatedAt: "2026-11-07T14:06:00Z",
};

// ------------------------------------------------------------------------------------------
// The four lives
// ------------------------------------------------------------------------------------------
const START_K = (y = START): K => [y, 50, 30, 40, 70, 35, 50, 55, 52, 38, 20, 68000, -20000];

const path: Spec = {
  key: "path", title: "Durham, Steady", tagline: "You stay. Life arrives anyway.",
  verdict: "Steady, and quieter than you planned.",
  places: [[2026, "Durham, NC"]],
  keys: [
    START_K(),
    [2028, 50, 34, 41, 72, 36, 50, 52, 50, 35, 18, 71000, -10000],
    [2029, 52, 36, 42, 76, 36, 50, 50, 49, 30, 15, 73000, -4000],
    [2031, 62, 44, 52, 74, 40, 50, 56, 55, 36, 18, 86000, 20000],
    [2033, 63, 48, 53, 74, 62, 52, 60, 63, 40, 20, 90000, 45000],
    [2035, 64, 52, 54, 76, 78, 55, 63, 70, 42, 22, 95000, 75000],
    [2037, 62, 54, 55, 78, 76, 75, 58, 71, 40, 26, 101000, 105000],
    [2039, 60, 56, 55, 76, 72, 78, 48, 62, 36, 28, 106000, 140000],
    [2041, 40, 55, 45, 72, 62, 74, 26, 40, 30, 38, 108000, 150000],
    [2043, 60, 52, 55, 74, 70, 76, 55, 62, 55, 30, 72000, 165000],
    [2046, 62, 55, 58, 74, 72, 76, 58, 58, 58, 26, 76000, 215000],
    [2048, 62, 56, 58, 82, 70, 76, 50, 58, 58, 28, 80000, 250000],
    [2050, 63, 58, 60, 80, 72, 77, 56, 60, 62, 25, 83000, 290000],
    [2052, 64, 60, 64, 78, 74, 78, 62, 66, 68, 22, 86000, 340000],
    [2058, 64, 64, 65, 76, 76, 70, 65, 66, 70, 18, 90000, 470000],
    [2066, 55, 66, 64, 74, 80, 78, 70, 71, 72, 14, 32000, 660000],
    [2071, 50, 64, 64, 72, 80, 80, 70, 72, 72, 12, 30000, 700000],
  ],
  events: [
    ev(2029, "career", "career_move", "You turn down Singapore",
      "The offer comes around one last time. You don't even ask your mom; you already know her face. You write 'Not right now' and mean 'no'.",
      { tp: true, quote: "q1", reason: "You said you can't say no to your mom, so the transfer was never really a question.", tone: "mixed" }),
    ev(2031, "career", "career_move", "Promoted to senior analyst",
      "A bigger desk, a title on the email signature, and your own quarterly report. Your mom frames the announcement.",
      { tp: true, quote: "q4", reason: "Afraid of the same cubicle at 40, you take the step up when it comes.", stat: "tenure", tone: "up" }),
    ev(2032, "career", "world_context", "The downturn reaches the bank",
      "Hiring freezes, a round of layoffs two floors down. You keep your job and your head down.",
      { stat: "recessions", tone: "down" }),
    ev(2033, "relationships", "love_start", "You meet Sam",
      "A friend's birthday at a brewery off Rigsbee. Sam laughs at the wrong part of your story and you decide to tell it again.",
      { tp: true, quote: "q1", reason: "Staying in Durham, close to your mom, is how you end up at the same party as Sam.", tone: "up" }),
    ev(2035, "relationships", "marriage", "You marry Sam",
      "A small wedding at the gardens. Your mom sits in the front row and pretends she isn't crying.",
      { tp: true, quote: "q1", reason: "You wanted your mom in the front row, twenty minutes from home.", stat: "marriage_age", tone: "up" }),
    ev(2037, "children", "child", "Your first child",
      "Seven pounds, two ounces, and loud. Your mom becomes the weekday babysitter before anyone asks.",
      { tp: true, quote: "q1", reason: "You stayed close to family, so the help is twenty minutes away.", stat: "first_birth_age", tone: "up" }),
    ev(2041, "mentalHealth", "burnout", "The burnout year",
      "You are 40, in the same building, and tired in a way sleep doesn't fix. You take six weeks off and sit in the car before going in.",
      { tp: true, quote: "q4", reason: "You named this fear at 25: waking up at 40 in the same cubicle. For a while, it comes true.", stat: "stress_work", tone: "down" }),
    ev(2043, "career", "career_change", "You start teaching data",
      "Night classes at the community college: twelve adults learning pivot tables. Less money, more eye contact.",
      { tp: true, quote: "q4", reason: "You refuse to let the cubicle be the end of the story.", stat: "occ_switch", tone: "up" }),
    ev(2047, "happiness", "texture", "A flat stretch",
      "Nothing is wrong, exactly. The days are full and a little grey.",
      { stat: "happiness_u", tone: "mixed" }),
    ev(2048, "family", "caregiving", "Your mom moves in",
      "The spare room becomes her room. Her coffee mug lives by the sink now, and so does her opinion of your cooking.",
      { tp: true, quote: "q1", reason: "You can't say no to your mom, and this time you don't want to.", stat: "caregiving", tone: "mixed" }),
    ev(2052, "lifeGoals", "achievement", "You paint again",
      "Saturday mornings in the garage with the door open. The first canvas is bad. The fourth one you keep.",
      { tp: true, quote: "q3", reason: "Art school never happened, but drawing for yourself still can.", tone: "up" }),
    ev(2056, "relationships", "friendship", "Sunday dinners",
      "Three old friends from college start a standing Sunday dinner. Nobody cancels.",
      { stat: "close_friends", tone: "up" }),
    ev(2058, "children", "texture", "Your kid leaves home",
      "You carry the last box to the car and stand in the driveway longer than you need to.",
      { tone: "mixed" }),
    ev(2066, "career", "career_move", "You retire",
      "Your last class gives you a card with a pivot table drawn on it. You wait until the numbers say yes, and they do.",
      { tp: true, quote: "q2", reason: "You said money scares you, so you retire only when the numbers are sure.", stat: "retire_age", tone: "up" }),
  ],
  textures: [
    "A quiet year. Spreadsheets by day, a sketchbook on the nightstand.",
    "Sunday lunch at your mom's. She asks about work; you say it's fine.",
    "You repaint the bathroom and call it a creative project.",
    "A long weekend at the coast. Nobody checks email.",
    "School pickups, a slow cooker, an early night.",
    "You learn the names of every tree on your street.",
    "A good year, mostly. Nothing you'd put in a letter.",
    "A walk on the Eno most mornings.",
  ],
};

const pathAlt: Spec = {
  ...path,
  title: "Durham, With Color", tagline: "You stay, and you keep your weekends.",
  verdict: "Steady, with color in it.",
  keys: [
    ...path.keys.filter((k) => k[0] < 2031),
    [2031, 58, 43, 54, 74, 44, 50, 60, 58, 48, 18, 82000, 18000],
    [2033, 59, 46, 56, 74, 66, 52, 63, 66, 54, 20, 85000, 40000],
    [2035, 60, 50, 57, 76, 80, 55, 65, 72, 56, 22, 89000, 68000],
    [2037, 60, 52, 58, 78, 78, 76, 61, 72, 56, 26, 95000, 96000],
    [2039, 59, 54, 58, 76, 75, 78, 55, 66, 55, 26, 99000, 128000],
    [2041, 48, 53, 55, 72, 70, 75, 40, 52, 52, 32, 100000, 138000],
    [2043, 60, 51, 60, 74, 74, 77, 60, 66, 64, 28, 71000, 152000],
    [2044, 61, 52, 68, 74, 75, 77, 64, 70, 70, 28, 73000, 165000],
    [2048, 62, 55, 68, 82, 74, 76, 56, 64, 70, 28, 79000, 240000],
    [2052, 64, 58, 72, 78, 76, 78, 66, 70, 76, 22, 85000, 320000],
    [2058, 64, 62, 72, 76, 78, 70, 68, 70, 76, 18, 89000, 450000],
    [2066, 56, 64, 74, 74, 82, 78, 72, 76, 80, 14, 34000, 640000],
    [2071, 52, 62, 76, 72, 82, 80, 72, 78, 82, 12, 32000, 680000],
  ],
  events: [
    ...path.events.filter((e) => e.year < 2031),
    ev(2031, "lifeGoals", "achievement", "You protect the painting",
      "You say no to the team and yes to the Tuesday class. Your hands are blue to the wrist and you leave smiling.",
      { tp: true, quote: "q6", reason: "You said you'd protect the painting first.", tone: "up" }),
    ev(2032, "career", "world_context", "The downturn reaches the bank",
      "Hiring freezes, a round of layoffs two floors down. You keep your job; the Tuesday class keeps you.",
      { stat: "recessions", tone: "down" }),
    ev(2033, "relationships", "love_start", "You meet Sam at the class",
      "Sam takes the easel next to yours and steals your cobalt blue. You let it happen twice.",
      { tp: true, quote: "q6", reason: "The class you protected is where you meet Sam.", tone: "up" }),
    ...path.events.filter((e) => e.year >= 2035 && e.year < 2041),
    ev(2041, "mentalHealth", "burnout", "A hard year, softer",
      "Work grinds, and you are tired. But Tuesday nights are still yours, and they hold.",
      { tp: true, quote: "q4", reason: "The cubicle fear arrives at 40, but the painting softens it.", stat: "stress_work", tone: "down" }),
    ...path.events.filter((e) => e.year === 2043),
    ev(2044, "achievement", "achievement", "Your first small exhibition",
      "Six paintings in a cafe on Ninth Street. Someone you don't know buys the little one by the window. You keep the receipt.",
      { tp: true, quote: "q6", reason: "Thirteen years of Tuesdays, because you protected them.", tone: "up" }),
    ...path.events.filter((e) => e.year === 2048),
    ev(2052, "lifeGoals", "achievement", "You teach a Saturday painting class",
      "Eight beginners, a church basement, and a coffee urn. One of them reminds you of yourself at 30.",
      { tp: true, quote: "q6", reason: "The painting you protected becomes something you give away.", tone: "up" }),
    ...path.events.filter((e) => e.year > 2052),
  ],
};

const leap: Spec = {
  key: "leap", title: "The Singapore Years", tagline: "You said yes to Singapore.",
  verdict: "Louder than you planned.",
  places: [[2026, "Durham, NC"], [2027, "Singapore"], [2036, "Lisbon, Portugal"]],
  keys: [
    START_K(),
    [2027, 62, 34, 48, 56, 28, 50, 50, 55, 55, 65, 96000, -14000],
    [2029, 64, 40, 52, 50, 20, 50, 40, 44, 52, 58, 104000, 10000],
    [2030, 66, 44, 54, 52, 62, 50, 55, 62, 56, 55, 110000, 28000],
    [2032, 30, 36, 48, 52, 64, 50, 34, 40, 44, 82, 22000, 30000],
    [2033, 42, 32, 56, 54, 66, 50, 46, 56, 70, 76, 40000, 18000],
    [2036, 52, 36, 60, 50, 72, 50, 58, 66, 72, 62, 55000, 34000],
    [2040, 62, 42, 74, 50, 74, 48, 62, 70, 78, 58, 70000, 70000],
    [2045, 74, 48, 80, 50, 74, 46, 60, 66, 80, 70, 92000, 120000],
    [2048, 70, 46, 78, 48, 72, 46, 54, 58, 76, 66, 84000, 140000],
    [2052, 76, 58, 82, 48, 74, 46, 64, 66, 80, 52, 125000, 260000],
    [2058, 74, 62, 82, 56, 74, 46, 62, 64, 80, 46, 120000, 420000],
    [2066, 66, 66, 84, 50, 72, 46, 66, 70, 82, 36, 72000, 780000],
    [2071, 64, 66, 85, 50, 72, 45, 66, 70, 82, 34, 60000, 850000],
  ],
  events: [
    ev(2027, "career", "career_move", "You say yes to Singapore",
      "You tell your mom on a Sunday. She says 'okay' in the voice that means it isn't. Three weeks later you're on the 28th floor in Raffles Place.",
      { tp: true, quote: "q5", reason: "Singapore offered you a transfer and you hadn't answered. In this life, you answer yes.", stat: "jobs_by_age", tone: "mixed" }),
    ev(2028, "relationships", "texture", "The loneliest year",
      "You call your mom every Sunday; twelve time zones make it her Saturday night. You eat dinner at your desk more than you admit.",
      { quote: "q1", reason: "You can't say no to your mom, so you never miss the call, even at 7am.", stat: "loneliness", tone: "down" }),
    ev(2030, "relationships", "love_start", "You meet Ren",
      "Ren sits two desks over and corrects your Mandarin without being asked. Dinner turns into a habit.",
      { tp: true, quote: "q5", reason: "You'd never have met Ren in Durham; the transfer put you two desks apart.", tone: "up" }),
    ev(2032, "career", "job_loss", "Laid off in a restructuring",
      "The downturn hits all four of you, but only this you loses the job. The regional office is the first one cut.",
      { tp: true, quote: "q5", reason: "The office you moved across the world for is the first one closed.", stat: "displacement", tone: "down" }),
    ev(2033, "career", "career_change", "You start freelance illustration",
      "No job to lose and nobody watching. You post three drawings a week and land a hotel chain's menu art.",
      { tp: true, quote: "q3", reason: "You said you'd draw for a living if nobody judged. Out here, nobody is.", stat: "jobs_by_age", tone: "up" }),
    ev(2036, "lifeGoals", "move", "You move to Lisbon with Ren",
      "A fourth-floor walk-up in Graca with bad plumbing and a view of the river. Rent is half of Singapore.",
      { tp: true, quote: "q4", reason: "Your fear was the same cubicle at 40. You make sure there isn't one.", stat: "moving", tone: "up" }),
    ev(2038, "family", "texture", "Your mom visits Lisbon",
      "Two weeks, a suitcase of hot sauce, one argument about when you're coming home.",
      { quote: "q1", reason: "You couldn't say no to her, so you said 'come here' instead.", tone: "mixed" }),
    ev(2040, "achievement", "achievement", "Your first show",
      "Forty drawings in a gallery in Principe Real. Your mom watches the opening on a video call at 3pm her time.",
      { tp: true, quote: "q3", reason: "Drawing for a living stopped being an 'if'.", tone: "up" }),
    ev(2045, "career", "career_change", "You open a studio",
      "Three illustrators, one long table, and a lease you read four times. You sign it anyway.",
      { tp: true, quote: "q5", reason: "The yes you said to Singapore keeps compounding: you say yes again.", stat: "biz_survival", tone: "mixed" }),
    ev(2049, "happiness", "texture", "A lean, flat year",
      "Two clients leave, the studio scrapes by, and you are 48 and tired of being brave.",
      { stat: "happiness_u", tone: "down" }),
    ev(2052, "wealth", "money_up", "The studio turns a real profit",
      "A publisher signs the studio for a six-book series. For the first time, the accounts don't scare you.",
      { tp: true, quote: "q2", reason: "You said money scared you. Twenty-five years later, the numbers finally hold still.", stat: "earnings_growth", tone: "up" }),
    ev(2058, "family", "caregiving", "Three months home with your mom",
      "You fly back to Durham to help after her hip surgery. Her kitchen, her rules, your old bedroom.",
      { tp: true, quote: "q1", reason: "You can't say no to your mom, even from Lisbon.", stat: "caregiving", tone: "mixed" }),
    ev(2066, "relationships", "friendship", "Ren's friends become yours",
      "The Thursday dinner crowd turns out to be your people too. You stop calling it 'Ren's dinner'.",
      { stat: "close_friends", tone: "up" }),
    ev(2069, "achievement", "texture", "A retrospective in Porto",
      "Forty years of drawings on one wall. You find the first Singapore sketch and laugh at how sure you look.",
      { tone: "up" }),
  ],
  textures: [
    "A quiet year. Monsoon afternoons, deadline nights.",
    "You learn to cook rendang badly and then well.",
    "A long Sunday call with your mom; she sounds older.",
    "Work, the river, a lot of coffee. A good year.",
    "You sketch strangers on the 28 tram.",
    "A summer of small commissions and long walks.",
    "Nothing big happens. You're grateful.",
  ],
};

const careful: Spec = {
  key: "careful", title: "The Safe Ladder", tagline: "Fear decides, and it decides well on paper.",
  verdict: "Safe, and you know exactly what it cost.",
  places: [[2026, "Durham, NC"], [2036, "Cary, NC"]],
  keys: [
    START_K(),
    [2027, 52, 34, 40, 72, 34, 50, 56, 50, 30, 10, 70000, -12000],
    [2030, 56, 48, 44, 72, 40, 50, 58, 54, 30, 8, 78000, 15000],
    [2031, 58, 50, 45, 72, 60, 50, 60, 60, 30, 8, 82000, 30000],
    [2033, 60, 54, 46, 74, 74, 50, 62, 66, 30, 8, 86000, 60000],
    [2035, 66, 60, 52, 74, 72, 50, 60, 63, 30, 8, 102000, 105000],
    [2036, 66, 64, 52, 74, 72, 48, 60, 64, 30, 14, 104000, 120000],
    [2039, 64, 64, 52, 70, 28, 44, 38, 36, 26, 14, 118000, 190000],
    [2040, 58, 62, 50, 70, 26, 42, 30, 34, 24, 14, 120000, 200000],
    [2042, 62, 64, 52, 70, 34, 42, 36, 40, 26, 12, 130000, 260000],
    [2045, 80, 72, 64, 70, 40, 42, 50, 48, 28, 10, 185000, 520000],
    [2048, 80, 76, 64, 70, 42, 40, 52, 46, 26, 10, 195000, 760000],
    [2050, 80, 78, 64, 70, 56, 40, 60, 56, 30, 10, 200000, 920000],
    [2053, 78, 82, 64, 74, 58, 40, 56, 56, 30, 10, 205000, 1180000],
    [2063, 70, 90, 62, 70, 58, 38, 62, 58, 32, 8, 70000, 2300000],
    [2071, 68, 92, 62, 68, 56, 38, 62, 58, 34, 8, 62000, 2600000],
  ],
  events: [
    ev(2027, "career", "career_move", "You say no to Singapore, fast",
      "You reply the same afternoon. A move abroad with $28k in loans feels like stepping off a roof.",
      { tp: true, quote: "q2", reason: "You said money scares you. Fear answers before you do.", tone: "mixed" }),
    ev(2030, "wealth", "money_up", "The loans are gone",
      "The last $412 payment goes through on a Tuesday. You check the balance three times.",
      { tp: true, quote: "q2", reason: "Every spare dollar went to the $28k you said scared you.", tone: "up" }),
    ev(2031, "relationships", "love_start", "You meet Jordan",
      "Jordan has a 401(k) match and a five-year plan. Your mom approves at first sight.",
      { tp: true, quote: "q1", reason: "You can't say no to your mom, and she says yes to Jordan.", tone: "up" }),
    ev(2032, "career", "world_context", "The downturn: you keep your head down",
      "Layoffs two floors down. You volunteer for nothing and keep your job.",
      { stat: "recessions", tone: "down" }),
    ev(2033, "relationships", "marriage", "You marry Jordan",
      "A sensible wedding with a sensible budget. It is a lovely day.",
      { tp: true, quote: "q1", reason: "The steady choice, the one your mom hoped for.", stat: "marriage_age", tone: "up" }),
    ev(2035, "career", "career_move", "Promoted, then promoted again",
      "Two titles in eighteen months. Your cubicle becomes an office with a door.",
      { tp: true, quote: "q4", reason: "Afraid of the same cubicle at 40, you trade it for a slightly bigger one.", stat: "tenure", tone: "up" }),
    ev(2036, "wealth", "home", "You buy a house at 35",
      "Three bedrooms in Cary, twenty minutes from your mom. You pick the paint colors from a list called 'resale'.",
      { tp: true, quote: "q2", reason: "Security first: you buy five years before the typical first-time buyer.", stat: "first_home", tone: "up" }),
    ev(2039, "relationships", "divorce", "The marriage ends",
      "No villain. Jordan says you planned everything except the two of you. You don't argue, which is the problem.",
      { tp: true, quote: "q2", reason: "Every decision ran through the spreadsheet, including the ones that shouldn't have.", stat: "marriage_survival", tone: "down" }),
    ev(2040, "mentalHealth", "burnout", "Two heavy years",
      "The house is quiet and a little bigger than it should be. You work late because the office has people in it.",
      { tp: true, quote: "q4", reason: "At 39, you are in the same building, and now you notice.", stat: "stress_work", tone: "down" }),
    ev(2042, "career", "world_context", "AI takes half your team's reports",
      "The tools write the quarterly decks now. You become the person who checks them.",
      { tone: "mixed" }),
    ev(2045, "career", "career_move", "You make VP",
      "The safest ladder in the building, climbed all the way. The nameplate is heavier than it looks.",
      { tp: true, quote: "q2", reason: "Money stops scaring you the day the VP offer comes.", stat: "earnings_growth", tone: "up" }),
    ev(2047, "happiness", "texture", "The grey middle",
      "Good salary, good house, and a Tuesday that feels like every other Tuesday.",
      { stat: "happiness_u", tone: "mixed" }),
    ev(2050, "relationships", "friendship", "Old friends find you",
      "Someone from your old painting nights messages: 'Do you still draw?' You meet for coffee and stay for four hours.",
      { tp: true, quote: "q3", reason: "You never went to art school, but one of the friends who did comes looking for you.", stat: "close_friends", tone: "up" }),
    ev(2053, "family", "caregiving", "You manage your mom's care",
      "You pay for the best help and visit every Sunday. She tells the aides you're 'the responsible one'.",
      { tp: true, quote: "q1", reason: "You can't say no to your mom, and you can finally afford to say yes properly.", stat: "caregiving", tone: "mixed" }),
    ev(2063, "career", "career_move", "You retire early, with room to spare",
      "Sixty-two and the numbers are more than fine. Your farewell lunch has a slideshow of spreadsheets.",
      { tp: true, quote: "q2", reason: "The money you were afraid of not having, you now have plenty of.", stat: "retire_age", tone: "up" }),
    ev(2068, "lifeGoals", "texture", "You buy paints",
      "A good set, in a wooden box. You put it on the shelf by the window and don't open it.",
      { quote: "q3", reason: "The art school you named at 25 is still there, unopened.", tone: "mixed" }),
  ],
  textures: [
    "A quiet year. You max out the 401(k) match.",
    "Sunday lunch at your mom's. You fix her gutters.",
    "A spreadsheet for the vacation, then the vacation.",
    "You get very good at your job and slightly bored.",
    "A good year on paper.",
    "You learn to make your mom's soup, and make it every Sunday.",
    "Golf with the regional team. You're better than you let on.",
  ],
};

const unjudged: Spec = {
  key: "unjudged", title: "Ink on Your Hands", tagline: "You went to art school.",
  verdict: "Poorer on paper, richer every Tuesday.",
  places: [[2026, "Durham, NC"], [2056, "Hillsborough, NC"]],
  keys: [
    START_K(),
    [2027, 36, 20, 48, 72, 36, 50, 56, 66, 80, 70, 14000, -40000],
    [2029, 42, 16, 60, 72, 38, 50, 52, 62, 82, 66, 18000, -70000],
    [2030, 44, 16, 60, 72, 40, 50, 54, 62, 80, 62, 32000, -72000],
    [2032, 40, 14, 60, 72, 40, 50, 50, 58, 78, 64, 28000, -74000],
    [2034, 46, 18, 62, 74, 70, 52, 60, 70, 80, 58, 36000, -66000],
    [2035, 56, 22, 68, 74, 72, 54, 62, 72, 84, 54, 46000, -58000],
    [2036, 56, 24, 68, 76, 80, 56, 64, 76, 84, 50, 48000, -50000],
    [2038, 58, 26, 70, 78, 80, 82, 62, 78, 84, 48, 52000, -40000],
    [2042, 52, 24, 70, 78, 78, 82, 52, 66, 80, 52, 44000, -30000],
    [2046, 60, 30, 72, 82, 78, 82, 56, 66, 82, 46, 56000, 10000],
    [2050, 72, 38, 88, 80, 80, 84, 66, 74, 90, 38, 72000, 90000],
    [2056, 70, 44, 86, 78, 82, 84, 70, 78, 90, 32, 70000, 190000],
    [2062, 68, 46, 86, 80, 82, 84, 70, 80, 90, 30, 52000, 300000],
    [2071, 66, 45, 86, 82, 82, 85, 72, 80, 90, 30, 38000, 380000],
  ],
  events: [
    ev(2027, "lifeGoals", "career_change", "You go to art school",
      "You quit the bank in May and start an MFA in August, forty minutes from your mom. The loans double. You don't look at the number.",
      { tp: true, quote: "q3", reason: "You said that if nobody judged you, you'd go to art school. So you go.", tone: "up" }),
    ev(2028, "wealth", "money_down", "Ramen money",
      "Two jobs, a studio you share with three people, and a car that starts most days.",
      { quote: "q2", reason: "Money still scares you; you just stopped letting it decide.", stat: "net_worth_age", tone: "down" }),
    ev(2029, "achievement", "achievement", "You finish the MFA",
      "Your thesis show is twelve drawings of your mom's kitchen. She comes twice.",
      { tp: true, quote: "q3", reason: "Drawing for a living starts with finishing.", tone: "up" }),
    ev(2030, "career", "career_move", "Adjunct by day, commissions by night",
      "Two classes a semester and every commission you can find: wedding invitations, a brewery's cans, a dentist's mural.",
      { stat: "jobs_by_age", tone: "mixed" }),
    ev(2032, "wealth", "world_context", "The downturn dries up commissions",
      "Half your clients pause. You teach an extra section and eat at your mom's on Sundays.",
      { stat: "recessions", tone: "down" }),
    ev(2034, "relationships", "love_start", "You meet Jules",
      "Jules sells pottery at the Saturday market, two stalls from your prints. You trade a mug for a drawing.",
      { tp: true, quote: "q1", reason: "Staying near your mom means the Durham market, where Jules has the next stall.", tone: "up" }),
    ev(2035, "career", "career_move", "Your first children's book",
      "A small press hires you to illustrate a picture book about a lost umbrella. Your name is on the cover, smaller than you hoped.",
      { tp: true, quote: "q3", reason: "Drawing for a living, now with an ISBN.", tone: "up" }),
    ev(2036, "relationships", "marriage", "You marry Jules",
      "In your mom's backyard, under string lights you hung yourself. The cake is lopsided and perfect.",
      { tp: true, quote: "q1", reason: "Your mom's backyard was the only venue either of you wanted.", stat: "marriage_age", tone: "up" }),
    ev(2038, "children", "child", "A daughter",
      "She arrives in March. Your mom, twenty minutes away, is the first call and the first visitor.",
      { tp: true, quote: "q1", reason: "You stayed close to your mom, so she's there for the first night.", stat: "first_birth_age", tone: "up" }),
    ev(2042, "wealth", "money_down", "A lean year",
      "Two publishers fold. You take a part-time job at the print shop and keep drawing at night.",
      { stat: "job_insecurity", tone: "down" }),
    ev(2046, "family", "caregiving", "Your mom needs help",
      "Her knees go and her stubbornness doesn't. You're already close, so you're the one who comes.",
      { tp: true, quote: "q1", reason: "You can't say no to your mom, and you live close enough not to have to.", stat: "sandwich", tone: "mixed" }),
    ev(2050, "achievement", "achievement", "Your book wins an award",
      "A picture book about your mom's hands wins a national prize. She keeps the medal in her purse.",
      { tp: true, quote: "q3", reason: "Twenty-three years of drawing for a living.", tone: "up" }),
    ev(2056, "wealth", "home", "You finally buy a small house",
      "Two bedrooms in Hillsborough with a shed that becomes the studio. You are 55, and it's yours.",
      { tp: true, quote: "q2", reason: "You said money scared you. At 55, it finally doesn't.", stat: "first_home", tone: "up" }),
    ev(2062, "lifeGoals", "texture", "Drawing with kids at the library",
      "Every Tuesday, fifteen kids and a box of crayons. You never miss one.",
      { tone: "up" }),
    ev(2068, "children", "texture", "Your granddaughter in the studio",
      "Your daughter brings her kid to the shed. She draws on the wall and you don't stop her.",
      { tone: "up" }),
  ],
  textures: [
    "A quiet year. Ink on your hands, rent paid, barely.",
    "You draw your mom's garden in every season.",
    "Teaching, drawing, a lot of rice and eggs.",
    "A good year. Nothing sells big; everything gets made.",
    "Sunday dinners at your mom's, with Jules's pottery on the table.",
    "You fill four sketchbooks.",
    "A summer of school visits and small checks.",
  ],
};

// ------------------------------------------------------------------------------------------
// Build
// ------------------------------------------------------------------------------------------
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round = (v: number, step: number) => Math.round(v / step) * step;

function frame(keys: K[], year: number): { states: DomainStates; income: number; netWorth: number } {
  const sorted = [...keys].sort((a, b) => a[0] - b[0]);
  let lo = sorted[0]!;
  let hi = sorted[sorted.length - 1]!;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]![0] <= year && sorted[i + 1]![0] >= year) {
      lo = sorted[i]!;
      hi = sorted[i + 1]!;
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (year - lo[0]) / (hi[0] - lo[0]);
  const v = (i: number) => lerp(lo[i]!, hi[i]!, t);
  const states = Object.fromEntries(
    DOMAIN_KEYS.map((d, i) => [d, Math.max(0, Math.min(100, Math.round(v(i + 1))))]),
  ) as DomainStates;
  return { states, income: round(v(11), 500), netWorth: round(v(12), 1000) };
}

const placeAt = (places: [number, string][], year: number) =>
  [...places].reverse().find(([y]) => y <= year)?.[1] ?? places[0]![1];

const firstSentence = (s: string) => (s.match(/^.*?[.!?](\s|$)/)?.[0] ?? s).trim();

function build(spec: Spec): Life {
  const counters = new Map<number, number>();
  const years: Year[] = [];
  let texture = 0;
  for (let year = START; year <= END; year++) {
    const f = frame(spec.keys, year);
    const events: LifeEvent[] = spec.events
      .filter((e) => e.year === year)
      .map((e) => {
        const n = (counters.get(year) ?? 0) + 1;
        counters.set(year, n);
        return {
          id: `${spec.key}-${year}-${n}`,
          domain: e.domain,
          category: e.category,
          title: e.title,
          narrative: e.narrative,
          isTurningPoint: e.tp,
          cause: e.quote ? { quoteId: e.quote, reason: e.reason ?? "" } : null,
          baseRate: e.stat ? { statId: e.stat } : null,
          tone: e.tone,
        };
      });
    const lead = events.find((e) => e.isTurningPoint) ?? events[0];
    let summary: string;
    if (year === START) summary = "You're 25, in Durham, with a Singapore email you haven't answered.";
    else if (year === END) summary = spec.verdict;
    else if (lead) summary = firstSentence(lead.narrative);
    else summary = spec.textures[texture++ % spec.textures.length]!;
    years.push({
      year, age: year - BIRTH, place: placeAt(spec.places, year), summary,
      states: f.states, money: { income: f.income, netWorth: f.netWorth }, events,
    });
  }
  return { key: spec.key, title: spec.title, tagline: spec.tagline, verdictAt70: spec.verdict, years };
}

const plan: LifePlan = {
  profileVersion: 1,
  world: [
    { id: "w1", year: 2032, kind: "downturn", title: "A two-year downturn" },
    { id: "w2", year: 2042, kind: "tech_shift", title: "AI reshapes office work" },
  ],
  arcs: [path, leap, careful, unjudged].map((s) => ({
    key: s.key,
    title: s.title,
    premise: `${ARCHETYPES[s.key].title}: ${s.tagline}`,
    seedQuoteIds: profile.seeds[s.key].quoteIds,
    arc: s.verdict,
    beats: s.events.filter((e) => e.tp).slice(0, 6).map((e) => ({ age: e.year - BIRTH, domain: e.domain, title: e.title })),
  })),
};

const pause: PauseQuestion = {
  id: "P1", year: 2031, age: 30, domain: "career", retunes: true,
  prompt:
    "It's 2031. You're 30. Your manager asks if you want to lead the new team, but it means weekends. A friend just asked you to take a painting class together. What do you protect first?",
};

const q6: Quote = {
  id: "q6", text: "The painting. I'd keep my weekends and take the class.", questionId: "P1", source: "pause",
  shortForm: "The painting.",
};

const bundle: DemoBundle = {
  profile,
  plan,
  lives: [build(path), build(leap), build(careful), build(unjudged)],
  pauses: [pause],
  retunes: [
    {
      pauseId: "P1", fromYear: 2031, quote: q6,
      changes: [{ key: "path", summary: "Because you said 'The painting.': a softer 2041, a first exhibition in 2044, and color at 70." }],
      lives: [build(pathAlt)],
    },
  ],
};

const out = new URL("../../shared/demo/alex.json", import.meta.url);
writeFileSync(out, JSON.stringify(bundle, null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
