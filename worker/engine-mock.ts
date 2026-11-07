/**
 * Deterministic mock Engine (shared/engine.ts) built from shared/demo/alex.json. No LLM.
 *
 * Used when ENGINE=mock, when GENERATION_ENABLED=false (kill switch) and when the real engine
 * fails to load. The whole loop (start → big decision → years → interlude → ending) runs on it.
 *
 * How it maps choices to Alex's four pre-made lives: for every big decision, option a = The Leap,
 * b = Your Path, c = The Careful Life, d = The Unjudged Life. Years after a big decision are copied
 * (re-based to the user's age, start year and city) from the life the chosen option maps to, so a
 * user who keeps switching gets a stitched-together but coherent-looking life. Scenes are derived
 * from each year by deriveScene() (also exported for the real engine to reuse if it wants).
 */
import demo from "../shared/demo/alex.json";
import type { DecisionSlot, DocInput, Engine, Ending, InterludeCut, SafetyResult } from "../shared/engine";
import type { LifeKey } from "../shared/lives";
import { DemoBundle, endAgeFor, type Life, type Profile, type Quote, type Year } from "../shared/schema";
import {
  SPEED_CONFIG,
  type AGE_BANDS,
  type Branch,
  type Decision,
  type DecisionAnswer,
  type FLAVORS,
  type LiveSetting,
  type LogLine,
  type MOMENTS,
  type SceneSpec,
  type SessionState,
  type SimYear,
  type StartInput,
} from "../shared/sim";
import { DOMAIN_KEYS, type DomainKey } from "../shared/domains";

const DEMO = DemoBundle.parse(demo);
const LIVES: Record<LifeKey, Life> = Object.fromEntries(DEMO.lives.map((l) => [l.key, l])) as Record<LifeKey, Life>;
/** Option id → which of Alex's lives that fork follows. */
const OPTION_LIFE: Record<string, LifeKey> = { a: "leap", b: "path", c: "careful", d: "unjudged" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clone = <T>(x: T): T => structuredClone(x);
const words = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");
/** Small deterministic hash → [0, 1). */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------------------------
// Scene derivation (pure)
// ---------------------------------------------------------------------------------------------

const US_REGION_FLAVOR: Record<string, (typeof FLAVORS)[number]> = {
  NC: "us_south", SC: "us_south", GA: "us_south", TX: "us_south", FL: "us_south", TN: "us_south", VA: "us_south", AL: "us_south",
  NY: "us_northeast", MA: "us_northeast", PA: "us_northeast", NJ: "us_northeast", CT: "us_northeast", ME: "us_northeast", DC: "us_northeast",
  CA: "us_west", WA: "us_west", OR: "us_west", CO: "us_west", AZ: "us_west", NV: "us_west", UT: "us_west",
  IL: "us_midwest", OH: "us_midwest", MI: "us_midwest", MN: "us_midwest", WI: "us_midwest", IN: "us_midwest", MO: "us_midwest",
};
const COUNTRY_FLAVOR: Record<string, (typeof FLAVORS)[number]> = {
  PT: "europe_south", ES: "europe_south", IT: "europe_south", GR: "europe_south", FR: "europe_south",
  GB: "europe_north", DE: "europe_north", NL: "europe_north", SE: "europe_north", NO: "europe_north", DK: "europe_north", IE: "europe_north",
  JP: "east_asia", KR: "east_asia", CN: "east_asia", TW: "east_asia", HK: "east_asia",
  SG: "southeast_asia", TH: "southeast_asia", VN: "southeast_asia", MY: "southeast_asia", ID: "southeast_asia", PH: "southeast_asia",
  IN: "south_asia", PK: "south_asia", BD: "south_asia", LK: "south_asia",
  MX: "latam", BR: "latam", AR: "latam", CO: "latam", CL: "latam", PE: "latam",
  AE: "middle_east", SA: "middle_east", IL: "middle_east", TR: "middle_east", EG: "middle_east",
  NG: "africa", KE: "africa", ZA: "africa", GH: "africa", ET: "africa",
  AU: "oceania", NZ: "oceania",
};

function flavorFor(place: string, profile: Profile | null): (typeof FLAVORS)[number] {
  if (/singapore/i.test(place)) return "southeast_asia";
  if (/lisbon|portugal|porto|spain|madrid|italy|rome/i.test(place)) return "europe_south";
  if (/london|berlin|amsterdam|stockholm/i.test(place)) return "europe_north";
  if (/tokyo|seoul|japan|korea/i.test(place)) return "east_asia";
  const region = /,\s*([A-Z]{2})$/.exec(place)?.[1];
  if (region && US_REGION_FLAVOR[region]) return US_REGION_FLAVOR[region];
  const c = profile?.country?.toUpperCase() ?? "US";
  if (c === "US") return US_REGION_FLAVOR[(profile?.region ?? "").toUpperCase()] ?? "us_south";
  return COUNTRY_FLAVOR[c] ?? "us_south";
}

function ageBand(age: number): (typeof AGE_BANDS)[number] {
  if (age < 2) return "baby";
  if (age < 13) return "child";
  if (age < 18) return "teen";
  if (age < 30) return "young_adult";
  if (age < 45) return "adult";
  if (age < 62) return "middle";
  return "senior";
}

const MOMENT_BY_CATEGORY: Partial<Record<string, (typeof MOMENTS)[number]>> = {
  career_move: "new_job", career_change: "new_job", job_loss: "layoff", marriage: "wedding", child: "new_baby",
  move: "moving_in", home: "house_keys", love_end: "breakup", divorce: "breakup", caregiving: "caregiving_start",
  achievement: "award", friendship: "reunion", money_up: "launch",
};

/** Who is in the life up to (and including) `uptoIndex` of a source life's years. */
function household(years: Year[], uptoIndex: number) {
  let partner = false;
  const kids: number[] = []; // birth year index
  for (let i = 0; i <= uptoIndex && i < years.length; i++) {
    for (const e of years[i]!.events) {
      if (e.category === "love_start" || e.category === "marriage") partner = true;
      if (e.category === "love_end" || e.category === "divorce") partner = false;
      if (e.category === "child") kids.push(i);
    }
  }
  return { partner, kids };
}

/**
 * Derive a SceneSpec for one year. `history` = the years of the life so far (for partner/kids),
 * index = position of `y` in it.
 */
export function deriveScene(y: Year, history: Year[], index: number, profile: Profile | null, lifeKey: LifeKey | null): SceneSpec {
  const main = y.events.find((e) => e.isTurningPoint) ?? y.events[0] ?? null;
  const cat = main?.category ?? "texture";
  const text = `${main?.title ?? ""} ${y.summary}`.toLowerCase();
  const nw = y.money.netWorth;
  const dense = /singapore|tokyo|new york|hong kong|manhattan/i.test(y.place);

  const setting: SceneSpec["setting"] =
    /art school|campus|degree|class|course/.test(text) && y.age < 32 ? "campus"
    : dense ? "city_dense"
    : /lisbon|porto|coast|beach|sea/i.test(y.place + text) ? "coastal"
    : /hillsborough|farm|country/i.test(y.place) ? "small_town"
    : y.age >= 62 ? "small_town"
    : nw > 350_000 ? "suburb"
    : "city_midrise";

  const home: SceneSpec["home"] =
    y.age < 23 ? "shared_house"
    : lifeKey === "unjudged" && y.age < 40 ? "loft_studio"
    : nw < 0 ? "apartment_small"
    : nw < 120_000 ? "apartment"
    : nw < 400_000 ? "townhouse"
    : nw < 1_500_000 ? "house"
    : "house_large";

  const activity: SceneSpec["activity"] =
    cat === "move" ? "moving"
    : cat === "job_loss" ? "job_hunting"
    : cat === "child" || cat === "caregiving" ? "caregiving"
    : cat === "marriage" || cat === "achievement" || cat === "money_up" ? "celebrating"
    : cat === "love_start" || cat === "friendship" ? "socializing"
    : cat === "burnout" ? "resting"
    : y.age >= 66 ? (index % 2 ? "family_time" : "resting")
    : lifeKey === "unjudged" ? "studio_creating"
    : /remote/.test(text) ? "remote_work"
    : index % 3 === 0 ? "commuting" : index % 3 === 1 ? "office_work" : "exercising";

  const { partner, kids } = household(history, index);
  const people: SceneSpec["people"] = [{ role: "self", ageBand: ageBand(y.age) }];
  if (partner) people.push({ role: "partner", ageBand: ageBand(y.age) });
  for (const k of kids.slice(0, 2)) people.push({ role: "child", ageBand: ageBand(index - k) });
  if (y.age < 52 && (cat === "caregiving" || cat === "texture" || y.states.family > 70)) people.push({ role: "parent", ageBand: "senior" });
  if (cat === "friendship") people.push({ role: "friend", ageBand: ageBand(y.age) });
  if (cat === "career_move" && people.length < 6) people.push({ role: "colleague", ageBand: ageBand(y.age) });
  if (index % 7 === 3 && people.length < 6) people.push({ role: "pet", ageBand: "adult" });

  const season = (["spring", "summer", "autumn", "winter"] as const)[y.year % 4]!;
  const tone = main?.tone ?? null;
  const mood: SceneSpec["mood"] =
    tone === "up" ? (y.states.happiness > 60 ? "joyful" : "bright")
    : tone === "down" ? (y.states.mentalHealth < 40 ? "heavy" : "tense")
    : "calm";
  const weather: SceneSpec["weather"] =
    mood === "heavy" ? "rain" : mood === "tense" ? "cloudy" : season === "winter" && hash01(String(y.year)) > 0.4 ? "snow" : hash01(`${y.year}w`) > 0.8 ? "fog" : "clear";
  const timeOfDay: SceneSpec["timeOfDay"] = mood === "joyful" ? "golden" : mood === "heavy" ? "night" : (["dawn", "day", "day", "golden"] as const)[y.year % 4]!;

  let moment: SceneSpec["moment"] = main?.isTurningPoint ? (MOMENT_BY_CATEGORY[cat] ?? null) : null;
  if (/promot/.test(text)) moment = "promotion";
  if (/graduat|degree/.test(text)) moment = "graduation";
  if (/retire/.test(text)) moment = "retirement";
  if (/first show|exhibit|gallery/.test(text)) moment = "first_show";
  if (cat === "move" && !/,\s*[A-Z]{2}$/.test(y.place)) moment = "travel_abroad";

  return {
    setting,
    flavor: flavorFor(y.place, profile),
    placeLabel: y.place,
    home,
    activity,
    people: people.slice(0, 6),
    season,
    timeOfDay,
    weather,
    mood,
    moment,
    caption: words(main?.title ?? y.summary, 8),
  };
}

// ---------------------------------------------------------------------------------------------
// Decision templates
// ---------------------------------------------------------------------------------------------

type Opt = [label: string, hint: string | null, branchTitle: string];
interface BigTpl { domains: DomainKey[]; prompt: string; why: string; options: [Opt, Opt, Opt, Opt] }
interface SmallTpl { domain: DomainKey; prompt: string; why: string; options: [string, string, string, string] }

// Option order is fixed: a = bold leap, b = stay the course, c = play it safe, d = what you'd do unjudged.
const BIG: BigTpl[] = [
  {
    domains: ["career", "wealth", "family"],
    prompt: "It's {year}. The offer you keep putting off needs an answer by Friday. What do you do?",
    why: "You told me what's on your mind; this is the first fork.",
    options: [
      ["I say yes and go", "Far from home, fast growth", "Take the offer"],
      ["I stay, and ask for more here", "Close to family, slower climb", "Stay, ask for more"],
      ["I stay and pay off the loans first", "Security now, adventure later", "Debt first"],
      ["I quit and make things for a living", "Less money, more you", "Make things"],
    ],
  },
  {
    domains: ["relationships", "family"],
    prompt: "It's {year}. You're {age}. Someone you love asks if you'll build a life together. Your answer?",
    why: "People came up when you talked about home.",
    options: [
      ["Yes, and let's move somewhere new", "A fresh start for two", "Start over together"],
      ["Yes, right here where we are", "Roots and routine", "Build it here"],
      ["Not yet. I want my footing first", "Safer, but they may not wait", "Wait for footing"],
      ["I want something less conventional", "Your rules, your shape", "Our own rules"],
    ],
  },
  {
    domains: ["wealth", "children", "family"],
    prompt: "It's {year}. A house you can just afford comes up, and so does the question of kids.",
    why: "You said money worries you; this is the biggest money move yet.",
    options: [
      ["Buy it and start a family now", "Stretched, but full", "House and kids"],
      ["Keep renting and keep options open", "Flexible, less rooted", "Stay flexible"],
      ["Save two more years before anything", "Solid, maybe late", "Save first"],
      ["Spend it on a year to make my own work", "A bet on yourself", "A year for me"],
    ],
  },
  {
    domains: ["career", "mentalHealth", "lifeGoals"],
    prompt: "It's {year}. You're {age}. Work asks for more, and something in you asks for less.",
    why: "You said you're afraid of waking up in the same place at 40.",
    options: [
      ["Start my own thing", "Risky, finally yours", "Go independent"],
      ["Take the promotion", "More money, more hours", "Take the promotion"],
      ["Stay put, protect what I've built", "Calm, a little stuck", "Hold steady"],
      ["Go part-time and follow the itch", "Less status, more air", "Follow the itch"],
    ],
  },
  {
    domains: ["family", "happiness", "lifeGoals"],
    prompt: "It's {year}. Your parents need more help, and your own retirement is in sight.",
    why: "You said family pulls on you; this is where it pulls hardest.",
    options: [
      ["Move them in and retire early", "Close, crowded, warm", "Bring them home"],
      ["Keep working, hire help", "Money buys time", "Keep working"],
      ["Downsize and save for both of us", "Careful with every dollar", "Downsize"],
      ["Retire and finally make the thing", "The work you always meant to do", "Make the thing"],
    ],
  },
  {
    domains: ["happiness", "relationships", "lifeGoals"],
    prompt: "It's {year}. You're {age}. What do you want the next ten years to be about?",
    why: "Every answer so far has told me a little more about you.",
    options: [
      ["See the world while I can", "Movement, stories", "See the world"],
      ["The people closest to me", "Small days, big love", "The people close"],
      ["Being secure and calm", "No surprises", "Secure and calm"],
      ["The work only I could make", "Legacy", "Only I could make"],
    ],
  },
];

const SMALL: SmallTpl[] = [
  { domain: "career", prompt: "Your manager asks who wants the messy new project.", why: "You worry about standing still.", options: ["I raise my hand", "I let someone else take it", "I ask what's in it for me", "I pitch a different project"] },
  { domain: "wealth", prompt: "A bonus lands in your account.", why: "Money came up early.", options: ["Pay down debt", "Invest it", "Take a trip", "Give some to family"] },
  { domain: "family", prompt: "Your mom calls on a Tuesday night, again.", why: "Family pulls on you.", options: ["Pick up and talk an hour", "Text that I'll call Sunday", "Drive over", "Let it ring tonight"] },
  { domain: "relationships", prompt: "A friend you've drifted from texts: 'Coffee?'", why: "Connection matters to how this goes.", options: ["Yes, this week", "Maybe next month", "Suggest a call instead", "Leave it on read"] },
  { domain: "mentalHealth", prompt: "You've slept badly for two weeks.", why: "How you carry stress shapes the long run.", options: ["See someone about it", "Cut back on work", "Push through", "Take a long weekend"] },
  { domain: "happiness", prompt: "A free Saturday, nothing planned.", why: "Small days add up.", options: ["Draw or make something", "See people", "Catch up on work", "Do absolutely nothing"] },
  { domain: "lifeGoals", prompt: "A night class in something you love opens up.", why: "You named something you'd do if nobody judged.", options: ["Sign up", "Next semester", "Too expensive right now", "Teach myself instead"] },
  { domain: "achievement", prompt: "You could enter your work in a contest.", why: "Finishing things matters to you.", options: ["Enter it", "Polish it first", "Not good enough yet", "Make something new for it"] },
  { domain: "children", prompt: "A friend asks you to be their kid's godparent.", why: "Family can take many shapes.", options: ["Yes, honored", "Yes, but quietly scared", "Ask for time to think", "Gently say no"] },
  { domain: "risk", prompt: "A friend wants you to co-sign a lease on a studio space.", why: "How much you put on the line is a choice.", options: ["Sign it", "Offer a smaller share", "Say no", "Find a cheaper space"] },
  { domain: "career", prompt: "A recruiter messages you about a job in another city.", why: "You worry about career most.", options: ["Take the call", "Ask for remote", "Not now", "Ask about something different"] },
  { domain: "wealth", prompt: "Rent is going up 9% next year.", why: "Money came up early.", options: ["Move somewhere cheaper", "Negotiate", "Pay it", "Get a roommate"] },
];

// ---------------------------------------------------------------------------------------------
// Helpers over state
// ---------------------------------------------------------------------------------------------

const startYearOf = (s: SessionState) => s.profile?.startYear ?? s.playhead.year;
const startAgeOf = (s: SessionState) => s.profile?.age ?? s.playhead.age;
const endYearOf = (s: SessionState) => startYearOf(s) + (s.endAge - startAgeOf(s));

/** Which life the chosen path follows in `year` (fork answered at Y affects Y+1 onward). */
function lifeAt(s: SessionState, year: number): LifeKey {
  let key: LifeKey = "path";
  const bigs = s.decisions.filter((d) => d.kind === "big" && d.status === "answered").sort((a, b) => a.year - b.year);
  for (const d of bigs) {
    if (d.year >= year) break;
    const a = s.answers.find((x) => x.decisionId === d.id);
    key = OPTION_LIFE[a?.optionId ?? "b"] ?? "path";
  }
  return key;
}

function rebasePlace(place: string, profile: Profile | null): string {
  if (!profile?.city) return place;
  const home = `${profile.city}${profile.region ? `, ${profile.region}` : profile.country && profile.country !== "US" ? `, ${profile.country}` : ""}`;
  return place.replace(/^Durham, NC$/, home).replace(/^Cary, NC$/, `Outside ${profile.city}`).replace(/^Hillsborough, NC$/, `Near ${profile.city}`);
}

/** Build a SimYear for `year` from a source life, re-based to this user. */
function sourceYear(s: SessionState, key: LifeKey, year: number, prefix: string): SimYear {
  const life = LIVES[key];
  const idx = Math.max(0, Math.min(life.years.length - 1, year - startYearOf(s)));
  const src = clone(life.years[idx]!);
  const quoteIds = new Set((s.profile?.quotes ?? []).map((q) => q.id));
  const fallbackQ = s.profile?.quotes.at(-1)?.id ?? "q1";
  const y: Year = {
    ...src,
    year,
    age: startAgeOf(s) + (year - startYearOf(s)),
    place: rebasePlace(src.place, s.profile),
    events: src.events.map((e, n) => ({
      ...e,
      id: `${prefix}-${year}-${n + 1}`,
      cause: e.cause ? { ...e.cause, quoteId: quoteIds.has(e.cause.quoteId) ? e.cause.quoteId : fallbackQ } : null,
    })),
  };
  // Nudges toward "life" settings lift happiness a little from the nudge year on (mock flavour).
  const lift = s.nudges.filter((n) => n.year <= year).length * 2;
  if (lift) y.states = { ...y.states, happiness: Math.min(100, y.states.happiness + lift), mentalHealth: Math.min(100, y.states.mentalHealth + lift) };
  const history = life.years.slice(0, idx + 1);
  return {
    ...y,
    scene: deriveScene(y, history, idx, s.profile, key),
    decisionIds: s.decisions.filter((d) => d.year === year).map((d) => d.id),
  };
}

function nextQuoteId(p: Profile): string {
  const n = p.quotes.reduce((m, q) => Math.max(m, Number(/^q(\d+)$/.exec(q.id)?.[1] ?? 0)), 0);
  return `q${n + 1}`;
}

function lastUserQuote(p: Profile | null): Quote | null {
  if (!p) return null;
  return [...p.quotes].reverse().find((q) => q.source === "answer" || q.source === "pause") ?? p.quotes.at(-1) ?? null;
}

function fill(t: string, year: number, age: number) {
  return t.replace("{year}", String(year)).replace("{age}", String(age));
}

// ---------------------------------------------------------------------------------------------
// The mock Engine
// ---------------------------------------------------------------------------------------------

export interface MockOptions {
  /** Delay before each streamed year (ms). */
  yearDelayMs?: number;
  /** Delay for "LLM" calls (ms). */
  callDelayMs?: number;
}

export function createMockEngine(opts: MockOptions = {}): Engine {
  const yearDelay = opts.yearDelayMs ?? 220;
  const callDelay = opts.callDelayMs ?? 350;

  const engine: Engine = {
    async startProfile(input: StartInput, docs: DocInput[]): Promise<Profile> {
      await sleep(callDelay);
      const p = clone(DEMO.profile);
      const now = new Date();
      p.firstName = input.firstName;
      p.gender = input.appearance?.gender ?? null;
      p.age = input.age;
      p.startYear = now.getUTCFullYear();
      p.birthYear = p.startYear - input.age;
      p.city = input.city || p.city;
      p.region = input.region;
      p.country = input.country || "US";
      p.endAge = endAgeFor(input.age);
      p.profileVersion = 1;
      if (input.line.trim()) {
        const q: Quote = { id: nextQuoteId(p), text: input.line.trim(), questionId: "start.line", source: "answer", shortForm: words(input.line.trim(), 12) };
        p.quotes.push(q);
        p.seeds.path = { ...p.seeds.path, quoteIds: [q.id, ...p.seeds.path.quoteIds] };
      }
      for (const d of docs) {
        const first = d.text.split(/(?<=[.!?])\s+/)[0]?.slice(0, 240);
        if (first) p.quotes.push({ id: nextQuoteId(p), text: first, questionId: null, source: d.kind, shortForm: words(first, 12) });
      }
      p.knowMeScore = Math.min(100, 25 + docs.length * 15);
      p.updatedAt = now.toISOString();
      return p;
    },

    async enrichProfile(profile, docs, freeText) {
      await sleep(callDelay);
      const p = clone(profile);
      const quotes: Quote[] = [];
      for (const d of docs) {
        const first = d.text.split(/(?<=[.!?])\s+/)[0]?.slice(0, 240);
        if (!first) continue;
        const q: Quote = { id: nextQuoteId(p), text: first, questionId: null, source: d.kind, shortForm: words(first, 12) };
        p.quotes.push(q);
        quotes.push(q);
      }
      if (freeText?.trim()) {
        const q: Quote = { id: nextQuoteId(p), text: freeText.trim(), questionId: null, source: "answer", shortForm: words(freeText.trim(), 12) };
        p.quotes.push(q);
        quotes.push(q);
      }
      p.knowMeScore = Math.min(100, p.knowMeScore + docs.length * 15 + (freeText ? 5 : 0));
      p.profileVersion += 1;
      p.updatedAt = new Date().toISOString();
      return { profile: p, quotes };
    },

    planSlots(state) {
      const cfg = SPEED_CONFIG[state.speed];
      const y0 = startYearOf(state);
      const a0 = startAgeOf(state);
      const span = Math.max(1, endYearOf(state) - y0);
      const total = span + 1;
      const slots: DecisionSlot[] = [];
      // Big: the first is today; the rest front-loaded across life stages.
      const nBig = Math.max(1, Math.round(cfg.bigBudget * Math.min(1, total / 45)));
      const used = new Set<number>();
      for (let i = 0; i < nBig; i++) {
        let off = i === 0 ? 0 : Math.round(span * 0.85 * Math.pow(i / Math.max(1, nBig - 1), 1.1));
        while (used.has(off) && off < span) off++;
        used.add(off);
        slots.push({ year: y0 + off, age: a0 + off, kind: "big", reason: BIG[i % BIG.length]!.domains[0]! });
      }
      // Small: evenly spread, weighted toward worried-about domains.
      const nSmall = Math.round(cfg.smallBudget * Math.min(1, total / 45));
      const w = state.profile?.worries;
      const weights = DOMAIN_KEYS.map((k) => (w ? w[k] : 0.1) + 0.05);
      const sum = weights.reduce((a, b) => a + b, 0);
      for (let i = 0; i < nSmall; i++) {
        const off = Math.min(span, Math.floor(((i + 0.5) * total) / nSmall));
        let r = hash01(`small-${i}`) * sum;
        let dom: DomainKey = DOMAIN_KEYS[0];
        for (let k = 0; k < DOMAIN_KEYS.length; k++) {
          r -= weights[k]!;
          if (r <= 0) {
            dom = DOMAIN_KEYS[k]!;
            break;
          }
        }
        if (off === 0) continue; // nothing small on the day of the first fork
        slots.push({ year: y0 + off, age: a0 + off, kind: "small", reason: dom });
      }
      return slots.sort((a, b) => a.year - b.year || (a.kind === "big" ? -1 : 1));
    },

    async makeDecision(state, slot) {
      await sleep(callDelay);
      const q = lastUserQuote(state.profile);
      const n = state.decisions.length + 1;
      if (slot.kind === "big") {
        const bigIndex = state.decisions.filter((d) => d.kind === "big").length;
        const t = BIG[bigIndex % BIG.length]!;
        return {
          id: `d-${slot.age}-${n}`,
          kind: "big",
          year: slot.year,
          age: slot.age,
          domains: t.domains,
          prompt: fill(t.prompt, slot.year, slot.age),
          whyAsking: q ? `You said "${words(q.text, 9)}". ${t.why.split(";")[1]?.trim() ?? t.why}` : t.why,
          whyQuoteId: q?.id ?? null,
          options: t.options.map(([label, hint, branchTitle], i) => ({ id: "abcd"[i]!, label, hint, branchTitle })),
          placeholder: "Or tell me what you'd really do…",
          status: "pending",
        };
      }
      const pool = SMALL.filter((t) => t.domain === slot.reason);
      const t = (pool.length ? pool : SMALL)[n % (pool.length || SMALL.length)]!;
      return {
        id: `d-${slot.age}-${n}`,
        kind: "small",
        year: slot.year,
        age: slot.age,
        domains: [t.domain],
        prompt: `It's ${slot.year}. ${t.prompt}`,
        whyAsking: t.why,
        whyQuoteId: null,
        options: t.options.map((label, i) => ({ id: "abcd"[i]!, label, hint: null, branchTitle: null })),
        placeholder: "Or say what you'd actually do…",
        status: "pending",
      };
    },

    async applyAnswer(state, decision, answer) {
      await sleep(callDelay / 2);
      if (!state.profile) throw new Error("no_profile");
      const p = clone(state.profile);
      let quote: Quote | null = null;
      if (answer.text?.trim()) {
        quote = { id: nextQuoteId(p), text: answer.text.trim(), questionId: decision.id, source: "answer", shortForm: words(answer.text.trim(), 12) };
        p.quotes.push(quote);
        p.knowMeScore = Math.min(100, p.knowMeScore + 6);
      } else {
        p.knowMeScore = Math.min(100, p.knowMeScore + 1);
      }
      for (const d of decision.domains) p.worries[d] = Math.min(1, p.worries[d] + 0.03);
      p.profileVersion += 1;
      p.updatedAt = new Date().toISOString();
      return { profile: p, quote };
    },

    async generateYears(state, fromYear, count, onYear) {
      const out: SimYear[] = [];
      const end = Math.min(endYearOf(state), fromYear + count - 1);
      for (let y = fromYear; y <= end; y++) {
        await sleep(yearDelay);
        const sy = sourceYear(state, lifeAt(state, y), y, "you");
        out.push(sy);
        onYear(sy);
      }
      return out;
    },

    logFor(_state, year) {
      const lines: LogLine[] = [
        { id: `log-${year.year}-y`, year: year.year, age: year.age, kind: "year", text: year.summary, domain: null, tone: null, why: null, baseRate: null, refId: null },
      ];
      for (const e of year.events) {
        lines.push({
          id: `log-${e.id}`, year: year.year, age: year.age, kind: "event", text: e.title, domain: e.domain, tone: e.tone,
          why: e.cause, baseRate: e.baseRate, refId: e.id,
        });
      }
      return lines;
    },

    async spawnBranches(state, decision, chosenOptionId) {
      await sleep(callDelay);
      const fresh: Branch[] = decision.options
        .filter((o) => o.id !== chosenOptionId)
        .map((o, i) => {
          const key = OPTION_LIFE[o.id] ?? "path";
          const yrs = [sourceYear(state, key, Math.min(endYearOf(state), decision.year + 1), `br-${decision.id}-${o.id}`)];
          return {
            id: `b-${decision.id}-${o.id}`,
            forkDecisionId: decision.id,
            optionId: o.id,
            title: o.branchTitle ?? o.label,
            forkYear: decision.year,
            forkAge: decision.age,
            status: "active" as const,
            years: yrs,
            verdictAtEnd: null,
            divergence: Math.round((0.45 + 0.5 * hash01(`${decision.id}-${o.id}-${i}`)) * 100) / 100,
          };
        });
      const all = [...state.branches.filter((b) => b.status === "active"), ...fresh];
      // Keep the 3 most different: prefer the newest fork on ties so each fork is visible.
      const keep = new Set([...all].sort((a, b) => b.divergence - a.divergence || b.forkYear - a.forkYear).slice(0, 3).map((b) => b.id));
      return all.map((b) => (keep.has(b.id) ? b : { ...b, status: "retired" as const }));
    },

    async stepBranch(state, branch, untilYear, fine) {
      await sleep(callDelay / 2);
      const key = OPTION_LIFE[branch.optionId] ?? "path";
      const years = [...branch.years];
      const step = fine ? 1 : 5;
      const last = years.at(-1)?.year ?? branch.forkYear;
      const target = Math.min(endYearOf(state), untilYear);
      const have = new Set(years.map((y) => y.year));
      for (let y = fine ? branch.forkYear + 1 : last + step; y <= target; y += step) {
        if (!have.has(y)) years.push(sourceYear(state, key, y, `br-${branch.id}`));
      }
      if (!have.has(target) && target > (years.at(-1)?.year ?? 0)) years.push(sourceYear(state, key, target, `br-${branch.id}`));
      years.sort((a, b) => a.year - b.year);
      return { ...branch, years };
    },

    async interlude(state) {
      await sleep(callDelay);
      const year = Math.min(endYearOf(state), state.playhead.year + 1);
      return state.branches
        .filter((b) => b.status === "active")
        .slice(0, 3)
        .map((b): InterludeCut => {
          const sy = sourceYear(state, OPTION_LIFE[b.optionId] ?? "path", year, `cut-${b.id}`);
          return { branchId: b.id, title: b.title, age: sy.age, scene: sy.scene, caption: words(`${b.title}: ${sy.summary}`, 14) };
        });
    },

    async settingsFor(state) {
      await sleep(callDelay);
      const q = (state.profile?.quotes ?? []).slice(-2).map((x) => x.id);
      const prev = new Map(state.settings.map((s) => [s.id, s.value]));
      const chosen = lifeAt(state, state.playhead.year + 1);
      const list: LiveSetting[] = [
        {
          id: "focus", type: "chips", label: "What you're focusing on", hint: "Shifts where your time goes from next year",
          options: [{ value: "career", label: "Career" }, { value: "family", label: "Family" }, { value: "craft", label: "Making things" }, { value: "health", label: "Health" }],
          multi: false, leftLabel: null, rightLabel: null, value: prev.get("focus") ?? (chosen === "unjudged" ? "craft" : "career"), sourceQuoteIds: q,
        },
        {
          id: "investing", type: "select", label: "How you invest", hint: "Changes how your savings grow, and how bumpy it is",
          options: [{ value: "cash", label: "Keep it in cash" }, { value: "index", label: "Index funds" }, { value: "property", label: "Property" }, { value: "own", label: "Bet on my own work" }],
          multi: false, leftLabel: null, rightLabel: null, value: prev.get("investing") ?? "index", sourceQuoteIds: q,
        },
        {
          id: "balance", type: "slider", label: "Work-life balance", hint: "More life means slower raises, better sleep",
          options: [], multi: false, leftLabel: "All work", rightLabel: "All life", value: prev.get("balance") ?? "40", sourceQuoteIds: q,
        },
        {
          id: "family_yes", type: "toggle", label: "Saying yes to family", hint: "Family asks get a yes by default",
          options: [], multi: false, leftLabel: null, rightLabel: null, value: prev.get("family_yes") ?? "true", sourceQuoteIds: q,
        },
      ];
      if (chosen === "leap") {
        list.push({
          id: "where", type: "select", label: "Where you live", hint: "Moving changes your work, people and costs",
          options: [{ value: "abroad", label: "Stay abroad" }, { value: "home", label: "Move back home" }, { value: "next", label: "Somewhere new" }],
          multi: false, leftLabel: null, rightLabel: null, value: prev.get("where") ?? "abroad", sourceQuoteIds: q,
        });
      }
      return list;
    },

    async ending(state): Promise<Ending> {
      await sleep(callDelay);
      const chosen = LIVES[lifeAt(state, endYearOf(state))];
      const q = lastUserQuote(state.profile);
      const name = state.profile?.firstName ?? "you";
      const branchVerdicts: Record<string, string> = {};
      const fiveYear: Record<string, string> = {};
      const a = startAgeOf(state);
      fiveYear.chosen =
        `In five years I'll be ${a + 5}. ${chosen.years[5]?.summary ?? ""} ` +
        (q ? `I once said "${words(q.text, 14)}", and that's still the thread I'm following. ` : "") +
        `I'm not chasing the louder version of this life; I'm building the one I chose, on purpose.`;
      for (const b of state.branches.filter((x) => x.status === "active")) {
        const l = LIVES[OPTION_LIFE[b.optionId] ?? "path"];
        branchVerdicts[b.id] = l.verdictAt70;
        fiveYear[b.id] = `In five years, if I'd chosen "${b.title}", I'd be ${a + 5}. ${l.years[5]?.summary ?? ""} ${l.tagline}`;
      }
      return { verdict: `${chosen.verdictAt70}`.replace(/^/, name === "you" ? "" : ""), branchVerdicts, fiveYear };
    },

    async *replyAs(state, life, age, _history, text) {
      const branch = state.branches.find((b) => b.id === life);
      const key: LifeKey = branch ? (OPTION_LIFE[branch.optionId] ?? "path") : lifeAt(state, state.playhead.year);
      const l = LIVES[key];
      const y = l.years[Math.max(0, Math.min(l.years.length - 1, age - startAgeOf(state)))];
      const reply =
        life === "interviewer"
          ? `Thank you. I'll fold that in: "${words(text, 12)}". It changes how I see the next few years.`
          : `It's me, at ${age}. ${y?.summary ?? ""} You asked about "${words(text, 10)}". ` +
            `Honestly? ${l.verdictAt70} Some days I miss the other roads. Most days I don't.`;
      for (const w of reply.split(/(\s+)/)) {
        await sleep(25);
        yield w;
      }
    },

    async safety(text): Promise<SafetyResult> {
      if (/\b(kill myself|suicid|end my life|hurt myself|self[- ]harm|don'?t want to (be alive|live))/i.test(text)) return { flagged: true, kind: "self_harm" };
      if (/\b(he|she|they) (hits|beats|hurts) me\b|\babus(e|ed|ive)\b/i.test(text)) return { flagged: true, kind: "abuse" };
      return { flagged: false, kind: null };
    },
  };
  return engine;
}

export type { Decision, DecisionAnswer };
