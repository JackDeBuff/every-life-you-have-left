/**
 * The life writer loop shared by the chosen life (yearly, streamed) and hidden branches (coarse
 * 5-year snapshots, or yearly on peek). Per chunk: build the code-owned constraints → stream the
 * model's years → coerce + validate each finished year → one repair call on hard errors → code
 * fallback → emit. Missing years are retried once, then filled with quiet code years so the
 * contract (contiguous years) always holds.
 */
import { DOMAINS, DOMAIN_KEYS } from "../../shared/domains";
import type { Profile, WorldEvent } from "../../shared/schema";
import type { SimYear } from "../../shared/sim";
import { baseRatesBlock, lifeSoFarBlock, personBlock, quotesBlock, topWorries, worldBlock } from "./context";
import type { Caller, Tier } from "./models";
import { COARSE_ADDENDUM, REPAIR_SYSTEM, repairPrompt, YEARS_SYSTEM, yearsPrompt } from "./prompts/years";
import { OneYearLLM, YearsLLM } from "./schemas";
import { createArrayItemExtractor } from "./stream-json";
import { clicheCount, checkYear, coerceYear, compactOf, fallbackYear } from "./validate";
import { CATEGORY_RULES, ledgerFrom, moneyAnchor, recordEvent, sampleCandidates, statDisplay, worldIdFor } from "./world";
import { rng, shuffled, usd } from "./util";

export interface YearMetric {
  kind: "year";
  lifeId: string;
  year: number;
  model: string;
  schemaOk: boolean;
  hardErrors: number;
  /** First-pass hard errors (what the repair call was asked to fix). */
  errors: string[];
  repaired: boolean;
  fallback: boolean;
  softFixes: number;
  cliches: number;
  turningPoints: number;
  filler: boolean;
  /** ms since the writeYears call started, when this year was emitted. */
  atMs: number;
}

export interface WriterEnv {
  call: Caller;
  profile: Profile;
  world: WorldEvent[];
  /** Years from the profile's start to its end age (budget scale). */
  span: number;
  seed: string;
  onMetric?: (m: YearMetric) => void;
}

export interface LifeSpec {
  /** "you" for the chosen life, the branch id for a branch. */
  idPrefix: string;
  lifeLabel: string;
  /** This life's years before the first target year (shared past + own years). */
  past: SimYear[];
  decisions: string;
  mustShow: string;
  focusQuoteIds: string[];
  settings: string;
  coarse: boolean;
  tier: Tier;
  /** decisionIds per year (engine-owned). */
  decisionIdsFor: (year: number) => string[];
}

const BASE_RATES_TEXT = baseRatesBlock();

function budgetBlock(past: SimYear[], span: number, firstYear: number, world: WorldEvent[]): string {
  const l = ledgerFrom(past, world);
  const lines: string[] = [];
  for (const [cat, rule] of Object.entries(CATEGORY_RULES)) {
    const used = l.counts[cat as keyof typeof l.counts] ?? 0;
    const max = rule.max(span);
    const last = l.lastYear[cat as keyof typeof l.lastYear];
    const next = last !== undefined ? last + rule.cooldown : null;
    const cool = next !== null && next > firstYear ? `, not before ${next}` : "";
    if (used || cool || ["job_loss", "divorce", "burnout", "caregiving", "world_context"].includes(cat))
      lines.push(`${cat} ${used}/${max}${cool}`);
  }
  lines.push(`parent death from old age: ${l.parentDeaths}/1 (only if late, gently, offscreen)`);
  lines.push(`shock cap: at most 1 major setback (layoff, divorce, breakup, burnout, money loss) per 3 years`);
  return lines.join("\n");
}

function quietYears(seed: string, years: number[], busy: Set<number>): number[] {
  const free = years.filter((y) => !busy.has(y));
  const n = Math.max(years.length >= 3 ? 1 : 0, Math.round(years.length * 0.34));
  return shuffled(free, rng(`quiet:${seed}:${years[0]}`))
    .slice(0, Math.min(n, free.length))
    .sort((a, b) => a - b);
}

/** A code-made quiet year (last resort when the model returns too few years). */
function fillerYear(prev: SimYear | null, year: number, profile: Profile, decisionIds: string[]): SimYear {
  const age = year - profile.birthYear;
  const anchor = moneyAnchor(profile, age);
  const base = prev ?? null;
  const states = base
    ? { ...base.states }
    : (Object.fromEntries(DOMAIN_KEYS.map((d) => [d, 50])) as SimYear["states"]);
  return {
    year,
    age,
    place: base?.place ?? [profile.city, profile.region ?? profile.country].filter(Boolean).join(", "),
    summary: "A quieter year: work, people, the usual weeks.",
    states,
    money: {
      income: base ? Math.round(base.money.income * 1.02) : anchor.income,
      netWorth: base ? Math.round(base.money.netWorth + Math.max(0, base.money.income * 0.06)) : 0,
    },
    events: [],
    scene: base
      ? { ...base.scene, moment: null, caption: "", season: (["spring", "summer", "autumn", "winter"] as const)[year % 4]! }
      : {
          setting: "city_midrise", flavor: "us_south", placeLabel: profile.city ?? "", home: "apartment", activity: "office_work",
          people: [{ role: "self", ageBand: "adult" }], season: "autumn", timeOfDay: "day", weather: "clear", mood: "calm", moment: null, caption: "",
        },
    decisionIds,
  };
}

export async function writeYears(env: WriterEnv, spec: LifeSpec, targetYears: number[], onYear?: (y: SimYear) => void): Promise<SimYear[]> {
  const t0 = Date.now();
  const { profile } = env;
  const written: SimYear[] = [];
  const chunks: number[][] = [];
  if (spec.coarse) chunks.push(targetYears);
  else {
    let i = 0;
    let size = 4; // small first chunk: the first year arrives fast
    while (i < targetYears.length) {
      chunks.push(targetYears.slice(i, i + size));
      i += size;
      size = 8;
    }
  }

  for (const chunk of chunks) {
    let todo = chunk.slice();
    for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
      const got = await writeChunk(env, spec, [...spec.past, ...written], todo, (y) => {
        written.push(y);
        onYear?.(y);
      }, t0);
      todo = todo.slice(got);
    }
    for (const year of todo) {
      const y = fillerYear(written[written.length - 1] ?? spec.past[spec.past.length - 1] ?? null, year, profile, spec.decisionIdsFor(year));
      written.push(y);
      onYear?.(y);
      env.onMetric?.({
        kind: "year", lifeId: spec.idPrefix, year, model: "code", schemaOk: false, hardErrors: 0, errors: [], repaired: false, fallback: true,
        softFixes: 0, cliches: 0, turningPoints: 0, filler: true, atMs: Date.now() - t0,
      });
    }
  }
  return written;
}

/** One model call for a run of years. Returns how many years were emitted (in order). */
async function writeChunk(env: WriterEnv, spec: LifeSpec, past: SimYear[], years: number[], emit: (y: SimYear) => void, t0: number): Promise<number> {
  const { profile, call } = env;
  const first = years[0]!;
  const last = years[years.length - 1]!;
  const ledger = ledgerFrom(past, env.world);
  const busy = new Set<number>(years.filter((y) => spec.decisionIdsFor(y).length > 0).flatMap((y) => [y, y + 1]));
  const quiet = spec.coarse ? [] : quietYears(env.seed + spec.idPrefix, years, busy);
  const step = spec.coarse ? 5 : 1;
  const cands = sampleCandidates(env.seed + spec.idPrefix, profile, past, years, env.world, ledger, env.span, step);
  const worldInSpan = env.world.filter((w) => w.year <= last + 1);
  const anchors = (spec.coarse ? years : years.filter((_, i) => i % 2 === 0 || i === years.length - 1))
    .map((y) => {
      const a = moneyAnchor(profile, y - profile.birthYear);
      return `${y} (${y - profile.birthYear}): income ~${usd(a.income)}, median net worth ~${usd(a.netWorthMedian)}`;
    })
    .join("\n");
  const focus = spec.focusQuoteIds
    .map((id) => profile.quotes.find((q) => q.id === id))
    .filter(Boolean)
    .map((q) => `${q!.id}: "${q!.text}"`)
    .join("\n");
  const attention = topWorries(profile, 4)
    .map(([d, w]) => `${DOMAINS[d].label} x${(1 + 1.5 * w).toFixed(1)}`)
    .join(", ");
  const yearsList = years.map((y) => `${y} (age ${y - profile.birthYear})`).join(", ");
  const task = spec.coarse
    ? `Write ${years.length} snapshots for these years, in order: ${yearsList}. Each covers the five years up to it.`
    : `Write exactly ${years.length} years, in order: ${yearsList}. Continue from the life so far.`;

  const prompt = yearsPrompt({
    lifeLabel: spec.lifeLabel,
    person: personBlock(profile),
    quotes: quotesBlock(profile),
    focusQuotes: focus,
    lifeSoFar: lifeSoFarBlock(past, spec.coarse ? 16 : 40),
    decisions: spec.decisions,
    mustShow: spec.mustShow,
    settings: spec.settings,
    world: worldBlock(worldInSpan),
    budget: budgetBlock(past, env.span, first, env.world),
    quiet: quiet.length ? quiet.join(", ") : "(none required in this stretch)",
    anchors,
    candidates: cands.length
      ? cands.map((c) => `${c.year} (${c.age}): ${c.category}, ${c.hint}${c.statId ? ` [${c.statId}: ${statDisplay(c.statId)}]` : ""}`).join("\n")
      : "(nothing sampled: let it be ordinary)",
    attention: attention || "(no strong worries; spread attention evenly)",
    baseRates: spec.coarse ? "(coarse mode: set st to null)" : BASE_RATES_TEXT,
    task,
  });
  const system = spec.coarse ? `${YEARS_SYSTEM}\n\n${COARSE_ADDENDUM}` : YEARS_SYSTEM;
  const model = call.model(spec.tier);
  const extractor = createArrayItemExtractor("years");
  let emitted = 0;
  const quotesText = quotesBlock(profile);
  const lastEmitted: SimYear[] = [];

  const handle = async (rawText: string) => {
    if (emitted >= years.length) return;
    const year = years[emitted]!;
    const prev = [...past, ...lastEmitted].at(-1) ?? null;
    let raw: unknown;
    try {
      raw = JSON.parse(rawText);
    } catch {
      raw = {};
    }
    const { draft, schemaOk } = coerceYear(raw, prev);
    const ctx = {
      profile, expectedYear: year, prev, ledger, world: env.world, span: env.span, idPrefix: spec.idPrefix,
      coarse: spec.coarse, decisionIds: spec.decisionIdsFor(year),
    };
    let check = checkYear(draft, ctx);
    const hardErrors = check.hard.length;
    const errors = check.hard.slice(0, 5);
    let repaired = false;
    let fallback = false;
    if (check.hard.length) {
      try {
        const r = await call.json({
          tier: "repair",
          purpose: "years.repair",
          system: REPAIR_SYSTEM,
          prompt: repairPrompt({
            yearJson: JSON.stringify(compactOf(draft)),
            errors: check.hard,
            quotes: quotesText,
            context: `${spec.lifeLabel}\nPrevious year: ${prev ? `${prev.year} ${prev.summary}` : "(none)"}`,
          }),
          schema: OneYearLLM,
          maxOutputTokens: 2500,
          hedgeMs: 12000,
        });
        const fixedRaw = r.data?.year ?? (r.raw as { year?: unknown } | null)?.year;
        if (fixedRaw) {
          const again = checkYear(coerceYear(fixedRaw, prev).draft, ctx);
          if (!again.hard.length) {
            check = again;
            repaired = true;
          } else check = again;
        }
      } catch {
        /* repair failed; fall back below */
      }
      if (check.hard.length) {
        fallback = true;
        check = { ...check, year: fallbackYear(check) };
      }
    }
    const y = check.year;
    for (const e of y.events) recordEvent(ledger, y.year, e, worldIdFor(env.world, y.year));
    lastEmitted.push(y);
    emitted++;
    emit(y);
    env.onMetric?.({
      kind: "year", lifeId: spec.idPrefix, year, model, schemaOk, hardErrors, errors, repaired, fallback, softFixes: check.soft.length,
      cliches: clicheCount(`${y.summary} ${y.events.map((e) => `${e.title} ${e.narrative}`).join(" ")}`),
      turningPoints: y.events.filter((e) => e.isTurningPoint).length, filler: false, atMs: Date.now() - t0,
    });
  };

  try {
    for await (const delta of call.stream({
      tier: spec.tier,
      purpose: spec.coarse ? "branch.coarse" : spec.idPrefix === "you" ? "years" : "branch.fine",
      system,
      prompt,
      schema: YearsLLM,
      maxOutputTokens: Math.min(16000, 900 + years.length * (spec.coarse ? 700 : 600)),
      hedgeMs: spec.tier === "branch" ? 3500 : 5000,
    })) {
      for (const item of extractor.feed(delta)) await handle(item);
    }
  } catch {
    // stream failed mid-way: keep what we have; the caller retries the rest once
  }
  return emitted;
}

/** Ids of decisions in a year (for the chosen life). */
export const decisionIdsIn = (decisions: { id: string; year: number }[]) => (year: number) =>
  decisions.filter((d) => d.year === year).map((d) => d.id);
