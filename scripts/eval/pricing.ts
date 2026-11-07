/**
 * Token prices (USD per 1M tokens, research/04 §1, Agent Platform standard tier, ≤200K prompt).
 * Thinking tokens bill as output. gpt-oss-120b MaaS price is our estimate (not in research/04).
 */
import type { UsageEvent } from "../../worker/engine";

export const PRICES: Record<string, { in: number; out: number; note?: string }> = {
  "gemini-3.8-flash": { in: 0.75, out: 3.75 },
  "gemini-3.6-flash": { in: 0.75, out: 3.75 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 },
  "gemini-4-argon": { in: 2.0, out: 10.0, note: "until Nov 30, then double" },
  "openai/gpt-oss-120b-maas": { in: 0.15, out: 0.6, note: "estimate" },
};

export function costOf(u: Pick<UsageEvent, "model" | "inputTokens" | "outputTokens" | "thoughtTokens">): number {
  const p = PRICES[u.model] ?? { in: 2, out: 10 };
  return (u.inputTokens * p.in + (u.outputTokens + u.thoughtTokens) * p.out) / 1_000_000;
}

export class BudgetExceeded extends Error {}

/**
 * Global spend ledger: every call in the eval is added here. The runner calls check() between
 * steps (throwing from inside a model call would be swallowed by the engine's fallbacks).
 */
export class Ledger {
  spent = 0;
  calls = 0;
  constructor(readonly capUsd: number) {}
  add(u: UsageEvent): number {
    const c = costOf(u);
    this.spent += c;
    this.calls++;
    return c;
  }
  check() {
    if (this.spent > this.capUsd) throw new BudgetExceeded(`eval budget exceeded: $${this.spent.toFixed(2)} > $${this.capUsd}`);
  }
}
