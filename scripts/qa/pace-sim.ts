/**
 * A deterministic 1x pacing simulation (no model, no Durable Object): the real slot planner
 * (worker/engine/slots.ts), the agent's small-card policy (worker/engine/small-pace.ts) and the
 * client's year-end hold (src/ui/pacing.ts), against a fake card writer with a fixed latency and a
 * user who takes a fixed time per card. Counts the small cards each year actually shows.
 *
 *   npx tsx scripts/qa/pace-sim.ts        prints planned vs shown per year, old policy vs new
 *
 * "old" replays the policy before Nov 7 (a year of lookahead, the year's end held at most 6 s for
 * a card still being written, passed slots dropped); "new" is the agent's current policy.
 * Time runs in 100 ms steps. Every fork takes the user 8 s plus a 7 s interlude; the queue is
 * dropped at every fork and at every Nth answer (an answer that opens a thread, or a fold that
 * finds one: a follow-up card is written instead, 5 s; typed answers do this often).
 */
import type { DecisionSlot } from "../../shared/engine";
import type { Profile } from "../../shared/schema";
import { SPEED_CONFIG, type Decision, type SessionState } from "../../shared/sim";
import { planSlotsFor } from "../../worker/engine/slots";
import { dueSmall, owedThisYear, SMALL_GIVEUP_MS, slotDone, type PaceView } from "../../worker/engine/small-pace";
import { holdsYearEnd, SMALL_DECISION_SCALE } from "../../src/ui/pacing";
import { profileOf, TODAY } from "./fixtures";

export interface PaceOpts {
  policy: "old" | "new";
  years: number;
  /** How long the user takes to answer a small card, ms. */
  answerMs: number;
  /** How long a batch of up to 4 cards takes to write, ms. */
  batchMs: number;
  /** Every Nth answer opens a thread (or its fold finds one): the queue is dropped, a follow-up is written. */
  dropEvery?: number;
  profile?: Profile;
}

export interface PaceResult {
  /** year -> [planned small slots, small cards shown] */
  perYear: Map<number, [number, number]>;
  shown: number;
  planned: number;
  /** Most small cards on screen at once (must stay 1). */
  maxOpen: number;
  /** Real seconds the run took (the session length a 1x user sits through). */
  seconds: number;
  /** Seconds a year's end waited for a card still being written (dead air, no card open). */
  waitedSeconds: number;
  forks: number;
}

const DT = 100;
const FORK_ANSWER_MS = 8000;
const INTERLUDE_MS = 7000;
const FORK_QUIET_MS = 3000;
const OLD_DUE_MAX_MS = 6000;

/** Riley: a made-up 26-year-old in Raleigh, no kids, worried about career and money. */
export function rileyProfile(): Profile {
  const p = profileOf({ firstName: "Riley", age: 26, city: "Raleigh", region: "NC", country: "US", line: "Not sure if I should stay at the agency or go freelance." });
  return { ...p, worries: { ...p.worries, career: 0.8, wealth: 0.6 }, money: { ...p.money, incomeUsd: 52000, savingsUsd: 85000, debtUsd: 0, assumed: false } };
}

export function simulatePace(o: PaceOpts): PaceResult {
  const profile = o.profile ?? rileyProfile();
  const start = profile.startYear;
  const state: SessionState = {
    sessionId: profile.sessionId, phase: "playing", speed: "1x", profile, appearance: null, portraits: [], settings: [], nudges: [],
    decisions: [], answers: [], years: [], playhead: { year: start, age: profile.age, paused: false }, branches: [], log: [], status: null,
    budgets: { smallLeft: 0, bigLeft: 0 }, endAge: 70, verdictAtEnd: null, updatedAt: TODAY.toISOString(),
  };
  const slots: DecisionSlot[] = planSlotsFor(state);
  const decisions: Pick<Decision, "kind" | "year" | "status">[] = [];
  let t = 0;
  let ph = start;
  let phase: "playing" | "deciding" | "interlude" = "playing";
  let forkUntil = 0;
  let resumedAt = -1e9;
  let progress = 0;
  let smallAt = -1e9;
  // fake writer
  let queue = 0;
  // batches in flight; one written for an old context doesn't block a fresh one
  let batches: { done: number; ctx: number }[] = [];
  let ctx = 0;
  let followUpAt: number | null = null;
  let answers = 0;
  // the open card
  let openSince: number | null = null;
  let maxOpen = 0;
  // smallDue (agent -> client)
  let smallDue = false;
  let oldDueUntil = 0;
  let holdSince: number | null = null;
  const skipped = new Set<string>();
  let forks = 0;
  let waited = 0;
  const shown = new Map<number, number>();

  const view = (): PaceView => ({ speed: "1x", ph, slots, decisions: decisions as Decision[], skipped, quiet: phase !== "playing" || t - resumedAt < FORK_QUIET_MS });
  const nextFork = () => {
    let y = Infinity;
    for (const d of decisions) if (d.kind === "big" && d.status === "pending") y = Math.min(y, d.year);
    slots.forEach((sl, i) => {
      const idx = slots.filter((x, j) => j < i && x.kind === sl.kind && x.year === sl.year).length;
      if (sl.kind === "big" && sl.year >= ph && !slotDone({ decisions: decisions as Decision[], skipped }, sl, idx)) y = Math.min(y, sl.year);
    });
    return y;
  };
  const upcomingSmall = () => {
    const nf = nextFork();
    const lookahead = o.policy === "old" ? 1 : 0;
    return slots.filter((sl, i) => {
      const idx = slots.filter((x, j) => j < i && x.kind === sl.kind && x.year === sl.year).length;
      return sl.kind === "small" && sl.year >= ph && sl.year < nf + (lookahead ? 0 : 0) && !slotDone({ decisions: decisions as Decision[], skipped }, sl, idx);
    });
  };
  const refill = () => {
    const at = o.policy === "new" ? 3 : 2;
    const blocked = o.policy === "old" ? batches.length > 0 : batches.some((b) => b.ctx === ctx);
    // (the new agent also writes during the interlude, once the fork's context is in)
    if (blocked || (phase !== "playing" && !(o.policy === "new" && phase === "interlude")) || queue >= at) return;
    if (upcomingSmall().length <= queue) return;
    batches.push({ done: t + o.batchMs, ctx });
  };
  const dropQueue = () => {
    ctx++;
    queue = 0;
  };
  const pending = () => decisions.some((d) => d.kind === "small" && d.status === "pending");
  const serve = (sl: DecisionSlot) => {
    if (followUpAt === null && queue > 0) {
      queue--;
      decisions.push({ kind: "small", year: sl.year, status: "pending" });
      shown.set(sl.year, (shown.get(sl.year) ?? 0) + 1);
      openSince = t;
      smallDue = false;
      oldDueUntil = 0;
      refill();
      return;
    }
    if (o.policy === "old" && sl.year <= ph && !smallDue) {
      smallDue = true;
      oldDueUntil = t + OLD_DUE_MAX_MS;
    }
    refill();
  };
  /** The old ensureDecisions (one year of lookahead, a fork's year quiet for 3 s). */
  const ensureOld = () => {
    if (phase !== "playing") return;
    let busy = pending();
    const forkOpen = nextFork();
    const lastFork = Math.max(...decisions.filter((d) => d.kind === "big" && d.status === "answered").map((d) => d.year), -Infinity);
    const seen = new Map<string, number>();
    for (const sl of slots) {
      const k = `${sl.kind}-${sl.year}`;
      const idx = seen.get(k) ?? 0;
      seen.set(k, idx + 1);
      if (sl.kind !== "small" || sl.year > ph + 1 || sl.year < ph) continue;
      if (slotDone({ decisions: decisions as Decision[] }, sl, idx)) continue;
      if (busy || forkOpen <= sl.year || sl.year < lastFork) continue;
      if (sl.year === lastFork && t - resumedAt < FORK_QUIET_MS) {
        busy = true;
        continue;
      }
      busy = true;
      serve(sl);
    }
  };
  const ensureNew = () => {
    if (!pending()) {
      const due = dueSmall(view());
      if (due) serve(due.sl);
    }
    const owed = !pending() ? owedThisYear(view()) : 0;
    smallDue = owed > 0;
    if (!owed || phase !== "playing") holdSince = null;
    else {
      holdSince ??= t;
      if (t - holdSince >= SMALL_GIVEUP_MS) {
        slots.forEach((sl, i) => {
          const idx = slots.filter((x, j) => j < i && x.kind === sl.kind && x.year === sl.year).length;
          if (sl.kind === "small" && sl.year === ph && !slotDone({ decisions: decisions as Decision[], skipped }, sl, idx)) skipped.add(`small-${sl.year}-${idx}`);
        });
        holdSince = null;
        smallDue = false;
      }
    }
  };
  const ensure = () => (o.policy === "old" ? ensureOld() : ensureNew());

  // The first fork ("today") is answered before the life plays.
  for (const sl of slots) if (sl.kind === "big" && sl.year === start) decisions.push({ kind: "big", year: start, status: "answered" });
  resumedAt = 0;
  forks = decisions.length;

  const endYear = start + o.years;
  // Like the agent, the policy runs on events only (an answer, a batch or follow-up landing, life
  // resuming, the fork's quiet moment ending, a year ending; the new policy's give-up check every 5 s).
  let dirty = true;
  let quietAt: number | null = null;
  let nextCheck = SMALL_GIVEUP_MS / 5;
  while (ph < endYear && t < 3_600_000) {
    t += DT;
    // writer
    for (const b of batches.filter((x) => t >= x.done)) {
      if (b.ctx === ctx) queue += Math.min(4, Math.max(0, upcomingSmall().length - queue));
      dirty = true;
    }
    batches = batches.filter((x) => t < x.done);
    if (followUpAt !== null && t >= followUpAt) {
      followUpAt = null;
      queue++;
      dirty = true;
    }
    if (quietAt !== null && t >= quietAt) {
      quietAt = null;
      dirty = true;
    }
    if (o.policy === "new" && t >= nextCheck) {
      nextCheck = t + SMALL_GIVEUP_MS / 5;
      dirty = true;
    }
    if (o.policy === "old" && smallDue && t >= oldDueUntil) smallDue = false;
    // fork
    if (phase === "deciding" && t >= forkUntil) {
      const f = decisions.find((d) => d.kind === "big" && d.status === "pending");
      if (f) f.status = "answered";
      phase = "interlude";
      forkUntil = t + INTERLUDE_MS;
      dropQueue();
      dirty = true;
    } else if (phase === "interlude" && t >= forkUntil) {
      phase = "playing";
      resumedAt = t;
      quietAt = t + FORK_QUIET_MS + 50;
      dirty = true;
    }
    if (phase === "playing") {
      const due = decisions.find((d) => d.kind === "big" && d.status === "pending" && d.year <= ph);
      if (due && !pending()) {
        phase = "deciding";
        forkUntil = t + FORK_ANSWER_MS;
        forks++;
      }
    }
    // user
    const open = decisions.filter((d) => d.kind === "small" && d.status === "pending");
    maxOpen = Math.max(maxOpen, open.length);
    if (open.length && openSince !== null && t - openSince >= o.answerMs) {
      open[0]!.status = "answered";
      openSince = null;
      answers++;
      dirty = true;
      if (answers % (o.dropEvery ?? 4) === 0) {
        dropQueue();
        followUpAt = t + 5000;
      }
    }
    if (dirty) {
      dirty = false;
      ensure();
      refill();
    }
    // client clock
    const smallOpen = pending();
    if (smallOpen) smallAt = t;
    const playing = phase === "playing";
    const scale = playing ? (smallOpen ? SMALL_DECISION_SCALE : 1) : 0;
    progress += (DT / 1000) * scale / SPEED_CONFIG["1x"].secondsPerYear;
    if (progress >= 1 && playing) {
      const hold = holdsYearEnd({ speed: "1x", smallOpen, smallDue, nextYear: ph + 1, nextFork: nextFork(), msSinceSmall: t - smallAt });
      if (hold) {
        progress = 1;
        if (!smallOpen) waited += DT;
      }
      else {
        // tick: a fork slot's card is written by the time the playhead reaches it
        ph++;
        progress = 0;
        smallDue = false;
        for (const sl of slots) if (sl.kind === "big" && sl.year === ph && !decisions.some((d) => d.kind === "big" && d.year === ph)) decisions.push({ kind: "big", year: ph, status: "pending" });
        ensure();
      }
    }
  }

  const perYear = new Map<number, [number, number]>();
  for (let y = start; y < endYear; y++) perYear.set(y, [slots.filter((s) => s.kind === "small" && s.year === y).length, shown.get(y) ?? 0]);
  let planned = 0;
  let total = 0;
  for (const [, [p, s]] of perYear) (planned += p), (total += s);
  return { perYear, shown: total, planned, maxOpen, seconds: Math.round(t / 1000), waitedSeconds: Math.round(waited / 1000), forks };
}

function table(r: PaceResult): string {
  return [...r.perYear].map(([y, [p, s]]) => `${y}: ${s}/${p}`).join("  ");
}

if (process.argv[1]?.endsWith("pace-sim.ts")) {
  for (const [answerMs, batchMs, dropEvery] of [
    [8000, 9000, 4],
    [4000, 9000, 4],
    [12000, 14000, 2],
    [10000, 18000, 1],
  ] as const) {
    console.log(`\nanswers take ${answerMs / 1000} s, a batch ${batchMs / 1000} s, the queue drops every ${dropEvery} answer(s) (shown/planned per year, 10 years from 26)`);
    for (const policy of ["old", "new"] as const) {
      const r = simulatePace({ policy, years: 10, answerMs, batchMs, dropEvery });
      console.log(`  ${policy}: ${r.shown} of ${r.planned} planned, ${r.forks} forks, max open ${r.maxOpen}, ${(r.seconds / 60).toFixed(1)} min (${r.waitedSeconds} s waiting on the writer)\n    ${table(r)}`);
    }
  }
}
