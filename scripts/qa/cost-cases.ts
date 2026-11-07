/** /admin's corrected cost for sessions priced at the old rates (worker/admin-cost.ts). Made-up tallies. */
import { correctedDetail, sessionCost } from "../../worker/admin-cost";
import type { SessionUsage } from "../../worker/agent/protocol";
import type { CodeCase } from "./code-cases";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
// 10k in / 2k out: $0.015 at the old heavy price, $0.030 at the real one, $0.008 on Flash-Lite
const tok = { calls: 1, inTok: 10_000, cachedTok: 0, outTok: 2_000 };
const BEFORE = "2026-11-07 18:00:00";
const AFTER = "2026-11-07 23:00:00";
const usage = (detail: SessionUsage["detail"]): SessionUsage => ({
  usd: Object.values(detail ?? {}).reduce((n, d) => n + d.usd, 0),
  calls: 3,
  byPurpose: {},
  detail,
});

export const COST_CASES: CodeCase[] = [
  {
    name: "a heavy purpose recorded at the old price doubles",
    run: () => {
      const r = correctedDetail("profile.start", { ...tok, usd: 0.015 });
      return { pass: near(r.usd, 0.03), detail: `${r.usd.toFixed(4)} (${r.how})` };
    },
  },
  {
    name: "years written on Flash-Lite (auto) stay as recorded; half heavy re-prices only that half",
    run: () => {
      const lite = correctedDetail("years", { ...tok, usd: 0.008 });
      const half = correctedDetail("years", { calls: 2, inTok: 20_000, cachedTok: 0, outTok: 4_000, usd: 0.023 });
      return { pass: near(lite.usd, 0.008) && near(half.usd, 0.038), detail: `lite ${lite.usd.toFixed(4)}, half ${half.usd.toFixed(4)}` };
    },
  },
  {
    name: "fast purposes as recorded, an unmapped purpose x2",
    run: () => {
      const f = correctedDetail("decision.smallBatch", { ...tok, usd: 0.008 });
      const u = correctedDetail("mystery.purpose", { ...tok, usd: 0.01 });
      return { pass: near(f.usd, 0.008) && near(u.usd, 0.02), detail: `fast ${f.usd}, unmapped ${u.usd} (${u.how})` };
    },
  },
  {
    name: "sessions: before the fix corrected, after it as recorded, across it 'partly'",
    run: () => {
      const u = usage({ "profile.start": { ...tok, usd: 0.015 }, "answer.fold": { ...tok, usd: 0.008 } });
      const old = sessionCost(u, BEFORE, BEFORE);
      const fresh = sessionCost(u, AFTER, AFTER);
      const across = sessionCost(u, BEFORE, AFTER);
      const pass = old?.oldRates === "yes" && near(old.corrected, 0.038) && fresh?.oldRates === "no" && near(fresh.corrected, u.usd) && across?.oldRates === "partly" && sessionCost(null, BEFORE) === null;
      return { pass, detail: `old ${old?.corrected.toFixed(4)} · new ${fresh?.corrected.toFixed(4)} · across ${across?.oldRates}` };
    },
  },
  {
    name: "no token detail: x2 for heavy purposes, x1 for fast",
    run: () => {
      const r = sessionCost({ usd: 0.05, calls: 4, byPurpose: { ending: 0.03, safety: 0.02 } }, BEFORE, BEFORE);
      return { pass: !!r && near(r.corrected, 0.08), detail: `${r?.corrected}` };
    },
  },
];
