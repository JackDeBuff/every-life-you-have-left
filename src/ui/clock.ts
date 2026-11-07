/**
 * The life clock. Time is the only thing in the UI that moves linearly (docs/UI.md §6).
 * Runs on gsap.ticker, advances a fractional year at the speed's secondsPerYear, eases its own time
 * scale, and calls sim.tick(year) when a year completes. Rules:
 *  - runs only in phase "playing" and not paused; big decisions (phase "deciding") and the
 *    interlude stop it, and so do UI holds (the fork moment, a world moment's cinematic)
 *  - a pending small decision slows it to 0.25× (the card slides itself after smallTimeoutSec)
 *  - it never runs past `bufferedTo`: when the buffer is behind it waits at the year's end and
 *    reports `starved` (the world shows "life is thinking…")
 *  - the network round trip of a tick is hidden: time keeps accruing while the agent confirms
 *    the year (up to half a year), and an unconfirmed tick is re-sent
 */
import { create } from "zustand";
import { SPEED_CONFIG } from "../../shared/sim";
import { gsap } from "./motion";
import { sim } from "./session";

type Listener = (yearFloat: number, scale: number) => void;

/** UI-facing clock flags (React reads these; they change rarely). */
export const useClockUi = create<{ starved: boolean }>(() => ({ starved: false }));

const RETICK_MS = 1500;
const MAX_CARRY = 0.5;

class LifeClock {
  private progress = 0;
  private scale = 0;
  private awaiting: number | null = null;
  private sentAt = 0;
  private holds = new Set<string>();
  private listeners = new Set<Listener>();
  private running = false;

  start() {
    if (this.running) return;
    this.running = true;
    gsap.ticker.add(this.frame);
  }
  stop() {
    this.running = false;
    this.last = 0;
    gsap.ticker.remove(this.frame);
    this.setStarved(false);
  }
  reset() {
    this.progress = 0;
    this.scale = 0;
    this.awaiting = null;
    this.holds.clear();
    this.setStarved(false);
  }
  /** UI choreographies (fork moment, world moments) hold the clock while they play. */
  hold(key: string, on: boolean) {
    if (on) this.holds.add(key);
    else this.holds.delete(key);
  }
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  get timeScale() {
    return this.scale;
  }

  /**
   * The engine can schedule 2-3 small decisions a year at 2x/4x, and the card shows one at a time.
   * Small decisions from a year the playhead has left, that were never on screen (not the first
   * pending one), slide quietly so a backlog can't hold the clock at 0.25x for the rest of the life.
   */
  private slid = new Set<string>();
  private sweepSmall(s: ReturnType<typeof sim>) {
    const pending = s.decisions.filter((d) => d.status === "pending");
    const shown = pending[0]?.id;
    for (const d of pending) {
      if (d.kind !== "small" || d.id === shown || d.year >= s.playhead.year || this.slid.has(d.id)) continue;
      this.slid.add(d.id);
      void s.answer({ decisionId: d.id, optionId: null, text: null, via: "tap", slid: true }).catch(() => {});
    }
  }

  private setStarved(v: boolean) {
    if (useClockUi.getState().starved !== v) useClockUi.setState({ starved: v });
  }

  private last = 0;

  private frame = () => {
    // Real elapsed time, not gsap's lag-smoothed delta: a slow frame (a busy laptop, a throttled
    // pane) must not slow the life down. Capped so a stall can't skip more than a second.
    const now = performance.now();
    const dtMs = this.last ? Math.min(1000, now - this.last) : 16;
    this.last = now;
    const s = sim();
    if (s.phase === "start" || !s.profile) return;
    const year = s.playhead.year;
    if (this.awaiting !== null && year >= this.awaiting) {
      // Confirmed: keep the time that accrued during the round trip.
      this.progress = Math.max(0, Math.min(MAX_CARRY, this.progress - 1 - (year - this.awaiting)));
      this.awaiting = null;
    }
    const endYear = s.profile.startYear + (s.endAge - s.profile.age);
    const next = year + 1;
    // The last year may always be "ticked past": that is the end-of-life signal.
    const buffered = next > endYear || s.bufferedTo === null || s.bufferedTo >= next;
    const smallPending = s.decisions.some((d) => d.kind === "small" && d.status === "pending");
    this.sweepSmall(s);
    const playing = s.phase === "playing" && !s.playhead.paused && this.holds.size === 0 && !document.hidden;
    const target = playing ? (smallPending ? 0.25 : 1) : 0;
    const k = Math.min(1, dtMs / (target < this.scale ? 260 : 600));
    this.scale += (target - this.scale) * k;
    if (Math.abs(this.scale - target) < 0.002) this.scale = target;
    // Leaving a decision or an interlude starts a fresh year (no carried-over time).
    if (s.phase !== "playing" && this.awaiting === null) this.progress = 0;
    const spy = SPEED_CONFIG[s.speed].secondsPerYear;
    if (playing || this.scale > 0) this.progress += ((dtMs / 1000) * this.scale) / spy;

    let starved = false;
    if (this.progress >= 1) {
      if (this.awaiting === null) {
        if (buffered && s.phase === "playing") {
          this.awaiting = next;
          this.sentAt = performance.now();
          void s.tick(next).catch(() => {});
        } else {
          this.progress = 1;
          starved = playing && !buffered;
        }
      } else {
        this.progress = Math.min(this.progress, 1 + MAX_CARRY);
        if (performance.now() - this.sentAt > RETICK_MS && s.phase === "playing") {
          // The agent may have refused (buffer, gate) or the frame got lost: ask again.
          this.sentAt = performance.now();
          void s.tick(this.awaiting).catch(() => {});
          starved = playing;
        }
      }
    }
    // The agent also says when it is behind (start, forks, the ending).
    this.setStarved(starved || (s.phase === "playing" && s.thinking && year < endYear) || (s.phase === "playing" && this.awaiting !== null && performance.now() - this.sentAt > RETICK_MS));
    const yf = year + Math.min(this.progress, 0.999);
    for (const fn of this.listeners) fn(yf, this.scale);
  };
}

export const clock = new LifeClock();
