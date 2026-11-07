/**
 * The diorama composer: SceneSpec -> Layout (pure, deterministic). Seeded by the place, so the same
 * place builds the same island every year; only what the spec changed moves (docs/WORLD.md §1).
 *
 * Island: x,z in [-HALF, HALF], ground at y = 0. The camera looks from +x,+z (front corner), so tall
 * things go to the back (-x,-z), the hero home sits in the middle and the stage is the front corner.
 */
import type { SceneSpec } from "../../shared/sim";
import { modelHeight, type AnimalModel, type PersonModel, type StaticKit } from "./assets";
import { CLOTHES, FLAVOR, HAIR, NEUTRAL_SKIN, SKIN, TEMPERATE, snowCoverFor, type FlavorStyle } from "./palette";
import { hashString, rng, type Rng } from "./rng";
import type { Appearance } from "../../shared/sim";

export type V3 = [number, number, number];
export const HALF = 5;
export const PERSON_H = 0.6;
/** Quaternius characters + interior share this scale (their rigs are ~3.3 units tall). */
export const Q_SCALE = PERSON_H / 3.3;

type Setting = SceneSpec["setting"];
type Flavor = SceneSpec["flavor"];
type Activity = SceneSpec["activity"];
type Role = SceneSpec["people"][number]["role"];
type AgeBand = SceneSpec["people"][number]["ageBand"];

export type Pose = "idle" | "sit" | "walk" | "jog" | "carry" | "victory" | "wave" | "pickup" | "sad";

export interface PieceSpec {
  key: string;
  kit: StaticKit;
  id: string;
  variant: number;
  pos: V3;
  rotY: number;
  scale: number;
  delay: number;
  /** Material overrides (e.g. blossom trees). */
  tint?: "blossom";
}

export type ProcType =
  | "road" | "roadZ" | "sidewalk" | "path" | "plaza" | "field" | "hill" | "pier" | "boat" | "busStop" | "stringLights"
  | "picnic" | "pram" | "suitcase" | "easel" | "canvasStack" | "desk" | "laptop" | "monitorDesk" | "bookStack"
  | "partyTable" | "arch" | "podium" | "spotlight" | "gallery" | "whiteboard" | "hedge" | "fountain" | "barn"
  | "academic" | "planter" | "crosswalk" | "lawn" | "tower" | "parasolTable" | "flowerBed" | "mailbox" | "wallArt" | "wallArtZ" | "hay";

export interface ProcSpec {
  key: string;
  type: ProcType;
  pos: V3;
  rotY: number;
  size: V3;
  color?: string;
  color2?: string;
  delay: number;
  seed?: number;
}

export type HeroKind = "house" | "house_large" | "townhouse" | "apartment" | "dorm" | "loft" | "office" | "farmhouse" | "shophouse";

export interface HeroSpec {
  key: string;
  kind: HeroKind;
  pos: V3;
  w: number;
  d: number;
  floorH: number;
  floors: number;
  roof: "gable" | "hip" | "flat";
  wall: string;
  wall2: string;
  roofColor: string;
  trim: string;
  door: string;
  porch: boolean;
  balconies: boolean;
  arcade: boolean;
  chimney: boolean;
  bigWindows: boolean;
  cutaway: boolean;
  /** Interior room furniture (room-local coords, y = 0 is the floor). */
  room: { pieces: PieceSpec[]; procs: ProcSpec[]; floor: string; wallIn: string; rug: string | null };
}

export interface PersonSlot {
  key: string;
  role: Role;
  ageBand: AgeBand;
  model: PersonModel | AnimalModel;
  pet: boolean;
  pos: V3;
  rotY: number;
  pose: Pose;
  /** Closed loop path (world coords) for walk / jog / carry. */
  path: V3[] | null;
  speed: number;
  enterFrom: V3;
  scale: number;
  stoop: number;
  grey: number;
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  carry: "box" | "suitcase" | null;
  /** Index within its role (child 0, child 1). */
  index: number;
}

export interface CarLane {
  key: string;
  id: string;
  from: V3;
  to: V3;
  speed: number;
  offset: number;
}

export interface Layout {
  placeKey: string;
  setting: Setting;
  flavor: Flavor;
  style: FlavorStyle;
  coast: boolean;
  hills: { pos: V3; r: number; h: number }[];
  pieces: PieceSpec[];
  procs: ProcSpec[];
  hero: HeroSpec;
  people: PersonSlot[];
  cars: CarLane[];
  indoor: boolean;
  /** Camera focus (world). */
  focus: V3;
  /** Where the outdoor vignette happens. */
  stage: V3;
  kits: StaticKit[];
  snowCover: number;
  temperate: boolean;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
export const INDOOR_ALWAYS: Activity[] = ["remote_work", "studying", "studio_creating", "caregiving", "job_hunting", "office_work"];
export const OUTDOOR_ALWAYS: Activity[] = ["commuting", "exercising", "traveling", "moving", "socializing", "celebrating"];

export function isIndoor(spec: Pick<SceneSpec, "activity" | "weather" | "season" | "timeOfDay" | "moment">): boolean {
  if (spec.moment === "first_show") return true;
  if (spec.moment === "graduation" || spec.moment === "wedding" || spec.moment === "house_keys" || spec.moment === "moving_in" || spec.moment === "travel_abroad" || spec.moment === "retirement" || spec.moment === "layoff" || spec.moment === "new_job") return false;
  if (INDOOR_ALWAYS.includes(spec.activity)) return true;
  if (OUTDOOR_ALWAYS.includes(spec.activity)) return false;
  const bad = spec.weather === "rain" || spec.weather === "snow" || spec.timeOfDay === "night" || spec.season === "winter";
  return bad;
}

const fit = (kit: StaticKit, id: string, h: number) => h / Math.max(0.01, modelHeight(kit, id));

type TreeFamily = keyof FlavorStyle["trees"];

function treeId(fam: TreeFamily, n: number, season: SceneSpec["season"], snow: number, temperate: boolean): string {
  const autumn = season === "autumn" && temperate;
  const winter = season === "winter" && temperate;
  switch (fam) {
    case "broad": {
      const i = (n % 4) + 1;
      if (snow > 0.5) return `CommonTree_Snow_${i}`;
      if (winter) return n % 3 === 0 ? "CommonTree_Dead_1" : `CommonTree_Snow_${i}`;
      if (autumn) return `CommonTree_Autumn_${i}`;
      return `CommonTree_${i}`;
    }
    case "birch": {
      const i = (n % 2) + 1;
      if (snow > 0.5) return `BirchTree_Snow_${i}`;
      if (winter) return "BirchTree_Dead_1";
      if (autumn) return `BirchTree_Autumn_${i}`;
      return `BirchTree_${i}`;
    }
    case "pine": {
      const i = (n % 3) + 1;
      if (snow > 0.5) return `PineTree_Snow_${i}`;
      if (autumn && n % 3 === 0) return "PineTree_Autumn_1";
      return `PineTree_${i}`;
    }
    case "willow": {
      const i = (n % 2) + 1;
      if (snow > 0.5) return "Willow_Snow_1";
      if (winter) return "Willow_Dead_1";
      if (autumn) return `Willow_Autumn_${i}`;
      return `Willow_${i}`;
    }
    case "palm":
      return `PalmTree_${(n % 4) + 1}`;
    case "cactus":
      return ["Cactus_1", "Cactus_3", "CactusFlowers_2"][n % 3]!;
  }
}

const TREE_H: Record<TreeFamily, number> = { broad: 1.25, birch: 1.35, pine: 1.4, willow: 1.2, palm: 1.7, cactus: 0.55 };

function pickFamily(r: Rng, style: FlavorStyle): TreeFamily {
  const entries = Object.entries(style.trees) as [TreeFamily, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [k, w] of entries) {
    x -= w;
    if (x <= 0) return k;
  }
  return "broad";
}

const dist = (x: number, z: number) => Math.hypot(x, z);
const delayAt = (x: number, z: number, j = 0) => 0.05 + dist(x, z) * 0.045 + j;

// ---------------------------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------------------------
class Builder {
  pieces: PieceSpec[] = [];
  procs: ProcSpec[] = [];
  occupied: { x: number; z: number; r: number }[] = [];
  kits = new Set<StaticKit>(["nature"]);
  treeN = 0;
  constructor(
    public spec: SceneSpec,
    public r: Rng,
    public style: FlavorStyle,
    public snow: number,
    public temperate: boolean,
  ) {}

  free(x: number, z: number, r: number) {
    if (Math.abs(x) > HALF - 0.35 || Math.abs(z) > HALF - 0.35) return false;
    // rounded corners
    const cx = Math.max(0, Math.abs(x) - (HALF - 0.9));
    const cz = Math.max(0, Math.abs(z) - (HALF - 0.9));
    if (Math.hypot(cx, cz) > 0.55) return false;
    return this.occupied.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);
  }
  claim(x: number, z: number, r: number) {
    this.occupied.push({ x, z, r });
  }
  piece(kit: StaticKit, id: string, x: number, z: number, rotY: number, scale: number, key: string, extra: Partial<PieceSpec> = {}) {
    this.kits.add(kit);
    this.pieces.push({ key, kit, id, variant: 0, pos: [x, 0, z], rotY, scale, delay: delayAt(x, z, this.r() * 0.08), ...extra });
  }
  proc(type: ProcType, x: number, z: number, rotY: number, size: V3, key: string, extra: Partial<ProcSpec> = {}) {
    this.procs.push({ key, type, pos: [x, 0, z], rotY, size, delay: delayAt(x, z, this.r() * 0.05), ...extra });
  }
  tree(x: number, z: number, fam?: TreeFamily, key?: string) {
    const f = fam ?? pickFamily(this.r, this.style);
    const n = this.treeN++;
    const id = treeId(f, n + this.r.int(0, 3), this.spec.season, this.snow, this.temperate);
    const h = TREE_H[f] * this.r.range(0.85, 1.15);
    const blossom = this.spec.season === "spring" && f === "broad" && (this.spec.flavor === "east_asia" || this.r.chance(0.3));
    this.piece("nature", id, x, z, this.r.range(0, Math.PI * 2), fit("nature", id, h), `${key ?? `tree${n}`}:${id}`, blossom ? { tint: "blossom" } : {});
    this.claim(x, z, 0.35);
  }
  /** Scatter small vegetation in free spots. */
  scatter(count: number, kinds: string[], h: number, keyPrefix: string, area = HALF - 0.5) {
    for (let i = 0, tries = 0; i < count && tries < count * 8; tries++) {
      const x = this.r.range(-area, area);
      const z = this.r.range(-area, area);
      if (!this.free(x, z, 0.12)) continue;
      const id = this.r.pick(kinds);
      this.piece("nature", id, x, z, this.r.range(0, Math.PI * 2), fit("nature", id, h * this.r.range(0.8, 1.2)), `${keyPrefix}${i}:${id}`);
      i++;
    }
  }
  /** Trees in free spots, biased to the back and sides so the stage stays clear. */
  forest(count: number, keyPrefix = "ft") {
    for (let i = 0, tries = 0; i < count && tries < count * 12; tries++) {
      const x = this.r.range(-HALF + 0.5, HALF - 0.5);
      const z = this.r.range(-HALF + 0.5, HALF - 0.5);
      if (x + z > 2.5 && this.r.chance(0.7)) continue; // keep the front corner open
      if (!this.free(x, z, 0.45)) continue;
      this.tree(x, z, undefined, `${keyPrefix}${i}`);
      i++;
    }
  }
  roadX(z: number, x0: number, x1: number, key: string, width = 1) {
    const len = x1 - x0;
    this.proc("road", (x0 + x1) / 2, z, 0, [len, 0.02, width], key);
    this.proc("sidewalk", (x0 + x1) / 2, z - width / 2 - 0.15, 0, [len, 0.05, 0.3], `${key}-swN`);
    this.proc("sidewalk", (x0 + x1) / 2, z + width / 2 + 0.15, 0, [len, 0.05, 0.3], `${key}-swS`);
    for (let x = x0 + 0.5; x < x1; x += 1) this.claim(x, z, 0.75);
  }
  roadZ(x: number, z0: number, z1: number, key: string, width = 1) {
    const len = z1 - z0;
    this.proc("roadZ", x, (z0 + z1) / 2, 0, [width, 0.02, len], key);
    this.proc("sidewalk", x - width / 2 - 0.15, (z0 + z1) / 2, 0, [0.3, 0.05, len], `${key}-swW`);
    this.proc("sidewalk", x + width / 2 + 0.15, (z0 + z1) / 2, 0, [0.3, 0.05, len], `${key}-swE`);
    for (let z = z0 + 0.5; z < z1; z += 1) this.claim(x, z, 0.75);
  }
  house(x: number, z: number, rot: number, key: string, ids?: string[]) {
    const id = this.r.pick(ids ?? SUBURBAN);
    this.piece("suburban", id, x, z, rot, 1.25, `${key}:${id}`, { variant: this.r.int(0, 3) });
    this.claim(x, z, 0.9);
  }
  shop(x: number, z: number, rot: number, key: string, ids: string[], scale = 1.35) {
    const id = this.r.pick(ids);
    this.piece("commercial", id, x, z, rot, scale, `${key}:${id}`, { variant: this.r.int(0, 3) });
    this.claim(x, z, 0.85);
  }
  light(x: number, z: number, rot: number, key: string) {
    this.piece("street", "light-curved", x, z, rot, fit("street", "light-curved", 0.85), key);
    this.claim(x, z, 0.12);
  }
}

const SUBURBAN = "abcdefghijklmnopqrstu".split("").map((c) => `building-type-${c}`);
const MIDRISE = "abcdefghijklmn".split("").map((c) => `building-${c}`);
const TOWERS = ["building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d", "building-skyscraper-e"];
const LOWDETAIL = ["low-detail-building-a", "low-detail-building-b", "low-detail-building-c", "low-detail-building-d", "low-detail-building-e", "low-detail-building-f"];

// Facing helpers: model fronts face +z in Kenney kits.
const FACE_PZ = 0;
const FACE_NZ = Math.PI;
const FACE_PX = Math.PI / 2;
const FACE_NX = -Math.PI / 2;

const HERO_POS: V3 = [-0.35, 0, -0.35];
const STAGE: V3 = [2.05, 0, 2.05];

function composeSetting(b: Builder, setting: Setting) {
  const r = b.r;
  const grassBits = b.snow > 0.5 ? ["Rock_Snow_1", "Bush_Snow_1"] : ["Grass", "Grass_2", "Grass_Short", "Flowers", "Plant_1"];
  const bush = b.snow > 0.5 ? ["Bush_Snow_1", "Bush_Snow_2"] : ["Bush_1", "Bush_2", "BushBerries_1"];
  switch (setting) {
    case "city_dense":
    case "city_midrise": {
      const dense = setting === "city_dense";
      b.roadX(-2.1, -HALF, HALF, "rx", 1.1);
      b.roadZ(-2.1, -HALF, -2.1 - 0.55, "rz1", 1.1);
      b.roadZ(-2.1, -2.1 + 0.55, HALF, "rz2", 1.1);
      b.proc("crosswalk", -2.1, -0.9, 0, [1.1, 0.03, 0.5], "cw1");
      b.proc("crosswalk", -0.9, -2.1, Math.PI / 2, [1.1, 0.03, 0.5], "cw2");
      // back-left block: towers
      const backLeft: [number, number][] = [[-4.1, -4.1], [-3.0, -4.2], [-4.2, -3.1]];
      backLeft.forEach(([x, z], i) => {
        if (dense) b.shop(x, z, i === 2 ? FACE_PX : FACE_PZ, `bl${i}`, TOWERS, 1.3);
        else b.shop(x, z, i === 2 ? FACE_PX : FACE_PZ, `bl${i}`, MIDRISE, 1.35);
      });
      // back row across the street
      [[-0.6, -3.7], [0.9, -3.8], [2.4, -3.7], [3.9, -3.8]].forEach(([x, z], i) =>
        b.shop(x!, z!, FACE_PZ, `br${i}`, dense && i % 2 === 0 ? TOWERS : MIDRISE, dense && i % 2 === 0 ? 1.15 : 1.35),
      );
      // left column
      [[-3.7, -0.6], [-3.8, 0.9], [-3.7, 2.4], [-3.8, 3.9]].forEach(([x, z], i) =>
        b.shop(x!, z!, FACE_PX, `lc${i}`, dense && i === 0 ? TOWERS : MIDRISE, dense && i === 0 ? 1.15 : 1.35),
      );
      // distant low-detail fill at the very back corner
      if (dense) b.piece("commercial", r.pick(LOWDETAIL), -4.5, -4.6, 0, 1.4, "far0");
      // street lights + trees in planters along the hero side
      for (let i = 0; i < 4; i++) b.light(-1.3 + i * 1.6, -1.35, FACE_NZ, `l${i}`);
      for (let i = 0; i < 3; i++) b.light(-1.35, 0.5 + i * 1.6, FACE_NX, `lz${i}`);
      [[1.3, -1.25], [3.6, -1.25], [-1.25, 2.6]].forEach(([x, z], i) => {
        b.proc("planter", x!, z!, 0, [0.42, 0.12, 0.42], `pl${i}`, { color: b.style.paving });
        b.tree(x!, z!, b.style.trees.palm > 2 ? "palm" : "broad", `pt${i}`);
      });
      b.proc("plaza", 1.95, 1.95, 0, [2.7, 0.04, 2.7], "plaza", { color: b.spec.flavor === "europe_south" ? "calcada" : b.style.paving });
      [[0.75, 3.45], [3.45, 0.75]].forEach(([x, z], i) => b.piece("props", "bench", x!, z!, i === 0 ? FACE_NZ : FACE_NX, fit("props", "bench", 0.2), `pbench${i}`));
      [[0.85, 2.95], [2.95, 0.85]].forEach(([x, z], i) => {
        b.proc("planter", x!, z!, 0, [0.42, 0.12, 0.42], `ppl${i}`, { color: b.style.paving });
        b.tree(x!, z!, b.style.trees.palm > 2 ? "palm" : "broad", `ppt${i}`);
      });
      b.kits.add("props");
      b.kits.add("street").add("commercial").add("cars");
      b.scatter(6, bush, 0.3, "bu", 4);
      break;
    }
    case "suburb":
    case "small_town": {
      const town = setting === "small_town";
      b.roadX(-2.0, -HALF, HALF, "rx", 1);
      b.roadZ(-2.3, -2.0 + 0.5, HALF, "rz", 1);
      // back row houses (or shops on the town's main street)
      [[-4.0, -3.75], [-2.0, -3.8], [0.0, -3.75], [2.0, -3.8], [3.95, -3.75]].forEach(([x, z], i) => {
        if (town && i % 2 === 1) b.shop(x!, z!, FACE_PZ, `bs${i}`, ["building-a", "building-b", "building-c", "building-d", "building-e", "building-f"], 1.3);
        else b.house(x!, z!, FACE_PZ, `bh${i}`);
      });
      if (town) {
        b.piece("commercial", "detail-awning-wide", 2.0, -3.15, 0, 1.3, "aw1");
      }
      // left column across the side road
      [[-3.85, -0.4], [-3.85, 1.6], [-3.8, 3.55]].forEach(([x, z], i) => b.house(x!, z!, FACE_PX, `lh${i}`));
      // right side neighbour
      b.house(3.7, -0.4, FACE_NX, "rh0");
      // fences + hedges along lots
      b.proc("hedge", -1.55, 1.2, Math.PI / 2, [2.8, 0.18, 0.16], "hedgeL", { color: "#6F9A6A" });
      b.piece("suburban", "fence-1x3", 2.55, -0.9, FACE_PZ, 1.25, "fence1");
      b.proc("mailbox", 1.25, -1.3, 0, [0.08, 0.2, 0.08], "mail");
      for (let i = 0; i < 3; i++) b.light(-3.6 + i * 3.2, -1.35, FACE_NZ, `l${i}`);
      b.forest(town ? 7 : 9);
      b.scatter(18, grassBits, 0.15, "gr");
      b.scatter(7, bush, 0.3, "bu");
      if (b.snow < 0.5) b.scatter(8, ["Flowers", "Plant_2", "BushBerries_2"], 0.2, "fl", 4.4);
      b.kits.add("suburban").add("street").add("cars");
      if (town) b.kits.add("commercial");
      break;
    }
    case "rural": {
      b.proc("path", 1.0, -1.9, 0, [8, 0.03, 0.6], "dirt", { color: "#D8C29A" });
      b.proc("path", -2.4, 1.6, 0, [0.6, 0.03, 6], "dirt2", { color: "#D8C29A" });
      const crop = b.spec.season === "winter" ? null : b.spec.season === "spring" ? "Grass_Short" : r.pick(["Wheat", "Corn_1"]);
      b.proc("field", -3.65, -3.65, 0, [2.2, 0.05, 2.2], "field1", { color: b.spec.season === "winter" ? "#E8EDF0" : "#B08A5E" });
      b.proc("field", 1.2, -3.8, 0, [3.2, 0.05, 1.8], "field2", { color: b.spec.season === "winter" ? "#E8EDF0" : "#B08A5E" });
      for (const [fx, fz, w, d, k] of [[-3.65, -3.65, 2.0, 2.0, "c1"], [1.2, -3.8, 3.0, 1.6, "c2"]] as const) {
        b.claim(fx, fz, Math.max(w, d) / 2);
        if (!crop) continue;
        for (let ix = 0; ix < Math.round(w / 0.32); ix++)
          for (let iz = 0; iz < Math.round(d / 0.4); iz++) {
            const x = fx - w / 2 + 0.16 + ix * 0.32;
            const z = fz - d / 2 + 0.2 + iz * 0.4;
            b.piece("nature", crop, x, z, r.range(0, 6.28), fit("nature", crop, crop === "Corn_1" ? 0.4 : 0.26), `${k}-${ix}-${iz}:${crop}`);
          }
      }
      b.proc("barn", 3.6, -1.0, FACE_NX, [1.5, 1.1, 1.9], "barn", { color: "#B4553F" });
      b.claim(3.6, -1.0, 1.2);
      b.piece("cars", "tractor", 2.4, -1.2, 0.6, 0.3, "tractor");
      b.claim(2.4, -1.2, 0.4);
      b.piece("camp", "fence", -1.5, 3.9, 0, fit("camp", "fence", 0.22), "rf1");
      b.piece("camp", "fence", -0.5, 3.95, 0, fit("camp", "fence", 0.22), "rf2");
      b.proc("fountain", -2.9, 3.0, 0, [1.5, 0.05, 1.1], "pond", { color: "pond" });
      b.claim(-2.9, 3.0, 0.9);
      [[-0.6, -3.1], [-0.2, -3.25], [3.9, 1.4]].forEach(([x, z], i) => {
        b.proc("hay", x!, z!, i * 0.7, [0.22, 0.2, 0.22], `hay${i}`, { color: "#E2C27A" });
        b.claim(x!, z!, 0.2);
      });
      b.kits.add("cars").add("camp");
      b.forest(10);
      b.scatter(16, grassBits, 0.15, "gr");
      b.scatter(5, ["Rock_1", "Rock_Moss_1", "TreeStump"], 0.18, "rk");
      break;
    }
    case "coastal": {
      // sea on the back-left (x < coast); a pier and boats; houses along the shore
      b.roadX(-2.0, -0.9, HALF, "rx", 0.9);
      b.proc("pier", -3.4, 1.2, 0, [2.6, 0.08, 0.5], "pier", { color: "#B98A62" });
      b.proc("boat", -3.9, -0.7, 0.4, [0.9, 0.25, 0.35], "boat1", { color: "#F4EBDD", color2: "#E07A5F" });
      b.proc("boat", -4.1, 2.9, -0.3, [0.7, 0.2, 0.3], "boat2", { color: "#F4EBDD", color2: "#3E8C93" });
      for (let x = -HALF; x < -1.2; x += 0.7) for (let z = -HALF; z < HALF; z += 0.7) b.claim(x, z, 0.4);
      [[0.4, -3.7], [2.3, -3.8], [4.1, -3.7]].forEach(([x, z], i) => b.house(x!, z!, FACE_PZ, `bh${i}`));
      b.house(3.75, -0.3, FACE_NX, "rh0");
      for (let i = 0; i < 2; i++) b.light(0.2 + i * 2.6, -1.35, FACE_NZ, `l${i}`);
      b.forest(6);
      b.scatter(10, grassBits, 0.15, "gr", 4.2);
      b.scatter(4, ["Rock_1", "Rock_2", "Rock_Moss_2"], 0.2, "rk");
      b.kits.add("suburban").add("street").add("cars");
      break;
    }
    case "campus": {
      // the quad sits back-right so the camera sees it past the hero; halls frame it
      b.proc("lawn", 2.35, -2.75, 0, [3.9, 0.03, 3.1], "quad", { color: "#9DC283" });
      b.proc("path", 2.35, -2.75, Math.atan2(3.1, 3.9), [4.6, 0.035, 0.32], "qp1", { color: b.style.paving });
      b.proc("path", 2.35, -2.75, -Math.atan2(3.1, 3.9), [4.6, 0.035, 0.32], "qp2", { color: b.style.paving });
      b.proc("fountain", 2.35, -2.75, 0, [0.7, 0.25, 0.7], "fountain", { color: b.style.paving });
      b.claim(2.35, -2.75, 0.7);
      for (let x = 0.7; x <= 4.2; x += 0.7) for (const z of [-1.6, -3.9]) b.claim(x, z, 0.3);
      b.proc("academic", 2.4, -4.55, 0, [3.6, 1.6, 0.9], "acad1", { color: "#B5654A", color2: "#F4EBDD" });
      b.proc("academic", -4.5, -0.6, Math.PI / 2, [2.6, 1.4, 0.9], "acad2", { color: "#C46E55", color2: "#F4EBDD" });
      b.proc("tower", -3.7, -3.8, 0, [0.9, 2.6, 0.9], "clock", { color: "#B5654A", color2: "#F4EBDD" });
      for (let x = 0.6; x < 4.6; x += 0.8) b.claim(x, -4.5, 0.6);
      for (let z = -2.0; z < 0.9; z += 0.8) b.claim(-4.5, z, 0.6);
      b.claim(-3.7, -3.8, 0.8);
      [[0.9, -1.75, 0], [3.8, -1.75, 0], [0.9, -3.75, Math.PI], [3.8, -3.75, Math.PI]].forEach(([x, z, rr], i) =>
        b.piece("props", "bench", x!, z!, rr!, fit("props", "bench", 0.2), `bench${i}`),
      );
      [[0.6, -2.75], [4.15, -2.75], [-2.4, -2.4], [-3.3, -1.6], [-1.6, -3.4], [-3.5, 1.4], [-3.0, 3.2]].forEach(([x, z], i) => b.tree(x!, z!, i < 2 ? "broad" : undefined, `ct${i}`));
      for (let i = 0; i < 3; i++) b.light(0.55 + i * 1.8, -1.45, FACE_NZ, `l${i}`);
      b.forest(5);
      b.scatter(12, grassBits, 0.15, "gr");
      b.kits.add("props").add("street");
      break;
    }
  }
  // hills behind certain flavours (soft rounded mounds at the back corner)
}

// ---------------------------------------------------------------------------------------------
// Hero home
// ---------------------------------------------------------------------------------------------
function heroFor(spec: SceneSpec, style: FlavorStyle, r: Rng, indoor: boolean): Omit<HeroSpec, "room"> {
  const wallPick = r.int(0, style.walls.length - 1);
  const wall = style.walls[wallPick]!;
  const wall2 = style.walls[(wallPick + 1) % style.walls.length]!;
  const flatFlavor = style.roofKind === "flat";
  const sea = spec.flavor === "southeast_asia";
  const base = {
    pos: HERO_POS,
    wall,
    wall2,
    roofColor: style.roof,
    trim: style.trim,
    door: style.door,
    porch: false,
    balconies: false,
    arcade: false,
    chimney: false,
    bigWindows: false,
    cutaway: indoor,
    floorH: 0.78,
  };
  const office = spec.activity === "office_work" || spec.moment === "first_show";
  if (office) {
    return { ...base, key: `hero-office-${spec.moment === "first_show" ? "gallery" : "office"}`, kind: "office", w: 2.7, d: 2.2, floors: spec.moment === "first_show" ? 1 : 3, roof: "flat", wall: spec.moment === "first_show" ? "#F7F2E8" : "#DCE3E8", wall2: "#C9D3DA", bigWindows: true };
  }
  switch (spec.home) {
    case "dorm":
      return { ...base, key: "hero-dorm", kind: "dorm", w: 2.7, d: 2.1, floors: 3, roof: "flat", wall: "#B5654A", wall2: "#C46E55", trim: "#F4EBDD" };
    case "apartment_small":
      return { ...base, key: "hero-apt-s", kind: sea ? "shophouse" : "apartment", w: 2.3, d: 2.0, floors: 3, roof: flatFlavor || sea ? "flat" : style.roofKind, balconies: true, arcade: sea };
    case "apartment":
      return { ...base, key: "hero-apt", kind: sea ? "shophouse" : "apartment", w: 2.6, d: 2.1, floors: 4, roof: "flat", balconies: true, arcade: sea };
    case "loft_studio":
      return { ...base, key: "hero-loft", kind: "loft", w: 2.6, d: 2.1, floors: 2, roof: "flat", wall: "#B5654A", wall2: "#9C5A44", bigWindows: true, trim: "#3A4250" };
    case "townhouse":
      return { ...base, key: "hero-town", kind: "townhouse", w: 2.1, d: 2.1, floors: 3, roof: flatFlavor ? "flat" : "gable" };
    case "shared_house":
      return { ...base, key: "hero-shared", kind: "house", w: 2.5, d: 2.1, floors: 2, roof: flatFlavor ? "flat" : style.roofKind, chimney: !flatFlavor };
    case "parents_home":
      return { ...base, key: "hero-parents", kind: "house", w: 2.5, d: 2.1, floors: 2, roof: flatFlavor ? "flat" : "gable", porch: spec.flavor.startsWith("us_"), chimney: !flatFlavor };
    case "house_large":
      return { ...base, key: "hero-large", kind: "house_large", w: 3.0, d: 2.3, floors: 2, roof: flatFlavor ? "flat" : "hip", porch: spec.flavor.startsWith("us_"), chimney: !flatFlavor };
    case "house":
    default:
      return { ...base, key: spec.setting === "rural" ? "hero-farm" : "hero-house", kind: spec.setting === "rural" ? "farmhouse" : "house", w: 2.4, d: 2.0, floors: 1, roof: flatFlavor ? "flat" : style.roofKind === "hip" ? "hip" : "gable", porch: spec.flavor.startsWith("us_"), chimney: !flatFlavor };
  }
}

// ---------------------------------------------------------------------------------------------
// Rooms (indoor activities) and stages (outdoor activities): props + people spots
// ---------------------------------------------------------------------------------------------
interface Spot {
  pos: V3;
  rotY: number;
  pose: Pose;
  path?: V3[];
  speed?: number;
  carry?: "box" | "suitcase";
}

interface Vignette {
  pieces: PieceSpec[];
  procs: ProcSpec[];
  self: Spot;
  partner: Spot;
  kids: Spot[];
  others: Spot[];
  pet: Spot;
  kits: StaticKit[];
  floor?: string;
  rug?: string | null;
}

const ip = (id: string, x: number, z: number, rotY: number, key?: string, y = 0, scale = Q_SCALE): PieceSpec => ({
  key: key ?? `r-${id}-${x.toFixed(2)}`, kit: "interior", id, variant: 0, pos: [x, y, z], rotY, scale, delay: 0.25 + Math.hypot(x, z) * 0.12,
});
const pp = (type: ProcType, x: number, z: number, rotY: number, size: V3, key: string, extra: Partial<ProcSpec> = {}): ProcSpec => ({
  key, type, pos: [x, 0, z], rotY, size, delay: 0.3 + Math.hypot(x, z) * 0.1, ...extra,
});
const sp = (x: number, z: number, rotY: number, pose: Pose, extra: Partial<Spot> = {}): Spot => ({ pos: [x, 0, z], rotY, pose, ...extra });

/** Room-local coordinates: x in [-w/2, w/2], z in [-d/2, d/2]; back walls at -x and -z; camera at +x,+z. */
function roomFor(spec: SceneSpec, w: number, d: number): Vignette {
  const hw = w / 2 - 0.12;
  const hd = d / 2 - 0.12;
  const base: Vignette = {
    pieces: [], procs: [], kits: ["interior"],
    self: sp(0, 0, 0.8, "idle"), partner: sp(0.5, 0.3, -2.2, "idle"),
    kids: [sp(0.4, 0.55, 2.4, "walk", { path: loop(0.4, 0.45, 0.28), speed: 0.25 }), sp(-0.2, 0.6, 0, "idle")],
    others: [sp(0.55, -0.1, -2.4, "idle"), sp(-0.3, 0.4, 2.8, "idle"), sp(0.7, 0.5, -2.6, "idle")],
    pet: sp(0.55, 0.65, -0.5, "idle"),
    rug: "#D9825B",
  };
  // every room gets a little life on its back walls
  base.procs.push(pp("wallArt", -w / 2 + 0.075, -0.45, 0, [0.02, 0.2, 0.28], "art1", { seed: hashString(spec.placeLabel) % 97 }));
  base.procs.push(pp("wallArtZ", 0.45, -d / 2 + 0.075, 0, [0.22, 0.17, 0.02], "art2", { seed: (hashString(spec.placeLabel) % 89) + 3 }));
  const plant = ip("Houseplant_3", -hw + 0.08, -hd + 0.08, 0.3, "plant1");
  const lamp = ip("Light_Floor1", -hw + 0.08, hd - 0.25, 0, "lamp1");
  const shelf = ip("Shelf_1", -hw + 0.05, 0.25, Math.PI / 2, "shelf1", 0.34);
  switch (spec.activity) {
    case "remote_work":
    case "job_hunting":
      base.procs.push(pp("desk", -hw + 0.32, -0.1, Math.PI / 2, [0.62, 0.25, 0.3], "desk", { color: "#C49A6C" }));
      base.procs.push(pp("laptop", -hw + 0.3, -0.1, Math.PI / 2, [0.12, 0.08, 0.1], "laptop"));
      base.pieces.push(ip("Chair_1", -hw + 0.58, -0.1, -Math.PI / 2, "chair"), plant, shelf, ip("Couch_Small1", 0.35, -hd + 0.2, 0, "couch"), lamp);
      if (spec.activity === "job_hunting") base.procs.push(pp("bookStack", -hw + 0.32, 0.12, 0.3, [0.08, 0.05, 0.06], "papers", { color: "#F4EBDD" }));
      base.self = sp(-hw + 0.56, -0.1, -Math.PI / 2, "sit");
      base.partner = sp(0.35, -hd + 0.22, 0, "sit");
      base.pet = sp(0.5, 0.35, -1, "idle");
      break;
    case "studying":
      base.procs.push(pp("desk", -hw + 0.32, -0.25, Math.PI / 2, [0.62, 0.25, 0.3], "desk", { color: "#C49A6C" }));
      base.procs.push(pp("bookStack", -hw + 0.3, -0.42, 0.2, [0.1, 0.09, 0.08], "books", { color: "#5E9AA0", color2: "#E8C27A" }));
      base.procs.push(pp("laptop", -hw + 0.3, -0.15, Math.PI / 2, [0.12, 0.08, 0.1], "laptop"));
      base.pieces.push(ip(spec.home === "dorm" ? "Bed_Bunk" : "Bed_Single", 0.3, -hd + 0.28, Math.PI / 2, "bed"), ip("Chair_2", -hw + 0.58, -0.25, -Math.PI / 2, "chair"), ip("Bookshelf", -hw + 0.05, 0.55, Math.PI / 2, "bookshelf"), ip("Light_Desk", -hw + 0.25, -0.5, 0.5, "dlamp", 0.2));
      base.self = sp(-hw + 0.56, -0.25, -Math.PI / 2, "sit");
      base.others = [sp(0.3, 0.3, -2.4, "idle"), sp(0.65, 0.1, -2.2, "idle")];
      break;
    case "studio_creating":
      base.procs.push(pp("easel", -0.1, -0.15, 0.6, [0.32, 0.5, 0.05], "easel", { seed: hashString(spec.placeLabel) }));
      base.procs.push(pp("canvasStack", -hw + 0.08, 0.35, Math.PI / 2, [0.3, 0.28, 0.04], "canvases", { seed: 7 }));
      base.pieces.push(ip("Stool", 0.25, 0.2, 0, "stool"), plant, ip("Shelf_Small1", -hw + 0.05, -0.3, Math.PI / 2, "shelf", 0.3), ip("Light_Stand1", hw - 0.25, -hd + 0.15, 0, "standlamp"), ip("Table_RoundSmall", -0.6, -hd + 0.25, 0, "table"));
      base.self = sp(0.22, 0.12, -2.3, "idle");
      base.rug = "#5E9AA0";
      break;
    case "caregiving":
      base.pieces.push(ip("Couch_Small2", -hw + 0.25, -0.2, Math.PI / 2, "armchair"), ip("NightStand_1", -hw + 0.12, 0.25, Math.PI / 2, "side"), ip("Light_Floor3", -hw + 0.08, -hd + 0.1, 0, "lamp"), ip("Houseplant_5", hw - 0.12, -hd + 0.12, 0, "plant2"), ip("Bookshelf", -0.2, -hd + 0.05, 0, "books"));
      base.self = sp(-0.05, 0.05, -1.9, "idle");
      base.others = [sp(-hw + 0.3, -0.2, Math.PI / 2, "sit"), sp(0.6, 0.4, -2.4, "idle")];
      base.partner = sp(0.55, 0.3, -2.2, "idle");
      break;
    case "office_work":
      for (let i = 0; i < 3; i++) {
        const z = -hd + 0.35 + i * 0.6;
        base.procs.push(pp("monitorDesk", -hw + 0.32, z, Math.PI / 2, [0.5, 0.25, 0.28], `odesk${i}`, { color: "#ECE6DA" }));
        base.pieces.push(ip("Chair_3", -hw + 0.6, z, -Math.PI / 2, `ochair${i}`));
      }
      base.procs.push(pp("whiteboard", 0.4, -hd + 0.04, 0, [0.7, 0.42, 0.03], "wb"));
      base.pieces.push(ip("Houseplant_7", hw - 0.12, -hd + 0.12, 0, "oplant"), ip("Houseplant_1", -hw + 0.1, hd - 0.1, 0, "oplant2"));
      base.self = sp(-hw + 0.58, -hd + 0.95, -Math.PI / 2, "sit");
      base.others = [sp(-hw + 0.58, -hd + 0.35, -Math.PI / 2, "sit"), sp(-hw + 0.58, -hd + 1.55, -Math.PI / 2, "sit"), sp(0.45, -hd + 0.4, Math.PI, "idle")];
      base.partner = sp(0.6, 0.3, -2.5, "idle");
      base.rug = null;
      base.floor = "#CFC6B8";
      break;
    case "family_time":
    case "resting":
    case "celebrating":
    case "socializing":
    default: {
      const winter = spec.season === "winter";
      base.pieces.push(ip("Couch_Medium1", -hw + 0.3, -0.05, Math.PI / 2, "couch"), ip("Table_RoundSmall", -0.05, 0.0, 0, "ctable"), lamp, plant);
      base.pieces.push(winter ? ip("Fireplace", 0.25, -hd + 0.12, 0, "fire") : ip("Drawer_1", 0.25, -hd + 0.15, 0, "drawer"));
      base.self = sp(-hw + 0.3, 0.1, Math.PI / 2, "sit");
      base.partner = sp(-hw + 0.3, -0.22, Math.PI / 2, "sit");
      base.kids = [sp(0.35, 0.35, -2.4, "idle"), sp(0.6, -0.1, -2, "walk", { path: loop(0.5, 0.25, 0.25), speed: 0.22 })];
      base.others = [sp(0.5, 0.35, -2.3, "idle"), sp(0.65, -0.2, -1.9, "idle"), sp(0.2, 0.55, -2.8, "idle")];
      base.pet = sp(0.25, 0.4, -2, "idle");
      if (spec.activity === "celebrating") base.procs.push(pp("stringLights", 0, -hd + 0.02, 0, [w - 0.3, 0.62, 0.1], "lights-in"));
    }
  }
  return base;
}

function loop(cx: number, cz: number, rad: number, n = 10): V3[] {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rad, 0, cz + Math.sin(a) * rad]);
  }
  return pts;
}

/** Outdoor vignettes happen around STAGE (world coords). */
function stageFor(spec: SceneSpec, b: Builder): Vignette {
  const [sx, , sz] = STAGE;
  const v: Vignette = {
    pieces: [], procs: [], kits: [],
    self: sp(sx, sz, 0.8, "idle"), partner: sp(sx + 0.35, sz - 0.2, -2.3, "idle"),
    kids: [sp(sx - 0.4, sz + 0.45, 0.4, "walk", { path: loop(sx - 0.3, sz + 0.4, 0.35), speed: 0.3 }), sp(sx + 0.5, sz + 0.5, -0.6, "idle")],
    others: [sp(sx - 0.45, sz - 0.1, 1.6, "idle"), sp(sx + 0.15, sz - 0.55, 0.2, "idle"), sp(sx + 0.6, sz + 0.1, -1.7, "idle")],
    pet: sp(sx + 0.3, sz + 0.35, -0.8, "idle"),
  };
  const piece = (kit: StaticKit, id: string, x: number, z: number, rot: number, scale: number, key: string): PieceSpec => {
    v.kits.push(kit);
    return { key, kit, id, variant: 0, pos: [x, 0, z], rotY: rot, scale, delay: 0.35 + Math.hypot(x - sx, z - sz) * 0.15 };
  };
  const proc = (type: ProcType, x: number, z: number, rot: number, size: V3, key: string, extra: Partial<ProcSpec> = {}): ProcSpec => ({
    key, type, pos: [x, 0, z], rotY: rot, size, delay: 0.35 + Math.hypot(x - sx, z - sz) * 0.15, ...extra,
  });
  switch (spec.activity) {
    case "commuting": {
      // walk a loop along the front path toward the street; a bus stop by the road
      v.procs.push(proc("busStop", 2.6, -1.35, Math.PI, [0.8, 0.5, 0.3], "busstop", { color: "#3E8C93" }));
      const path: V3[] = [[3.6, 0, 3.2], [3.5, 0, 0.4], [3.2, 0, -1.25], [1.0, 0, -1.3], [0.9, 0, 0.1], [1.6, 0, 1.6], [2.6, 0, 2.9]];
      v.self = sp(3.6, 3.2, 0, "walk", { path, speed: 0.42 });
      v.partner = sp(3.0, -1.3, Math.PI, "idle");
      v.others = [sp(2.2, -1.3, Math.PI, "idle"), sp(1.6, 1.4, 0.4, "walk", { path: [...path].reverse(), speed: 0.38 })];
      v.pet = sp(3.4, 3.0, 0, "walk", { path: path.map(([x, y, z]) => [x + 0.18, y, z + 0.1] as V3), speed: 0.42 });
      break;
    }
    case "exercising": {
      const path = loop(0.9, 0.9, 2.55, 18);
      v.procs.push(proc("path", 0.9, 0.9, 0, [5.4, 0.03, 5.4], "jogloop", { color: "ring", color2: b.style.paving }));
      v.self = sp(path[0]![0], path[0]![2], 0, "jog", { path, speed: 0.75 });
      v.partner = sp(path[2]![0], path[2]![2], 0, "jog", { path: path.slice(2).concat(path.slice(0, 2)), speed: 0.75 });
      v.pet = sp(path[1]![0], path[1]![2], 0, "jog", { path: path.slice(1).concat(path.slice(0, 1)), speed: 0.75 });
      v.others = [sp(sx + 0.3, sz - 0.3, -2.0, "idle")];
      break;
    }
    case "traveling": {
      v.procs.push(proc("suitcase", sx + 0.22, sz + 0.05, 0.4, [0.14, 0.18, 0.08], "case1", { color: "#E07A5F" }));
      v.pieces.push(piece("camp", "signpost", sx - 0.55, sz - 0.4, 0.8, fit("camp", "signpost", 0.4), "sign"));
      v.self = sp(sx, sz, 0.9, "wave");
      v.partner = sp(sx + 0.5, sz - 0.25, -2.2, "idle");
      break;
    }
    case "moving": {
      v.pieces.push(piece("cars", "truck", 2.3, -1.72, Math.PI / 2, 0.36, "movetruck"));
      v.pieces.push(piece("camp", "box-large", sx + 0.5, sz - 0.6, 0.2, fit("camp", "box-large", 0.16), "mbox1"));
      v.pieces.push(piece("camp", "box", sx + 0.7, sz - 0.35, 0.6, fit("camp", "box", 0.11), "mbox2"));
      v.pieces.push(piece("camp", "box-open", sx + 0.25, sz - 0.75, 0.9, fit("camp", "box-open", 0.11), "mbox3"));
      v.pieces.push(piece("camp", "box", sx + 0.62, sz - 0.62, 1.4, fit("camp", "box", 0.1), "mbox4", ));
      const path: V3[] = [[1.75, 0, -1.15], [1.2, 0, 0.0], [0.45, 0, 0.85], [1.2, 0, 0.0]];
      v.self = sp(1.75, -1.15, -Math.PI / 2, "carry", { path, speed: 0.32, carry: "box" });
      v.partner = sp(1.0, 0.95, 0, "carry", { path: [path[2]!, path[3]!, path[0]!, path[1]!], speed: 0.32, carry: "box" });
      v.others = [sp(sx + 0.85, sz - 0.1, -2.4, "idle")];
      break;
    }
    case "socializing": {
      const t1: V3 = [sx - 0.2, 0, sz + 0.1];
      const t2: V3 = [sx + 0.75, 0, sz - 0.6];
      v.procs.push(proc("parasolTable", t1[0], t1[2], 0, [0.32, 0.22, 0.32], "pt1", { color: "#EE8E7A" }));
      v.procs.push(proc("parasolTable", t2[0], t2[2], 0, [0.32, 0.22, 0.32], "pt2", { color: "#9ED3C6" }));
      v.pieces.push(piece("food", "cup-coffee", t1[0] + 0.05, t1[2], 0, fit("food", "cup-coffee", 0.04), "cup1"));
      v.pieces.push(piece("food", "croissant", t1[0] - 0.06, t1[2] + 0.04, 0.5, fit("food", "croissant", 0.025), "croiss"));
      v.self = sp(t1[0] + 0.3, t1[2] + 0.02, -Math.PI / 2, "sit");
      v.partner = sp(t1[0] - 0.3, t1[2], Math.PI / 2, "sit");
      v.others = [sp(t1[0], t1[2] - 0.3, 0, "sit"), sp(t2[0] + 0.3, t2[2], -Math.PI / 2, "sit"), sp(t2[0] - 0.3, t2[2], Math.PI / 2, "sit")];
      v.pet = sp(t1[0] + 0.3, t1[2] + 0.3, -1.4, "idle");
      if (spec.timeOfDay !== "day") v.procs.push(proc("stringLights", sx + 0.25, sz - 0.25, -Math.PI / 4, [2.4, 0.75, 0.1], "slights"));
      break;
    }
    case "celebrating": {
      v.procs.push(proc("partyTable", sx, sz - 0.1, -Math.PI / 4, [0.9, 0.2, 0.32], "ptable", { color: "#F4EBDD" }));
      v.pieces.push(piece("food", "cake-birthday", sx, sz - 0.1, 0, fit("food", "cake-birthday", 0.07), "cake"));
      v.pieces.push(piece("food", "glass-wine", sx + 0.2, sz - 0.3, 0, fit("food", "glass-wine", 0.05), "wine1"));
      v.pieces.push(piece("food", "glass-wine", sx - 0.22, sz + 0.12, 0, fit("food", "glass-wine", 0.05), "wine2"));
      v.pieces.push(piece("props", "present-a-cube", sx + 0.55, sz + 0.35, 0.4, fit("props", "present-a-cube", 0.1), "gift1"));
      v.pieces.push(piece("props", "present-b-round", sx + 0.7, sz + 0.15, 0.1, fit("props", "present-b-round", 0.09), "gift2"));
      v.procs.push(proc("stringLights", sx + 0.1, sz - 0.1, -Math.PI / 4, [2.6, 0.8, 0.1], "slights"));
      v.self = sp(sx + 0.3, sz + 0.25, -2.4, "victory");
      v.partner = sp(sx - 0.25, sz + 0.4, -2.8, "idle");
      v.others = [sp(sx - 0.45, sz - 0.25, 1.2, "victory"), sp(sx + 0.45, sz - 0.5, -0.3, "idle"), sp(sx - 0.05, sz - 0.6, 0.6, "wave")];
      break;
    }
    case "family_time": {
      v.procs.push(proc("picnic", sx, sz, -Math.PI / 4, [0.9, 0.02, 0.7], "blanket", { color: "#EE8E7A", color2: "#F4EBDD" }));
      v.pieces.push(piece("food", "watermelon", sx + 0.1, sz - 0.05, 0.3, fit("food", "watermelon", 0.05), "melon"));
      v.pieces.push(piece("food", "bread", sx - 0.1, sz + 0.1, 0.8, fit("food", "bread", 0.04), "bread"));
      v.self = sp(sx - 0.15, sz - 0.25, 0.6, "sit");
      v.partner = sp(sx + 0.25, sz + 0.05, -2.4, "sit");
      v.kids = [sp(sx + 0.7, sz + 0.6, 0, "walk", { path: loop(sx + 0.6, sz + 0.5, 0.45, 12), speed: 0.35 }), sp(sx - 0.55, sz + 0.5, 0.9, "idle")];
      v.pet = sp(sx + 0.65, sz + 0.75, 0, "walk", { path: loop(sx + 0.6, sz + 0.5, 0.45, 12).slice(5).concat(loop(sx + 0.6, sz + 0.5, 0.45, 12).slice(0, 5)), speed: 0.35 });
      break;
    }
    case "resting":
    default: {
      v.pieces.push(piece("props", "bench", sx - 0.1, sz - 0.15, -Math.PI / 4 + Math.PI, fit("props", "bench", 0.16), "rbench"));
      v.self = sp(sx - 0.1, sz - 0.15, Math.PI / 4, "sit");
      v.partner = sp(sx + 0.25, sz + 0.15, Math.PI / 4, "sit");
      v.pet = sp(sx + 0.4, sz + 0.3, -2.2, "idle");
      v.procs.push(proc("flowerBed", sx + 0.65, sz - 0.7, Math.PI / 4, [0.8, 0.08, 0.3], "fbed", { color: "#F4B6C2" }));
      break;
    }
  }
  return v;
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------
const AGE: Record<AgeBand, { scale: number; stoop: number; grey: number }> = {
  baby: { scale: 0.32, stoop: 0, grey: 0 },
  child: { scale: 0.58, stoop: 0, grey: 0 },
  teen: { scale: 0.86, stoop: 0, grey: 0 },
  young_adult: { scale: 1, stoop: 0, grey: 0 },
  adult: { scale: 1, stoop: 0, grey: 0.05 },
  middle: { scale: 1, stoop: 0.35, grey: 0.35 },
  senior: { scale: 0.96, stoop: 1, grey: 0.85 },
};

/** The self's figure: the user's own gender (if they gave one) picks the clothing silhouette, the hair style picks within it. */
function selfModel(app: Appearance | null): PersonModel {
  const hair = app?.hairStyle ?? null;
  if (app?.gender === "woman") {
    if (hair === "long" || hair === "bun") return "Casual_Female";
    if (hair === "curly" || hair === "coily") return "Casual2_Female";
    return "Casual3_Female";
  }
  if (app?.gender === "man") {
    if (hair === "shaved") return "Casual_Bald";
    if (hair === "curly" || hair === "coily" || hair === "long" || hair === "bun") return "Casual_Male";
    if (hair === "short") return "Casual2_Male";
    return "Casual3_Male";
  }
  switch (hair) {
    case "long":
    case "bun":
      return "Casual_Female";
    case "curly":
    case "coily":
      return "Casual2_Female";
    case "medium":
      return "Casual3_Female";
    case "shaved":
      return "Casual_Bald";
    case "short":
      return "Casual2_Male";
    default:
      return "Casual3_Male";
  }
}

const OTHER_MODELS: Record<Role, PersonModel[]> = {
  self: ["Casual3_Male"],
  partner: ["Casual_Female", "Casual2_Male", "Casual3_Female", "Casual_Male", "Suit_Female"],
  child: ["Casual2_Female", "Casual_Male", "Casual3_Male", "Casual_Female"],
  parent: ["OldClassy_Female", "OldClassy_Male"],
  friend: ["Casual3_Female", "Casual_Male", "Casual2_Female", "Casual_Bald", "Casual3_Male"],
  colleague: ["Suit_Male", "Suit_Female", "Doctor_Female_Young", "Worker_Female"],
  pet: ["Casual_Male"],
};
const OTHER_SKIN = ["#F0CDB4", "#D7A27D", "#B87C57", "#8C5A3C", "#E4B996", "#6B4430"];
const OTHER_HAIR = ["#2A2422", "#4A3226", "#7A5236", "#B5502E", "#D9B56A", "#3E3A36"];

function peopleFor(spec: SceneSpec, vig: Vignette, appearance: Appearance | null, origin: V3, place: string): PersonSlot[] {
  const counts: Partial<Record<Role, number>> = {};
  const out: PersonSlot[] = [];
  let otherIdx = 0;
  let kidIdx = 0;
  const people = spec.people.some((p) => p.role === "self") ? spec.people : [{ role: "self" as const, ageBand: "young_adult" as const }, ...spec.people];
  const [ox, , oz] = origin;
  const toWorld = (s: Spot): Spot => ({ ...s, pos: [s.pos[0] + ox, 0, s.pos[2] + oz], path: s.path?.map(([x, y, z]) => [x + ox, y, z + oz] as V3) });
  for (const p of people) {
    const i = counts[p.role] ?? 0;
    counts[p.role] = i + 1;
    const r = rng(`${place}|${p.role}|${i}`);
    const age = AGE[p.ageBand];
    let spot: Spot;
    if (p.role === "self") spot = vig.self;
    else if (p.role === "partner") spot = vig.partner;
    else if (p.role === "pet") spot = vig.pet;
    else if (p.role === "child") spot = vig.kids[kidIdx++] ?? vig.others[otherIdx++] ?? sp(0, 0, 0, "idle");
    else spot = vig.others[otherIdx++] ?? sp(r.range(-0.4, 0.4), r.range(-0.4, 0.4), r.range(0, 6), "idle");
    spot = toWorld(spot);
    // A child too small for the pose gets a simpler one; babies ride in a pram.
    let pose = spot.pose;
    if (p.ageBand === "baby") pose = "idle";
    if (p.ageBand === "child" && pose === "sit") pose = "idle";
    if (p.ageBand === "senior" && pose === "jog") pose = "walk";
    const isPet = p.role === "pet";
    const model: PersonModel | AnimalModel = isPet
      ? r.chance(0.6) ? "Dog" : "Cat"
      : p.role === "self"
        ? selfModel(appearance)
        : r.pick(OTHER_MODELS[p.role]);
    const selfSkin = appearance?.skinTone ? SKIN[appearance.skinTone]! : NEUTRAL_SKIN;
    const selfHair = appearance?.hairColor ? HAIR[appearance.hairColor]! : HAIR.dark_brown!;
    const cl = CLOTHES.others[(hashString(`${place}${p.role}${i}`) >>> 0) % CLOTHES.others.length]!;
    // A child shares a parent's skin family (seeded), never inferred from anything about the user.
    const skin = p.role === "self" ? selfSkin : p.role === "child" && appearance?.skinTone ? selfSkin : r.pick(OTHER_SKIN);
    const ex = spot.pos[0] + (spot.pos[0] - 0.3 > 0 ? 1 : -1) * 2.2;
    out.push({
      key: isPet ? `pet${i}` : `${p.role}${i}`,
      role: p.role,
      ageBand: p.ageBand,
      model,
      pet: isPet,
      pos: spot.pos,
      rotY: spot.rotY,
      pose,
      path: spot.path && (pose === "walk" || pose === "jog" || pose === "carry") ? spot.path : null,
      speed: (spot.speed ?? 0.4) * (p.ageBand === "senior" ? 0.7 : p.ageBand === "middle" ? 0.9 : p.ageBand === "child" ? 1.1 : 1),
      enterFrom: [Math.max(-HALF + 0.3, Math.min(HALF - 0.3, ex)), 0, Math.min(HALF - 0.3, spot.pos[2] + 2)],
      scale: isPet ? 1 : age.scale,
      stoop: isPet ? 0 : age.stoop,
      grey: isPet ? 0 : p.role === "self" ? age.grey : Math.max(age.grey, p.role === "parent" ? 0.8 : 0),
      skin,
      hair: p.role === "self" ? selfHair : r.pick(OTHER_HAIR),
      shirt: p.role === "self" ? CLOTHES.self.shirt : cl.shirt,
      pants: p.role === "self" ? CLOTHES.self.pants : cl.pants,
      carry: spot.carry && (pose === "carry") ? spot.carry : null,
      index: i,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------------------------
export function placeKeyOf(spec: Pick<SceneSpec, "setting" | "flavor" | "placeLabel">) {
  return `${spec.setting}|${spec.flavor}|${spec.placeLabel}`;
}

export function compose(spec: SceneSpec, appearance: Appearance | null): Layout {
  const placeKey = placeKeyOf(spec);
  const style = FLAVOR[spec.flavor];
  const temperate = TEMPERATE[spec.flavor];
  const snow = snowCoverFor(spec);
  const r = rng(placeKey);
  const b = new Builder(spec, r, style, snow, temperate);
  const indoor = isIndoor(spec);

  // hero lot first so nothing grows through it
  b.claim(HERO_POS[0], HERO_POS[2], 1.55);
  b.claim(STAGE[0], STAGE[2], 1.15);
  b.claim(1.1, 1.1, 0.6); // front path
  composeSetting(b, spec.setting);

  // hills for hilly flavours (behind the island back corner)
  const hills = style.hills
    ? [
        { pos: [-4.1, 0, -4.4] as V3, r: 1.5, h: 0.9 },
        { pos: [-4.6, 0, -2.6] as V3, r: 1.1, h: 0.6 },
      ].filter(() => spec.setting !== "city_dense" && spec.setting !== "campus")
    : [];

  const heroBase = heroFor(spec, style, rng(`${placeKey}|hero|${spec.home}`), indoor);
  // a front path from the door to the stage
  b.proc("path", 0.95, 0.95, Math.PI / 4, [2.0, 0.03, 0.38], "frontpath", { color: style.paving });
  if (spec.setting !== "city_dense" && spec.setting !== "city_midrise") {
    b.proc("flowerBed", HERO_POS[0] + heroBase.w / 2 + 0.12, HERO_POS[2] - 0.4, Math.PI / 2, [1.0, 0.07, 0.2], "bedR", { color: spec.season === "winter" ? "#F3F6F8" : "#EE8E7A" });
  }

  const room = roomFor(spec, heroBase.w, heroBase.d);
  const stage = stageFor(spec, b);
  const vig = indoor ? room : stage;
  const origin: V3 = indoor ? [HERO_POS[0], 0, HERO_POS[2]] : [0, 0, 0];
  const people = peopleFor(spec, vig, appearance, origin, placeKey);

  // babies ride in a pram next to whoever is looking after them
  const baby = spec.people.find((p) => p.ageBand === "baby");
  if (baby) {
    const carer = people.find((p) => p.role === "partner") ?? people.find((p) => p.role === "self")!;
    const at: V3 = [carer.pos[0] + 0.32, 0, carer.pos[2] + 0.12];
    if (indoor) room.procs.push(pp("pram", carer.pos[0] - origin[0] + 0.32, carer.pos[2] - origin[2] + 0.12, carer.rotY, [0.22, 0.2, 0.14], "pram", { color: "#9ED3C6" }));
    else b.proc("pram", at[0], at[2], carer.rotY, [0.22, 0.2, 0.14], "pram", { color: "#9ED3C6" });
  }

  for (const k of vig.kits) b.kits.add(k);
  if (indoor) b.kits.add("interior");
  b.kits.add("props");

  const hero: HeroSpec = {
    ...heroBase,
    room: indoor
      ? { pieces: room.pieces, procs: room.procs, floor: room.floor ?? "#D9B48C", wallIn: "#F4EBDD", rug: room.rug === undefined ? "#D9825B" : room.rug }
      : { pieces: [], procs: [], floor: "#D9B48C", wallIn: "#F4EBDD", rug: null },
  };

  // ambient walkers on the sidewalks make a place feel lived in (muted clothes, never the hero coral)
  const walkerCount: Record<Setting, number> = { city_dense: 3, city_midrise: 2, small_town: 2, suburb: 1, campus: 3, coastal: 1, rural: 0 };
  const wr = rng(`${placeKey}|walkers`);
  const walkLines: V3[][] = spec.setting === "campus"
    ? [[[0.8, 0, -2.0], [3.9, 0, -3.5]], [[3.9, 0, -2.0], [0.8, 0, -3.5]], [[-2.0, 0, -1.4], [-2.0, 0, 3.6]]]
    : spec.setting === "rural"
      ? []
      : [[[-4.4, 0, -1.4], [4.4, 0, -1.4]], [[4.4, 0, -2.75], [-4.4, 0, -2.75]], [[-1.4, 0, 4.2], [-1.4, 0, -1.0]]];
  for (let i = 0; i < Math.min(walkerCount[spec.setting], walkLines.length); i++) {
    const line = walkLines[i]!;
    const cl = CLOTHES.others[(i + 2) % CLOTHES.others.length]!;
    const t0 = wr();
    const sx = line[0]![0] + (line[1]![0] - line[0]![0]) * t0;
    const sz = line[0]![2] + (line[1]![2] - line[0]![2]) * t0;
    people.push({
      key: `walker${i}`, role: "friend", ageBand: "adult", model: wr.pick(OTHER_MODELS.friend), pet: false,
      pos: [sx, 0, sz], rotY: 0, pose: "walk", path: line, speed: wr.range(0.28, 0.36), enterFrom: [sx, 0, sz],
      scale: wr.range(0.94, 1.02), stoop: 0, grey: wr.chance(0.25) ? 0.6 : 0, skin: wr.pick(OTHER_SKIN), hair: wr.pick(OTHER_HAIR),
      shirt: cl.shirt, pants: cl.pants, carry: null, index: i,
    });
  }

  const cars: CarLane[] = [];
  if (b.kits.has("cars") && spec.setting !== "rural") {
    const ids = spec.flavor === "southeast_asia" || spec.flavor === "east_asia" ? ["taxi", "sedan", "van"] : ["sedan", "hatchback-sports", "suv", "van", "taxi"];
    const roadZ = spec.setting === "city_dense" || spec.setting === "city_midrise" ? -2.1 : -2.0;
    const n = spec.setting === "city_dense" ? 3 : spec.setting === "city_midrise" ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const lane = roadZ + dir * 0.24;
      const x0 = spec.setting === "coastal" ? -0.7 : -(HALF - 0.2);
      const x1 = HALF - 0.2;
      cars.push({ key: `car${i}`, id: ids[(i + r.int(0, 4)) % ids.length]!, from: [dir > 0 ? x0 : x1, 0, lane], to: [dir > 0 ? x1 : x0, 0, lane], speed: 0.75 + i * 0.12, offset: i * 0.37 });
    }
  }

  // indoor years: the stage becomes a small garden or pocket park so the front never sits empty
  if (indoor) {
    const [sx, , sz] = STAGE;
    const city = spec.setting === "city_dense" || spec.setting === "city_midrise";
    b.tree(sx + 0.55, sz - 0.65, city ? (style.trees.palm > 2 ? "palm" : "broad") : undefined, "gtree");
    b.piece("props", "bench", sx - 0.25, sz + 0.35, Math.PI * 0.75, fit("props", "bench", 0.2), "gbench");
    b.proc("flowerBed", sx + 0.6, sz + 0.55, Math.PI / 4, [0.9, 0.08, 0.3], "gbed", { color: "#F4B6C2" });
    if (!city) b.scatter(5, snow > 0.5 ? ["Bush_Snow_1"] : ["Bush_1", "BushBerries_1", "Flowers"], 0.28, "gb", 3.6);
  }

  const pieces = [...b.pieces, ...stage.pieces.filter(() => !indoor)];
  const procs = [...b.procs, ...(indoor ? [] : stage.procs)];
  const focus: V3 = indoor ? [HERO_POS[0], 0.35, HERO_POS[2]] : spec.activity === "exercising" || spec.activity === "commuting" ? [0.7, 0.3, 0.7] : [STAGE[0] * 0.62, 0.3, STAGE[2] * 0.62];

  return {
    placeKey,
    setting: spec.setting,
    flavor: spec.flavor,
    style,
    coast: spec.setting === "coastal",
    hills,
    pieces,
    procs,
    hero,
    people,
    cars,
    indoor,
    focus,
    stage: STAGE,
    kits: [...b.kits],
    snowCover: snow,
    temperate,
  };
}

/** Kits a spec needs (for preloading before a transition). */
export function kitsFor(spec: SceneSpec): StaticKit[] {
  return compose(spec, null).kits;
}
