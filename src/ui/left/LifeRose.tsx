/**
 * Status (SPEC §6): the life rose. A Nightingale polar-area diagram: 10 wedges grouped into the 4
 * families, wedge AREA proportional to the value (radius ∝ √v), so a full, round rose is a full
 * year and a lopsided one shows where life is thin. Risk is exposure, not wellbeing: hatched.
 * Each year the wedges morph and last year's outline lingers as a ghost so you see which way it moved.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { DOMAINS, FAMILIES, type DomainKey, type FamilyKey } from "../../../shared/domains";
import type { DomainStates } from "../../../shared/schema";
import type { LogLine } from "../../../shared/sim";
import { gsap, reducedMotion } from "../motion";
import { WhyPopover } from "../middle/WhyCard";

const GAP = 8; // degrees between families
const INNER_GAP = 1.4; // degrees between wedges in a family
const ORDER: { key: DomainKey; fam: FamilyKey }[] = FAMILIES.flatMap((f) => f.domains.map((d) => ({ key: d, fam: f.key })));
const WEDGE = (360 - GAP * FAMILIES.length) / ORDER.length;

interface Geo {
  key: DomainKey;
  fam: FamilyKey;
  a0: number;
  a1: number;
}
const GEO: Geo[] = (() => {
  const out: Geo[] = [];
  let a = -90 + GAP / 2;
  for (const f of FAMILIES) {
    for (const d of f.domains) {
      out.push({ key: d, fam: f.key, a0: a + INNER_GAP / 2, a1: a + WEDGE - INNER_GAP / 2 });
      a += WEDGE;
    }
    a += GAP;
  }
  return out;
})();
const FAMILY_MID: Record<FamilyKey, number> = Object.fromEntries(
  FAMILIES.map((f) => {
    const gs = GEO.filter((g) => g.fam === f.key);
    return [f.key, (gs[0]!.a0 + gs[gs.length - 1]!.a1) / 2];
  }),
) as Record<FamilyKey, number>;

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (r: number, a: number) => `${(r * Math.cos(rad(a))).toFixed(2)} ${(r * Math.sin(rad(a))).toFixed(2)}`;
function wedge(r0: number, r: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${pt(r0, a0)} L${pt(r, a0)} A${r} ${r} 0 ${large} 1 ${pt(r, a1)} L${pt(r0, a1)} A${r0} ${r0} 0 ${large} 0 ${pt(r0, a0)} Z`;
}
const radius = (v: number, R: number, r0: number) => r0 + (R - r0) * Math.sqrt(Math.max(0, Math.min(100, v)) / 100);

export const famVar = (f: FamilyKey) => `var(--fam-${f})`;

interface Props {
  states: DomainStates | null;
  log?: LogLine[];
  size?: number;
}

export function LifeRose({ states, log = [], size = 232 }: Props) {
  const R = size / 2 - 16;
  const r0 = R * 0.14;
  const cur = useRef<Record<DomainKey, number> | null>(null);
  const prev = useRef<DomainStates | null>(null);
  const paths = useRef<Partial<Record<DomainKey, SVGPathElement | null>>>({});
  const ghosts = useRef<Partial<Record<DomainKey, SVGPathElement | null>>>({});
  const ghostG = useRef<SVGGElement>(null);
  const [hover, setHover] = useState<DomainKey | null>(null);
  const [delta, setDelta] = useState<Partial<Record<DomainKey, number>>>({});

  useEffect(() => {
    if (!states) return;
    const target = { ...states } as Record<DomainKey, number>;
    const write = () => {
      for (const g of GEO) paths.current[g.key]?.setAttribute("d", wedge(r0, radius(cur.current![g.key], R, r0), g.a0, g.a1));
    };
    if (!cur.current) {
      cur.current = Object.fromEntries(GEO.map((g) => [g.key, 0])) as Record<DomainKey, number>;
    }
    const before = prev.current;
    if (before) {
      const d: Partial<Record<DomainKey, number>> = {};
      for (const g of GEO) d[g.key] = states[g.key] - before[g.key];
      setDelta(d);
      // ghost of last year
      for (const g of GEO) ghosts.current[g.key]?.setAttribute("d", wedge(r0, radius(before[g.key], R, r0), g.a0, g.a1));
      if (ghostG.current && !reducedMotion()) gsap.fromTo(ghostG.current, { opacity: 0.9 }, { opacity: 0, duration: 1.6, ease: "sine.inOut", delay: 0.2 });
    }
    prev.current = states;
    if (reducedMotion()) {
      Object.assign(cur.current, target);
      write();
      return;
    }
    const tw = gsap.to(cur.current, { ...target, duration: before ? 0.75 : 1.2, ease: before ? "power3.inOut" : "expo.out", onUpdate: write, stagger: 0 });
    return () => {
      tw.kill();
    };
  }, [states, R, r0]);

  const rings = useMemo(() => [25, 50, 75, 100].map((v) => radius(v, R, r0)), [R, r0]);

  // Readout: hovered domain, or the biggest move this year.
  const readout = useMemo(() => {
    if (!states) return null;
    let key = hover;
    if (!key) {
      let best = 0;
      for (const g of GEO) {
        const d = Math.abs(delta[g.key] ?? 0);
        if (g.key !== "risk" && d > best) (best = d), (key = g.key);
      }
    }
    if (!key) return null;
    const why = [...log].reverse().find((l) => l.domain === key && (l.why || l.baseRate));
    return { key, value: states[key], d: delta[key] ?? 0, why };
  }, [hover, delta, states, log]);

  return (
    <div className="rose" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} role="img" aria-label={states ? `Life status: ${GEO.map((g) => `${DOMAINS[g.key].label} ${states[g.key]}`).join(", ")}` : "Life status"}>
        <defs>
          <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--fam-direction)" strokeWidth="1.3" />
          </pattern>
        </defs>
        {rings.map((r, i) => (
          <circle key={i} r={r} fill="none" stroke="var(--hair)" strokeDasharray={i === 3 ? undefined : "1 3"} />
        ))}
        {/* family spokes */}
        {FAMILIES.map((f) => {
          const gs = GEO.filter((g) => g.fam === f.key);
          return <line key={f.key} x1={0} y1={0} x2={(R + 4) * Math.cos(rad(gs[0]!.a0 - GAP / 2))} y2={(R + 4) * Math.sin(rad(gs[0]!.a0 - GAP / 2))} stroke="var(--hair)" />;
        })}
        <g ref={ghostG} opacity="0">
          {GEO.map((g) => (
            <path key={g.key} ref={(el) => void (ghosts.current[g.key] = el)} fill="none" stroke="var(--ink)" strokeWidth="1" strokeDasharray="2 2" />
          ))}
        </g>
        {GEO.map((g) => (
          <path
            key={g.key}
            ref={(el) => void (paths.current[g.key] = el)}
            className="rose-w"
            data-dim={hover !== null && hover !== g.key}
            fill={g.key === "risk" ? "url(#hatch)" : famVar(g.fam)}
            stroke={g.key === "risk" ? famVar(g.fam) : "none"}
            strokeWidth={g.key === "risk" ? 1.2 : 0}
            tabIndex={0}
            role="button"
            aria-label={`${DOMAINS[g.key].label}: ${states?.[g.key] ?? 0}`}
            onMouseEnter={() => setHover(g.key)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(g.key)}
            onBlur={() => setHover(null)}
          />
        ))}
        <circle r={r0 - 3} fill="var(--panel)" />
        <circle r="2.5" fill="var(--sun)" />
        {FAMILIES.map((f) => {
          // Labels sit in the corners of their quadrant, editorial-style, never over the petals.
          const a = rad(FAMILY_MID[f.key]);
          const right = Math.cos(a) > 0;
          const down = Math.sin(a) > 0;
          const x = (right ? 1 : -1) * (size / 2 - 1);
          const y = (down ? 1 : -1) * (size / 2 - 4) + (down ? 0 : 8);
          return (
            <text key={f.key} x={x} y={y} textAnchor={right ? "end" : "start"} className="rose-fam" fill={famVar(f.key)}>
              {f.label}
            </text>
          );
        })}
      </svg>
      <div className="rose-readout" aria-live="polite">
        {readout ? (
          <>
            <span className="rr-tick" style={{ background: famVar(DOMAINS[readout.key].family) }} />
            <span className="rr-label">{DOMAINS[readout.key].label}</span>
            <span className="rr-v data">{readout.value}</span>
            {readout.d !== 0 && (
              <span className="rr-d data" data-up={readout.key === "risk" ? undefined : readout.d > 0}>
                {readout.d > 0 ? "+" : "−"}
                {Math.abs(readout.d)}
              </span>
            )}
            <span className="rr-text small">
              {hover ? DOMAINS[readout.key].meaning : readout.why ? readout.why.text.split(".")[0] : DOMAINS[readout.key].meaning}
            </span>
            {readout.why && (
              <WhyPopover line={readout.why}>
                <button className="why-link">why</button>
              </WhyPopover>
            )}
          </>
        ) : (
          <span className="small faint">Hover a petal to read it. Bigger petal, fuller part of life.</span>
        )}
      </div>
    </div>
  );
}

/** Static small multiple of the rose, for peeks and the ending. */
export function MiniRose({ states, size = 48 }: { states: DomainStates; size?: number }) {
  const R = size / 2 - 1;
  const r0 = R * 0.12;
  return (
    <svg className="mini-rose" width={size} height={size} viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} aria-hidden="true">
      <circle r={R} fill="none" stroke="var(--hair)" />
      {GEO.map((g) => (
        <path key={g.key} d={wedge(r0, radius(states[g.key], R, r0), g.a0, g.a1)} fill={g.key === "risk" ? "none" : famVar(g.fam)} stroke={g.key === "risk" ? famVar(g.fam) : "none"} strokeWidth={0.8} />
      ))}
    </svg>
  );
}
