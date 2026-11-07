/**
 * "Here's what I learned" (D-090): during the warm-up the middle pane's log area shows each fact
 * and quote as it lands, with where it came from (your words / CV / LinkedIn / AI export / my
 * guess). Every item has an ×: it leaves the profile (sim().forget), and a covered warm-up answer
 * that's wrong gets asked instead. Newest first; nothing moves once it has landed.
 *
 * `compact` (phone): one quiet strip of the newest items above the card, inside the sheet.
 */
import { useMemo, useRef } from "react";
import type { DocKind } from "../../../shared/engine";
import type { Profile } from "../../../shared/schema";
import "../../styles/warmup.css";
import { Icon } from "../icons";
import { sim, useSim } from "../session";
import type { ForgetKind, WarmupState } from "../types";
import { knowDropNote, useUi } from "../uiStore";

type Src = "you" | DocKind | "docs" | "guess";
const SRC_LABEL: Record<Src, string> = { you: "Your words", cv: "CV", linkedin: "LinkedIn", ai_export: "AI export", docs: "Your uploads", guess: "My guess" };
const WARM_LABEL: Record<string, string> = { now: "Right now", crossroads: "On your mind", people: "Who has a say", fear: "Your 10-year fear", unjudged: "If nobody judged" };

export interface LearnedItem {
  key: string;
  kind: "quote" | "fact";
  label: string | null;
  text: string;
  src: Src;
  forget: { kind: ForgetKind; id: string } | null;
}

/** Everything the profile has learned so far, with its source. Pure. */
export function learnedItems(p: Profile | null, w: WarmupState | null | undefined): LearnedItem[] {
  if (!p) return [];
  const out: LearnedItem[] = [];
  const quoteSrc = new Map(p.quotes.map((q) => [q.id, q.source]));
  const docKinds = w?.docKinds ?? [];
  const srcOf = (ids: string[], prov: "answer" | "upload" | "inferred" | null): Src => {
    if (prov === "inferred") return "guess";
    const s = ids.map((id) => quoteSrc.get(id)).find((x) => x && x !== "pause");
    if (s === "cv" || s === "linkedin" || s === "ai_export") return s;
    if (s === "answer") return "you";
    if (prov === "upload") return docKinds.length === 1 ? docKinds[0]! : "docs";
    return "you";
  };
  const warmQuote = new Map<string, string>();
  for (const q of w?.questions ?? []) {
    if (q.answer?.quoteId) warmQuote.set(q.answer.quoteId, q.key);
    if (q.status === "covered" && q.covered)
      out.push({ key: `cov-${q.id}`, kind: "fact", label: WARM_LABEL[q.key] ?? null, text: q.covered.evidence, src: q.covered.by === "start" ? "you" : q.covered.by, forget: { kind: "warm", id: q.id } });
  }
  for (const q of p.quotes) {
    if (q.source === "pause") continue;
    const wk = warmQuote.get(q.id);
    const src: Src = q.source === "answer" ? "you" : q.source;
    out.push({ key: `q-${q.id}`, kind: "quote", label: wk ? (WARM_LABEL[wk] ?? null) : null, text: q.text, src, forget: { kind: "quote", id: q.id } });
  }
  for (const f of p.facts) {
    // The start screen's own fields (home) and the coverage check's evidence (shown above) aren't news.
    if (f.key === "location" && f.source !== "upload") continue;
    if (f.id.startsWith("fw")) continue;
    out.push({ key: `f-${f.label}-${f.value}`, kind: "fact", label: f.label, text: f.value, src: srcOf(f.quoteIds, f.source), forget: { kind: "fact", id: f.id } });
  }
  for (const x of p.people)
    out.push({ key: `p-${x.label}`, kind: "fact", label: x.label, text: x.expectation ?? x.relation, src: srcOf(x.quoteIds, null), forget: { kind: "person", id: x.id } });
  for (const f of p.fears) out.push({ key: `x-${f.text}`, kind: "fact", label: "Afraid of", text: f.text, src: srcOf(f.quoteIds, null), forget: { kind: "fear", id: f.id } });
  for (const pl of p.plans ?? []) out.push({ key: `pl-${pl.text}`, kind: "fact", label: String(pl.year), text: pl.text, src: srcOf(pl.quoteIds, null), forget: { kind: "plan", id: pl.id } });
  if (!p.money.assumed) out.push({ key: `m-${p.money.feel}`, kind: "fact", label: "Money", text: `feels ${p.money.feel}`, src: "you", forget: null });
  return out;
}

/** First time each item was seen (newest first, and old items never jump). */
function useArrivalOrder(items: LearnedItem[]): LearnedItem[] {
  const seen = useRef(new Map<string, number>());
  const n = useRef(0);
  return useMemo(() => {
    for (const it of items) if (!seen.current.has(it.key)) seen.current.set(it.key, n.current++);
    return [...items].sort((a, b) => (seen.current.get(b.key) ?? 0) - (seen.current.get(a.key) ?? 0));
  }, [items]);
}

export function Learned({ compact = false }: { compact?: boolean }) {
  const profile = useSim((s) => s.profile);
  const warmup = useSim((s) => s.warmup);
  const score = useSim((s) => s.profile?.knowMeScore ?? 0);
  const drop = knowDropNote(score, useUi((s) => s.knowDrop));
  const all = useMemo(() => learnedItems(profile, warmup), [profile, warmup]);
  const items = useArrivalOrder(all);
  const remove = (it: LearnedItem) => {
    if (!it.forget) return;
    useUi.getState().noteRemoval(score);
    void sim().forget(it.forget.kind, it.forget.id).catch(() => {});
  };

  if (compact) {
    if (!items.length) return null;
    return (
      <div className="learned-strip" aria-label="What I've learned so far">
        <span className="label">Learned · {items.length}</span>
        <ul>
          {items.slice(0, 6).map((it) => (
            <li key={it.key} className="lr-chip" data-src={it.src}>
              <span className={it.kind === "quote" ? "voice" : undefined}>{it.label && it.kind === "fact" ? `${it.label}: ` : ""}{it.text}</span>
              {it.forget && (
                <button type="button" className="lr-x" aria-label={`Remove “${it.text}”`} onClick={() => remove(it)}>
                  <Icon name="x" size={10} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section className="log learned" aria-label="Here's what I learned">
      <div className="log-head">
        <h3 className="label">Here's what I learned</h3>
        <span className="label faint">
          {items.length ? `${items.length} ${items.length === 1 ? "thing" : "things"}` : ""}
          {items.length ? " · " : ""}I know you {score}%{drop ? ` (${drop})` : ""}
        </span>
      </div>
      <div className="log-body scroll">
        {!items.length ? (
          <p className="log-empty small faint">What you tell me lands here. Your lives are built from it.</p>
        ) : (
          <p className="learned-note small faint">Your lives are built from this. Remove anything that's wrong.</p>
        )}
        <ul className="learned-list" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="learned-item" data-src={it.src} data-kind={it.kind}>
              <span className="lr-src">{SRC_LABEL[it.src]}</span>
              <p className="lr-text">
                {it.label && <span className="lr-label">{it.label}</span>}
                {it.kind === "quote" ? <span className="voice">“{it.text}”</span> : <span>{it.text}</span>}
              </p>
              {it.forget ? (
                <button type="button" className="lr-x" aria-label={`Remove “${it.text}” from what I know`} title="Remove: this is wrong" onClick={() => remove(it)}>
                  <Icon name="x" size={12} />
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
