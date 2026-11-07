/**
 * Asset access: kits from public/world (manifest.json), lazily loaded per need, with materials
 * remapped onto the world palette once per kit. Templates are cloned (geometry + materials shared).
 */
import { useGLTF } from "@react-three/drei";
import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from "three";
import manifestJson from "./manifest.json";
import { INTERIOR_MAP, MATS, NATURE_MAP, solid } from "./materials";
import { FLAVOR, type FlavorStyle } from "./palette";
import type { SceneSpec } from "../../shared/sim";

interface ModelEntry {
  min: number[];
  max: number[];
  url?: string;
  bytes?: number;
  clips?: string[];
}
interface KitEntry {
  url?: string;
  bytes: number;
  animated?: boolean;
  models: Record<string, ModelEntry>;
}
export const MANIFEST = manifestJson as unknown as { totalBytes: number; kits: Record<string, KitEntry> };

export type StaticKit = "nature" | "interior" | "suburban" | "commercial" | "street" | "cars" | "props" | "camp" | "food";
export type PersonModel =
  | "Casual_Male" | "Casual_Female" | "Casual2_Male" | "Casual2_Female" | "Casual3_Male" | "Casual3_Female" | "Casual_Bald"
  | "Suit_Male" | "Suit_Female" | "OldClassy_Male" | "OldClassy_Female" | "Worker_Female" | "Doctor_Female_Young";
export type AnimalModel = "Dog" | "Cat";

export const kitUrl = (kit: StaticKit) => MANIFEST.kits[kit]!.url!;
export const personUrl = (m: PersonModel) => MANIFEST.kits.people!.models[m]!.url!;
export const animalUrl = (m: AnimalModel) => MANIFEST.kits.animals!.models[m]!.url!;
/** The person file that carries the shared clips. */
export const CLIPS_URL = personUrl("Casual_Male");

export function bounds(kit: string, id: string): { min: number[]; max: number[] } {
  const m = MANIFEST.kits[kit]?.models[id];
  return m ?? { min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] };
}
export function modelHeight(kit: string, id: string) {
  const b = bounds(kit, id);
  return b.max[1]! - b.min[1]!;
}
export function modelFootprint(kit: string, id: string) {
  const b = bounds(kit, id);
  return Math.max(b.max[0]! - b.min[0]!, b.max[2]! - b.min[2]!);
}

export const loadKit = (kit: StaticKit) => useGLTF(kitUrl(kit), false, true);
export const preloadKit = (kit: StaticKit) => useGLTF.preload(kitUrl(kit), false, true);
export const preloadUrl = (url: string) => useGLTF.preload(url, false, true);

// ---------------------------------------------------------------------------------------------
// Kenney colour-map recolouring: roofs, walls and window glass follow the flavour palette.
// ---------------------------------------------------------------------------------------------
const recolorCache = new Map<string, MeshStandardMaterial>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

type RecolorMode = "building" | "soft";

const srgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

function recolor(src: Texture, style: FlavorStyle | null, wall: string | null, mode: RecolorMode, snowy = false) {
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const w = img.width;
  const h = img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const em = document.createElement("canvas");
  em.width = w;
  em.height = h;
  const ectx = em.getContext("2d")!;
  const edata = ectx.createImageData(w, h);
  const roof = srgb(snowy ? "#EEF3F6" : style?.roof ?? "#888888");
  const wallC = srgb(wall ?? "#ffffff");
  const trim = srgb(style?.trim ?? "#ffffff");
  const dark = srgb(style?.dark ?? "#4E5560");
  const coral = srgb("#EE8E7A");
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i]! / 255;
    const g = px[i + 1]! / 255;
    const b = px[i + 2]! / 255;
    const [hh, s, l] = rgbToHsl(r, g, b);
    let out: [number, number, number] | null = null;
    let glow = 0;
    if (mode === "building") {
      if (hh >= 95 && hh <= 175 && s > 0.22) {
        const k = Math.min(1.25, l / 0.5); // roofs and awnings
        out = [roof[0] * k, roof[1] * k, roof[2] * k];
      } else if (s < 0.14 && l > 0.8) {
        const k = Math.min(1.08, l / 0.94); // walls keep their gradient
        out = [wallC[0] * k, wallC[1] * k, wallC[2] * k];
      } else if (hh >= 190 && hh <= 245 && s > 0.25 && l > 0.4) {
        out = [0.5 * l + 0.16, 0.62 * l + 0.18, 0.72 * l + 0.2]; // calm glass
        glow = 1;
      } else if (s < 0.2 && l > 0.55) {
        out = [trim[0] * l, trim[1] * l, trim[2] * l];
      } else if (s < 0.3 && l >= 0.15 && l <= 0.55) {
        const k = 0.55 + l * 0.9; // dark facades, frames and flat roofs -> the flavour's deep neutral
        out = [dark[0] * k, dark[1] * k, dark[2] * k];
      } else if (hh >= 255 && hh <= 340 && s > 0.3) {
        const k = Math.min(1.15, l / 0.62); // Kenney purples / pinks -> our coral (no purple in the world)
        out = [coral[0] * k, coral[1] * k, coral[2] * k];
      }
    }
    if (!out) {
      // everything else: -15% saturation and a slight warm lift so Kenney colours sit in our palette
      const grey = (r + g + b) / 3;
      out = [r + (grey - r) * 0.15 + 0.012, g + (grey - g) * 0.15 + 0.006, b + (grey - b) * 0.15 - 0.004];
    }
    px[i] = Math.max(0, Math.min(255, Math.round(out[0] * 255)));
    px[i + 1] = Math.max(0, Math.min(255, Math.round(out[1] * 255)));
    px[i + 2] = Math.max(0, Math.min(255, Math.round(out[2] * 255)));
    const e = glow * 255;
    edata.data[i] = e;
    edata.data[i + 1] = e;
    edata.data[i + 2] = e;
    edata.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  ectx.putImageData(edata, 0, 0);
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.flipY = src.flipY;
  map.needsUpdate = true;
  const emissiveMap = new CanvasTexture(em);
  emissiveMap.colorSpace = SRGBColorSpace;
  emissiveMap.flipY = src.flipY;
  return { map, emissiveMap };
}

/** Materials whose emissive follows window glow (updated by the world each frame). */
export const GLOW_MATERIALS = new Set<MeshStandardMaterial>();

function kenneyMaterial(kit: StaticKit, original: MeshStandardMaterial, flavor: SceneSpec["flavor"], variant: number, snowy: boolean) {
  const building = kit === "suburban" || kit === "commercial";
  const style = building ? FLAVOR[flavor] : null;
  const wall = style ? style.walls[variant % style.walls.length]! : null;
  const key = `${kit}|${building ? flavor : "-"}|${building ? variant % (style?.walls.length ?? 1) : 0}|${building && snowy ? "snow" : ""}`;
  let m = recolorCache.get(key);
  if (m) return m;
  const src = original.map;
  if (!src?.image) return original;
  const { map, emissiveMap } = recolor(src, style, wall, building ? "building" : "soft", building && snowy);
  m = new MeshStandardMaterial({ map, roughness: 0.85, metalness: 0 });
  if (building) {
    m.emissiveMap = emissiveMap;
    m.emissive = new Color("#FFC56B");
    m.emissiveIntensity = 0;
    GLOW_MATERIALS.add(m);
  } else emissiveMap.dispose();
  recolorCache.set(key, m);
  return m;
}

// ---------------------------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------------------------
const templateCache = new Map<string, Object3D>();

function remap(kit: StaticKit, mat: Material, flavor: SceneSpec["flavor"], variant: number, snowy: boolean): Material {
  const name = mat.name;
  if (kit === "nature") {
    const k = NATURE_MAP[name];
    return k ? MATS[k] : mat;
  }
  if (kit === "interior") {
    const hex = INTERIOR_MAP[name];
    if (name === "Glass") return MATS.glass;
    return hex ? solid(hex) : mat;
  }
  if ((mat as MeshStandardMaterial).map) return kenneyMaterial(kit, mat as MeshStandardMaterial, flavor, variant, snowy);
  return mat;
}

/**
 * A prepared, palette-mapped template for one model. Clone it per placement (shares geometry +
 * materials). `scene` is the loaded kit scene (from loadKit()).
 */
export function template(kit: StaticKit, scene: Object3D, id: string, flavor: SceneSpec["flavor"], variant = 0, snowy = false): Object3D {
  const building = kit === "suburban" || kit === "commercial";
  const key = `${kit}|${id}|${building ? flavor : ""}|${building ? variant : 0}|${building && snowy ? 1 : 0}`;
  const hit = templateCache.get(key);
  if (hit) return hit;
  const node = scene.getObjectByName(id);
  const root = new Group();
  root.name = id;
  if (node) {
    const copy = node.clone(true);
    copy.position.set(0, 0, 0);
    copy.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map((m) => remap(kit, m, flavor, variant, snowy))
        : remap(kit, mesh.material, flavor, variant, snowy);
    });
    root.add(copy);
  }
  templateCache.set(key, root);
  return root;
}
