/**
 * Subjective time (owner, Sat Nov 7; D-100): the life is paced the way it feels. William James
 * (The Principles of Psychology, 1890, building on Paul Janet, 1877): years full of new things feel
 * long, routine years shrink, so time seems to speed up as we age. The first years after today get
 * many small questions and frequent forks and play slowly; later years play faster with fewer
 * choices (never none: at least a small card a year at 1x and a fork every ~4-5 years). A new
 * chapter (a move, new work, a partner, a child, any fork) slows time again for the next two years.
 *
 * "i" is years since the life started here (profile.startYear), NOT since the latest re-plan, so
 * re-planning after a fork never restarts the dense phase. Pure; shared by the slot planner
 * (worker/engine/slots.ts), the life clock (src/ui/pacing.ts) and the QA sims.
 */
import type { SpeedMode } from "./sim";

export interface PaceStage {
  /** Stage covers years since the start < until. */
  until: number;
  /** 1x small cards a year (fractions alternate: 3.5 = 4, 3, 4, 3...). */
  small: number;
  /** Years between forks at 1x (other speeds stretch it to fit their budget). */
  gap: number;
  /** Clock: seconds a year x this (> 1 plays slower). */
  time: number;
  /** Shown once on entering the stage (null: nothing). */
  note: string | null;
}

export const PACE_STAGES: readonly PaceStage[] = [
  { until: 5, small: 6, gap: 1, time: 1.35, note: null },
  { until: 15, small: 3.5, gap: 2, time: 1.1, note: "Years start to blur. Routine years feel shorter (William James, 1890)." },
  { until: 25, small: 2, gap: 3, time: 0.85, note: "Time speeds up as the days repeat." },
  { until: Infinity, small: 1, gap: 4.5, time: 0.7, note: "The years go faster now. New things still slow them down." },
];

/** A new chapter: extra 1x small cards a year, and the clock runs this much slower. */
export const NOVELTY_SMALL = 2;
export const NOVELTY_TIME = 1.2;
export const NOVELTY_NOTE = "A new chapter. Time slows down again.";

/** Auto is the 3-minute judge run: the same shape, softer (its late years must not outrun the writer). */
const TIME_STRENGTH: Record<SpeedMode, number> = { "1x": 1, "2x": 1, "4x": 1, auto: 0.6 };

export const stageIndex = (i: number) => PACE_STAGES.findIndex((s) => i < s.until);
export const stageAt = (i: number): PaceStage => PACE_STAGES[Math.max(0, stageIndex(i))]!;

/** 1x small cards in the i-th year (novelty adds NOVELTY_SMALL). */
export function smallPerYear(i: number, novel = false): number {
  const d = stageAt(i).small;
  const base = Math.floor(d) + (d % 1 && i % 2 === 0 ? 1 : 0);
  return base + (novel ? NOVELTY_SMALL : 0);
}

/** Weight of a year for spreading a fixed small budget (2x/4x). */
export const smallWeight = (i: number, novel = false) => stageAt(i).small * (novel ? 1.6 : 1);

/** 1x years between a fork in year i and the next. */
export const forkGap = (i: number) => stageAt(i).gap;

/** Seconds-per-year multiplier for this speed in year i (novel years play slower). */
export function timeFactor(speed: SpeedMode, i: number, novel = false): number {
  const k = TIME_STRENGTH[speed] ?? 1;
  const t = 1 + (stageAt(Math.max(0, i)).time - 1) * k;
  return novel ? t * (1 + (NOVELTY_TIME - 1) * k) : t;
}

/** Event categories that start a new chapter. */
const NEW_CHAPTER = new Set(["move", "career_change", "career_move", "love_start", "marriage", "child", "home"]);

/**
 * The years that feel new: the two years after a new-chapter event, and the year after every
 * answered fork (its consequence is the new chapter).
 */
export function noveltyYears(
  years: readonly { year: number; events: readonly { category: string }[] }[],
  decisions: readonly { kind: string; year: number; status: string }[],
): Set<number> {
  const out = new Set<number>();
  for (const y of years)
    if (y.events.some((e) => NEW_CHAPTER.has(e.category))) {
      out.add(y.year + 1);
      out.add(y.year + 2);
    }
  for (const d of decisions) if (d.kind === "big" && d.status === "answered") out.add(d.year + 1);
  return out;
}

/** The note to show on reaching year i (a stage change, or the start of a new chapter), or null. */
export function paceNote(i: number, novel: boolean, prevNovel: boolean): string | null {
  if (i > 0 && stageIndex(i) !== stageIndex(i - 1)) return stageAt(i).note;
  if (novel && !prevNovel && i >= PACE_STAGES[0]!.until) return NOVELTY_NOTE;
  return null;
}
