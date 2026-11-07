/**
 * "Code owns the odds" (research/03 §3.2–3.5): the shared world timeline, money anchors, event
 * budgets and cooldowns, life-fact tracking and the base-rate candidate sampler. All pure.
 */
import { getBaseRate } from "../../shared/baseRates";
import type { DomainKey } from "../../shared/domains";
import type { EventCategory, LifeEvent, Profile, WorldEvent } from "../../shared/schema";
import type { SimYear } from "../../shared/sim";
import { AGE_BANDS, FLAVORS } from "../../shared/sim";
import { catastrophesIn } from "./shocks";
import { clamp, rng } from "./util";

type Flavor = (typeof FLAVORS)[number];
type AgeBand = (typeof AGE_BANDS)[number];

// ---------------------------------------------------------------------------------------------
// World timeline: one per session, shared by the chosen life and every branch (D-005)
// ---------------------------------------------------------------------------------------------

/** 1–2 downturns + at most 1 tech shift, at plausible years; deterministic per session. */
export function worldTimeline(seed: string, startYear: number, endYear: number): WorldEvent[] {
  const r = rng(`world:${seed}`);
  const span = endYear - startYear;
  const out: WorldEvent[] = [];
  if (span >= 6) {
    // NBER: a recession roughly every 6–7 years; we show at most two over a lifetime, the first
    // 4–9 years out so it lands inside most sessions.
    const y1 = startYear + 4 + Math.floor(r() * 6);
    out.push({ id: "w1", year: y1, kind: "downturn", title: "A two-year downturn" });
    if (span >= 22) {
      const y2 = y1 + 13 + Math.floor(r() * 8);
      if (y2 < endYear - 2) out.push({ id: "w2", year: y2, kind: "downturn", title: "A long, slow recession" });
    }
  }
  if (span >= 10 && out.length < 3) {
    const yt = startYear + 7 + Math.floor(r() * Math.min(10, span - 8));
    if (!out.some((w) => Math.abs(w.year - yt) < 3)) {
      out.push({ id: `w${out.length + 1}`, year: yt, kind: "tech_shift", title: "AI reshapes office work" });
    }
  }
  // The one world-scale shock (playtest feedback, Sat Nov 7): a pandemic-style disruption, kept
  // rarer than its real annual odds (owner: catastrophes must feel rare), at most once per session, never
  // within 3 years of a downturn. Its own dice, so the years above stay stable for old sessions.
  // A life shows at most 2 world events, so with a pandemic the world keeps only the first downturn.
  const rp = rng(`pandemic:${seed}`);
  for (let y = startYear + 2; y < endYear - 2; y++) {
    if (rp() >= PANDEMIC_ODDS) continue;
    if (out.some((w) => w.kind === "downturn" && Math.abs(w.year - y) < 3)) continue;
    const first = out.find((w) => w.kind === "downturn");
    const kept = first ? [first] : [];
    kept.push({ id: "", year: y, kind: "other", title: "A pandemic shuts things down for months" });
    return kept.sort((a, b) => a.year - b.year).map((w, i) => ({ ...w, id: `w${i + 1}` }));
  }
  return out.sort((a, b) => a.year - b.year);
}

/**
 * Annual odds of a pandemic in the sim. The real figure for a COVID-scale pandemic is ~2% a year
 * (Marani et al., PNAS 2021, `pandemic_odds`), which put one in ~47% of 45-year sessions. The owner
 * wants world catastrophes to be rare (Sat Nov 7), so the sim uses ~0.6% (about 1 session in 4).
 */
export const PANDEMIC_ODDS = 0.006;

export const downturnYears = (world: WorldEvent[]) =>
  new Set(world.filter((w) => w.kind === "downturn").flatMap((w) => [w.year, w.year + 1]));

// ---------------------------------------------------------------------------------------------
// Place → scene flavor
// ---------------------------------------------------------------------------------------------

const US_SOUTH = "AL AR FL GA KY LA MS NC OK SC TN TX VA WV".split(" ");
const US_NE = "CT DC DE MA MD ME NH NJ NY PA RI VT".split(" ");
const US_MW = "IA IL IN KS MI MN MO ND NE OH SD WI".split(" ");
const US_W = "AK AZ CA CO HI ID MT NM NV OR UT WA WY".split(" ");
const US_STATE_NAMES: Record<string, string> = {
  alabama: "AL", arkansas: "AR", florida: "FL", georgia: "GA", kentucky: "KY", louisiana: "LA", mississippi: "MS",
  "north carolina": "NC", oklahoma: "OK", "south carolina": "SC", tennessee: "TN", texas: "TX", virginia: "VA",
  "west virginia": "WV", connecticut: "CT", delaware: "DE", massachusetts: "MA", maryland: "MD", maine: "ME",
  "new hampshire": "NH", "new jersey": "NJ", "new york": "NY", pennsylvania: "PA", "rhode island": "RI", vermont: "VT",
  iowa: "IA", illinois: "IL", indiana: "IN", kansas: "KS", michigan: "MI", minnesota: "MN", missouri: "MO",
  "north dakota": "ND", nebraska: "NE", ohio: "OH", "south dakota": "SD", wisconsin: "WI", alaska: "AK", arizona: "AZ",
  california: "CA", colorado: "CO", hawaii: "HI", idaho: "ID", montana: "MT", "new mexico": "NM", nevada: "NV",
  oregon: "OR", utah: "UT", washington: "WA", wyoming: "WY",
};

const COUNTRY_FLAVOR: [Flavor, string[]][] = [
  ["europe_south", ["PT", "ES", "IT", "GR", "HR", "MT", "CY", "portugal", "spain", "italy", "greece", "croatia", "malta", "cyprus"]],
  ["europe_north", ["GB", "UK", "IE", "FR", "DE", "NL", "BE", "LU", "DK", "SE", "NO", "FI", "IS", "PL", "CZ", "AT", "CH", "EE", "LV", "LT",
    "england", "scotland", "wales", "united kingdom", "ireland", "france", "germany", "netherlands", "belgium", "denmark", "sweden",
    "norway", "finland", "iceland", "poland", "czechia", "austria", "switzerland", "london", "berlin", "paris", "amsterdam"]],
  ["east_asia", ["JP", "KR", "CN", "TW", "HK", "MO", "MN", "japan", "korea", "china", "taiwan", "hong kong", "tokyo", "seoul", "shanghai", "beijing"]],
  ["southeast_asia", ["SG", "TH", "VN", "MY", "ID", "PH", "KH", "MM", "LA", "BN", "singapore", "thailand", "vietnam", "malaysia",
    "indonesia", "philippines", "cambodia", "bangkok", "manila", "jakarta", "hanoi", "ho chi minh", "kuala lumpur"]],
  ["south_asia", ["IN", "PK", "BD", "LK", "NP", "BT", "MV", "india", "pakistan", "bangladesh", "sri lanka", "nepal", "bengaluru",
    "bangalore", "mumbai", "delhi", "hyderabad", "pune", "chennai", "karachi", "lahore", "dhaka"]],
  ["latam", ["MX", "BR", "AR", "CL", "CO", "PE", "UY", "EC", "BO", "PY", "VE", "CR", "PA", "GT", "DO", "PR", "CU", "mexico", "brazil",
    "argentina", "chile", "colombia", "peru", "uruguay", "ecuador", "costa rica", "são paulo", "sao paulo", "buenos aires", "bogotá", "bogota"]],
  ["middle_east", ["AE", "SA", "QA", "KW", "BH", "OM", "IL", "JO", "LB", "TR", "IR", "IQ", "EG", "uae", "united arab emirates", "dubai",
    "abu dhabi", "saudi", "qatar", "israel", "jordan", "lebanon", "turkey", "türkiye", "istanbul", "egypt", "cairo"]],
  ["africa", ["NG", "KE", "ZA", "GH", "ET", "MA", "RW", "TZ", "UG", "SN", "CI", "CM", "ZW", "nigeria", "kenya", "south africa", "ghana",
    "ethiopia", "morocco", "rwanda", "tanzania", "uganda", "senegal", "lagos", "nairobi", "cape town", "johannesburg", "accra"]],
  ["oceania", ["AU", "NZ", "FJ", "australia", "new zealand", "fiji", "sydney", "melbourne", "auckland"]],
];

function usFlavor(code: string): Flavor | null {
  if (US_SOUTH.includes(code)) return "us_south";
  if (US_NE.includes(code)) return "us_northeast";
  if (US_MW.includes(code)) return "us_midwest";
  if (US_W.includes(code)) return "us_west";
  return null;
}

/** Best guess of the scene flavor for a place string like "Durham, NC" or "Lisbon, Portugal". */
export function flavorFor(place: string, fallbackCountry?: string | null, fallbackRegion?: string | null): Flavor | null {
  const p = place.toLowerCase();
  const tail = place.split(",").map((s) => s.trim());
  const last = tail[tail.length - 1] ?? "";
  if (/^[A-Z]{2}$/.test(last)) {
    const f = usFlavor(last);
    if (f) return f;
  }
  for (const [name, code] of Object.entries(US_STATE_NAMES)) if (p.includes(name)) return usFlavor(code);
  for (const [flavor, keys] of COUNTRY_FLAVOR) {
    for (const k of keys) {
      if (k.length === 2) {
        if (last.toUpperCase() === k) return flavor;
      } else if (p.includes(k)) return flavor;
    }
  }
  if (/\b(usa|united states|u\.s\.)\b/.test(p) && fallbackRegion) return usFlavor(fallbackRegion.toUpperCase());
  if (/\bcanada\b|toronto|montreal|ottawa/.test(p)) return "us_northeast";
  if (/vancouver|calgary/.test(p)) return "us_west";
  if (fallbackCountry) {
    if (fallbackCountry.toUpperCase() === "US" && fallbackRegion) return usFlavor(fallbackRegion.toUpperCase());
    if (fallbackCountry.toUpperCase() === "CA") return "us_northeast";
    for (const [flavor, keys] of COUNTRY_FLAVOR) if (keys.includes(fallbackCountry.toUpperCase())) return flavor;
  }
  return null;
}

/** Snow is plausible only in winter and not in the tropics/deserts. */
export const snowPlausible = (flavor: string, season: string) =>
  season === "winter" && !["southeast_asia", "south_asia", "middle_east", "africa", "latam", "oceania"].includes(flavor);

export function selfAgeBand(age: number): AgeBand {
  if (age < 25) return "young_adult";
  if (age < 40) return "adult";
  if (age < 60) return "middle";
  return "senior";
}

// ---------------------------------------------------------------------------------------------
// Money anchors (D-008: real $, grounded in base rates; today's dollars)
// ---------------------------------------------------------------------------------------------

/**
 * Rough median full-time annual earnings in USD (2025, derived from national statistics; the
 * US number is BLS `weekly_earnings`). Only a default when the user gave no income. Approximate.
 */
const COUNTRY_MEDIAN_USD: Record<string, number> = {
  US: 62600, CA: 50000, GB: 47000, IE: 50000, DE: 52000, FR: 40000, NL: 50000, BE: 50000, CH: 85000, AT: 48000,
  SE: 45000, NO: 60000, DK: 58000, FI: 45000, ES: 30000, PT: 20000, IT: 32000, GR: 20000, PL: 18000, CZ: 22000,
  AU: 60000, NZ: 42000, JP: 31000, KR: 35000, TW: 25000, HK: 30000, SG: 50000, CN: 15000, TH: 6500, VN: 4200,
  MY: 9000, ID: 4000, PH: 4500, IN: 4500, PK: 2500, BD: 2300, LK: 3000, BR: 8000, MX: 7000, AR: 7000, CL: 11000,
  CO: 5500, PE: 5500, AE: 40000, SA: 30000, IL: 40000, TR: 9000, EG: 3000, NG: 2000, KE: 2500, ZA: 12000, GH: 2200,
};
export const countryMedianIncome = (country: string) => COUNTRY_MEDIAN_USD[country.toUpperCase()] ?? 15000;

/** Earnings path (Guvenen et al. 2021, `earnings_growth`): +60% from 25 to 55, most before 45. */
function earningsCurve(age: number): number {
  if (age <= 22) return 0.7;
  if (age <= 25) return 0.7 + 0.1 * (age - 22);
  if (age <= 45) return 1 + 0.48 * ((age - 25) / 20);
  if (age <= 55) return 1.48 + 0.12 * ((age - 45) / 10);
  if (age <= 62) return 1.6;
  return 0.45; // retired: pensions / social security / drawdown, roughly
}

/** SCF 2022 medians by age band (`net_worth_age`). */
function usNetWorthMedian(age: number): number {
  if (age < 35) return 39000 * clamp((age - 18) / 12, 0.05, 1.1);
  if (age < 45) return 135000;
  if (age < 55) return 247000;
  if (age < 65) return 364000;
  return 410000;
}

export interface MoneyAnchor {
  age: number;
  income: number;
  netWorthMedian: number;
  /** Pay where they live now vs. where they started (1 = same country). */
  placeScale: number;
}

/**
 * `here`: the country the life is in now (countryOf(place)). After a move, pay re-anchors to the
 * place: the same work pays ~sqrt(local median / home median) as much in USD (Bangkok vs the US:
 * ~1/3; Singapore: ~0.9), and wealth follows part of the way (what they had comes with them).
 * QA caught a Durham-to-Bangkok life on US pay, $198k -> $2.1M in three years.
 */
export function moneyAnchor(profile: Profile, age: number, here?: string | null): MoneyAnchor {
  const med = countryMedianIncome(profile.country);
  const base = profile.money.incomeUsd ?? Math.round(med * (profile.age < 23 ? 0.35 : 1));
  const income = Math.round((base * earningsCurve(age)) / earningsCurve(profile.age) / 500) * 500;
  const countryScale = med / 62600;
  const personalScale = Math.sqrt(clamp(base / med, 0.3, 4));
  const nw = Math.round((usNetWorthMedian(age) * countryScale * personalScale) / 1000) * 1000;
  const away = here && here.toUpperCase() !== profile.country.toUpperCase() && COUNTRY_MEDIAN_USD[here.toUpperCase()];
  const k = away ? clamp(Math.sqrt(countryMedianIncome(here!) / med), 0.25, 1.6) : 1;
  return { age, income: Math.round((income * k) / 500) * 500, netWorthMedian: Math.round((nw * (0.4 + 0.6 * k)) / 1000) * 1000, placeScale: k };
}

const PLACE_COUNTRY: [RegExp, string][] = [
  [/\b(usa|united states|u\.s\.)\b/, "US"], [/\bcanada\b|toronto|montreal|vancouver|calgary|ottawa/, "CA"],
  [/united kingdom|england|scotland|wales|london|manchester|edinburgh|leeds|bristol/, "GB"], [/ireland|dublin|cork\b/, "IE"],
  [/germany|berlin|munich|hamburg|frankfurt/, "DE"], [/france|paris|lyon|marseille|arles|bordeaux|nice\b/, "FR"], [/netherlands|amsterdam|rotterdam/, "NL"],
  [/belgium|brussels/, "BE"], [/switzerland|zurich|zürich|geneva|basel/, "CH"], [/austria|vienna/, "AT"], [/sweden|stockholm/, "SE"], [/norway|oslo/, "NO"],
  [/denmark|copenhagen/, "DK"], [/finland|helsinki/, "FI"], [/spain|madrid|barcelona|valencia|seville|sevilla|málaga|malaga/, "ES"], [/portugal|lisbon|porto\b/, "PT"],
  [/italy|rome|milan|florence|naples|bologna/, "IT"], [/greece|athens/, "GR"], [/poland|warsaw|krak/, "PL"], [/czech|prague/, "CZ"],
  [/australia|sydney|melbourne|brisbane|perth\b/, "AU"], [/new zealand|auckland|wellington/, "NZ"], [/japan|tokyo|osaka|kyoto/, "JP"], [/korea|seoul|busan/, "KR"],
  [/taiwan|taipei/, "TW"], [/hong kong/, "HK"], [/singapore/, "SG"], [/china|shanghai|beijing|shenzhen/, "CN"], [/thailand|bangkok|chiang mai|phuket/, "TH"],
  [/vietnam|hanoi|ho chi minh|saigon|da nang/, "VN"], [/malaysia|kuala lumpur|penang|george town/, "MY"], [/indonesia|jakarta|bali\b/, "ID"],
  [/philippines|manila|cebu/, "PH"], [/india|bengaluru|bangalore|mumbai|delhi|hyderabad|pune|chennai|kolkata/, "IN"], [/pakistan|karachi|lahore/, "PK"],
  [/bangladesh|dhaka/, "BD"], [/sri lanka|colombo/, "LK"], [/brazil|são paulo|sao paulo|rio de janeiro/, "BR"], [/mexico|guadalajara|oaxaca|monterrey/, "MX"],
  [/argentina|buenos aires/, "AR"], [/chile|santiago/, "CL"], [/colombia|bogot|medell/, "CO"], [/peru\b|lima\b/, "PE"], [/uae|united arab emirates|dubai|abu dhabi/, "AE"],
  [/saudi|riyadh/, "SA"], [/israel|tel aviv/, "IL"], [/turkey|türkiye|istanbul/, "TR"], [/egypt|cairo/, "EG"], [/nigeria|lagos|abuja/, "NG"], [/kenya|nairobi/, "KE"],
  [/south africa|cape town|johannesburg/, "ZA"], [/ghana|accra/, "GH"],
];

/** The country (ISO-2) of a place string like "Bangkok, Thailand" or "Durham, NC"; null if unsure. */
export function countryOf(place: string): string | null {
  if (!place) return null;
  const p = place.toLowerCase();
  const last = place.split(",").map((s) => s.trim()).at(-1) ?? "";
  if (last === "US" || (/^[A-Z]{2}$/.test(last) && usFlavor(last))) return "US";
  for (const name of Object.keys(US_STATE_NAMES)) if (p.includes(name)) return "US";
  for (const [rx, code] of PLACE_COUNTRY) if (rx.test(p)) return code;
  if (/^[A-Z]{2}$/.test(last) && COUNTRY_MEDIAN_USD[last]) return last;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Budgets and cooldowns (research/03 §3.4). Counted on turning points only.
// ---------------------------------------------------------------------------------------------

export interface CategoryRule {
  max: (span: number) => number;
  cooldown: number;
  statId: string | null;
}

export const CATEGORY_RULES: Partial<Record<EventCategory, CategoryRule>> = {
  career_move: { max: (s) => Math.max(3, Math.round(s / 3)), cooldown: 2, statId: "jobs_by_age" },
  career_change: { max: () => 3, cooldown: 5, statId: "occ_switch" },
  job_loss: { max: () => 2, cooldown: 5, statId: "displacement" },
  burnout: { max: () => 2, cooldown: 4, statId: "stress_work" },
  love_start: { max: () => 4, cooldown: 1, statId: "marriage_age" },
  love_end: { max: () => 4, cooldown: 1, statId: null },
  marriage: { max: () => 2, cooldown: 3, statId: "marriage_age" },
  divorce: { max: () => 1, cooldown: 99, statId: "marriage_survival" },
  child: { max: () => 3, cooldown: 2, statId: "first_birth_age" },
  move: { max: () => 4, cooldown: 2, statId: "moving" },
  home: { max: () => 2, cooldown: 5, statId: "first_home" },
  money_up: { max: () => 2, cooldown: 3, statId: "earnings_growth" },
  money_down: { max: () => 2, cooldown: 3, statId: null },
  caregiving: { max: () => 1, cooldown: 99, statId: "caregiving" },
  friendship: { max: (s) => Math.max(1, Math.ceil(s / 10)), cooldown: 4, statId: "close_friends" },
  health_habit: { max: (s) => Math.max(1, Math.ceil(s / 10)), cooldown: 4, statId: null },
  world_context: { max: () => 2, cooldown: 3, statId: "recessions" },
};

/** Negative turning points that count toward the "1 per 3 years" shock cap. */
export const SHOCK_CATEGORIES = new Set<EventCategory>(["job_loss", "divorce", "love_end", "burnout", "money_down"]);

export interface BudgetLedger {
  counts: Partial<Record<EventCategory, number>>;
  lastYear: Partial<Record<EventCategory, number>>;
  shockYears: number[];
  worldIds: Set<string>;
  parentDeaths: number;
  /** Catastrophes written in this life (kind -> year): each may happen at most once (shocks.ts). */
  catastrophes: Record<string, number>;
}

export function ledgerFrom(years: SimYear[], world: WorldEvent[] = []): BudgetLedger {
  const l: BudgetLedger = { counts: {}, lastYear: {}, shockYears: [], worldIds: new Set(), parentDeaths: 0, catastrophes: {} };
  for (const y of years) for (const e of y.events) recordEvent(l, y.year, e, worldIdFor(world, y.year));
  return l;
}

export function recordEvent(l: BudgetLedger, year: number, e: LifeEvent, worldId?: string | null) {
  if (e.category === "world_context") l.worldIds.add(worldId ?? `w@${year}`);
  if (PARENT_DEATH_RE.test(`${e.title} ${e.narrative}`)) l.parentDeaths++;
  for (const k of catastrophesIn(`${e.title}. ${e.narrative}`)) l.catastrophes[k] ??= year;
  if (!e.isTurningPoint && e.category !== "world_context") return;
  l.counts[e.category] = (l.counts[e.category] ?? 0) + 1;
  l.lastYear[e.category] = year;
  if (e.tone === "down" && SHOCK_CATEGORIES.has(e.category)) l.shockYears.push(year);
}

export const PARENT_DEATH_RE =
  /\b(mom|mum|mother|dad|father|parent|grandma|grandpa|amma|appa|mami|papi)\b[^.]{0,60}\b(pass(?:es|ed)? away|died|dies|death|funeral)\b|\b(pass(?:es|ed)? away|died|dies|death|funeral)\b[^.]{0,40}\b(mom|mum|mother|dad|father|parent)\b/i;

// ---------------------------------------------------------------------------------------------
// Life facts derived from years (for hazards, divergence and slot placement)
// ---------------------------------------------------------------------------------------------

export interface LifeFacts {
  place: string;
  partnered: boolean;
  married: boolean;
  children: number;
  homeowner: boolean;
  caregiving: boolean;
  lastMoveYear: number | null;
  lastJobYear: number | null;
  retired: boolean;
}

const RE_PARTNER = /\b(partner|wife|husband|fianc[eé]e?|girlfriend|boyfriend|spouse|married)\b/i;

export function lifeFacts(profile: Profile, years: SimYear[]): LifeFacts {
  const rel = profile.facts.find((f) => f.key === "relationship")?.value ?? "";
  let partnered = profile.people.some((p) => /partner|wife|husband|spouse|girlfriend|boyfriend|fianc/i.test(p.relation)) ||
    (/partner|married|wife|husband|girlfriend|boyfriend|engaged|fianc/i.test(rel) && !/single|not married|divorced/i.test(rel));
  let married = /married|wife|husband|spouse/i.test(rel) && !/not married|divorced/i.test(rel);
  const kidsFact = profile.facts.find((f) => f.key === "children")?.value ?? "";
  const kidNum = kidsFact.match(/\b(\d)\b/);
  let children = kidNum ? Number(kidNum[1]) : /\b(a|one) (son|daughter|kid|child)\b/i.test(kidsFact) ? 1 : /\btwo\b/i.test(kidsFact) ? 2 : /\bthree\b/i.test(kidsFact) ? 3 : 0;
  if (children === 0) children = profile.people.filter((p) => /son|daughter|child|kid/i.test(p.relation)).length;
  let homeowner = /\b(own|mortgage|bought)\b/i.test(profile.facts.find((f) => f.key === "living")?.value ?? "") || profile.money.debtKind === "mortgage";
  let caregiving = profile.constraints.some((c) => c.kind === "caregiving");
  let lastMoveYear: number | null = null;
  let lastJobYear: number | null = null;
  let retired = false;
  let place = profile.city ? `${profile.city}${profile.region ? `, ${profile.region}` : ""}` : profile.country;
  for (const y of years) {
    place = y.place || place;
    for (const e of y.events) {
      const t = `${e.title} ${e.narrative}`;
      if (e.category === "love_start") partnered = true;
      if (e.category === "love_end") partnered = false;
      if (e.category === "marriage") (married = true), (partnered = true);
      if (e.category === "divorce") (married = false), (partnered = false);
      if (e.category === "child") children++;
      if (e.category === "home") homeowner = !/\bsell|sold|downsiz/i.test(t) || homeowner;
      if (e.category === "move") lastMoveYear = y.year;
      if (e.category === "career_move" || e.category === "career_change") lastJobYear = y.year;
      if (e.category === "caregiving") caregiving = !/\bend|ends|over|moves? in with your sister/i.test(t);
      if (/\bretire/i.test(t)) retired = true;
    }
    const sp = y.scene.people;
    if (sp.some((p) => p.role === "partner")) partnered = true;
    const kidsInScene = sp.filter((p) => p.role === "child").length;
    if (kidsInScene > children) children = kidsInScene;
    if (["house", "house_large", "townhouse"].includes(y.scene.home) && y.money.netWorth > 40000) homeowner = true;
    if (RE_PARTNER.test(y.summary) && /\bmarr/i.test(y.summary)) married = true;
  }
  return { place, partnered, married, children, homeowner, caregiving, lastMoveYear, lastJobYear, retired };
}

// ---------------------------------------------------------------------------------------------
// Candidate sampler: base-rate hazards → suggested beats for a stretch of years
// ---------------------------------------------------------------------------------------------

export interface Candidate {
  year: number;
  age: number;
  category: EventCategory;
  domain: DomainKey;
  hint: string;
  statId: string | null;
}

function hazards(age: number, f: LifeFacts, year: number, downturns: Set<number>, profile: Profile): [EventCategory, DomainKey, number, string][] {
  const out: [EventCategory, DomainKey, number, string][] = [];
  const jobRate = age < 25 ? 0.45 : age < 35 ? 0.37 : age < 45 ? 0.29 : age < 57 ? 0.2 : 0.08;
  if (!f.retired) {
    out.push(["career_move", "career", jobRate * 0.7, "a new job, promotion or transfer"]);
    out.push(["job_loss", "career", downturns.has(year) ? 0.026 : 0.013, downturns.has(year) ? "a layoff in the downturn" : "a layoff or closure"]);
    out.push(["career_change", "career", 0.064, "a real change of field, school or a business"]);
    out.push(["burnout", "mentalHealth", age >= 27 && age <= 58 ? 0.045 : 0.015, "an exhausting stretch at work"]);
  }
  if (!f.partnered) out.push(["love_start", "relationships", age < 45 ? 0.22 : 0.09, "meeting someone"]);
  if (f.partnered && !f.married) out.push(["marriage", "relationships", age >= 26 && age <= 40 ? 0.22 : 0.08, "getting married or committing"]);
  if (f.married) out.push(["divorce", "relationships", 0.013, "a separation"]);
  if (f.partnered && age >= 26 && age <= 41 && f.children < 3) out.push(["child", "children", f.children === 0 ? 0.16 : 0.12, f.children === 0 ? "a first child, if they want one" : "another child"]);
  out.push(["move", "lifeGoals", age < 30 ? 0.2 : age < 40 ? 0.11 : age < 60 ? 0.06 : 0.05, "a move"]);
  const homeAge = 40 + (profile.money.feel === "tight" ? 3 : 0) - (profile.facts.some((x) => x.key === "education" && /bachelor|degree|university|college|master|phd/i.test(x.value)) ? 2 : 0);
  if (!f.homeowner && age >= 27) out.push(["home", "wealth", Math.max(0.03, 0.14 - Math.abs(age - homeAge) * 0.012), "buying a first home"]);
  const hasParents = profile.people.some((p) => /mother|father|mom|dad|parent/i.test(`${p.relation} ${p.label}`)) || profile.age < 50;
  if (hasParents && age >= 40 && age <= 64 && !f.caregiving) out.push(["caregiving", "family", 0.06, "a stretch of caring for a parent"]);
  out.push(["achievement", "achievement", 0.18, "finishing or making something they're proud of"]);
  out.push(["friendship", "relationships", 0.09, "a friendship that grows, fades or comes back"]);
  out.push(["health_habit", "mentalHealth", 0.09, "a habit change (running, sleep, quitting something)"]);
  out.push(["money_up", "wealth", 0.05, "a money win (bonus, raise, side income)"]);
  out.push(["money_down", "wealth", downturns.has(year) ? 0.08 : 0.04, "a money setback (big expense, bad investment)"]);
  if (age >= 58 && !f.retired) out.push(["career_move", "career", age >= 62 ? 0.35 : 0.12, "retiring (often earlier than planned)"]);
  return out;
}

/**
 * Sample suggested beats for `years` from base-rate hazards, after budgets and cooldowns.
 * The writer may use, adapt or skip them (research/03 §3.2 step 1).
 */
export function sampleCandidates(
  seed: string,
  profile: Profile,
  pastYears: SimYear[],
  targetYears: number[],
  world: WorldEvent[],
  ledger: BudgetLedger,
  span: number,
  stepYears = 1,
): Candidate[] {
  const r = rng(`cand:${seed}:${targetYears[0]}`);
  const facts = lifeFacts(profile, pastYears);
  const downs = downturnYears(world);
  const counts = { ...ledger.counts };
  const last = { ...ledger.lastYear };
  const out: Candidate[] = [];
  let lastShock = ledger.shockYears.length ? Math.max(...ledger.shockYears) : -99;
  for (const year of targetYears) {
    const age = year - profile.birthYear;
    for (const [cat, domain, h, hint] of hazards(age, facts, year, downs, profile)) {
      const rule = CATEGORY_RULES[cat];
      if (rule) {
        if ((counts[cat] ?? 0) >= rule.max(span)) continue;
        const ly = last[cat];
        if (ly !== undefined && year - ly < rule.cooldown) continue;
      }
      // the shock cap (1 major setback per 3 years) applies to the dice too
      const shock = SHOCK_CATEGORIES.has(cat);
      if (shock && year - lastShock < 3) continue;
      const p = 1 - Math.pow(1 - h, stepYears);
      if (r() < p) {
        const rule2 = CATEGORY_RULES[cat];
        out.push({ year, age, category: cat, domain, hint, statId: rule2?.statId ?? null });
        counts[cat] = (counts[cat] ?? 0) + 1;
        last[cat] = year;
        if (shock) lastShock = year;
        if (cat === "love_start") facts.partnered = true;
        if (cat === "marriage") facts.married = true;
        if (cat === "child") facts.children++;
        if (cat === "home") facts.homeowner = true;
      }
    }
  }
  return out;
}

export const statDisplay = (id: string | null) => (id ? getBaseRate(id)?.display ?? null : null);

/** The world event a world_context event in `year` refers to (it starts that year or up to 2 before). */
export const worldIdFor = (world: WorldEvent[], year: number): string | null =>
  world.find((w) => year >= w.year && year <= w.year + 2)?.id ?? null;
