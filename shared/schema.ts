/**
 * The contract between the Worker, the prompts and the UI (CLAUDE.md "Contracts").
 * Change deliberately; update every user (worker/, src/, shared/demo, scripts) in the same commit.
 *
 * Gemini rules for any schema that is sent as `generationConfig.responseJsonSchema`
 * (research/04 §3.1): no unions except `X | null`, enums are small string lists, short property
 * names, small header fields BEFORE big arrays (so streaming shows the title first),
 * and length guidance lives in `.describe()` because Gemini drops minLength/maxLength.
 * Use `geminiSchema(zodSchema)` to get the JSON Schema; validate the result with zod.
 */
import { z } from "zod";
import { BASE_RATE_IDS } from "./baseRates";
import { CURRENCY_CODES } from "./currency";
import { DOMAIN_KEYS } from "./domains";
import { LIFE_KEYS } from "./lives";

// ---------------------------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------------------------

export const DomainKey = z.enum(DOMAIN_KEYS);
export const LifeKey = z.enum(LIFE_KEYS);
const int = () => z.number().int();
const score = () => z.number().int().min(0).max(100);
const weight = () => z.number().min(0).max(1);
const ids = (what: string) => z.array(z.string()).describe(`ids of ${what}`);

/** All 10 domains, each 0–100. `risk` is exposure, not wellbeing (see shared/domains.ts). */
export const DomainStates = z.object({
  career: score(),
  wealth: score(),
  achievement: score(),
  family: score(),
  relationships: score(),
  children: score(),
  mentalHealth: score(),
  happiness: score(),
  lifeGoals: score(),
  risk: score(),
});
export type DomainStates = z.infer<typeof DomainStates>;

/** All 10 domains, each 0–1. Used for worry weights (D-006: more story time, never worse odds). */
export const DomainWeights = z.object({
  career: weight(),
  wealth: weight(),
  achievement: weight(),
  family: weight(),
  relationships: weight(),
  children: weight(),
  mentalHealth: weight(),
  happiness: weight(),
  lifeGoals: weight(),
  risk: weight(),
});
export type DomainWeights = z.infer<typeof DomainWeights>;

// ---------------------------------------------------------------------------------------------
// Questions and answers
// ---------------------------------------------------------------------------------------------

export const QuestionKind = z.enum(["fast", "deep", "confirm", "pause"]);
export const Question = z.object({
  id: z.string().describe('Stable id: "fast.q1".."fast.q5", "deep.<domain>.<n>", "confirm.cv", or a pause id "P1"'),
  kind: QuestionKind,
  text: z.string().describe("The question as shown/spoken. One question, second person, <= 45 words."),
  domain: DomainKey.nullable().describe("Main domain this question fills, or null for multi-domain"),
  hint: z.string().nullable().describe("Optional placeholder / example answer, <= 12 words"),
});
export type Question = z.infer<typeof Question>;

export const AnswerVia = z.enum(["voice", "text"]);
export const Answer = z.object({
  questionId: z.string(),
  questionText: z.string(),
  text: z.string().describe("Verbatim answer (transcript if voice)"),
  via: AnswerVia,
  at: z.string().describe("ISO-8601 timestamp"),
});
export type Answer = z.infer<typeof Answer>;

// ---------------------------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------------------------

export const QuoteSource = z.enum(["answer", "pause", "cv", "linkedin", "ai_export"]);
/** A sentence the user actually said/wrote. Turning points cite these by id (D-013). */
export const Quote = z.object({
  id: z.string().describe('Stable id "q1", "q2", ... never reused'),
  text: z.string().describe("The user's exact words, verbatim"),
  questionId: z.string().nullable().describe("Question it answered, null for upload-derived quotes"),
  source: QuoteSource,
  shortForm: z.string().nullable().describe("<= 12 words, verbatim excerpt shown on the why card"),
});
export type Quote = z.infer<typeof Quote>;

export const Provenance = z.enum(["answer", "upload", "inferred"]);

export const Fact = z.object({
  id: z.string(),
  key: z
    .string()
    .describe(
      "One of: occupation, education, location, living, relationship, children, background, health_habits, interests, other",
    ),
  label: z.string().describe('Card title, e.g. "Work"'),
  value: z.string().describe('Short phrase, e.g. "Data analyst at a regional bank, 2 years"'),
  source: Provenance,
  quoteIds: ids("quotes this came from"),
  confidence: weight(),
});
export type Fact = z.infer<typeof Fact>;

export const Value = z.object({
  id: z.string(),
  label: z.string().describe('One or two words, e.g. "Independence"'),
  weight: weight(),
  quoteIds: ids("quotes"),
});

export const FearKind = z.enum(["boldness", "connection", "foundation", "other"]);
export const Fear = z.object({
  id: z.string(),
  text: z.string(),
  kind: FearKind.describe("boldness = never trying; connection = being alone; foundation = money/security"),
  quoteIds: ids("quotes"),
});

export const Person = z.object({
  id: z.string().describe('"p1", "p2", ...'),
  label: z.string().describe('How the user names them: "Mom", "Sam"'),
  relation: z.string().describe("mother, father, partner, sibling, friend, manager, child, ..."),
  closeness: weight(),
  influence: weight(),
  expectation: z.string().nullable().describe("What they expect of the user, if said"),
  quoteIds: ids("quotes"),
  /** Birth year, when an age or a birth year was stated (an upload's "Theo, who is 9"). Optional: older profiles lack it. */
  born: int().nullable().optional(),
});
export type Person = z.infer<typeof Person>;

export const Constraint = z.object({
  id: z.string(),
  kind: z.string().describe("debt, family_obligation, visa, health_habit, location, caregiving, other"),
  text: z.string(),
  personId: z.string().nullable(),
  quoteIds: ids("quotes"),
});

export const MoneyFeel = z.enum(["tight", "okay", "comfortable"]);
export const Money = z.object({
  feel: MoneyFeel,
  incomeUsd: int().nullable().describe("Annual personal income, USD, if known or estimated"),
  debtUsd: int().nullable(),
  debtKind: z.string().nullable().describe("student_loans, credit_card, car, mortgage, family, ..."),
  savingsUsd: int().nullable(),
  supportsFamily: z.boolean(),
  assumed: z.boolean().describe("true if money facts were guessed, so the UI can say 'We guessed. Tap to fix.'"),
});
export type Money = z.infer<typeof Money>;

/** One seed per archetype (research/03 §3.1): the sentence each life grows from. */
export const Seed = z.object({
  text: z.string(),
  quoteIds: ids("quotes"),
});
export const Seeds = z.object({
  path: Seed.describe("Momentum: what happens if nothing changes"),
  leap: Seed.describe("The crossroads from Q2: the decision this life says yes to"),
  careful: Seed.describe("The core fear from Q4 that this life avoids at every fork"),
  unjudged: Seed.describe("The secret want from Q5"),
});

export const Assumption = z.object({
  field: z.string(),
  value: z.string(),
  reason: z.string(),
});

export const PLAN_KINDS = ["move", "job", "study", "family", "money", "other"] as const;
/**
 * A concrete plan they stated, with a date ("I'll return to Bangkok in early 2027 for a Management
 * Associate program"). Baseline reality for the chosen life: it happens on time unless a decision
 * in that life changes it. A big decision may still fork around it when it's genuinely uncertain.
 */
export const PlannedEvent = z.object({
  id: z.string().describe('"pl1", "pl2", ...'),
  text: z.string().describe("In their framing, <= 16 words"),
  year: int().describe("The year it happens"),
  when: z.string().nullable().describe('Finer timing if they said it: "early 2027", "June"'),
  kind: z.enum(PLAN_KINDS),
  certainty: z.enum(["fixed", "likely", "hoped"]).describe("fixed = committed (a contract, a bond, a booked date); likely = intended; hoped = wished"),
  quoteIds: ids("quotes"),
});
export type PlannedEvent = z.infer<typeof PlannedEvent>;

/**
 * A thread THIS life is made of, in their terms (a documentary practice, parents abroad, an employer
 * bond, a sport, caregiving, a side business...). Decisions rotate across them so two different
 * people never get the same career ladder (playtest feedback, Sat Nov 7). Optional: older profiles lack it.
 */
export const LifeAxis = z.object({
  id: z.string().describe('"a1", "a2", ...'),
  label: z.string().describe("2-5 words in their terms, e.g. 'Weekend documentaries', 'Parents in Porto'"),
  domain: DomainKey,
  detail: z.string().describe("<= 16 words: what is at stake on this axis for them"),
  quoteIds: ids("quotes"),
});
export type LifeAxis = z.infer<typeof LifeAxis>;

export const GROUNDED_KINDS = ["office", "work_mode", "pay", "commute", "place", "school", "other"] as const;
/**
 * A real-world fact looked up with Google Search when the profile was built (employer offices, work
 * mode, pay band, commute, school, city). Approximate; whatever the user said always wins.
 */
export const GroundedFact = z.object({
  about: z.string().describe("The employer, school or place it is about"),
  kind: z.enum(GROUNDED_KINDS),
  text: z.string().describe("<= 30 words"),
});
export type GroundedFact = z.infer<typeof GroundedFact>;

/**
 * Self-identified gender, picked on the start screen (Appearance.gender). Never inferred from a
 * selfie, a name or anything the user wrote. Not set (null) or "undisclosed" = they/them.
 */
export const GENDERS = ["woman", "man", "nonbinary", "undisclosed"] as const;
export const Gender = z.enum(GENDERS);
export type Gender = z.infer<typeof Gender>;
export const pronounsFor = (g: Gender | null | undefined): "she/her" | "he/him" | "they/them" =>
  g === "woman" ? "she/her" : g === "man" ? "he/him" : "they/them";

export const Profile = z.object({
  sessionId: z.string(),
  profileVersion: int().describe("Bumps on every answer or pause; lives record which version they used"),
  firstName: z.string().nullable(),
  gender: Gender.nullable().optional().describe("Code-owned copy of Appearance.gender from the start screen; models never set it"),
  age: int().min(18).max(110),
  birthYear: int(),
  country: z.string().describe("ISO 3166-1 alpha-2, e.g. US. Base rates are US (approximate elsewhere)."),
  currency: z.enum(CURRENCY_CODES).optional().describe("Code-owned display currency (their pick, else the country's). Every number stays USD; the UI converts"),
  region: z.string().nullable().describe('State/province, e.g. "NC"'),
  city: z.string().nullable(),
  startYear: int().describe("The year the lives start (today)"),
  endAge: int().describe("70, or age + 15 when age > 55 (D-009). Use endAgeFor(age)."),
  facts: z.array(Fact),
  values: z.array(Value),
  fears: z.array(Fear),
  people: z.array(Person),
  constraints: z.array(Constraint),
  money: Money,
  worries: DomainWeights.describe("0..1 per domain, default 0.1. More attention, never worse odds."),
  seeds: Seeds,
  quotes: z.array(Quote),
  assumptions: z.array(Assumption),
  plans: z.array(PlannedEvent).optional().describe("Dated plans they stated; baseline reality for the chosen life"),
  axes: z.array(LifeAxis).optional().describe("The threads this life is made of; decisions rotate across them"),
  grounded: z.array(GroundedFact).optional().describe("Web-grounded facts about their employer/school/city (approximate; their words win)"),
  knowMeScore: score().describe("How well we know the user; >= TWIN_THRESHOLD unlocks the twin chat (D-026)"),
  updatedAt: z.string(),
});
export type Profile = z.infer<typeof Profile>;

/**
 * What Gemini returns from /api/profile. Code owns ids, versions, quotes (verbatim from
 * answers/uploads), endAge and knowMeScore; the model may only cite existing quote ids.
 */
export const ProfileDraft = Profile.omit({
  sessionId: true,
  profileVersion: true,
  gender: true,
  currency: true,
  startYear: true,
  endAge: true,
  quotes: true,
  knowMeScore: true,
  updatedAt: true,
});
export type ProfileDraft = z.infer<typeof ProfileDraft>;

/** D-009 */
export const endAgeFor = (age: number): number => (age > 55 ? age + 15 : 70);
/** Score at which the "talk to future you" layer switches from letters to the twin chat. */
export const TWIN_THRESHOLD = 60;

// ---------------------------------------------------------------------------------------------
// Plan (one call, names the four lives and their arcs) and the shared world timeline
// ---------------------------------------------------------------------------------------------

export const WorldKind = z.enum(["downturn", "tech_shift", "other"]);
/** D-005: one world for all four lives. 1–2 downturns + at most 1 tech shift; no disasters. */
export const WorldEvent = z.object({
  id: z.string().describe('"w1", "w2"'),
  year: int(),
  kind: WorldKind,
  title: z.string().describe("<= 8 words, calm, e.g. 'A two-year downturn'"),
});
export type WorldEvent = z.infer<typeof WorldEvent>;

export const Beat = z.object({
  age: int(),
  domain: DomainKey,
  title: z.string().describe("<= 8 words"),
});

export const LifeArc = z.object({
  key: LifeKey,
  title: z.string().describe("This person's name for the life, 3-6 words, e.g. 'The Singapore Years'"),
  premise: z.string().describe("One sentence: the choice that makes this life different"),
  seedQuoteIds: ids("quotes this life grows from"),
  arc: z.string().describe("2-3 sentences: beginning, middle, end"),
  beats: z.array(Beat).describe("3-6 key beats in age order"),
});
export type LifeArc = z.infer<typeof LifeArc>;

export const LifePlan = z.object({
  profileVersion: int(),
  world: z.array(WorldEvent).max(3),
  arcs: z.array(LifeArc).min(4).max(4).describe("Exactly 4, in order path, leap, careful, unjudged"),
});
export type LifePlan = z.infer<typeof LifePlan>;

// ---------------------------------------------------------------------------------------------
// Life
// ---------------------------------------------------------------------------------------------

/** Event catalog (research/03 §3.4). The validator enforces budgets and cooldowns per category. */
export const EVENT_CATEGORIES = [
  "career_move", "career_change", "job_loss", "burnout", "love_start", "love_end", "marriage",
  "divorce", "child", "move", "home", "money_up", "money_down", "caregiving", "friendship",
  "health_habit", "achievement", "world_context", "texture",
] as const;
export const EventCategory = z.enum(EVENT_CATEGORIES);
export type EventCategory = z.infer<typeof EventCategory>;

export const Tone = z.enum(["up", "down", "mixed"]);

/** Why it happened: the user's own sentence (D-013). Required on every turning point. */
export const Cause = z.object({
  quoteId: z.string().describe("Must be an id in profile.quotes"),
  reason: z.string().describe("One sentence linking the quote to this event, second person"),
});
export type Cause = z.infer<typeof Cause>;

export const BaseRateRef = z.object({
  statId: z.enum(BASE_RATE_IDS).describe("An id from shared/baseRates.ts"),
});

export const LifeEvent = z.object({
  id: z.string().describe('"<lifeKey>-<year>-<n>", e.g. "leap-2027-1"'),
  domain: DomainKey,
  category: EventCategory,
  title: z.string().describe("<= 8 words, second person or noun phrase"),
  narrative: z.string().describe("2-3 concrete sentences, present tense, second person, no cliches"),
  isTurningPoint: z.boolean(),
  cause: Cause.nullable().describe("Required when isTurningPoint; null = 'how life tends to go'"),
  baseRate: BaseRateRef.nullable(),
  tone: Tone,
});
export type LifeEvent = z.infer<typeof LifeEvent>;

export const YearMoney = z.object({
  income: int().describe("Annual personal income, USD in today's dollars"),
  netWorth: int().describe("USD in today's dollars; negative when debt exceeds assets"),
});

export const Year = z.object({
  year: int(),
  age: int(),
  place: z.string().describe('Where you live, "City, Region/Country"'),
  summary: z.string().describe("One line, <= 20 words. Quiet years still get a texture line."),
  states: DomainStates,
  money: YearMoney,
  events: z.array(LifeEvent).describe("0-3 events; >= 30% of years have no turning point"),
});
export type Year = z.infer<typeof Year>;

export const Life = z.object({
  key: LifeKey,
  title: z.string().describe("This life's own title, 3-6 words"),
  tagline: z.string().describe("One line, e.g. 'You said yes to Singapore.'"),
  verdictAt70: z.string().describe("One sentence spoken at the end age, e.g. 'Louder than you planned.'"),
  years: z.array(Year).describe("Every year from startYear to the end age, in order"),
});
export type Life = z.infer<typeof Life>;

/** One D1 `lives` row, as the API returns it. */
export const LifeRecord = z.object({
  id: z.string(),
  sessionId: z.string(),
  version: int(),
  model: z.string().nullable(),
  life: Life,
});
export type LifeRecord = z.infer<typeof LifeRecord>;

// ---------------------------------------------------------------------------------------------
// Pauses and re-tune (D-023: a pause answer re-tunes ALL FOUR lives from the pause year)
// ---------------------------------------------------------------------------------------------

export const PauseQuestion = z.object({
  id: z.string().describe('"P1".."P5"'),
  year: int(),
  age: int(),
  domain: DomainKey,
  prompt: z.string().describe("\"It's {year}. You're {age}.\" + 1-2 sentence scene + one direct question. <= 45 words"),
  retunes: z.boolean().describe("false for P5 (reflection at the end; writes the ending in the user's words)"),
});
export type PauseQuestion = z.infer<typeof PauseQuestion>;

export const LifeChange = z.object({
  key: LifeKey,
  summary: z.string().describe("One line: what changed in this life and why, citing the new quote"),
});
export const Retune = z.object({
  pauseId: z.string(),
  fromYear: int(),
  quote: Quote.describe("The pause answer, stored as a new quote"),
  changes: z.array(LifeChange),
  lives: z.array(Life).describe("Replaced lives; years before fromYear are unchanged"),
});
export type Retune = z.infer<typeof Retune>;

// ---------------------------------------------------------------------------------------------
// Letters and share card
// ---------------------------------------------------------------------------------------------

export const LetterDirection = z.enum(["to_future", "from_future"]);
export const Letter = z.object({
  id: z.string(),
  lifeKey: LifeKey,
  age: int().describe("Age of the future self writing or being written to"),
  direction: LetterDirection,
  text: z.string(),
  createdAt: z.string(),
});
export type Letter = z.infer<typeof Letter>;

/** What Gemini returns for a from_future letter. Code adds id, lifeKey, age, direction, createdAt. */
export const LetterDraft = z.object({
  text: z.string().describe("120-220 words, first person, as you at that age; knows only years up to that age"),
});

export const ShareCard = z.object({
  lifeKey: LifeKey,
  lifeTitle: z.string(),
  firstName: z.string().nullable(),
  endAge: int(),
  endYear: int(),
  verdictAt70: z.string(),
  highlights: z.array(z.string()).max(3).describe("<= 3 short lines, no private quotes unless opted in"),
  quote: z.string().nullable().describe("Only if the user opted in to share it"),
});
export type ShareCard = z.infer<typeof ShareCard>;

// ---------------------------------------------------------------------------------------------
// Demo bundle (shared/demo/*.json): profile + plan + 4 lives + one pause and its re-tune
// ---------------------------------------------------------------------------------------------

export const DemoBundle = z.object({
  profile: Profile,
  plan: LifePlan,
  lives: z.array(Life).length(4),
  pauses: z.array(PauseQuestion),
  retunes: z.array(Retune),
});
export type DemoBundle = z.infer<typeof DemoBundle>;

// ---------------------------------------------------------------------------------------------
// SSE envelope: what /api/* streaming routes send to the browser (NOT a Gemini schema)
// Wire format: `event: <type>\ndata: <json>\n\n`. Every event carries `lifeKey` (null when the
// stream is not about one life) so one connection can multiplex all four (e.g. /api/retune).
//   meta    first event: which model answered (after fallback) and a request id
//   delta   a raw text fragment of the model's JSON; concatenate per lifeKey, parse with partial-json
//   result  the final validated (and possibly repaired) object, e.g. a Life; replaces the deltas
//   warning non-fatal (validator repaired something, fell back to a model)
//   error   fatal for that lifeKey; `retryable` says whether the client should retry
//   done    the stream for that lifeKey (or everything, when null) is complete
// ---------------------------------------------------------------------------------------------

export const STREAM_EVENT_TYPES = ["meta", "delta", "result", "warning", "error", "done"] as const;
export const StreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("meta"), lifeKey: LifeKey.nullable(), model: z.string(), requestId: z.string() }),
  z.object({ type: z.literal("delta"), lifeKey: LifeKey.nullable(), text: z.string() }),
  z.object({ type: z.literal("result"), lifeKey: LifeKey.nullable(), data: z.unknown() }),
  z.object({ type: z.literal("warning"), lifeKey: LifeKey.nullable(), message: z.string() }),
  z.object({
    type: z.literal("error"),
    lifeKey: LifeKey.nullable(),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
  z.object({ type: z.literal("done"), lifeKey: LifeKey.nullable(), ms: z.number() }),
]);
export type StreamEvent = z.infer<typeof StreamEvent>;

/** Encode one envelope event as an SSE frame. */
export const encodeSse = (ev: StreamEvent): string => `event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`;

// ---------------------------------------------------------------------------------------------
// Gemini JSON Schema export
// ---------------------------------------------------------------------------------------------

type Json = { [k: string]: unknown };
const DROP = new Set([
  "$schema", "$id", "additionalProperties", "minLength", "maxLength", "pattern", "default",
  "uniqueItems", "minProperties", "maxProperties", "exclusiveMinimum", "exclusiveMaximum",
]);
const SAFE = Number.MAX_SAFE_INTEGER;

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const src = node as Json;

  // `X | null` (zod .nullable()) -> { ...X, type: [X.type, "null"] }  (Gemini supports type arrays)
  if (Array.isArray(src.anyOf) && src.anyOf.length === 2) {
    const [a, b] = src.anyOf as Json[];
    const nonNull = a?.type === "null" ? b : b?.type === "null" ? a : null;
    if (nonNull && typeof nonNull.type === "string") {
      const merged = clean(nonNull) as Json;
      merged.type = [nonNull.type, "null"];
      if (src.description && !merged.description) merged.description = src.description;
      return merged;
    }
  }

  const out: Json = {};
  for (const [k, v] of Object.entries(src)) {
    if (DROP.has(k)) continue;
    if ((k === "minimum" && v === -SAFE) || (k === "maximum" && v === SAFE)) continue;
    if (k === "const") {
      out.enum = [v];
      continue;
    }
    out[k] = clean(v);
  }
  return out;
}

/**
 * JSON Schema for `generationConfig.responseJsonSchema` (with responseMimeType
 * "application/json"). Strips what Gemini ignores or rejects; keeps type, properties, required,
 * enum, items, min/maxItems, minimum/maximum, description, type arrays with "null".
 */
export function geminiSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { target: "draft-2020-12", io: "output", unrepresentable: "any" })) as Record<
    string,
    unknown
  >;
}
