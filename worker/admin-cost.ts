/**
 * Corrected cost for sessions tallied at the old prices (/admin; shared by worker/admin.ts and
 * src/screens/admin/). No worker-only imports: the browser build reads this file too.
 *
 * Until production 627b35b1 (2026-11-07T20:46Z) worker/engine/pricing.ts priced 3.8 / 3.6 Flash at
 * $0.75 / $3.75 per 1M tokens, half what GCP Billing charged ($1.50 / $7.50). Flash-Lite was right
 * ($0.30 / $2.50). A session's stored `usage` keeps tokens per purpose (`detail`) but no model, so
 * the correction works per purpose:
 *   - fast purposes (always Flash-Lite): recorded as is.
 *   - heavy and mixed purposes ("years" runs on 3.8 Flash at 1x/2x and after forks, on Flash-Lite at
 *     auto/4x and in the backup writer; the warm-up's quick engine runs heavy purposes on Flash-Lite):
 *     the recorded USD sits between "all these tokens at the old heavy price" and "all at the
 *     Flash-Lite price", which gives the heavy share; that share is re-priced at the real rate.
 *   - unknown purposes, or no token detail: x2 for heavy / unknown, x1 for fast.
 * Media (portraits, voice, transcription) was never in a session's usage; it is not added here.
 */
import { CACHED_INPUT_FACTOR, PRICES } from "./engine/pricing";
import type { SessionUsage } from "./agent/protocol";

/** When production started pricing at the GCP Billing rates (version 627b35b1). */
export const PRICES_FIXED_AT = "2026-11-07T20:46:00Z";

/** The heavy-model prices used before PRICES_FIXED_AT (USD per 1M tokens). */
const OLD_HEAVY = { in: 0.75, out: 3.75 };
const HEAVY = PRICES["gemini-3.8-flash"] ?? { in: 1.5, out: 7.5 };
const LITE = PRICES["gemini-3.5-flash-lite"] ?? { in: 0.3, out: 2.5 };

type Tier = "heavy" | "fast" | "mixed";

/** Which model each purpose runs on (worker/engine/*: the `tier` of each call; engine-select.ts for the backup / quick engines). */
const PURPOSE_TIER: Record<string, Tier> = {
  "profile.start": "heavy",
  "profile.enrich": "heavy",
  "decision.big": "mixed", // heavy, then the fast tier on a retry; the warm-up's quick engine writes it on Flash-Lite
  "chat.self": "heavy",
  "chat.interviewer": "heavy",
  settings: "heavy",
  ending: "heavy",
  "years.repair": "heavy",
  "branch.fine": "heavy",
  years: "mixed", // yearsBySpeed: Flash-Lite at auto/4x, 3.8 Flash at 1x/2x and for the fork lead years
  "decision.small": "mixed", // fast, fast, then heavy as the last try
  "decision.smallBatch": "fast",
  "answer.fold": "fast",
  "warmup.coverage": "fast",
  "warmup.fold": "fast",
  "warmup.personalize": "fast",
  interlude: "fast",
  safety: "fast",
  "profile.ground": "fast",
  "branch.coarse": "fast",
};

export const tierOf = (purpose: string): Tier | null => PURPOSE_TIER[purpose] ?? PURPOSE_TIER[purpose.split(".")[0] ?? ""] ?? null;

type Detail = { calls: number; usd: number; inTok: number; cachedTok: number; outTok: number };

const tokenCost = (d: Detail, p: { in: number; out: number }) => ((d.inTok - Math.min(d.inTok, d.cachedTok)) * p.in + Math.min(d.inTok, d.cachedTok) * p.in * CACHED_INPUT_FACTOR + d.outTok * p.out) / 1_000_000;

/** One purpose's cost at the real prices, from its tokens and what was recorded at the old ones. */
export function correctedDetail(purpose: string, d: Detail): { usd: number; how: "as recorded" | "heavy share re-priced" | "x2 (unmapped)" } {
  const tier = tierOf(purpose);
  if (tier === "fast") return { usd: d.usd, how: "as recorded" };
  if (!tier) return { usd: d.usd * 2, how: "x2 (unmapped)" };
  const hiOld = tokenCost(d, OLD_HEAVY);
  const lo = tokenCost(d, LITE);
  // share of these tokens that went to the heavy model, from where the recorded USD sits between the two
  const share = hiOld - lo > 1e-9 ? Math.min(1, Math.max(0, (d.usd - lo) / (hiOld - lo))) : tier === "heavy" ? 1 : 0.5;
  const hiNew = tokenCost(d, HEAVY);
  // recorded + the heavy part's missing half (heavy share at the real price minus what was recorded for it)
  return { usd: Math.max(d.usd, d.usd + share * (hiNew - hiOld)), how: "heavy share re-priced" };
}

export interface CostView {
  /** As stored in the session. */
  recorded: number;
  /** At the real prices (= recorded for sessions priced after PRICES_FIXED_AT). */
  corrected: number;
  /**
   * Priced at the old rates: "yes", or "partly" when the session went on after the fix (its later
   * calls were priced right, so the correction reads high: an upper bound).
   */
  oldRates: "no" | "yes" | "partly";
}

/** `startedAt` / `updatedAt`: the session's created / last-updated time (ISO or D1 "YYYY-MM-DD HH:MM:SS", UTC). */
export function sessionCost(u: SessionUsage | null | undefined, startedAt: string | null | undefined, updatedAt?: string | null): CostView | null {
  if (!u) return null;
  const t = (s: string | null | undefined) => (s ? Date.parse(s.includes("T") ? s : `${s.replace(" ", "T")}Z`) : NaN);
  const fixed = Date.parse(PRICES_FIXED_AT);
  const start = t(startedAt);
  const old = u.calls > 0 && Number.isFinite(start) && start < fixed;
  if (!old) return { recorded: u.usd, corrected: u.usd, oldRates: "no" };
  const upd = t(updatedAt);
  const oldRates = Number.isFinite(upd) && upd > fixed ? "partly" : "yes";
  // recorded + what each purpose was under-priced by (robust to a detail that doesn't sum to usd)
  let extra = 0;
  if (u.detail && Object.keys(u.detail).length) {
    for (const [k, d] of Object.entries(u.detail)) extra += correctedDetail(k, d).usd - d.usd;
  } else {
    for (const [k, usd] of Object.entries(u.byPurpose)) extra += tierOf(k) === "fast" ? 0 : usd;
  }
  return { recorded: u.usd, corrected: u.usd + Math.max(0, extra), oldRates };
}
