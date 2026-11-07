/**
 * Pacing numbers shared by the UI and scripts/judge-run.ts (which emulates this client to time
 * Auto runs against a real session agent). Pure: no DOM, no React.
 */
import type { SimYear, SpeedMode } from "../../shared/sim";

/** Interlude: seconds per cut ("Meanwhile, in your other lives…"). Auto keeps the run ≤ 3 min. */
export const cutSecondsFor = (speed: SpeedMode | string): number => (speed === "auto" ? 1.8 : 2.6);

/** Length of the fork moment's GSAP timeline (src/ui/motion/forkMoment.ts). */
export const FORK_MOMENT_S = 2.4;

/** Clock time scale while a small decision is open (it slows time, it never stops it). */
export const SMALL_DECISION_SCALE = 0.5;

/**
 * 3D moments (a wedding, the house keys, a launch…) are 4-5 s cinematics. They play only on a
 * real turning point and at most one every `gapYears`, and the clock waits `holdS` for each so
 * the cinematic finishes before the next year arrives (the year itself adds ~2 s more).
 */
export const MOMENT_RULES: Record<SpeedMode, { gapYears: number; holdS: number }> = {
  auto: { gapYears: 3, holdS: 3 },
  "4x": { gapYears: 3, holdS: 3 },
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
