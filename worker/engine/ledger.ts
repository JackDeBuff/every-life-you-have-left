/**
 * The life ledger: code-owned facts about a life (the chosen one or a branch) at any year.
 *   - where they live and since when, where they used to live
 *   - what they do (work line, retired or not), what they used to do
 *   - the people: partner, children, pets, parents, siblings, each with a birth year and a status
 *   - the forks taken so far
 * Ages are always derived here (year - born), never by a model. Pets get a real lifespan and leave
 * the story off-screen. Every generator gets this as the "NOW" block (nowBlock), the validators
 * check text against it (consistency.ts), and scene people are rebuilt from it.
 *
 * The engine is stateless, so the ledger is REBUILT by replaying years: each SimYear written by
 * the engine carries `life` (YearLife): the work line and the people changes it made ("ch"). Years
 * without it (old sessions, code filler years) fall back to inference from event categories.
 */
import type { Profile } from "../../shared/schema";
import type { Branch, SceneSpec, SessionState, SimYear } from "../../shared/sim";
import { chosenOf, peopleSaid } from "./answers";
import { nameCandidates, type NameRole } from "./names";
import { clamp, hash32 } from "./util";

export type Role = "partner" | "child" | "pet" | "parent" | "sibling" | "grandchild" | "other";

export interface LedgerPerson {
  key: string;
  /** "Bea", "Barnaby", or a stand-in like "your partner" when no name is known. */
  name: string;
  /** True when name is a stand-in ("your partner"), not a real name. */
  generic: boolean;
  role: Role;
  /** "daughter", "dog", "wife", "mother", "younger sister"... */
  relation: string;
  born: number | null;
  /** born came from something stated (start line, a birth, a stated age); else an estimate. */
  ageKnown: boolean;
  since: number;
  /** "drifted": a friend they lost touch with (said so, or a place/job left years ago). Not in People, never a card option; may come back as a reunion. */
  status: "here" | "ended" | "gone" | "drifted";
  until: number | null;
  /** Pets: the year old age takes them (code-owned). */
  goneAt: number | null;
  /** 0..1, code-owned. Friends decay with time and (faster) distance unless renewed; household and parents don't. */
  closeness: number;
  /** The last year they were renewed (named by the user, or in the life's own text). */
  lastContact: number;
  /** Friends: the city (cityOf) they belong to; set the first year they are in the life. */
  anchor: string | null;
  /** Colleagues: the work line they came with (norm); a new job fades them like a move. */
  anchorWork: string | null;
}

/**
 * What each engine-written SimYear carries in addition to the contract.
 * CONTRACT-REQUEST: add `life: YearLife | null` to SimYear in shared/sim.ts. Until then it rides
 * along as an extra field (the agent stores years as plain JSON, so it reaches the UI intact).
 * UI: read `year.life.work` for the bio's Work row and `year.life.people` for the People chips.
 */
export interface YearLife {
  /** What they do this year, <= 8 words: "Senior nurse, St. Luke's ER", "Retired". */
  work: string;
  /** People changes made this year, normalised: "+partner:Sam", "-partner:Sam", "+child:Bea", "+pet:dog:Barnaby", "-pet:Barnaby", "-parent:Mom", "=born:Bea:2010". */
  ch: string[];
  /** Who is in their life at the end of this year (from the ledger; ages computed in code). Friends only while close. */
  people: { name: string; role: Role; relation: string; age: number | null; closeness?: number }[];
}
export type SimYearL = SimYear & { life?: YearLife | null };
export const lifeOf = (y: SimYear): YearLife | null => (y as SimYearL).life ?? null;

export interface LifeNow {
  year: number;
  age: number;
  place: string;
  placeSince: number;
  pastPlaces: { place: string; from: number; to: number }[];
  work: string;
  workSince: number;
  pastWork: { work: string; from: number; to: number }[];
  retired: boolean;
  people: LedgerPerson[];
  money: { income: number; netWorth: number } | null;
  /** Forks taken so far, oldest first ("Take the Startup" at 21). */
  path: { year: number; age: number; title: string }[];
  /** People cues from their own words (peopleCues), applied in year order during the replay. */
  cues?: PeopleCue[];
  /** How many cues have been applied so far. */
  cueAt?: number;
  /** The year closeness was last decayed to. */
  driftAt?: number;
  /** For invented names (names.ts): the session, where they're from, their own name. */
  who?: { sessionId: string; country: string; firstName: string };
}

// ---------------------------------------------------------------------------------------------
// Numbers and stated ages
// ---------------------------------------------------------------------------------------------

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
export const NUM_WORD = `(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|${ONES.slice(1).reverse().join("|")})`;
export const NUM = `(?:\\d{1,3}|${NUM_WORD})`;

export function numFrom(s: string): number | null {
  const t = s.toLowerCase().trim();
  if (/^\d+$/.test(t)) return Number(t);
  const i = ONES.indexOf(t);
  if (i >= 0) return i;
  const m = t.match(/^([a-z]+)(?:[- ]([a-z]+))?$/);
  if (!m) return null;
  const tens = TENS.indexOf(m[1]!);
  if (tens < 2) return null;
  const ones = m[2] ? ONES.indexOf(m[2]) : 0;
  return ones < 0 || ones > 9 ? null : tens * 10 + ones;
}

/** Write n the way the original token was written (digits stay digits, words stay words). */
export function numLike(n: number, like: string): string {
  if (/^\d/.test(like)) return String(n);
  let w: string;
  if (n < 20) w = ONES[n] ?? String(n);
  else if (n < 100) w = TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : "");
  else w = String(n);
  return /^[A-Z]/.test(like) ? w[0]!.toUpperCase() + w.slice(1) : w;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Units that make a number after a name NOT an age ("Bea, 3 times a week"). */
const NOT_AGE_AFTER = `(?![\\d])(?!\\s*(?:%|percent|times|minutes?|mins?|hours?|days?|weeks?|months?|years? (?!old)|yrs? (?!old)|dollars|euros|pounds|k\\b|am\\b|pm\\b|a\\.m|p\\.m|miles|km|kilos?|kg|pages|of\\b|out of|in a row|o'clock|euro|bucks|grand|\\$))`;

export interface AgeMention {
  /** The person's name as matched, or a relation word ("daughter") for unnamed mentions. */
  who: string;
  byRelation: boolean;
  age: number;
  /** Index and text of the number token, for in-place fixes. */
  index: number;
  token: string;
}

/** Ages stated for the given names (and for "your N-year-old daughter"-style mentions). */
export function ageMentions(text: string, names: string[]): AgeMention[] {
  const out: AgeMention[] = [];
  const push = (who: string, byRelation: boolean, m: RegExpExecArray, group: number) => {
    const token = m[group]!;
    const age = numFrom(token);
    if (age === null || age > 110) return;
    const index = m.index + (m[0].startsWith(token) ? 0 : m[0].lastIndexOf(token));
    if (!out.some((x) => x.index === index)) out.push({ who, byRelation, age, index, token });
  };
  for (const name of names) {
    if (!/^[A-Z][\p{L}'-]+$/u.test(name)) continue;
    const N = esc(name);
    const res = [
      // "Bea (3)", "Dev (44, a nurse at ...)"
      new RegExp(`\\b${N}\\s*\\((${NUM})(?=\\s*[,;)])`, "g"),
      new RegExp(`\\b${N}(?:'s|,)?\\s+(?:is|was|turns|turned|just turned|who is|who's|, who's|aged|age|now)\\s+(?:now\\s+|just\\s+|almost\\s+|nearly\\s+|already\\s+)?(${NUM})\\b${NOT_AGE_AFTER}`, "gi"),
      new RegExp(`\\b${N},\\s+(${NUM})\\b${NOT_AGE_AFTER}`, "gi"),
      new RegExp(`\\b${N},?\\s+(?:he's|she's|they're|he is|she is|they are)\\s+(?:now\\s+|just\\s+|almost\\s+)?(${NUM})\\b${NOT_AGE_AFTER}`, "gi"),
      new RegExp(`\\b(${NUM})[- ]year[- ]old\\s+(?:\\w+\\s+)?${N}\\b`, "gi"),
      new RegExp(`\\b${N},?\\s+(?:a|your|now a|now)?\\s*(${NUM})[- ]year[- ]old`, "gi"),
    ];
    for (const re of res) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) {
        // case-sensitive name check (the flags above are /i for the verbs)
        if (!new RegExp(`\\b${N}\\b`).test(m[0])) continue;
        push(name, false, m, 1);
      }
    }
  }
  const rel = /\byour\s+(?:(?:eldest|oldest|youngest|little|only)\s+)?(\d{1,2}|[a-z]+(?:-[a-z]+)?)[- ]year[- ]old\s+(daughter|son|kid|child|boy|girl|twins|baby|stepdaughter|stepson)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = rel.exec(text))) if (numFrom(m[1]!) !== null) push(m[2]!.toLowerCase(), true, m, 1);
  const rel2 = new RegExp(`\\byour\\s+(daughter|son)\\s+(?:is|turns|turned|is now)\\s+(${NUM})\\b${NOT_AGE_AFTER}`, "gi");
  while ((m = rel2.exec(text))) push(m[1]!.toLowerCase(), true, m, 2);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Initial people (from the profile)
// ---------------------------------------------------------------------------------------------

export function roleOf(relation: string, label = ""): Role {
  const r = `${relation} ${label}`.toLowerCase();
  if (/\bex[- ]|\bformer\b|\bex\b/.test(r)) return "other";
  // a partner's family is not theirs ("mother-in-law", "Dev's mother")
  if (/in[- ]laws?\b|\b(?:partner|husband|wife|spouse|boyfriend|girlfriend|fianc[eé]e?)'s\b/.test(r)) return "other";
  if (/grand(son|daughter|child|kid|baby)/.test(r)) return "grandchild";
  if (/grand(mother|father|ma|pa|parent)|granny|abuela|lola|lolo/.test(r)) return "other";
  if (/\b(partner|wife|husband|spouse|girlfriend|boyfriend|fianc[eé]e?)\b/.test(r)) return "partner";
  if (/\b(son|daughter|child|children|kid|kids|baby|stepson|stepdaughter|toddler)\b/.test(r)) return "child";
  if (/\b(mother|father|mom|mum|mama|dad|papa|parent|parents|stepmother|stepfather|nanay|tatay|amma|appa)\b/.test(r)) return "parent";
  if (/\b(sister|brother|sibling)\b/.test(r)) return "sibling";
  if (/\b(dog|cat|pet|puppy|kitten|rabbit|parrot)\b/.test(r)) return "pet";
  return "other";
}

const GENERIC_NAME = /^(your |my |the )?(?:(?:younger|older|little|big|baby|elder|eldest|youngest|kid) )?(partner|wife|husband|spouse|girlfriend|boyfriend|fianc[eé]e?|mom|mum|mother|dad|father|parents?|son|daughter|child|kid|baby|sister|brother|dog|cat|pet)\b/i;
/** Relations outside the household that are still part of the life (shown in People, role "other"). */
const CLOSE_OTHER = /\b(friend|best friend|bestie|buddy|pal|mate|godmother|godfather|godparent|aunt|auntie|uncle|cousin|grandmother|grandfather|grandma|grandpa|granny|nana|abuela|abuelo|lola|lolo|mentor|roommate|flatmate|housemate|neighbou?r|classmate)\b/i;
/** People met through work: in People only when they named them in their own typed words. */
const WORK_OTHER = /\b(colleague|coworker|co-worker|teammate|work friend)\b/i;
/** Extended family: fades from the featured list with time, never silently "drifts". */
const FAMILY_OTHER = /\b(godmother|godfather|godparent|aunt|auntie|uncle|cousin|grandmother|grandfather|grandma|grandpa|granny|nana|abuela|abuelo|lola|lolo|niece|nephew)\b/i;

// ---------------------------------------------------------------------------------------------
// Closeness (owner playtest, Sat Nov 7): the same friends were offered decades later, after the
// life had moved continents. Friends now decay with time, much faster once the life left their
// city (or, for colleagues, the job), unless the user keeps naming them; below DRIFT_AT they have
// drifted (out of People, never a card option, a rare reunion at most). Household and parents
// never drift silently.
// ---------------------------------------------------------------------------------------------
/** At or above: featured, shown in People. */
export const CLOSE_MIN = 0.35;
/** Below: drifted apart. */
export const DRIFT_AT = 0.15;
const DECAY_NEAR = 0.02;
const DECAY_FAR = 0.13;
const ROLE_CLOSENESS: Record<Role, number> = { partner: 1, child: 1, pet: 0.9, parent: 0.8, sibling: 0.7, grandchild: 0.8, other: 0.6 };

/** A fresh ledger person with the closeness defaults for its role. */
function person(p: Pick<LedgerPerson, "key" | "name" | "generic" | "role" | "relation" | "born" | "ageKnown" | "since"> & Partial<LedgerPerson>): LedgerPerson {
  return { status: "here", until: null, goneAt: null, closeness: ROLE_CLOSENESS[p.role], lastContact: p.since, anchor: null, anchorWork: null, ...p };
}
/** People in a stable order: the household first (the bio shows the first five). */
const ROLE_ORDER: Record<Role, number> = { partner: 0, child: 1, pet: 2, parent: 3, sibling: 4, grandchild: 5, other: 6 };

function personKey(role: Role, name: string) {
  return `${role}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

function speciesOf(text: string): string {
  const m = text.toLowerCase().match(/\b(dog|puppy|cat|kitten|rabbit|bunny|parrot|bird|hamster|guinea pig|tortoise|turtle|fish)\b/);
  const s = m?.[1] ?? "dog";
  return s === "puppy" ? "dog" : s === "kitten" ? "cat" : s === "bunny" ? "rabbit" : s;
}

/** Years a pet stays in the story after it arrives (deterministic per name). */
export function petYears(name: string, species: string, adoptedYoung = true): number {
  const r = (hash32(`pet:${name}:${species}`) % 1000) / 1000;
  const [lo, hi] = species === "cat" ? [13, 17] : species === "dog" ? [10, 14] : species === "parrot" || species === "tortoise" || species === "turtle" ? [25, 35] : [5, 9];
  const life = Math.round(lo + r * (hi - lo));
  return adoptedYoung ? life : Math.max(3, life - 5);
}

export function initialPeople(profile: Profile): LedgerPerson[] {
  const start = profile.startYear;
  const corpus = [...profile.quotes.map((q) => q.text), ...profile.facts.map((f) => f.value)].join("\n");
  const out: LedgerPerson[] = [];
  const add = (p: Pick<LedgerPerson, "name" | "generic" | "role" | "relation" | "born" | "ageKnown"> & { goneAt?: number | null; since?: number; closeness?: number }) => {
    const key = personKey(p.role, p.name);
    if (out.some((x) => x.key === key)) return;
    const { closeness, ...rest } = p;
    out.push(person({ ...rest, key, since: p.since ?? start, goneAt: p.goneAt ?? null, ...(closeness !== undefined ? { closeness } : {}) }));
  };
  // quotes they typed themselves (a decision answer, the warm-up), as opposed to upload text
  const typed = new Set(profile.quotes.filter((q) => q.source === "answer").map((q) => q.id));
  // Someone first named in a decision answer ("d-<age>-<n>") enters the life in that decision's
  // year, not on day one (Elena, named at 29, must not be the partner of a branch forked at 21).
  const quoteYear = new Map(
    profile.quotes.map((q) => {
      const m = q.questionId?.match(/^d-(\d+)-/);
      return [q.id, m ? profile.birthYear + Number(m[1]) : start] as const;
    }),
  );
  const sinceOf = (quoteIds: string[] | undefined) => (quoteIds?.length ? Math.min(...quoteIds.map((id) => quoteYear.get(id) ?? start)) : start);
  const ageSources = [
    ...profile.quotes.map((q) => ({ text: q.text, year: quoteYear.get(q.id) ?? start })),
    ...profile.facts.map((f) => ({ text: f.value, year: sinceOf(f.quoteIds) })),
  ].sort((a, b) => a.year - b.year);
  let pluralKids = false;
  for (const pp of profile.people) {
    const role = roleOf(pp.relation, pp.label);
    // Close friends and family beyond the household are in the life too (QA: Margo's best friend
    // Hanna, from her AI export, never reached People). Exes and people met through work are not.
    // A colleague counts only when they named them in their own typed words (a CV's managers don't).
    const closeOther = CLOSE_OTHER.test(`${pp.relation} ${pp.label}`) || (WORK_OTHER.test(pp.relation) && pp.quoteIds.some((id) => typed.has(id)));
    if (role === "other" && (!closeOther || /\bex\b|\bex-|former/i.test(`${pp.relation} ${pp.label}`) || !/^[A-Z][\p{L}'-]+/u.test(pp.label.trim()) || /^(my|your|the|our)\b/i.test(pp.label.trim()))) continue;
    // a plural label ("my kids", "parents", "the girls") is several people, not one named "my kids"
    if (/\b(kids|children|sons|daughters|parents|sisters|brothers|siblings|girls|boys|twins)\b/i.test(`${pp.label} ${pp.relation}`)) {
      if (role === "parent") {
        add({ name: "your mother", generic: true, role, relation: "mother", born: profile.birthYear - 30, ageKnown: false });
        add({ name: "your father", generic: true, role, relation: "father", born: profile.birthYear - 32, ageKnown: false });
      } else if (role === "child") pluralKids = true;
      continue;
    }
    const generic = GENERIC_NAME.test(pp.label);
    // "My mother" / "mom" -> "your mother": stand-in names read the same in every prompt and chip
    const name = generic ? `your ${pp.label.trim().replace(/^(your|my|the)\s+/i, "").toLowerCase()}` : pp.label.trim();
    let born: number | null = null;
    let ageKnown = false;
    // An age counts from the year it was said: "Leo is nineteen" in an answer at 46 is not his
    // age on day one (an eval session aged Leo 11 years at once when a fold added it). The
    // earliest statement wins; facts count from their earliest quote.
    const first = name.split(/\s+/)[0]!;
    // A birth year from the profile (an age stated in their words or uploads) wins.
    if (typeof pp.born === "number" && pp.born > 1880 && pp.born <= start) (born = pp.born), (ageKnown = true);
    for (const src of ageKnown ? [] : ageSources) {
      const m = ageMentions(src.text, [first]);
      if (!m.length) continue;
      born = src.year - m[0]!.age;
      ageKnown = true;
      break;
    }
    if (!ageKnown && role === "parent") born = profile.birthYear - 30;
    const species = role === "pet" ? speciesOf(`${pp.relation} ${pp.label}`) : null;
    // how close they said they are: friends as stated; family never starts below "featured"
    const stated = typeof pp.closeness === "number" && Number.isFinite(pp.closeness) ? clamp(pp.closeness, 0, 1) : null;
    const closeness =
      role === "other" ? (WORK_OTHER.test(pp.relation) ? (stated ?? 0.45) : Math.max(0.45, stated ?? ROLE_CLOSENESS.other))
      : role === "parent" || role === "sibling" ? Math.max(0.5, stated ?? ROLE_CLOSENESS[role])
      : ROLE_CLOSENESS[role];
    add({
      since: sinceOf(pp.quoteIds),
      closeness,
      name, generic, role, relation: role === "pet" && species ? species : pp.relation.toLowerCase(), born, ageKnown,
      // a pet with a stated age lives out a real lifespan from its birth; one they "just adopted" /
      // a puppy is young; otherwise assume it's already a few years old
      goneAt:
        role === "pet" && species
          ? ageKnown && born !== null
            ? Math.max(start + 1, born + petYears(name, species, true))
            : start + petYears(name, species, /\b(just (?:adopted|got)|new (?:puppy|kitten|dog|cat)|puppy|kitten)\b/i.test(corpus))
          : null,
    });
  }
  // Pets they named in their own words but the profile didn't list as people ("I just adopted a
  // dog, Barnaby"): without this the dog never enters the ledger and lives forever.
  for (const q of profile.quotes) {
    const a = q.text.match(/\b(dog|puppy|cat|kitten|rabbit|parrot)\b,?\s+(?:named\s+|called\s+)?([A-Z][\p{L}'-]+)/u);
    const b = a ? null : q.text.match(/\b([A-Z][\p{L}'-]+),?\s+(?:my|our|the)\s+(?:[\w-]+\s+)?(dog|puppy|cat|kitten)\b/u);
    const kindWord = a?.[1] ?? b?.[2];
    const petName = a?.[2] ?? b?.[1];
    if (!kindWord || !petName || out.some((p) => p.role === "pet" && p.name.toLowerCase() === petName.toLowerCase())) continue;
    const species = speciesOf(kindWord);
    const since = quoteYear.get(q.id) ?? start;
    const young = /\b(just (?:adopted|got)|new (?:puppy|kitten|dog|cat)|puppy|kitten)\b/i.test(q.text);
    add({ since, name: petName, generic: false, role: "pet", relation: species, born: since, ageKnown: false, goneAt: since + petYears(petName, species, young) });
  }
  // The profile sometimes lists one person twice ("younger sister" and "Casey"): when a role that is
  // usually one person has exactly one stand-in and one named entry, keep the named one.
  for (const role of ["partner", "sibling"] as const) {
    const generic = out.filter((p) => p.role === role && p.generic);
    const named = out.filter((p) => p.role === role && !p.generic);
    if (generic.length === 1 && named.length === 1) {
      const g = generic[0]!;
      const n = named[0]!;
      if (!n.ageKnown && g.ageKnown) (n.born = g.born), (n.ageKnown = true);
      if (/younger|older|little|big|elder/.test(g.name)) n.relation = g.name.replace(/^your /, "");
      n.since = Math.min(n.since, g.since);
      out.splice(out.indexOf(g), 1);
    }
  }
  // A partner or children named only in facts ("Married to Jonas", "two kids, 4 and 7").
  const rel = profile.facts.find((f) => f.key === "relationship")?.value ?? "";
  if (!out.some((p) => p.role === "partner") && /partner|married|wife|husband|girlfriend|boyfriend|engaged|fianc/i.test(rel) && !/single|not married|divorced|separated|widow/i.test(rel)) {
    const nm = rel.match(/\b(?:to|with)\s+([A-Z][\p{L}'-]+)/u)?.[1];
    add({ name: nm ?? "your partner", generic: !nm, role: "partner", relation: "partner", born: null, ageKnown: false });
  }
  const kidsFact = profile.facts.find((f) => f.key === "children")?.value ?? "";
  const kidsSaid = (() => {
    const d = kidsFact.match(/\b(\d)\s+(?:kids|children|sons|daughters)\b/i);
    if (d) return Number(d[1]);
    const w = kidsFact.toLowerCase().match(/\b(one|two|three|four|both)\b[^.]{0,12}\b(kids?|children|sons?|daughters?|boys|girls)\b/);
    if (w) return w[1] === "both" ? 2 : numFrom(w[1]!) ?? 0;
    return /\b(a|one|my) (son|daughter|kid|child|boy|girl)\b/i.test(kidsFact) ? 1 : 0;
  })();
  const kidAges = [...kidsFact.matchAll(/\b(\d{1,2})\b/g)].map((m) => Number(m[1])).filter((n) => n < 60);
  const kidsWanted = Math.max(kidsSaid, pluralKids ? 2 : 0);
  for (let i = out.filter((p) => p.role === "child").length; i < kidsWanted; i++) {
    const age = kidAges[i];
    add({
      name: kidsWanted === 1 ? "your child" : i === 0 ? "your eldest" : i === kidsWanted - 1 ? "your youngest" : `your child ${i + 1}`,
      generic: true, role: "child", relation: "child",
      born: age !== undefined ? start - age : profile.birthYear + Math.min(profile.age - 1, 28 + 2 * i), ageKnown: age !== undefined,
    });
  }
  return out.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

// ---------------------------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------------------------

/** Parse and normalise a model's people-change tag. Returns null for anything unusable. */
export function normChange(raw: string, year: number): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  const born = s.match(/^=\s*born\s*:\s*([^:]+?)\s*:\s*(\d{4})$/i);
  if (born) return `=born:${born[1]}:${born[2]}`;
  const m = s.match(/^([+-])\s*([a-z ]+?)\s*:\s*(.+)$/i);
  if (!m) return null;
  const op = m[1]!;
  let kind = m[2]!.toLowerCase().trim();
  let rest = m[3]!.trim();
  if (/^(partner|spouse|wife|husband|girlfriend|boyfriend|fianc)/.test(kind)) kind = "partner";
  else if (/^(child|baby|son|daughter|kid)/.test(kind)) kind = "child";
  else if (/^(parent|mother|father|mom|mum|dad)/.test(kind)) kind = "parent";
  // "+friend:Kai[:relation]" (a friend joins or is renewed), "-friend:Kai" (they drifted apart)
  else if (/^(friend|best friend|close friend|bestie|buddy|colleague|coworker|co-worker|neighbou?r|mentor|roommate|flatmate|other)$/.test(kind)) {
    const parts = rest.split(":").map((x) => x.trim()).filter(Boolean);
    if (!parts.length || !/^\p{Lu}/u.test(parts[0]!)) return null;
    const relation = parts[1] ?? (kind === "other" ? "friend" : kind);
    return op === "+" ? `+friend:${parts[0]}:${relation}` : `-friend:${parts[0]}`;
  } else if (/^(pet|dog|cat|puppy|kitten|rabbit|parrot)/.test(kind)) {
    if (kind !== "pet") rest = `${kind}:${rest}`;
    kind = "pet";
  } else return null;
  const parts = rest.split(":").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (kind === "pet" && op === "+") {
    const species = parts.length > 1 ? speciesOf(parts[0]!) : speciesOf(rest);
    const name = (parts.length > 1 ? parts[1]! : parts[0]!).replace(/\s*\(.*\)$/, "");
    return `+pet:${species}:${name}`;
  }
  if (kind === "child" && op === "+") {
    const yr = parts.find((p) => /^\d{4}$/.test(p));
    const name = parts.find((p) => !/^\d{4}$/.test(p)) ?? "baby";
    return `+child:${name}${yr && Number(yr) <= year && Number(yr) >= year - 6 ? `:${yr}` : ""}`;
  }
  return `${op}${kind}:${parts[0]}`;
}

const firstWord = (s: string) => s.split(/\s+/)[0]!.toLowerCase();

function findByName(people: LedgerPerson[], name: string, role?: Role): LedgerPerson | undefined {
  const n = name.toLowerCase().replace(/^(your|my|the)\s+/, "");
  return (
    people.find((p) => (!role || p.role === role) && p.name.toLowerCase().replace(/^(your|my|the)\s+/, "") === n) ??
    people.find((p) => (!role || p.role === role) && !p.generic && firstWord(p.name) === firstWord(n))
  );
}

export function applyChange(people: LedgerPerson[], change: string, year: number): void {
  const born = change.match(/^=born:(.+):(\d{4})$/);
  if (born) {
    const p = findByName(people, born[1]!);
    if (p && !p.ageKnown) (p.born = Number(born[2])), (p.ageKnown = true);
    return;
  }
  const fr = change.match(/^([+-])friend:([^:]+)(?::(.+))?$/);
  if (fr) {
    if (fr[1] === "+") joinPerson(people, fr[2]!, fr[3] ?? "friend", year, { strength: 0.65 });
    else driftPerson(people, fr[2]!, year);
    return;
  }
  const m = change.match(/^([+-])(partner|child|pet|parent):(.+)$/);
  if (!m) return;
  const [, op, kind, rest] = m as unknown as [string, "+" | "-", "partner" | "child" | "pet" | "parent", string];
  const here = (r: Role) => people.filter((p) => p.role === r && p.status === "here" && p.since <= year);
  if (kind === "partner") {
    const name = rest;
    const generic = GENERIC_NAME.test(name);
    const cur = here("partner")[0];
    // a child, parent or sibling never becomes the partner (a branch tagged "+partner:Paolo", her son)
    if (op === "+" && !generic && people.some((p) => p.role !== "partner" && p.role !== "other" && findByName([p], name))) return;
    if (op === "+") {
      if (cur && (findByName([cur], name) || generic)) return;
      if (cur && cur.generic) {
        cur.name = name;
        cur.generic = false;
        cur.key = personKey("partner", name);
        return;
      }
      if (cur) (cur.status = "ended"), (cur.until = year);
      const old = findByName(people, name, "partner");
      if (old) return void ((old.status = "here"), (old.until = null), (old.since = Math.min(old.since, year)));
      // a friend who becomes the partner moves out of the friends list (one person, one entry)
      const friend = generic ? undefined : findByName(people.filter((p) => p.role === "other" && p.status !== "ended"), name);
      if (friend) (friend.status = "ended"), (friend.until = year);
      people.push(person({ key: personKey("partner", name), name: generic ? "your partner" : name, generic, role: "partner", relation: "partner", born: null, ageKnown: false, since: year }));
    } else if (cur) (cur.status = "ended"), (cur.until = year);
    return;
  }
  if (kind === "child") {
    if (op === "-") return; // children never leave the ledger (content line)
    const [name, yr] = rest.split(":");
    const generic = GENERIC_NAME.test(name!);
    const known = generic ? undefined : findByName(people.filter((p) => p.role === "child"), name!);
    if (known) {
      if (known.since > year) (known.since = yr ? Number(yr) : year), known.ageKnown || ((known.born = known.since), (known.ageKnown = true));
      return;
    }
    const n = here("child").length;
    people.push(
      person({
        key: personKey("child", generic ? `baby${n + 1}` : name!), name: generic ? (n ? `your child ${n + 1}` : "your child") : name!, generic, role: "child",
        relation: "child", born: yr ? Number(yr) : year, ageKnown: true, since: yr ? Number(yr) : year,
      }),
    );
    return;
  }
  if (kind === "pet") {
    if (op === "+") {
      const [species, name] = rest.split(":") as [string, string];
      if (findByName(here("pet"), name)) return;
      people.push(person({ key: personKey("pet", name), name, generic: false, role: "pet", relation: species, born: year, ageKnown: false, since: year, goneAt: year + petYears(name, species) }));
    } else {
      const p = findByName(here("pet"), rest) ?? (here("pet").length === 1 ? here("pet")[0] : undefined);
      if (p) (p.status = "gone"), (p.until = year);
    }
    return;
  }
  if (kind === "parent" && op === "-") {
    const ps = here("parent");
    const p = findByName(ps, rest) ?? ps.find((x) => roleWord(x.relation) === roleWord(rest)) ?? (ps.length === 1 ? ps[0] : undefined);
    if (p) (p.status = "gone"), (p.until = year);
  }
}

export const roleWord = (s: string) => {
  const t = s.toLowerCase();
  return /mother|mom|mum|mama|nanay|amma/.test(t) ? "mother" : /father|dad|papa|tatay|appa/.test(t) ? "father" : t;
};

// ---------------------------------------------------------------------------------------------
// People over time: new people from their own words, closeness, drift, reunions
// ---------------------------------------------------------------------------------------------

const capFirst = (s: string) => s.trim().split(/\s+/)[0] ?? "";
const sameFirst = (p: LedgerPerson, name: string) => !p.generic && firstWord(p.name) === name.toLowerCase();
const DRIFTABLE: Role[] = ["other", "sibling", "parent"];

function renew(p: LedgerPerson, year: number, to: number): void {
  if (p.status === "drifted") (p.status = "here"), (p.until = null);
  p.closeness = Math.max(p.closeness, to);
  p.lastContact = Math.max(p.lastContact, year);
}

/**
 * Someone they named ("my friend Kai", "+friend:Kai:climbing buddy") joins the ledger in `year`, or
 * is renewed when already in it (a drifted friend comes back). A partner goes through the partner
 * change; a stand-in parent, sibling or lone child gets the name. Exes and the dead never join.
 */
export function joinPerson(people: LedgerPerson[], name: string, relation: string, year: number, o: { strength?: number } = {}): LedgerPerson | null {
  const nm = capFirst(name).replace(/['’]s$/, "");
  if (!/^\p{Lu}[\p{L}'’-]+$/u.test(nm)) return null;
  const rel = relation.toLowerCase().trim() || "friend";
  const known = people.find((p) => sameFirst(p, nm) && p.status !== "ended");
  if (known) {
    known.since = Math.min(known.since, year);
    if (DRIFTABLE.includes(known.role)) renew(known, year, 0.7);
    return known;
  }
  if (people.some((p) => sameFirst(p, nm))) return null; // an ex: not again through a mention
  if (/\b(?:ex|former|late)\b|\bex-/i.test(rel)) return null;
  const role = roleOf(rel);
  const stand = (r: Role, ok: (p: LedgerPerson) => boolean = () => true) => {
    const gs = people.filter((p) => p.role === r && p.generic && p.status === "here" && ok(p));
    return gs.length === 1 ? gs[0]! : undefined;
  };
  if (role === "partner") {
    applyChange(people, `+partner:${nm}`, year);
    return people.find((p) => p.role === "partner" && p.status === "here" && sameFirst(p, nm)) ?? null;
  }
  if (role === "child" || role === "parent" || role === "sibling") {
    const g = stand(role, (p) => role !== "parent" || roleWord(p.relation) === roleWord(rel));
    if (g) {
      g.name = nm;
      g.generic = false;
      g.key = personKey(role, nm);
      if (role !== "child") g.relation = rel;
      return g;
    }
    if (role !== "sibling") return null; // children arrive by birth, parents are known from the start
    const p = person({ key: personKey(role, nm), name: nm, generic: false, role, relation: rel, born: null, ageKnown: false, since: year });
    people.push(p);
    return p;
  }
  if (role !== "other" || !(CLOSE_OTHER.test(rel) || WORK_OTHER.test(rel))) return null;
  const closeness = o.strength ?? (/\bbest\b|\bclosest\b|bestie/.test(rel) ? 0.8 : WORK_OTHER.test(rel) ? 0.45 : 0.65);
  const p = person({ key: personKey("other", nm), name: nm, generic: false, role: "other", relation: rel, born: null, ageKnown: false, since: year, closeness });
  people.push(p);
  return p;
}

/** They said they lost touch: a friend has drifted; a parent or sibling stays (never silently gone) but is no longer featured. */
export function driftPerson(people: LedgerPerson[], name: string, year: number): LedgerPerson | null {
  const p = people.find((x) => sameFirst(x, capFirst(name)) && x.status === "here" && x.since <= year && DRIFTABLE.includes(x.role));
  if (!p) return null;
  if (p.role === "other") (p.status = "drifted"), (p.until = year), (p.closeness = Math.min(p.closeness, 0.1));
  else p.closeness = Math.min(p.closeness, 0.2);
  return p;
}

/** What one of their quotes says about people, in the year it was said. */
export interface PeopleCue {
  year: number;
  joins: { name: string; relation: string }[];
  drifted: string[];
  mentioned: string[];
}

/** The year a quote was said: a decision answer ("d-<age>-<n>") at that age, anything else at the start. */
export function quoteYearOf(profile: Pick<Profile, "birthYear" | "startYear">, q: { questionId: string | null }): number {
  const m = q.questionId?.match(/^d-(\d+)-/);
  return m ? profile.birthYear + Number(m[1]) : profile.startYear;
}

const cueCache = new WeakMap<object, PeopleCue[]>();
/** People cues from every quote, oldest first (only typed answers can add someone or renew them). */
export function peopleCues(profile: Profile): PeopleCue[] {
  const hit = cueCache.get(profile.quotes);
  if (hit) return hit;
  const out: PeopleCue[] = [];
  for (const q of profile.quotes) {
    const said = peopleSaid(q.text);
    const typed = q.source === "answer";
    const cue: PeopleCue = { year: quoteYearOf(profile, q), joins: typed ? said.joins : [], drifted: said.drifted, mentioned: typed ? said.mentioned : [] };
    if (cue.joins.length || cue.drifted.length || cue.mentioned.length) out.push(cue);
  }
  out.sort((a, b) => a.year - b.year);
  cueCache.set(profile.quotes, out);
  return out;
}

/** Apply the cues said up to `upto` (in order; each once). */
function applyCues(now: LifeNow, upto: number): void {
  const cues = now.cues ?? [];
  const me = (now.who?.firstName ?? "").toLowerCase();
  let i = now.cueAt ?? 0;
  for (; i < cues.length && cues[i]!.year <= upto; i++) {
    const c = cues[i]!;
    for (const j of c.joins) if (j.name.toLowerCase() !== me) joinPerson(now.people, j.name, j.relation, c.year);
    // naming someone again in their own words keeps them close (they keep choosing them)
    for (const n of c.mentioned)
      for (const p of now.people) if (sameFirst(p, n) && DRIFTABLE.includes(p.role) && p.status !== "ended" && p.since <= c.year) renew(p, c.year, 0.7);
    for (const n of c.drifted) driftPerson(now.people, n, c.year);
  }
  now.cueAt = i;
}

const sig = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 3));
/** A colleague's job is "left" when the work line shares no real word with the one they came with. */
const leftWork = (p: LedgerPerson, work: string) => p.anchorWork !== null && ![...sig(p.anchorWork)].some((w) => sig(work).has(w));
const isFar = (p: LedgerPerson, now: LifeNow) => (p.anchor !== null && p.anchor !== cityOf(now.place)) || leftWork(p, now.work);

/** Closeness decays from the last decay year to `year`: slowly where they are, fast once the life left their city or job. */
function driftTo(now: LifeNow, year: number): void {
  const from = now.driftAt ?? year;
  if (year > from)
    for (const p of now.people) {
      if (p.status !== "here" || p.role !== "other") continue;
      const n = year - Math.max(from, p.since);
      if (n <= 0) continue;
      if (FAMILY_OTHER.test(p.relation)) {
        p.closeness = Math.max(DRIFT_AT + 0.05, p.closeness - 0.01 * n);
        continue;
      }
      p.closeness = Math.max(0, p.closeness - n * (isFar(p, now) ? DECAY_FAR : DECAY_NEAR));
      if (p.closeness < DRIFT_AT) (p.status = "drifted"), (p.until = year);
    }
  now.driftAt = Math.max(from, year);
}

/** Friends belong to the city (and colleagues to the job) the life had when they joined. */
function settle(now: LifeNow, year: number): void {
  for (const p of now.people) {
    if (p.role !== "other" || p.since > year) continue;
    if (p.anchor === null) p.anchor = cityOf(now.place);
    if (p.anchorWork === null && WORK_OTHER.test(p.relation)) p.anchorWork = norm(now.work);
  }
}

const REUNION = /\b(reunion|reunit\w*|reconnect\w*|again after|after (?:\w+ )?years|ran into|runs? into|bump\w* into|catch(?:es)? up|caught up|out of the blue|looks? (?:you|them|her|him) up|first time in (?:\w+ )?years)\b/i;

/** The life's own text names a friend: a small renewal (less from afar); a drifted friend comes back only in a reunion. */
function textRenewals(now: LifeNow, y: SimYear): void {
  const parts = [y.summary, ...y.events.map((e) => `${e.title}. ${e.narrative}`)];
  for (const p of now.people) {
    if (p.generic || p.since > y.year || (p.role !== "other" && p.role !== "sibling")) continue;
    const re = new RegExp(`\\b${esc(p.name.split(/\s+/)[0]!)}\\b`);
    const hits = parts.filter((t) => re.test(t));
    if (!hits.length) continue;
    if (p.status === "here") {
      p.closeness = Math.max(p.closeness, Math.min(0.8, p.closeness + (isFar(p, now) ? 0.02 : 0.05)));
      p.lastContact = y.year;
    } else if (p.status === "drifted" && hits.some((t) => REUNION.test(t))) {
      renew(p, y.year, 0.45);
      p.anchor = cityOf(now.place);
    }
  }
}

/** Time passes to `year`: closeness decays, then what they said by then applies. */
function tick(now: LifeNow, year: number): void {
  driftTo(now, year);
  applyCues(now, year);
}

export interface Featured {
  person: LedgerPerson;
  /** Closeness, with a small bump for someone seen in the last year. */
  score: number;
  /** A drifted friend offered as a rare reunion (frame it as one). */
  reunion: boolean;
}

/**
 * People to feature this year (small cards, scenes, letters), closest first: the household, family,
 * and only the friends still close. Drifted people are never featured, except, with
 * `reunion: true`, about one year in twelve one of them as a reunion (deterministic per session).
 */
export function featuredPeople(now: LifeNow, o: { max?: number; reunion?: boolean } = {}): Featured[] {
  const out: Featured[] = here(now)
    .filter((p) => !offScreen(p, now.year) && p.closeness >= CLOSE_MIN)
    .map((p) => ({ person: p, score: Math.min(1, p.closeness + (p.role === "other" && p.lastContact >= now.year - 1 ? 0.05 : 0)), reunion: false }))
    .sort((a, b) => b.score - a.score || ROLE_ORDER[a.person.role] - ROLE_ORDER[b.person.role]);
  const drifted = now.people.filter((p) => p.status === "drifted" && p.until !== null && p.until < now.year);
  const seed = `${now.who?.sessionId ?? ""}:${now.path.map((x) => x.title).join(">")}:${now.year}`;
  if (o.reunion && drifted.length && hash32(`reunion:${seed}`) % 12 === 0)
    out.push({ person: drifted[hash32(`reunion-who:${seed}`) % drifted.length]!, score: 0.3, reunion: true });
  return out.slice(0, o.max ?? 8);
}

const tagOf = (p: LedgerPerson, year: number) => {
  if (p.generic) return p.name;
  const a = p.ageKnown && !offScreen(p, year) ? ageOf(p, year) : null;
  return `${p.name} (${p.relation}${a !== null && p.role !== "pet" ? `, ${a}` : ""})`;
};

/**
 * One prompt line: who to feature this year, closest first, and who has drifted (never a card
 * option). For prompts that pick people (small cards, scenes): WIRE INTO prompts/decision.ts
 * smallBatchPrompt and prompts/years.ts (owned by the content agent).
 */
export function featuredPeopleLine(now: LifeNow): string {
  const f = featuredPeople(now, { reunion: true });
  const close = f.filter((x) => !x.reunion).map((x) => tagOf(x.person, now.year));
  const reunion = f.find((x) => x.reunion);
  const drifted = now.people.filter((p) => p.status === "drifted");
  return [
    `People to feature in ${now.year}, closest first: ${close.join("; ") || "(no one close nearby: new people, colleagues, neighbours)"}.`,
    drifted.length ? ` Drifted apart (never a card option or a scene; they are not part of this life now): ${drifted.map((p) => p.name).join(", ")}.` : "",
    reunion ? ` If it fits, ${reunion.person.name} may come back this year as a reunion, framed as one (years apart, a surprise).` : "",
  ].join("");
}

/** A card or text that features a drifted person without framing it as a reunion (for the validators: WIRE INTO consistency.ts / smalls.ts smallIssues). */
export function driftedIssues(text: string, now: LifeNow): { name: string; msg: string }[] {
  const out: { name: string; msg: string }[] = [];
  for (const p of now.people.filter((x) => x.status === "drifted" && !x.generic)) {
    const re = new RegExp(`\\b${esc(p.name.split(/\s+/)[0]!)}\\b`);
    const s = text.split(/(?<=[.!?])\s+/).find((x) => re.test(x));
    if (s && !REUNION.test(s)) out.push({ name: p.name, msg: `${p.name} (${p.relation}) drifted out of this life in ${p.until}; don't feature them (a reunion only, framed as one)` });
  }
  return out;
}

/** Names for someone new in this life (names.ts), never one already in the ledger. */
export function newNameCandidates(now: LifeNow, role: NameRole, n = 4): string[] {
  if (!now.who) return [];
  const used = [now.who.firstName, ...now.people.filter((p) => !p.generic).map((p) => p.name)];
  return nameCandidates({ sessionId: now.who.sessionId, lifeId: now.path.map((p) => p.title).join(">") || "you", role, country: now.who.country, place: now.place, used }, n);
}

/** The NOW block's naming line: someone new in this life takes one of these names. */
export function newNamesLine(now: LifeNow): string {
  if (!now.who) return "";
  const parts: string[] = [];
  if (!here(now, "partner").length) parts.push(`a partner: ${newNameCandidates(now, "partner").join(", ")}`);
  if (now.age < 50) parts.push(`a baby: ${newNameCandidates(now, "child").join(", ")}`);
  parts.push(`a friend or colleague: ${newNameCandidates(now, "friend").join(", ")}`);
  return `- New people's names (only if someone new enters this life): ${parts.join("; ")}. Pick from these, never a name already used above or in another of their lives.`;
}

/** Fallback when a year carries no `life`: infer people changes from its turning points. */
export function inferChanges(y: SimYear, people: LedgerPerson[]): string[] {
  const out: string[] = [];
  const partner = people.some((p) => p.role === "partner" && p.status === "here");
  for (const e of y.events) {
    const t = `${e.title}. ${e.narrative} ${y.summary}`;
    // only a birth or an adoption adds a child ("Leo starts secondary school" is category child too)
    if (e.isTurningPoint && e.category === "child" && /\b(born|birth|arriv\w*|welcom\w*|newborn|firstborn|adopt\w*|first child|second child|third child|baby (?:girl|boy|is))\b/i.test(t)) {
      const nm = t.match(/\b(?:named|name (?:her|him)|welcome|meet|baby|daughter|son),?\s+([A-Z][\p{L}'-]+)/u)?.[1];
      out.push(`+child:${nm ?? "baby"}`);
    }
    if (e.isTurningPoint && (e.category === "love_start" || e.category === "marriage") && !partner) {
      const nm = t.match(/\b(?:meet|meets|met|dating|date|marry|marries)\s+([A-Z][\p{L}'-]+)/u)?.[1];
      out.push(`+partner:${nm ?? "partner"}`);
    }
    if (e.isTurningPoint && (e.category === "love_end" || e.category === "divorce") && partner) out.push("-partner:partner");
    const pet = t.match(/\badopt\w*\s+(?:a|an)\s+(?:[\w-]+\s+){0,2}?(dog|puppy|cat|kitten|rabbit)\b(?:[^.]{0,30}?\b(?:named|called)\s+([A-Z][\p{L}'-]+))?/iu);
    if (pet) out.push(`+pet:${speciesOf(pet[1]!)}:${pet[2] ?? speciesOf(pet[1]!)}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------------------------

const RETIRED_RE = /\bretire(d|ment|s)?\b/i;
const NOT_RETIRED_RE = /\b(semi[- ]retire\w*|part[- ]time|consult\w*|un-?retire\w*|back to work|returns? to work|out of retirement)\b/i;
export const isRetired = (work: string) => RETIRED_RE.test(work) && !NOT_RETIRED_RE.test(work) && !/\bplann\w* (to )?retire|retirement (plan|fund|savings)/i.test(work);

function initialWork(profile: Profile): string {
  const occ = profile.facts.find((f) => f.key === "occupation")?.value?.trim();
  return occ || "(not stated)";
}

/** One step of the replay: apply year y (changes, work, place) to the running ledger. */
function step(now: LifeNow, y: SimYear): string[] {
  const life = lifeOf(y);
  const changes = life?.ch?.length ? life.ch : life ? [] : inferChanges(y, now.people);
  for (const c of changes) applyChange(now.people, c, y.year);
  const place = y.place?.trim();
  if (place && cityOf(place) !== cityOf(now.place)) {
    now.pastPlaces.push({ place: now.place, from: now.placeSince, to: y.year - 1 });
    now.place = place;
    now.placeSince = y.year;
  } else if (place) now.place = place;
  let work = life?.work?.trim() || "";
  if (!work && y.events.some((e) => e.isTurningPoint && /\bretire/i.test(e.title))) work = "Retired";
  if (work && norm(work) !== norm(now.work)) {
    if (now.work !== "(not stated)") now.pastWork.push({ work: now.work, from: now.workSince, to: y.year - 1 });
    now.work = work;
    now.workSince = y.year;
  }
  now.retired = isRetired(now.work);
  now.money = { ...y.money };
  textRenewals(now, y);
  return changes;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const cityOf = (place: string) => norm(place.split(",")[0] ?? place);

/** Pets whose time has come leave the story (off-screen). */
function agePets(people: LedgerPerson[], year: number): void {
  for (const p of people) if (p.role === "pet" && p.status === "here" && p.goneAt !== null && year >= p.goneAt) (p.status = "gone"), (p.until = p.goneAt);
}

/**
 * The life at `atYear`: replays every year in `years` up to and including atYear (pass only the
 * years before a decision to get the state the decision is made in). Ages are at atYear.
 */
export function lifeAt(profile: Profile, years: SimYear[], atYear: number, path: LifeNow["path"] = []): LifeNow {
  const place0 = [profile.city, profile.region ?? profile.country].filter(Boolean).join(", ");
  const now: LifeNow = {
    year: atYear,
    age: atYear - profile.birthYear,
    place: place0,
    placeSince: profile.startYear,
    pastPlaces: [],
    work: initialWork(profile),
    workSince: profile.startYear,
    pastWork: [],
    retired: false,
    people: initialPeople(profile).map((p) => ({ ...p })),
    money: null,
    path: path.filter((p) => p.year <= atYear),
    cues: peopleCues(profile),
    cueAt: 0,
    driftAt: profile.startYear,
    who: { sessionId: profile.sessionId, country: profile.country, firstName: profile.firstName ?? "" },
  };
  now.retired = isRetired(now.work);
  settle(now, profile.startYear);
  const ys = years.filter((y) => y.year <= atYear).sort((a, b) => a.year - b.year);
  for (const y of ys) {
    agePets(now.people, y.year);
    tick(now, y.year);
    step(now, y);
    settle(now, y.year);
  }
  agePets(now.people, atYear);
  tick(now, atYear);
  settle(now, atYear);
  return now;
}

/** The ledger for the year being written: `past` replayed, then this year's changes applied. */
export function advance(prev: LifeNow, y: SimYear): { now: LifeNow; changes: string[] } {
  const now: LifeNow = { ...prev, year: y.year, age: y.age, people: prev.people.map((p) => ({ ...p })), pastPlaces: [...prev.pastPlaces], pastWork: [...prev.pastWork] };
  agePets(now.people, y.year);
  tick(now, y.year);
  const changes = step(now, y);
  settle(now, y.year);
  return { now, changes };
}

export const ageOf = (p: LedgerPerson, year: number) => (p.born === null ? null : year - p.born);
/**
 * A parent whose age is only estimated and is now ~93+: very old. They stay in People (people never
 * silently disappear; QA: Sam's parents vanished at 65 with no log line) but without a made-up age,
 * and they are kept out of 3D scenes. A parent leaves only through a logged old-age death.
 */
export const offScreen = (p: LedgerPerson, year: number) => p.role === "parent" && !p.ageKnown && (ageOf(p, year) ?? 0) >= 93;
export const here = (now: LifeNow, role?: Role) => now.people.filter((p) => p.status === "here" && p.since <= now.year && (!role || p.role === role));

/**
 * A parent's old-age death, owned by code (content rule: at most once in a life, late, gently,
 * offscreen). The oldest parent in the ledger dies at 85-90 (deterministic per session), never
 * before the user is 48 (the validator's rule) nor in the first two years. Every life of a session
 * shares it (a parent's lifespan doesn't depend on the user's choices). null = no parent known, or
 * it falls after the end. The year writer must log it (worker/engine/years.ts); without it, parents
 * on an estimated age silently vanished from People in their 90s (QA: Sam's, at 65).
 */
export interface ParentDeath {
  name: string;
  relation: string;
  year: number;
  /** The parent's age then (code-computed; an estimate when their age was never stated). */
  age: number;
}
export function parentDeathPlan(profile: Profile, endYear: number): ParentDeath | null {
  const parents = initialPeople(profile).filter((p) => p.role === "parent" && p.born !== null);
  if (!parents.length) return null;
  const oldest = parents.slice().sort((a, b) => a.born! - b.born!)[0]!;
  const r = hash32(`parent-death:${profile.sessionId}:${oldest.key}`);
  let year = oldest.born! + 85 + (r % 6);
  year = Math.max(year, profile.startYear + 2 + (r % 3), profile.birthYear + 48);
  if (year > endYear) return null;
  return { name: oldest.name, relation: roleWord(oldest.relation) === "mother" || roleWord(oldest.relation) === "father" ? roleWord(oldest.relation) : "parent", year, age: year - oldest.born! };
}

/** The YearLife snapshot stored on a year. */
export function yearLife(now: LifeNow, work: string, ch: string[]): YearLife {
  return {
    work: work || now.work,
    ch,
    // friends only while close (the UI's People list); family never silently leaves
    people: here(now)
      .filter((p) => p.role !== "other" || p.closeness >= CLOSE_MIN)
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (a.role === "other" ? b.closeness - a.closeness : 0))
      .map((p) => ({
        name: p.name, role: p.role, relation: p.relation,
        age: offScreen(p, now.year) ? null : p.ageKnown || p.role === "parent" ? ageOf(p, now.year) : null,
        closeness: Math.round(p.closeness * 100) / 100,
      })),
  };
}

/**
 * The profile as a life that forked at `forkYear` knows it: quotes from decisions after the fork
 * are dropped, and so are people and facts that only those answers named.
 */
export function profileAsOf(profile: Profile, decisions: { id: string; year: number }[], forkYear: number): Profile {
  const later = new Set(decisions.filter((d) => d.year > forkYear).map((d) => d.id));
  const quotes = profile.quotes.filter((q) => !q.questionId || !later.has(q.questionId));
  const known = new Set(quotes.map((q) => q.id));
  const keep = (ids: string[]) => !ids.length || ids.some((id) => known.has(id));
  return { ...profile, quotes, people: profile.people.filter((p) => keep(p.quoteIds)), facts: profile.facts.filter((f) => keep(f.quoteIds)) };
}

// ---------------------------------------------------------------------------------------------
// Paths (forks taken)
// ---------------------------------------------------------------------------------------------

export function forksTaken(state: SessionState, uptoYear = 9999): LifeNow["path"] {
  return state.decisions
    .filter((d) => d.kind === "big" && d.status === "answered" && d.year <= uptoYear)
    .sort((a, b) => a.year - b.year)
    .map((d) => {
      // their own words when they typed instead of tapping (answers.ts)
      const c = chosenOf(d, state.answers.find((x) => x.decisionId === d.id));
      return { year: d.year, age: d.age, title: c.own ? `${c.title} (their own words)` : c.title };
    });
}

export function branchForks(state: SessionState, branch: Branch): LifeNow["path"] {
  return [...forksTaken(state, branch.forkYear - 1), { year: branch.forkYear, age: branch.forkAge, title: branch.title }];
}

// ---------------------------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------------------------

function personLine(p: LedgerPerson, from: number, to: number): string {
  const a1 = ageOf(p, from);
  const a2 = ageOf(p, to);
  const nm = p.generic ? p.name : `${p.name} (${p.relation})`;
  if (p.role === "pet") {
    const yrs = from - p.since;
    const left = p.goneAt !== null ? p.goneAt - 1 : null;
    return `${nm}: with them since ${p.since}${yrs > 0 ? ` (${yrs} years)` : ""}${left !== null && left <= to ? `; old now. Leaves the story after ${left} (old age, off-screen: never write it, just stop mentioning ${p.name})` : ""}`;
  }
  if (a1 === null) return `${nm}: age not stated (don't state one)`;
  if (!p.ageKnown && p.role === "parent")
    return `${nm}: about ${a1}${a2 !== a1 && a2 !== null ? `-${a2}` : ""}${a1 >= 93 ? " (very old; still alive in this life, mostly off-screen: a call, a visit; never write their death)" : a1 >= 85 ? " (frail)" : ""}`;
  if (!p.ageKnown) return `${nm}: age not stated (don't state one)`;
  return from === to ? `${nm}: ${a1}` : `${nm}: ${a1} in ${from} -> ${a2} in ${to} (born ${p.born})`;
}

/** The people block: who exists in this life, with code-computed ages for [from, to]. */
export function peopleBlock(now: LifeNow, from = now.year, to = from): string {
  const lines: string[] = [];
  const partner = here(now, "partner")[0];
  const exes = now.people.filter((p) => p.role === "partner" && p.status === "ended");
  lines.push(`- Partner: ${partner ? `${partner.generic ? partner.name : partner.name}${partner.since > (now.year - now.age + 18) && partner.since > 0 ? ` (together since ${partner.since})` : ""}` : "none"}${exes.length ? `. Past: ${exes.map((e) => `${e.name} (until ${e.until})`).join(", ")}` : ""}`);
  const kids = here(now, "child");
  lines.push(`- Children: ${kids.length ? `${kids.length}: ${kids.map((k) => personLine(k, from, to)).join("; ")}` : "none"}`);
  const pets = here(now, "pet");
  const gonePets = now.people.filter((p) => p.role === "pet" && p.status === "gone");
  if (pets.length || gonePets.length)
    lines.push(`- Pets: ${pets.length ? pets.map((p) => personLine(p, from, to)).join("; ") : "none now"}${gonePets.length ? `. No longer in the story (never mention again): ${gonePets.map((p) => p.name).join(", ")}` : ""}`);
  const fam = [...here(now, "parent"), ...here(now, "sibling"), ...here(now, "grandchild")];
  if (fam.length) lines.push(`- Family: ${fam.map((p) => personLine(p, from, to)).join("; ")}`);
  const others = here(now, "other").sort((a, b) => b.closeness - a.closeness);
  const close = others.filter((p) => p.closeness >= CLOSE_MIN);
  const fading = others.filter((p) => p.closeness < CLOSE_MIN);
  if (close.length) lines.push(`- Close friends and other family: ${close.map((p) => personLine(p, from, to)).join("; ")}`);
  if (fading.length) lines.push(`- Out of touch lately (another city or job now; a message at most, never a card option): ${fading.map((p) => (p.generic ? p.name : `${p.name} (${p.relation})`)).join(", ")}`);
  const drifted = now.people.filter((p) => p.status === "drifted");
  if (drifted.length)
    lines.push(`- Drifted apart (not part of this life now: never a card option or in a scene; at most a rare reunion, framed as one): ${drifted.map((p) => `${p.name} (${p.relation}, since ${p.until})`).join(", ")}`);
  const goneFam = now.people.filter((p) => p.role === "parent" && p.status === "gone");
  if (goneFam.length) lines.push(`- Gone (a parent's old-age death, already happened; at most a gentle memory): ${goneFam.map((p) => `${p.name} (${p.until})`).join(", ")}`);
  return lines.join("\n");
}

const span = (from: number, to: number) => (from === to ? `${from}` : `${from}-${to}`);

/**
 * The "life so far" NOW block that every generator gets. It states the current place, work,
 * people (with ages computed in code), money and the forks taken, and says it overrides older facts.
 */
export function nowBlock(now: LifeNow, opts: { from?: number; to?: number; title?: string } = {}): string {
  const from = opts.from ?? now.year;
  const to = opts.to ?? from;
  const lines: string[] = [];
  lines.push(`${opts.title ?? "NOW"}: ${from === to ? `${from}, age ${from - (now.year - now.age)}` : `as of ${from} (age ${from - (now.year - now.age)})`}. Kept by code; it overrides anything older above (profile facts are from the start and may be out of date).`);
  const pastPlaces = now.pastPlaces.filter((p) => cityOf(p.place) !== cityOf(now.place));
  lines.push(`- Lives in: ${now.place} (since ${now.placeSince})${pastPlaces.length ? `. Used to live in (past only, not now): ${pastPlaces.map((p) => `${p.place} ${span(p.from, p.to)}`).join("; ")}` : ""}`);
  const pastWork = now.pastWork.filter((w) => norm(w.work) !== norm(now.work)).slice(-3);
  lines.push(
    `- Work: ${now.work}${now.workSince > now.year - now.age ? ` (since ${now.workSince})` : ""}${now.retired ? `. RETIRED: no job offers, promotions, bosses or shifts unless the moment is explicitly about coming out of retirement` : ""}${pastWork.length ? `. Before (past only): ${pastWork.map((w) => `${w.work} ${span(w.from, w.to)}`).join("; ")}` : ""}`,
  );
  lines.push(peopleBlock(now, from, to));
  const names = newNamesLine(now);
  if (names) lines.push(names);
  if (now.money) lines.push(`- Money last year: income ~$${Math.round(now.money.income / 1000)}k/yr, net worth ~$${Math.round(now.money.netWorth / 1000)}k`);
  if (now.path.length) lines.push(`- Forks taken in this life: ${now.path.map((p) => `"${p.title}" (${p.age}, ${p.year})`).join(" -> ")}`);
  lines.push(
    `Ages above are computed from birth years: use exactly these and never work out an age yourself (if unsure, don't state one). No partner, child or pet exists unless listed here; a new one only arrives through an event in the year it happens.`,
  );
  return lines.join("\n");
}

/** Compact people line for small prompts (interlude captions): who, and code-computed ages. */
export function peopleNowLine(now: LifeNow): string {
  const out = here(now)
    .map((p) => {
      const a = offScreen(p, now.year) ? null : ageOf(p, now.year);
      const age = a === null ? "" : p.ageKnown ? `, ${a}` : p.role === "parent" ? `, ~${a}` : "";
      return `${p.generic ? p.name.replace(/^your /, "") : `${p.name} (${p.relation})`}${p.role === "pet" ? "" : age}`;
    });
  return out.join("; ") || "no partner or children";
}

/** One short line for the ending's people summary (code-computed, never from the model). */
export function peopleSummary(now: LifeNow): string {
  const out: string[] = [];
  const partner = here(now, "partner")[0];
  if (partner) out.push(partner.generic ? "a partner" : `${partner.name} (partner)`);
  const kids = here(now, "child");
  if (kids.length) {
    const named = kids.filter((k) => !k.generic);
    out.push(named.length === kids.length ? kids.map((k) => (k.ageKnown && ageOf(k, now.year) !== null ? `${k.name}, ${ageOf(k, now.year)}` : k.name)).join("; ") : `${kids.length} ${kids.length === 1 ? "child" : "children"}`);
  }
  const pets = here(now, "pet");
  if (pets.length) out.push(pets.map((p) => `${p.name} (${p.relation})`).join(", "));
  return out.join(" · ") || "Friends, mostly";
}

// ---------------------------------------------------------------------------------------------
// Scene people from the ledger
// ---------------------------------------------------------------------------------------------

type Band = SceneSpec["people"][number]["ageBand"];
export function bandFor(age: number | null, fallback: Band = "adult"): Band {
  if (age === null) return fallback;
  return age < 2 ? "baby" : age < 13 ? "child" : age < 20 ? "teen" : age < 27 ? "young_adult" : age < 45 ? "adult" : age < 65 ? "middle" : "senior";
}

/**
 * Who the 3D scene shows: the household from the ledger (partner, every child at their real age
 * band, a living pet), parents only as many as are alive (the model decides if they're in this
 * year's scene), then the model's friends/colleagues. Max 5 besides self. At the end age the
 * whole ledger family is shown (the ending's people line reads the last scene).
 */
export function scenePeopleFrom(now: LifeNow, modelPeople: SceneSpec["people"]): SceneSpec["people"] {
  const self = modelPeople.find((p) => p.role === "self") ?? { role: "self" as const, ageBand: bandFor(now.age) };
  const out: SceneSpec["people"] = [];
  const partner = here(now, "partner")[0];
  if (partner) out.push({ role: "partner", ageBand: bandFor(now.age) });
  for (const k of here(now, "child")
    .slice()
    .sort((a, b) => (a.born ?? 0) - (b.born ?? 0))
    .slice(0, 4))
    out.push({ role: "child", ageBand: bandFor(ageOf(k, now.year), now.age < 40 ? "child" : now.age < 55 ? "teen" : "adult") });
  if (here(now, "pet").length) out.push({ role: "pet", ageBand: "adult" });
  const parentsAlive = here(now, "parent").filter((p) => !offScreen(p, now.year));
  const modelParents = modelPeople.filter((p) => p.role === "parent").length;
  const unknownParents = now.people.every((p) => p.role !== "parent") && now.age < 60;
  const parents = Math.min(modelParents, unknownParents ? 2 : parentsAlive.length);
  for (let i = 0; i < parents; i++) out.push({ role: "parent", ageBand: bandFor(parentsAlive[i] ? ageOf(parentsAlive[i]!, now.year) : now.age + 30, "senior") });
  for (const p of modelPeople) if (p.role === "friend" || p.role === "colleague") out.push(p);
  return [{ role: "self", ageBand: self.ageBand }, ...out.slice(0, 5)];
}
