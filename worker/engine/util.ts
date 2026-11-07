/** Small pure helpers shared by the engine (no I/O). */

/** FNV-1a 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic RNG (mulberry32) seeded from any string. */
export function rng(seed: string): () => number {
  let a = hash32(seed) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const clampInt = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
  return clamp(n, lo, hi);
};

export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
export const wordCount = (s: string | null | undefined) => (s ? words(s).length : 0);

/** Cut to at most n words, without trailing punctuation debris. */
export function truncateWords(s: string, n: number): string {
  const w = words(s);
  if (w.length <= n) return s.trim();
  return w.slice(0, n).join(" ").replace(/[,;:\-–—]+$/, "");
}

const DANGLING = /\s+(and|or|but|to|the|a|an|your|my|with|for|of|in|on|at|by|so)$/i;

/** Like truncateWords, but allows a little slack and cuts at a comma or a whole word, never on "and". */
export function truncateClean(s: string, n: number): string {
  const w = words(s);
  if (w.length <= n + 2) return s.trim();
  const head = w.slice(0, n + 2).join(" ");
  const comma = head.lastIndexOf(",");
  if (comma > head.length * 0.5) return head.slice(0, comma).trim();
  let out = w.slice(0, n).join(" ").replace(/[,;:\-–—]+$/, "");
  while (DANGLING.test(out)) out = out.replace(DANGLING, "");
  return out;
}

/** Split text into sentences, keeping the original wording verbatim. */
export function sentences(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return [];
  const parts = t.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)/g) ?? [t];
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Normalise for verbatim comparison (case, whitespace, curly quotes). */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32) || "setting";

export const usd = (n: number) => {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)}M`;
  if (a >= 1000) return `${sign}$${Math.round(a / 1000)}k`;
  return `${sign}$${Math.round(a)}`;
};

export function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export const uniq = <T>(arr: T[]) => [...new Set(arr)];

export function nowIso(now?: () => Date): string {
  return (now ? now() : new Date()).toISOString();
}

/** Short random id (Workers and node both have crypto.randomUUID). */
export const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);
