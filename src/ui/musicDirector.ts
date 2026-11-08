/**
 * Picks the in-game music cue from the session (the engine is ./music.ts). Kept apart from the
 * engine so the engine never imports the session (media.ts uses it on pages without one).
 */
import { useEffect, useRef } from "react";
import { nowPlaying, play, stinger, type CueName } from "./music";
import { useSim } from "./session";

function bedFor(age: number): CueName {
  return age < 35 ? "life-early" : age < 50 ? "life-building" : age < 60 ? "life-middle" : "life-late";
}

/**
 * A year gets its own colour only when something big happens in it (its 3D moment), or when it is
 * a heavy year: most years are "joyful" or "calm", and following that would flip the music every
 * few seconds. Everything else plays the bed for the age.
 */
const BRIGHT = new Set(["graduation", "new_job", "promotion", "wedding", "new_baby", "moving_in", "house_keys", "first_show", "launch", "travel_abroad", "reunion", "award", "retirement"]);
const HARD = new Set(["layoff", "breakup", "caregiving_start"]);

/** A bed or a mood cue plays at least this long before another bed or mood cue replaces it. */
const MIN_DWELL_MS = 14_000;
/** A mood (heavy / joyful year) takes over only after it has held this long. */
const SETTLE_MS = 2_500;

/** Picks the cue from the session. Mount once, inside the game (App's Screens). */
export function useMusicDirector() {
  const phase = useSim((s) => s.phase);
  const age = useSim((s) => s.playhead.age);
  const scene = useSim((s) => s.years.find((y) => y.year === s.playhead.year)?.scene ?? null);
  const color = !scene ? null
    : scene.mood === "heavy" || (scene.moment && HARD.has(scene.moment)) ? "hard"
    : scene.moment && BRIGHT.has(scene.moment) && scene.mood !== "tense" ? "bright"
    : null;
  const prevPhase = useRef(phase);

  const target: CueName | null =
    phase === "start" ? null
    : phase === "warmup" ? "life-early-default"
    : phase === "deciding" ? "decision"
    : phase === "interlude" ? "interlude"
    : phase === "ended" ? "ending-70"
    : color === "hard" ? "hard-times"
    : color === "bright" ? "good-times"
    : bedFor(age);

  // A fork was answered: the split stinger, before the next cue fades in.
  useEffect(() => {
    if (prevPhase.current === "deciding" && phase !== "deciding" && phase !== "ended") void stinger();
    prevPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    const cur = nowPlaying();
    const scored = phase !== "playing"; // decision, interlude, ending, warm-up: change at once
    if (scored || !cur || cur.name === "decision" || cur.name === "interlude" || cur.name === "life-early-default") {
      void play(target);
      return;
    }
    const isMood = target === "hard-times" || target === "good-times";
    const wait = Math.max(isMood ? SETTLE_MS : 0, MIN_DWELL_MS - (performance.now() - cur.at));
    if (wait <= 0) {
      void play(target);
      return;
    }
    const t = window.setTimeout(() => void play(target), wait);
    return () => window.clearTimeout(t);
  }, [target, phase]);

  // Leaving the game (back to the start screen or unmounting) fades out.
  useEffect(() => () => void play(null), []);
}
