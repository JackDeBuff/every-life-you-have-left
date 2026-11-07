/**
 * Kids are the user's call, never the writer's (owner's playtest, Sat Nov 7: a tester got a child
 * out of nowhere in one run, and was never asked about kids in another).
 *
 *   kidsDoor          "has": they already have children; "open": something they said or chose
 *                     opened the door (a fact, a plan, their words, a tapped answer, a fork taken);
 *                     "closed": nothing did. A closed life gets no pregnancy, birth or adoption
 *                     (years.ts drops the sampler's "first child" beat, tells the writer, and strips
 *                     a birth the writer adds anyway).
 *   kidsQuestionOpen  22-45, no kids, and the question was never answered either way: planSlots puts
 *                     a children card ("small:children:kids") early, before ~35, and smallBatch keeps
 *                     its domain instead of re-weighting it away.
 * PURE: no model calls.
 */
import type { Profile } from "../../shared/schema";
import type { Decision, DecisionAnswer, SessionState } from "../../shared/sim";
import { chosenOf } from "./answers";

export type KidsDoor = "has" | "open" | "closed";

const KID_WORD = /\b(kids?|children|child|bab(?:y|ies)|son|daughter|famil(?:y|ies)|parent(?:hood|ing)?|mom|dad|mother|father|pregnan\w*|expecting|adopt\w*)\b/i;
const WANT =
  /\b(?:start(?:ing)? a family|have (?:a )?(?:kids?|children|a baby|a child)|try(?:ing)? for a baby|(?:we(?:'re| are)|i(?:'m| am)) (?:pregnant|expecting)|pregnan(?:t|cy)|adopt(?:ing|ion)?|family of (?:my|our) own|be(?:come)? a (?:mom|dad|mother|father|parent)|(?:want|wants|wanted|hope|hoping|plan|planning|would love|'d love|dream of|ready for)\b[^.!?]{0,40}\b(?:kids?|children|a (?:baby|child|family)|family)|(?:yes|definitely|someday|one day|eventually)\b[^.!?]{0,30}\b(?:kids?|children|a family|a baby))\b/i;
// "I don't want kids", "no kids for me", "child-free": a no. ("just not yet" is timing: still a yes.)
const NO =
  /\b(?:(?:don'?t|do not|doesn'?t|never|won'?t|not)\s+(?:\w+\s+){0,2}(?:want|have|having|see (?:myself|us)|planning|interested)|no (?:kids|children|baby|babies)|child-?free|without (?:kids|children)|not for me)\b/i;
// "I don't know if I want kids", "maybe", "only if": undecided, so the door stays shut.
const HEDGE = /\b(?:not sure|unsure|don'?t know|no idea|maybe|might|undecided|on the fence|torn|if|whether)\b/i;
const HAS_KIDS = /\b(?:(?:my|our) (?:son|daughter|kids?|children|baby|toddler|stepson|stepdaughter)|(?:have|has|raising) (?:a |an |one |two |three |\d+ )?(?:kids?|children|sons?|daughters?|baby|toddler)|(?:\d+|one|two|three|four) (?:kids?|children|sons?|daughters?)|mom of|dad of|father of|mother of|single (?:mom|dad|parent))\b/i;
const CHILD_REL = /\b(son|daughter|child|kid|baby|stepson|stepdaughter|toddler)\b/i;

/** Sentences of a text that say they want kids (not negated, not hedged). */
function wants(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const s of text.split(/(?<=[.!?;])\s+|\s+but\s+/i)) {
    if (!KID_WORD.test(s) || !WANT.test(s)) continue;
    if (NO.test(s) || HEDGE.test(s)) continue;
    return true;
  }
  return false;
}

/** They already have children (the profile's people or facts). */
export function hasKids(profile: Profile): boolean {
  if (profile.people.some((p) => CHILD_REL.test(p.relation) && !/\b(niece|nephew|grand|god)/i.test(`${p.relation} ${p.label}`))) return true;
  const fact = profile.facts.find((f) => f.key === "children");
  if (fact && /\b(no|none|zero|0|don'?t|not)\b/i.test(fact.value) && !/\b(\d+|one|two|three) (?:kids?|children|sons?|daughters?)/i.test(fact.value)) return false;
  return !!fact && HAS_KIDS.test(fact.value);
}

/** What each answered decision said, in words: the tapped option and anything typed. */
function answerTexts(decisions: readonly Decision[], answers: readonly DecisionAnswer[], upto = Infinity): string[] {
  const out: string[] = [];
  for (const d of decisions) {
    if (d.status !== "answered" || d.year > upto) continue;
    const a = answers.find((x) => x.decisionId === d.id);
    if (!a) continue;
    const opt = d.options.find((o) => o.id === a.optionId);
    if (d.kind === "big") {
      const c = chosenOf(d, a);
      out.push([c.title, c.label].filter(Boolean).join(". "));
    } else if (opt) out.push(opt.label);
    if (a.text) out.push(a.text);
  }
  return out;
}

/** Whether a life may have children: from the profile, plus extra texts (answers, forks taken). */
export function kidsDoor(profile: Profile, extra: readonly string[] = []): KidsDoor {
  if (hasKids(profile)) return "has";
  const fact = profile.facts.find((f) => f.key === "children");
  const texts = [
    fact?.value,
    ...(profile.plans ?? []).filter((p) => p.kind === "family" || KID_WORD.test(p.text)).map((p) => p.text),
    ...profile.quotes.map((q) => q.text),
    ...extra,
  ];
  return texts.some((t) => wants(t)) ? "open" : "closed";
}

/** The chosen life's door in `upto` (every decision answered by then counts). */
export function kidsDoorFor(state: Pick<SessionState, "profile" | "decisions" | "answers">, upto = Infinity): KidsDoor {
  if (!state.profile) return "closed";
  return kidsDoor(state.profile, answerTexts(state.decisions, state.answers, upto));
}

/**
 * 22-45 with no kids, and nobody has asked yet: no children fact, no answered children card, no
 * words about kids either way. The kids question is then planned early (slots.ts).
 */
export function kidsQuestionOpen(profile: Profile, state?: Pick<SessionState, "decisions" | "answers" | "playhead">): boolean {
  const age = (state?.playhead?.year ?? profile.startYear) - profile.birthYear;
  if (age < 22 || age > 45) return false;
  if (hasKids(profile) || profile.facts.some((f) => f.key === "children")) return false;
  if (profile.quotes.some((q) => /\b(kids?|children|a baby|start(?:ing)? a family|child-?free)\b/i.test(q.text))) return false;
  if (state?.decisions.some((d) => d.status === "answered" && d.domains.includes("children"))) return false;
  return true;
}

/** A birth/pregnancy/adoption line in a year's text (what a closed life must not have). */
export const BIRTH_RE = /\b(born|birth|newborn|firstborn|pregnan\w*|expecting (?:a|your|their|our)|baby (?:girl|boy|is|arrives)|adopt(?:s|ed|ing|ion)|welcome (?:a|your|their) (?:son|daughter|baby|child)|first child|a baby on the way)\b/i;
