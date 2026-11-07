/**
 * The story of a year, for the world: who is in it (names for the characters), the one beat that
 * changed since last year (a birth, someone arriving, a move, a new home, new work, a visit), and
 * which ledger people the scene should add so the change is visible. Pure; derived on the client
 * from SimYear.life (the engine's ledger: worker/engine/ledger.ts) and the year before. Nothing
 * here invents a person: everyone shown is in that year's ledger.
 */
import type { SceneSpec, SimYear, YearLife } from "../../shared/sim";

type ScenePerson = SceneSpec["people"][number];
type Role = ScenePerson["role"];
type AgeBand = ScenePerson["ageBand"];
type LifePerson = YearLife["people"][number];

export interface CastMember {
  /** The character's slot key in the layout: self0, partner0, child1, parent0, pet0... */
  key: string;
  /** "You", "Sam", "Mia, 4", "Biscuit". */
  name: string;
  /** Arrived this year (the tag is highlighted). */
  isNew: boolean;
}

export type BeatKind = "birth" | "partner" | "wedding" | "pet" | "visit" | "move" | "home" | "work" | "retire" | "parting" | "friend";

export interface StoryBeat {
  kind: BeatKind;
  /** <= ~6 words, shown under the caption: "Welcome, Mia", "Moving to Lisbon". */
  text: string;
  /** The person the beat is about (to avoid repeating a caption that already names them). */
  who?: string;
  /** Where the camera eases: a cast slot key, the home, or the front stage. */
  focus: string;
}

export interface WorldStory {
  year: number;
  cast: CastMember[];
  beat: StoryBeat | null;
  /** Ledger people the scene leaves out but this year's story needs on screen. */
  extra: ScenePerson[];
}

const band = (age: number | null, fallback: AgeBand = "adult"): AgeBand =>
  age === null ? fallback : age < 2 ? "baby" : age < 13 ? "child" : age < 18 ? "teen" : age < 30 ? "young_adult" : age < 45 ? "adult" : age < 62 ? "middle" : "senior";

/** "your partner" -> "Partner" (the bio does the same). */
export function displayName(name: string): string {
  const n = name.replace(/^(your|my|the)\s+/i, "").trim();
  return n ? n[0]!.toUpperCase() + n.slice(1) : name;
}
const generic = (name: string) => /^(your|my|the)\s/i.test(name.trim());

/** Friends and colleagues ("other" in the ledger) only name the scene's own friend / colleague figures; they are never added. */
const sceneRole = (p: LifePerson): Role | null =>
  p.role === "partner"
    ? "partner"
    : p.role === "child" || p.role === "grandchild"
      ? "child"
      : p.role === "parent"
        ? "parent"
        : p.role === "pet"
          ? "pet"
          : p.role === "other"
            ? /colleague|cowork|co-work|boss|manager|mentor|client/i.test(p.relation)
              ? "colleague"
              : "friend"
            : null;
const ADDABLE: Role[] = ["partner", "child", "pet", "parent"];

const idOf = (p: LifePerson) => `${p.role}|${p.name.toLowerCase()}`;

/** Activities where the household plausibly shares the frame (home, a day out, a party, a move). */
const HOMEY: SceneSpec["activity"][] = ["family_time", "resting", "celebrating", "moving", "socializing", "traveling", "caregiving", "exercising"];
const WITH_KIDS: SceneSpec["activity"][] = ["family_time", "resting", "celebrating", "moving"];
const VISIT_OK: SceneSpec["activity"][] = ["family_time", "resting", "celebrating", "socializing"];
const AT_WORK: SceneSpec["activity"][] = ["office_work", "studying", "commuting", "job_hunting"];

const HOME_TEXT: Partial<Record<SceneSpec["home"], string>> = {
  house: "A house of your own",
  house_large: "A bigger house",
  townhouse: "A townhouse now",
  apartment: "A new apartment",
  apartment_small: "A small new place",
  loft_studio: "A studio loft",
  shared_house: "A shared house",
  parents_home: "Back at home",
  dorm: "Into the dorms",
};

const city = (place: string) => place.split(",")[0]!.trim();
const words = (s: string, n: number) => s.split(/\s+/).slice(0, n).join(" ");

/** The year's story. `prev` is the year before in the same life (null on the first year). */
export function storyFor(year: SimYear | null, prev: SimYear | null): WorldStory | null {
  if (!year) return null;
  const spec = year.scene;
  const life = year.life ?? null;
  const people = (life?.people ?? []).filter((p) => sceneRole(p) !== null);
  const before = new Set((prev?.life?.people ?? []).map(idOf));
  const isNew = (p: LifePerson) => !!prev?.life && !before.has(idOf(p));

  // ----- who the scene adds: arrivals always, the household on home-ish years, a parent's visit -----
  const counts = (list: ScenePerson[]) => {
    const c: Partial<Record<Role, number>> = {};
    for (const p of list) c[p.role] = (c[p.role] ?? 0) + 1;
    return c;
  };
  const base = spec.people.some((p) => p.role === "self") ? spec.people : [{ role: "self" as const, ageBand: "young_adult" as const }, ...spec.people];
  const have = counts(base);
  const extra: ScenePerson[] = [];
  const room = () => 6 - base.length - extra.length;
  const add = (p: LifePerson, why: "new" | "home" | "visit") => {
    const role = sceneRole(p)!;
    if (!ADDABLE.includes(role)) return false;
    const shown = (have[role] ?? 0) + extra.filter((x) => x.role === role).length;
    const inLedger = people.filter((q) => sceneRole(q) === role).indexOf(p);
    if (inLedger < shown || room() <= 0) return false;
    if (why === "home" && role === "child" && !WITH_KIDS.includes(spec.activity)) return false;
    extra.push({ role, ageBand: band(p.age, role === "parent" ? "senior" : role === "child" ? "child" : "adult") });
    return true;
  };
  // arrivals first (a newborn, a new partner, a new pet), then the household
  // (not into a workplace scene: a newborn at the office desk reads wrong; the beat line still says it)
  if (!AT_WORK.includes(spec.activity)) for (const p of people) if (isNew(p)) add(p, "new");
  if (HOMEY.includes(spec.activity)) for (const p of people) if (sceneRole(p) !== "parent") add(p, "home");
  // a parent who is in the ledger but not the scene drops by now and then (never invented: only a
  // living parent from this year's ledger), on a calm home year with nothing else to tell
  let visitor: LifePerson | null = null;
  const parents = people.filter((p) => p.role === "parent");
  if (parents.length && !(have.parent ?? 0) && VISIT_OK.includes(spec.activity) && year.year % 4 === 1 && !spec.moment) {
    const p = parents[year.year % parents.length]!;
    if (add(p, "visit")) visitor = p;
  }

  // ----- names: scene slots in order, matched to the ledger by role (and age band for children) -----
  const slots = [...base, ...extra];
  const byRole: Partial<Record<Role, LifePerson[]>> = {};
  for (const p of people) (byRole[sceneRole(p)!] ??= []).push(p);
  const used = new Set<LifePerson>();
  const idx: Partial<Record<Role, number>> = {};
  const cast: CastMember[] = [];
  const keyOf: Map<LifePerson, string> = new Map();
  for (const s of slots) {
    const i = idx[s.role] ?? 0;
    idx[s.role] = i + 1;
    const key = s.role === "pet" ? `pet${i}` : `${s.role}${i}`;
    if (s.role === "self") {
      cast.push({ key, name: "You", isNew: false });
      continue;
    }
    const pool = (byRole[s.role] ?? []).filter((p) => !used.has(p));
    const match = (s.role === "child" ? pool.find((p) => band(p.age) === s.ageBand) : null) ?? pool[0];
    if (!match) continue;
    used.add(match);
    keyOf.set(match, key);
    const name = displayName(match.name);
    cast.push({ key, name: s.role === "child" && match.age !== null && match.age >= 1 && match.age < 18 && !generic(match.name) ? `${name}, ${match.age}` : name, isNew: isNew(match) });
  }

  // ----- the beat: the one change worth a camera move and a line -----
  let beat: StoryBeat | null = null;
  const born = people.find((p) => p.role === "child" && isNew(p) && (p.age ?? 0) <= 1);
  const partnerNew = people.find((p) => p.role === "partner" && isNew(p));
  const petNew = people.find((p) => p.role === "pet" && isNew(p));
  const prevPartner = prev?.life?.people.find((p) => p.role === "partner");
  const partnerGone = prevPartner && !people.some((p) => p.role === "partner") ? prevPartner : null;
  const moved = !!prev && prev.place !== year.place;
  const newHome = !!prev && !moved && prev.scene.home !== spec.home;
  const work = life?.work?.trim() ?? "";
  const prevWork = prev?.life?.work?.trim() ?? "";
  const newWork = !!prev?.life && !!work && !!prevWork && work !== prevWork;
  const who = (p: LifePerson) => (generic(p.name) ? undefined : displayName(p.name));
  if (born) beat = { kind: "birth", text: generic(born.name) ? "A baby arrives" : `Welcome, ${displayName(born.name)}`, who: who(born), focus: keyOf.get(born) ?? "self0" };
  else if (partnerNew)
    beat = spec.moment === "wedding"
      ? { kind: "wedding", text: generic(partnerNew.name) ? "You get married" : `You marry ${displayName(partnerNew.name)}`, who: who(partnerNew), focus: keyOf.get(partnerNew) ?? "self0" }
      : { kind: "partner", text: generic(partnerNew.name) ? "Someone new" : `You meet ${displayName(partnerNew.name)}`, who: who(partnerNew), focus: keyOf.get(partnerNew) ?? "self0" };
  else if (moved) beat = { kind: "move", text: `Moving to ${city(year.place)}`, focus: "home" };
  else if (petNew) beat = { kind: "pet", text: `${displayName(petNew.name)} joins you`, who: who(petNew), focus: keyOf.get(petNew) ?? "self0" };
  else if (spec.moment === "wedding" && people.some((p) => p.role === "partner")) {
    const p = people.find((q) => q.role === "partner")!;
    beat = { kind: "wedding", text: generic(p.name) ? "You get married" : `You marry ${displayName(p.name)}`, who: who(p), focus: keyOf.get(p) ?? "self0" };
  } else if (newHome) beat = { kind: "home", text: HOME_TEXT[spec.home] ?? "A new home", focus: "home" };
  else if (newWork) beat = /retir/i.test(work) ? { kind: "retire", text: "You retire", focus: "self0" } : { kind: "work", text: `Now: ${words(work, 6)}`, focus: "self0" };
  else if (partnerGone) beat = { kind: "parting", text: generic(partnerGone.name) ? "A parting of ways" : `You and ${displayName(partnerGone.name)} part`, who: who(partnerGone), focus: "self0" };
  else if (visitor) beat = { kind: "visit", text: `${displayName(visitor.name)} visits`, who: who(visitor), focus: keyOf.get(visitor) ?? "self0" };
  else {
    // a new friend who is actually in the frame this year
    const friend = people.find((p) => p.role === "other" && isNew(p) && keyOf.has(p) && !generic(p.name));
    if (friend) beat = { kind: "friend", text: `A new friend: ${displayName(friend.name)}`, who: who(friend), focus: keyOf.get(friend)! };
  }

  return { year: year.year, cast, beat, extra };
}

/**
 * The beat's caption line, or null when the year's caption already tells it ("You meet Jonah"
 * under "You meet Jonah", or any caption naming the person the beat is about).
 */
export function beatLine(beat: StoryBeat | null, caption: string): string | null {
  if (!beat) return null;
  const c = caption.toLowerCase();
  if (beat.who && c.includes(beat.who.toLowerCase())) return null;
  const key = beat.text.toLowerCase().split(/[^a-z\u00c0-\u024f]+/).filter((w) => w.length > 3 && w !== "your" && w !== "with");
  if (key.length && key.every((w) => c.includes(w))) return null;
  return beat.text;
}

/** The scene with the story's extra people added (the layout places and names them). */
export function withStory(spec: SceneSpec, story: WorldStory | null): SceneSpec {
  if (!story?.extra.length) return spec;
  return { ...spec, people: [...spec.people, ...story.extra] };
}
