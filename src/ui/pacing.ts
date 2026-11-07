/**
 * Pacing numbers shared by the UI and scripts/judge-run.ts (which emulates this client to time
 * Auto runs against a real session agent). Pure: no DOM, no React.
 */
import type { SimYear, SpeedMode } from "../../shared/sim";

/**
 * Interlude: seconds per cut ("Meanwhile, in your other lives…"), three cuts. 1×/2×/4×: ~7 s, so
 * the fork moment + the cuts stay under 10 s from the answer (QA: 9-20 s); Auto: ~5 s.
 */
export const cutSecondsFor = (speed: SpeedMode | string): number => (speed === "auto" ? 1.6 : 2.3);

/** Length of the fork moment's GSAP timeline (src/ui/motion/forkMoment.ts). */
export const FORK_MOMENT_S = 2.4;

/**
 * Auto's coda: once the last fork is behind and the ending is already written, the remaining
 * years play at this fraction of their time (1.5 s -> 0.9 s a year). It only starts when the
 * ending is ready, so it can never add a wait at 70.
 */
export const AUTO_CODA_FACTOR = 0.6;

/** Seconds per year now: SPEED_CONFIG, or Auto's coda (see AUTO_CODA_FACTOR). */
export function secondsPerYearNow(o: { speed: SpeedMode; base: number; nextFork: number | null | undefined; endingReady: boolean | undefined }): number {
  return o.speed === "auto" && o.nextFork == null && o.endingReady ? o.base * AUTO_CODA_FACTOR : o.base;
}

/** Clock time scale while a small decision is open (it slows time, it never stops it). */
export const SMALL_DECISION_SCALE = 0.5;

/** 1×: after a small card closes, the end of the year waits this long for that year's next card. */
export const SMALL_NEXT_GRACE_MS = 1500;

/**
 * Whether the clock waits at the end of the year instead of asking for the next one:
 *  - a small card is open and the next year is a fork's: the fork never cuts the card off, it
 *    comes once the card is answered or slides (2×/4× cards still slide after their idle time);
 *  - 1× (the conversation, ~3 cards a year): a year doesn't end while a card is open, nor for a
 *    moment after one closes, so the year's next card can come up.
 * Within the year the clock still runs (at SMALL_DECISION_SCALE while a card is open).
 */
export function holdsYearEnd(o: { speed: SpeedMode; smallOpen: boolean; smallDue?: boolean; nextYear: number; nextFork: number | null | undefined; msSinceSmall: number }): boolean {
  if (o.smallOpen) return o.speed === "1x" || (o.nextFork != null && o.nextFork <= o.nextYear);
  // (smallDue: the agent is still writing this year's next card; it clears it after a few seconds)
  return o.speed === "1x" && (!!o.smallDue || o.msSinceSmall < SMALL_NEXT_GRACE_MS);
}

/** The life clock eases its time scale: in (after a hold, a fork, an interlude) and out. */
export const CLOCK_EASE_IN_MS = 350;
export const CLOCK_EASE_OUT_MS = 260;

/**
 * 3D moments (a wedding, the house keys, a launch…) are 4-5 s cinematics. They play only on a
 * real turning point and at most one every `gapYears`, and the clock waits `holdS` for each so
 * the cinematic finishes before the next year arrives (the year itself adds ~2 s more).
 */
export const MOMENT_RULES: Record<SpeedMode, { gapYears: number; holdS: number }> = {
  // Auto: the hold plus the ~2 s the year itself takes lets a 4-4.8 s cinematic play out. One
  // every 6 years (was 3; a measured run held 9 of them, 22.5 s): ~6 in a judge's run.
  auto: { gapYears: 6, holdS: 2.5 },
  "4x": { gapYears: 3, holdS: 2.8 },
  "2x": { gapYears: 2, holdS: 3.6 },
  "1x": { gapYears: 2, holdS: 4.4 },
};

/**
 * The years whose moment plays, chosen greedily in life order (a played year never changes when
 * later years are rewritten). A year qualifies when its scene has a moment AND it has a turning
 * point; a fork's consequence year always qualifies, the gap still applies.
 */
export function playableMoments(years: readonly SimYear[], speed: SpeedMode): Set<number> {
  const { gapYears } = MOMENT_RULES[speed] ?? MOMENT_RULES.auto;
  const out = new Set<number>();
  let last = -Infinity;
  for (const y of years) {
    if (!y.scene.moment) continue;
    if (!y.events.some((e) => e.isTurningPoint) && !y.decisionIds.length) continue;
    if (y.year - last < gapYears) continue;
    out.add(y.year);
    last = y.year;
  }
  return out;
}
