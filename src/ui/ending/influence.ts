/**
 * "Your words did this" (D-013 made visible on the ending): which of the user's own sentences moved
 * their life the most. Pure: reads the session, returns up to three quotes, each with the 1-3
 * turning points it caused.
 *
 * Credit:
 *   a fork you answered in your own words   3  (your sentence chose the life)
 *   a fork asked because of something you said  2
 *   a turning point that cites the quote     1
 *   an ordinary event that cites it          0.5
 * Only the chosen life counts: those are the years you lived (and can open on the ending).
 */
import type { DomainKey } from "../../../shared/domains";
import type { Quote } from "../../../shared/schema";
import type { ClientState } from "../types";

export interface Consequence {
  key: string;
  year: number;
  age: number;
  title: string;
  kind: "fork" | "event";
  weight: number;
  domain: DomainKey | null;
  /** The life event's id (events) or the decision id (forks). */
  refId: string;
}

export interface Influence {
  quote: Quote;
  /** Verbatim: the whole sentence, or its verbatim short form when the sentence is very long. */
  text: string;
  score: number;
  /** All turning points that cite this quote (the list shows the top 1-3). */
  count: number;
  consequences: Consequence[];
  /** When they said it: "The first thing you told me", "At 31, at a fork", … */
  when: string;
}

const LONG = 190;

type S = Pick<ClientState, "profile" | "years" | "decisions" | "answers" | "warmup">;

export function yourWords(s: S, max = 3): Influence[] {
  const p = s.profile;
  if (!p?.quotes.length) return [];
  const byId = new Map(p.quotes.map((q) => [q.id, q]));
  const credit = new Map<string, Consequence[]>();
  const add = (quoteId: string | null | undefined, c: Consequence) => {
    if (!quoteId || !byId.has(quoteId)) return;
    const list = credit.get(quoteId) ?? [];
    if (!list.some((x) => x.key === c.key)) list.push(c);
    credit.set(quoteId, list);
  };

  for (const d of s.decisions) {
    if (d.kind !== "big" || d.status !== "answered") continue;
    const a = s.answers.find((x) => x.decisionId === d.id);
    const opt = a?.optionId ? d.options.find((o) => o.id === a.optionId) : undefined;
    const chosen = opt?.branchTitle ?? opt?.label ?? (a?.text ? "your own way" : null);
    if (!chosen) continue;
    const base = { year: d.year, age: d.age, title: `Your life split: ${chosen}`, kind: "fork" as const, domain: d.domains[0] ?? null, refId: d.id };
    add(a?.quoteId, { ...base, key: `fork:${d.id}`, weight: 3 });
    if (d.whyQuoteId !== a?.quoteId) add(d.whyQuoteId, { ...base, key: `fork:${d.id}`, weight: 2 });
  }

  for (const y of s.years) {
    for (const e of y.events) {
      if (!e.cause?.quoteId) continue;
      add(e.cause.quoteId, {
        key: `ev:${e.id}`, year: y.year, age: y.age, title: e.title, kind: "event",
        weight: e.isTurningPoint ? 1 : 0.5, domain: e.domain, refId: e.id,
      });
    }
  }

  const ranked = [...credit.entries()]
    .map(([id, cs]) => ({ quote: byId.get(id)!, cs, score: cs.reduce((t, c) => t + c.weight, 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.cs.length - a.cs.length || order(a.quote.id) - order(b.quote.id))
    .slice(0, max);

  // Show each turning point once: a fork credited to two quotes goes under the one that ranks
  // higher, unless the other would be left with nothing.
  const shown = new Set<string>();
  return ranked.map(({ quote, cs, score }) => {
    const best = [...cs].sort((a, b) => b.weight - a.weight || a.year - b.year);
    const fresh = best.filter((c) => !shown.has(c.key));
    const titles = new Set<string>();
    const pick = (fresh.length ? fresh : best).filter((c) => !titles.has(c.title) && !!titles.add(c.title)).slice(0, 3);
    pick.forEach((c) => shown.add(c.key));
    return {
      quote,
      text: verbatim(quote),
      score,
      count: cs.length,
      consequences: pick.sort((a, b) => a.year - b.year || b.weight - a.weight),
      when: whenSaid(quote, s),
    };
  });
}

const order = (id: string) => Number(id.replace(/\D/g, "")) || 0;

function verbatim(q: Quote): string {
  const t = q.text.trim();
  if (t.length <= LONG || !q.shortForm) return t;
  const sf = q.shortForm.trim().replace(/[\s.…]+$/, "");
  return t.startsWith(sf) ? `${sf}…` : `…${sf}…`;
}

function whenSaid(q: Quote, s: S): string {
  if (q.source === "cv") return "From your CV";
  if (q.source === "linkedin") return "From your LinkedIn";
  if (q.source === "ai_export") return "From your AI chat export";
  const warm = s.warmup?.questions.find((w) => w.answer?.quoteId === q.id);
  if (warm) return "Before your life started";
  const d = q.questionId?.startsWith("d-") ? s.decisions.find((x) => x.id === q.questionId) : undefined;
  if (d) return d.kind === "big" ? `At ${d.age}, at a fork` : `At ${d.age}, in passing`;
  if (q.questionId === "start" || q.questionId?.startsWith("start")) return "The first thing you told me";
  return "In your own words";
}
