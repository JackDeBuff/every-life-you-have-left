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

// ---------------------------------------------------------------------------------------------
// Money continuity (owner's playtest, Sat Nov 7). The profile said ~$85k saved; year 1's net worth
// came out $17k (the writer copied the age-median anchor), and income then swung 35k -> 30k -> 26k
// -> 8k -> 18k -> 24k -> 11k with nothing in the years to explain it. Code owns the money's shape:
//   - the first year starts from what they have: savings minus (non-mortgage) debt
//   - net worth moves by what the year earns and saves, plus or minus returns; a money event
//     (a windfall, a loss, a home, a divorce, a business) widens the band
//   - an income drop of more than ~10% needs a stated cause in that year (a layoff, a sabbatical,
//     study, part-time work, a business, caregiving, retirement...); otherwise it is a dip, not a cliff
//   - an unexplained jump is held to a raise-sized step
// Applied after the model and the validator (years.ts), to every year the writer emits.
// ---------------------------------------------------------------------------------------------

export interface MoneyYear {
  year: number;
  age: number;
  summary: string;
  money: { income: number; netWorth: number };
  events: { category: string; title: string; narrative: string }[];
}

/** What they have now: savings minus debt (a mortgage is offset by the home it bought). null = unknown. */
export function startNetWorth(m: { savingsUsd: number | null; debtUsd: number | null; debtKind: string | null }): number | null {
  if (m.savingsUsd === null && m.debtUsd === null) return null;
  const debt = m.debtKind && /mortgage/i.test(m.debtKind) ? 0 : (m.debtUsd ?? 0);
  return (m.savingsUsd ?? 0) - debt;
}

const DROP_CAUSE =
  /\b(laid off|layoffs?|lay-?off|lost (?:the|my|your|his|her|their|a) (?:job|role|contract|position)|los(?:e|es|ing) (?:the|your|their) (?:job|role)|fired|let go|redundan\w*|out of work|unemploy\w*|between jobs|job (?:hunt|search)\w*|sabbatical|career break|gap year|year off|time off|leave of absence|(?:parental|maternity|paternity|medical|unpaid) leave|stud(?:y|ies|ying)|back to school|grad(?:uate)? school|enrol\w*|master'?s|mba|phd|degree|bootcamp|retrain\w*|apprentice\w*|part[- ]time|fewer hours|cut(?:s|ting)? (?:back|hours|your hours)|reduced hours|four-day|step(?:s|ped)? back|downshift\w*|quit(?:s|ting)?|resign\w*|walk(?:s|ed)? away|start(?:s|ed|ing)? (?:a|an|your|their|my) (?:own )?(?:business|company|startup|studio|practice|shop)|startup|launch(?:es|ed|ing)? (?:a|your|their)|freelanc\w*|self-employ\w*|commissions?|gig work|pay cut|salary cut|cut (?:in|to) (?:pay|salary)|demot\w*|contract (?:ends|ended|runs out)|furlough\w*|caregiv\w*|caring for|stay(?:s|ed)? home|stay-at-home|burn ?out|burned out|burnt out|retir\w*|travel(?:s|ing|ling)?|backpack\w*|moved? (?:to|abroad|back)|relocat\w*|new country|emigrat\w*|residency|fellowship|unpaid|volunteer\w*|bankrupt\w*|business (?:fails|failed|folds|closed|struggles))\b/i;
const RISE_CAUSE =
  /\b(promot\w*|raise|new (?:job|role|position|employer)|job offer|offer|hired|bonus|commission|equity|exit|acqui\w*|sold|contract|consult\w*|senior|director|lead|manager|head of|partner|tenure|back to work|returns? to work|full[- ]time|graduat\w*|qualif\w*|licen[cs]\w*|certif\w*|business (?:takes off|grows|booms)|clients?|customers?|revenue|book deal|record deal|switch(?:es|ed)?|moved? (?:to|abroad)|relocat\w*)\b/i;
const MONEY_EVENT = /\b(windfall|inherit\w*|lottery|bonus|equity|stock|shares|crash|recession|market|debt|loan|mortgage|down payment|deposit|bought|buys|buying|house|renovat\w*|wedding|divorce\w*|settlement|medical bills?|lawsuit|sold|sale|exit|business|startup|invest\w*|savings?|tuition|fees|emergency|fraud|scam|bankrupt\w*)\b/i;
const MONEY_CATS = new Set(["money_up", "money_down", "home", "divorce", "marriage", "job_loss", "career_change", "child", "caregiving", "move"]);
const DROP_CATS = new Set(["job_loss", "burnout", "career_change", "caregiving"]);
const RISE_CATS = new Set(["career_move", "career_change", "money_up", "achievement"]);

/**
 * The year's money made continuous with `prev` (or anchored to what they have when it's the first
 * year). The span is the years since prev (5 for a coarse branch snapshot). Returns the fixed money
 * and what was changed (soft fixes, for the log).
 */
export function steadyMoney(
  y: MoneyYear,
  prev: { year: number; money: { income: number; netWorth: number } } | null,
  start: { netWorth: number | null; income: number | null },
): { income: number; netWorth: number; notes: string[] } {
  const notes: string[] = [];
  let income = Math.max(0, Math.round(y.money.income));
  let netWorth = Math.round(y.money.netWorth);
  const text = [y.summary, ...y.events.map((e) => `${e.title}. ${e.narrative}`)].join(" ");
  const cats = new Set(y.events.map((e) => e.category));
  const moneyEvent = [...cats].some((c) => MONEY_CATS.has(c)) || MONEY_EVENT.test(text);
  const round = (n: number, to = 500) => Math.round(n / to) * to;

  if (!prev) {
    // Year 1: what they have today, within a few months of saving.
    if (start.netWorth !== null) {
      const slack = Math.max(0.1 * Math.abs(start.netWorth), 0.15 * (start.income ?? income), 2000);
      if (Math.abs(netWorth - start.netWorth) > slack) {
        notes.push(`first-year net worth ${netWorth} anchored to what they have (${start.netWorth})`);
        netWorth = round(start.netWorth + Math.sign(netWorth - start.netWorth) * slack * 0.5, 1000);
      }
    }
    return { income, netWorth, notes };
  }

  const span = Math.max(1, y.year - prev.year);
  const p = prev.money;
  // --- income: a cliff needs a cause; a jump needs a reason
  const dropCause = [...cats].some((c) => DROP_CATS.has(c)) || DROP_CAUSE.test(text);
  if (p.income > 0) {
    const late = y.age >= 60; // income tapers toward and into retirement
    if (income / p.income < Math.pow(late ? 0.6 : 0.9, span) && !dropCause) {
      notes.push(`income drop ${p.income} -> ${income} with no cause in the year, held to a dip`);
      income = round(p.income * Math.pow(late ? 0.9 : 0.97, span));
    }
    // (coming back from a dip needs no new reason: the dip's cause is behind it)
    const riseCause = [...cats].some((c) => RISE_CATS.has(c)) || RISE_CAUSE.test(text) || dropCause;
    if (income > p.income * Math.pow(1.3, span) + 3000 * span && !riseCause) {
      notes.push(`income jump ${p.income} -> ${income} with no reason in the year, held to a raise`);
      income = round(p.income * Math.pow(1.08, span) + 1000 * span);
    }
  }
  // --- net worth: last year's, plus what this year saves, plus or minus returns
  const avgIncome = (income + p.income) / 2;
  const invested = Math.max(0, p.netWorth);
  const lo = moneyEvent || dropCause
    ? p.netWorth - span * (0.6 * avgIncome + 15_000) - 0.4 * invested
    : p.netWorth - span * (0.08 * avgIncome + 3000) - (1 - Math.pow(0.95, span)) * invested;
  // (windfalls stay bounded by validate.ts)
  const hi = moneyEvent ? Infinity : p.netWorth + span * (0.4 * avgIncome + 5000) + (Math.pow(1.08, span) - 1) * invested;
  if (netWorth < lo) {
    notes.push(`net worth fell ${p.netWorth} -> ${netWorth} with no money event, held to a bad year`);
    netWorth = round(lo, 1000);
  } else if (netWorth > hi) {
    notes.push(`net worth rose ${p.netWorth} -> ${netWorth} faster than saving + returns, held`);
    netWorth = round(hi, 1000);
  }
  return { income, netWorth, notes };
}

/**
 * The writer's net-worth anchor for a year, moved by what they started with: the age median (and
 * lane) plus their head start (or debt), the head start growing ~3%/yr real and a debt paid down
 * over ~10 years. Without it a 25-year-old with $85k saved was told "net worth ~$17k".
 */
export function anchorNetWorth(medianNw: number, startNw: number | null, medianNwAtStart: number, yearsIn: number): number {
  if (startNw === null) return medianNw;
  const gap = startNw - medianNwAtStart;
  const t = Math.max(0, yearsIn);
  const carried = gap >= 0 ? gap * Math.pow(1.03, t) : gap * Math.max(0, 1 - t / 10);
  return Math.round((medianNw + carried) / 1000) * 1000;
}
