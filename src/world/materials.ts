/**
 * Shared palette materials. One instance per palette slot for the whole world (cheap draw state,
 * one place to blend season / time / weather). `updateMaterials(look)` runs every frame while a
 * look is blending.
 */
import { Color, MeshStandardMaterial, type Material } from "three";
import type { Look } from "./palette";
import { SWATCH } from "./palette";

const std = (color: string, opts: Partial<{ rough: number; emissive: string; flat: boolean }> = {}) =>
  new MeshStandardMaterial({
    color,
    roughness: opts.rough ?? 0.92,
    metalness: 0,
    emissive: opts.emissive ? new Color(opts.emissive) : new Color(0),
    flatShading: opts.flat ?? false,
  });

export const MATS = {
  grass: std("#9DC283"),
  grassDark: std("#7FA86C"),
  soilTop: std("#A7785C"),
  soilMid: std("#8C6450"),
  soilDeep: std("#6E5044"),
  rockBase: std("#8E8A86", { flat: true }),
  path: std(SWATCH.cream),
  road: std("#5E6672", { rough: 0.85 }),
  roadLine: std("#F4EBDD"),
  sidewalk: std("#E2DDD3"),
  sand: std(SWATCH.sand),
  water: new MeshStandardMaterial({ color: SWATCH.sea, roughness: 0.25, metalness: 0, transparent: true, opacity: 0.92 }),
  snow: std(SWATCH.snow, { rough: 0.8 }),
  foliage: std("#78AE62"),
  foliageDark: std("#5C9150"),
  bark: std("#7A5644"),
  birch: std("#EDE8DE"),
  autumnA: std("#E39B4B"),
  autumnB: std("#D8B04A"),
  rock: std("#A4A7AD", { flat: true }),
  blossom: std("#F4B6C2"),
  berry: std("#D9564B"),
  wheat: std("#E5C36F"),
  flowerCyan: std("#7FC8D6"),
  coconut: std("#8A6248"),
  // architecture
  trim: std("#FFFFFF"),
  glass: new MeshStandardMaterial({ color: "#9CC3D8", roughness: 0.3, metalness: 0, emissive: new Color(SWATCH.glow), emissiveIntensity: 0 }),
  lamp: new MeshStandardMaterial({ color: "#FFF2D6", roughness: 0.5, emissive: new Color(SWATCH.glow), emissiveIntensity: 0 }),
  wood: std("#B98A62"),
  woodDark: std("#7A5644"),
  floor: std("#D9B48C"),
  wallIn: std("#F4EBDD"),
  metal: std("#6C7480", { rough: 0.6 }),
  ink: std(SWATCH.ink),
  white: std("#FBF8F1"),
  cloud: new MeshStandardMaterial({ color: "#FFFFFF", roughness: 1, metalness: 0, emissive: new Color("#FFFFFF"), emissiveIntensity: 0.25 }),
};

export type MatKey = keyof typeof MATS;

const cache = new Map<string, MeshStandardMaterial>();
/** A shared material for an arbitrary palette colour (walls, roofs, cloth). */
export function solid(hex: string, rough = 0.9): MeshStandardMaterial {
  const k = `${hex}|${rough}`;
  let m = cache.get(k);
  if (!m) {
    m = std(hex, { rough });
    cache.set(k, m);
  }
  return m;
}

const tmp = new Color();
const SNOW = new Color(SWATCH.snow);
export function updateMaterials(look: Look) {
  MATS.grass.color.copy(look.grass);
  MATS.grassDark.color.copy(look.grass).multiplyScalar(0.82);
  MATS.foliage.color.copy(look.foliage);
  MATS.foliageDark.color.copy(look.foliageDark);
  MATS.water.color.copy(look.water);
  MATS.glass.emissiveIntensity = look.windowGlow * 1.6;
  MATS.glass.color.set("#9CC3D8").lerp(tmp.set("#3B4F63"), Math.min(1, look.windowGlow));
  MATS.lamp.emissiveIntensity = look.lampGlow * 2.4;
  // Wet ground darkens and gets a little sheen; snow whitens paths and roads a touch.
  const wet = look.wet;
  MATS.road.roughness = 0.85 - wet * 0.5;
  MATS.road.color.set("#5E6672").multiplyScalar(1 - wet * 0.18);
  MATS.path.color.set(SWATCH.cream).lerp(SNOW, look.snow * 0.5).multiplyScalar(1 - wet * 0.12);
  MATS.sidewalk.color.set("#E2DDD3").lerp(SNOW, look.snow * 0.6).multiplyScalar(1 - wet * 0.12);
  MATS.cloud.color.copy(look.skyHorizon).lerp(tmp.set("#FFFFFF"), 0.8);
  MATS.cloud.emissive.copy(look.skyHorizon).lerp(tmp.set("#FFFFFF"), 0.6);
  MATS.cloud.emissiveIntensity = 0.3 + (1 - Math.min(1, look.windowGlow)) * 0.25;
}

/** Quaternius nature material names -> palette slots. */
export const NATURE_MAP: Record<string, MatKey> = {
  Wood: "bark",
  Green: "foliage",
  DarkGreen: "foliageDark",
  Orange: "autumnA",
  LightOrange: "autumnB",
  Snow: "snow",
  White: "birch",
  Black: "ink",
  Coconuts: "coconut",
  Pink: "blossom",
  Berry: "berry",
  Rock: "rock",
  Cyan: "flowerCyan",
  Yellow: "wheat",
  Leaves: "autumnB",
  LightWood: "wood",
  Mushroom_Top: "berry",
  Mushroom_Bottom: "white",
};

/** Quaternius interior names -> palette colours (warm, calm, never neon). */
export const INTERIOR_MAP: Record<string, string> = {
  White: "#F3EEE6",
  Red: "#D9825B",
  Wood: "#C49A6C",
  Grey: "#A9ADB3",
  DarkRed: "#A8553F",
  LightOrange: "#E8C27A",
  Wood_Dark: "#8A6248",
  Cushin: "#E9DCC8",
  Couch_Blue: "#5E9AA0",
  Black: "#3A4250",
  Couch_Mustard: "#D9A94E",
  Couch_BeigeDark: "#B9A58C",
  Couch_Beige: "#D9C9B0",
  Wood_Light: "#D8B48A",
  Marble: "#ECE6DA",
  Plant_Green: "#7FAE62",
  DarkGreen: "#5C9150",
  Kitchen: "#9ED3C6",
  KitchenTop: "#F3EEE6",
  LightMetal: "#B8BEC6",
  DarkMetal: "#6C7480",
  Glass: "#CFE3EA",
  Metal: "#8C8A86",
};

export function disposeMaterial(m: Material | Material[]) {
  if (Array.isArray(m)) m.forEach((x) => x.dispose());
  else m.dispose();
}
