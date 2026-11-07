/**
 * Money lanes: code owns how far a life's money moves from the typical path (research/03 §3.2).
 * Every life used to get the same anchors ("median net worth ~$410k at 70"), so the four lives
 * ended within ~10% of each other whatever they chose (a full-time painter and a bank director
 * both at ~$450k). A fork's choice now sets a lane with an income and a wealth multiplier on the
 * anchors, from the words of the option (and their own words, for the life they chose).
 *
 * Multipliers are rough US patterns, not predictions: artists' median earnings sit well under the
 * all-worker median and are uneven; managers and movers to high-pay hubs earn ~1.5-2x; a high
 * savings rate compounds to ~1.5x the median net worth; most new businesses close within ten
 * years (BLS BED), so code rolls the outcome once per life: about 1 in 3 works.
 */
import type { Decision, DecisionAnswer } from "../../shared/sim";
import { rng } from "./util";

export type LaneKey = "steady" | "climb" | "careful" | "creative" | "venture_hit" | "venture_miss" | "care" | "drift" | "public";

interface LaneDef {
  income: number;
  wealth: number;
  note: string;
}

export const LANES: Record<LaneKey, LaneDef> = {
  steady: { income: 1, wealth: 1, note: "the typical path for someone like them" },
  climb: { income: 1.7, wealth: 2.1, note: "a climbing career (promotions, a bigger role or a high-pay city): income well above typical, more saved and invested" },
  careful: { income: 1, wealth: 1.5, note: "a careful life: typical pay, a high savings rate, debts paid early, no big bets; wealth builds steadily" },
  creative: { income: 0.55, wealth: 0.35, note: "a creative living: thin, uneven income for years (commissions, teaching, part-time work); little saved" },
  venture_hit: { income: 2.2, wealth: 3.2, note: "their own business, and it worked (about 1 in 3 do): lean early years, then real equity" },
  venture_miss: { income: 0.75, wealth: 0.5, note: "their own business that never really took off (most don't): lean years, savings spent, a job again later" },
  care: { income: 0.7, wealth: 0.65, note: "family first: fewer hours or part-time work around caregiving or kids; less saved" },
  drift: { income: 0.6, wealth: 0.45, note: "travel and a looser life: gaps between jobs, little saved" },
  public: { income: 0.85, wealth: 0.9, note: "public-service or nonprofit pay: modest and steady, often a pension" },
};

const RX = {
  // clauses that don't change how they earn ("paint on weekends")
  hobby: /[^,.;]*\b(on the side|side project|on weekends|weekends only|in the evenings|at night|as a hobby|for fun)\b[^,.;]*/gi,
  // what they turn down doesn't count ("turn down Singapore, paint full-time")
  declined: /\b(turn(?:ing)? down|declin(?:e|ing)|say(?:ing)? no to|pass(?:ing)? on|instead of|rather than|not tak(?:e|ing)|stay(?:ing)? instead of)\b[^,.;]*/gi,
  venture: /\b(start-?up|co-?found|found(?:ing)? (?:a|my|the|our)|launch(?:ing)? (?:a|my|the|our) (?:own )?(?:company|business|app|brand|shop|agency|firm|studio)|(?:my|our|their) own (?:firm|company|practice|business|shop|agency|label)|open(?:ing)? (?:a|my|our) (?:shop|bakery|caf[eé]|restaurant|bar|clinic|practice|store|gym)|go(?:ing)? independent|build (?:a|my) (?:company|business))/i,
  creative: /\b(paint|art\b|arts\b|artist|studio|gallery|music|musician|band\b|novel|writer|writing|poet|film|actor|acting|ceramic|pottery|craft|photograph|danc|theat|residency|sculpt|illustrat|furniture|woodwork|comedy)/i,
  drift: /\b(travel|backpack|wander|road trip|van life|sail|boat|year off|gap year|sabbatical|nomad)/i,
  care: /\b(care for|caregiv|caring for|move (?:back )?home|closer to (?:mom|dad|my (?:mom|dad|parents|family)|family|home)|stay home|stay-at-home|part[- ]time|step back|fewer hours|slow down|downshift|cut back)/i,
  public: /\b(teach|teacher|nonprofit|non-profit|public service|social work|government job|civil service|ngo\b)/i,
  climb: /\b(promot|vp\b|vice president|director|manag|executive|lead (?:the|a)\b|partner track|mba\b|law school|med school|consult|transfer|relocat|singapore|london|new york|zurich|silicon valley|take the (?:job|offer|role|promotion|transfer)|accept the (?:job|offer|role)|bigger role|raise\b|senior|climb|career first|big tech|fintech|investment bank|the offer|advance)/i,
  careful: /\b(save|saving|savings|safe\b|safety|security|secure|stable|stability|pension|pay (?:off|down)|debt|frugal|budget|keep (?:the|my) (?:job|role)|stay put|careful|emergency fund|index fund|invest steadily|play it safe)/i,
};

/** The lane a choice points to, from its words (null = it doesn't change how they earn). */
export function laneOf(text: string, seed: string): LaneKey | null {
  const t = text.replace(RX.hobby, " ").replace(RX.declined, " ");
  if (RX.venture.test(t)) return rng(`venture:${seed}`)() < 0.33 ? "venture_hit" : "venture_miss";
  if (RX.creative.test(t)) return "creative";
  if (RX.drift.test(t)) return "drift";
  if (RX.care.test(t)) return "care";
  if (RX.public.test(t)) return "public";
  if (RX.climb.test(t)) return "climb";
  if (RX.careful.test(t)) return "careful";
  return null;
}

/** A life's lane over time: the lane in force from `since` (the year of the choice). */
export interface MoneyPath {
  lane: LaneKey;
  since: number;
  /** "careful" on top of an income lane: saves more of what it earns. */
  saver: boolean;
  /** Per-life luck on the anchors (seeded, ~0.8-1.25): two lives in one lane don't end on one number. */
  luck?: number;
}

const luckOf = (seed: string) => 0.8 + 0.45 * rng(`luck:${seed}`)();

// The hint is left out: it names what the choice costs ("less time to paint"), not what it is.
const optionText = (d: Decision, optionId: string | null, typed?: string | null) => {
  const o = d.options.find((x) => x.id === optionId);
  return [o?.branchTitle, o?.label, typed].filter(Boolean).join(". ");
};

function apply(path: MoneyPath, lane: LaneKey | null, year: number): MoneyPath {
  if (!lane) return path;
  if (lane === "careful") return path.lane === "steady" ? { lane: "careful", since: year, saver: false } : { ...path, saver: true };
  if (lane === path.lane) return path;
  return { lane, since: year, saver: path.saver };
}

/** The chosen life: every answered fork, in order (later income lanes replace earlier ones). */
export function chosenPath(decisions: Decision[], answers: DecisionAnswer[], seed: string, beforeYear = Infinity): MoneyPath {
  let path: MoneyPath = { lane: "steady", since: -Infinity, saver: false };
  for (const d of decisions) {
    if (d.kind !== "big" || d.status !== "answered" || d.year >= beforeYear) continue;
    const a = answers.find((x) => x.decisionId === d.id);
    if (!a) continue;
    path = apply(path, laneOf(optionText(d, a.optionId, a.text), `${seed}:${d.id}:${a.optionId}`), d.year);
  }
  return { ...path, luck: luckOf(`${seed}:you`) };
}

/** A branch: the chosen life's path up to its fork, then its own option. */
export function branchPath(decisions: Decision[], answers: DecisionAnswer[], seed: string, forkDecisionId: string, optionId: string): MoneyPath {
  const d = decisions.find((x) => x.id === forkDecisionId);
  if (!d) return { lane: "steady", since: -Infinity, saver: false };
  const before = chosenPath(decisions, answers, seed, d.year);
  return { ...apply(before, laneOf(optionText(d, optionId), `${seed}:${d.id}:${optionId}`), d.year), luck: luckOf(`${seed}:${forkDecisionId}:${optionId}`) };
}

/** Multipliers on the typical anchors in `year`: income moves within ~2 years, wealth over ~12. */
export function laneFactors(path: MoneyPath | undefined, year: number): { income: number; wealth: number } {
  if (!path) return { income: 1, wealth: 1 };
  // luck grows in with time since the life's own choices (none before its first fork)
  const t = Number.isFinite(path.since) ? Math.min(1, Math.max(0, (year - path.since) / 15)) : 0;
  const luck = 1 + ((path.luck ?? 1) - 1) * t;
  if (path.lane === "steady" || year < path.since) return { income: 1, wealth: (path.saver && year >= path.since ? 1.3 : 1) * luck };
  const L = LANES[path.lane];
  const k = Math.min(1, (year - path.since + 1) / 2);
  const w = Math.min(1, (year - path.since + 1) / 12);
  const saver = path.saver ? 1.3 : 1;
  return { income: 1 + (L.income - 1) * k, wealth: (1 + (L.wealth - 1) * w) * saver * luck };
}

export function laneLine(path: MoneyPath | undefined): string {
  if (!path || path.lane === "steady") return path?.saver ? "This life saves hard: about 1.3x the typical net worth over time." : "";
  return `This life's money lane since ${path.since}: ${LANES[path.lane].note}.${path.saver ? " It also saves hard." : ""} The anchors below already include it: stay near them (a lucky or unlucky year is fine, with an event).`;
}
