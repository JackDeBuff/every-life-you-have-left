/**
 * Contract-level invariants that zod can't express. WP1's validator (budgets, cooldowns,
 * banned terms, divergence) builds on this; keep this file to rules that are always true.
 * Returns a list of human-readable problems (empty = valid), suitable for a repair prompt.
 */
import { isBaseRateId } from "./baseRates";
import { DOMAIN_KEYS } from "./domains";
import type { Life, Profile } from "./schema";

export function checkLife(life: Life, profile: Profile, opts: { fromYear?: number } = {}): string[] {
  const errs: string[] = [];
  const quoteIds = new Set(profile.quotes.map((q) => q.id));
  const startYear = opts.fromYear ?? profile.startYear;
  const endYear = profile.birthYear + profile.endAge;
  const seen = new Set<string>();

  if (life.years.length === 0) errs.push(`${life.key}: no years`);
  const first = life.years[0];
  const last = life.years[life.years.length - 1];
  if (first && first.year !== startYear) errs.push(`${life.key}: first year ${first.year}, expected ${startYear}`);
  if (last && last.year !== endYear) errs.push(`${life.key}: last year ${last.year}, expected ${endYear}`);

  life.years.forEach((y, i) => {
    const where = `${life.key} ${y.year}`;
    if (i > 0 && y.year !== life.years[i - 1]!.year + 1) errs.push(`${where}: years not contiguous`);
    if (y.age !== y.year - profile.birthYear) errs.push(`${where}: age ${y.age} != year - birthYear`);
    for (const d of DOMAIN_KEYS) {
      const v = y.states[d];
      if (!Number.isInteger(v) || v < 0 || v > 100) errs.push(`${where}: states.${d}=${v} out of 0..100`);
    }
    for (const e of y.events) {
      if (seen.has(e.id)) errs.push(`${where}: duplicate event id ${e.id}`);
      seen.add(e.id);
      if (e.isTurningPoint && !e.cause) errs.push(`${where} ${e.id}: turning point without cause (D-013)`);
      if (e.cause && !quoteIds.has(e.cause.quoteId))
        errs.push(`${where} ${e.id}: cause.quoteId "${e.cause.quoteId}" is not in profile.quotes`);
      if (e.baseRate && !isBaseRateId(e.baseRate.statId))
        errs.push(`${where} ${e.id}: baseRate.statId "${e.baseRate.statId}" is not in shared/baseRates.ts`);
    }
  });

  const worldEvents = life.years.flatMap((y) => y.events).filter((e) => e.category === "world_context");
  if (worldEvents.length > 2) errs.push(`${life.key}: ${worldEvents.length} world events (max 2, D-005)`);
  return errs;
}
