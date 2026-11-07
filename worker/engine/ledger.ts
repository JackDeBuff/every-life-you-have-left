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
import { hash32 } from "./util";

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
  status: "here" | "ended" | "gone";
  until: number | null;
  /** Pets: the year old age takes them (code-owned). */
  goneAt: number | null;
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
  /** Who is in their life at the end of this year (from the ledger; ages computed in code). */
  people: { name: string; role: Role; relation: string; age: number | null }[];
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
      new RegExp(`\\b${N}\\s*\\((${NUM})\\)`, "g"),
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
  return adoptedYoung ? life - 1 : Math.max(3, life - 5);
}

export function initialPeople(profile: Profile): LedgerPerson[] {
  const start = profile.startYear;
  const corpus = [...profile.quotes.map((q) => q.text), ...profile.facts.map((f) => f.value)].join("\n");
  const out: LedgerPerson[] = [];
  const add = (p: Omit<LedgerPerson, "key" | "since" | "status" | "until" | "goneAt"> & { goneAt?: number | null }) => {
    const key = personKey(p.role, p.name);
    if (out.some((x) => x.key === key)) return;
    out.push({ ...p, key, since: start, status: "here", until: null, goneAt: p.goneAt ?? null });
  };
  let pluralKids = false;
  for (const pp of profile.people) {
    const role = roleOf(pp.relation, pp.label);
    if (role === "other" && !/friend/i.test(pp.relation)) {
      // keep exes, friends, grandparents etc. out of the ledger: they don't change counts or ages
      continue;
    }
    if (role === "other") continue;
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
    const stated = ageMentions(corpus, [name.split(/\s+/)[0]!]);
    if (stated.length) {
      born = start - stated[0]!.age;
      ageKnown = true;
    } else if (role === "parent") born = profile.birthYear - 30;
    const species = role === "pet" ? speciesOf(`${pp.relation} ${pp.label}`) : null;
    add({
      name, generic, role, relation: role === "pet" && species ? species : pp.relation.toLowerCase(), born, ageKnown,
      // a pet they "just adopted" / a puppy is young; otherwise assume it's already a few years old
      goneAt: role === "pet" && species ? start + petYears(name, species, /\b(just (?:adopted|got)|new (?:puppy|kitten|dog|cat)|puppy|kitten)\b/i.test(corpus)) : null,
    });
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
  return out;
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
  else if (/^(pet|dog|cat|puppy|kitten|rabbit|parrot)/.test(kind)) {
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
  const m = change.match(/^([+-])(partner|child|pet|parent):(.+)$/);
  if (!m) return;
  const [, op, kind, rest] = m as unknown as [string, "+" | "-", "partner" | "child" | "pet" | "parent", string];
  const here = (r: Role) => people.filter((p) => p.role === r && p.status === "here");
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
      if (old) return void ((old.status = "here"), (old.until = null));
      people.push({ key: personKey("partner", name), name: generic ? "your partner" : name, generic, role: "partner", relation: "partner", born: null, ageKnown: false, since: year, status: "here", until: null, goneAt: null });
    } else if (cur) (cur.status = "ended"), (cur.until = year);
    return;
  }
  if (kind === "child") {
    if (op === "-") return; // children never leave the ledger (content line)
    const [name, yr] = rest.split(":");
    const generic = GENERIC_NAME.test(name!);
    if (!generic && findByName(here("child"), name!)) return;
    const n = here("child").length;
    people.push({
      key: personKey("child", generic ? `baby${n + 1}` : name!), name: generic ? (n ? `your child ${n + 1}` : "your child") : name!, generic, role: "child",
      relation: "child", born: yr ? Number(yr) : year, ageKnown: true, since: yr ? Number(yr) : year, status: "here", until: null, goneAt: null,
    });
    return;
  }
  if (kind === "pet") {
    if (op === "+") {
      const [species, name] = rest.split(":") as [string, string];
      if (findByName(here("pet"), name)) return;
      people.push({ key: personKey("pet", name), name, generic: false, role: "pet", relation: species, born: year, ageKnown: false, since: year, status: "here", until: null, goneAt: year + petYears(name, species) });
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

const roleWord = (s: string) => {
  const t = s.toLowerCase();
  return /mother|mom|mum|mama|nanay|amma/.test(t) ? "mother" : /father|dad|papa|tatay|appa/.test(t) ? "father" : t;
};

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
  };
  now.retired = isRetired(now.work);
  const ys = years.filter((y) => y.year <= atYear).sort((a, b) => a.year - b.year);
  for (const y of ys) {
    agePets(now.people, y.year);
    step(now, y);
  }
  agePets(now.people, atYear);
  return now;
}

/** The ledger for the year being written: `past` replayed, then this year's changes applied. */
export function advance(prev: LifeNow, y: SimYear): { now: LifeNow; changes: string[] } {
  const now: LifeNow = { ...prev, year: y.year, age: y.age, people: prev.people.map((p) => ({ ...p })), pastPlaces: [...prev.pastPlaces], pastWork: [...prev.pastWork] };
  agePets(now.people, y.year);
  const changes = step(now, y);
  return { now, changes };
}

export const ageOf = (p: LedgerPerson, year: number) => (p.born === null ? null : year - p.born);
/** A parent whose age is only estimated and is now ~95+: no longer shown (never declared dead by code). */
export const offScreen = (p: LedgerPerson, year: number) => p.role === "parent" && !p.ageKnown && (ageOf(p, year) ?? 0) >= 95;
export const here = (now: LifeNow, role?: Role) => now.people.filter((p) => p.status === "here" && (!role || p.role === role));

/** The YearLife snapshot stored on a year. */
export function yearLife(now: LifeNow, work: string, ch: string[]): YearLife {
  return {
    work: work || now.work,
    ch,
    people: here(now)
      .filter((p) => p.role !== "other" && !offScreen(p, now.year))
      .map((p) => ({ name: p.name, role: p.role, relation: p.relation, age: p.ageKnown || p.role === "parent" ? ageOf(p, now.year) : null })),
  };
}

// ---------------------------------------------------------------------------------------------
// Paths (forks taken)
// ---------------------------------------------------------------------------------------------

export function chosenPath(state: SessionState, uptoYear = 9999): LifeNow["path"] {
  return state.decisions
    .filter((d) => d.kind === "big" && d.status === "answered" && d.year <= uptoYear)
    .sort((a, b) => a.year - b.year)
    .map((d) => {
      const a = state.answers.find((x) => x.decisionId === d.id);
      const o = d.options.find((x) => x.id === a?.optionId);
      return { year: d.year, age: d.age, title: o?.branchTitle ?? o?.label ?? "their own answer" };
    });
}

export function branchPath(state: SessionState, branch: Branch): LifeNow["path"] {
  return [...chosenPath(state, branch.forkYear - 1), { year: branch.forkYear, age: branch.forkAge, title: branch.title }];
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
    return `${nm}: about ${a1}${a2 !== a1 && a2 !== null ? `-${a2}` : ""}${a1 >= 93 ? " (if still alive, very old: keep them off-screen)" : a1 >= 85 ? " (frail)" : ""}`;
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
    .filter((p) => p.role !== "other" && !offScreen(p, now.year))
    .map((p) => {
      const a = ageOf(p, now.year);
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
  const parentsAlive = here(now, "parent");
  const modelParents = modelPeople.filter((p) => p.role === "parent").length;
  const unknownParents = now.people.every((p) => p.role !== "parent") && now.age < 60;
  const parents = Math.min(modelParents, unknownParents ? 2 : parentsAlive.length);
  for (let i = 0; i < parents; i++) out.push({ role: "parent", ageBand: bandFor(parentsAlive[i] ? ageOf(parentsAlive[i]!, now.year) : now.age + 30, "senior") });
  for (const p of modelPeople) if (p.role === "friend" || p.role === "colleague") out.push(p);
  return [{ role: "self", ageBand: self.ageBand }, ...out.slice(0, 5)];
}
