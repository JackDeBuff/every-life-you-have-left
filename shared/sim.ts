/**
 * v2 simulation contracts (docs/SPEC.md). Shared by worker/ (engine, session agent), src/ (UI, 3D world).
 * Reuses Profile/Quote/Year/LifeEvent/etc. from ./schema. Change deliberately and update all users.
 *
 * Gemini-friendly rules from ./schema still apply for anything sent as responseJsonSchema:
 * no unions except X | null, small string enums, header fields before big arrays.
 */
import { z } from "zod";
import { BaseRateRef, Cause, DomainKey, DomainStates, Profile, Tone, Year } from "./schema";

const int = () => z.number().int();

// ---------------------------------------------------------------------------------------------
// Speed and pacing (SPEC §2)
// ---------------------------------------------------------------------------------------------
export const SPEED_MODES = ["1x", "2x", "4x", "auto"] as const;
export const SpeedMode = z.enum(SPEED_MODES);
export type SpeedMode = z.infer<typeof SpeedMode>;

export interface SpeedConfig {
  /** Small decisions across the whole remaining life (scaled to years left at runtime). */
  smallBudget: number;
  /** Big decisions across the whole remaining life (the first one is always "today"). */
  bigBudget: number;
  /** Target playback seconds per year, excluding time spent on decisions. */
  secondsPerYear: number;
  /** Seconds a small decision waits before it "slides" (null = waits forever). */
  smallTimeoutSec: number | null;
  /** Show the "meanwhile in your other lives" interlude every N years (in addition to after each big decision). */
  interludeEveryYears: number | null;
}

// Small budgets amended Sat Nov 7 (D-081 note): ~1 small decision a year at 1x, one every ~1.5
// years at 2x, one every ~3 years at 4x (was 200/100/50: 2-4 a year kept 2x slowed nearly always).
export const SPEED_CONFIG: Record<SpeedMode, SpeedConfig> = {
  "1x": { smallBudget: 45, bigBudget: 20, secondsPerYear: 6, smallTimeoutSec: null, interludeEveryYears: 10 },
  "2x": { smallBudget: 30, bigBudget: 10, secondsPerYear: 4, smallTimeoutSec: 12, interludeEveryYears: 10 },
  "4x": { smallBudget: 15, bigBudget: 5, secondsPerYear: 2, smallTimeoutSec: 10, interludeEveryYears: null },
  auto: { smallBudget: 0, bigBudget: 5, secondsPerYear: 1.5, smallTimeoutSec: null, interludeEveryYears: null },
};

// ---------------------------------------------------------------------------------------------
// Start (SPEC §2 "Start")
// ---------------------------------------------------------------------------------------------
/** User-chosen look for the portrait / 3D self. Never inferred from a photo (D-011). All optional. */
export const Appearance = z.object({
  hairStyle: z.enum(["short", "medium", "long", "curly", "coily", "shaved", "bun"]).nullable(),
  hairColor: z.enum(["black", "dark_brown", "brown", "auburn", "blonde", "red", "gray", "dyed"]).nullable(),
  skinTone: z.enum(["tone1", "tone2", "tone3", "tone4", "tone5", "tone6"]).nullable().describe("User-picked swatch, 1 lightest .. 6 deepest"),
  glasses: z.boolean().nullable(),
  facialHair: z.boolean().nullable(),
});
export type Appearance = z.infer<typeof Appearance>;

export const StartInput = z.object({
  firstName: z.string().min(1).max(40),
  age: int().min(18).max(100),
  city: z.string().max(80),
  region: z.string().max(80).nullable(),
  country: z.string().length(2).describe("ISO alpha-2"),
  line: z.string().max(2000).describe("'What's on your mind lately?' typed or transcribed"),
  via: z.enum(["text", "voice"]),
  speed: SpeedMode,
  appearance: Appearance.nullable(),
  hasSelfie: z.boolean(),
});
export type StartInput = z.infer<typeof StartInput>;

// ---------------------------------------------------------------------------------------------
// Decisions (SPEC §3)
// ---------------------------------------------------------------------------------------------
export const DecisionKind = z.enum(["small", "big"]);
export type DecisionKind = z.infer<typeof DecisionKind>;

export const DecisionOption = z.object({
  id: z.string().describe('"a" | "b" | "c" | "d"'),
  label: z.string().describe("<= 10 words, first person, a real choice"),
  hint: z.string().nullable().describe("<= 12 words: what it trades off. null if obvious"),
  branchTitle: z.string().nullable().describe("Big decisions only: the fork's name, 2-4 words, e.g. 'Take Singapore'"),
});
export type DecisionOption = z.infer<typeof DecisionOption>;

export const DecisionStatus = z.enum(["pending", "answered", "slid"]);

export const Decision = z.object({
  id: z.string().describe('"d-<age>-<n>"'),
  kind: DecisionKind,
  year: int(),
  age: int(),
  domains: z.array(DomainKey).max(3),
  prompt: z.string().describe("The question, set in the moment, <= 30 words"),
  whyAsking: z.string().describe("One line, <= 20 words; cites what the user said when possible"),
  whyQuoteId: z.string().nullable(),
  options: z.array(DecisionOption).length(4),
  placeholder: z.string().describe("Say-more box placeholder, e.g. 'Or tell me what you'd really do…'"),
  status: DecisionStatus,
});
export type Decision = z.infer<typeof Decision>;

export const DecisionAnswer = z.object({
  decisionId: z.string(),
  optionId: z.string().nullable(),
  text: z.string().max(4000).nullable(),
  via: z.enum(["text", "voice", "tap"]),
  quoteId: z.string().nullable().describe("Set by the engine when text becomes a quote"),
  answeredAt: z.string(),
});
export type DecisionAnswer = z.infer<typeof DecisionAnswer>;

// ---------------------------------------------------------------------------------------------
// Live life settings (SPEC §5)
// ---------------------------------------------------------------------------------------------
export const SettingType = z.enum(["select", "slider", "chips", "toggle"]);

export const SettingOption = z.object({ value: z.string(), label: z.string() });

export const LiveSetting = z.object({
  id: z.string(),
  type: SettingType,
  label: z.string().describe("<= 6 words, e.g. 'Work-life balance'"),
  hint: z.string().describe("<= 14 words: what changing it does"),
  options: z.array(SettingOption).describe("select/chips: 2-6 options; slider/toggle: []"),
  multi: z.boolean().describe("chips only"),
  leftLabel: z.string().nullable().describe("slider only, e.g. 'All work'"),
  rightLabel: z.string().nullable().describe("slider only, e.g. 'All life'"),
  /** Encoded as string for Gemini: select/chips single = value; chips multi = comma list; slider = "0".."100"; toggle = "true"/"false". */
  value: z.string(),
  sourceQuoteIds: z.array(z.string()),
});
export type LiveSetting = z.infer<typeof LiveSetting>;

export const SettingNudge = z.object({
  settingId: z.string(),
  from: z.string(),
  to: z.string(),
  year: int(),
  age: int(),
});
export type SettingNudge = z.infer<typeof SettingNudge>;

// ---------------------------------------------------------------------------------------------
// 3D scene (SPEC §7) — the world renders exactly this; the engine fills it for every year.
// ---------------------------------------------------------------------------------------------
export const SETTINGS_PLACE = ["city_dense", "city_midrise", "suburb", "small_town", "rural", "coastal", "campus"] as const;
export const FLAVORS = ["us_south", "us_northeast", "us_west", "us_midwest", "europe_south", "europe_north", "east_asia", "southeast_asia", "south_asia", "latam", "middle_east", "africa", "oceania"] as const;
export const HOMES = ["dorm", "shared_house", "parents_home", "apartment_small", "apartment", "loft_studio", "townhouse", "house", "house_large"] as const;
export const ACTIVITIES = ["office_work", "remote_work", "studio_creating", "studying", "caregiving", "family_time", "traveling", "celebrating", "resting", "moving", "commuting", "exercising", "socializing", "job_hunting"] as const;
export const ROLES = ["self", "partner", "child", "parent", "friend", "colleague", "pet"] as const;
export const AGE_BANDS = ["baby", "child", "teen", "young_adult", "adult", "middle", "senior"] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export const TIMES = ["dawn", "day", "golden", "night"] as const;
export const WEATHERS = ["clear", "cloudy", "rain", "snow", "fog"] as const;
export const MOODS = ["bright", "calm", "tense", "heavy", "joyful"] as const;
export const MOMENTS = ["graduation", "new_job", "promotion", "layoff", "wedding", "new_baby", "moving_in", "house_keys", "first_show", "launch", "travel_abroad", "breakup", "reunion", "caregiving_start", "retirement", "award"] as const;

export const ScenePerson = z.object({
  role: z.enum(ROLES),
  ageBand: z.enum(AGE_BANDS),
});

export const SceneSpec = z.object({
  setting: z.enum(SETTINGS_PLACE),
  flavor: z.enum(FLAVORS).describe("Architecture/vegetation flavor of the place"),
  placeLabel: z.string().describe('"Lisbon, Portugal"'),
  home: z.enum(HOMES),
  activity: z.enum(ACTIVITIES),
  people: z.array(ScenePerson).max(6).describe("Always includes self"),
  season: z.enum(SEASONS),
  timeOfDay: z.enum(TIMES),
  weather: z.enum(WEATHERS),
  mood: z.enum(MOODS),
  moment: z.enum(MOMENTS).nullable().describe("A key event cinematic this year, or null"),
  caption: z.string().describe("<= 8 words, shown small over the world"),
});
export type SceneSpec = z.infer<typeof SceneSpec>;

// ---------------------------------------------------------------------------------------------
// Years, log, branches (SPEC §4, §7, §8)
// ---------------------------------------------------------------------------------------------
/** A simulated year of the chosen life (or a branch). Extends v1 Year with the scene. */
export const SimYear = Year.extend({
  scene: SceneSpec,
  decisionIds: z.array(z.string()).describe("Decisions scheduled in this year (engine-owned)"),
});
export type SimYear = z.infer<typeof SimYear>;

export const LogKind = z.enum(["year", "event", "decision", "nudge", "fork", "interlude", "slid"]);

export const LogLine = z.object({
  id: z.string(),
  year: int(),
  age: int(),
  kind: LogKind,
  text: z.string().describe("<= 24 words"),
  domain: DomainKey.nullable(),
  tone: Tone.nullable(),
  why: Cause.nullable(),
  baseRate: BaseRateRef.nullable(),
  refId: z.string().nullable().describe("eventId / decisionId / branchId"),
});
export type LogLine = z.infer<typeof LogLine>;

export const BranchStatus = z.enum(["active", "retired"]);

export const Branch = z.object({
  id: z.string(),
  forkDecisionId: z.string(),
  optionId: z.string(),
  title: z.string().describe("The fork's branchTitle, e.g. 'Take Singapore'"),
  forkYear: int(),
  forkAge: int(),
  status: BranchStatus,
  /** Coarse years (5-year steps) unless refined by a peek. Sorted by year. */
  years: z.array(SimYear),
  verdictAtEnd: z.string().nullable(),
  divergence: z.number().describe("0..1 distance from the chosen life; used to keep the 3 most different"),
});
export type Branch = z.infer<typeof Branch>;

export const PortraitAgeBand = z.enum(["now", "35", "50", "70"]);
export const Portrait = z.object({
  band: PortraitAgeBand,
  url: z.string().describe("Same-origin URL served by the Worker from R2"),
  forAge: int(),
});
export type Portrait = z.infer<typeof Portrait>;

// ---------------------------------------------------------------------------------------------
// Session state (the Durable Object's state, synced to the client) — SPEC §8
// ---------------------------------------------------------------------------------------------
export const Phase = z.enum(["start", "playing", "deciding", "interlude", "ended"]);
export type Phase = z.infer<typeof Phase>;

export const Playhead = z.object({ year: int(), age: int(), paused: z.boolean() });

export const SessionState = z.object({
  sessionId: z.string(),
  phase: Phase,
  speed: SpeedMode,
  profile: Profile.nullable(),
  appearance: Appearance.nullable(),
  portraits: z.array(Portrait),
  settings: z.array(LiveSetting),
  nudges: z.array(SettingNudge),
  decisions: z.array(Decision),
  answers: z.array(DecisionAnswer),
  /** The chosen life: played years + buffered future (years > playhead are provisional). */
  years: z.array(SimYear),
  playhead: Playhead,
  branches: z.array(Branch),
  log: z.array(LogLine),
  /** Current domain states mirror years[playhead]; kept for quick UI reads. */
  status: DomainStates.nullable(),
  budgets: z.object({ smallLeft: int(), bigLeft: int() }),
  endAge: int(),
  verdictAtEnd: z.string().nullable(),
  updatedAt: z.string(),
});
export type SessionState = z.infer<typeof SessionState>;

/** Client → session agent calls (Agents SDK @callable methods or RPC). Names are the contract. */
export interface SessionCalls {
  start(input: StartInput): Promise<void>;
  answer(answer: Omit<DecisionAnswer, "quoteId" | "answeredAt">): Promise<void>;
  nudge(settingId: string, to: string): Promise<void>;
  setSpeed(speed: SpeedMode): Promise<void>;
  /** Client reports the playhead as playback advances; engine keeps the buffer ahead. */
  tick(year: number): Promise<void>;
  pause(paused: boolean): Promise<void>;
  peekBranch(branchId: string): Promise<Branch>;
  addDocument(kind: "cv" | "linkedin" | "ai_export", text: string): Promise<void>;
  /** Free chat with the interviewer or with a future self (life = "chosen" | branchId). */
  sayTo(life: string, age: number, text: string): Promise<void>;
}
