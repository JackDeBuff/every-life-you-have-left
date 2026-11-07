/**
 * What a big decision's answer IS, read by code (final QA, Sat Nov 7). Pure; used by the session
 * agent (to file the answer) and by every prompt and log line that names the path taken.
 *
 *   - a tap alone: the option.
 *   - a tap plus words that refine it ("I'd stay, but only if..."): the option; the words are a quote.
 *   - words alone, or words that contradict the tap: THEIR OWN PATH. Its title comes from their
 *     words (2-4 words), all four options become lives they didn't choose (the 3 most different
 *     are kept, as at any fork), and the log reads "You chose: <their words, shortened>".
 *
 * QA: Chidi typed "I keep the UK job and build the fintech on weekends" without tapping. The card
 * guessed an option by shared words ("build", "fintech") and the log said "You chose: Quit the bank
 * to build the Lagos fintech full-time", the opposite of what he said.
 */
import type { Decision, DecisionAnswer, DecisionOption } from "../../shared/sim";
import { truncateClean, wordCount } from "./util";

/** The path a big answer took. `own` = their own words, none of the four options. */
export interface Chosen {
  own: boolean;
  option: DecisionOption | null;
  /** The fork's name: the option's branch title, or 2-4 words from their own answer. */
  title: string;
  /** What they chose, as a phrase: the option's label, or their words, shortened. */
  label: string;
  /** Their typed words (a quote), if any. */
  said: string | null;
}

// ---------------------------------------------------------------------------------------------
// Their own words as a title and a short line
// ---------------------------------------------------------------------------------------------

const LEAD =
  /^(?:(?:honestly|well|ok(?:ay)?|so|yeah|yes|no|nope|nah|hmm+|um+|uh+|actually|maybe|probably|definitely|realistically|personally|neither|none of (?:these|them|those)(?: really)?|not really|i think|i guess|i feel like|i mean|i know|to be honest|tbh|for me|i'd say|in reality|truthfully|right now|for now|if i'm honest)[\s,.!:;-]+)+/i;
const SUBJ =
  /^(?:i|we)(?:'d|’d| would| will|'ll|’ll| am going to|'m going to|’m going to|'m gonna|’m gonna| want to| wanna| would rather|'d rather|’d rather| choose to| decide to| plan to| need to| should| could| can| must| have to| am| 'm)?\s+(?:(?:probably|definitely|just|still|actually|honestly|really|rather|totally|absolutely|then|also|first)\s+)*/i;
const CLAUSE = /\s*(?:[,;:–—(]|\s-\s|\b(?:and|but|while|so|because|unless|though|although|if|until|then|or|plus|with)\b)\s*/i;
const SMALL = new Set(["the", "a", "an", "to", "of", "for", "with", "in", "on", "at", "and", "or", "but", "my", "our", "your", "so", "that", "this", "it", "as", "by", "from"]);
/** Leading words of a condition clause that carry no content ("only if they let me ..."). */
const CONNECT = new Set(["only", "if", "when", "as", "long", "they", "he", "she", "we", "you", "let", "lets", "me", "i", "i'd", "can", "could", "would", "will", "it", "is", "be", "get", "gets", "to", "so", "that", "and", "but"]);

/**
 * The first sentence that says something, without fillers and the subject: "Honestly I'd keep the UK
 * job, and..." -> "keep the UK job, and..."; "No, none of these. I'd teach kids to code." -> "teach kids to code".
 */
function core(text: string): string {
  for (const sentence of text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+|\n/)) {
    let t = sentence.replace(/[.!?…]+$/, "").trim();
    for (let i = 0; i < 3; i++) {
      const before = t;
      t = `${t} `.replace(LEAD, "").replace(SUBJ, "").trim();
      if (t === before) break;
    }
    t = t.replace(/^["'“‘]+|["'”’]+$/g, "").trim();
    if (t && !/^(?:no|nope|nah|neither|none|none of (?:these|them|those)|not really|nothing)$/i.test(t)) return t;
  }
  return "";
}

const cap = (s: string) => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

/** A 2-4 word fork name in their own words ("I keep the UK job and build the fintech on weekends" -> "Keep the UK job"). */
export function ownTitle(text: string): string {
  // "take a year to teach kids to code" names the teaching, not the year
  const c = core(text).replace(/^(?:take|spend|use|give it)\s+(?:a|one|two|three|six|the next)\s+(?:years?|months?|summers?)\s+(?:off\s+)?to\s+(?=\w)/i, "");
  if (!c) return "My own way";
  const clauses = c.split(CLAUSE).map((x) => x.trim()).filter(Boolean);
  let ws = (clauses[0] ?? c).split(/\s+/);
  // a one-word clause ("Stay") takes the gist of the next one: "Stay, but only if they let me work remote" -> "Stay, work remote"
  if (ws.length < 2 && clauses[1]) {
    const rest = clauses.slice(1).join(" ").split(/\s+/);
    while (rest.length > 1 && CONNECT.has(rest[0]!.toLowerCase())) rest.shift();
    ws = [`${ws[0]},`, ...rest.filter((w) => !SMALL.has(w.toLowerCase()))];
  }
  // at most 4 words, never ending on a small word ("go back to school for a master's" -> "Go back to school")
  let out = ws.slice(0, 4);
  while (out.length > 2 && SMALL.has(out.at(-1)!.toLowerCase().replace(/[,]$/, ""))) out = out.slice(0, -1);
  const t = out.join(" ").replace(/[,;:]+$/, "");
  return cap(t) || "My own way";
}

/** Their words for the log, shortened: "You chose: Keep the UK job and build the fintech on weekends". */
export function ownShort(text: string, n = 14): string {
  const c = core(text) || text.trim();
  return cap(truncateClean(c, n).replace(/[,;:]+$/, ""));
}

// ---------------------------------------------------------------------------------------------
// Does the text say the same thing as the tapped option, or something else?
// ---------------------------------------------------------------------------------------------

const STOP = new Set(
  "a an and are as at be been but by can could do does for from had has have i if in into is it its i'd i'll i'm me my no not of on or our so than that the their them then there they this to too up was we were what when where which who why will with would you your just now still more most some any all one also about over after before only really very get got go going make".split(
    " ",
  ),
);
/** Words that say nothing about WHICH option (every option has them). */
const GENERIC = new Set(["job", "role", "offer", "work", "working", "time", "life", "year", "years", "month", "months", "money", "family", "people", "thing", "things", "way", "plan", "new", "full", "full-time", "part", "part-time"]);

const stem = (w: string) => w.replace(/'s$/, "").replace(/(?:ing|ed|es|s)$/, "") || w;
function terms(s: string): Set<string> {
  return new Set(
    (s.toLowerCase().replace(/[’]/g, "'").match(/[\p{L}\p{N}'-]+/gu) ?? [])
      .filter((w) => w.length > 1 && !STOP.has(w) && !GENERIC.has(w))
      .map(stem),
  );
}
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((w) => b.has(w)).length;

const VERBS = {
  stay: /\b(stay\w*|keep\w*|remain\w*|stick\w* (?:with|it out)|hold on|hang on|don't (?:quit|leave|move)|not (?:quit|leave|move)\w*)\b/i,
  go: /\b(quit\w*|leav\w*|resign\w*|mov(?:e|ed|es|ing)|relocat\w*|walk away|step away|drop out)\b/i,
  yes: /\b(take|taking|accept\w*|say(?:ing)? yes|go for it|join\w*|sign\w*)\b/i,
  no: /\b(declin\w*|turn(?:ing)? (?:it |them |that )?down|refus\w*|pass(?:ing)? on|say(?:ing)? no|not tak\w*|won't take|wouldn't take|reject\w*)\b/i,
  full: /\b(full[- ]time|all in|all-in|go big|quit\w*)\b/i,
  side: /\b(on (?:the )?weekends?|weekends only|on the side|side project|side hustle|evenings|at night|nights|part[- ]time|after work|in my spare time|as a hobby)\b/i,
};
const REFUSE = /^(?:\s*(?:no|nope|nah|neither|none of (?:these|them|those)|actually,? no|scratch that|on second thought|not (?:that|this|really))\b)|\b(?:none of (?:these|them|those)|neither (?:of (?:these|them))?|something else entirely|my own way)\b/i;
const AFFIRM = /^\s*(?:yes|yeah|yep|sure|definitely|absolutely|exactly|for sure|100%|this one|that one|this|that's (?:me|it|right))\b/i;
const NEG_BEFORE = /\b(?:not|never|no|don't|do not|won't|will not|wouldn't|would not|can't|cannot|instead of|rather than|without|anything but|refuse to|stop)\b(?:\s+[\p{L}'-]+){0,3}?\s+$/iu;

/** True when their words say something other than the tapped option (code only, cheap). */
export function contradicts(opt: DecisionOption, text: string, others: DecisionOption[]): boolean {
  const t = text.trim();
  if (!t) return false;
  if (REFUSE.test(t)) return true;
  const optText = `${opt.label} ${opt.branchTitle ?? ""}`;
  // an explicit "not <option's own word>" ("I'd rather not quit", "without moving")
  const lower = t.toLowerCase();
  for (const w of terms(optText)) {
    if (w.length < 3) continue;
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\w*`, "gi");
    for (const m of lower.matchAll(re)) if (NEG_BEFORE.test(lower.slice(0, m.index))) return true;
  }
  // opposite moves: the option quits/leaves/moves and they stay (or the reverse); the option takes it and they turn it down
  const o = (k: keyof typeof VERBS) => VERBS[k].test(optText);
  const s = (k: keyof typeof VERBS) => VERBS[k].test(t);
  if (o("go") && !o("stay") && s("stay") && !s("go")) return true;
  if (o("stay") && !o("go") && s("go") && !s("stay")) return true;
  if (o("yes") && !o("no") && s("no")) return true;
  if (o("no") && !o("yes") && s("yes") && !s("no")) return true;
  if (o("full") && s("side") && !s("full")) return true;
  // "Yes, and ..." / "Exactly, but ...": a refinement, whatever else it mentions
  if (AFFIRM.test(t)) return false;
  // they described another option much better than the one they tapped
  const mine = terms(t);
  const tapped = overlap(mine, terms(optText));
  const best = Math.max(0, ...others.filter((x) => x.id !== opt.id).map((x) => overlap(mine, terms(`${x.label} ${x.branchTitle ?? ""}`))));
  return best >= Math.max(3, tapped + 2);
}

export interface Resolved {
  /** The option to file the answer under; null = their own path. */
  optionId: string | null;
  own: boolean;
  /** "tap" | "refine" (tap + words that fit it) | "own" (words alone) | "contradicts" (words against the tap). */
  how: "tap" | "refine" | "own" | "contradicts" | "none";
}

/** File a big answer: under the tapped option, or as their own path. */
export function resolveBig(d: Pick<Decision, "options">, optionId: string | null, text: string | null): Resolved {
  const words = text?.trim() ?? "";
  const opt = optionId ? d.options.find((o) => o.id === optionId) ?? null : null;
  if (wordCount(words) < 2) return opt ? { optionId: opt.id, own: false, how: "tap" } : { optionId: null, own: !!words, how: words ? "own" : "none" };
  if (!opt) return { optionId: null, own: true, how: "own" };
  return contradicts(opt, words, d.options) ? { optionId: null, own: true, how: "contradicts" } : { optionId: opt.id, own: false, how: "refine" };
}

/** The path a big decision took, from its stored answer. */
export function chosenOf(d: Pick<Decision, "options">, a: Pick<DecisionAnswer, "optionId" | "text"> | null | undefined): Chosen {
  const said = a?.text?.trim() ? a.text.trim() : null;
  const option = a?.optionId ? d.options.find((o) => o.id === a.optionId) ?? null : null;
  if (option) return { own: false, option, title: option.branchTitle ?? option.label, label: option.label, said };
  if (said) return { own: true, option: null, title: ownTitle(said), label: ownShort(said), said };
  return { own: false, option: null, title: "their own answer", label: "their own answer", said: null };
}
