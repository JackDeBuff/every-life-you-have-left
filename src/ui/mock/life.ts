/**
 * Mock life model: a small parametric "trajectory" that turns decisions and nudges into believable
 * years (states, money, events with why, a SceneSpec). Deterministic per (seed, life, year).
 * This is UI scaffolding so the demo plays without a backend, not the real engine.
 */
import type { BaseRateId } from "../../../shared/baseRates";
import type { DomainKey } from "../../../shared/domains";
import type { DomainStates, EventCategory, LifeEvent, Quote } from "../../../shared/schema";
import type { SceneSpec, SimYear } from "../../../shared/sim";
import { clamp, hash, pick, rngFrom, type Rng } from "./rng";

export type WorkKind = "employee" | "founder" | "creative" | "teacher" | "caregiver" | "retired";
export type Partner = "none" | "dating" | "partner" | "married";
type Moment = NonNullable<SceneSpec["moment"]>;

export interface Traj {
  city: string;
  place: string;
  setting: SceneSpec["setting"];
  flavor: SceneSpec["flavor"];
  home: SceneSpec["home"];
  work: string;
  workKind: WorkKind;
  /** 0..1 knobs that decisions and settings push around. */
  drive: number;
  caution: number;
  family: number;
  craft: number;
  balance: number;
  invest: "cash" | "index" | "property" | "business";
  partner: Partner;
  partnerName: string | null;
  partnerSince: number | null;
  kidsPlan: "open" | "yes" | "later" | "no";
  kids: number[];
  parent: string;
  farFromHome: boolean;
  caring: boolean;
  income: number;
  netWorth: number;
  retireAge: number;
  lastPromo: number;
  shows: number;
  risk: number;
  craftNoun: string;
  craftVerb: string;
  craftPerson: string;
  flags: Record<string, number>;
  /** Events a decision queued for upcoming years. */
  queued: QueuedEvent[];
  states: DomainStates;
}

export interface QueuedEvent {
  year: number;
  domain: DomainKey;
  category: EventCategory;
  title: string;
  narrative: string;
  tone: "up" | "down" | "mixed";
  baseRate: BaseRateId | null;
  moment: Moment | null;
  activity?: SceneSpec["activity"];
}

export interface LifeCtx {
  seed: number;
  lifeId: string;
  startYear: number;
  startAge: number;
  endAge: number;
  firstName: string;
  quotes: Quote[];
  /** Year → world event title (shared by all lives, ≤2). */
  world: Record<number, string>;
}

// ---------------------------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------------------------
const US_SOUTH = ["NC", "SC", "GA", "FL", "TN", "AL", "MS", "LA", "TX", "VA", "KY", "AR", "OK"];
const US_NE = ["NY", "MA", "CT", "RI", "NJ", "PA", "ME", "VT", "NH", "MD", "DE", "DC"];
const US_WEST = ["CA", "WA", "OR", "NV", "AZ", "CO", "UT", "NM", "ID", "MT", "WY", "HI", "AK"];
const COUNTRY_FLAVOR: Record<string, SceneSpec["flavor"]> = {
  GB: "europe_north", DE: "europe_north", NL: "europe_north", SE: "europe_north", NO: "europe_north", DK: "europe_north", FI: "europe_north", IE: "europe_north", BE: "europe_north", CH: "europe_north", AT: "europe_north", PL: "europe_north",
  ES: "europe_south", IT: "europe_south", PT: "europe_south", FR: "europe_south", GR: "europe_south",
  JP: "east_asia", KR: "east_asia", CN: "east_asia", TW: "east_asia", HK: "east_asia",
  SG: "southeast_asia", TH: "southeast_asia", VN: "southeast_asia", ID: "southeast_asia", MY: "southeast_asia", PH: "southeast_asia",
  IN: "south_asia", PK: "south_asia", BD: "south_asia", LK: "south_asia",
  MX: "latam", BR: "latam", AR: "latam", CO: "latam", CL: "latam", PE: "latam",
  AE: "middle_east", SA: "middle_east", QA: "middle_east", TR: "middle_east", IL: "middle_east", EG: "middle_east",
  NG: "africa", KE: "africa", ZA: "africa", GH: "africa", ET: "africa",
  AU: "oceania", NZ: "oceania",
  CA: "us_northeast",
};
const BIG_CITIES = ["new york", "singapore", "london", "tokyo", "hong kong", "chicago", "los angeles", "san francisco", "seoul", "paris", "berlin", "shanghai", "mumbai", "sydney", "toronto", "boston", "seattle", "atlanta"];
const COAST = ["lisbon", "barcelona", "san diego", "wilmington", "charleston", "honolulu", "sydney", "cape town", "porto", "santa barbara", "halifax", "the coast"];

export const KNOWN_PLACES: Record<string, { country: string; region: string | null }> = {
  singapore: { country: "SG", region: null }, london: { country: "GB", region: null }, tokyo: { country: "JP", region: null },
  lisbon: { country: "PT", region: null }, berlin: { country: "DE", region: null }, paris: { country: "FR", region: null },
  seoul: { country: "KR", region: null }, toronto: { country: "CA", region: "ON" }, sydney: { country: "AU", region: null },
  "hong kong": { country: "HK", region: null }, barcelona: { country: "ES", region: null }, amsterdam: { country: "NL", region: null },
  "new york": { country: "US", region: "NY" }, "san francisco": { country: "US", region: "CA" }, seattle: { country: "US", region: "WA" },
  chicago: { country: "US", region: "IL" }, austin: { country: "US", region: "TX" }, boston: { country: "US", region: "MA" },
  denver: { country: "US", region: "CO" }, atlanta: { country: "US", region: "GA" }, durham: { country: "US", region: "NC" },
  raleigh: { country: "US", region: "NC" }, "chapel hill": { country: "US", region: "NC" }, wilmington: { country: "US", region: "NC" },
  mumbai: { country: "IN", region: null }, bangalore: { country: "IN", region: null }, "mexico city": { country: "MX", region: null },
};

export function placeTraits(city: string, region: string | null, country: string): Pick<Traj, "setting" | "flavor" | "place"> {
  const c = city.toLowerCase();
  let flavor: SceneSpec["flavor"] = "us_south";
  if (country === "US") {
    const r = (region ?? "").toUpperCase();
    flavor = US_SOUTH.includes(r) ? "us_south" : US_NE.includes(r) ? "us_northeast" : US_WEST.includes(r) ? "us_west" : r ? "us_midwest" : "us_south";
  } else flavor = COUNTRY_FLAVOR[country] ?? "europe_north";
  const setting: SceneSpec["setting"] = COAST.includes(c)
    ? "coastal"
    : BIG_CITIES.includes(c)
      ? "city_dense"
      : /town|ville|hill|falls/.test(c)
        ? "small_town"
        : c.includes("university") || c.includes("campus")
          ? "campus"
          : "city_midrise";
  const place = region ? `${city}, ${region}` : country === "US" ? city : `${city}${countryName(country) ? `, ${countryName(country)}` : ""}`;
  return { setting, flavor, place };
}

function countryName(code: string): string {
  const names: Record<string, string> = { SG: "", HK: "", GB: "UK", JP: "Japan", PT: "Portugal", DE: "Germany", FR: "France", KR: "Korea", CA: "Canada", AU: "Australia", ES: "Spain", NL: "Netherlands", IN: "India", MX: "Mexico" };
  return names[code] ?? code;
}

// ---------------------------------------------------------------------------------------------
// Quotes → domains (which of your sentences explains an event)
// ---------------------------------------------------------------------------------------------
const TAGS: [RegExp, DomainKey[]][] = [
  [/money|loan|debt|rent|afford|broke|save|savings|\$|salary|pay/i, ["wealth", "risk"]],
  [/mom|mum|dad|father|mother|parent|family|sister|brother|home/i, ["family"]],
  [/paint|art|draw|music|write|writing|book|film|design|make|create|band|photograph/i, ["lifeGoals", "achievement"]],
  [/job|work|career|boss|cubicle|desk|office|promot|quit|offer|transfer|company/i, ["career"]],
  [/love|partner|lonely|alone|date|dating|girlfriend|boyfriend|wife|husband|friends?/i, ["relationships"]],
  [/kid|child|baby|children/i, ["children"]],
  [/anxious|anxiety|tired|stress|burn|sleep|sad|overwhelm|scared|fear|afraid/i, ["mentalHealth"]],
  [/happy|joy|fun|enjoy|bored/i, ["happiness"]],
  [/move|abroad|city|travel|leave|singapore|london|new york|risk|leap/i, ["risk", "lifeGoals"]],
  [/school|degree|study|college|grad/i, ["achievement", "career"]],
];
export function tagQuote(text: string): DomainKey[] {
  const out = new Set<DomainKey>();
  for (const [re, ds] of TAGS) if (re.test(text)) ds.forEach((d) => out.add(d));
  return [...out];
}

export function shortOf(text: string, words = 10): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  const ws = firstSentence.trim().split(/\s+/);
  return ws.length <= words ? firstSentence.trim() : `${ws.slice(0, words).join(" ")}…`;
}

export function quoteFor(quotes: Quote[], domain: DomainKey, r: Rng): Quote | null {
  if (!quotes.length) return null;
  const hits = quotes.filter((q) => tagQuote(q.text).includes(domain));
  if (hits.length) return hits.length > 1 && r() < 0.35 ? hits[hits.length - 2]! : hits[hits.length - 1]!;
  return quotes[0]!;
}

// ---------------------------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------------------------
const medianNetWorth = (age: number) => (age < 35 ? 39000 : age < 45 ? 135000 : age < 55 ? 247000 : age < 65 ? 364000 : 410000);

function targetStates(t: Traj, age: number, year: number, startAge: number): DomainStates {
  const yrs = Math.min(age - startAge, 22);
  const retired = t.workKind === "retired";
  const nw = medianNetWorth(age);
  const kidsAtHome = t.kids.filter((b) => year - b < 18).length;
  return {
    career: retired ? 55 : t.workKind === "creative" ? 30 + t.craft * 30 + Math.min(t.shows, 6) * 4 : 34 + t.drive * 34 + yrs * 0.9 - (t.workKind === "founder" ? 6 : 0),
    wealth: 50 + 30 * Math.tanh((t.netWorth - nw) / (nw + 30000)),
    achievement: 32 + t.craft * 22 + t.drive * 16 + Math.min(t.shows, 6) * 3 + (age - t.lastPromo < 3 ? 6 : 0),
    family: 44 + t.family * 34 - (t.farFromHome ? 14 : 0) + (t.caring ? 4 : 0),
    relationships: { none: 38, dating: 58, partner: 66, married: 72 }[t.partner] + t.balance * 10 - t.drive * 6,
    children: t.kids.length ? 66 + t.family * 16 - kidsAtHome * 2 : t.kidsPlan === "no" ? 62 : t.kidsPlan === "yes" && age > 41 ? 38 : 50,
    mentalHealth: 60 + t.balance * 22 - t.drive * 12 - (t.caring ? 8 : 0) - t.risk * 0.12,
    happiness: 58 + t.balance * 10 + t.craft * 8 - 7 * Math.exp(-(((age - 48) / 8) ** 2)) + (t.partner === "married" ? 4 : 0),
    lifeGoals: 36 + t.craft * 38 + (t.flags.leap ? 8 : 0) - t.caution * 6,
    risk: t.risk,
  };
}

function settle(prev: DomainStates, target: DomainStates, delta: Partial<DomainStates>): DomainStates {
  const out = {} as DomainStates;
  for (const k of Object.keys(prev) as DomainKey[]) {
    const inertia = k === "risk" ? 0.45 : 0.62;
    out[k] = Math.round(clamp(prev[k] * inertia + target[k] * (1 - inertia) + (delta[k] ?? 0), 2, 98));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Event rules
// ---------------------------------------------------------------------------------------------
interface Draft {
  domain: DomainKey;
  category: EventCategory;
  title: string;
  narrative: string;
  tone: "up" | "down" | "mixed";
  baseRate: BaseRateId | null;
  moment: Moment | null;
  activity?: SceneSpec["activity"];
  delta?: Partial<DomainStates>;
  turning?: boolean;
}
interface Rule {
  id: string;
  chance(t: Traj, age: number, year: number, ctx: LifeCtx): number;
  apply(t: Traj, age: number, year: number, r: Rng, ctx: LifeCtx): Draft;
}

const NAMES = ["Sam", "Jordan", "Priya", "Mateo", "Noor", "Elena", "Kai", "Ruth", "Theo", "Lena", "Wen", "Ama", "Jonah", "Ines"];
const NEXT_TITLE = ["senior", "lead", "manager of the team", "director", "head of the group", "partner"];

const RULES: Rule[] = [
  {
    id: "promotion",
    chance: (t, age, year) => (t.workKind === "employee" && age < 60 && year - t.lastPromo >= 3 ? 0.12 + t.drive * 0.34 : 0),
    apply: (t, _a, year) => {
      const step = NEXT_TITLE[Math.min(t.flags.promos ?? 0, NEXT_TITLE.length - 1)]!;
      t.flags.promos = (t.flags.promos ?? 0) + 1;
      t.lastPromo = year;
      t.income = Math.round(t.income * (1.1 + t.drive * 0.07));
      return {
        domain: "career", category: "career_move", title: `Promoted to ${step}`, tone: "up", baseRate: "earnings_growth", moment: "promotion",
        narrative: "The title helps. The hours don't get shorter.", delta: { career: 6, achievement: 4, mentalHealth: -2 }, turning: true,
      };
    },
  },
  {
    id: "jobChange",
    chance: (t, age) => (t.workKind === "employee" && age < 55 ? 0.05 + t.drive * 0.07 + (1 - t.caution) * 0.04 : 0),
    apply: (t, _a, year) => {
      t.income = Math.round(t.income * 1.09);
      t.lastPromo = year - 1;
      return {
        domain: "career", category: "career_move", title: "A new job, a better title", tone: "up", baseRate: "jobs_by_age", moment: "new_job",
        narrative: "A recruiter calls on a Tuesday. By spring you have a new badge and a longer commute.", delta: { career: 5, risk: 6 }, turning: true,
      };
    },
  },
  {
    id: "meet",
    chance: (t, age) => (t.partner === "none" && age >= 23 && age <= 48 ? 0.03 + t.family * 0.1 + t.balance * 0.08 : 0),
    apply: (t, _a, year, r) => {
      t.partner = "dating";
      t.partnerName = pick(r, NAMES);
      t.partnerSince = year;
      return {
        domain: "relationships", category: "love_start", title: `You meet ${t.partnerName}`, tone: "up", baseRate: null, moment: null, activity: "socializing",
        narrative: `A friend's birthday, a long talk on the porch. ${t.partnerName} texts first.`, delta: { relationships: 10, happiness: 5 }, turning: true,
      };
    },
  },
  {
    id: "moveIn",
    chance: (t, _a, year) => (t.partner === "dating" && year - (t.partnerSince ?? year) >= 1 ? 0.45 : 0),
    apply: (t, _a, year) => {
      t.partner = "partner";
      t.partnerSince = year;
      return {
        domain: "relationships", category: "love_start", title: `${t.partnerName} moves in`, tone: "up", baseRate: null, moment: "moving_in",
        narrative: "Two of everything in the kitchen. You keep the good mugs.", delta: { relationships: 6 }, turning: false,
      };
    },
  },
  {
    id: "marry",
    chance: (t, _a, year) => (t.partner === "partner" && year - (t.partnerSince ?? year) >= 2 ? 0.22 + t.family * 0.2 : 0),
    apply: (t) => {
      t.partner = "married";
      return {
        domain: "relationships", category: "marriage", title: `You marry ${t.partnerName}`, tone: "up", baseRate: "marriage_age", moment: "wedding",
        narrative: `Small, loud, a little over budget. ${t.parent} cries before the vows.`, delta: { relationships: 8, happiness: 6, family: 4 }, turning: true,
      };
    },
  },
  {
    id: "child",
    chance: (t, age, year) =>
      (t.partner === "married" || t.partner === "partner") && t.kidsPlan === "yes" && age <= 43 && t.kids.length < (t.family > 0.6 ? 2 : 1) && year - (t.kids.at(-1) ?? 0) >= 2
        ? 0.42
        : 0,
    apply: (t, _a, year) => {
      t.kids.push(year);
      const first = t.kids.length === 1;
      return {
        domain: "children", category: "child", title: first ? "Your first child is born" : "A second child", tone: "up",
        baseRate: first ? "first_birth_age" : "tfr", moment: "new_baby", activity: "family_time",
        narrative: first ? "Seven pounds, two ounces. Nobody sleeps, and nobody minds much." : "The house gets louder. You get better at it.",
        delta: { children: 16, mentalHealth: -6, happiness: 6 }, turning: true,
      };
    },
  },
  {
    id: "home",
    chance: (t, age) => (!t.flags.ownsHome && t.netWorth > 42000 && t.caution > 0.3 && age >= 27 ? 0.2 + t.caution * 0.15 : 0),
    apply: (t, _a, year) => {
      t.flags.ownsHome = year;
      t.home = t.kids.length || t.partner !== "none" ? "house" : "townhouse";
      return {
        domain: "wealth", category: "home", title: "Keys to a place of your own", tone: "up", baseRate: "first_home", moment: "house_keys", activity: "moving",
        narrative: "A small yard, a big mortgage, a door you can paint any colour.", delta: { wealth: 3, risk: 8, happiness: 4 }, turning: true,
      };
    },
  },
  {
    id: "burnout",
    chance: (t, age) => (t.drive > 0.6 && t.balance < 0.42 && age >= 32 && age <= 52 && !t.flags.burnout ? 0.22 : 0),
    apply: (t, _a, year) => {
      t.flags.burnout = year;
      t.balance = Math.min(1, t.balance + 0.18);
      return {
        domain: "mentalHealth", category: "burnout", title: "The year you run out of road", tone: "down", baseRate: "stress_work", moment: null, activity: "resting",
        narrative: "You stop answering email on a Wednesday and don't start again for a month. It's the start of a better rhythm.",
        delta: { mentalHealth: -20, happiness: -10, career: -4 }, turning: true,
      };
    },
  },
  {
    id: "craft",
    chance: (t) => (t.craft > 0.42 ? 0.08 + t.craft * 0.2 : 0),
    apply: (t) => {
      t.shows += 1;
      const first = t.shows === 1;
      return {
        domain: "achievement", category: "achievement",
        title: first ? `Your first ${t.craftNoun} in front of strangers` : `More ${t.craftNoun}, a bigger room`,
        tone: "up", baseRate: null, moment: first ? "first_show" : "award", activity: "studio_creating",
        narrative: first ? "Thirty people, folding chairs, someone you don't know asks the price." : "People you've never met know your name now.",
        delta: { achievement: 8, lifeGoals: 8, happiness: 4 }, turning: first,
      };
    },
  },
  {
    id: "launch",
    chance: (t) => (t.workKind === "founder" && !t.flags.launch ? 0.6 : 0),
    apply: (t, _a, year) => {
      t.flags.launch = year;
      t.risk = Math.min(90, t.risk + 20);
      return {
        domain: "risk", category: "career_change", title: "You launch the thing", tone: "mixed", baseRate: "biz_survival", moment: "launch", activity: "remote_work",
        narrative: "A landing page, eleven customers, and a spreadsheet you check at 2am.", delta: { risk: 14, achievement: 8 }, turning: true,
      };
    },
  },
  {
    id: "layoff",
    chance: (t, age, year, ctx) => (t.workKind === "employee" && age >= 28 && age <= 58 && ctx.world[year] && !t.flags.layoff ? 0.35 - t.caution * 0.15 : 0),
    apply: (t, _a, year) => {
      t.flags.layoff = year;
      t.income = Math.round(t.income * 0.82);
      t.risk = Math.min(90, t.risk + 18);
      return {
        domain: "career", category: "job_loss", title: "Laid off in the downturn", tone: "down", baseRate: "layoffs_jolts", moment: "layoff", activity: "job_hunting",
        narrative: "A fifteen-minute call and a box. Four months later you start again, a little lower down.", delta: { career: -14, wealth: -6, mentalHealth: -8 }, turning: true,
      };
    },
  },
  {
    id: "care",
    chance: (t, age) => (t.family > 0.22 && age >= 46 && age <= 62 && !t.flags.care ? 0.16 + t.family * 0.14 : 0),
    apply: (t, _a, year) => {
      t.flags.care = year;
      t.caring = true;
      return {
        domain: "family", category: "caregiving", title: `You start caring for ${t.parent}`, tone: "mixed",
        baseRate: t.kids.length ? "sandwich" : "caregiving", moment: "caregiving_start", activity: "caregiving",
        narrative: `Pill organisers, Sunday lunches, a spare key on your ring. ${t.parent} pretends not to need it.`,
        delta: { family: 6, mentalHealth: -6 }, turning: true,
      };
    },
  },
  {
    id: "friend",
    chance: () => 0.06,
    apply: (t) => ({
      domain: "relationships", category: "friendship", title: `An old friend moves back to ${t.city}`, tone: "up", baseRate: "close_friends", moment: "reunion", activity: "socializing",
      narrative: "Thursday dinners start up again, like no time passed.", delta: { relationships: 5, happiness: 3 }, turning: false,
    }),
  },
  {
    id: "lonely",
    chance: (t, age) => (t.partner === "none" && age > 34 && t.balance < 0.45 ? 0.1 : 0),
    apply: () => ({
      domain: "relationships", category: "texture", title: "A quiet stretch of weekends", tone: "mixed", baseRate: "loneliness", moment: null, activity: "resting",
      narrative: "Work fills the weekdays. The weekends are long. You start saying yes to more invitations.", delta: { relationships: -5, happiness: -3 }, turning: false,
    }),
  },
  {
    id: "travel",
    chance: (t) => (t.netWorth > 70000 && t.balance > 0.5 ? 0.09 : 0),
    apply: () => ({
      domain: "happiness", category: "texture", title: "Three weeks somewhere new", tone: "up", baseRate: null, moment: "travel_abroad", activity: "traveling",
      narrative: "No laptop. You come back with a sunburn and one good idea.", delta: { happiness: 6, mentalHealth: 4 }, turning: false,
    }),
  },
  {
    id: "dip",
    chance: (_t, age, _y, ctx) => (age >= 46 && age <= 50 && ctx.endAge - age > 6 ? 0.18 : 0),
    apply: (t) => {
      t.flags.dip = 1;
      return {
        domain: "happiness", category: "texture", title: "A flat, grey middle year", tone: "mixed", baseRate: "happiness_u", moment: null, activity: "commuting",
        narrative: "Nothing is wrong, exactly. It's just the middle. It passes.", delta: { happiness: -6 }, turning: false,
      };
    },
  },
];

const TEXTURE = {
  young: [
    "Late nights, cheap dinners, a lot of figuring it out.",
    "You learn how to cook three things well.",
    "Weekends belong to friends. Weekdays belong to work.",
    "Rent goes up. You stay anyway.",
  ],
  mid: [
    "School runs, slow Sundays, a calendar that runs your life.",
    "A steady year. Work, home, the same good coffee shop.",
    "You fix the porch yourself and are unreasonably proud of it.",
    "Not much happens. That's the point, some years.",
  ],
  late: [
    "Mornings get slower. You like them more.",
    "You start saying the things you used to save for later.",
    "A garden, a short list of people you call on Sundays.",
    "Less proving, more noticing.",
  ],
};

// ---------------------------------------------------------------------------------------------
// One year
// ---------------------------------------------------------------------------------------------
export function stepYear(prev: Traj, year: number, age: number, ctx: LifeCtx): { traj: Traj; year: SimYear } {
  const t: Traj = structuredClone(prev);
  const r = rngFrom(hash(ctx.seed, ctx.lifeId, year));
  const drafts: Draft[] = [];

  // Retirement is scheduled, not random.
  if (t.workKind !== "retired" && age >= t.retireAge) {
    t.workKind = "retired";
    t.work = "Retired";
    t.income = Math.round(t.income * 0.42);
    drafts.push({
      domain: "career", category: "career_change", title: "Your last day at work", tone: "mixed", baseRate: "retire_age", moment: "retirement", activity: "celebrating",
      narrative: "Cake in the break room, a card everyone signed. You drive home the long way.", delta: { career: -6, happiness: 4 }, turning: true,
    });
  }

  // Queued events from decisions come first.
  for (const q of t.queued.filter((e) => e.year === year)) {
    if (q.category === "child") t.kids.push(year);
    if (q.category === "love_start" && t.partner === "none") {
      t.partner = "partner";
      t.partnerName = t.partnerName ?? "your partner";
      t.partnerSince = year;
    }
    drafts.push({ ...q, turning: true });
  }
  // Caring for a parent ends, once and gently, after many years (content rule: old age, offscreen).
  if (t.caring && t.flags.care && year - t.flags.care >= 11 && !t.flags.careEnd) {
    t.flags.careEnd = year;
    t.caring = false;
    const who = t.parent === "your parents" ? "Your father" : t.parent;
    drafts.push({
      domain: "family", category: "caregiving", title: `${who}'s long life ends, gently`, tone: "mixed", baseRate: null, moment: null, activity: "family_time",
      narrative: "A long life, a quiet last year, everyone in the room. The house is quieter after.", delta: { family: -4, happiness: -4 }, turning: false,
    });
  }
  t.queued = t.queued.filter((e) => e.year > year);

  // Kids growing up.
  for (const b of t.kids) {
    if (year - b === 18) {
      drafts.push({
        domain: "children", category: "texture", title: "Your eldest leaves home", tone: "mixed", baseRate: null, moment: "graduation", activity: "family_time",
        narrative: "The room stays exactly as they left it for a whole year.", delta: { children: -2, happiness: -2 },
      });
      break;
    }
  }

  // Random life, at most two drafts a year in total.
  if (drafts.length < 2) {
    const order = [...RULES].sort(() => r() - 0.5);
    for (const rule of order) {
      if (drafts.length >= 2) break;
      if (drafts.some((d) => d.category === "texture") && rule.id === "dip") continue;
      if (rule.id === "dip" && t.flags.dip) continue;
      const p = rule.chance(t, age, year, ctx);
      if (p > 0 && r() < p) drafts.push(rule.apply(t, age, year, r, ctx));
    }
  }

  // Money.
  const growth = t.workKind === "retired" ? 0 : t.workKind === "founder" ? (r() - 0.35) * 0.22 : 0.025 + t.drive * 0.02;
  t.income = Math.max(18000, Math.round(t.income * (1 + growth)));
  const savingsRate = Math.max(0.02, 0.04 + t.caution * 0.12 - t.kids.length * 0.025 - (t.caring ? 0.02 : 0));
  const ret = { cash: 0.008, index: 0.042, property: 0.035, business: t.workKind === "founder" ? 0.06 : 0.03 }[t.invest];
  const worldHit = ctx.world[year] ? -0.12 * (t.invest === "cash" ? 0.1 : 1) : 0;
  t.netWorth = Math.round(t.netWorth * (1 + (t.netWorth > 0 ? ret + worldHit : 0.05)) + t.income * savingsRate);
  t.risk = Math.max(6, Math.round(t.risk * 0.82 + (t.workKind === "founder" ? 8 : 0)));

  // States.
  const delta: Partial<DomainStates> = {};
  for (const d of drafts) for (const [k, v] of Object.entries(d.delta ?? {})) delta[k as DomainKey] = (delta[k as DomainKey] ?? 0) + (v ?? 0);
  if (ctx.world[year]) delta.risk = (delta.risk ?? 0) + 8;
  t.states = settle(t.states, targetStates(t, age, year, ctx.startAge), delta);

  // Events with why.
  const events: LifeEvent[] = drafts.map((d, i) => {
    const q = quoteFor(ctx.quotes, d.domain, r);
    const turning = d.turning ?? false;
    return {
      id: `${ctx.lifeId}-${year}-${i + 1}`,
      domain: d.domain,
      category: d.category,
      title: d.title,
      narrative: d.narrative,
      isTurningPoint: turning && !!q,
      cause: turning && q ? { quoteId: q.id, reason: reasonFor(d, q) } : null,
      baseRate: d.baseRate ? { statId: d.baseRate } : null,
      tone: d.tone,
    };
  });

  const progress = (age - ctx.startAge) / Math.max(1, ctx.endAge - ctx.startAge);
  const stage = progress < 0.33 ? "young" : progress < 0.72 ? "mid" : "late";
  const summary = events[0]
    ? `${events[0].title}.${events[1] ? ` ${events[1].title}.` : ""}`
    : ctx.world[year]
      ? `${ctx.world[year]}. You hold on and keep your head down.`
      : pick(r, TEXTURE[stage]);

  const top = drafts[0];
  const mood: SceneSpec["mood"] = top?.tone === "down" ? (t.states.mentalHealth < 40 ? "heavy" : "tense") : top?.tone === "up" ? (top.moment ? "joyful" : "bright") : t.states.happiness > 64 ? "bright" : "calm";
  const scene: SceneSpec = {
    setting: t.setting,
    flavor: t.flavor,
    placeLabel: t.place,
    home: t.home,
    activity: top?.activity ?? activityFor(t, r),
    people: peopleFor(t, age, year),
    season: (["spring", "summer", "autumn", "winter"] as const)[(year + Math.floor(r() * 4)) % 4]!,
    timeOfDay: progress < 0.12 ? "dawn" : progress < 0.6 ? (r() < 0.75 ? "day" : "golden") : progress < 0.88 ? "golden" : r() < 0.5 ? "golden" : "night",
    weather: mood === "heavy" ? "rain" : mood === "tense" ? (r() < 0.5 ? "cloudy" : "fog") : pick(r, ["clear", "clear", "clear", "cloudy", "rain", "snow"] as const),
    mood,
    moment: top?.moment ?? null,
    caption: (top?.title ?? summary).split(/[.,]/)[0]!.split(/\s+/).slice(0, 8).join(" "),
  };
  if (scene.weather === "snow" && scene.season !== "winter") scene.weather = "clear";

  return {
    traj: t,
    year: { year, age, place: t.place, summary, states: t.states, money: { income: t.income, netWorth: t.netWorth }, events, scene, decisionIds: [] },
  };
}

function reasonFor(d: Draft, q: Quote): string {
  const s = q.shortForm ?? shortOf(q.text);
  const how: Partial<Record<EventCategory, string>> = {
    career_move: "you keep choosing the steadier climb",
    career_change: "you finally act on it",
    job_loss: "you'd built a cushion for exactly this",
    burnout: "you kept saying yes past the point of it",
    love_start: "you left room in your week for people",
    marriage: "you wanted something that lasts",
    child: "you said yes to a fuller house",
    home: "a safe floor under you matters to you",
    caregiving: "you never could say no to family",
    achievement: "you kept the thing you love alive",
    move: "you said yes to the move",
  };
  return `You said “${s}” so ${how[d.category] ?? "this is where that leads"}.`;
}

function activityFor(t: Traj, r: Rng): SceneSpec["activity"] {
  if (t.workKind === "retired") return pick(r, ["resting", "family_time", "exercising", "socializing"] as const);
  if (t.workKind === "creative") return pick(r, ["studio_creating", "studio_creating", "socializing"] as const);
  if (t.workKind === "founder") return pick(r, ["remote_work", "office_work", "commuting"] as const);
  if (t.caring) return pick(r, ["caregiving", "office_work"] as const);
  if (t.kids.length) return pick(r, ["family_time", "office_work", "commuting"] as const);
  return pick(r, ["office_work", "office_work", "commuting", "exercising", "socializing", "remote_work"] as const);
}

function band(age: number): SceneSpec["people"][number]["ageBand"] {
  return age < 2 ? "baby" : age < 13 ? "child" : age < 18 ? "teen" : age < 30 ? "young_adult" : age < 45 ? "adult" : age < 62 ? "middle" : "senior";
}

function peopleFor(t: Traj, age: number, year: number): SceneSpec["people"] {
  const out: SceneSpec["people"] = [{ role: "self", ageBand: band(age) }];
  if (t.partner !== "none") out.push({ role: "partner", ageBand: band(age + 1) });
  for (const b of t.kids) if (year >= b) out.push({ role: "child", ageBand: band(year - b) });
  if (t.caring) out.push({ role: "parent", ageBand: "senior" });
  return out.slice(0, 6);
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------
export interface StartFacts {
  firstName: string;
  age: number;
  city: string;
  region: string | null;
  country: string;
  line: string;
}

export function craftOf(line: string): { noun: string; verb: string; person: string } {
  const l = line.toLowerCase();
  if (/paint|painting/.test(l)) return { noun: "paintings", verb: "paint", person: "Painter" };
  if (/draw|illustrat|art school|art/.test(l)) return { noun: "drawings", verb: "draw", person: "Illustrator" };
  if (/music|band|song|guitar|piano/.test(l)) return { noun: "songs", verb: "make music", person: "Musician" };
  if (/write|writing|novel|book|poem/.test(l)) return { noun: "writing", verb: "write", person: "Writer" };
  if (/film|video|photo/.test(l)) return { noun: "films", verb: "make films", person: "Filmmaker" };
  if (/cook|bake|restaurant|food/.test(l)) return { noun: "food", verb: "cook", person: "Cook" };
  if (/code|app|startup|build/.test(l)) return { noun: "work", verb: "build your own thing", person: "Founder" };
  return { noun: "work", verb: "make your own thing", person: "Maker" };
}

export function parentOf(line: string): string {
  const l = line.toLowerCase();
  if (/\bmom\b|\bmum\b|mother/.test(l)) return "Mom";
  if (/\bdad\b|father/.test(l)) return "Dad";
  if (/grandm/.test(l)) return "Grandma";
  return "your parents";
}

export function debtOf(line: string): number {
  const m = line.match(/\$?\s?(\d{1,3}(?:[.,]\d)?)\s?k\b/i) ?? line.match(/\$\s?(\d{1,3}(?:,\d{3})+)/);
  if (!m) return /loan|debt/i.test(line) ? 24000 : 0;
  const raw = m[1]!.replace(/,/g, "");
  return m[0].toLowerCase().includes("k") ? Math.round(parseFloat(raw) * 1000) : parseInt(raw, 10);
}

export function initialTraj(f: StartFacts): Traj {
  const pt = placeTraits(f.city, f.region, f.country);
  const craft = craftOf(f.line);
  const debt = debtOf(f.line);
  const l = f.line.toLowerCase();
  const age = f.age;
  const income = age < 23 ? 32000 : age < 30 ? 58000 : age < 40 ? 76000 : age < 55 ? 88000 : 82000;
  const nw = age < 30 ? 6000 - debt : Math.round(medianNetWorth(age) * 0.8) - debt;
  const t: Traj = {
    city: f.city,
    ...pt,
    home: age < 23 ? "shared_house" : age < 32 ? "apartment_small" : "apartment",
    work: age < 22 ? "Student" : "Working a steady job",
    workKind: age < 22 ? "employee" : "employee",
    drive: 0.5,
    caution: /money|scare|afraid|debt|loan/.test(l) ? 0.66 : 0.45,
    family: /mom|dad|family|parent/.test(l) ? 0.6 : 0.42,
    craft: /paint|art|draw|music|write|film|design/.test(l) ? 0.38 : 0.2,
    balance: 0.42,
    invest: "cash",
    partner: /wife|husband|married/.test(l) ? "married" : /partner|girlfriend|boyfriend/.test(l) ? "partner" : "none",
    partnerName: null,
    partnerSince: null,
    kidsPlan: "open",
    kids: [],
    parent: parentOf(f.line),
    farFromHome: false,
    caring: false,
    income,
    netWorth: nw,
    retireAge: 65,
    lastPromo: -99,
    shows: 0,
    risk: 22,
    craftNoun: craft.noun,
    craftVerb: craft.verb,
    craftPerson: craft.person,
    flags: {},
    queued: [],
    states: {
      career: 48, wealth: debt > 0 ? 34 : 48, achievement: 44, family: 58, relationships: 50, children: 50,
      mentalHealth: /anxious|tired|stress|scare|afraid/.test(l) ? 48 : 58, happiness: 56, lifeGoals: 40, risk: 22,
    },
  };
  if (t.partner !== "none") t.partnerName = "your partner";
  const job = jobOf(f.line);
  if (job) t.work = job;
  t.lastPromo = -99;
  return t;
}

function jobOf(line: string): string | null {
  const m = line.match(/\b(?:I'?m|I am|work(?:ing)? as|as)\s+an?\s+([a-z][a-z ]{2,40}?)(?:\s+at\s+([^.,]{2,40}))?[.,]/i);
  if (!m) return null;
  const role = m[1]!.trim();
  if (/afraid|scared|worried|bit|lot|little/.test(role)) return null;
  return `${role[0]!.toUpperCase()}${role.slice(1)}${m[2] ? ` at ${m[2].trim()}` : ""}`;
}
