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
import type { Decision } from "../../shared/sim";
import { ageMentions, ageOf, cityOf, here, NUM, numFrom, numLike, type LifeNow } from "./ledger";
import { sentences } from "./util";

export type IssueKind = "age" | "count" | "partner" | "child" | "pet" | "place" | "employer" | "retired" | "repeat_topic" | "framing" | "duplicate" | "past_time";
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
    for (const p of now.people.filter((x) => x.role === "pet" && x.status === "gone")) {
      if (new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(s) && !MEMORY_RE.test(s))
        issues.push({ kind: "pet", msg: `${p.name} (${p.relation}) left the story in ${p.until} (old age); don't bring ${p.name} back` });
    }
    const petm = s.match(PET_RE);
    if (petm && !ch.some((c) => c.startsWith("+pet")) && !MEMORY_RE.test(s)) {
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
    if (m[1] === " " ) mid.add(w.toLowerCase());
  }
  return { mid, all };
}

const REVISIT = /\b(again|back|still|second time|once more|years? (?:after|later|since)|revisit\w*|return\w*|another (?:offer|chance)|this time|comes? back|reopen\w*|years ago)\b/i;

/** A big card whose subject repeats an earlier fork's, without being framed as a revisit. */
export function repeatTopicIssues(card: Pick<Decision, "prompt" | "options">, earlier: Decision[], now: LifeNow, firstName = ""): Issue[] {
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
