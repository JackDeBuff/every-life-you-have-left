/**
 * The life clock. Time is the only thing in the UI that moves linearly (docs/UI.md §6).
 * Runs on gsap.ticker, advances a fractional year, eases its own time scale (the "clock slows"
 * for small decisions), and calls sim.tick(year) when a year completes.
 */
import { SPEED_CONFIG } from "../../shared/sim";
import { gsap } from "./motion";
import { sim } from "./session";

type Listener = (yearFloat: number, scale: number) => void;

class LifeClock {
  private progress = 0;
  private scale = 0;
  private awaiting: number | null = null;
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
    gsap.ticker.remove(this.frame);
  }
  reset() {
    this.progress = 0;
    this.scale = 0;
    this.awaiting = null;
    this.holds.clear();
  }
  /** UI choreographies (fork moment) hold the clock while they play. */
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

  private frame = (_t: number, dtMs: number) => {
    const s = sim();
    if (s.phase === "start") return;
    if (this.awaiting !== null && s.playhead.year >= this.awaiting) {
      this.awaiting = null;
      this.progress = 0;
    }
    const smallPending = s.decisions.some((d) => d.kind === "small" && d.status === "pending");
    const running = s.phase === "playing" && !s.playhead.paused && this.holds.size === 0 && this.awaiting === null && !document.hidden;
    const target = running ? (smallPending ? 0.25 : 1) : 0;
    const k = Math.min(1, dtMs / (target < this.scale ? 260 : 600));
    this.scale += (target - this.scale) * k;
    if (Math.abs(this.scale - target) < 0.002) this.scale = target;
    const spy = SPEED_CONFIG[s.speed].secondsPerYear;
    if (running || this.scale > 0) this.progress += ((Math.min(dtMs, 250) / 1000) * this.scale) / spy;
    if (this.progress >= 1 && this.awaiting === null) {
      this.progress = 1;
      this.awaiting = s.playhead.year + 1;
      void s.tick(this.awaiting);
    }
    const yf = s.playhead.year + Math.min(this.progress, 0.999);
    for (const fn of this.listeners) fn(yf, this.scale);
  };
}

export const clock = new LifeClock();
