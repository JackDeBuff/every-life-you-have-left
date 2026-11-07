/**
 * The life writer loop shared by the chosen life (yearly, streamed) and hidden branches (coarse
 * 5-year snapshots, or yearly on peek). Per chunk: build the code-owned constraints → stream the
 * model's years → coerce + validate each finished year → one repair call on hard errors → code
 * fallback → emit. Missing years are retried once, then filled with quiet code years so the
 * contract (contiguous years) always holds.
 */
import { DOMAINS, DOMAIN_KEYS } from "../../shared/domains";
import type { LifeEvent, Profile, WorldEvent } from "../../shared/schema";
import type { SimYear } from "../../shared/sim";
import { baseRatesBlock, lifeSoFarBlock, nowContext, personBlock, quotesBlock, topWorries, worldBlock } from "./context";
import { pastTimeIssues } from "./calendar";
import { fixPeopleNumbers, peopleIssues, similarity } from "./consistency";
import { advance, ageMentions, inferChanges, lifeAt, normChange, nowBlock, parentDeathPlan, roleWord, scenePeopleFrom, yearLife, type LedgerPerson, type LifeNow, type SimYearL } from "./ledger";

/** The model's work line and people-change tags for one year (compact keys w, ch). */
function lifeDraftOf(raw: unknown, year: number): { w: string; ch: string[] } {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const w = typeof o.w === "string" ? o.w.trim().slice(0, 80) : "";
  const ch = Array.isArray(o.ch) ? o.ch.filter((c): c is string => typeof c === "string").map((c) => normChange(c, year)).filter((c): c is string => Boolean(c)) : [];
  return { w, ch: [...new Set(ch)].slice(0, 4) };
}
import type { Caller, Tier } from "./models";
import { COARSE_ADDENDUM, REPAIR_SYSTEM, repairPrompt, YEARS_SYSTEM, yearsPrompt } from "./prompts/years";
import { OneYearLLM, YearsLLM, type YearDraft } from "./schemas";
import { createArrayItemExtractor } from "./stream-json";
import { clicheCount, checkYear, coerceYear, compactOf, fallbackYear } from "./validate";
import { CATEGORY_RULES, countryOf, ledgerFrom, moneyAnchor, PARENT_DEATH_RE, recordEvent, sampleCandidates, statDisplay, worldIdFor, type Candidate } from "./world";
import { laneFactors, laneLine, type MoneyPath } from "./money";
import { clashesWithShock, renderShocks, shocksFor } from "./shocks";
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
  /** Today's date (the first simulated year is only what's left of it). */
  today?: Date;
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
  /** Overrides the tier model (per-speed years model). */
  model?: string;
  /** Hybrid: the first `count` years are written by `model` (the heavy model), the rest by `model` above. */
  lead?: { count: number; model: string };
  /** decisionIds per year (engine-owned). */
  decisionIdsFor: (year: number) => string[];
  /** This life's money lane (worker/engine/money.ts): code moves its anchors off the typical path. */
  money?: MoneyPath;
  /** Forks taken in this life (for the NOW block). */
  path?: LifeNow["path"];
}

const BASE_RATES_TEXT = baseRatesBlock();

/**
 * Setbacks that real lives have at base rates. When the sampler rolls one, the writer must use it
 * (code owns the odds); it only chooses how it plays out. Without this the models write
 * lives with no friction at all (first eval run: 47 years, zero setbacks).
 */
const REQUIRED_WHEN_ROLLED = new Set(["job_loss", "burnout", "money_down", "caregiving"]);

function renderCandidates(cands: Candidate[]): string {
  const line = (c: Candidate) => `${c.year} (${c.age}): ${c.category}, ${c.hint}${c.statId ? ` [${c.statId}: ${statDisplay(c.statId)}]` : ""}`;
  const must = cands.filter((c) => REQUIRED_WHEN_ROLLED.has(c.category));
  const may = cands.filter((c) => !REQUIRED_WHEN_ROLLED.has(c.category));
  const parts: string[] = [];
  if (must.length)
    parts.push(
      `WILL HAPPEN (write each one in that year or the next, as a turning point with tone down or mixed, handled gently and with a way through; how it happens is yours, and their choices shape how hard it hits):\n${must.map(line).join("\n")}`,
    );
  parts.push(
    may.length
      ? `MAY HAPPEN (use the ones that fit this life, adapt freely, skip any that contradict their choices; you may add your own within budget):\n${may.map(line).join("\n")}`
      : "MAY HAPPEN: (nothing sampled: let it be ordinary)",
  );
  return parts.join("\n");
}

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
    // code filler (the model came up short): vary the line so two filler years never read the same
    summary: [
      "A quieter year: work, people, the usual weeks.",
      `The same streets in ${(base?.place ?? profile.city ?? "town").split(",")[0]}, a little older, mostly ordinary weeks.`,
      "Nothing big this year. Small routines, a few good evenings.",
      "A steady year. The calendar fills with ordinary things.",
      "Not much changes this year, and that's fine for now.",
    ][year % 5]!,
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
  const chunks: { years: number[]; spec: LifeSpec }[] = [];
  if (spec.coarse) chunks.push({ years: targetYears, spec });
  else {
    let i = 0;
    // Hybrid: the first years after a fork (the consequence of their answer) by the lead model.
    const lead = spec.lead && spec.lead.model !== spec.model ? spec.lead : null;
    if (lead && targetYears.length > lead.count) {
      chunks.push({ years: targetYears.slice(0, lead.count), spec: { ...spec, model: lead.model } });
      i = lead.count;
    }
    // One call per stretch (<= 10 years): streaming makes the first year arrive as fast as in a
    // small call, and every extra call boundary cost 5-9 s of prompt + first-token time.
    while (i < targetYears.length) {
      const later = chunks.length > 0;
      chunks.push({
        years: targetYears.slice(i, i + 10),
        spec: later && spec.mustShow ? { ...spec, mustShow: `ALREADY WRITTEN in the years above (continue from them; don't repeat these beats):\n${spec.mustShow}` } : spec,
      });
      i += 10;
    }
  }

  for (const { years: chunk, spec: chunkSpec } of chunks) {
    let todo = chunk.slice();
    for (let attempt = 0; attempt < 2 && todo.length; attempt++) {
      const got = await writeChunk(env, chunkSpec, [...spec.past, ...written], todo, (y) => {
        written.push(y);
        onYear?.(y);
      }, t0);
      todo = todo.slice(got);
    }
    for (const year of todo) {
      const y: SimYearL = fillerYear(written[written.length - 1] ?? spec.past[spec.past.length - 1] ?? null, year, profile, spec.decisionIdsFor(year));
      const now = lifeAt(profile, [...spec.past, ...written], year, spec.path);
      y.scene = { ...y.scene, people: scenePeopleFrom(now, y.scene.people) };
      y.life = yearLife(now, now.work, []);
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
  const step = spec.coarse ? 5 : 1;
  // Life shocks (shocks.ts): code-planned per life, at real odds, once each; nothing stacks on them.
  const shocks = shocksFor(env.seed, spec.idPrefix, profile, env.world, past, spec.coarse ? first - 4 : first, last);
  const cands = sampleCandidates(env.seed + spec.idPrefix, profile, past, years, env.world, ledger, env.span, step).filter((c) => !clashesWithShock(c, shocks));
  // quiet years never collide with a decision (and its aftermath) or a rolled setback
  const busy = new Set<number>([
    ...years.filter((y) => spec.decisionIdsFor(y).length > 0).flatMap((y) => [y, y + 1]),
    ...cands.filter((c) => REQUIRED_WHEN_ROLLED.has(c.category)).flatMap((c) => [c.year, c.year + 1]),
    ...shocks.map((s) => s.year),
  ]);
  const quiet = spec.coarse ? [] : quietYears(env.seed + spec.idPrefix, years, busy);
  const worldInSpan = env.world.filter((w) => w.year <= last + 1);
  // Money re-anchors to where the life is now (the latest written year's place).
  const here = countryOf(past.at(-1)?.place ?? "") ?? profile.country;
  const anchors = (spec.coarse ? years : years.filter((_, i) => i % 2 === 0 || i === years.length - 1))
    .map((y) => {
      const a = moneyAnchor(profile, y - profile.birthYear, here);
      const f = laneFactors(spec.money, y);
      const nw = Math.round((a.netWorthMedian * f.wealth) / 1000) * 1000;
      return `${y} (${y - profile.birthYear}): income ~${usd(Math.round((a.income * f.income) / 500) * 500)}, net worth ~${usd(nw)}`;
    })
    .join("\n");
  const k = moneyAnchor(profile, first - profile.birthYear, here).placeScale;
  const lane = [
    laneLine(spec.money),
    k !== 1
      ? `They live in ${past.at(-1)?.place ?? here} now: the same work pays about ${Math.round(k * 100)}% of what it paid at home (in USD), and costs follow. The anchors below are local; savings grow only from what they earn and save here.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  // Biology: parents are ~30 years older unless known; past ~88 a parent is frail or gone (the
  // judge caught a mother "still on the veranda" at 98 in a branch).
  const pa = (y: number) => y - profile.birthYear + 30;
  const anchorsWithAges = `${lane ? `${lane}\n` : ""}${anchors}\nTheir parents, if alive: about ${pa(first)}-${pa(last)} in this stretch (assume ~30 years older than them unless told). Frail by the late 80s; very few live past ~92. Their children age one year per year.`;
  const focus = spec.focusQuoteIds
    .map((id) => profile.quotes.find((q) => q.id === id))
    .filter(Boolean)
    .map((q) => `${q!.id}: "${q!.text}"`)
    .join("\n");
  const attention = topWorries(profile, 4)
    .map(([d, w]) => `${DOMAINS[d].label} x${(1 + 1.5 * w).toFixed(1)}`)
    .join(", ");
  const yearsList = years.map((y) => `${y} (age ${y - profile.birthYear})`).join(", ");
  const today = env.today ?? new Date();
  const nowCtx = nowContext({ profile, years: past, atYear: first, path: spec.path, today, to: last, title: "NOW (the life as it stands going into this stretch)" });
  const avoid = past
    .slice(-4)
    .flatMap((y) => [y.summary, ...y.events.map((e) => e.title)])
    .map((s) => `- ${s}`)
    .join("\n");
  const task = spec.coarse
    ? `Write ${years.length} snapshots for these years, in order: ${yearsList}. Each covers the five years up to it.`
    : `Write exactly ${years.length} years, in order: ${yearsList}. Continue from the life so far.`;

  // ---- the life ledger for this chunk: replayed from the past, advanced year by year
  let curLife: LifeNow = lifeAt(profile, past, first - 1, spec.path);
  // A parent's old-age death is code-owned (once, late, gently) and must reach the log.
  const death = parentDeathPlan(profile, profile.birthYear + profile.endAge);
  const deathWho = death && ledger.parentDeaths === 0 ? curLife.people.find((p) => p.role === "parent" && p.status === "here" && p.name === death.name) ?? null : null;
  const deathYear = death && deathWho && death.year <= last ? Math.max(death.year, first) : null;
  const deathLine =
    deathYear !== null && deathWho
      ? `\nWILL HAPPEN (code-owned, once in this life): ${deathYear} (${deathYear - profile.birthYear}): ${deathWho.generic ? deathWho.name : `${deathWho.name} (${deathWho.relation})`} dies of old age, at about ${death!.age + (deathYear - death!.year)}. One gentle sentence in that ${spec.coarse ? "snapshot" : "year"}, offscreen (the call, the trip home, a small thing kept), tone mixed, not a turning point, never a twist. Tag ch "-parent:${deathWho.name}".`
      : "";

  const prompt = yearsPrompt({
    lifeLabel: spec.lifeLabel,
    person: personBlock(profile),
    quotes: quotesBlock(profile),
    focusQuotes: focus,
    lifeSoFar: lifeSoFarBlock(past, spec.coarse ? 16 : 40),
    now: nowCtx.text,
    avoid,
    decisions: spec.decisions,
    mustShow: spec.mustShow,
    settings: spec.settings,
    world: worldBlock(worldInSpan),
    budget: budgetBlock(past, env.span, first, env.world),
    quiet: quiet.length ? quiet.join(", ") : "(none required in this stretch)",
    anchors: anchorsWithAges,
    candidates: `${renderCandidates(cands)}${renderShocks(shocks, spec.coarse)}${deathLine}`,
    attention: attention || "(no strong worries; spread attention evenly)",
    baseRates: spec.coarse ? "(coarse mode: set st to null)" : BASE_RATES_TEXT,
    task,
  });
  const system = spec.coarse ? `${YEARS_SYSTEM}\n\n${COARSE_ADDENDUM}` : YEARS_SYSTEM;
  const model = spec.model || call.model(spec.tier);
  const extractor = createArrayItemExtractor("years");
  let emitted = 0;
  const quotesText = quotesBlock(profile);
  const lastEmitted: SimYear[] = [];
  const recent = () => [...past, ...lastEmitted].slice(-3);

  /** People, ages, duplicate lines and the date, checked against the ledger. */
  const lifeCheck = (y: SimYear, raw: { w: string; ch: string[] }) => {
    let ch = raw.ch;
    // the model forgot to tag a birth / a new partner it wrote as a turning point: tag it here
    if (!ch.length) ch = inferChanges(y, curLife.people).map((c) => normChange(c, y.year)).filter((c): c is string => Boolean(c));
    const probe: SimYearL = { ...y, life: { work: raw.w, ch, people: [] } };
    const { now, changes } = advance(curLife, probe);
    const hard: string[] = [];
    const bad = new Set<number>();
    let summaryBad = false;
    const allow = { changes };
    y.events.forEach((e, i) => {
      const iss = peopleIssues(`${e.title}. ${e.narrative}`, now, allow).filter((x) => x.kind !== "age");
      if (iss.length) {
        hard.push(...iss.map((x) => `event ${i + 1} "${e.title}": ${x.msg}`));
        bad.add(i);
      }
      const dup = recent().find((p) => p.events.some((pe) => similarity(pe.title, e.title) >= 0.8));
      if (dup && e.isTurningPoint && e.title.length > 12) {
        hard.push(`event ${i + 1} "${e.title}" repeats an event of ${dup.year}; write what is new in ${y.year}`);
        bad.add(i);
      }
    });
    const sIss = peopleIssues(`${y.summary} ${y.scene.caption}`, now, allow).filter((x) => x.kind !== "age");
    if (sIss.length) {
      hard.push(...sIss.map((x) => `summary/caption: ${x.msg}`));
      summaryBad = true;
    }
    const dupS = recent().find((p) => similarity(p.summary, y.summary) >= 0.7);
    if (dupS) {
      hard.push(`summary repeats ${dupS.year}'s line ("${dupS.summary}"); write what is different about ${y.year}`);
      summaryBad = true;
    }
    if (y.year === profile.startYear) {
      const t = pastTimeIssues(y.summary, today, profile.country, y.year);
      if (t.length) (summaryBad = true), hard.push(...t.map((m) => `summary: ${m}`));
      y.events.forEach((e, i) => {
        const te = pastTimeIssues(`${e.title}. ${e.narrative}`, today, profile.country, y.year);
        if (te.length) bad.add(i), hard.push(...te.map((m) => `event ${i + 1}: ${m}`));
      });
    }
    // first stated age of someone whose age we didn't know becomes their birth year (code-owned after)
    const unknown = curLife.people.filter((p) => !p.ageKnown && !p.generic && p.role !== "pet");
    const text = [y.summary, ...y.events.map((e) => `${e.title}. ${e.narrative}`)].join(" ");
    for (const m of ageMentions(text, unknown.map((p) => p.name.split(/\s+/)[0]!))) {
      const tag = `=born:${m.who}:${y.year - m.age}`;
      if (!m.byRelation && !ch.some((c) => c.startsWith(`=born:${m.who}:`))) ch = [...ch, tag];
    }
    return { hard, bad, summaryBad, ch, work: raw.w };
  };

  /** Ages/counts fixed in place, scene people from the ledger, `life` attached; advances the ledger. */
  const finishYear = (y00: SimYear, life0: { ch: string[]; work: string }): SimYear => {
    // the planned parent death (and only one) reaches the ledger AND the log
    const pd = withParentDeath(y00, life0.ch, curLife, deathYear !== null && y00.year >= deathYear ? deathWho : null, ledger.parentDeaths, spec.idPrefix);
    const y0 = { ...y00, events: pd.events };
    const life = { ...life0, ch: pd.ch };
    const probe: SimYearL = { ...y0, life: { work: life.work, ch: life.ch, people: [] } };
    const { now, changes } = advance(curLife, probe);
    const fix = (s: string) => fixPeopleNumbers(s, now).text;
    const recentTitles = recent().flatMap((p) => p.events.map((e) => e.title));
    const events = y0.events
      // a texture line that repeats one from the last 3 years is dropped (the log would show it twice)
      .filter((e) => e.isTurningPoint || !recentTitles.some((t) => similarity(t, e.title) >= 0.8))
      .map((e, i) => ({ ...e, id: e.id.replace(/-\d+$/, `-${i + 1}`), title: fix(e.title), narrative: fix(e.narrative) }));
    const y: SimYearL = {
      ...y0,
      summary: fix(y0.summary),
      events,
      scene: { ...y0.scene, caption: fix(y0.scene.caption), people: scenePeopleFrom(now, y0.scene.people) },
    };
    y.life = yearLife(now, life.work || now.work, changes);
    curLife = now;
    return y;
  };

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
    const back3 = [...past, ...lastEmitted].find((x) => x.year === year - 3) ?? null;
    const ctx = {
      profile, expectedYear: year, prev, ledger, world: env.world, span: env.span, idPrefix: spec.idPrefix,
      coarse: spec.coarse, decisionIds: spec.decisionIdsFor(year), netWorth3YearsAgo: back3?.money.netWorth ?? null, shocks,
    };
    // rule checks (validate.ts) + life checks against the ledger (people, ages, duplicates, date)
    const both = (d: YearDraft, r: unknown) => {
      const c = checkYear(d, ctx);
      const l = lifeCheck(c.year, lifeDraftOf(r, year));
      return { c: { ...c, hard: [...c.hard, ...l.hard], badEvents: new Set([...c.badEvents, ...l.bad]), summaryBanned: c.summaryBanned || l.summaryBad }, l };
    };
    let { c: check, l: life } = both(draft, raw);
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
            yearJson: JSON.stringify(compactOf(draft, { w: life.work, ch: life.ch })),
            errors: check.hard,
            quotes: quotesText,
            context: `${spec.lifeLabel}\nPrevious year: ${prev ? `${prev.year} ${prev.summary}` : "(none)"}\n${nowBlock(curLife, { from: year, title: `PEOPLE AND STATE going into ${year}` })}${renderShocks(shocks.filter((x) => x.year <= year && year - x.year <= (spec.coarse ? 5 : 1)), spec.coarse)}`,
          }),
          schema: OneYearLLM,
          maxOutputTokens: 2500,
          hedgeMs: 12000,
        });
        const fixedRaw = r.data?.year ?? (r.raw as { year?: unknown } | null)?.year;
        if (fixedRaw) {
          const again = both(coerceYear(fixedRaw, prev).draft, fixedRaw);
          check = again.c;
          life = again.l;
          if (!check.hard.length) repaired = true;
        }
      } catch {
        /* repair failed; fall back below */
      }
      if (check.hard.length) {
        fallback = true;
        check = { ...check, year: fallbackYear(check) };
      }
    }
    const y = finishYear(check.year, life);
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
      model: spec.model,
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

/**
 * A parent's death in a year: the "-parent" tag (the ledger) and a gentle line (the log) always go
 * together, and at most once in a life. `planned` = the parent whose code-owned death falls in or
 * before this year (ledger.parentDeathPlan). The model may write it itself (tagged or not); a tag
 * without a line gets one, a line without a tag gets one, a second death is dropped.
 */
export function withParentDeath(y: SimYear, ch: string[], now: LifeNow, planned: LedgerPerson | null, deathsSoFar: number, idPrefix: string): { events: LifeEvent[]; ch: string[] } {
  const text = (e: LifeEvent) => `${e.title}. ${e.narrative}`;
  const deathEv = y.events.find((e) => PARENT_DEATH_RE.test(text(e)));
  const tagged = ch.filter((c) => c.startsWith("-parent:"));
  if (deathsSoFar >= 1) return { events: y.events, ch: ch.filter((c) => !c.startsWith("-parent:")) };
  if (!deathEv && !tagged.length && !planned) return { events: y.events, ch };
  const parents = now.people.filter((p) => p.role === "parent" && p.status === "here" && p.since <= y.year);
  const byWord = (w: string) => {
    const t = w.toLowerCase().replace(/^your\s+/, "");
    return parents.find((p) => p.name.toLowerCase().replace(/^your\s+/, "") === t) ?? parents.find((p) => roleWord(p.relation) === roleWord(t));
  };
  let who: LedgerPerson | undefined;
  for (const t of tagged) who ??= byWord(t.slice("-parent:".length));
  if (!who && deathEv) {
    const t = text(deathEv).toLowerCase();
    who = parents.find((p) => !p.generic && t.includes(p.name.toLowerCase())) ?? parents.find((p) => t.includes(roleWord(p.relation)));
  }
  if (!who && planned) who = parents.find((p) => p.name === planned.name);
  if (!who) return { events: y.events, ch: ch.filter((c) => !c.startsWith("-parent:")) }; // nobody here to lose
  const tags = [...ch.filter((c) => !c.startsWith("-parent:")), `-parent:${who.name}`];
  if (deathEv) return { events: y.events, ch: tags };
  // a code line, gentle and offscreen; it takes the place of a texture line if the year is full
  let events = y.events;
  if (events.length >= 3) {
    const drop = events.findLastIndex((e) => !e.isTurningPoint);
    events = events.filter((_, i) => i !== (drop >= 0 ? drop : events.length - 1)).slice(0, 2);
  }
  return { events: [...events, parentDeathEvent(who, y.year, idPrefix)], ch: tags };
}

function parentDeathEvent(who: LedgerPerson, year: number, idPrefix: string): LifeEvent {
  const w = roleWord(who.relation);
  const rel = w === "mother" || w === "father" ? w : "parent";
  const [sub, obj, pos] = rel === "mother" ? ["She", "her", "hers"] : rel === "father" ? ["He", "him", "his"] : ["They", "them", "theirs"];
  const age = who.born !== null ? year - who.born : null;
  const when = age === null ? "" : who.ageKnown ? `, at ${age}` : age >= 90 ? `, in ${rel === "mother" ? "her" : rel === "father" ? "his" : "their"} nineties` : `, in ${rel === "mother" ? "her" : rel === "father" ? "his" : "their"} late eighties`;
  return {
    id: `${idPrefix}-${year}-9`,
    domain: "family",
    category: "texture",
    title: `${who.generic ? `Your ${rel}` : `${who.name}, your ${rel},`} dies${when}`,
    narrative: `${sub} goes quietly, after a long life. You go home, sit with the family, and keep one small thing of ${pos}; for a while you still reach for the phone to call ${obj}.`,
    isTurningPoint: false,
    cause: null,
    baseRate: null,
    tone: "mixed",
  };
}

/** Ids of decisions in a year (for the chosen life). */
export const decisionIdsIn = (decisions: { id: string; year: number }[]) => (year: number) =>
  decisions.filter((d) => d.year === year).map((d) => d.id);
