/**
 * What a decision card is about, beyond the slot's life stage (playtest feedback, Sat Nov 7: two
 * testers with completely different lives got the same career ladder; Noor's five forks were all
 * "career"). Pure code:
 *   - life axes: the threads THIS life is made of (profile.axes from the profile call, else derived
 *     from facts, people and constraints); cards rotate across them, least-used first
 *   - no two work forks in a row: after a work fork the next one is about something else
 *   - a life shock that just landed (shocks.ts) turns the nearest card into "how do you respond?"
 */
import type { DecisionSlot } from "../../shared/engine";
import type { DomainKey } from "../../shared/domains";
import type { LifeAxis, Profile } from "../../shared/schema";
import type { Decision, SessionState } from "../../shared/sim";
import { parseSlotReason } from "./slots";
import { SHOCK_TEXT, shocksFor, type Shock } from "./shocks";
import { rng, truncateWords } from "./util";
import { worldTimeline } from "./world";

const STOP = new Set("the a an and or but to of in on for with at by from my your their our his her its this that just more less some".split(" "));
const keyWords = (s: string) => (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).filter((w) => w.length >= 4 && !STOP.has(w));

/** The axes of a profile: the model's (profile.axes), else derived from what we know. */
export function axesOf(p: Profile): LifeAxis[] {
  // the model's axes first; what later answers taught (warm-up folds, cards) fills the rest
  const out: LifeAxis[] = [...(p.axes ?? [])];
  const covered = (label: string) => {
    const w = keyWords(label);
    return out.some((a) => a.label.toLowerCase() === label.toLowerCase() || (w.length > 0 && keyWords(`${a.label} ${a.detail}`).some((x) => w.includes(x))));
  };
  const add = (label: string, domain: DomainKey, detail: string, quoteIds: string[] = []) => {
    if (!label.trim() || covered(label) || out.length >= 6 || (domain === "career" && out.some((a) => a.domain === "career"))) return;
    out.push({ id: `a${out.length + 1}`, label: truncateWords(label, 5), domain, detail: truncateWords(detail, 16), quoteIds });
  };
  for (const f of p.facts) {
    if (f.key === "occupation") add(f.value, "career", "their work, as they describe it", f.quoteIds);
    if (f.key === "interests") add(f.value, "achievement", "what they make or do for its own sake", f.quoteIds);
    if (f.key === "health_habits") add(f.value, "mentalHealth", "the habit that keeps them going", f.quoteIds);
  }
  for (const c of p.constraints) {
    const domain: DomainKey = c.kind === "debt" ? "wealth" : c.kind === "family_obligation" || c.kind === "caregiving" ? "family" : "lifeGoals";
    add(c.text, domain, `a ${c.kind.replace("_", " ")} they live with`, c.quoteIds);
  }
  const parents = p.people.filter((x) => /mother|father|mom|dad|parent|mum/i.test(`${x.relation} ${x.label}`));
  if (parents.length) add(parents.length > 1 ? "Their parents" : parents[0]!.label, "family", parents.find((x) => x.expectation)?.expectation ?? "what they owe and want to give", parents[0]!.quoteIds);
  const partner = p.people.find((x) => /partner|wife|husband|girlfriend|boyfriend|fianc/i.test(x.relation));
  if (partner) add(partner.label, "relationships", "the life they're building together", partner.quoteIds);
  const friend = p.people.find((x) => /friend/i.test(x.relation));
  if (friend) add(friend.label, "relationships", "a friendship that matters to them", friend.quoteIds);
  // the unjudged seed only when the model wrote one (the code default is generic) and nothing better exists
  if (!p.axes?.length && p.seeds.unjudged.text && !/^Does what they'd do if nobody judged/.test(p.seeds.unjudged.text))
    add(p.seeds.unjudged.text, "lifeGoals", "what they'd do if nobody judged them", p.seeds.unjudged.quoteIds);
  return out.slice(0, 6);
}

/** How many earlier cards already touched an axis (its words in the card, or its domain first). */
function uses(axis: LifeAxis, cards: Decision[]): number {
  const words = new Set(keyWords(axis.label));
  let n = 0;
  for (const d of cards) {
    const text = `${d.prompt} ${d.options.map((o) => o.label).join(" ")}`.toLowerCase();
    const hit = [...words].some((w) => text.includes(w));
    if (hit || d.domains[0] === axis.domain) n++;
  }
  return n;
}

const isWork = (d: Pick<Decision, "domains">) => d.domains[0] === "career";

/** A shock that landed in this life in the slot's year or the year before, written, and not yet asked about. */
export function shockToAsk(state: SessionState, slot: Pick<DecisionSlot, "year" | "kind">): Shock | null {
  const p = state.profile!;
  if (slot.year <= p.startYear) return null;
  const endYear = p.birthYear + (state.endAge || p.endAge);
  const world = worldTimeline(p.sessionId, p.startYear, endYear);
  const past = state.years.filter((y) => y.year < slot.year - 1);
  const near = shocksFor(p.sessionId, "you", p, world, past, slot.year - 1, slot.year);
  for (const s of near) {
    const y = state.years.find((x) => x.year === s.year);
    if (!y) continue;
    const re = SHOCK_TEXT[s.type];
    const written = y.events.some((e) => (re ? re.test(`${e.title}. ${e.narrative}`) : s.cats.includes(e.category) && (s.tone === "mixed" || e.tone === s.tone)));
    if (!written) continue;
    const asked = state.decisions.some((d) => d.year >= s.year && d.year < slot.year && d.status !== "pending");
    if (!asked) return s;
  }
  return null;
}

/**
 * The FOCUS block for a card (empty when there is nothing to steer). `slot.reason` is the planner's
 * "big:<domain>:<moment>: why" line.
 */
export function cardFocus(state: SessionState, slot: DecisionSlot): string {
  const p = state.profile;
  if (!p) return "";
  const r = parseSlotReason(slot.reason);
  const kind = slot.kind;
  const lines: string[] = [];
  const shock = shockToAsk(state, slot);
  if (shock) {
    lines.push(
      `- Something just happened TO this life: ${shock.year}: ${shock.what} (it is in THE LIFE SO FAR). Make this card about how they respond: ${shock.ask.toLowerCase()}. ${kind === "big" ? "The four forks are four honest responses (momentum, bold, careful, unjudged); none is a second disaster." : "Four honest ways to take it."}`,
    );
  }
  const earlier = state.decisions
    .filter((d) => d.kind === kind && d.year <= slot.year && !(d.year === slot.year && d.status === "pending"))
    .sort((a, b) => a.year - b.year);
  const isFirst = kind === "big" && !state.decisions.some((d) => d.kind === "big" && (d.year < slot.year || d.status !== "pending"));
  if (isFirst) return lines.length ? `THIS CARD'S FOCUS\n${lines.join("\n")}` : "";
  const lastBig = state.decisions.filter((d) => d.kind === "big" && d.year < slot.year && d.status !== "pending").at(-1);
  const workStreak = kind === "big" && !!lastBig && isWork(lastBig);
  const axes = axesOf(p).filter((a) => !(workStreak && a.domain === "career"));
  if (!shock && axes.length) {
    const rand = rng(`axis:${p.sessionId}:${slot.year}:${kind}`);
    const scored = axes
      .map((a) => ({ a, s: -2 * uses(a, earlier) - (lastBig && a.domain === lastBig.domains[0] ? 1 : 0) + (a.domain === r.domain ? 0.5 : 0) + 0.3 * rand() }))
      .sort((x, y) => y.s - x.s);
    const axis = scored[0]!.a;
    const quote = axis.quoteIds.map((id) => p.quotes.find((q) => q.id === id)).find(Boolean);
    const said = quote ? ` (their words, ${quote.id}: "${truncateWords(quote.text, 18)}")` : "";
    const generic = /^stage_/.test(r.moment);
    lines.push(
      kind === "big"
        ? `- The thread of their life this fork is about: "${axis.label}": ${axis.detail}${said}. ${generic || workStreak ? "Build the dilemma on this thread" : "Let the life-stage moment play out on this thread"}, with its real specifics (names, places, the thing itself), not a generic version of it.`
        : `- If it fits the gap, set this moment on the thread "${axis.label}" (${axis.detail})${said}.`,
    );
  }
  if (workStreak) {
    lines.push(
      `- The last fork (${lastBig!.year}) was a work question. This one is NOT about work: no job offer, promotion, transfer, role, contract or business deal. ${r.moment === "retirement" ? "Retirement here is about what the free years are for and who they spend them with, not the pension." : "Work can stay in the background."}`,
    );
  }
  return lines.length ? `THIS CARD'S FOCUS (code-chosen, so their decisions cover their whole life)\n${lines.join("\n")}` : "";
}
