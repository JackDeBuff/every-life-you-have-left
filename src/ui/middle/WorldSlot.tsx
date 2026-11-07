/**
 * <WorldSlot spec> — where the 3D world (src/world/, another agent) plugs in at integration:
 * replace the body with `<World spec={spec} />`. Until then this draws a calm 2D stand-in from the
 * same SceneSpec (sky by time of day, season tint, a skyline by setting, weather), so the layout,
 * captions and the interlude can be judged honestly.
 */
import { useMemo } from "react";
import type { SceneSpec } from "../../../shared/sim";
import { hash, rngFrom } from "../mock/rng";

export interface WorldSlotProps {
  spec: SceneSpec | null;
  /** Hide the caption overlay (the interlude draws its own). */
  bare?: boolean;
}

const SKY: Record<SceneSpec["timeOfDay"], [string, string]> = {
  dawn: ["#F6C9A8", "#BFD3E6"],
  day: ["#9CC7EA", "#E3EEF4"],
  golden: ["#F2B36B", "#F7E2C2"],
  night: ["#0F2238", "#2B4462"],
};
const GROUND: Record<SceneSpec["season"], string> = { spring: "#8DBA7C", summer: "#6FA35F", autumn: "#C98B4D", winter: "#DCE3E6" };
const FAR: Record<SceneSpec["season"], string> = { spring: "#A9C9A0", summer: "#93B98A", autumn: "#D7AA7A", winter: "#C5D0D6" };

export function WorldSlot({ spec, bare = false }: WorldSlotProps) {
  const r = useMemo(() => rngFrom(hash(spec?.placeLabel ?? "x", spec?.setting ?? "")), [spec?.placeLabel, spec?.setting]);
  const skyline = useMemo(() => {
    const out: { x: number; w: number; h: number }[] = [];
    if (!spec) return out;
    const dense = spec.setting === "city_dense" ? 1 : spec.setting === "city_midrise" ? 0.6 : spec.setting === "campus" ? 0.45 : 0.25;
    let x = 0;
    while (x < 1000) {
      const w = 26 + r() * 50;
      const h = spec.setting === "coastal" || spec.setting === "rural" ? 14 + r() * 20 : 20 + r() * 150 * dense;
      out.push({ x, w, h });
      x += w + 4 + r() * 18 * (1 - dense);
    }
    return out;
  }, [spec, r]);

  if (!spec) return <div className="world world-empty" data-world-slot />;
  const [top, bottom] = SKY[spec.timeOfDay];
  const night = spec.timeOfDay === "night";
  const sunX = spec.timeOfDay === "dawn" ? 18 : spec.timeOfDay === "golden" ? 78 : 62;
  const sunY = spec.timeOfDay === "day" ? 22 : spec.timeOfDay === "night" ? 20 : 52;
  return (
    <div className="world" data-world-slot data-mood={spec.mood} data-weather={spec.weather}>
      <svg className="world-svg" viewBox="0 0 1000 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="w-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={top} />
            <stop offset="1" stopColor={bottom} />
          </linearGradient>
        </defs>
        <rect width="1000" height="560" fill="url(#w-sky)" className="w-fade" />
        <circle cx={sunX * 10} cy={sunY * 5.6} r={night ? 22 : 34} fill={night ? "#F2EFE6" : "#FFF4D6"} opacity={spec.weather === "clear" ? 0.95 : 0.55} />
        <path d={`M0 380 C 200 320, 360 360, 520 330 S 860 300, 1000 340 L1000 560 L0 560 Z`} fill={FAR[spec.season]} opacity={night ? 0.45 : 0.8} />
        <g fill={night ? "#1A2C40" : spec.timeOfDay === "golden" ? "#7B6A5E" : "#6E8494"} opacity={0.85}>
          {skyline.map((b, i) => (
            <rect key={i} x={b.x} y={420 - b.h} width={b.w} height={b.h + 10} />
          ))}
        </g>
        {night && (
          <g fill="#F7D98A">
            {skyline.slice(0, 40).map((b, i) => (i % 3 === 0 ? <rect key={i} x={b.x + 8} y={430 - b.h * 0.7} width="4" height="4" /> : null))}
          </g>
        )}
        {spec.setting === "coastal" && <rect x="0" y="430" width="1000" height="130" fill="#5D93B5" opacity={night ? 0.6 : 0.9} />}
        <path d="M0 440 C 240 420, 520 452, 1000 428 L1000 560 L0 560 Z" fill={GROUND[spec.season]} opacity={night ? 0.55 : 1} />
        <g>
          {spec.people.slice(0, 6).map((p, i) => {
            const h = p.ageBand === "baby" ? 10 : p.ageBand === "child" ? 18 : p.ageBand === "teen" ? 24 : 30;
            const x = 440 + i * 26;
            return (
              <g key={i} transform={`translate(${x} ${470 - h})`}>
                <rect width="12" height={h} rx="6" fill={p.role === "self" ? "var(--sun)" : night ? "#C9D3DC" : "#2D3B45"} />
              </g>
            );
          })}
        </g>
      </svg>
      {(spec.weather === "rain" || spec.weather === "snow") && <div className={`w-${spec.weather}`} aria-hidden="true" />}
      {spec.weather === "fog" && <div className="w-fog" aria-hidden="true" />}
      {!bare && (
        <div className="world-cap">
          <span className="label">{spec.placeLabel}</span>
          <span className="world-caption">{spec.caption}</span>
        </div>
      )}
      {import.meta.env.DEV && <span className="world-slot-tag">3D world slot</span>}
    </div>
  );
}
