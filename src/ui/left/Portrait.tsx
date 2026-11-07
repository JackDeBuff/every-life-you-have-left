/**
 * Illustrated portrait in an arched window. Placeholder art drawn from the look the user picked
 * (never inferred, D-011) until the backend generates real portraits (state.portraits).
 * The small sun in the arch sinks toward the horizon as the life goes on.
 * Every combination is on /#look-lab (src/ui/left/LookLab.tsx).
 */
import { useEffect, useId, useState, type ReactNode } from "react";
import type { Appearance, Portrait as PortraitT } from "../../../shared/sim";

const SKIN: Record<NonNullable<Appearance["skinTone"]>, string> = {
  tone1: "#F2D6C2", tone2: "#E4B894", tone3: "#C99770", tone4: "#A4704C", tone5: "#7A4D33", tone6: "#4C2F1F",
};
export const HAIR: Record<NonNullable<Appearance["hairColor"]>, string> = {
  black: "#1E1B1A", dark_brown: "#3A2A20", brown: "#6B4731", auburn: "#8A3D24", blonde: "#D6B06A", red: "#B0482B", gray: "#A9A8A3", dyed: "#2F7F8A",
};
export const SKIN_SWATCHES = SKIN;

export type Band = "now" | "35" | "50" | "70";
const BANDS: Band[] = ["now", "35", "50", "70"];
export const bandFor = (age: number): Band => (age >= 66 ? "70" : age >= 48 ? "50" : age >= 34 ? "35" : "now");

interface Props {
  appearance: Appearance | null;
  age: number;
  /** 0..1 through the life; moves the sun in the arch. */
  progress: number;
  portraits?: PortraitT[];
  size?: number;
  label?: string;
}

export function Portrait({ appearance, age, progress, portraits = [], size = 104, label }: Props) {
  const band = bandFor(age);
  // The generated band for this age, else the closest younger one (aged versions arrive lazily).
  const real = BANDS.slice(0, BANDS.indexOf(band) + 1).reverse().map((b) => portraits.find((p) => p.band === b)).find(Boolean) ?? null;
  // Keep the previous band mounted for a crossfade.
  const [shown, setShown] = useState<{ band: Band; prev: Band | null }>({ band, prev: null });
  useEffect(() => {
    if (band !== shown.band) {
      setShown({ band, prev: shown.band });
      const id = window.setTimeout(() => setShown((s) => ({ ...s, prev: null })), 900);
      return () => clearTimeout(id);
    }
  }, [band, shown.band]);

  const h = Math.round(size * 1.28);
  return (
    <div className="portrait" style={{ width: size, height: h }} role="img" aria-label={label ?? `Illustrated portrait at ${age}`}>
      <svg className="portrait-sky" viewBox="0 0 120 154" preserveAspectRatio="none" aria-hidden="true">
        {/* The sun sits at the window's edge and sinks toward the shoulder line as the life goes on. */}
        <circle cx={103 - progress * 2} cy={24 + progress * 74} r="8" fill="var(--sun)" opacity={0.95} />
      </svg>
      {real ? (
        <img key={real.url} className="portrait-layer in real" src={real.url} alt="" draggable={false} />
      ) : (
        <>
          {shown.prev && <Figure key={`p-${shown.prev}`} appearance={appearance} band={shown.prev} className="portrait-layer out" />}
          <Figure key={`b-${shown.band}`} appearance={appearance} band={shown.band} className="portrait-layer in" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Placeholder figure: a flat editorial illustration built in layers, back to front:
// back hair, shirt, neck, ears, face, features, the hair's cast shadow, beard, front hair, glasses.
// viewBox 120 x 154, face centred on x = 60 (forehead top y 36, chin y 90).
// ---------------------------------------------------------------------------------------------
type HairStyle = NonNullable<Appearance["hairStyle"]>;
type Rgb = [number, number, number];
const rgbOf = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Mix two hex colours: t = 0 gives a, 1 gives b. */
function mix(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
const greyed = (hex: string, k: number) => mix(hex, "#a9a8a3", k);

interface Ink {
  hair: string;
  dark: string;
  light: string;
  brow: string;
  skin: string;
  shade: string;
  deep: string;
  lip: string;
  blush: string;
}

const FACE =
  "M60 36 C72.6 36 81 45.6 81 59 C81 72 75.4 83.6 66.4 88.4 C62.4 90.4 57.6 90.4 53.6 88.4 C44.6 83.6 39 72 39 59 C39 45.6 47.4 36 60 36 Z";

/** Circles as one path (the cast shadow of curly hair). */
const circlesPath = (cs: number[][]) =>
  cs.map(([x, y, r]) => `M${x! - r!} ${y} a${r} ${r} 0 1 0 ${2 * r!} 0 a${r} ${r} 0 1 0 ${-2 * r!} 0`).join(" ");

/** A cloud-edged ellipse: an afro's soft, bumpy outline. */
function scallop(cx: number, cy: number, rx: number, ry: number, n: number, bump: number): string {
  const pt = (a: number, k: number) => `${(cx + Math.cos(a) * rx * k).toFixed(2)} ${(cy + Math.sin(a) * ry * k).toFixed(2)}`;
  let d = `M${pt(0, 1)}`;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    d += ` Q${pt((a0 + a1) / 2, 1 + bump)} ${pt(a1, 1)}`;
  }
  return `${d} Z`;
}

/** Deterministic texture marks inside a region (no Math.random, so renders are stable). */
function marks(test: (x: number, y: number) => boolean, x0: number, x1: number, y0: number, y1: number, step: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  let i = 0;
  for (let y = y0, row = 0; y <= y1; y += step * 0.86, row++) {
    for (let x = x0 + (row % 2 ? step / 2 : 0); x <= x1; x += step) {
      const jx = Math.sin(i * 12.9898) * 0.9;
      const jy = Math.cos(i * 78.233) * 0.9;
      if (test(x + jx, y + jy)) out.push([x + jx, y + jy, i]);
      i++;
    }
  }
  return out;
}

// coily: an afro with a scalloped edge and a fine coil texture
const AFRO = scallop(60, 50.5, 32.5, 30, 30, 0.085);
const inAfro = (x: number, y: number) => ((x - 60) / 30.5) ** 2 + ((y - 50.5) / 28) ** 2 < 1;
const inFaceOval = (x: number, y: number) => ((x - 60) / 22.5) ** 2 + ((y - 66) / 27) ** 2 < 1;
const COIL_MARKS = marks((x, y) => inAfro(x, y) && (!inFaceOval(x, y) || y < 46), 29, 91, 22, 80, 4.6);
type P = [number, number];
const bez = (a: P, b: P, c: P, d: P, t: number): P => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i]! + 3 * u * u * t * b[i]! + 3 * u * t * t * c[i]! + t * t * t * d[i]!) as P;
};
/** Small coils sitting on the hairline (the cap's lower edge), so the edge reads soft and springy. */
const COILY_LINE: P[] = [
  [[81.2, 62], [79.6, 55.6], [77, 50.8], [72.6, 48.2]],
  [[72.6, 48.2], [67.4, 45.4], [52.6, 45.4], [47.4, 48.2]],
  [[47.4, 48.2], [43, 50.8], [40.4, 55.6], [38.8, 62]],
].flatMap(([a, b, c, d], s) => [0, 0.25, 0.5, 0.75, ...(s === 2 ? [1] : [])].map((t) => bez(a as P, b as P, c as P, d as P, t)));
const COILY_CAP =
  "M38.8 62 C37.6 46 46.4 35 60 35 C73.6 35 82.4 46 81.2 62 C79.6 55.6 77 50.8 72.6 48.2 C67.4 45.4 52.6 45.4 47.4 48.2 C43 50.8 40.4 55.6 38.8 62 Z";

// shaved: a buzz cut that hugs the skull, with stubble
const BUZZ =
  "M39.2 61 C38.4 45.6 47.6 35.4 60 35.4 C72.4 35.4 81.6 45.6 80.8 61 C79.6 54.4 77 49.6 73 47.4 C67.4 44.6 52.6 44.6 47 47.4 C43 49.6 40.4 54.4 39.2 61 Z";
const BUZZ_EDGE = "M39.2 61 C40.4 54.4 43 49.6 47 47.4 C52.6 44.6 67.4 44.6 73 47.4 C77 49.6 79.6 54.4 80.8 61";
const STUBBLE = marks((x, y) => ((x - 60) / 20.6) ** 2 + ((y - 59) / 23) ** 2 < 1 && y < 45.2 + 0.0345 * (x - 60) ** 2 - 0.8, 39, 81, 36, 61, 2.3);

// curly: loose ringlets, a darker mass behind and a ring of curls in front
const CURL_BACK = [[34, 58, 9], [33, 72, 9], [34.6, 86, 8.4], [38.4, 97, 7], [86, 58, 9], [87, 72, 9], [85.4, 86, 8.4], [81.6, 97, 7], [46, 30.4, 9.6], [60, 26.6, 10], [74, 30.4, 9.6], [37, 41, 9], [83, 41, 9]];
const CURL_FRONT = [
  [41, 58.5, 6.2], [40.4, 48, 7], [45.4, 39.4, 7.6], [53.4, 33.8, 8], [62.6, 32.6, 8.2], [71.6, 35.4, 7.8], [78.4, 42.6, 7.2], [80.6, 52.6, 6.8], [79.6, 62, 6.2],
  [48.6, 45.6, 5.6], [57, 42.8, 5.8], [65.6, 43.2, 5.8], [73, 47.2, 5.4],
  [38.6, 68.6, 5.6], [38.4, 78.6, 5.6], [40.4, 88, 5.2], [81.4, 71.6, 5.6], [81.6, 81.6, 5.6], [79.6, 90.6, 5.2],
];

const SHORT =
  "M38.6 61.5 C37.4 50.5 39.4 40.8 46.4 35.2 C52.4 30.6 60.6 29.6 67.6 31.2 C76 33.2 81.6 40.4 81.8 50 C81.9 54.2 81.6 58.2 81.1 61.5 L79.4 61.5 C79 56.8 77.8 52.4 75.4 49.4 C73.4 47 70.2 45.8 66.6 45.6 C60 45.4 52.4 48.2 46.4 51.6 C44 53 42.2 56.6 40.8 61.5 Z";
const MEDIUM =
  "M36.6 94.6 C34.4 82 33.8 68 35 56 C36.8 40.4 47 31 60 31 C73 31 83.2 40.4 85 56 C86.2 68 85.6 82 83.4 94.6 C80.6 97.6 75.6 97.8 72.6 95.4 C76.2 86.6 77.4 75.4 77.4 65 C77.4 58.6 76.6 53.6 74.4 50 C68.8 50.4 61.6 48.2 57.2 43.8 C54.2 48.6 49.6 52.6 45.6 55.4 C43.6 61 42.6 69.6 42.8 78 C43 86.2 44.6 91.6 47.4 95.4 C44.4 97.8 39.4 97.6 36.6 94.6 Z";
const MEDIUM_BACK = "M37.5 66 C36 78 36 88 37.5 95 C41 98.5 47 98.5 51 96 L69 96 C73 98.5 79 98.5 82.5 95 C84 88 84 78 82.5 66 Z";
const LONG =
  "M60 31.4 C46.4 31.2 36.2 40.4 35.2 56 C34.4 72 33.2 92 30.4 111 C29.2 120 30 128 33 133.6 C37 136.4 42 135.6 45 131.6 C46 120.6 45.6 108.6 44.6 98.4 C43.6 88.2 43 76.6 43.4 66.4 C43.8 57.2 48 49.4 55 45.6 C57.4 44.2 59.2 42.4 60 40.4 C60.8 42.4 62.6 44.2 65 45.6 C72 49.4 76.2 57.2 76.6 66.4 C77 76.6 76.4 88.2 75.4 98.4 C74.4 108.6 74 120.6 75 131.6 C78 135.6 83 136.4 87 133.6 C90 128 90.8 120 89.6 111 C86.8 92 85.6 72 84.8 56 C83.8 40.4 73.6 31.2 60 31.4 Z";
const LONG_BACK = "M35 60 C33.5 38 86.5 38 85 60 L89.6 128 C78 132.6 42 132.6 30.4 128 Z";
const BUN_CAP =
  "M38.6 61.6 C37 45.2 46.4 33.4 60 33.4 C73.6 33.4 83 45.2 81.4 61.6 C80 54.8 77.4 49.6 73.4 47.4 C69.4 45.4 64.4 45 60 47 C55.6 45 50.6 45.4 46.6 47.4 C42.6 49.6 40 54.8 38.6 61.6 Z";

const stroke = (color: string, width: number, opacity = 1) =>
  ({ fill: "none", stroke: color, strokeWidth: width, strokeOpacity: opacity, strokeLinecap: "round", strokeLinejoin: "round" }) as const;

const coil = (x: number, y: number, i: number) => `M${x.toFixed(2)} ${y.toFixed(2)} a1.3 1.3 0 0 ${i % 2} 2.2 0`;

/** Hair for one style: what sits behind the body, what sits over the face, and the shape that shades the forehead. */
function hairLayers(style: HairStyle, k: Ink): { back: ReactNode; front: ReactNode; cast: string | null } {
  switch (style) {
    case "short":
      return {
        back: null,
        cast: SHORT,
        front: (
          <g>
            <path d={SHORT} fill={k.hair} />
            <path d="M47.6 49.6 C54.4 44.6 62.4 41.8 70.4 41.8" {...stroke(k.dark, 0.9, 0.55)} />
            <path d="M51.6 40.4 C57.6 36.8 65.6 35.8 72.8 37.6" {...stroke(k.dark, 0.9, 0.45)} />
            <path d="M57.6 33.6 C63.6 32.4 70 33.4 74.8 36.6" {...stroke(k.light, 1.6, 0.6)} />
          </g>
        ),
      };
    case "medium":
      return {
        back: <path d={MEDIUM_BACK} fill={k.dark} />,
        cast: MEDIUM,
        front: (
          <g>
            <path d={MEDIUM} fill={k.hair} />
            <path d="M39.6 60 C38.8 72 39.2 84 41.4 93" {...stroke(k.dark, 0.9, 0.5)} />
            <path d="M80.4 60 C81.2 72 80.8 84 78.6 93" {...stroke(k.dark, 0.9, 0.5)} />
            <path d="M57.2 43.8 C61.4 39.4 67.4 36.6 73.6 36.8" {...stroke(k.dark, 0.9, 0.45)} />
            <path d="M43.6 40.8 C48.6 35.8 54.6 33.8 60.6 33.8" {...stroke(k.light, 1.6, 0.6)} />
          </g>
        ),
      };
    case "long":
      return {
        back: <path d={LONG_BACK} fill={k.dark} />,
        cast: LONG,
        front: (
          <g>
            <path d={LONG} fill={k.hair} />
            <path d="M40 60 C39 80 37.6 100 35.2 122" {...stroke(k.dark, 0.9, 0.5)} />
            <path d="M80 60 C81 80 82.4 100 84.8 122" {...stroke(k.dark, 0.9, 0.5)} />
            <path d="M44 104 C44.2 114 43 124 40.6 132" {...stroke(k.dark, 0.8, 0.4)} />
            <path d="M76 104 C75.8 114 77 124 79.4 132" {...stroke(k.dark, 0.8, 0.4)} />
            <path d="M45.6 38.6 C49.6 35 54.2 33.6 58 33.4" {...stroke(k.light, 1.6, 0.6)} />
            <path d="M74.4 38.6 C70.4 35 65.8 33.6 62 33.4" {...stroke(k.light, 1.6, 0.6)} />
          </g>
        ),
      };
    case "curly":
      return {
        back: (
          <g fill={k.dark}>
            {CURL_BACK.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} />
            ))}
          </g>
        ),
        cast: circlesPath(CURL_FRONT.slice(0, 13)),
        front: (
          <g>
            {CURL_FRONT.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} fill={k.hair} />
            ))}
            {CURL_FRONT.map(([x, y, r], i) => (
              <g key={`c${i}`}>
                <path d={`M${x! - r! * 0.5} ${y! + r! * 0.15} a${r! * 0.5} ${r! * 0.5} 0 1 1 ${r! * 0.62} ${r! * 0.42}`} {...stroke(k.dark, 1, 0.6)} />
                <path d={`M${x! - r! * 0.62} ${y! - r! * 0.18} a${r! * 0.66} ${r! * 0.66} 0 0 1 ${r! * 0.58} ${-r! * 0.5}`} {...stroke(k.light, 1.1, 0.55)} />
              </g>
            ))}
          </g>
        ),
      };
    case "coily":
      return {
        back: (
          <g>
            <path d={AFRO} fill={k.hair} />
            {COIL_MARKS.map(([x, y, i]) => (
              <path key={i} d={coil(x, y, i)} {...stroke(i % 3 ? k.dark : k.light, 0.8, i % 3 ? 0.55 : 0.5)} />
            ))}
          </g>
        ),
        cast: COILY_CAP,
        front: (
          <g>
            <path d={COILY_CAP} fill={k.hair} />
            {COILY_LINE.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={1.6} fill={k.hair} />
            ))}
            {COIL_MARKS.filter(([x, y]) => inFaceOval(x, y) && y < 46).map(([x, y, i]) => (
              <path key={i} d={coil(x, y, i)} {...stroke(k.dark, 0.8, 0.55)} />
            ))}
          </g>
        ),
      };
    case "shaved":
      return {
        back: null,
        cast: null,
        front: (
          <g>
            <path d={BUZZ} fill={mix(k.skin, k.dark, 0.6)} />
            {STUBBLE.map(([x, y, i]) => (
              <circle key={i} cx={x} cy={y} r={0.45} fill={i % 3 ? k.dark : k.light} fillOpacity={i % 3 ? 0.6 : 0.45} />
            ))}
            <path d={BUZZ_EDGE} {...stroke(k.dark, 0.8, 0.5)} />
            <path d="M48.4 39.6 C53.4 37.4 62.4 36.8 68.6 38.6" {...stroke(k.light, 1.4, 0.4)} />
          </g>
        ),
      };
    case "bun":
      return {
        back: null,
        cast: BUN_CAP,
        front: (
          <g>
            <circle cx="60" cy="26.6" r="9.4" fill={k.hair} />
            <path d="M54.6 27.6 C54.4 22.6 59.4 20.4 63 22.4 C66.2 24.4 65.6 29.4 61.6 30 C58.8 30.4 57.6 27.4 59.6 26" {...stroke(k.dark, 1, 0.6)} />
            <path d="M53.6 23.4 C55 20.2 58.2 18.4 61.4 18.6" {...stroke(k.light, 1.3, 0.6)} />
            <path d={BUN_CAP} fill={k.hair} />
            <path d="M44.2 50.4 C46 42.4 51.6 37.2 58 35.6" {...stroke(k.dark, 0.8, 0.5)} />
            <path d="M75.8 50.4 C74 42.4 68.4 37.2 62 35.6" {...stroke(k.dark, 0.8, 0.5)} />
            <path d="M50.8 46.4 C52.6 41.6 55.6 38.4 59 36.8" {...stroke(k.dark, 0.8, 0.4)} />
            <path d="M69.2 46.4 C67.4 41.6 64.4 38.4 61 36.8" {...stroke(k.dark, 0.8, 0.4)} />
            <ellipse cx="60" cy="34.6" rx="5.4" ry="1.8" fill={k.dark} />
            <path d="M41.4 55.6 C40.4 59.6 40.8 63.6 42.2 66.8" {...stroke(k.hair, 0.9, 0.9)} />
          </g>
        ),
      };
  }
}

function Figure({ appearance: a, band, className }: { appearance: Appearance | null; band: Band; className: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const skin = SKIN[a?.skinTone ?? "tone3"];
  const grey = band === "70" ? 0.82 : band === "50" ? 0.36 : band === "35" ? 0.08 : 0;
  const hair = greyed(HAIR[a?.hairColor ?? "dark_brown"], grey);
  const k: Ink = {
    hair,
    dark: mix(hair, "#000000", 0.34),
    light: mix(hair, "#ffffff", 0.26),
    brow: mix(hair, "#1f140d", 0.4),
    skin,
    shade: mix(skin, "#2a1208", 0.16),
    deep: mix(skin, "#2a1208", 0.34),
    lip: mix(skin, "#8f3133", 0.36),
    blush: mix(skin, "#e25c4f", 0.5),
  };
  const style: HairStyle = a?.hairStyle ?? "short";
  const s = band === "70" ? 3 : band === "50" ? 1.5 : 0; // the shoulders settle a little with age
  const gender = a?.gender ?? null;
  const w = gender === "woman" ? 0.9 : gender === "man" ? 1.05 : 0.97; // shoulder width
  const h = hairLayers(style, k);
  return (
    <svg className={className} viewBox="0 0 120 154" aria-hidden="true">
      <defs>
        <clipPath id={`${uid}f`}>
          <path d={FACE} />
        </clipPath>
      </defs>
      {h.back}

      {/* shirt, shaded on the far side. Shoulders and neckline follow the gender they gave: a scoop
          neck (woman), a collar (man), a crew neck (non-binary or not set). */}
      <path d={`M${60 - 52 * w} 160 C${60 - 50.4 * w} ${128 + s} ${60 - 32 * w} ${111 + s} 60 ${110 + s} C${60 + 32 * w} ${111 + s} ${60 + 50.4 * w} ${128 + s} ${60 + 52 * w} 160 Z`} fill="var(--portrait-shirt)" />
      <path d={`M${60 + 26 * w} ${113.6 + s} C${60 + 40 * w} ${119.6 + s} ${60 + 50 * w} ${132 + s} ${60 + 52 * w} 160 L${60 + 37 * w} 160 C${60 + 36.6 * w} ${140 + s} ${60 + 32.6 * w} ${124 + s} ${60 + 26 * w} ${113.6 + s} Z`} fill="#000" opacity="0.14" />
      <path d={`M${60 - 42.4 * w} ${129 + s} C${60 - 34.4 * w} ${119.6 + s} ${60 - 24.4 * w} ${114.4 + s} ${60 - 14.4 * w} ${112.6 + s}`} {...stroke("#fff", 1.6, 0.12)} />

      {/* neck */}
      <path d={`M51.6 80 L51.6 ${104 + s} C55 ${110 + s} 65 ${110 + s} 68.4 ${104 + s} L68.4 80 Z`} fill={k.skin} />
      <path d="M51.6 84 C55 91.6 65 91.6 68.4 84 L68.4 94 C64 97 56 97 51.6 94 Z" fill={k.shade} />
      {gender === "woman" ? (
        <>
          <path d={`M45.6 ${109 + s} C48.6 ${125 + s} 71.4 ${125 + s} 74.4 ${109 + s} Z`} fill={k.skin} />
          <path d={`M45.6 ${109 + s} C48.6 ${125 + s} 71.4 ${125 + s} 74.4 ${109 + s}`} {...stroke("var(--portrait-shirt-line)", 1.8)} />
        </>
      ) : gender === "man" ? (
        <>
          <path d={`M51 ${107.4 + s} L58.6 ${118 + s} L47.4 ${116.4 + s} Z M69 ${107.4 + s} L61.4 ${118 + s} L72.6 ${116.4 + s} Z`} fill="var(--portrait-shirt)" />
          <path d={`M51 ${107.4 + s} L58.6 ${118 + s} L47.4 ${116.4 + s} Z M69 ${107.4 + s} L61.4 ${118 + s} L72.6 ${116.4 + s} Z`} {...stroke("var(--portrait-shirt-line)", 1.4)} />
          <path d={`M60 ${118 + s} L60 160`} {...stroke("var(--portrait-shirt-line)", 1, 0.8)} />
        </>
      ) : (
        <path d={`M48.8 ${109.6 + s} C52.8 ${115.6 + s} 67.2 ${115.6 + s} 71.2 ${109.6 + s}`} {...stroke("var(--portrait-shirt-line)", 2.2)} />
      )}

      {/* ears */}
      <ellipse cx="39.4" cy="63" rx="4" ry="6.2" fill={k.skin} />
      <ellipse cx="80.6" cy="63" rx="4" ry="6.2" fill={k.skin} />
      <path d="M38.4 60.4 C36.8 61.8 37 65.4 38.8 66.4" {...stroke(k.deep, 0.9, 0.6)} />
      <path d="M81.6 60.4 C83.2 61.8 83 65.4 81.2 66.4" {...stroke(k.deep, 0.9, 0.6)} />

      {/* face, with a soft shadow on the side away from the sun */}
      <path d={FACE} fill={k.skin} />
      <path d="M48 42 C41 48 38.4 58 39.4 68 C40.4 78 45.4 85.4 53.6 88.4 C47.4 82 44 74 43.6 64 C43.2 55 45 48 48 42 Z" fill={k.shade} opacity="0.6" />

      {/* features */}
      <ellipse cx="47.6" cy="69.6" rx="3.8" ry="2.2" fill={k.blush} opacity="0.3" />
      <ellipse cx="72.4" cy="69.6" rx="3.8" ry="2.2" fill={k.blush} opacity="0.3" />
      <path d="M46.6 54.2 C49 52.6 52.6 52.2 55.4 53.2" {...stroke(k.brow, 1.7)} />
      <path d="M64.6 53.2 C67.4 52.2 71 52.6 73.4 54.2" {...stroke(k.brow, 1.7)} />
      <ellipse cx="51" cy="60" rx="1.75" ry="2.15" fill="#241b17" />
      <ellipse cx="69" cy="60" rx="1.75" ry="2.15" fill="#241b17" />
      <circle cx="51.6" cy="59.3" r="0.55" fill="#fff" opacity="0.85" />
      <circle cx="69.6" cy="59.3" r="0.55" fill="#fff" opacity="0.85" />
      <path d="M60.6 62.6 C60.2 66 59 68.6 57.8 69.8 C58.8 71 61.2 71 62.4 70.2" {...stroke(k.deep, 1.2, 0.8)} />
      {!a?.facialHair && <path d="M55.4 76.2 C57.8 78.6 62.2 78.6 64.6 76.2" {...stroke(k.lip, 1.6)} />}

      {/* the years: forehead lines at 50; smile lines and crow's feet at 70 */}
      {(band === "50" || band === "70") && (
        <g {...stroke("#000", 0.8, band === "70" ? 0.2 : 0.12)}>
          <path d="M51.4 49.8 C55.4 48.8 64.6 48.8 68.6 49.8" />
          {band === "70" && (
            <path d="M44.4 60 L42.4 59.2 M44.4 62 L42.4 62.6 M75.6 60 L77.6 59.2 M75.6 62 L77.6 62.6 M54.2 71.6 C52.8 73.6 52.8 75.6 53.8 77.4 M65.8 71.6 C67.2 73.6 67.2 75.6 66.2 77.4" />
          )}
        </g>
      )}

      {/* the hair's shadow on the forehead */}
      {h.cast && (
        <g clipPath={`url(#${uid}f)`}>
          <path d={h.cast} transform="translate(0.6 2)" fill="#000" opacity="0.13" />
        </g>
      )}

      {/* facial hair: a trimmed beard and moustache, the mouth showing through */}
      {a?.facialHair && (
        <g>
          <path
            d="M40.2 60 C39.6 70 41.6 80.4 48.4 86.6 C52.4 90.2 56 91.6 60 91.6 C64 91.6 67.6 90.2 71.6 86.6 C78.4 80.4 80.4 70 79.8 60 L77.6 60 C77.2 66.6 74.8 71.6 69.6 72.6 C66.4 73.2 63.4 71.8 60 72.6 C56.6 71.8 53.6 73.2 50.4 72.6 C45.2 71.6 42.8 66.6 42.4 60 Z"
            fill={k.hair}
          />
          <path d="M45 77 C47 83 51.6 87.6 57 89 M75 77 C73 83 68.4 87.6 63 89" {...stroke(k.dark, 0.9, 0.5)} />
          <path d="M53.2 73.6 C55.6 72.8 58 73.2 60 74 C62 73.2 64.4 72.8 66.8 73.6" {...stroke(k.light, 0.9, 0.45)} />
          <path d="M55.6 76 C58 75 62 75 64.4 76 C62.8 79.2 57.2 79.2 55.6 76 Z" fill={k.lip} />
        </g>
      )}

      {h.front}

      {a?.glasses && (
        <g>
          <g fill="#fff" fillOpacity="0.16" stroke="var(--portrait-glasses)" strokeWidth="1.7">
            <rect x="43.4" y="55.4" width="14.4" height="10" rx="3.6" />
            <rect x="62.2" y="55.4" width="14.4" height="10" rx="3.6" />
          </g>
          <path d="M57.8 59.4 C59 58 61 58 62.2 59.4 M43.4 58.6 L39.6 57.6 M76.6 58.6 L80.4 57.6" {...stroke("var(--portrait-glasses)", 1.7)} />
          <path d="M46.2 63.6 L49.8 57.8 M65 63.6 L68.6 57.8" {...stroke("#fff", 0.9, 0.45)} />
        </g>
      )}
    </svg>
  );
}
