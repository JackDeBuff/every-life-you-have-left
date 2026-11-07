/**
 * Illustrated portrait in an arched window. Placeholder art drawn from the look the user picked
 * (never inferred, D-011) until the backend generates real portraits (state.portraits).
 * The small sun in the arch sinks toward the horizon as the life goes on.
 */
import { useEffect, useState } from "react";
import type { Appearance, Portrait as PortraitT } from "../../../shared/sim";

const SKIN: Record<NonNullable<Appearance["skinTone"]>, string> = {
  tone1: "#F2D6C2", tone2: "#E4B894", tone3: "#C99770", tone4: "#A4704C", tone5: "#7A4D33", tone6: "#4C2F1F",
};
export const HAIR: Record<NonNullable<Appearance["hairColor"]>, string> = {
  black: "#1E1B1A", dark_brown: "#3A2A20", brown: "#6B4731", auburn: "#8A3D24", blonde: "#D6B06A", red: "#B0482B", gray: "#A9A8A3", dyed: "#2F7F8A",
};
export const SKIN_SWATCHES = SKIN;

const GREY = [169, 168, 163];
function greyed(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v + (GREY[i]! - v) * k));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

export type Band = "now" | "35" | "50" | "70";
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
  const real = portraits.find((p) => p.band === band) ?? null;
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
        <img className="portrait-layer" src={real.url} alt="" />
      ) : (
        <>
          {shown.prev && <Figure key={`p-${shown.prev}`} appearance={appearance} band={shown.prev} className="portrait-layer out" />}
          <Figure key={`b-${shown.band}`} appearance={appearance} band={shown.band} className="portrait-layer in" />
        </>
      )}
    </div>
  );
}

function Figure({ appearance: a, band, className }: { appearance: Appearance | null; band: Band; className: string }) {
  const skin = SKIN[a?.skinTone ?? "tone3"];
  const grey = band === "70" ? 0.82 : band === "50" ? 0.36 : band === "35" ? 0.08 : 0;
  const hair = greyed(HAIR[a?.hairColor ?? "dark_brown"], grey);
  const style = a?.hairStyle ?? "short";
  const slump = band === "70" ? 3 : band === "50" ? 1.5 : 0;
  return (
    <svg className={className} viewBox="0 0 120 154" aria-hidden="true">
      {/* hair behind the head */}
      {style === "long" && <path d={`M33 66 C30 34 90 34 87 66 L90 ${118 + slump} C80 112 40 112 30 ${118 + slump} Z`} fill={hair} />}
      {style === "coily" && <ellipse cx="60" cy="56" rx="34" ry="31" fill={hair} />}
      {style === "medium" && <path d="M35 66 C32 36 88 36 85 66 L86 90 C80 84 40 84 34 90 Z" fill={hair} />}
      {/* shoulders */}
      <path d={`M10 160 C12 ${124 + slump} 34 ${108 + slump} 60 ${108 + slump} C86 ${108 + slump} 108 ${124 + slump} 110 160 Z`} fill="var(--portrait-shirt)" />
      <path d={`M48 ${108 + slump} C52 ${116 + slump} 68 ${116 + slump} 72 ${108 + slump}`} fill="none" stroke="var(--portrait-shirt-line)" strokeWidth="1.4" />
      {/* neck */}
      <path d={`M52 86 L52 ${106 + slump} C56 ${112 + slump} 64 ${112 + slump} 68 ${106 + slump} L68 86 Z`} fill={skin} />
      <path d={`M52 96 C56 100 64 100 68 96 L68 92 L52 92 Z`} fill="#000" opacity="0.12" />
      {/* head */}
      <ellipse cx="38.5" cy="68" rx="4" ry="6" fill={skin} />
      <ellipse cx="81.5" cy="68" rx="4" ry="6" fill={skin} />
      <ellipse cx="60" cy="64" rx="22" ry="27" fill={skin} />
      <path d="M44 80 C50 90 70 90 76 80 C72 88 48 88 44 80 Z" fill="#000" opacity="0.07" />
      {band !== "now" && band !== "35" && (
        <g stroke="#000" strokeOpacity={band === "70" ? 0.22 : 0.12} strokeWidth="0.9" fill="none" strokeLinecap="round">
          <path d="M48 54 C52 52.5 56 52.5 58 54" />
          <path d="M62 54 C64 52.5 68 52.5 72 54" />
          {band === "70" && <path d="M47 75 C49 77 51 77.5 52 77.4 M73 75 C71 77 69 77.5 68 77.4" />}
        </g>
      )}
      {/* facial hair */}
      {a?.facialHair && <path d="M41 70 C42 94 78 94 79 70 C76 84 68 88 60 88 C52 88 44 84 41 70 Z" fill={hair} opacity="0.92" />}
      {/* hair on top */}
      {style === "short" && <path d="M37 62 C35 34 85 34 83 62 C80 50 72 45 60 45 C48 45 40 50 37 62 Z" fill={hair} />}
      {style === "medium" && <path d="M37 64 C34 34 86 34 83 64 C78 50 70 44 58 46 C48 47 41 54 37 64 Z" fill={hair} />}
      {style === "long" && <path d="M37 66 C33 33 87 33 83 66 C79 50 68 44 56 46 C47 48 40 55 37 66 Z" fill={hair} />}
      {style === "bun" && (
        <>
          <circle cx="60" cy="30" r="10" fill={hair} />
          <path d="M37 62 C35 36 85 36 83 62 C79 50 71 46 60 46 C49 46 41 50 37 62 Z" fill={hair} />
        </>
      )}
      {style === "curly" && (
        <g fill={hair}>
          {[[40, 52, 9], [48, 42, 9.5], [60, 38, 10], [72, 42, 9.5], [80, 52, 9], [38, 62, 6], [82, 62, 6]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
        </g>
      )}
      {style === "coily" && <path d="M38 60 C38 44 82 44 82 60 C76 52 44 52 38 60 Z" fill={hair} />}
      {style === "shaved" && <path d="M38.5 60 C37 38 83 38 81.5 60 C78 50 70 46 60 46 C50 46 42 50 38.5 60 Z" fill={hair} opacity="0.5" />}
      {/* glasses */}
      {a?.glasses && (
        <g fill="none" stroke="var(--portrait-glasses)" strokeWidth="1.6">
          <rect x="43" y="60" width="14" height="10" rx="3.5" />
          <rect x="63" y="60" width="14" height="10" rx="3.5" />
          <path d="M57 64 C59 62.5 61 62.5 63 64" />
          <path d="M43 63 L39 62 M77 63 L81 62" />
        </g>
      )}
    </svg>
  );
}
