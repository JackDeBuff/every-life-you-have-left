/**
 * The world's palette (docs/WORLD.md §3). A SceneSpec maps to a `Look`: a flat bag of colours and
 * numbers that the sky, lights, materials and the grade read every frame. Looks blend smoothly.
 */
import { Color } from "three";
import type { SceneSpec } from "../../shared/sim";

type Flavor = SceneSpec["flavor"];
type Season = SceneSpec["season"];
type TimeOfDay = SceneSpec["timeOfDay"];
type Weather = SceneSpec["weather"];
type Mood = SceneSpec["mood"];

export const SWATCH = {
  cream: "#F4EBDD",
  sand: "#E7D3B0",
  sage: "#A9C59A",
  moss: "#6F9A6A",
  pine: "#3F6B5A",
  terracotta: "#D9825B",
  clay: "#B5654A",
  butter: "#F2C66D",
  coral: "#EE8E7A",
  sea: "#6FB7B4",
  deepSea: "#3E8C93",
  ink: "#2E3A4F",
  soil: "#9C6B4E",
  soilDark: "#7A5240",
  glow: "#FFC56B",
  snow: "#F3F6F8",
} as const;

export interface FlavorStyle {
  walls: string[];
  roof: string;
  trim: string;
  door: string;
  ground: string;
  /** Path / plaza paving. */
  paving: string;
  /** Vegetation family weights. */
  trees: { broad: number; pine: number; birch: number; palm: number; cactus: number; willow: number };
  roofKind: "gable" | "hip" | "flat";
  /** Deep neutral that replaces Kenney's dark greys (frames, dark facades, flat roofs). */
  dark: string;
  /** Extra roof tones for neighbours (variety within the flavour). */
  roofs?: string[];
  hills: boolean;
  haze: number;
}

const T = (broad: number, pine: number, birch: number, palm: number, cactus = 0, willow = 0) => ({
  broad, pine, birch, palm, cactus, willow,
});

export const FLAVOR: Record<Flavor, FlavorStyle> = {
  us_south: { walls: ["#C46E55", "#F3EEE4", "#E9D8BC"], roof: "#5B6470", trim: "#FFFFFF", door: "#2F4F6F", ground: "#A9C59A", paving: "#E9E0D0", trees: T(5, 2, 1, 0, 0, 1), roofKind: "gable", dark: "#4E5560", roofs: ["#5B6470", "#7B4B3A", "#4E5A52"], hills: false, haze: 0.15 },
  us_northeast: { walls: ["#E9E2D3", "#9FB4C7", "#C9D6CF"], roof: "#4B5563", trim: "#FFFFFF", door: "#7A2E2E", ground: "#A3C294", paving: "#E4E1DA", trees: T(4, 2, 3, 0), roofKind: "gable", dark: "#4A5260", roofs: ["#4B5563", "#7A2E2E", "#3E4652"], hills: false, haze: 0.1 },
  us_west: { walls: ["#EBD9BE", "#F4EBDD", "#E3C9A8"], roof: "#C9764F", trim: "#F7F2E8", door: "#3E8C93", ground: "#C4C58E", paving: "#EADFC9", trees: T(1, 2, 0, 3, 1), roofKind: "hip", dark: "#7A6656", hills: true, haze: 0.2 },
  us_midwest: { walls: ["#F1EBDD", "#D9C7A7", "#BFD0D8"], roof: "#7B4B3A", trim: "#FFFFFF", door: "#3F6B5A", ground: "#A9C59A", paving: "#E4DDCF", trees: T(5, 1, 1, 0), roofKind: "gable", dark: "#5A5450", roofs: ["#7B4B3A", "#5B6470"], hills: false, haze: 0.1 },
  europe_south: { walls: ["#F7F2E8", "#E8C27A", "#F2D3B3"], roof: "#D9825B", trim: "#FBF8F1", door: "#3E6E8E", ground: "#B9C48E", paving: "#EFE4CF", trees: T(2, 3, 0, 1, 0, 0), roofKind: "hip", dark: "#8A7464", roofs: ["#D9825B", "#C9764F", "#E39B6B"], hills: true, haze: 0.15 },
  europe_north: { walls: ["#B4553F", "#DDB45A", "#F3EFE6"], roof: "#3E4652", trim: "#FFFFFF", door: "#2E3A4F", ground: "#9FBE90", paving: "#DCDDD8", trees: T(1, 5, 3, 0), roofKind: "gable", dark: "#3E4652", roofs: ["#3E4652", "#B4553F", "#5B6470"], hills: true, haze: 0.12 },
  east_asia: { walls: ["#F2EEE6", "#D6DCDD", "#EADCC8"], roof: "#4F5D6B", trim: "#FFFFFF", door: "#9C3B2E", ground: "#A9C59A", paving: "#E2E0DA", trees: T(4, 2, 1, 0, 0, 2), roofKind: "hip", dark: "#7D8790", roofs: ["#4F5D6B", "#3E4652", "#7D8790"], hills: true, haze: 0.18 },
  southeast_asia: { walls: ["#F2D3B3", "#B7DCCF", "#F4E3A1", "#F4C7B8"], roof: "#C9764F", trim: "#FBF8F1", door: "#3E8C93", ground: "#8FC08A", paving: "#EADFCB", trees: T(2, 0, 0, 5), roofKind: "hip", dark: "#8F9AA0", roofs: ["#C9764F", "#B5654A", "#8F9AA0"], hills: false, haze: 0.4 },
  south_asia: { walls: ["#F0D9A8", "#E7A983", "#F4EBDD"], roof: "#B5654A", trim: "#FBF8F1", door: "#3E8C93", ground: "#B4C17E", paving: "#EADBB9", trees: T(3, 0, 0, 3, 0), roofKind: "flat", dark: "#8A7058", hills: false, haze: 0.35 },
  latam: { walls: ["#F1B97A", "#9ED3C6", "#EE8E7A", "#F4EBDD"], roof: "#C9764F", trim: "#FBF8F1", door: "#2F4F6F", ground: "#A8C487", paving: "#EBDCC2", trees: T(2, 0, 0, 3, 1), roofKind: "flat", dark: "#7A6050", hills: true, haze: 0.2 },
  middle_east: { walls: ["#E7D3B0", "#F4EBDD", "#DCC39A"], roof: "#C9A77A", trim: "#FBF8F1", door: "#3E8C93", ground: "#D8C9A0", paving: "#EBDDC1", trees: T(0, 0, 0, 4, 2), roofKind: "flat", dark: "#9A8268", hills: false, haze: 0.3 },
  africa: { walls: ["#E8C49A", "#C9764F", "#F4EBDD"], roof: "#8E5B3E", trim: "#FBF8F1", door: "#2F4F6F", ground: "#C3B37A", paving: "#E0C9A3", trees: T(3, 0, 0, 2, 1), roofKind: "flat", dark: "#7A5A44", hills: true, haze: 0.25 },
  oceania: { walls: ["#F4EBDD", "#9ED3C6", "#E9D8BC"], roof: "#6E7A86", trim: "#FFFFFF", door: "#D9825B", ground: "#A9C59A", paving: "#E9E2D4", trees: T(2, 0, 3, 2), roofKind: "hip", dark: "#5E6670", roofs: ["#6E7A86", "#C9764F"], hills: false, haze: 0.12 },
};

/** Flavours with real seasons (autumn colour, snowy winters). */
export const TEMPERATE: Record<Flavor, boolean> = {
  us_south: true, us_northeast: true, us_west: false, us_midwest: true, europe_south: true, europe_north: true, east_asia: true,
  southeast_asia: false, south_asia: false, latam: false, middle_east: false, africa: false, oceania: true,
};

export function snowCoverFor(spec: { season: Season; weather: Weather; flavor: Flavor }) {
  if (spec.weather === "snow") return 1;
  if (spec.season === "winter" && TEMPERATE[spec.flavor] && spec.weather !== "rain") return 0.8;
  return 0;
}

/** Foliage colours for the material named "Green"/"DarkGreen" in Quaternius trees. */
const FOLIAGE: Record<Season, [string, string]> = {
  spring: ["#9CCB7E", "#79AE68"],
  summer: ["#78AE62", "#5C9150"],
  autumn: ["#C9A65A", "#9E8A4E"],
  winter: ["#5F8A6E", "#4A7560"],
};
const GRASS: Record<Season, string> = { spring: "#A6D489", summer: "#8CC06C", autumn: "#C2B26A", winter: "#DDE6EC" };

interface SkySet {
  top: string;
  horizon: string;
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  elev: number;
  az: number;
  glow: number;
}
const SKY: Record<TimeOfDay, SkySet> = {
  dawn: { top: "#8DB8E0", horizon: "#F8D2B6", sun: "#FFC9A0", sunI: 1.9, hemiSky: "#C9D9EE", hemiGround: "#E8C6B0", hemiI: 1.05, elev: 16, az: -70, glow: 0.35 },
  day: { top: "#6FB3E6", horizon: "#F2EEDF", sun: "#FFF4E2", sunI: 2.8, hemiSky: "#D3E8F6", hemiGround: "#D8CDB4", hemiI: 1.15, elev: 52, az: -35, glow: 0 },
  golden: { top: "#79A8D4", horizon: "#F8CDA2", sun: "#FFC48A", sunI: 2.4, hemiSky: "#B9CDE3", hemiGround: "#E3B98F", hemiI: 0.95, elev: 13, az: 65, glow: 0.75 },
  night: { top: "#16263B", horizon: "#2F4C66", sun: "#9DB8E0", sunI: 0.55, hemiSky: "#3A5272", hemiGround: "#1E2A38", hemiI: 0.7, elev: 48, az: 20, glow: 1 },
};
const SEASON_SUN: Record<Season, { elev: number; warm: number; tint: string }> = {
  spring: { elev: 0, warm: 0, tint: "#FFFFFF" },
  summer: { elev: 8, warm: 0.05, tint: "#FFF8EC" },
  autumn: { elev: -8, warm: 0.12, tint: "#FFE7C8" },
  winter: { elev: -14, warm: -0.1, tint: "#E8F0FF" },
};

interface Grade {
  saturation: number;
  exposure: number;
  contrast: number;
  shadow: string;
  highlight: string;
  split: number;
  vignette: number;
  bloom: number;
}
const MOOD: Record<Mood, Grade> = {
  bright: { saturation: 0.12, exposure: 0.05, contrast: 0.04, shadow: "#2E6C7A", highlight: "#FFE2B8", split: 0.16, vignette: 0.18, bloom: 0.35 },
  calm: { saturation: 0, exposure: 0, contrast: 0, shadow: "#2E5F7A", highlight: "#FFF1DE", split: 0.12, vignette: 0.22, bloom: 0.25 },
  tense: { saturation: -0.15, exposure: -0.04, contrast: 0.06, shadow: "#2F6A62", highlight: "#DCE8F0", split: 0.18, vignette: 0.38, bloom: 0.15 },
  heavy: { saturation: -0.3, exposure: -0.1, contrast: -0.02, shadow: "#2B4A78", highlight: "#D7DDE4", split: 0.2, vignette: 0.45, bloom: 0.1 },
  joyful: { saturation: 0.2, exposure: 0.06, contrast: 0.05, shadow: "#7A4E3A", highlight: "#FFD98A", split: 0.16, vignette: 0.15, bloom: 0.55 },
};

/** Everything that blends. Colours are THREE.Color (linear), numbers are plain. */
export interface Look {
  skyTop: Color;
  skyHorizon: Color;
  fog: Color;
  sun: Color;
  sunIntensity: number;
  sunElevation: number; // degrees
  sunAzimuth: number; // degrees
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  fogDensity: number;
  grass: Color;
  foliage: Color;
  foliageDark: Color;
  water: Color;
  windowGlow: number;
  lampGlow: number;
  snow: number;
  wet: number;
  cloudiness: number;
  shadowStrength: number;
  stars: number;
  // grade
  saturation: number;
  exposure: number;
  contrast: number;
  shadowTint: Color;
  highlightTint: Color;
  split: number;
  vignette: number;
  bloom: number;
}

const c = (hex: string) => new Color(hex);

export function lookFor(spec: Pick<SceneSpec, "season" | "timeOfDay" | "weather" | "mood" | "flavor">): Look {
  const sky = SKY[spec.timeOfDay];
  const ss = SEASON_SUN[spec.season];
  const g = MOOD[spec.mood];
  const fl = FLAVOR[spec.flavor];
  const night = spec.timeOfDay === "night";

  const top = c(sky.top);
  const horizon = c(sky.horizon);
  const sun = c(sky.sun).multiply(c(ss.tint));
  let sunI = sky.sunI;
  let hemiI = sky.hemiI;
  let fogDensity = 0.004 + fl.haze * 0.01;
  let cloudiness = 0.15;
  let shadowStrength = 1;
  let wet = 0;
  const temperate = TEMPERATE[spec.flavor];
  let snow = snowCoverFor(spec);

  switch (spec.weather) {
    case "cloudy":
      top.lerp(c(night ? "#26323F" : "#A7B6C2"), 0.55);
      horizon.lerp(c(night ? "#3A4A58" : "#DCE1E4"), 0.5);
      sunI *= 0.55;
      hemiI *= 1.08;
      cloudiness = 0.75;
      shadowStrength = 0.55;
      break;
    case "rain":
      top.lerp(c(night ? "#1E2A35" : "#8D9CA8"), 0.75);
      horizon.lerp(c(night ? "#33424F" : "#C3CCD2"), 0.7);
      sunI *= 0.38;
      hemiI *= 1.05;
      cloudiness = 1;
      shadowStrength = 0.35;
      wet = 1;
      fogDensity += 0.01;
      break;
    case "snow":
      top.lerp(c(night ? "#22303F" : "#B9C7D3"), 0.55);
      horizon.lerp(c(night ? "#3B4C5C" : "#EEF2F5"), 0.6);
      sunI *= 0.6;
      cloudiness = 0.8;
      shadowStrength = 0.55;
      fogDensity += 0.006;
      break;
    case "fog":
      top.lerp(horizon, 0.5);
      horizon.lerp(c(night ? "#3A4A58" : "#E4E7E6"), 0.6);
      sunI *= 0.6;
      cloudiness = 0.4;
      shadowStrength = 0.5;
      fogDensity += 0.03;
      break;
    default:
      break;
  }

  // Tropical "seasons" stay green; temperate winters without snow are bare and straw-coloured.
  const season: Season = temperate ? spec.season : spec.season === "winter" || spec.season === "autumn" ? "summer" : spec.season;
  const fol = FOLIAGE[season];
  const grassSeason = season === "winter" ? "#B8B48E" : GRASS[season];
  return {
    skyTop: top,
    skyHorizon: horizon,
    fog: horizon.clone().lerp(top, 0.25),
    sun,
    sunIntensity: sunI,
    sunElevation: Math.max(8, sky.elev + ss.elev),
    sunAzimuth: sky.az,
    hemiSky: c(sky.hemiSky),
    hemiGround: c(sky.hemiGround).lerp(c(fl.ground), 0.25),
    hemiIntensity: hemiI,
    fogDensity,
    grass: c(grassSeason).lerp(c(fl.ground), 0.3).lerp(c(SWATCH.snow), snow * 0.92),
    foliage: c(fol[0]),
    foliageDark: c(fol[1]),
    water: c(night ? "#2B5F6E" : spec.weather === "rain" ? "#5E9A9E" : SWATCH.sea),
    windowGlow: night ? 1 : spec.timeOfDay === "golden" ? 0.55 : spec.weather === "rain" || spec.weather === "fog" ? 0.3 : spec.timeOfDay === "dawn" ? 0.2 : 0,
    lampGlow: night ? 1 : spec.timeOfDay === "golden" ? 0.4 : spec.weather === "rain" ? 0.25 : 0,
    snow,
    wet,
    cloudiness,
    shadowStrength,
    stars: night && spec.weather === "clear" ? 1 : 0,
    saturation: g.saturation,
    exposure: g.exposure + (night ? 0.06 : 0),
    contrast: g.contrast,
    shadowTint: c(g.shadow),
    highlightTint: c(g.highlight),
    split: g.split,
    vignette: g.vignette,
    bloom: g.bloom + (night ? 0.25 : spec.timeOfDay === "golden" ? 0.1 : 0),
  };
}

const COLOR_KEYS = [
  "skyTop", "skyHorizon", "fog", "sun", "hemiSky", "hemiGround", "grass", "foliage", "foliageDark", "water", "shadowTint", "highlightTint",
] as const;
const NUM_KEYS = [
  "sunIntensity", "sunElevation", "sunAzimuth", "hemiIntensity", "fogDensity", "windowGlow", "lampGlow", "snow", "wet", "cloudiness",
  "shadowStrength", "stars", "saturation", "exposure", "contrast", "split", "vignette", "bloom",
] as const;

export function cloneLook(l: Look): Look {
  const out = { ...l } as Look;
  for (const k of COLOR_KEYS) out[k] = l[k].clone();
  return out;
}

/** out = lerp(a, b, t). `out` may alias `a`. */
export function lerpLook(out: Look, a: Look, b: Look, t: number): Look {
  for (const k of COLOR_KEYS) out[k].copy(a[k]).lerp(b[k], t);
  for (const k of NUM_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

/** Damp `cur` toward `target` (frame-rate independent). Returns true while still moving. */
export function dampLook(cur: Look, target: Look, lambda: number, dt: number): boolean {
  const t = 1 - Math.exp(-lambda * dt);
  let moving = false;
  for (const k of COLOR_KEYS) {
    const a = cur[k];
    const b = target[k];
    if (Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) > 0.002) {
      a.lerp(b, t);
      moving = true;
    } else a.copy(b);
  }
  for (const k of NUM_KEYS) {
    const d = target[k] - cur[k];
    if (Math.abs(d) > 0.001) {
      cur[k] += d * t;
      moving = true;
    } else cur[k] = target[k];
  }
  return moving;
}

/** Skin swatches tone1..tone6 (user-picked; never inferred). */
export const SKIN: Record<string, string> = {
  tone1: "#F6D7C3",
  tone2: "#EBC0A0",
  tone3: "#D7A27D",
  tone4: "#B87C57",
  tone5: "#8C5A3C",
  tone6: "#5E3B28",
};
export const NEUTRAL_SKIN = "#C99878";

export const HAIR: Record<string, string> = {
  black: "#2A2422",
  dark_brown: "#4A3226",
  brown: "#7A5236",
  auburn: "#8E4A2C",
  blonde: "#D9B56A",
  red: "#B5502E",
  gray: "#B9B6B0",
  dyed: "#3E8C93",
};

/** Clothing: the self always wears the hero coral so "you" is findable at a glance. */
export const CLOTHES = {
  self: { shirt: "#EE8E7A", pants: "#2F4F6F" },
  others: [
    { shirt: "#9ED3C6", pants: "#4B5563" },
    { shirt: "#F2C66D", pants: "#5B4636" },
    { shirt: "#A9C59A", pants: "#3E4652" },
    { shirt: "#BFD0D8", pants: "#6B5A48" },
    { shirt: "#E8C27A", pants: "#2E3A4F" },
    { shirt: "#F4C7B8", pants: "#4A4F58" },
  ],
} as const;
