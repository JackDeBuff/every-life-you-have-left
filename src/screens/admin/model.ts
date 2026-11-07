/** Formatting and the derived view of one session (pure, no React). */
import { displayCurrency, formatMoney, usdHint, type CurrencyCode } from "../../../shared/currency";
import type { Quote } from "../../../shared/schema";
import type { Branch, Decision, DecisionAnswer, SimYear } from "../../../shared/sim";
import type { WarmQuestion } from "../../../worker/agent/protocol";
import type { AgentState, ChecksResponse, D1Answer, DetailResponse, Violation } from "./types";

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/** D1 writes "2026-11-07 15:22:03" (UTC, no zone); the agent writes ISO. */
export function toDate(t: string | null | undefined): Date | null {
  if (!t) return null;
  const d = new Date(t.includes("T") ? t : `${t.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const LIVE_MS = 2 * 60_000;
export const isLive = (updated: string | null | undefined, now = Date.now()) => {
  const d = toDate(updated);
  return !!d && now - d.getTime() < LIVE_MS;
};

export function ago(t: string | Date | null | undefined, now = Date.now()): string {
  const d = t instanceof Date ? t : toDate(t);
  if (!d) return "—";
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function clock(t: string | Date | null | undefined): string {
  const d = t instanceof Date ? t : toDate(t);
  return d ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
}

export function dayTime(t: string | Date | null | undefined): string {
  const d = t instanceof Date ? t : toDate(t);
  return d ? `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : "—";
}

export function dur(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// ---------------------------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------------------------

export const money = (usd: number | null | undefined, code: CurrencyCode, short = false) => (usd === null || usd === undefined ? "—" : formatMoney(usd, code, short));
export const moneyTitle = (usd: number | null | undefined, code: CurrencyCode) => (usd === null || usd === undefined ? undefined : usdHint(usd, code) ?? undefined);
export const cost = (usd: number | null | undefined) => (usd === null || usd === undefined ? "—" : usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`);

// ---------------------------------------------------------------------------------------------
// The session view
// ---------------------------------------------------------------------------------------------

export interface QuoteInfo {
  quote: Quote;
  /** "start line", "warm-up · fear", "CV", "answer · d-34-1 (big)", ... */
  from: string;
}

export interface DecisionRow {
  kind: "warm" | "small" | "big";
  id: string;
  year: number | null;
  age: number | null;
  prompt: string;
  whyAsking: string;
  whyQuoteId: string | null;
  options: Decision["options"];
  placeholder: string;
  status: string;
  decision: Decision | null;
  warm: WarmQuestion | null;
  answer: { optionId: string | null; text: string | null; via: string; quoteId: string | null; at: string | null; slid: boolean } | null;
  written: string | null;
  /** ms since the answer before it (any decision or warm-up question). */
  gapMs: number | null;
}

export interface SessionView {
  id: string;
  st: AgentState;
  detail: DetailResponse;
  currency: CurrencyCode;
  years: SimYear[];
  yearOf: Map<number, SimYear>;
  rows: DecisionRow[];
  rowOf: Map<string, DecisionRow>;
  answerOf: Map<string, DecisionAnswer>;
  quotes: Map<string, QuoteInfo>;
  branchesOf: Map<string, Branch[]>;
  /** Violations by anchor: "y-2031", "d-<id>", "e-<eventId>", "b-<branchId>", "ending". */
  violationsAt: Map<string, Violation[]>;
  playheadYear: number;
  forkYears: Set<number>;
}

const WARM_LABEL: Record<string, string> = { now: "now", crossroads: "crossroads", people: "people", fear: "fear", unjudged: "unjudged" };

export function quoteSourceLabels(st: AgentState, d1Answers: D1Answer[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const q of st.warmup?.questions ?? []) if (q.answer?.quoteId) m.set(q.answer.quoteId, `warm-up · ${WARM_LABEL[q.key] ?? q.key}`);
  for (const a of d1Answers) if (a.quote_id && a.decision_id.startsWith("w-") && !m.has(a.quote_id)) m.set(a.quote_id, `warm-up · ${a.decision_id.slice(2)}`);
  const kindOf = new Map(st.decisions.map((d) => [d.id, d.kind]));
  for (const a of st.answers) if (a.quoteId && !m.has(a.quoteId)) m.set(a.quoteId, `answer · ${a.decisionId}${kindOf.get(a.decisionId) ? ` (${kindOf.get(a.decisionId)})` : ""}`);
  return m;
}

export function quoteFrom(q: Quote, labels: Map<string, string>, st: AgentState): string {
  const l = labels.get(q.id);
  if (l) return l;
  if (q.source === "cv") return "CV";
  if (q.source === "linkedin") return "LinkedIn";
  if (q.source === "ai_export") return "AI export";
  if (q.source === "pause") return "pause";
  if (q.questionId === "start") return "start line";
  if (q.questionId?.startsWith("w-")) return `warm-up · ${q.questionId.slice(2)}`;
  if (q.questionId) {
    const d = st.decisions.find((x) => x.id === q.questionId);
    return `answer · ${q.questionId}${d ? ` (${d.kind})` : ""}`;
  }
  return q.source;
}

export function anchorFor(at: Violation["at"]): string {
  if (at.tab === "ending") return "ending";
  if (at.branchId && at.tab === "lives") return `b-${at.branchId}`;
  if (at.decisionId) return `d-${at.decisionId}`;
  if (at.eventId) return `e-${at.eventId}`;
  if (at.year !== undefined) return `y-${at.year}`;
  return at.tab;
}

export function buildView(detail: DetailResponse, checks: ChecksResponse | null): SessionView | null {
  const st = detail.live;
  if (!st) return null;
  const years = [...st.years].sort((a, b) => a.year - b.year);
  const yearOf = new Map(years.map((y) => [y.year, y]));
  const answerOf = new Map(st.answers.map((a) => [a.decisionId, a]));
  const labels = quoteSourceLabels(st, detail.answers);
  const quotes = new Map((st.profile?.quotes ?? []).map((q) => [q.id, { quote: q, from: quoteFrom(q, labels, st) }]));
  const d1Ans = new Map<string, D1Answer>();
  for (const a of detail.answers) d1Ans.set(a.decision_id, a);

  const rows: DecisionRow[] = [];
  // the warm-up, in ask order (answered/skipped first by time, then the rest)
  const warm = [...(st.warmup?.questions ?? [])];
  for (const q of warm) {
    const a = q.answer;
    const d1 = d1Ans.get(q.id);
    rows.push({
      kind: "warm", id: q.id, year: st.profile?.startYear ?? null, age: st.profile?.age ?? null,
      prompt: q.prompt, whyAsking: q.whyAsking, whyQuoteId: q.whyQuoteId, options: q.options, placeholder: q.placeholder, status: q.status, decision: null, warm: q,
      answer: a ? { optionId: a.optionId, text: a.text, via: a.via, quoteId: a.quoteId, at: a.at, slid: false } : d1 ? { optionId: d1.option_id, text: d1.text, via: d1.via, quoteId: d1.quote_id, at: d1.created_at, slid: false } : null,
      written: null, gapMs: null,
    });
  }
  if (!warm.length)
    for (const a of detail.answers.filter((x) => x.decision_id.startsWith("w-")))
      rows.push({
        kind: "warm", id: a.decision_id, year: st.profile?.startYear ?? null, age: st.profile?.age ?? null, prompt: `(warm-up "${a.decision_id.slice(2)}": the question text isn't stored for this session)`,
        whyAsking: "", whyQuoteId: null, options: [], placeholder: "", status: "answered", decision: null, warm: null,
        answer: { optionId: a.option_id, text: a.text, via: a.via, quoteId: a.quote_id, at: a.created_at, slid: false }, written: null, gapMs: null,
      });
  const ord = new Map(st.decisions.map((d, i) => [d.id, i]));
  const decs = [...st.decisions].sort((a, b) => a.year - b.year || (detail.decisionTimes[a.id]?.created ?? "").localeCompare(detail.decisionTimes[b.id]?.created ?? "") || ord.get(a.id)! - ord.get(b.id)!);
  for (const d of decs) {
    const a = answerOf.get(d.id);
    const d1 = d1Ans.get(d.id);
    rows.push({
      kind: d.kind, id: d.id, year: d.year, age: d.age, prompt: d.prompt, whyAsking: d.whyAsking, whyQuoteId: d.whyQuoteId, options: d.options, placeholder: d.placeholder, status: d.status, decision: d, warm: null,
      answer: a ? { optionId: a.optionId, text: a.text, via: a.via, quoteId: a.quoteId, at: a.answeredAt, slid: d.status === "slid" || !!d1?.slid } : d1 ? { optionId: d1.option_id, text: d1.text, via: d1.via, quoteId: d1.quote_id, at: d1.created_at, slid: !!d1.slid } : null,
      written: detail.decisionTimes[d.id]?.created ?? null, gapMs: null,
    });
  }
  // gap since the previous answer, in answer order
  const answered = rows.filter((r) => r.answer?.at).sort((a, b) => toDate(a.answer!.at)!.getTime() - toDate(b.answer!.at)!.getTime());
  answered.forEach((r, i) => {
    const prev = answered[i - 1];
    if (prev) r.gapMs = toDate(r.answer!.at)!.getTime() - toDate(prev.answer!.at)!.getTime();
  });

  const branchesOf = new Map<string, Branch[]>();
  for (const b of st.branches) branchesOf.set(b.forkDecisionId, [...(branchesOf.get(b.forkDecisionId) ?? []), b]);

  const violationsAt = new Map<string, Violation[]>();
  for (const v of checks?.violations ?? []) {
    const keys = new Set([anchorFor(v.at)]);
    if (v.at.year !== undefined && v.at.tab === "life") keys.add(`y-${v.at.year}`);
    for (const k of keys) violationsAt.set(k, [...(violationsAt.get(k) ?? []), v]);
  }

  return {
    id: st.sessionId || detail.session.id,
    st,
    detail,
    currency: displayCurrency(st.profile),
    years,
    yearOf,
    rows,
    rowOf: new Map(rows.map((r) => [r.id, r])),
    answerOf,
    quotes,
    branchesOf,
    violationsAt,
    playheadYear: st.playhead.year,
    forkYears: new Set(st.decisions.filter((d) => d.kind === "big").map((d) => d.year)),
  };
}

export const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export const OPTION_KEYS = ["A", "B", "C", "D", "E", "F"];
export const keyOf = (optionId: string | null | undefined, options: { id: string }[]) => {
  const i = options.findIndex((o) => o.id === optionId);
  return i >= 0 ? OPTION_KEYS[i]! : optionId ?? "";
};
