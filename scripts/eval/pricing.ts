/**
 * Token prices (USD per 1M tokens, research/04 §1, Agent Platform standard tier, ≤200K prompt).
 * Thinking tokens bill as output. gpt-oss-120b MaaS price is our estimate (not in research/04).
 */
import type { UsageEvent } from "../../worker/engine";
import { costOf } from "../../worker/engine/pricing";

export { PRICES, costOf } from "../../worker/engine/pricing";

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
