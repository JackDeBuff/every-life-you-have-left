/**
 * Token prices (USD per 1M tokens, research/04 §1, Agent Platform standard tier, ≤200K prompt).
 * Thinking tokens bill as output. gpt-oss-120b MaaS price is our estimate (not in research/04).
 * Shared by the eval (scripts/eval/pricing.ts) and the session agent's per-session cost tally.
 */
// Checked against GCP Billing (SKU report, Sat Nov 7): 3.8/3.6 Flash and Argon bill at twice the
// research/04 figures we started with, so per-session costs before this date read ~half the truth.
export const PRICES: Record<string, { in: number; out: number; note?: string }> = {
  "gemini-3.8-flash": { in: 1.5, out: 7.5 },
  "gemini-3.6-flash": { in: 1.5, out: 7.5 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-4-argon": { in: 4.0, out: 20.0 },
  "openai/gpt-oss-120b-maas": { in: 0.15, out: 0.6, note: "estimate" },
};

/**
 * Implicit-cache hits (usageMetadata.cachedContentTokenCount) bill at a discount. ASSUMPTION: 10%
 * of the input price, Google's published implicit-cache discount for Gemini 2.5+ (research/04 has
 * no cache price for the 3.x models). costOf(u, { cache: false }) gives the list price.
 */
export const CACHED_INPUT_FACTOR = 0.1;

/**
 * Grounding with Google Search on Gemini 3.x bills per search query the model runs. ASSUMPTION:
 * $14 per 1,000 queries (Agent Platform list price for Gemini 3 grounding; check GCP Billing).
 */
export const SEARCH_QUERY_USD = 0.014;

export function costOf(
  u: { model: string; inputTokens: number; outputTokens: number; thoughtTokens: number; cachedTokens?: number; searchQueries?: number },
  opts: { cache?: boolean } = {},
): number {
  const p = PRICES[u.model] ?? { in: 2, out: 10 };
  const cached = opts.cache === false ? 0 : Math.min(u.inputTokens, u.cachedTokens ?? 0);
  return ((u.inputTokens - cached) * p.in + cached * p.in * CACHED_INPUT_FACTOR + (u.outputTokens + u.thoughtTokens) * p.out) / 1_000_000 + (u.searchQueries ?? 0) * SEARCH_QUERY_USD;
}
