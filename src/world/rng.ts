/** Deterministic randomness: the same place always builds the same island. */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Rng {
  (): number;
  range(a: number, b: number): number;
  int(a: number, b: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  fork(salt: string): Rng;
}

export function rng(seed: number | string): Rng {
  let a = typeof seed === "number" ? seed >>> 0 : hashString(seed);
  const next = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  next.range = (lo, hi) => lo + (hi - lo) * next();
  next.int = (lo, hi) => Math.floor(next.range(lo, hi + 1));
  next.pick = (xs) => xs[Math.floor(next() * xs.length) % xs.length]!;
  next.chance = (p) => next() < p;
  next.fork = (salt) => rng((a ^ hashString(salt)) >>> 0);
  return next;
}
