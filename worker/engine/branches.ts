/**
 * The lives you didn't choose (SPEC §4, D-083): spawn at a fork, simulate coarsely (5-year
 * snapshots, cheap model), refine on peek, keep the 3 most different, and cut to them in the
 * "Meanwhile, in your other lives..." interlude.
 */
import type { InterludeCut } from "../../shared/engine";
import { DOMAIN_KEYS } from "../../shared/domains";
import type { Branch, Decision, SessionState, SimYear } from "../../shared/sim";
import { decisionsBlock, yearLine } from "./context";
import type { Caller } from "./models";
import { INTERLUDE_SYSTEM, interludePrompt } from "./prompts/extras";
import { InterludeLLM } from "./schemas";
import { clamp, norm, truncateWords } from "./util";
import { writeYears, type WriterEnv } from "./years";

// ---------------------------------------------------------------------------------------------
// Divergence: state distance + path difference (research/03 §3.1 "divergence guarantee")
// ---------------------------------------------------------------------------------------------

function factsOf(y: SimYear) {
  const city = norm(y.place.split(",")[0] ?? y.place);
  const nw = y.money.netWorth;
  return {
    city,
    partner: y.scene.people.some((p) => p.role === "partner"),
    kids: y.scene.people.filter((p) => p.role === "child").length,
    owner: ["house", "house_large", "townhouse"].includes(y.scene.home),
    wealth: nw < 0 ? 0 : nw < 50_000 ? 1 : nw < 250_000 ? 2 : nw < 1_000_000 ? 3 : 4,
    activity: y.scene.activity,
  };
}

export function yearDistance(a: SimYear, b: SimYear): number {
  const sd = DOMAIN_KEYS.reduce((s, d) => s + Math.abs(a.states[d] - b.states[d]), 0) / (DOMAIN_KEYS.length * 100);
  const fa = factsOf(a);
  const fb = factsOf(b);
  const diffs = [fa.city !== fb.city, fa.partner !== fb.partner, fa.kids !== fb.kids, fa.owner !== fb.owner, fa.wealth !== fb.wealth, fa.activity !== fb.activity];
  const fd = diffs.filter(Boolean).length / diffs.length;
  return clamp(0.5 * clamp(sd * 3, 0, 1) + 0.5 * fd, 0, 1);
}

/** Average distance over overlapping years; if none overlap, latest vs latest. */
export function lifeDistance(a: SimYear[], b: SimYear[]): number {
  if (!a.length || !b.length) return 0.5;
  const byYear = new Map(b.map((y) => [y.year, y]));
  const pairs = a.filter((y) => byYear.has(y.year)).map((y) => [y, byYear.get(y.year)!] as const);
  if (pairs.length) return pairs.reduce((s, [x, y]) => s + yearDistance(x, y), 0) / pairs.length;
  return yearDistance(a[a.length - 1]!, b[b.length - 1]!);
}

/** Keep the k most different lives: far from the chosen life, and from each other (greedy max-min). */
export function selectDiverse(branches: Branch[], chosen: SimYear[], k = 3): { keep: Branch[]; retire: Branch[] } {
  const scored = branches.map((b) => ({ b, d: lifeDistance(b.years, chosen) }));
  const keep: { b: Branch; d: number }[] = [];
  const pool = scored.slice();
  while (keep.length < k && pool.length) {
    let bestI = 0;
    let bestV = -Infinity;
    pool.forEach((c, i) => {
      const sep = keep.length ? Math.min(...keep.map((x) => lifeDistance(c.b.years, x.b.years))) : 1;
      const newFork = keep.length && !keep.some((x) => x.b.forkDecisionId === c.b.forkDecisionId) ? 0.1 : 0;
      const v = 0.6 * c.d + 0.4 * sep + newFork;
      if (v > bestV) (bestV = v), (bestI = i);
    });
    keep.push(pool.splice(bestI, 1)[0]!);
  }
  return {
    keep: keep.map(({ b, d }) => ({ ...b, status: "active" as const, divergence: Math.round(d * 100) / 100 })),
    retire: pool.map(({ b, d }) => ({ ...b, status: "retired" as const, divergence: Math.round(d * 100) / 100 })),
  };
}

// ---------------------------------------------------------------------------------------------
// Stepping a branch
// ---------------------------------------------------------------------------------------------

export function branchLabel(state: SessionState, decision: Decision | undefined, branch: Branch): string {
  const opt = decision?.options.find((o) => o.id === branch.optionId);
  const chosenAns = decision ? state.answers.find((a) => a.decisionId === decision.id) : undefined;
  const chosen = decision?.options.find((o) => o.id === chosenAns?.optionId);
  return `A life they didn't choose: "${branch.title}". At ${branch.forkAge} (${branch.forkYear}), facing "${decision?.prompt ?? "a big decision"}", this life chose "${opt?.label ?? branch.title}"${opt?.hint ? ` (${opt.hint})` : ""}${chosen ? ` instead of "${chosen.label}"` : ""}. From here it follows its own logic: same person, same people, same world, different choices. It does not take the decisions of their chosen life after ${branch.forkYear}; it makes its own, true to this fork.`;
}

export interface BranchEnv {
  writer: WriterEnv;
  call: Caller;
}

/** Write specific years for a branch (coarse snapshots or yearly) and merge them in. */
export async function stepBranchTo(env: BranchEnv, state: SessionState, branch: Branch, years: number[], fine: boolean): Promise<Branch> {
  if (!years.length) return branch;
  const decision = state.decisions.find((d) => d.id === branch.forkDecisionId);
  const shared = state.years.filter((y) => y.year < branch.forkYear);
  const own = fine ? [] : branch.years.filter((y) => y.year < years[0]!);
  const outline = fine && branch.years.length ? `Stay consistent with this outline of the branch (coarse snapshots written earlier):\n${branch.years.map(yearLine).join("\n")}` : "";
  const first = !own.length && years[0] === branch.forkYear;
  const mustShow = [
    first
      ? `${branch.forkYear}: show this choice being made and its first consequence, as a turning point. Cite the quote that makes this path plausible for them${decision?.whyQuoteId ? ` (e.g. ${decision.whyQuoteId})` : ""}.`
      : "",
    outline,
  ]
    .filter(Boolean)
    .join("\n");
  // The branch knows the person as they were at the fork: answers to the chosen life's later
  // decisions describe events this life never had, so they are left out (they leaked chosen-life
  // plot into branches and cut divergence in the first eval run).
  const laterDecisionIds = new Set(state.decisions.filter((d) => d.year > branch.forkYear).map((d) => d.id));
  const profile = env.writer.profile;
  const branchProfile = { ...profile, quotes: profile.quotes.filter((q) => !q.questionId || !laterDecisionIds.has(q.questionId)) };
  const known = new Set(branchProfile.quotes.map((q) => q.id));
  const focus = [decision?.whyQuoteId, ...profile.seeds.leap.quoteIds, ...profile.seeds.unjudged.quoteIds].filter(
    (x): x is string => Boolean(x) && known.has(x!),
  );
  const written = await writeYears(
    { ...env.writer, profile: branchProfile },
    {
      idPrefix: branch.id,
      lifeLabel: branchLabel(state, decision, branch),
      past: [...shared, ...own],
      decisions: `${decisionsBlock(state, branch.forkYear - 1)}\n${branch.forkYear} (${branch.forkAge}) BIG (the fork): this life chose "${branch.title}".`,
      mustShow,
      focusQuoteIds: [...new Set(focus)].slice(0, 4),
      settings: "(hidden branch: no live settings)",
      coarse: !fine,
      tier: fine ? "heavy" : "branch",
      decisionIdsFor: (y) => (y === branch.forkYear ? [branch.forkDecisionId] : []),
    },
    years,
  );
  const keepBefore = branch.years.filter((y) => y.year < years[0]!);
  const keepAfter = fine ? [] : branch.years.filter((y) => y.year > years[years.length - 1]!);
  const merged = [...keepBefore.filter((y) => !fine || y.year < branch.forkYear), ...written, ...keepAfter].sort((a, b) => a.year - b.year);
  return { ...branch, years: merged };
}

/** Coarse snapshot years: the fork year, then every 5 years, ending on the end year when reached. */
export function coarseYears(branch: Branch, untilYear: number, endYear: number): number[] {
  const last = branch.years.length ? branch.years[branch.years.length - 1]!.year : null;
  const out: number[] = [];
  let y = last === null ? branch.forkYear : last + 5;
  const until = Math.min(untilYear, endYear);
  for (; y <= until; y += 5) out.push(y);
  const tail = out.length ? out[out.length - 1]! : last ?? branch.forkYear - 1;
  if (untilYear >= endYear && tail < endYear) out.push(endYear);
  return out.slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Interlude captions
// ---------------------------------------------------------------------------------------------

/** The snapshot each branch shows at `year` (its latest at or before it). */
function snapshotsAt(branches: Branch[], year: number): { b: Branch; snap: SimYear }[] {
  return branches
    .map((b) => {
      const snap = b.years.filter((y) => y.year <= year).at(-1) ?? b.years[0];
      return snap ? { b, snap } : null;
    })
    .filter((x): x is { b: Branch; snap: SimYear } => Boolean(x));
}

/** One fast call: a caption per branch at `year` ("Meanwhile, in your other lives..."). */
export async function captionsFor(env: BranchEnv, state: SessionState, branches: Branch[], year: number): Promise<Map<string, string>> {
  const profile = state.profile!;
  const age = year - profile.birthYear;
  const items = snapshotsAt(branches, year);
  if (!items.length) return new Map();
  try {
    const r = await env.call.json({
      tier: "fast",
      purpose: "interlude",
      system: INTERLUDE_SYSTEM,
      prompt: interludePrompt(
        items.map(({ b, snap }) => ({
          branchId: b.id,
          title: b.title,
          forkLine: `forked at ${b.forkAge}`,
          snapshot: `${yearLine(snap)} | people now: ${snap.scene.people.filter((p) => p.role !== "self").map((p) => `${p.role} (${p.ageBand.replace("_", " ")})`).join(", ") || "none"}${snap.year < year ? ` (snapshot from ${snap.year}; now it's ${year}: everyone is ${year - snap.year} years older)` : ""}`,
        })),
        age,
      ),
      schema: InterludeLLM,
      maxOutputTokens: Math.max(800, 220 * items.length),
      hedgeMs: 5000,
    });
    if (r.data) return new Map(r.data.cuts.map((c) => [c.branchId, truncateWords(c.caption, 16)]));
  } catch {
    /* fall back to summaries */
  }
  return new Map();
}

/**
 * The interlude cuts at the playhead. `known` captions (written speculatively while the fork's
 * card was open) skip the caption call when they cover every branch.
 */
export async function interludeCuts(env: BranchEnv, state: SessionState, steppedBranches: Branch[], known?: Record<string, string>): Promise<InterludeCut[]> {
  const profile = state.profile!;
  const year = state.playhead.year;
  const age = year - profile.birthYear;
  const items = snapshotsAt(steppedBranches, year);
  if (!items.length) return [];
  const have = known && items.every(({ b }) => known[b.id]);
  const captions = have ? new Map(Object.entries(known!)) : await captionsFor(env, state, steppedBranches, year);
  return items.map(({ b, snap }) => ({
    branchId: b.id,
    title: b.title,
    age,
    scene: snap.scene,
    caption: captions.get(b.id) ?? truncateWords(snap.summary, 14),
  }));
}
