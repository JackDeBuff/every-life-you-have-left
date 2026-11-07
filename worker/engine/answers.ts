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

// ---------------------------------------------------------------------------------------------
// People named in their own words (owner playtest, Sat Nov 7)
// ---------------------------------------------------------------------------------------------
//
// A friend named in a typed answer ("I'd go climbing with my friend Kai") never reached People: the
// ledger only knew the warm-up and the uploads. Code reads names with a relation cue out of every
// typed answer (the ledger adds them from that year on, ledger.ts peopleCues), and "I lost touch
// with Kai" marks Kai as drifted. A name, a relation and nothing else: never race or ethnicity.

const REL_WORDS =
  "best friend|friend|bestie|buddy|pal|mate|roommate|flatmate|housemate|neighbou?r|mentor|coworker|co-worker|colleague|teammate|classmate|girlfriend|boyfriend|partner|wife|husband|fianc[eé]e?|sister|brother|cousin|auntie|aunt|uncle|son|daughter|godmother|godfather|grandma|grandpa|grandmother|grandfather";
const NAME = "(\\p{Lu}[\\p{Ll}'’-]+)";
const MODS = "((?:[a-z][a-z-]*\\s+){0,2}?)";
const SAID_RES: { re: RegExp; name: number; mods: number; rel: number }[] = [
  // "my friend Kai", "my best friend, Priya", "my old college roommate Dana", "my girlfriend named Lin"
  { re: new RegExp(`\\b[Mm]y\\s+${MODS}(${REL_WORDS})(?!['’]s)\\b,?\\s+(?:(?:named|called)\\s+)?${NAME}`, "gu"), name: 3, mods: 1, rel: 2 },
  // "Kai, my climbing buddy"
  { re: new RegExp(`${NAME},\\s+(?:[Mm]y|[Oo]ur)\\s+${MODS}(${REL_WORDS})\\b(?!['’]s)`, "gu"), name: 1, mods: 2, rel: 3 },
  // "Dana is my best friend", "Kai has been my closest friend"
  { re: new RegExp(`${NAME}\\s+(?:is|was|has been|became)\\s+(?:[Mm]y|[Oo]ur)\\s+${MODS}(${REL_WORDS})\\b(?!['’]s)`, "gu"), name: 1, mods: 2, rel: 3 },
  // "a friend named Kai", "this colleague called Dana"
  { re: new RegExp(`\\b(?:a|an|this|that|one)\\s+${MODS}(friend|colleague|coworker|neighbou?r|classmate|teammate)\\s+(?:named|called)\\s+${NAME}`, "gu"), name: 3, mods: 1, rel: 2 },
];
/** Capitalised words that are never a person's name here. */
const NOT_A_NAME = new Set(
  "I I'm I'd I'll I've Mom Mum Dad Mama Papa God Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Christmas Easter Ramadan Diwali Songkran English Spanish French German Thai Chinese Japanese Korean Hindi Google Instagram LinkedIn Netflix Zoom Uber Amazon Facebook WhatsApp Line Slack Then That This They There These Those Honestly Maybe Probably Yes No Not But And So Or If When What Why How Well Okay Ok Yeah Sure Also Still Just Actually Really Because After Before Since Once Even Every Some Most Our Their His Her We You He She It My Your Today Tomorrow Yesterday Sometimes Never Always".split(" "),
);
/** A clause that says they are no longer close with someone. */
const LOST_TOUCH =
  /\b(?:lost touch|losing touch|fell out of touch|out of touch|drifted apart|drift(?:ed|ing)? away|grew apart|growing apart|fell out|stopped (?:talking|speaking|calling|seeing|texting)|(?:don't|do not|never|rarely|barely|hardly) (?:really |ever )?(?:talk|speak|see|hear from|call|text)|haven't (?:really )?(?:talked|spoken|seen|heard from|called)|not (?:that |really |as |very )?close (?:anymore|any more|now|these days)|no longer (?:close|friends|in touch)|(?:isn't|aren't|wasn't|weren't) close|not friends anymore|cut (?:\w+ )?off|ghosted)\b/i;
/** Hypotheticals and fears ("I'd hate to lose touch with Kai") are not a drift. */
const NOT_REAL = /\b(?:if|would|wouldn't|won't|might|could|afraid|worr\w*|scared|hope|don't want|never want|hate to)\b|['’]d\b/i;
/** An ex or someone who died is not a person to keep in People. */
const NOT_CURRENT = /\b(?:ex|former|late)\b|\bex-/i;

export interface PeopleSaid {
  /** People introduced with a relation cue: "my friend Kai" -> { name: "Kai", relation: "friend" }. */
  joins: { name: string; relation: string }[];
  /** Capitalised words in a sentence that says they lost touch (the ledger matches them to people). */
  drifted: string[];
  /** Capitalised words anywhere else (a renewal when they match someone already in the ledger). */
  mentioned: string[];
}

const capsIn = (s: string) => [...s.matchAll(new RegExp(NAME, "gu"))].map((m) => m[1]!.replace(/['’]s$/, "")).filter((w) => !NOT_A_NAME.has(w));

/** Named people, lost-touch statements and mentions in their typed words (code only, cheap). */
export function peopleSaid(text: string): PeopleSaid {
  const out: PeopleSaid = { joins: [], drifted: [], mentioned: [] };
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return out;
  // where a "my <relation> <Name>" match starts: "Mostly, my friend Kai" is Kai, not "Mostly"
  const myAt = new Set<number>();
  for (const [i, { re, name, mods, rel }] of SAID_RES.entries()) {
    re.lastIndex = 0;
    for (const m of t.matchAll(re)) {
      const nm = m[name]!.replace(/['’]s$/, "");
      if (i === 0) myAt.add(m.index);
      else if (myAt.has(m.index + m[0].search(/\b[MmOo](?:y|ur)\s/))) continue;
      if (NOT_A_NAME.has(nm) || nm.length < 2) continue;
      const relation = `${(m[mods] ?? "").trim()} ${m[rel]!}`.trim().toLowerCase().replace(/^(?:new|own|good|dear|lovely)\s+/, "");
      if (NOT_CURRENT.test(relation)) continue;
      if (!out.joins.some((j) => j.name === nm)) out.joins.push({ name: nm, relation });
    }
  }
  for (const s of t.split(/(?<=[.!?;])\s+|,\s+(?=but\b|and\b|so\b|though\b)/i)) {
    const caps = capsIn(s);
    if (LOST_TOUCH.test(s) && !NOT_REAL.test(s.replace(LOST_TOUCH, ""))) out.drifted.push(...caps.filter((c) => !out.drifted.includes(c)));
    else out.mentioned.push(...caps.filter((c) => !out.mentioned.includes(c)));
  }
  return out;
}

/** The path a big decision took, from its stored answer. */
export function chosenOf(d: Pick<Decision, "options">, a: Pick<DecisionAnswer, "optionId" | "text"> | null | undefined): Chosen {
  const said = a?.text?.trim() ? a.text.trim() : null;
  const option = a?.optionId ? d.options.find((o) => o.id === a.optionId) ?? null : null;
  if (option) return { own: false, option, title: option.branchTitle ?? option.label, label: option.label, said };
  if (said) return { own: true, option: null, title: ownTitle(said), label: ownShort(said), said };
  return { own: false, option: null, title: "their own answer", label: "their own answer", said: null };
}
