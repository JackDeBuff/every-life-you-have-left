/**
 * Life shocks (playtest feedback, Sat Nov 7): the things that happen TO a life, not only the forks
 * it takes. Code owns the odds, so they stay realistic and never repeat ("5 hurricanes hit my home
 * in another game: absurd"):
 *   - one deterministic plan per life (seeded by session + life id), at real-world annual odds,
 *     scaled to "worth a line in a life story" (base rates in shared/baseRates.ts where we have them)
 *   - at most ONE of each type per life, at most ONE natural disaster, at most 1-3 shocks per life
 *     (by span), >= 4 years apart; most lives get 0-2, and some shocks are good luck
 *   - the one world-scale shock (a pandemic) lives in the shared world timeline (world.ts), so it
 *     is the same in every life of the session
 *   - a shock already written in the life's past (any life: a branch shares the chosen life's past)
 *     uses up its type, so a branch never gets a second flood
 * The writer must show a planned shock in its year (WILL HAPPEN); the decision card nearest to it
 * asks how they respond (focus.ts). validate.ts rejects a repeated or invented catastrophe.
 */
import type { DomainKey } from "../../shared/domains";
import type { EventCategory, LifeEvent, Profile, WorldEvent } from "../../shared/schema";
import type { SimYear } from "../../shared/sim";
import { rng } from "./util";

export type ShockScope = "personal" | "natural" | "world";

export interface Shock {
  /** Stable type id (one per life). */
  type: string;
  scope: ShockScope;
  year: number;
  age: number;
  tone: "up" | "down" | "mixed";
  /** Categories the writer may file it under (budgets don't block a code-planned shock). */
  cats: EventCategory[];
  domain: DomainKey;
  statId: string | null;
  /** What happens, for the writer. */
  what: string;
  /** How a decision card poses it. */
  ask: string;
}

interface Ctx {
  age: number;
  /** Years since the simulation started. */
  t: number;
  renter: boolean;
  /** Rough age of their parents this year (null if no parents in the picture). */
  parentAge: number | null;
  visa: boolean;
  hazard: Hazard;
}

type Hazard = "hurricane" | "typhoon" | "wildfire" | "quake" | "flood";

interface ShockDef {
  type: string;
  scope: Exclude<ShockScope, "world">;
  tone: Shock["tone"];
  cats: EventCategory[];
  domain: DomainKey;
  statId: string | null;
  /** Annual odds that this becomes a story beat in this life (0 = not possible). */
  p: (c: Ctx) => number;
  what: (c: Ctx) => string;
  ask: string;
}

const HAZARD_WHAT: Record<Hazard, string> = {
  hurricane: "a hurricane floods the ground floor of their place; they stay with someone for weeks while it dries out",
  typhoon: "a typhoon floods their street and their place; weeks of repairs",
  wildfire: "a wildfire evacuation order: they leave with a bag and the documents; the place survives, smoke-damaged",
  quake: "an earthquake cracks walls in their building; they can't stay there for a month",
  flood: "a storm floods their place (the basement, the ground floor, the car); weeks of drying out and an insurance fight",
};

/**
 * The deck. Annual odds are the base rate scaled to events big enough to matter in a life story
 * (most burglaries and claims are small). Expected ~1.5 shocks over a 45-year life before caps.
 */
const DECK: ShockDef[] = [
  {
    type: "home_disaster", scope: "natural", tone: "down", cats: ["money_down", "move"], domain: "wealth", statId: "disaster_displaced",
    p: (c) => (c.hazard === "flood" ? 0.0025 : 0.005),
    what: (c) => HAZARD_WHAT[c.hazard],
    ask: "Rebuild here, move somewhere safer, or let it change the plan",
  },
  {
    type: "burglary", scope: "personal", tone: "down", cats: ["money_down"], domain: "wealth", statId: "burglary",
    p: () => 0.004,
    what: () => "a break-in while they're out: the laptop, a few things that can't be replaced; nobody home, nobody hurt",
    ask: "What they do about feeling safe at home again",
  },
  {
    type: "property_accident", scope: "personal", tone: "down", cats: ["money_down"], domain: "wealth", statId: null,
    p: () => 0.004,
    what: () => "an accident to property, nobody hurt: a burst pipe, a small kitchen fire, or the parked car written off; an unplanned bill",
    ask: "Where the unplanned money comes from",
  },
  {
    type: "scam", scope: "personal", tone: "down", cats: ["money_down"], domain: "wealth", statId: "fraud_losses",
    p: (c) => (c.age >= 60 ? 0.006 : 0.004),
    what: () => "a convincing scam (a fake bank call, an investment 'opportunity') costs them real money and some pride",
    ask: "Who they tell, and what they change",
  },
  {
    type: "friend_trouble", scope: "personal", tone: "mixed", cats: ["friendship"], domain: "relationships", statId: null,
    p: () => 0.007,
    what: () => "a close friend is in trouble (a divorce, a lost job, debts) and asks for help: a loan, a couch, their time",
    ask: "How much they give, and what it costs them",
  },
  {
    type: "parent_scare", scope: "personal", tone: "mixed", cats: ["caregiving"], domain: "family", statId: "caregiving",
    p: (c) => (c.parentAge !== null && c.parentAge >= 66 && c.parentAge <= 88 ? 0.012 : 0),
    what: () => "a parent's health scare: a fall or a week in hospital; they recover, slower, and the family starts talking about help (never a death)",
    ask: "Who goes, who pays, and what they rearrange",
  },
  {
    type: "windfall", scope: "personal", tone: "up", cats: ["money_up"], domain: "wealth", statId: null,
    p: (c) => (c.age >= 28 && c.age <= 66 ? 0.004 : 0),
    what: () => "a windfall: a small inheritance from a relative they barely knew, an old savings account, or a family gift (say 'leaves you', never describe a death)",
    ask: "What the money is really for",
  },
  {
    type: "lucky_break", scope: "personal", tone: "up", cats: ["achievement", "career_move", "money_up"], domain: "lifeGoals", statId: null,
    p: () => 0.008,
    what: () => "a lucky break tied to their own thing: a stranger at a dinner, an old contact calling back, something they made travelling further than expected",
    ask: "Whether they say yes to the door that just opened",
  },
  {
    type: "housing_shake", scope: "personal", tone: "mixed", cats: ["move", "money_down"], domain: "lifeGoals", statId: "moving",
    p: (c) => (c.renter && c.age < 50 ? 0.012 : 0),
    what: () => "the landlord sells, or the rent jumps 20%: sixty days to decide where to live",
    ask: "Stay and pay, move somewhere cheaper, or move somewhere new",
  },
  {
    type: "visa_snag", scope: "personal", tone: "mixed", cats: ["money_down", "career_move", "move"], domain: "lifeGoals", statId: null,
    p: (c) => (c.visa && c.t <= 8 ? 0.06 : 0),
    what: () => "a paperwork snag in their visa renewal (a delay, a request for more documents): weeks of limbo, a lawyer's fee, a trip home postponed. Practical, never about their status itself",
    ask: "Wait it out, change the plan, or go home for a while",
  },
];

const HURRICANE_US = new Set(["FL", "LA", "TX", "MS", "AL", "GA", "SC", "NC", "PR"]);
const WILDFIRE_US = new Set(["CA", "OR", "WA", "CO", "AZ", "NM", "NV", "ID", "MT", "UT"]);
const TYPHOON = new Set(["PH", "JP", "TW", "HK", "VN", "CN", "KR", "BD", "IN"]);
const QUAKE = new Set(["TR", "CL", "NZ", "MX", "PE", "ID", "GR", "IR", "NP"]);

export function hazardOf(p: Pick<Profile, "country" | "region">): Hazard {
  const c = p.country.toUpperCase();
  const r = (p.region ?? "").toUpperCase();
  if (c === "US" && HURRICANE_US.has(r)) return "hurricane";
  if (c === "US" && WILDFIRE_US.has(r)) return "wildfire";
  if (c === "AU" || c === "GR" || c === "PT") return "wildfire";
  if (TYPHOON.has(c)) return "typhoon";
  if (QUAKE.has(c)) return "quake";
  return "flood";
}

const VISA_RE = /\b(visa|work permit|h-?1b|green card|residence permit|residency permit|immigration paperwork)\b/i;
const OWNER_RE = /\b(own|owns|mortgage|bought|homeowner)\b/i;

function stableFacts(p: Profile): { renter: boolean; parentsBorn: number | null; visa: boolean } {
  const living = p.facts.filter((f) => f.key === "living" || f.key === "location").map((f) => f.value).join(" ");
  const said = p.quotes.map((q) => q.text).join(" ");
  const renter = !(OWNER_RE.test(living) || /\b(we|i) own\b|\bmortgage\b/i.test(said) || p.money.debtKind === "mortgage");
  const parents = p.people.filter((x) => /mother|father|mom|dad|parent|mum/i.test(`${x.relation} ${x.label}`));
  const born = parents.map((x) => x.born).filter((b): b is number => typeof b === "number");
  // ~30 years older unless stated; parents of an older user are assumed out of the picture
  const parentsBorn = born.length ? Math.min(...born) : parents.length || p.age < 55 ? p.birthYear - 30 : null;
  const visa = p.constraints.some((c) => c.kind === "visa") || p.facts.some((f) => VISA_RE.test(f.value)) || p.quotes.some((q) => VISA_RE.test(q.text));
  return { renter, parentsBorn, visa };
}

/** Max shocks in one life, by its span (a 15-year life gets at most 1). */
export const maxShocks = (span: number) => (span >= 30 ? 3 : span >= 15 ? 2 : 1);
/** Minimum years between two shocks in one life. */
export const SHOCK_GAP = 4;

/**
 * The whole-life plan for one life (deterministic). Lives differ by `lifeId` ("you" or a branch
 * id). The world's pandemic is excluded here (it is in the world timeline) but no personal shock
 * lands within 2 years of it or in the first simulated year (today is known).
 */
export function planShocks(seed: string, lifeId: string, profile: Profile, world: WorldEvent[] = []): Shock[] {
  const r = rng(`shock:${seed}:${lifeId}`);
  const endYear = profile.birthYear + profile.endAge;
  const span = endYear - profile.startYear;
  const f = stableFacts(profile);
  const hazard = hazardOf(profile);
  const worldShock = world.filter((w) => w.kind === "other").map((w) => w.year);
  const used = new Set<string>();
  const out: Shock[] = [];
  let natural = false;
  let last = -99;
  // the deck's order is shuffled per life so the same type doesn't always win a tie year
  const order = DECK.map((d) => ({ d, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.d);
  for (let year = profile.startYear + 1; year < endYear; year++) {
    const age = year - profile.birthYear;
    const ctx: Ctx = { age, t: year - profile.startYear, renter: f.renter, parentAge: f.parentsBorn === null ? null : year - f.parentsBorn, visa: f.visa, hazard };
    for (const d of order) {
      const roll = r(); // always drawn, so one type's eligibility never shifts another's dice
      if (out.length >= maxShocks(span) || used.has(d.type) || year - last < SHOCK_GAP) continue;
      if (d.scope === "natural" && natural) continue;
      if (worldShock.some((w) => Math.abs(w - year) <= 2)) continue;
      if (roll >= d.p(ctx)) continue;
      used.add(d.type);
      if (d.scope === "natural") natural = true;
      last = year;
      out.push({ type: d.type, scope: d.scope, year, age, tone: d.tone, cats: d.cats, domain: d.domain, statId: d.statId, what: d.what(ctx), ask: d.ask });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Recognising shocks in written text (past years, and the validator)
// ---------------------------------------------------------------------------------------------

/** A reference back to an earlier event, not a new one ("since the flood", "rebuilt after it"). */
const BACK_REF = /\b(still|since the|after the|remember\w*|anniversary|rebuil\w*|years ago|last year's|the old|recovered from)\b/i;

/** Text patterns per shock type (null = not recognisable from text; the plan alone counts it). */
export const SHOCK_TEXT: Record<string, RegExp | null> = {
  home_disaster: /\b(hurricane|typhoon|cyclone|tornado|wildfire|earthquake|storm surge|mudslide|landslide|evacuat\w*)\b|\bflood(?:s|ed|ing|water|waters)?\b(?!\s+(?:of|with|in|back)\b)/i,
  burglary: /\b(burglar\w*|break-in|broken into|burgled|robbed)\b/i,
  property_accident: /\b(burst pipe|pipe burst\w*|pipes burst|kitchen fire|house fire|apartment fire|written off|totall?ed)\b/i,
  scam: /\b(scam\w*|scammer\w*|phish\w*|swindl\w*|con artist|defraud\w*)\b/i,
  pandemic: /\b(pandemic|lockdowns?|epidemic)\b/i,
  housing_shake: /\b(landlord (?:sells|is selling|sold|decides to sell)|rent (?:jumps|goes up|hike|rises)|lease (?:isn't|is not|won't be) renewed|eviction notice)\b/i,
  windfall: /\b(inherit\w*|windfall|leaves you \$?[\d,]+)/i,
  visa_snag: /\bvisa\b[^.]{0,50}\b(delay\w*|stuck|limbo|request for (?:more )?(?:evidence|documents)|RFE|snag)\b/i,
  friend_trouble: null,
  parent_scare: null,
  lucky_break: null,
};

/** Catastrophe kinds that may happen at most once per life (the validator's repeat check). */
export const CATASTROPHES = ["home_disaster", "burglary", "property_accident", "scam", "pandemic"] as const;

/** Catastrophe kinds a piece of text describes as happening now (references back are ignored). */
export function catastrophesIn(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?;])\s+/)) {
    if (BACK_REF.test(sentence)) continue;
    for (const k of CATASTROPHES) if (SHOCK_TEXT[k]!.test(sentence) && !out.includes(k)) out.push(k);
  }
  return out;
}

const eventText = (e: Pick<LifeEvent, "title" | "narrative">) => `${e.title}. ${e.narrative}`;

/** Shock types already written in a life's years (type -> first year). */
export function shocksWritten(years: SimYear[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const y of years) {
    for (const e of y.events) {
      const t = eventText(e);
      for (const [type, re] of Object.entries(SHOCK_TEXT)) {
        if (!re || seen.has(type) || BACK_REF.test(t)) continue;
        if (re.test(t)) seen.set(type, y.year);
      }
    }
  }
  return seen;
}

/**
 * The planned shocks this life still has in [from, to], given what its past already holds: a type
 * (or a natural disaster) already written uses it up, the per-life cap and the gap count the past.
 */
export function shocksFor(seed: string, lifeId: string, profile: Profile, world: WorldEvent[], past: SimYear[], from: number, to: number): Shock[] {
  const plan = planShocks(seed, lifeId, profile, world);
  const seen = shocksWritten(past.filter((y) => y.year < from));
  const span = profile.birthYear + profile.endAge - profile.startYear;
  const naturalSeen = seen.has("home_disaster");
  let count = seen.size - (seen.has("pandemic") ? 1 : 0);
  const years = [...seen.values()];
  const out: Shock[] = [];
  for (const s of plan) {
    if (s.year > to) break;
    if (s.year < from) {
      // planned before this stretch but never written (another life's past, or skipped): it is gone
      continue;
    }
    if (seen.has(s.type) || (s.scope === "natural" && naturalSeen)) continue;
    if (count >= maxShocks(span)) break;
    if (years.some((y) => Math.abs(s.year - y) < SHOCK_GAP)) continue;
    out.push(s);
    count++;
    years.push(s.year);
  }
  return out;
}

/** Writer lines for the shocks in a stretch (coarse: the 5 years up to each snapshot count). */
export function renderShocks(shocks: Shock[], coarse: boolean): string {
  if (!shocks.length) return "";
  const line = (s: Shock) =>
    `${s.year} (${s.age}): ${s.what}. Tone ${s.tone}; file it as ${s.cats.join(" or ")}${s.statId ? ` (st ${s.statId})` : ""}.`;
  return `\nLIFE SHOCK (code rolled it at its real-world odds; WILL HAPPEN, once in this life${coarse ? ", inside that snapshot's five years" : ", in that year"}). It happens TO them; how they handle it is theirs and fits who they are. Keep it proportionate: shaken, not ruined; a way through within a year or two. Never invent any other disaster, crime, scam or emergency:\n${shocks.map(line).join("\n")}`;
}

/** Candidates that would stack on a planned shock (another setback within 2 years) are dropped. */
export function clashesWithShock(c: { year: number; category: EventCategory }, shocks: Shock[]): boolean {
  const SETBACK = new Set<EventCategory>(["job_loss", "money_down", "burnout", "love_end", "divorce"]);
  return SETBACK.has(c.category) && shocks.some((s) => s.tone !== "up" && Math.abs(s.year - c.year) <= 2);
}
