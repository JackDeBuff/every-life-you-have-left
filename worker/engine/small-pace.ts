/**
 * Small-card pacing (PURE): which planned small slot is due now, and whether the playhead's year
 * must wait for the cards it still owes (SPEC §2, D-081). The session agent runs this; so does
 * scripts/qa/pace-sim.ts, which plays a 1x life against a fake card writer to count cards a year.
 *
 * 1x is the deep mode (the owner's playtest, Sat Nov 7: 4 cards in 8 years while ~23 slots were
 * "spent"): a year WAITS for the small cards planned in it. Cards are served for the playhead's own
 * year (no lookahead: they come up in their year, never a year early), one at a time; the next is
 * written ahead in the agent's queue while one is open. The year's end is held (state.smallDue)
 * while a slot of this year is still owed: being written, in the fork's quiet moment, or waiting
 * for the queue. Only a writer that fails for SMALL_GIVEUP_MS lets the year go (those slots are
 * skipped, never piled up later).
 * 2x/4x/Auto: unchanged (one year of lookahead, slots the playhead passes are dropped, no hold).
 */
import type { DecisionSlot } from "../../shared/engine";
import type { Decision, SpeedMode } from "../../shared/sim";

/** 1x: a year gives up on a small card that hasn't come after this long (a broken writer, not a slow one). */
export const SMALL_GIVEUP_MS = 25_000;

/** How many years ahead of the playhead a small slot may be written and shown. */
export const smallLookahead = (speed: SpeedMode): number => (speed === "1x" ? 0 : 1);

export interface PaceView {
  speed: SpeedMode;
  /** The playhead's year. */
  ph: number;
  slots: readonly DecisionSlot[];
  decisions: readonly Pick<Decision, "kind" | "year" | "status">[];
  /** Small slot keys given up on (SMALL_GIVEUP_MS): they count as done. */
  skipped?: ReadonlySet<string>;
  /** 1x: life resumed after a fork less than FORK_QUIET_MS ago (or isn't playing yet). */
  quiet?: boolean;
}

export const slotKey = (sl: Pick<DecisionSlot, "kind" | "year">, idx: number) => `${sl.kind}-${sl.year}-${idx}`;

/** Each slot with its index among the slots of its kind and year (the agent's slot key). */
export function indexedSlots(slots: readonly DecisionSlot[]): { sl: DecisionSlot; idx: number; key: string }[] {
  const seen = new Map<string, number>();
  return slots.map((sl) => {
    const k = `${sl.kind}-${sl.year}`;
    const idx = seen.get(k) ?? 0;
    seen.set(k, idx + 1);
    return { sl, idx, key: slotKey(sl, idx) };
  });
}

/** A slot is done when its year has more decisions of its kind than its index, or it was skipped. */
export function slotDone(v: Pick<PaceView, "decisions" | "skipped">, sl: Pick<DecisionSlot, "kind" | "year">, idx: number): boolean {
  if (v.skipped?.has(slotKey(sl, idx))) return true;
  return v.decisions.filter((d) => d.kind === sl.kind && d.year === sl.year).length > idx;
}

/** The next fork not answered yet (pending, or its slot not written) and the last fork answered. */
export function forkYears(v: Pick<PaceView, "ph" | "slots" | "decisions" | "skipped">): { open: number; last: number } {
  let open = Infinity;
  let last = -Infinity;
  for (const d of v.decisions) {
    if (d.kind !== "big") continue;
    if (d.status === "pending") open = Math.min(open, d.year);
    if (d.status === "answered") last = Math.max(last, d.year);
  }
  for (const { sl, idx } of indexedSlots(v.slots)) if (sl.kind === "big" && sl.year >= v.ph && sl.year < open && !slotDone(v, sl, idx)) open = sl.year;
  return { open, last };
}

/**
 * done: written (or skipped). passed: its year is behind the playhead. ahead: too far ahead to
 * write yet. blocked: a fork rule keeps it out (an open fork at or before its year; 2x/4x: the
 * fork's year or the year after). quiet: 1x, the fork's own year while its consequence plays a
 * moment. due: write/serve it now (one small card at a time is the caller's rule).
 */
export type SmallVerdict = "done" | "passed" | "ahead" | "blocked" | "quiet" | "due";

export function smallVerdict(v: PaceView, sl: DecisionSlot, idx: number, forks = forkYears(v)): SmallVerdict {
  if (slotDone(v, sl, idx)) return "done";
  if (sl.year < v.ph) return "passed";
  if (sl.year > v.ph + smallLookahead(v.speed)) return "ahead";
  if (forks.open <= sl.year) return "blocked";
  if (v.speed === "1x") {
    if (sl.year < forks.last) return "passed";
    if (sl.year === forks.last && v.quiet) return "quiet";
  } else if (sl.year <= forks.last + 1) return "blocked";
  return "due";
}

/** The first small slot to write/serve now, or null. (Callers keep one small card at a time.) */
export function dueSmall(v: PaceView): { sl: DecisionSlot; idx: number; key: string } | null {
  const forks = forkYears(v);
  for (const x of indexedSlots(v.slots)) {
    if (x.sl.kind !== "small") continue;
    const verdict = smallVerdict(v, x.sl, x.idx, forks);
    if (verdict === "quiet") return null; // this year's cards come after the quiet moment
    if (verdict === "due") return x;
  }
  return null;
}

/**
 * 1x: small slots of the playhead's year still owed (due or in the fork's quiet moment). While this
 * is > 0 and no small card is open, the year's end waits (state.smallDue). 0 at other speeds.
 */
export function owedThisYear(v: PaceView): number {
  if (v.speed !== "1x") return 0;
  const forks = forkYears(v);
  let n = 0;
  for (const { sl, idx } of indexedSlots(v.slots)) {
    if (sl.kind !== "small" || sl.year !== v.ph) continue;
    const verdict = smallVerdict(v, sl, idx, forks);
    if (verdict === "due" || verdict === "quiet") n++;
  }
  return n;
}
