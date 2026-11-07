/**
 * planSlots (PURE): where decisions fall in the remaining life (SPEC §2, D-081).
 *   - Budgets come from SPEED_CONFIG, scaled to the years left (reference span 45 = 25→70).
 *   - The first big decision is today. The rest sit at life-stage moments personalised to the
 *     profile and the life so far (partner, kids, home, career, caregiving, midlife, retirement),
 *     one per window so they are spaced; Auto = exactly 5 big, 0 small, last one >= 4 years
 *     before the end so the run stays <= 3 minutes.
 *   - Small decisions are spread over the years (a little front-loaded) and weighted toward the
 *     domains the user worries about AND the gaps in what we know (research/03 §1.4).
 * Slot reasons are machine-readable: "big:<domain>:<moment>: <why>" / "small:<domain>: <gap>".
 */
import type { DecisionSlot } from "../../shared/engine";
import { DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import type { Profile } from "../../shared/schema";
import { SPEED_CONFIG, type SessionState } from "../../shared/sim";
import { kidsQuestionOpen } from "./kids";
import { lifeFacts } from "./world";

const REFERENCE_SPAN = 45;
/** 1x: at most this many small cards planned in one year (a year plays 6-12 s). */
export const MAX_SMALL_PER_YEAR = 7;

/** 0..1: how much we already know about each domain. */
export function coverage(profile: Profile, state?: SessionState): Record<DomainKey, number> {
  const c = Object.fromEntries(DOMAIN_KEYS.map((d) => [d, 0])) as Record<DomainKey, number>;
  const has = (k: string) => profile.facts.some((f) => f.key === k);
  if (has("occupation")) c.career += 0.5;
  if (has("education")) (c.career += 0.15), (c.achievement += 0.25);
  c.wealth += profile.money.assumed ? 0.15 : 0.55;
  if (profile.constraints.some((k) => k.kind === "debt")) c.wealth += 0.2;
  const fam = profile.people.filter((p) => /mother|father|mom|dad|parent|sister|brother|sibling|grand|aunt|uncle|family/i.test(`${p.relation} ${p.label}`));
  c.family += Math.min(0.6, fam.length * 0.3) + (has("background") ? 0.25 : 0) + (profile.constraints.some((k) => k.kind === "family_obligation") ? 0.15 : 0);
  if (has("relationship")) c.relationships += 0.45;
  if (profile.people.some((p) => /partner|wife|husband|girlfriend|boyfriend|friend/i.test(p.relation))) c.relationships += 0.3;
  if (has("children")) c.children += 0.6;
  c.mentalHealth += Math.min(0.4, profile.fears.length * 0.15) + (has("health_habits") ? 0.3 : 0);
  c.happiness += Math.min(0.4, profile.values.length * 0.1) + (has("interests") ? 0.3 : 0);
  c.lifeGoals += (profile.seeds.unjudged.quoteIds.length ? 0.3 : 0) + Math.min(0.3, profile.values.length * 0.08);
  if (has("interests")) c.achievement += 0.2;
  c.risk += profile.fears.some((f) => f.kind === "boldness") ? 0.35 : 0.1;
  if (state) {
    for (const d of state.decisions) {
      if (d.status !== "answered") continue;
      for (const k of d.domains) c[k] += d.kind === "big" ? 0.25 : 0.3;
    }
  }
  for (const d of DOMAIN_KEYS) c[d] = Math.min(1, c[d]);
  return c;
}

/** How much a domain fits a life stage (small-decision weighting). */
function stageFit(d: DomainKey, age: number): number {
  switch (d) {
    case "children":
      return age < 24 ? 0.6 : age <= 45 ? 1.3 : age <= 60 ? 0.8 : 0.6;
    case "family":
      return age >= 40 && age <= 65 ? 1.3 : 1;
    case "career":
      return age < 60 ? 1.15 : age < 66 ? 0.8 : 0.4;
    case "wealth":
      return age >= 50 ? 1.25 : 1;
    case "relationships":
      return age < 40 ? 1.15 : 1;
    case "mentalHealth":
      return age >= 40 && age <= 55 ? 1.2 : 1;
    case "lifeGoals":
      return age >= 45 ? 1.2 : 1;
    default:
      return 1;
  }
}

const GAP_TEXT: Record<DomainKey, string> = {
  career: "what they'd miss or be relieved to lose about their work, and what would make them quit",
  wealth: "the 2am money thought: debts, who depends on their money, what a windfall would really go to",
  achievement: "what they're proud of that would never show up on a CV",
  family: "what their family assumed they'd become, and who would be disappointed if they changed course",
  relationships: "who they'd call at 2am, and whether there's someone (or someone hoped for)",
  children: "whether kids are in the picture: yes, no and 'honestly, I don't know' are all real",
  mentalHealth: "what's quietly draining them, and who gets to see them when things go badly",
  happiness: "when they were last truly happy, and what they were doing",
  lifeGoals: "what they'd do if nobody judged them, and what they're waiting for permission to do",
  risk: "the biggest risk they've taken, and what would have to be true before they'd take another",
};

const GENERIC_STAGE: Record<DomainKey, string> = {
  career: "a work decision: an offer, a promotion, a side project or a way out",
  wealth: "a money decision: a windfall, a big expense, or where the savings go",
  achievement: "a chance to make or finish something real, with a cost in time",
  family: "a family decision: parents, siblings, being there or not",
  relationships: "a decision about love or a close friendship",
  children: "a decision about kids: having them, raising them, or letting them go",
  mentalHealth: "something has to give: energy, rest, what they stop doing",
  happiness: "a choice about what makes their weeks good",
  lifeGoals: "the want they keep postponing comes back",
  risk: "a bet with real upside and real downside",
};

interface Moment {
  age: number;
  domain: DomainKey;
  key: string;
  why: string;
  score: number;
}

function stageMoments(profile: Profile, state: SessionState, nowAge: number, endAge: number): Moment[] {
  const w = profile.worries;
  const f = lifeFacts(profile, state.years.filter((y) => y.year <= state.playhead.year));
  const hasDegree = profile.facts.some((x) => x.key === "education" && /bachelor|degree|university|college|master|phd|mba/i.test(x.value));
  const parents = profile.people.filter((p) => /mother|father|mom|dad|parent/i.test(`${p.relation} ${p.label}`));
  const m: Moment[] = [];
  const add = (age: number, domain: DomainKey, key: string, why: string, base: number, worry: number) => {
    const a = Math.round(age);
    if (a > nowAge && a <= endAge - 3) m.push({ age: a, domain, key, why, score: base + 0.6 * worry });
  };
  // career: the next job change (tenure ~2.7 yrs at 25-34), then a mid-career pivot
  if (nowAge < 60) add(nowAge + (nowAge < 35 ? 3 : 4), "career", "career_crossroads", "a job offer or a promotion that changes the shape of work (tenure is ~2.7 years at 25-34)", 0.55, w.career);
  if (nowAge < 42) add(Math.max(nowAge + 6, 40), "career", "midcareer", "mid-career: double down, switch fields or start something", 0.45, Math.max(w.career, w.lifeGoals));
  // love
  if (!f.partnered && nowAge < 45) add(Math.max(nowAge + 2, 29), "relationships", "partner", "someone serious, around the median first-marriage age (~30)", 0.5, w.relationships);
  if (f.partnered && !f.married && nowAge < 45) add(Math.max(nowAge + 2, 30), "relationships", "commitment", "the commitment conversation with their partner", 0.55, w.relationships);
  // children
  if (f.children === 0 && nowAge < 41) add(Math.max(nowAge + 3, hasDegree ? 32 : 30), "children", "kids", "the kids question, when many of their friends start families (first birth ~27.5, later for graduates)", 0.5, w.children);
  // home and money
  if (!f.homeowner && nowAge < 50) add(Math.max(nowAge + 3, (profile.money.feel === "tight" ? 41 : 38) - (hasDegree ? 2 : 0)), "wealth", "home", "the first-home decision (typical first-time buyer is 40)", 0.45, w.wealth);
  // moving (moves cluster in the 20s and early 30s)
  if (nowAge < 34) add(nowAge + 2, "lifeGoals", "move", "a move: a new city, abroad, or back home", 0.35, w.lifeGoals);
  // parents: caregiving when they are ~75-80 (assume ~30 years older if unknown)
  if (nowAge < 62 && (parents.length || nowAge < 45)) add(Math.max(nowAge + 3, 48), "family", "caregiving", "a parent who needs more help (1 in 4 adults is a family caregiver; most at 40-65)", 0.5, w.family);
  // midlife, plateau, retirement
  if (nowAge < 45) add(47, "happiness", "midlife", "the midlife 'is this it' (life satisfaction dips around 47-48)", 0.4, Math.max(w.happiness, w.mentalHealth));
  if (nowAge < 52) add(54, "lifeGoals", "plateau", "the plateau or empty nest: what the next 15 years are for", 0.4, w.lifeGoals);
  if (endAge >= 63 && nowAge < 61) add(Math.max(nowAge + 3, 62), "career", "retirement", "retirement, often earlier than planned (typical age ~62)", 0.55, Math.max(w.wealth, w.career));
  // late life (users over 55: endAge = age + 15)
  if (nowAge >= 55) {
    add(nowAge + 3, "family", "late_family", "family in this stretch: grandchildren, siblings, an aging parent or their own kids' choices", 0.5, w.family);
    add(nowAge + 7, "lifeGoals", "postponed", "the thing they kept postponing", 0.5, w.lifeGoals);
    add(nowAge + 10, "wealth", "downsize", "the house, the money and where to spend the last stretch", 0.45, w.wealth);
  }
  return m;
}

export function planSlotsFor(state: SessionState): DecisionSlot[] {
  const profile = state.profile;
  if (!profile) return [];
  const nowYear = state.playhead?.year ?? profile.startYear;
  const nowAge = nowYear - profile.birthYear;
  const endAge = state.endAge || profile.endAge;
  const endYear = profile.birthYear + endAge;
  const yearsLeft = Math.max(0, endYear - nowYear);
  if (yearsLeft <= 0) return [];
  const cfg = SPEED_CONFIG[state.speed];
  const scale = yearsLeft / REFERENCE_SPAN;

  const bigMade = state.decisions.filter((d) => d.kind === "big").length;
  const bigHereAlready = state.decisions.some((d) => d.kind === "big" && d.year === nowYear);
  const bigTotal =
    state.speed === "auto" ? Math.max(0, cfg.bigBudget - bigMade) : Math.max(bigMade === 0 ? 1 : 0, Math.round(cfg.bigBudget * scale));
  const smallTotal = state.speed === "auto" ? 0 : Math.round(cfg.smallBudget * scale);

  const slots: DecisionSlot[] = [];
  const takenBigYears = new Set(state.decisions.filter((d) => d.kind === "big").map((d) => d.year));

  // ---- big decisions
  let remainingBig = bigTotal;
  if (remainingBig > 0 && bigMade === 0 && !bigHereAlready) {
    slots.push({ year: nowYear, age: nowAge, kind: "big", reason: `big:${topDomain(profile)}:today: the crossroads on their mind right now` });
    takenBigYears.add(nowYear);
    remainingBig--;
  }
  if (remainingBig > 0) {
    const firstAge = nowAge + 1;
    const lastAge = Math.max(firstAge, endAge - 4);
    // Auto/4x: >= 3-5 years apart so the next stretch and the next card generate while it plays.
    const fewBig = state.speed === "auto" || state.speed === "4x";
    const moments = stageMoments(profile, state, nowAge, endAge);
    const span = lastAge - firstAge + 1;
    const used = new Set<string>();
    // Spread big decisions across life areas: a domain already decided on scores lower.
    const usedDomains = new Set<string>([...state.decisions.filter((d) => d.kind === "big").flatMap((d) => d.domains), ...slots.map((s) => s.reason.split(":")[1]!)]);
    let prevAge = slots.length ? nowAge : Math.max(nowAge, ...state.decisions.filter((d) => d.kind === "big").map((d) => d.age), nowAge - 99);
    if (!fewBig) {
      // 1x/2x: evenly spaced (QA, Sat Nov 7: windowed picks clustered forks 2 years apart at 2x, and
      // with no small card in a fork's year or the year after, 23 years showed none). Each fork sits
      // at its even spot; the life-stage moment nearest to it (within ~half a spacing) names it.
      const spacing = span / remainingBig;
      const minGap = Math.max(2, Math.floor(spacing * 0.75));
      const reach = Math.max(1, spacing * 0.6);
      for (let k = 0; k < remainingBig; k++) {
        const centre = firstAge + spacing * (k + 0.5) - 0.5;
        const age = Math.max(prevAge + minGap, Math.round(centre));
        if (age > endAge - 2) break;
        const adj = (x: Moment) => x.score - (usedDomains.has(x.domain) ? 0.4 : 0) - 0.15 * Math.abs(x.age - centre);
        const near = moments.filter((x) => !used.has(x.key) && Math.abs(x.age - centre) <= reach).sort((a, b) => adj(b) - adj(a));
        const domain = topDomain(profile, k);
        const pick: Moment = near[0] ?? { age, domain, key: `stage_${k}`, why: GENERIC_STAGE[domain], score: 0 };
        used.add(pick.key);
        usedDomains.add(pick.domain);
        slots.push({ year: profile.birthYear + age, age, kind: "big", reason: `big:${pick.domain}:${pick.key}: ${pick.why}` });
        takenBigYears.add(profile.birthYear + age);
        prevAge = age;
      }
      remainingBig = 0;
    }
    const minGap = Math.max(3, Math.min(5, Math.floor((lastAge - firstAge + 1) / (remainingBig + 1))));
    for (let k = 0; k < remainingBig; k++) {
      const lo = firstAge + Math.floor((span * k) / remainingBig);
      const hi = firstAge + Math.floor((span * (k + 1)) / remainingBig) - 1;
      const adj = (x: Moment) => x.score - (usedDomains.has(x.domain) ? 0.4 : 0);
      const inWin = moments
        // a moment slightly too close to the previous decision is shifted later, not dropped
        .filter((x) => x.age >= lo - 1 && x.age <= hi + 1 && x.age - prevAge >= minGap - 2 && !takenBigYears.has(profile.birthYear + x.age))
        .sort((a, b) => adj(b) - adj(a));
      let pick: Moment | undefined = inWin.find((x) => !used.has(x.key));
      if (!pick) {
        const age = Math.min(endAge - 3, Math.max(prevAge + minGap, Math.round((lo + hi) / 2)));
        const domain = topDomain(profile, k);
        pick = { age, domain, key: `stage_${k}`, why: GENERIC_STAGE[domain], score: 0 };
      }
      used.add(pick.key);
      usedDomains.add(pick.domain);
      const age = Math.max(pick.age, prevAge + minGap);
      if (age > endAge - 2) break;
      slots.push({ year: profile.birthYear + age, age, kind: "big", reason: `big:${pick.domain}:${pick.key}: ${pick.why}` });
      takenBigYears.add(profile.birthYear + age);
      prevAge = age;
    }
  }

  // ---- small decisions
  if (smallTotal > 0) {
    const cov = coverage(profile, state);
    const weights = Object.fromEntries(DOMAIN_KEYS.map((d) => [d, (1 + 1.5 * profile.worries[d]) * (1.15 - cov[d])])) as Record<DomainKey, number>;
    const credit = Object.fromEntries(DOMAIN_KEYS.map((d) => [d, 0])) as Record<DomainKey, number>;
    // Never "today" (the first fork is today). 2x/4x: one a year at most, never in a fork's year
    // or the year right after it (its consequence plays). 1x (deep mode, the conversation): a fork
    // comes every ~2 years, so blocking its year too left half the life without a card (QA: 5
    // cards in 9 years). 1x holds 3-4 cards in every year, a fork's year included: the agent
    // serves them once the consequence has played a moment, one at a time from a written-ahead
    // queue, and the year doesn't end while one is open (src/ui/pacing.ts holdsYearEnd).
    const bigYears = new Set([...takenBigYears, ...slots.filter((x) => x.kind === "big").map((x) => x.year)]);
    const deep = state.speed === "1x";
    const blocked = (y: number) => y === nowYear || (!deep && (bigYears.has(y) || bigYears.has(y - 1)));
    let free = 0;
    for (let y = nowYear; y < endYear; y++) if (!blocked(y)) free++;
    // 2x/4x: one a year, two in a year only when the free years can't hold the budget otherwise
    // (2x: ~30 cards, ~25 free years with 10 forks).
    const need = Math.max(1, Math.ceil(smallTotal / Math.max(1, free)));
    const perYear = deep ? Math.min(MAX_SMALL_PER_YEAR, need) : Math.min(2, need);
    const used = new Map<number, number>();
    const smallYears: number[] = [];
    for (const y0 of spreadYears(nowYear, endYear, smallTotal)) {
      let y = y0;
      while (y < endYear && (blocked(y) || (used.get(y) ?? 0) >= perYear)) y++;
      if (y >= endYear) continue;
      used.set(y, (used.get(y) ?? 0) + 1);
      smallYears.push(y);
    }
    smallYears.sort((a, b) => a - b);
    let last: DomainKey | null = null;
    for (const year of smallYears) {
      const age = year - profile.birthYear;
      let best: DomainKey = "career";
      let bestV = -Infinity;
      let total = 0;
      for (const d of DOMAIN_KEYS) {
        const w = weights[d] * stageFit(d, age);
        credit[d] += w;
        total += w;
      }
      for (const d of DOMAIN_KEYS) {
        const v = credit[d] - (d === last ? total * 0.5 : 0);
        if (v > bestV) (bestV = v), (best = d);
      }
      credit[best] -= total;
      last = best;
      const worry = profile.worries[best];
      const why = `${worry >= 0.5 ? `they worry about ${best} (${worry.toFixed(1)}); ` : ""}we don't know ${GAP_TEXT[best]}`;
      slots.push({ year, age, kind: "small", reason: `small:${best}: ${why}` });
    }
    // 22-45 with no kids and never asked: the kids question is asked early (owner's playtest:
    // one tester was never asked). The third small card (the first at 2x/4x when that would be
    // past ~35), pinned as "small:children:kids" so the batch writer keeps it on children.
    if (kidsQuestionOpen(profile, state)) {
      const smalls = slots.filter((x) => x.kind === "small");
      const latest = Math.max(35, nowAge + 3);
      const pick = smalls[2] && smalls[2].age < latest ? smalls[2] : smalls[0];
      if (pick && pick.age < latest)
        pick.reason = `small:children:kids: ${worriesLine(profile.worries.children)}we don't know ${GAP_TEXT.children} (they're ${pick.age}, no kids yet; every life depends on it, and no life gets a child they never chose)`;
    }
  }
  return slots.sort((a, b) => a.year - b.year || (a.kind === "big" ? -1 : 1));
}

/** n years in [from, to), density falling gently over time (more early, when we know least). */
function spreadYears(from: number, to: number, n: number): number[] {
  const span = to - from;
  if (span <= 0 || n <= 0) return [];
  const out: number[] = [];
  // inverse CDF of density ∝ 1.3 - 0.6t on [0,1]
  const a = 1.3;
  const b = -0.6;
  const total = a + b / 2;
  for (let i = 0; i < n; i++) {
    const u = ((i + 0.5) / n) * total;
    // solve a t + b t^2/2 = u
    const t = (-a + Math.sqrt(a * a + 2 * b * u)) / b;
    out.push(from + Math.min(span - 1, Math.floor(t * span)));
  }
  return out;
}

const worriesLine = (w: number) => (w >= 0.5 ? `they worry about children (${w.toFixed(1)}); ` : "");

function topDomain(p: Profile, k = 0): DomainKey {
  const sorted = DOMAIN_KEYS.slice().sort((a, b) => p.worries[b] - p.worries[a]);
  return sorted[k % 3] ?? "career";
}

export function parseSlotReason(reason: string): { kind: "big" | "small"; domain: DomainKey; moment: string; why: string } {
  const m = reason.match(/^(big|small):([a-zA-Z]+)(?::([a-z_0-9]+))?:\s*(.*)$/);
  const domain = (m && (DOMAIN_KEYS as readonly string[]).includes(m[2]!) ? m[2] : "lifeGoals") as DomainKey;
  return { kind: (m?.[1] as "big" | "small") ?? "small", domain, moment: m?.[3] ?? "", why: m?.[4] ?? reason };
}
