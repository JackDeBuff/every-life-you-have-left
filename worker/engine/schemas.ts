/**
 * What the models return (drafts). Code owns ids, years/ages, quotes, decisionIds and every
 * invariant; these schemas are sent as responseJsonSchema (via geminiSchema) and validated with
 * zod. Header fields come before big arrays (shared/schema.ts rules).
 */
import { z } from "zod";
import { BASE_RATE_IDS } from "../../shared/baseRates";
import { DomainKey, DomainStates, DomainWeights, EventCategory, FearKind, MoneyFeel, PLAN_KINDS, Tone } from "../../shared/schema";
import {
  ACTIVITIES, AGE_BANDS, FLAVORS, HOMES, MOMENTS, MOODS, ROLES, SEASONS, SETTINGS_PLACE, SettingType, TIMES, WEATHERS,
} from "../../shared/sim";

const int = () => z.number().int();
const w01 = () => z.number().min(0).max(1);

// ---------------------------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------------------------

export const FACT_KEYS = [
  "occupation", "education", "location", "living", "relationship", "children", "background", "health_habits", "interests", "other",
] as const;

const FactDraft = z.object({
  key: z.enum(FACT_KEYS),
  label: z.string().describe('Card title, 1-2 words, e.g. "Work"'),
  value: z.string().describe('Short phrase, e.g. "Data analyst at a regional bank, 2 years"'),
  source: z.enum(["answer", "upload", "inferred"]),
  quoteIds: z.array(z.string()),
  confidence: w01(),
});
const ValueDraft = z.object({ label: z.string().describe("1-2 words"), weight: w01(), quoteIds: z.array(z.string()) });
const FearDraft = z.object({ text: z.string().describe("<= 12 words, in their framing"), kind: FearKind, quoteIds: z.array(z.string()) });
const PersonDraft = z.object({
  label: z.string().describe('How the user names them: "Mom", "Sam". Never invent a name.'),
  relation: z.string().describe("mother, father, partner, sibling, friend, manager, child, ..."),
  closeness: w01(),
  influence: w01(),
  expectation: z.string().nullable().describe("What they expect of the user, only if said or clearly implied"),
  quoteIds: z.array(z.string()),
});
const ConstraintDraft = z.object({
  kind: z.enum(["debt", "family_obligation", "visa", "health_habit", "location", "caregiving", "other"]),
  text: z.string(),
  personLabel: z.string().nullable().describe("The person's label if the constraint is about one of the people"),
  quoteIds: z.array(z.string()),
});
const MoneyDraft = z.object({
  feel: MoneyFeel,
  incomeUsd: int().nullable().describe("Annual personal income in USD (convert local currency); estimate if unknown and set assumed"),
  debtUsd: int().nullable(),
  debtKind: z.string().nullable(),
  savingsUsd: int().nullable(),
  supportsFamily: z.boolean(),
  assumed: z.boolean().describe("true if any money number was guessed"),
});
const PlanDraft = z.object({
  text: z.string().describe("The plan in their framing, <= 16 words"),
  year: int().describe("The year it happens (resolve 'next year' from today's year)"),
  when: z.string().nullable().describe('Finer timing if they said it, e.g. "early 2027"'),
  kind: z.enum(PLAN_KINDS),
  certainty: z.enum(["fixed", "likely", "hoped"]),
  quoteIds: z.array(z.string()),
});
const SeedDraft = z.object({ text: z.string().describe("<= 14 words"), quoteIds: z.array(z.string()) });

export const ProfileLLM = z.object({
  docQuotes: z
    .array(z.object({ ref: z.string().describe('"d1", "d2", ...'), docIndex: int(), text: z.string().describe("Copied EXACTLY from the document") }))
    .describe("Up to 6 sentences copied verbatim from the documents that say something personal; [] if no documents"),
  shortForms: z.array(z.object({ quoteId: z.string(), shortForm: z.string().describe("<= 12 words, verbatim excerpt of that quote") })),
  facts: z.array(FactDraft),
  values: z.array(ValueDraft).describe("2-5"),
  fears: z.array(FearDraft).describe("0-4"),
  people: z.array(PersonDraft),
  constraints: z.array(ConstraintDraft),
  money: MoneyDraft,
  worries: DomainWeights.describe("0..1 per domain; 0.1 default; what they worry about or keep coming back to"),
  seeds: z.object({ path: SeedDraft, leap: SeedDraft, careful: SeedDraft, unjudged: SeedDraft }),
  plans: z.array(PlanDraft).describe("Concrete plans they stated with a time; [] if none"),
  assumptions: z.array(z.object({ field: z.string(), value: z.string(), reason: z.string() })),
});
export type ProfileLLM = z.infer<typeof ProfileLLM>;

/** Folding one decision answer into the profile (fast model). */
export const AnswerDeltaLLM = z.object({
  shortForm: z.string().nullable().describe("<= 12 words, verbatim excerpt of their answer; null if no text"),
  worries: DomainWeights,
  facts: z.array(FactDraft).describe("New or corrected facts only"),
  people: z.array(PersonDraft).describe("New people, or existing people (same label) with updated expectation/closeness"),
  fears: z.array(FearDraft),
  values: z.array(ValueDraft),
  constraints: z.array(ConstraintDraft),
  money: MoneyDraft.nullable().describe("Only if the answer changes what we know about money"),
  plans: z.array(PlanDraft).describe("New dated plans this answer states; [] if none"),
});
export type AnswerDeltaLLM = z.infer<typeof AnswerDeltaLLM>;

// ---------------------------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------------------------

export const LEANS = ["path", "leap", "careful", "unjudged"] as const;
export const DecisionLLM = z.object({
  domains: z.array(DomainKey).describe("1-3 domains this decision is about"),
  prompt: z.string().describe("The question set in the moment, <= 30 words"),
  whyAsking: z.string().describe("<= 20 words, cites what they said"),
  whyQuoteId: z.string().nullable(),
  options: z
    .array(
      z.object({
        lean: z.enum(LEANS),
        label: z.string().describe("<= 10 words, first person, a real choice"),
        hint: z.string().nullable().describe("<= 12 words: what it trades off"),
        branchTitle: z.string().nullable().describe("Big: 2-4 words naming the fork. Small: null"),
      }),
    )
    .min(4)
    .max(4),
  placeholder: z.string(),
});
export type DecisionLLM = z.infer<typeof DecisionLLM>;

// ---------------------------------------------------------------------------------------------
// Years
// ---------------------------------------------------------------------------------------------

export const EventDraft = z.object({
  domain: DomainKey,
  category: EventCategory,
  title: z.string().describe("<= 8 words"),
  narrative: z.string().describe("2-3 concrete sentences, present tense, second person"),
  isTurningPoint: z.boolean(),
  cause: z.object({ quoteId: z.string(), reason: z.string().describe("One sentence, second person, links their words to this") }).nullable(),
  baseRate: z.object({ statId: z.enum(BASE_RATE_IDS) }).nullable(),
  tone: Tone,
  worldId: z.string().nullable().describe('world_context only: the world event id ("w1"); else null'),
});
export type EventDraft = z.infer<typeof EventDraft>;

export const SceneDraft = z.object({
  setting: z.enum(SETTINGS_PLACE),
  flavor: z.enum(FLAVORS),
  placeLabel: z.string(),
  home: z.enum(HOMES),
  activity: z.enum(ACTIVITIES),
  people: z.array(z.object({ role: z.enum(ROLES), ageBand: z.enum(AGE_BANDS) })).max(6),
  season: z.enum(SEASONS),
  timeOfDay: z.enum(TIMES),
  weather: z.enum(WEATHERS),
  mood: z.enum(MOODS),
  moment: z.enum(MOMENTS).nullable(),
  caption: z.string().describe("<= 8 words"),
});

export const YearDraft = z.object({
  year: int(),
  age: int(),
  place: z.string().describe('"City, Region" or "City, Country"'),
  events: z.array(EventDraft).max(3),
  summary: z.string().describe("One line, <= 20 words"),
  money: z.object({ income: int(), netWorth: int() }),
  states: DomainStates,
  scene: SceneDraft,
});
export type YearDraft = z.infer<typeof YearDraft>;

/**
 * What the model actually writes per year: short keys, states as a fixed-order array, people as
 * "role:ageBand" tags. ~2.5x fewer output tokens than YearDraft (measured 490 → ~200 tokens/year
 * on gemini-3.8-flash at ~130 tok/s), which is what keeps generation ahead of Auto playback.
 * Code expands it into YearDraft (validate.ts coerceYear) and then SimYear.
 */
export const STATE_ORDER = ["career", "wealth", "achievement", "family", "relationships", "children", "mentalHealth", "happiness", "lifeGoals", "risk"] as const;
export const PEOPLE_TAGS = ROLES.filter((r) => r !== "self").flatMap((r) => AGE_BANDS.map((b) => `${r}:${b}`)) as [string, ...string[]];

export const EventC = z.object({
  d: DomainKey.describe("domain"),
  c: EventCategory.describe("category"),
  t: z.string().describe("title, <= 8 words"),
  n: z.string().describe("narrative: 1-2 concrete sentences, <= 30 words, present tense, second person"),
  tp: z.boolean().describe("isTurningPoint"),
  q: z.string().nullable().describe("cause quote id (required when tp)"),
  why: z.string().nullable().describe("one sentence linking their words to this event (required when tp)"),
  st: z.enum(BASE_RATE_IDS).nullable().describe("base-rate statId, only when it genuinely applies"),
  tone: Tone,
  w: z.string().nullable().describe("world event id, world_context only"),
});
export const SceneC = z.object({
  set: z.enum(SETTINGS_PLACE),
  fl: z.enum(FLAVORS),
  home: z.enum(HOMES),
  act: z.enum(ACTIVITIES),
  ppl: z.array(z.enum(PEOPLE_TAGS)).max(5).describe('everyone in their life this year besides self, as "role:ageBand"'),
  sea: z.enum(SEASONS),
  tod: z.enum(TIMES),
  wx: z.enum(WEATHERS),
  mood: z.enum(MOODS),
  mom: z.enum(MOMENTS).nullable(),
  cap: z.string().describe("caption, <= 8 words"),
});
export const YearC = z.object({
  y: int().describe("year"),
  p: z.string().describe("place"),
  e: z.array(EventC).max(3),
  s: z.string().describe("summary, <= 18 words"),
  inc: int().describe("income USD"),
  nw: int().describe("net worth USD"),
  k: z.array(z.number().int().min(0).max(100)).min(10).max(10).describe(`states in this order: ${STATE_ORDER.join(", ")}`),
  sc: SceneC,
});
export type YearC = z.infer<typeof YearC>;

export const YearsLLM = z.object({ years: z.array(YearC) });
export const OneYearLLM = z.object({ year: YearC });

// ---------------------------------------------------------------------------------------------
// Settings, interlude, ending, safety
// ---------------------------------------------------------------------------------------------

export const SettingsLLM = z.object({
  settings: z
    .array(
      z.object({
        id: z.string().describe("snake_case; reuse an existing id when it is the same control"),
        type: SettingType,
        label: z.string(),
        hint: z.string(),
        options: z.array(z.object({ value: z.string(), label: z.string() })),
        multi: z.boolean(),
        leftLabel: z.string().nullable(),
        rightLabel: z.string().nullable(),
        value: z.string(),
        sourceQuoteIds: z.array(z.string()),
      }),
    )
    .min(3)
    .max(5),
});

export const InterludeLLM = z.object({
  cuts: z.array(z.object({ branchId: z.string(), caption: z.string().describe("<= 14 words, honest, concrete") })),
});

export const EndingLLM = z.object({
  lives: z.array(
    z.object({
      id: z.string().describe('"chosen" or the branch id'),
      verdict: z.string().describe("One sentence spoken at the end age; no ranking"),
      fiveYear: z.string().describe("3-4 first-person sentences answering 'Where do you see yourself in five years?'"),
    }),
  ),
});

export const SafetyLLM = z.object({
  category: z.enum(["none", "self_harm", "abuse", "other"]),
  severity: int().describe("0 none, 1 past or mild, 2 concerning, 3 acute"),
});
