/**
 * A signature landmark per branch in "Meanwhile, in your other lives…" (pure, deterministic).
 *
 * Each cut of the interlude gets one landmark silhouette that says where that life is (a canal for
 * Amsterdam, a cable car for Lisbon, the three towers and the deck for Singapore, a lighthouse on a
 * coast, one huge tree in the country…) and one accent colour (I marigold, II teal, III rose; the
 * caption's numeral wears the same colour). Within one interlude no two cuts share a landmark, and
 * two lives in the same city also get a different neighbourhood (the layout is re-seeded per cut),
 * so every cut is recognisable at a glance from the others.
 */
import type { SceneSpec } from "../../shared/sim";

export const LANDMARKS = [
  "canal", "cableCar", "marinaTowers", "supertrees", "latticeTower", "clockTower", "stepSpire", "needle", "pagoda",
  "sails", "bridge", "lighthouse", "windmill", "waterTower", "bigTree", "ferrisWheel", "balloon",
] as const;
export type LandmarkKind = (typeof LANDMARKS)[number];

/** Branch accents, by the numeral the caption shows (I, II, III). Equal weight: none reads "better". */
export const BRANCH_ACCENTS = ["#F0A830", "#24A094", "#DC5A78"] as const;
export const branchAccent = (i: number): string => BRANCH_ACCENTS[((i % 3) + 3) % 3]!;

export interface LandmarkMark {
  kind: LandmarkKind;
  accent: string;
  /** Re-seeds the neighbourhood so two lives in one city don't share a street. */
  variant: number;
}

/** Place names first (what people recognise), then the setting and the region. */
const PLACES: [RegExp, LandmarkKind[]][] = [
  [/amsterdam|utrecht|rotterdam|delft|leiden|haarlem|netherlands|holland/, ["canal", "windmill"]],
  [/venice|venezia|bruges|brugge|copenhagen|k[øo]benhavn|stockholm|st\.? petersburg/, ["canal"]],
  [/lisbon|lisboa|porto|portugal|medell[ií]n|la paz|caracas|barcelona/, ["cableCar", "lighthouse"]],
  [/singapore/, ["marinaTowers", "supertrees"]],
  [/paris|france|lyon/, ["latticeTower"]],
  [/london|england|united kingdom|\buk\b|oxford|cambridge, uk/, ["clockTower", "ferrisWheel"]],
  [/new york|nyc|manhattan|brooklyn|queens|chicago/, ["stepSpire"]],
  [/san francisco|\bsf\b|oakland|bay area|marin/, ["bridge", "cableCar"]],
  [/seattle|toronto|auckland|las vegas|dubai|berlin/, ["needle"]],
  [/sydney/, ["sails", "bridge"]],
  [/melbourne|brisbane|perth/, ["ferrisWheel"]],
  [/tokyo|kyoto|osaka|nara|japan|seoul|korea|taipei|taiwan|beijing|shanghai|china|hong kong/, ["pagoda", "needle"]],
  [/durham|raleigh|chapel hill|north carolina|\bnc\b|cary|winston/, ["waterTower", "bigTree"]],
  [/switzerland|zurich|z[üu]rich|geneva|denver|boulder|salt lake|vancouver|innsbruck|chamonix|colorado/, ["cableCar"]],
  [/rio de janeiro|cape town|hong kong/, ["cableCar"]],
];

const BY_SETTING: Record<SceneSpec["setting"], LandmarkKind[]> = {
  coastal: ["lighthouse", "bridge", "sails"],
  rural: ["bigTree", "windmill", "balloon"],
  small_town: ["waterTower", "bigTree"],
  suburb: ["waterTower", "bigTree", "balloon"],
  campus: ["bigTree", "balloon"],
  city_dense: ["ferrisWheel", "stepSpire", "needle"],
  city_midrise: ["ferrisWheel", "needle", "clockTower"],
};

const BY_FLAVOR: Partial<Record<SceneSpec["flavor"], LandmarkKind[]>> = {
  east_asia: ["pagoda"],
  southeast_asia: ["supertrees"],
  europe_north: ["windmill", "canal"],
  europe_south: ["cableCar"],
  us_west: ["bridge"],
  us_midwest: ["windmill", "waterTower"],
  us_south: ["waterTower"],
  oceania: ["sails"],
  latam: ["cableCar"],
};

const FALLBACK: LandmarkKind[] = ["balloon", "ferrisWheel", "bigTree", "lighthouse", "windmill", "waterTower", "needle"];

/** Landmarks the island can actually hold (a bridge or a lighthouse needs the sea). */
function fits(kind: LandmarkKind, spec: SceneSpec): boolean {
  if (kind === "bridge") return spec.setting === "coastal";
  if (kind === "canal") return spec.setting !== "rural" && spec.setting !== "coastal";
  return true;
}

export function landmarkCandidates(spec: SceneSpec): LandmarkKind[] {
  const place = spec.placeLabel.toLowerCase();
  const out: LandmarkKind[] = [];
  for (const [re, kinds] of PLACES) if (re.test(place)) out.push(...kinds);
  if (spec.activity === "traveling") out.push("balloon");
  out.push(...BY_SETTING[spec.setting], ...(BY_FLAVOR[spec.flavor] ?? []), ...FALLBACK);
  return [...new Set(out)].filter((k) => fits(k, spec));
}

/** One mark per cut, in order; no landmark twice in one interlude. */
export function assignLandmarks(cuts: { scene: SceneSpec }[]): LandmarkMark[] {
  const used = new Set<LandmarkKind>();
  return cuts.map((c, i) => {
    const cands = landmarkCandidates(c.scene);
    const kind = cands.find((k) => !used.has(k)) ?? cands[0] ?? "balloon";
    used.add(kind);
    return { kind, accent: branchAccent(i), variant: i + 1 };
  });
}

// ---------------------------------------------------------------------------------------------
// Placement: where each landmark stands, and what it clears around it.
// Island: x, z in [-5, 5]; the camera looks from +x,+z, so tall things go to the back-left corner.
// ---------------------------------------------------------------------------------------------
export interface LandmarkSpec extends LandmarkMark {
  pos: [number, number, number];
  rotY: number;
  /** Things within this footprint are cleared (buildings, trees, props). */
  clear: { x: number; z: number; r: number }[];
  /** Clear a band instead (canal): |z - band.z| < band.half. */
  band: { z: number; half: number } | null;
  /** Bigger in a city, so it stays the skyline. */
  scale: number;
}

/** Faces the default camera (from +x,+z): a flat thing's front turns toward the viewer. */
const FACE_CAMERA = Math.PI / 4;

export function placeLandmark(mark: LandmarkMark, spec: SceneSpec): LandmarkSpec {
  const city = spec.setting === "city_dense" || spec.setting === "city_midrise";
  const base = { ...mark, rotY: FACE_CAMERA, band: null as LandmarkSpec["band"], scale: city && mark.kind !== "canal" && mark.kind !== "cableCar" ? 1.3 : 1 };
  const coastal = spec.setting === "coastal";
  switch (mark.kind) {
    case "canal":
      return { ...base, pos: [0, 0, 3.95], rotY: 0, clear: [], band: { z: 3.95, half: 0.75 } };
    case "bridge":
      // over the sea along the back-left shore
      return { ...base, pos: [-3.45, 0, 0], rotY: 0, clear: [{ x: -3.45, z: 1.2, r: 0.9 }] };
    case "lighthouse":
      return coastal
        ? { ...base, pos: [-3.65, 0, -3.1], clear: [{ x: -3.65, z: -3.1, r: 1.0 }] }
        : { ...base, pos: [-3.6, 0, -3.6], clear: [{ x: -3.6, z: -3.6, r: 1.25 }] };
    case "cableCar":
      return { ...base, pos: [-3.7, 0, -3.7], clear: [{ x: -3.7, z: -3.7, r: 1.1 }] };
    case "ferrisWheel":
    case "marinaTowers":
    case "supertrees":
      return { ...base, pos: [-3.35, 0, -3.35], clear: [{ x: -3.35, z: -3.35, r: 1.9 }] };
    case "balloon":
      return { ...base, pos: [-2.6, 0, -3.4], clear: [] };
    case "bigTree":
      return { ...base, pos: [-3.45, 0, -3.45], clear: [{ x: -3.45, z: -3.45, r: 1.6 }] };
    default:
      return { ...base, pos: [-3.55, 0, -3.55], clear: [{ x: -3.55, z: -3.55, r: 1.45 }] };
  }
}
