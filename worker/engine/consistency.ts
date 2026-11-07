/**
 * Cheap code checks that keep generated text true to the life ledger (ledger.ts):
 *   - ages of named people match their birth years (fixed in place: the number is rewritten)
 *   - "your two kids" matches the children count (fixed in place)
 *   - no phantom partner, child or pet; a pet whose time has passed isn't brought back
 *   - decisions don't put them in a place or job they've left, or offer a job to a retiree
 *   - big decisions don't repeat an earlier fork's subject unless framed as a revisit
 *   - small decisions don't reuse the time of day / setting of the last few cards
 *   - near-duplicate lines (normalised similarity)
 * Used by the generators (repair / regenerate) and by scripts/eval (violation counts).
 */
import type { Decision, SessionState, SimYear } from "../../shared/sim";
import { chosenOf } from "./answers";
import { ageMentions, ageOf, cityOf, here, NUM, numFrom, numLike, type LifeNow } from "./ledger";
import { laneOf } from "./money";
import { catastrophesIn } from "./shocks";
import { sentences } from "./util";

export type IssueKind =
  | "age" | "count" | "partner" | "child" | "pet" | "place" | "employer" | "retired" | "repeat_topic" | "framing" | "duplicate" | "past_time"
  // big decisions against the forks already taken (forkIssues)
  | "work_stage" | "repeat_chosen" | "left_behind" | "repeat_option" | "ignores_now" | "same_options"
  // content feedback (Sat Nov 7): a catastrophe twice in one life; three work forks in a row
  | "catastrophe" | "work_streak"
  // a friend who drifted out of this life offered again without reunion framing (ledger.ts driftedIssues)
  | "drifted";
export interface Issue {
  kind: IssueKind;
  msg: string;
}

// ---------------------------------------------------------------------------------------------
// Ages and counts: fixed in place
// ---------------------------------------------------------------------------------------------

const COUNT_RE = new RegExp(`\\b(?:your|all|both of your|all of your)\\s+(two|three|four|five|2|3|4|5)\\s+(kids|children|sons|daughters|boys|girls)\\b|\\bboth\\s+(?:of\\s+)?(?:your\\s+)?(kids|children)\\b`, "gi");

/**
 * Rewrites wrong ages of known people ("Bea is nineteen" -> "Bea is twenty-four") and wrong
 * children counts. Returns the fixed text and what was fixed.
 */
export function fixPeopleNumbers(text: string, now: LifeNow): { text: string; fixed: string[] } {
  if (!text) return { text, fixed: [] };
  const fixed: string[] = [];
  const people = now.people.filter((p) => p.ageKnown && p.born !== null && p.role !== "pet" && !p.generic);
  const names = people.map((p) => p.name.split(/\s+/)[0]!);
  const edits: { index: number; token: string; to: string }[] = [];
  for (const m of ageMentions(text, names)) {
    if (m.byRelation) continue;
    const p = people.find((x) => x.name.split(/\s+/)[0] === m.who);
    const age = p ? ageOf(p, now.year) : null;
    if (age === null || age < 0 || Math.abs(age - m.age) <= 0) continue;
    edits.push({ index: m.index, token: m.token, to: numLike(age, m.token) });
    fixed.push(`${m.who} is ${age} in ${now.year}, not ${m.age}`);
  }
  // relation mentions ("your 19-year-old daughter") when exactly one child fits the relation
  const kids = here(now, "child").filter((k) => k.ageKnown && k.born !== null);
  for (const m of ageMentions(text, [])) {
    if (!m.byRelation || kids.length !== 1) continue;
    const age = ageOf(kids[0]!, now.year)!;
    if (Math.abs(age - m.age) <= 0) continue;
    edits.push({ index: m.index, token: m.token, to: numLike(age, m.token) });
    fixed.push(`their ${m.who} is ${age}, not ${m.age}`);
  }
  const nKids = here(now, "child").length;
  let out = text;
  for (const e of edits.sort((a, b) => b.index - a.index)) {
    if (out.slice(e.index, e.index + e.token.length) !== e.token) continue;
    out = out.slice(0, e.index) + e.to + out.slice(e.index + e.token.length);
  }
  if (nKids >= 1) {
    out = out.replace(COUNT_RE, (whole, n?: string) => {
      const said = n ? numFrom(n) : 2;
      if (said === null || said === nKids) return whole;
      if (nKids === 1) return whole; // "your two kids" with one child: flagged by peopleIssues, not rewritten
      fixed.push(`${nKids} children, not ${said}`);
      return n ? whole.replace(n, numLike(nKids, n)) : whole.replace(/\bboth\b/i, (b) => (b[0] === "B" ? "All" : "all"));
    });
  }
  return { text: out, fixed };
}

// ---------------------------------------------------------------------------------------------
// Phantom people and the pet's lifespan
// ---------------------------------------------------------------------------------------------

const PARTNER_RE = /\b(?:your|you and your|with your)\s+(?:new\s+|longtime\s+|long-time\s+)?(partner|wife|husband|spouse|girlfriend|boyfriend|fianc[eé]e?)\b/i;
const CHILD_RE = /\byour\s+(?:(?:new|newborn|little|baby|eldest|oldest|youngest|first|grown|adult|teenage|two|three|four|five)\s+)?(son|daughter|kids?|children|child|baby|toddler|twins|boys|girls|sons|daughters)\b/i;
const EXPECTING_RE = /\b(expect\w*|pregnan\w*|due in|due date|on the way|trying for|IVF|fertility|adopt\w*|future (?:kids|children|child)|someday|one day|if you (?:ever )?have|want(?:s)? (?:a |kids|children)|whether to have|having (?:a baby|kids|children)|start a family)\b/i;
const PET_RE = /\b(?:your|the)\s+(?:old\s+)?(dog|puppy|cat|kitten)\b/i;
const MEMORY_RE = /\b(remember\w*|memor\w*|miss\w*|used to|old photo|photo of|collar|leash on the hook|still think|grave|ashes)\b/i;

export interface PeopleAllow {
  /** People changes made in this very year ("+partner:Sam" etc.): a new partner/child/pet is fine. */
  changes?: string[];
}

export function peopleIssues(text: string, now: LifeNow, allow: PeopleAllow = {}): Issue[] {
  const issues: Issue[] = [];
  if (!text) return issues;
  const ch = allow.changes ?? [];
  const partner = here(now, "partner")[0];
  const exes = now.people.filter((p) => p.role === "partner" && p.status === "ended");
  for (const s of sentences(text)) {
    const pm = s.match(PARTNER_RE);
    if (pm && !partner && !ch.some((c) => c.startsWith("+partner") || c.startsWith("-partner")) && !/\bex[- ]/i.test(s) && !exes.some((e) => s.includes(e.name)))
      issues.push({ kind: "partner", msg: `mentions "${pm[0]}" but there is no partner in this life in ${now.year}${exes.length ? ` (${exes.at(-1)!.name} left in ${exes.at(-1)!.until})` : ""}` });
    const cm = s.match(CHILD_RE);
    if (cm && !here(now, "child").length && !ch.some((c) => c.startsWith("+child")) && !EXPECTING_RE.test(s))
      issues.push({ kind: "child", msg: `mentions "${cm[0]}" but they have no children in ${now.year}` });
    let petNamed = false;
    for (const p of now.people.filter((x) => x.role === "pet" && x.status === "gone")) {
      if (new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s) && !MEMORY_RE.test(s)) {
        issues.push({ kind: "pet", msg: `${p.name} (${p.relation}) left the story in ${p.until} (old age); don't bring ${p.name} back` });
        petNamed = true;
      }
    }
    const petm = s.match(PET_RE);
    if (petm && !petNamed && !ch.some((c) => c.startsWith("+pet")) && !MEMORY_RE.test(s)) {
      const sp = /cat|kitten/i.test(petm[1]!) ? "cat" : "dog";
      if (!here(now, "pet").some((p) => p.relation === sp) && now.people.some((p) => p.role === "pet"))
        issues.push({ kind: "pet", msg: `mentions "${petm[0]}" but no ${sp} is alive in this life in ${now.year}` });
    }
  }
  // counts that can't be rewritten ("your two kids" with one child)
  const nKids = here(now, "child").length;
  for (const m of text.matchAll(COUNT_RE)) {
    const said = m[1] ? numFrom(m[1]) : 2;
    if (said !== null && said !== nKids && !(nKids === 0 && EXPECTING_RE.test(text)))
      issues.push({ kind: "count", msg: `says "${m[0]}" but they have ${nKids} ${nKids === 1 ? "child" : "children"} in ${now.year}` });
  }
  // ages that still don't match (after fixPeopleNumbers these are relation mentions with 2+ kids)
  const kids = here(now, "child").filter((k) => k.ageKnown);
  for (const m of ageMentions(text, now.people.filter((p) => p.ageKnown && !p.generic && p.role !== "pet").map((p) => p.name.split(/\s+/)[0]!))) {
    if (m.byRelation) {
      if (kids.length && !kids.some((k) => Math.abs(ageOf(k, now.year)! - m.age) <= 1))
        issues.push({ kind: "age", msg: `"${m.age}-year-old ${m.who}": their children are ${kids.map((k) => `${k.name} ${ageOf(k, now.year)}`).join(", ")} in ${now.year}` });
      continue;
    }
    const p = now.people.find((x) => x.name.split(/\s+/)[0] === m.who && x.ageKnown);
    const age = p ? ageOf(p, now.year) : null;
    if (age !== null && Math.abs(age - m.age) > 1) issues.push({ kind: "age", msg: `${m.who} is ${age} in ${now.year}, not ${m.age}` });
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Place, employer, retirement (decisions)
// ---------------------------------------------------------------------------------------------

const MOVE_CUE = /\b(back|return\w*|again|old|former|formerly|used to|left|leave|visit\w*|trip|offer\w*|move|moving|moved|relocat\w*|from|miss\w*|years ago|once|remote|fly|flight|transfer\w*|wants you|calls?|emails?|messages?|recruit\w*|invit\w*|asks?)\b/i;

function employerOf(work: string): string | null {
  const at = work.match(/\b(?:at|for|with)\s+((?:[A-Z][\p{L}&.'-]*\s?){1,4})/u)?.[1]?.trim();
  if (at && at.length > 2) return at;
  const comma = work.match(/,\s*((?:[A-Z][\p{L}&.'-]*\s?){1,4})$/u)?.[1]?.trim();
  return comma && comma.length > 2 ? comma : null;
}

const EMP_CUE = /\b(back|return\w*|again|old|former|formerly|used to|left|years ago|once|miss\w*|ex-)\b/i;
const STALE_WORDS = new Set(["the", "a", "an", "your", "own", "home", "remote", "startup", "company", "firm", "studio", "clinic", "hospital", "school", "university"]);

/** A decision (or chat line) that contradicts where they live, where they work, or retirement. */
export function stateIssues(text: string, now: LifeNow): Issue[] {
  const issues: Issue[] = [];
  const cur = cityOf(now.place);
  const ss = sentences(text);
  // "It's 2036 in San Francisco." when they live in Pittsburgh
  for (const s of ss) {
    const m = s.match(/\b(?:it's|it is)\s+(?:\w+\s+)?\d{4},?\s+in\s+([A-Z][\p{L}.' -]+?)(?:[,.;:!?]|\s+and\b|\s+where\b|$)/iu);
    if (m) {
      const c = cityOf(m[1]!);
      const placeWords = `${now.place}`.toLowerCase();
      if (c && c !== cur && !placeWords.includes(c) && !/^(the|your|a)\b/i.test(m[1]!))
        issues.push({ kind: "place", msg: `sets the scene in ${m[1]}, but they live in ${now.place} (since ${now.placeSince})` });
    }
  }
  for (const pp of now.pastPlaces) {
    const city = (pp.place.split(",")[0] ?? "").trim();
    if (!city || cityOf(city) === cur || city.length < 3) continue;
    // "in/into/at/around San Francisco", "your San Francisco flat": being there, not "an Osaka firm"
    const re = new RegExp(`\\b(?:in|into|at|around|across|here in|life in|years in|your)\\s+(?:the\\s+)?${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    for (const s of ss) {
      if (re.test(s) && !MOVE_CUE.test(s) && !issues.some((i) => i.kind === "place"))
        issues.push({ kind: "place", msg: `talks as if they're in ${city}, but they left in ${pp.to + 1} and live in ${now.place}` });
    }
  }
  const curEmp = employerOf(now.work)?.toLowerCase() ?? "";
  for (const w of now.pastWork) {
    const emp = employerOf(w.work);
    if (!emp || STALE_WORDS.has(emp.toLowerCase()) || curEmp.includes(emp.toLowerCase()) || now.work.toLowerCase().includes(emp.toLowerCase())) continue;
    const re = new RegExp(`\\b${emp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    for (const s of ss) {
      if (re.test(s) && !EMP_CUE.test(s) && !issues.some((i) => i.kind === "employer"))
        issues.push({ kind: "employer", msg: `talks as if they still work at ${emp}, but now: ${now.work}` });
    }
  }
  if (now.retired) {
    const job = /\b(promot\w*|director|VP\b|vice president|head of|your boss|your manager|your team\b|job offer|offers? you (?:a |the )?(?:job|role|post|position|contract)|a raise|performance review|hiring|your shift|overtime|charge nurse|lead role|partner track|tenure)\b/i;
    const ok = /\b(out of retirement|come back|unretire\w*|part[- ]time|consult\w*|volunteer\w*|retired|retirement)\b/i;
    for (const s of ss) {
      const m = s.match(job);
      if (m && !ok.test(text)) {
        issues.push({ kind: "retired", msg: `offers work ("${m[0]}") but they retired (${now.work}, since ${now.workSince}); if it's about coming out of retirement, say so` });
        break;
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------------------------
// Repeated fork subjects (big) and repeated framings (small)
// ---------------------------------------------------------------------------------------------

const STOP = new Set(
  "a an and are as at be been but by can do does for from had has have he her his i if in into is it its it's me my no not of on or our she so than that the their them then there they this to too up was we were what when where which who why will with would you your you're yours just now still more most some any all one two also about over after before".split(" "),
);
const CAP_STOP = new Set(["It's", "It", "You", "Your", "I", "The", "A", "An", "What", "Which", "Do", "Does", "Will", "Would", "How", "Who", "When", "Where", "Why", "This", "That", "He", "She", "They", "We", "And", "But", "Or", "In", "On", "At", "By", "For", "If", "As", "Now", "Then", "So", "After", "Before", "Mom", "Dad", "Mum", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December", "Christmas", "New", "Year"]);

export function contentWords(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s']/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)),
  );
}

export function similarity(a: string, b: string): number {
  const A = contentWords(a);
  const B = contentWords(b);
  if (!A.size || !B.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Capitalised names in a text: `mid` = mid-sentence only (surely names), `all` = also sentence-initial. */
function distinctiveNames(s: string, exclude: Set<string>): { mid: Set<string>; all: Set<string> } {
  const mid = new Set<string>();
  const all = new Set<string>();
  for (const m of ` ${s}`.matchAll(/([.!?;:]\s+|^\s*|\s)([A-Z][\p{L}'-]{2,}(?:\s+[A-Z][\p{L}'-]{2,})*)/gu)) {
    const w = m[2]!;
    const first = w.split(/\s+/)[0]!;
    if (CAP_STOP.has(first) || exclude.has(w.toLowerCase()) || exclude.has(first.toLowerCase())) continue;
    all.add(w.toLowerCase());
    // (the text is matched with a leading space: the first word is sentence-initial, not mid-sentence)
    if (m[1] === " " && m.index > 0) mid.add(w.toLowerCase());
  }
  // Acronyms are names too ("the UK job", "a UX contract"): two letters were skipped above.
  for (const m of s.matchAll(/\b([A-Z]{2,5})s?\b/g)) {
    const w = m[1]!.toLowerCase();
    if (ACRONYM_STOP.has(m[1]!) || exclude.has(w)) continue;
    all.add(w);
    mid.add(w);
  }
  return { mid, all };
}
const ACRONYM_STOP = new Set(["I", "OK", "TV", "AM", "PM", "ID"]);

/**
 * Framed as the subject coming back on purpose. Narrow on purpose: "still" and "this time" used to
 * excuse any repeat ("You're still at the bank..."), and the QA run re-offered the UK job that way.
 */
const REVISIT = /\b(again|once more|second time|another (?:offer|chance)|comes? back|came back|resurfac\w*|\d+ years (?:on|later|after)|(?:two|three|four|five|six|seven|eight|nine|ten|years) (?:years )?(?:on|later)|years ago|revisit\w*|reopen\w*|return\w* to the|back to the (?:idea|offer|question))\b/i;

/** A big card whose subject repeats an earlier fork's, without being framed as a revisit. */
export function repeatTopicIssues(card: Pick<Decision, "prompt">, earlier: Pick<Decision, "kind" | "prompt" | "age">[], now: LifeNow, firstName = ""): Issue[] {
  const exclude = new Set<string>([
    firstName.toLowerCase(),
    ...now.place.toLowerCase().split(/,\s*/),
    // places they have lived are settings, not subjects
    ...now.pastPlaces.flatMap((p) => p.place.toLowerCase().split(/,\s*/)),
    ...now.people.map((p) => p.name.toLowerCase()),
    ...now.people.map((p) => p.name.split(/\s+/)[0]!.toLowerCase()),
    ...now.work.split(/[\s,]+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w.toLowerCase()),
  ]);
  const text = card.prompt;
  if (REVISIT.test(text)) return [];
  const mine = distinctiveNames(text, exclude);
  for (const d of earlier.filter((x) => x.kind === "big")) {
    const theirs = distinctiveNames(d.prompt, exclude);
    const shared = [...mine.all].filter((w) => theirs.all.has(w) && (mine.mid.has(w) || theirs.mid.has(w)));
    const sim = similarity(text, d.prompt);
    if (shared.length || sim >= 0.34)
      return [{ kind: "repeat_topic", msg: `repeats the subject of the fork at ${d.age} ("${d.prompt.slice(0, 90)}"${shared.length ? `; both about ${shared.join(", ")}` : ""}). Make this card about something new in their life now, or frame it explicitly as that subject coming back years later` }];
  }
  return [];
}

/** Framing buckets (time of day, setting, device) for small cards. */
const FRAMINGS: [string, RegExp][] = [
  ["late night (2am, past midnight)", /\b(?:1[01]\s?(?:pm|p\.m\.)|[1-4]\s?(?:am|a\.m\.)|[1-4]:\d\d\s?(?:am|a\.m\.)|(?:one|two|three|four) (?:in the morning|a\.?m\.?)|midnight|middle of the night|late at night|late-night|can't sleep|cannot sleep|insomnia|wee hours|lying awake|awake at|in the dark)\b/i],
  ["early morning", /\b(?:dawn|sunrise|[5-7]\s?(?:am|a\.m\.)|early morning|before work|first light)\b/i],
  ["weekend morning", /\b(?:sunday|saturday)\s+(?:morning|brunch)\b/i],
  ["Sunday", /\bsunday\b/i],
  ["kitchen table", /\bkitchen (?:table|counter)\b/i],
  ["commute", /\b(?:train|bus|subway|metro|commute|tram|jeepney|in traffic|driving home|on the drive)\b/i],
  ["phone call", /\b(?:calls you|phone (?:call|rings|buzzes)|on the phone|voicemail|video call|facetime)\b/i],
  ["text message", /\b(?:texts? you|a text|group chat|message from|messages you|whatsapp|dm)\b/i],
  ["dinner table", /\b(?:over dinner|at dinner|family dinner|dinner table|sunday lunch)\b/i],
  ["bank app / bills", /\b(?:bank (?:app|balance|statement|account)|bills?|rent is due|payday|paycheck|credit card)\b/i],
  ["birthday / holiday", /\b(?:birthday|christmas|new year|holiday|thanksgiving|anniversary|reunion)\b/i],
  ["inbox / email", /\b(?:email|inbox|linkedin)\b/i],
];

export function framingsOf(text: string): string[] {
  return FRAMINGS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

/** Framings used by recent small cards (newest last) that the next card must avoid. */
export function recentFramings(cards: Pick<Decision, "prompt">[], n = 6): string[] {
  return [...new Set(cards.slice(-n).flatMap((d) => framingsOf(d.prompt)))];
}

export function framingIssues(prompt: string, recent: Pick<Decision, "prompt">[]): Issue[] {
  const mine = framingsOf(prompt);
  const last3 = new Set(recent.slice(-3).flatMap((d) => framingsOf(d.prompt)));
  const last6 = new Set(recent.slice(-6).flatMap((d) => framingsOf(d.prompt)));
  const clash = mine.filter((f) => last3.has(f) || (f.startsWith("late night") && last6.has(f)));
  return clash.length ? [{ kind: "framing", msg: `reuses a recent framing (${clash.join(", ")}); set it at another moment of their day` }] : [];
}

/** First sentence with a number of `${NUM}` kids, exported for tests. */
export const NUM_PATTERN = NUM;

// ---------------------------------------------------------------------------------------------
// Big decisions against the life as it stands AND every fork already taken (final QA, Sat Nov 7)
//
// The QA run's forks forgot earlier choices: Sam (5 years a product designer) was offered "a junior
// UX contract"; Sam's card at 32 said "in Chicago" with the bio in San Francisco; Chidi was offered
// "take the UK contract / stay at the bank" three years after taking the UK job; Chidi's card at 49
// ignored the academy he founded at 47; Margo's first three forks all had the same sabbatical.
// ---------------------------------------------------------------------------------------------

/** A fork already taken in this life: what was asked, what they chose, their own words. */
export interface ForkTaken {
  id: string;
  year: number;
  age: number;
  prompt: string;
  /** Chosen path: branch title / label (or their own words). */
  title: string;
  label: string;
  said: string | null;
  own: boolean;
  options: { id: string; label: string; title: string }[];
  chosenId: string | null;
}

/** Every answered fork before (or in) `uptoYear`, oldest first. */
export function forksFrom(state: Pick<SessionState, "decisions" | "answers">, uptoYear = 9999, exceptId?: string): ForkTaken[] {
  return state.decisions
    .filter((d) => d.kind === "big" && d.status === "answered" && d.year <= uptoYear && d.id !== exceptId)
    .sort((a, b) => a.year - b.year)
    .map((d) => {
      const a = state.answers.find((x) => x.decisionId === d.id);
      const c = chosenOf(d, a);
      return {
        id: d.id, year: d.year, age: d.age, prompt: d.prompt, title: c.title, label: c.label, said: c.said, own: c.own,
        options: d.options.map((o) => ({ id: o.id, label: o.label, title: o.branchTitle ?? o.label })),
        chosenId: c.option?.id ?? null,
      };
    });
}

/** Words that name no particular thing (every option of every fork has them). */
const FORK_GENERIC = new Set(
  (
    "job jobs role roles offer offers work works working career careers position post time life year years month months week weeks day days money family people thing things way plan plans new now today next current " +
    "full-time part-time full part own take takes taking taken stay stays staying keep keeps keeping leave leaves leaving left quit quits quitting move moves moving moved go goes going start starts starting " +
    "build builds building make makes making get gets let say ask try tries trying find finds give gives put turn turns accept accepts join joins launch launches found founds code codes run runs open opens " +
    "steady safe safer bigger big small little more less first last real really whole every each other another better best good great " +
    "startup company business firm side weekends weekend evenings instead rather still back home here there " +
    "lead leads leading senior track team teams head promotion raise pay hand hands step steps off down out set sets"
  ).split(/\s+/),
);
/** Light stemmer, two passes: "engineering"/"engineer" -> "engine", "teaching"/"teacher" -> "teach", "nursing"/"nurse" -> "nurs". */
function stemW(w0: string): string {
  let w = w0.replace(/'s$/, "");
  for (let i = 0; i < 2 && w.length > 4; i++) {
    const next = w.replace(/(?:ments?|ings?|ers?|ors?|ants?|ions?|ed|es|s|e)$/, "");
    if (next.length < 3 || next === w) break;
    w = next;
  }
  return w;
}

/** The things a phrase is about: content words + acronyms, minus generic words and the given exclusions. */
function objectsOf(s: string, exclude: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const m of s.matchAll(/\b([A-Z]{2,5})s?\b/g)) if (!ACRONYM_STOP.has(m[1]!) && !exclude.has(m[1]!.toLowerCase())) out.add(m[1]!.toLowerCase());
  for (const w of contentWords(s)) {
    const st = stemW(w);
    if (!FORK_GENERIC.has(w) && !exclude.has(w) && !exclude.has(st)) out.add(st);
  }
  return out;
}

/** Clauses of an option ("Take the agency contract and keep freelancing" -> two). */
const clausesOf = (s: string) => s.split(/\s*(?:[,;.]|\band\b|\bbut\b|\bwhile\b|\bthen\b)\s*/i).filter((x) => x.trim().length > 2);

/** The kind of life an option points to (money lanes), when it is a distinctive one. */
function themeOf(s: string): string | null {
  const l = laneOf(s, "theme");
  return l === "venture_hit" || l === "venture_miss" ? "venture" : l && l !== "climb" && l !== "careful" ? l : null;
}
const jaccard = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n / (a.size + b.size - n);
};
const shared = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x));

/** Proper names and acronyms in a phrase (the distinctive subject of an option): mid-sentence only, since options start with a verb ("Take ..."). */
function namesOf(s: string, exclude: Set<string>): Set<string> {
  const { mid } = distinctiveNames(s, exclude);
  return new Set([...mid].flatMap((n) => n.split(/\s+/)).filter((n) => !exclude.has(n)));
}

const ADOPT = /\b(take|taking|accept\w*|join\w*|sign\w*|start\w*|found\w*|launch\w*|open\w*|build\w*|move to|moving to|relocat\w*|go (?:to|for)|apply\w*|enrol\w*|say yes)\b/i;
/** The next step inside a path already taken is not "choosing it again" ("Take the UK lead role"). */
const STEP_UP = /\b(lead|senior|promot\w*|director|head of|principal|partner(?:ship)?|manag\w*|expand\w*|grow\w*|scal(?:e|ing)\w*|second|bigger|raise|equity|co-?found\w*|sell\w*|exit|hire\w*|full[- ]time|permanent)\b/i;
const STAY_AT = /\b(stay\w*|keep\w*|remain\w*|stick\w*|hold on to)\b/i;
const SIDE = /\b(on (?:the )?weekends?|on the side|side project|evenings|nights|part[- ]time|after work|spare time|as a hobby)\b/i;
const FULL = /\b(full[- ]time|all in|all-in|quit\w*)\b/i;
const WORK_TALK = /\b(job|career|role|compan\w*|firm|business|startup|promot\w*|boss|salary|contract|client\w*|hiring|quit\w*|resign\w*|employer|position|venture|founder|consult\w*|freelanc\w*|recruit\w*|job offer|offers? you (?:a|the) (?:job|role|post|position|contract))\b/i;
const JUNIOR = /\b(junior|entry[- ]level|intern(?:ship)?s?|trainee\w*|graduate (?:scheme|program\w*|role|job)|first (?:real |proper |full[- ]time )?job|land (?:a|your first) job|job[- ]hunt\w*|apply(?:ing)? for (?:jobs|roles|positions)|applied for (?:the|a|that) (?:job|role|position))\b/i;
const JUNIOR_OK = /\b(mentor\w*|hir(?:e|es|ing)|manag\w*|lead\w*|train(?:s|ing)? (?:a|the|your)|coach\w*|onboard\w*|supervis\w*|your interns?|their interns?)\s+(?:\w+\s+){0,2}$/i;
const CHANGE_CAREER = /\b(pivot\w*|switch(?:ing)? (?:careers?|fields?)|change careers?|career change|start(?:ing)? over|retrain\w*|back to school|from scratch|new field|step(?:ping)? down|step(?:ping)? back|downshift\w*|a different field)\b/i;
const NOT_ESTABLISHED = /\b(student|studying|between jobs|unemployed|looking for|job[- ]hunt\w*|not stated|graduat\w*|intern\w*|seeking|job search\w*|out of work|laid off|gap year|freshly)\b/i;

/**
 * What's wrong with a big card given the life as it stands (`now`, the ledger at the fork's year)
 * and every fork already taken (`forks`, with what they chose and what they said):
 *   - place / employer / retirement, in the question AND each option (stateIssues)
 *   - a stage they've passed: an entry-level / junior step after years in their work
 *   - an option that offers what they already chose ("Take the UK contract" after "Take UK remote role")
 *   - an option to stay with what they left ("Stay at the bank" after leaving it)
 *   - the subject or an option of an earlier fork again (repeatTopicIssues + option overlap,
 *     strictest for the last two forks)
 *   - a work question that ignores what they do now and the latest fork ("the academy at 47")
 *   - two options that are the same choice in other words
 */
export function forkIssues(
  card: Pick<Decision, "prompt" | "whyAsking" | "options" | "domains">,
  now: LifeNow,
  forks: ForkTaken[],
  opts: { firstName?: string; earlier?: Decision[] } = {},
): Issue[] {
  const issues: Issue[] = [];
  const push = (i: Issue) => {
    if (!issues.some((x) => x.kind === i.kind && x.msg === i.msg)) issues.push(i);
  };
  const optText = (o: Decision["options"][number]) => `${o.label}. ${o.branchTitle ?? ""}. ${o.hint ?? ""}`;
  const all = [card.prompt, card.whyAsking, ...card.options.map(optText)].join(" ");
  const placeWords = new Set([...now.place.toLowerCase().split(/[,\s]+/), ...now.pastPlaces.flatMap((p) => p.place.toLowerCase().split(/[,\s]+/))].filter((w) => w.length > 1));
  const peopleWords = new Set(now.people.flatMap((p) => p.name.toLowerCase().replace(/^your\s+/, "").split(/\s+/)));
  const firstName = (opts.firstName ?? "").toLowerCase();
  const exclude = new Set([...placeWords, ...peopleWords, firstName].filter(Boolean));
  const revisit = REVISIT.test(card.prompt);

  // 1. place, employer, retirement: the question and every option
  for (const i of stateIssues(`${card.prompt} ${card.whyAsking}`, now)) push(i);
  for (const o of card.options) for (const i of stateIssues(o.label, now).filter((x) => x.kind !== "place" || !MOVE_CUE.test(o.label))) push({ ...i, msg: `option "${o.label}": ${i.msg}` });

  // 2. a stage they've passed
  const established = !NOT_ESTABLISHED.test(now.work) && !now.retired && (now.year - now.workSince >= 2 || now.pastWork.length > 0 || now.age >= 30);
  if (established) {
    for (const s of [card.prompt, ...card.options.map((o) => `${o.label}. ${o.hint ?? ""}`)]) {
      const m = JUNIOR.exec(s);
      if (m && !JUNIOR_OK.test(s.slice(0, m.index)) && !CHANGE_CAREER.test(s)) {
        push({ kind: "work_stage", msg: `offers an entry-level step ("${m[0]}") but they are ${now.work} (since ${now.workSince}); fork on the next real step from where they are, or frame it explicitly as a career change` });
        break;
      }
    }
  }

  // 3. what they already chose, offered again; 4. what they left, offered as "stay"
  const leftWork = now.pastWork.map((w) => w.work).filter((w) => !now.work.toLowerCase().includes(w.toLowerCase()));
  const curObjects = objectsOf(now.work, exclude);
  for (const o of card.options) {
    const label = `${o.label}. ${o.branchTitle ?? ""}`;
    const mine = objectsOf(label, exclude);
    const myNames = namesOf(label, exclude);
    if (!revisit && ADOPT.test(label)) {
      for (const f of forks) {
        const theirs = `${f.title}. ${f.label}. ${f.said ?? ""}`;
        if (STEP_UP.test(label) && !STEP_UP.test(theirs)) continue;
        const names = shared(myNames, namesOf(theirs, exclude));
        const objs = objectsOf(theirs, exclude);
        if (names.length || (mine.size && jaccard(mine, objs) >= 0.5)) {
          push({ kind: "repeat_chosen", msg: `option "${o.label}" offers what they already chose at ${f.age} ("${f.title}"${f.said ? `; in their words: "${f.said.slice(0, 120)}"` : ""}). They live that now: fork on what comes next inside it, not on choosing it again` });
          break;
        }
      }
    }
    // only the clause that stays ("Take the agency contract and keep freelancing": "keep freelancing")
    for (const cl of clausesOf(o.label).filter((x) => STAY_AT.test(x))) {
      const objs = objectsOf(cl, exclude);
      const w = leftWork.find((x) => shared(objs, objectsOf(x, new Set([...exclude, ...curObjects]))).length);
      if (w) {
        push({ kind: "left_behind", msg: `option "${o.label}" stays with ${shared(objs, objectsOf(w, new Set([...exclude, ...curObjects]))).join(", ")}, but they left that (${w}); now: ${now.work}` });
        break;
      }
    }
  }

  // 5. an earlier fork's subject or option again (the last two forks most strictly)
  for (const i of repeatTopicIssues(card, opts.earlier ?? forks.map((f) => ({ kind: "big" as const, prompt: f.prompt, age: f.age })), now, opts.firstName ?? "")) push(i);
  if (!revisit) {
    const recent = forks.slice(-2);
    // What they chose is their life now, and the places and jobs of their life are settings, not
    // subjects ("Partner with a bank" after "Quit the bank" is a new choice).
    const lived = new Set(forks.flatMap((f) => [...objectsOf(`${f.title}. ${f.label}. ${f.said ?? ""}`, exclude)]));
    const settings = new Set(now.pastWork.flatMap((w) => [...objectsOf(w.work, exclude)]));
    const skip = new Set([...exclude, ...curObjects, ...lived, ...settings]);
    outer: for (const o of card.options) {
      const label = `${o.label}. ${o.branchTitle ?? ""}`;
      const mine = objectsOf(label, skip);
      if (!mine.size) continue;
      const myNames = namesOf(label, skip);
      const theme = themeOf(label);
      for (const f of forks) {
        const close = recent.includes(f);
        for (const e of f.options) {
          if (e.id === f.chosenId) continue;
          const theirLabel = `${e.label}. ${e.title}`;
          const theirs = objectsOf(theirLabel, skip);
          const j = jaccard(mine, theirs);
          const both = shared(mine, theirs);
          // The last two forks: the same named place or thing, or the same kind of life sharing a
          // subject (a sabbatical to travel, again); older forks: near-identical options only.
          const named = shared(myNames, namesOf(theirLabel, skip)).length > 0;
          const sameTheme = !!theme && theme === themeOf(theirLabel) && both.length > 0;
          if ((close && (named || sameTheme || j >= 0.34)) || j >= 0.5) {
            push({ kind: "repeat_option", msg: `option "${o.label}" repeats "${e.label}" from the fork at ${f.age} (${both.join(", ")}); every fork brings new choices, unless the card says this is that idea coming back years later` });
            continue outer;
          }
        }
      }
    }
  }

  // 6. a work question that ignores what they do now and the latest fork. Not the first fork (it is
  // about the crossroads they named), and "between jobs" or "a student" is no work to build on.
  const last = forks.at(-1);
  if (forks.length && (card.domains[0] === "career" || WORK_TALK.test(card.prompt))) {
    const settledWork = !NOT_ESTABLISHED.test(now.work) && now.work !== "(not stated)";
    const anchors = new Set([...(settledWork ? curObjects : []), ...(last && now.year - last.year <= 5 ? objectsOf(`${last.title}. ${last.label}. ${last.said ?? ""}`, exclude) : [])]);
    const cardObjects = objectsOf(all, new Set());
    if (anchors.size && !shared(cardObjects, anchors).length && !now.retired)
      push({
        kind: "ignores_now",
        msg: `a work question that ignores what they do now (${now.work}, since ${now.workSince})${last ? ` and their latest fork ("${last.title}" at ${last.age})` : ""}: build this fork on that life`,
      });
  }

  // 7. two options that are one choice in other words
  // (what they do now is in every option: "fintech now" vs "fintech full-time" differ in nothing else)
  const dupSkip = new Set([...exclude, ...curObjects]);
  const os = card.options.map((o) => ({ o, t: `${o.label}. ${o.branchTitle ?? ""}`, objs: objectsOf(`${o.label}. ${o.branchTitle ?? ""}`, dupSkip) }));
  for (let i = 0; i < os.length; i++)
    for (let k = i + 1; k < os.length; k++) {
      const a = os[i]!;
      const b = os[k]!;
      const sameTitle = norm(a.o.branchTitle ?? "") !== "" && norm(a.o.branchTitle ?? "") === norm(b.o.branchTitle ?? "");
      const contrast = SIDE.test(a.t) !== SIDE.test(b.t) && (FULL.test(a.t) || FULL.test(b.t) || SIDE.test(a.t) || SIDE.test(b.t));
      const both = shared(a.objs, b.objs).length;
      const sameThing = jaccard(a.objs, b.objs) >= 0.5 && (both >= 2 || (a.objs.size === 1 && b.objs.size === 1));
      if (sameTitle || similarity(a.o.label, b.o.label) >= 0.5 || (!contrast && sameThing)) {
        push({ kind: "same_options", msg: `options "${a.o.label}" and "${b.o.label}" are the same choice in other words; make each of the four a genuinely different life` });
      }
    }
  return issues;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---------------------------------------------------------------------------------------------
// Whole-life content checks (eval / admin): repeated catastrophes, work-only forks
// ---------------------------------------------------------------------------------------------

/** A catastrophe kind (flood, break-in, scam, pandemic...) written twice in one life's years. */
export function repeatedCatastrophes(years: SimYear[]): Issue[] {
  const first = new Map<string, number>();
  const out: Issue[] = [];
  for (const y of [...years].sort((a, b) => a.year - b.year)) {
    for (const e of y.events) {
      for (const k of catastrophesIn(`${e.title}. ${e.narrative}`)) {
        const at = first.get(k);
        if (at === undefined) first.set(k, y.year);
        else if (at !== y.year) out.push({ kind: "catastrophe", msg: `${y.year} "${e.title}": a second ${k.replace("_", " ")} in this life (first ${at})` });
      }
    }
  }
  return out;
}

/** Three or more big forks in a row whose main domain is work. */
export function workStreaks(bigs: Pick<Decision, "year" | "domains">[]): Issue[] {
  const out: Issue[] = [];
  let run = 0;
  for (const d of [...bigs].sort((a, b) => a.year - b.year)) {
    run = d.domains[0] === "career" ? run + 1 : 0;
    if (run >= 3) out.push({ kind: "work_streak", msg: `${d.year}: work fork ${run} in a row` });
  }
  return out;
}
