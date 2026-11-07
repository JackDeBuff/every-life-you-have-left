/** Small deterministic helpers for the mock engine. */
export type Rng = () => number;

export function hash(...parts: (string | number)[]): number {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x9e3779b9;
  }
  return h >>> 0;
}

export function rngFrom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length]!;
export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
