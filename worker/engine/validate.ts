/**
 * The year validator (research/03 §3.2 step 3). Two kinds of problems:
 *   - hard: break a content rule or a budget (banned topics, turning point without a real quote,
 *     budget/cooldown, world events, shock cap). These trigger ONE repair call, then code drops
 *     the offending events.
 *   - soft: fixed silently in code (clamps, ids, enums, scene sanity, truncation).
 * Builds on shared/validate.ts (contract invariants) without changing it.
 */
import { isBaseRateId } from "../../shared/baseRates";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import { EVENT_CATEGORIES, type DomainStates, type EventCategory, type LifeEvent, type Profile, type WorldEvent } from "../../shared/schema";
import {
  ACTIVITIES, AGE_BANDS, FLAVORS, HOMES, MOMENTS, MOODS, ROLES, SEASONS, SETTINGS_PLACE, TIMES, WEATHERS,
  type SceneSpec, type SimYear,
} from "../../shared/sim";
import { YearDraft, type EventDraft } from "./schemas";
import { clamp, clampInt, truncateWords } from "./util";
import { CATEGORY_RULES, flavorFor, PARENT_DEATH_RE, recordEvent, selfAgeBand, SHOCK_CATEGORIES, snowPlausible, type BudgetLedger } from "./world";

// ---------------------------------------------------------------------------------------------
// Content blocklist (research/03 §4.4)
// ---------------------------------------------------------------------------------------------

const BANNED =
  /\b(die[sd]?(?![- ]hard)|dying(?! to)|death|dead(?![- ]?(?:end|line|lift|pan|bolt|beat|ly))|funeral|cancer|tumou?r|chemo(?:therapy)?|terminal(?:ly)? ill|hospice|stroke(?! of)|heart attack|cardiac arrest|miscarr\w*|stillbirth|overdos\w*|suicid\w*|self[- ]harm|leukemia|dementia|alzheimer'?s|intensive care|ICU|life support|car (?:crash|accident)|serious accident|paralyz\w*|amputat\w*|coma|addict\w*|rehab(?!ilitat)|relapse|pass(?:es|ed)? away|killed(?! it)|murder\w*|widow\w*)\b/i;
const CLOSE_DEATH =
  /\b(partner|wife|husband|spouse|son|daughter|child|baby|kid|fianc\w*|girlfriend|boyfriend)\b[^.]{0,50}\b(die[sd]?|death|dead|funeral|pass(?:es|ed)? away|killed|widow\w*)\b|\bwidow\w*\b/i;

export function bannedHits(text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(BANNED.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0]);
  return out;
}

const CLICHES = /\b(journey|tapestry|embark\w*|navigat\w*|newfound|bittersweet|whirlwind|roller ?coaster|testament|find(?:s|ing)? yourself|what truly matters|dream job|everything changes|little do you know)\b/gi;
export const clicheCount = (text: string) => (text.match(CLICHES) ?? []).length;

// ---------------------------------------------------------------------------------------------
// Coercion: raw model output → a well-typed draft (even when zod failed)
// ---------------------------------------------------------------------------------------------

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const str = (v: unknown, fallback = "") => (typeof v === "string" ? v.trim() : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const DEFAULT_SCENE: SceneSpec = {
  setting: "city_midrise", flavor: "us_south", placeLabel: "", home: "apartment", activity: "office_work",
  people: [{ role: "self", ageBand: "adult" }], season: "autumn", timeOfDay: "day", weather: "clear", mood: "calm",
  moment: null, caption: "",
};

function coerceEvent(raw: unknown): EventDraft {
  const e = obj(raw);
  const cause = obj(e.cause);
  const br = obj(e.baseRate);
  return {
    domain: pick(e.domain, DOMAIN_KEYS, "lifeGoals"),
    category: pick(e.category, EVENT_CATEGORIES, "texture"),
    title: str(e.title, "A small change"),
    narrative: str(e.narrative),
    isTurningPoint: e.isTurningPoint === true,
    cause: typeof cause.quoteId === "string" ? { quoteId: cause.quoteId, reason: str(cause.reason) } : null,
    baseRate: typeof br.statId === "string" && isBaseRateId(br.statId) ? { statId: br.statId } : null,
    tone: pick(e.tone, ["up", "down", "mixed"] as const, "mixed"),
    worldId: typeof e.worldId === "string" ? e.worldId : null,
  };
}

export function coerceYear(raw: unknown, prev: SimYear | null): { draft: YearDraft; schemaOk: boolean } {
  const parsed = YearDraft.safeParse(raw);
  if (parsed.success) return { draft: parsed.data, schemaOk: true };
  const y = obj(raw);
  const states = obj(y.states);
  const money = obj(y.money);
  const scene = obj(y.scene);
  const ps = prev?.scene ?? DEFAULT_SCENE;
  const draft: YearDraft = {
    year: typeof y.year === "number" ? y.year : 0,
    age: typeof y.age === "number" ? y.age : 0,
    place: str(y.place, prev?.place ?? ""),
    events: Array.isArray(y.events) ? y.events.map(coerceEvent) : [],
    summary: str(y.summary, "A quiet year."),
    money: {
      income: clampInt(money.income, 0, 50_000_000, prev?.money.income ?? 0),
      netWorth: clampInt(money.netWorth, -5_000_000, 500_000_000, prev?.money.netWorth ?? 0),
    },
    states: Object.fromEntries(DOMAIN_KEYS.map((d) => [d, clampInt(states[d], 0, 100, prev?.states[d] ?? 50)])) as DomainStates,
    scene: {
      setting: pick(scene.setting, SETTINGS_PLACE, ps.setting),
      flavor: pick(scene.flavor, FLAVORS, ps.flavor),
      placeLabel: str(scene.placeLabel, ps.placeLabel),
      home: pick(scene.home, HOMES, ps.home),
      activity: pick(scene.activity, ACTIVITIES, ps.activity),
      people: Array.isArray(scene.people)
        ? scene.people.map((p) => {
            const o = obj(p);
            return { role: pick(o.role, ROLES, "friend"), ageBand: pick(o.ageBand, AGE_BANDS, "adult") };
          })
        : ps.people,
      season: pick(scene.season, SEASONS, ps.season),
      timeOfDay: pick(scene.timeOfDay, TIMES, ps.timeOfDay),
      weather: pick(scene.weather, WEATHERS, ps.weather),
      mood: pick(scene.mood, MOODS, ps.mood),
      moment: typeof scene.moment === "string" && (MOMENTS as readonly string[]).includes(scene.moment) ? (scene.moment as SceneSpec["moment"]) : null,
      caption: str(scene.caption),
    },
  };
  return { draft, schemaOk: false };
}

// ---------------------------------------------------------------------------------------------
// Validation context
// ---------------------------------------------------------------------------------------------

export interface YearCheckCtx {
  profile: Profile;
  expectedYear: number;
  prev: SimYear | null;
  ledger: BudgetLedger;
  world: WorldEvent[];
  span: number;
  /** Event id prefix: "you" for the chosen life, the branch id for branches. */
  idPrefix: string;
  /** Coarse snapshots (5-year steps): wider state deltas allowed, no per-year cooldown checks. */
  coarse: boolean;
  decisionIds: string[];
}

export interface YearCheck {
  year: SimYear;
  hard: string[];
  soft: string[];
  /** Index of events with hard errors (for the code fallback). */
  badEvents: Set<number>;
  summaryBanned: boolean;
}

const MOMENT_FOR: Partial<Record<EventCategory, SceneSpec["moment"][]>> = {
  career_move: ["new_job", "promotion", "retirement", "travel_abroad"],
  career_change: ["new_job", "launch", "graduation", "first_show"],
  job_loss: ["layoff"],
  marriage: ["wedding"],
  child: ["new_baby"],
  move: ["moving_in", "travel_abroad", "house_keys"],
  home: ["house_keys", "moving_in"],
  achievement: ["award", "first_show", "launch", "graduation", "promotion"],
  love_end: ["breakup"],
  divorce: ["breakup"],
  caregiving: ["caregiving_start"],
  friendship: ["reunion"],
  love_start: ["reunion", "travel_abroad"],
  money_up: ["promotion", "launch", "award"],
};

// ---------------------------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------------------------

export function checkYear(draft: YearDraft, ctx: YearCheckCtx): YearCheck {
  const { profile, prev } = ctx;
  const hard: string[] = [];
  const soft: string[] = [];
  const badEvents = new Set<number>();
  const quoteIds = new Set(profile.quotes.map((q) => q.id));
  const year = ctx.expectedYear;
  const age = year - profile.birthYear;
  if (draft.year !== year || draft.age !== age) soft.push(`year/age fixed to ${year}/${age}`);

  // --- events
  let events = draft.events.slice(0, 3);
  if (draft.events.length > 3) soft.push("more than 3 events, kept 3");
  const ledger: BudgetLedger = {
    counts: { ...ctx.ledger.counts },
    lastYear: { ...ctx.ledger.lastYear },
    shockYears: [...ctx.ledger.shockYears],
    worldIds: new Set(ctx.ledger.worldIds),
    parentDeaths: ctx.ledger.parentDeaths,
  };
  const outEvents: LifeEvent[] = [];
  events.forEach((e, i) => {
    const text = `${e.title}. ${e.narrative} ${e.cause?.reason ?? ""}`;
    const where = `event ${i + 1} "${e.title}"`;
    // content line
    const hits = bannedHits(text);
    if (hits.length) {
      const parentDeath = PARENT_DEATH_RE.test(text) && !CLOSE_DEATH.test(text);
      if (CLOSE_DEATH.test(text)) {
        hard.push(`${where}: a partner's or child's death is never allowed`);
        badEvents.add(i);
      } else if (parentDeath) {
        if (ledger.parentDeaths >= 1) {
          hard.push(`${where}: a parent's death already happened in this life (max once)`);
          badEvents.add(i);
        } else if (age < 48) {
          hard.push(`${where}: a parent's death is only allowed late (parent ~85+), not at ${age}`);
          badEvents.add(i);
        } else {
          ledger.parentDeaths++;
          if (e.isTurningPoint && e.tone === "down") soft.push(`${where}: parent's death kept gentle`);
        }
        const others = hits.filter((h) => !/die|death|dead|pass|funeral/i.test(h));
        if (others.length) {
          hard.push(`${where}: banned content (${others.join(", ")})`);
          badEvents.add(i);
        }
      } else {
        hard.push(`${where}: banned content (${hits.join(", ")}): no death, serious illness or accidents`);
        badEvents.add(i);
      }
    }
    // the why thread
    if (e.cause && !quoteIds.has(e.cause.quoteId)) {
      if (e.isTurningPoint) {
        hard.push(`${where}: cause.quoteId "${e.cause.quoteId}" is not one of their quotes`);
        badEvents.add(i);
      } else {
        e = { ...e, cause: null };
        soft.push(`${where}: dropped invalid cause on a texture event`);
      }
    }
    if (e.isTurningPoint && !e.cause) {
      hard.push(`${where}: turning point without cause (every turning point must cite a quote)`);
      badEvents.add(i);
    }
    if (e.cause && !e.cause.reason) e = { ...e, cause: { ...e.cause, reason: "This grows out of what you said." } };
    // world events
    if (e.category === "world_context") {
      const w = ctx.world.find((x) => x.id === e.worldId) ?? ctx.world.find((x) => Math.abs(x.year - year) <= 1);
      if (!w) {
        hard.push(`${where}: world_context must be one of the given world events (${ctx.world.map((x) => `${x.id} ${x.year}`).join(", ") || "none"})`);
        badEvents.add(i);
      } else if (ledger.worldIds.has(w.id)) {
        hard.push(`${where}: world event ${w.id} already appeared in this life`);
        badEvents.add(i);
      } else if (year < w.year || year > w.year + 2) {
        hard.push(`${where}: world event ${w.id} starts in ${w.year}, not ${year}`);
        badEvents.add(i);
      } else if (ledger.worldIds.size >= 2) {
        hard.push(`${where}: at most 2 world events per life`);
        badEvents.add(i);
      } else {
        e = { ...e, worldId: w.id };
      }
    }
    // budgets and cooldowns (turning points only)
    const rule = CATEGORY_RULES[e.category];
    if (rule && e.isTurningPoint && e.category !== "world_context" && !badEvents.has(i)) {
      const used = ledger.counts[e.category] ?? 0;
      if (used >= rule.max(ctx.span)) {
        hard.push(`${where}: ${e.category} budget used up (${used}/${rule.max(ctx.span)} in this life); write something else`);
        badEvents.add(i);
      }
      const ly = ledger.lastYear[e.category];
      if (!ctx.coarse && ly !== undefined && year - ly < rule.cooldown && !badEvents.has(i)) {
        hard.push(`${where}: ${e.category} again within ${rule.cooldown} years (last ${ly}); too soon`);
        badEvents.add(i);
      }
    }
    // negative-shock cap: at most 1 major negative turning point per 3 years
    if (e.isTurningPoint && e.tone === "down" && SHOCK_CATEGORIES.has(e.category) && !badEvents.has(i)) {
      const recent = ledger.shockYears.filter((y) => year - y < (ctx.coarse ? 1 : 3));
      if (recent.length) {
        hard.push(`${where}: another major setback within 3 years of ${recent[0]}; life isn't a run of disasters`);
        badEvents.add(i);
      }
    }
    const ev: LifeEvent = {
      id: `${ctx.idPrefix}-${year}-${i + 1}`,
      domain: e.domain,
      category: e.category,
      title: truncateWords(e.title, 10),
      narrative: e.narrative,
      isTurningPoint: e.isTurningPoint,
      cause: e.cause,
      baseRate: e.baseRate,
      tone: e.tone,
    };
    if (!badEvents.has(i)) recordEvent(ledger, year, ev, e.category === "world_context" ? e.worldId : null);
    outEvents.push(ev);
  });

  const summaryHits = bannedHits(`${draft.summary} ${draft.scene.caption}`).filter(
    (h) => !(PARENT_DEATH_RE.test(draft.summary) && /die|death|pass|funeral/i.test(h) && ledger.parentDeaths <= 1 && age >= 48),
  );
  const summaryBanned = summaryHits.length > 0;
  if (summaryBanned) hard.push(`summary/caption: banned content (${summaryHits.join(", ")})`);

  // --- states: deltas capped (±15, ±30 on a turning-point year; coarse ±35)
  const hasTp = outEvents.some((e) => e.isTurningPoint);
  const cap = ctx.coarse ? 35 : hasTp ? 30 : 15;
  const states = { ...draft.states };
  for (const d of DOMAIN_KEYS as readonly DomainKey[]) {
    let v = clampInt(states[d], 0, 100, prev?.states[d] ?? 50);
    if (prev) {
      const lo = prev.states[d] - cap;
      const hi = prev.states[d] + cap;
      if (v < lo || v > hi) {
        soft.push(`states.${d} capped`);
        v = clamp(v, lo, hi);
      }
    }
    states[d] = v;
  }

  // --- money: smooth unless an event explains it
  let income = Math.max(0, Math.round(draft.money.income));
  let netWorth = Math.round(draft.money.netWorth);
  if (prev) {
    const moneyEvent = outEvents.some((e) =>
      ["career_move", "career_change", "job_loss", "money_up", "money_down", "home", "divorce", "marriage", "move", "caregiving", "child"].includes(e.category),
    );
    const span = ctx.coarse ? 5 : 1;
    const maxUp = prev.money.income * (moneyEvent ? 2.5 : 1 + 0.25 * span) + (moneyEvent ? 30000 : 8000 * span);
    if (income > maxUp) {
      soft.push("income jump capped");
      income = Math.round(maxUp);
    }
    if (!moneyEvent && income < prev.money.income * 0.6 && age < 60) {
      soft.push("income drop without an event, smoothed");
      income = Math.round(prev.money.income * 0.85);
    }
    const nwSwing = Math.max(60000 * span, 1.5 * Math.max(income, prev.money.income) * span + 0.3 * Math.abs(prev.money.netWorth) * span);
    if (Math.abs(netWorth - prev.money.netWorth) > nwSwing * (moneyEvent ? 2 : 1)) {
      soft.push("net worth swing capped");
      netWorth = Math.round(prev.money.netWorth + Math.sign(netWorth - prev.money.netWorth) * nwSwing * (moneyEvent ? 2 : 1));
    }
  }

  // --- scene sanity
  const scene = fixScene(draft.scene, { year, age, place: draft.place || prev?.place || "", prev, events: outEvents, profile, netWorth, soft });

  const simYear: SimYear = {
    year,
    age,
    place: draft.place || prev?.place || scene.placeLabel,
    summary: truncateWords(draft.summary, 28),
    states,
    money: { income, netWorth },
    events: outEvents,
    scene,
    decisionIds: ctx.decisionIds,
  };
  return { year: simYear, hard, soft, badEvents, summaryBanned };
}

function fixScene(
  s: SceneSpec,
  o: { year: number; age: number; place: string; prev: SimYear | null; events: LifeEvent[]; profile: Profile; netWorth: number; soft: string[] },
): SceneSpec {
  const scene: SceneSpec = { ...s, people: [...s.people] };
  scene.placeLabel = o.place || scene.placeLabel;
  const f = flavorFor(scene.placeLabel, o.profile.country, o.profile.region);
  if (f && f !== scene.flavor) {
    o.soft.push(`scene.flavor ${scene.flavor} -> ${f}`);
    scene.flavor = f;
  }
  // exactly one self, at the right age band; max 6 people
  const band = selfAgeBand(o.age);
  const others = scene.people.filter((p) => p.role !== "self");
  scene.people = [{ role: "self" as const, ageBand: band }, ...others].slice(0, 6);
  // moment only on a real key event
  const tps = o.events.filter((e) => e.isTurningPoint);
  if (scene.moment) {
    const fits = tps.some((e) => (MOMENT_FOR[e.category] ?? []).includes(scene.moment));
    if (!tps.length) {
      o.soft.push("scene.moment removed (no key event)");
      scene.moment = null;
    } else if (!fits) {
      const alt = tps.map((e) => MOMENT_FOR[e.category]?.[0]).find(Boolean) ?? null;
      scene.moment = alt ?? null;
    }
  }
  // dorm/campus only while studying and young
  if (scene.home === "dorm" && (o.age > 30 || scene.activity !== "studying")) scene.home = "apartment_small";
  if (scene.setting === "campus" && scene.activity !== "studying" && o.age > 26) scene.setting = "city_midrise";
  // a house needs money (or a home event)
  const ownedEver = o.events.some((e) => e.category === "home") || ["house", "house_large", "townhouse"].includes(o.prev?.scene.home ?? "");
  if (scene.home === "house_large" && o.netWorth < 400000 && !ownedEver) scene.home = "house";
  if ((scene.home === "house" || scene.home === "townhouse") && o.netWorth < -10000 && !ownedEver) scene.home = "apartment";
  // weather plausibility
  if (scene.weather === "snow" && !snowPlausible(scene.flavor, scene.season)) scene.weather = scene.season === "winter" ? "cloudy" : "rain";
  // variety: never the exact same (season, time, weather) as last year
  const p = o.prev?.scene;
  if (p && p.season === scene.season && p.timeOfDay === scene.timeOfDay && p.weather === scene.weather) {
    scene.timeOfDay = TIMES[(TIMES.indexOf(scene.timeOfDay) + 1) % TIMES.length]!;
  }
  // mood follows the year's tone
  const down = tps.some((e) => e.tone === "down");
  const up = tps.some((e) => e.tone === "up");
  if (down && !up && (scene.mood === "joyful" || scene.mood === "bright")) scene.mood = "tense";
  if (up && !down && scene.mood === "heavy") scene.mood = "calm";
  scene.caption = truncateWords(scene.caption || "", 8);
  return scene;
}

/** Code fallback after a failed repair: drop or soften whatever still breaks a hard rule. */
export function fallbackYear(check: YearCheck): SimYear {
  const y = check.year;
  const events = y.events.filter((_, i) => !check.badEvents.has(i)).map((e, i) => ({ ...e, id: e.id.replace(/-\d+$/, `-${i + 1}`) }));
  const summary = check.summaryBanned ? "A quieter year than most." : y.summary;
  const caption = check.summaryBanned ? "" : y.scene.caption;
  const moment = events.some((e) => e.isTurningPoint) ? y.scene.moment : null;
  return { ...y, events, summary, scene: { ...y.scene, caption, moment } };
}
