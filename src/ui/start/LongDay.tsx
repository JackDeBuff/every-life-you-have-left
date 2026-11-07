/**
 * The start screen's living illustration: a life as one long day. The sun crosses the sky from
 * your age to the end age; at each fork three threads peel away below the horizon and keep going.
 */
import { useEffect, useMemo, useRef } from "react";
import { gsap, reducedMotion, sunAt } from "../motion";

const W = 800;
const H = 440;
const HY = 286; // horizon
const X0 = 36;
const X1 = 764;
const FORKS = [0.06, 0.21, 0.42, 0.66, 0.84];

function arc(p: number) {
  const x = X0 + (X1 - X0) * p;
  const y = HY - 856 * p * (1 - p);
  return { x, y };
}

function threads(fx: number, i: number) {
  // three threads leave the fork and fall away beneath the horizon, like reflections
  const spread = [38, 74, 118];
  return spread.map((s, k) => {
    const len = 120 + ((i * 37 + k * 53) % 90);
    const ex = Math.min(X1 + 20, fx + len + k * 24);
    const ey = HY + s * (0.55 + (i % 3) * 0.12);
    return `M${fx} ${HY} C ${fx + 26} ${HY + 2}, ${fx + len * 0.35} ${ey}, ${ex} ${ey}`;
  });
}

export function LongDay({ startAge, endAge }: { startAge: number; endAge: number }) {
  const root = useRef<SVGSVGElement>(null);
  const sun = useRef<SVGCircleElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const lived = useRef<SVGLineElement>(null);
  const forkRefs = useRef<(SVGGElement | null)[]>([]);
  const paths = useMemo(() => FORKS.map((f, i) => threads(X0 + (X1 - X0) * f, i)), []);
  const span = endAge - startAge;

  useEffect(() => {
    const state = { p: 0 };
    const render = () => {
      const { x, y } = arc(state.p);
      const c = sunAt(state.p);
      sun.current?.setAttribute("cx", String(x));
      sun.current?.setAttribute("cy", String(y));
      sun.current?.setAttribute("fill", c);
      halo.current?.setAttribute("cx", String(x));
      halo.current?.setAttribute("cy", String(y));
      halo.current?.setAttribute("fill", c);
      lived.current?.setAttribute("x2", String(x));
      FORKS.forEach((f, i) => {
        const g = forkRefs.current[i];
        if (!g) return;
        const on = state.p >= f;
        if (g.dataset.on !== String(on)) {
          g.dataset.on = String(on);
          const ps = g.querySelectorAll<SVGPathElement>("path");
          if (on) {
            ps.forEach((p, k) => {
              const L = p.getTotalLength();
              gsap.fromTo(p, { strokeDasharray: `${L} ${L}`, strokeDashoffset: L, opacity: 0.9 }, { strokeDashoffset: 0, opacity: 0.55, duration: 1.6, delay: k * 0.12, ease: "expo.out" });
            });
            gsap.fromTo(g.querySelector(".ld-diamond"), { scale: 0.4, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.6, ease: "back.out(2)" });
          } else {
            gsap.to(ps, { opacity: 0, duration: 0.6 });
          }
        }
      });
    };
    if (reducedMotion()) {
      state.p = 0.62;
      render();
      FORKS.forEach((f, i) => {
        const g = forkRefs.current[i];
        if (g && f <= 0.62) g.querySelectorAll("path").forEach((p) => p.setAttribute("opacity", "0.55"));
      });
      return;
    }
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
    tl.fromTo(state, { p: 0 }, { p: 1, duration: 16, ease: "none", onUpdate: render });
    tl.to(root.current, { opacity: 0.25, duration: 0.6, ease: "sine.inOut" }, ">-0.2");
    tl.set(state, { p: 0, onComplete: render });
    tl.to(root.current, { opacity: 1, duration: 0.8, ease: "sine.inOut" });
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <svg ref={root} className="longday" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A life from ${startAge} to ${endAge}, drawn as one day. At each fork, three other lives peel away.`}>
      <defs>
        <radialGradient id="ld-halo">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* the sun's path */}
      <path d={`M${X0} ${HY} Q ${W / 2} ${HY - 428} ${X1} ${HY}`} fill="none" stroke="var(--hair-2)" strokeDasharray="2 6" />
      {/* forks + threads */}
      {paths.map((ps, i) => (
        <g key={i} ref={(el) => void (forkRefs.current[i] = el)} data-on="false">
          {ps.map((d, k) => (
            <path key={k} d={d} fill="none" stroke="var(--ink-2)" strokeWidth={1.1} strokeDasharray={k === 0 ? "6 3" : k === 1 ? "2 3" : "10 3 2 3"} opacity="0" />
          ))}
          <rect className="ld-diamond" x={X0 + (X1 - X0) * FORKS[i]! - 5} y={HY - 5} width="10" height="10" transform={`rotate(45 ${X0 + (X1 - X0) * FORKS[i]!} ${HY})`} fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.5" />
        </g>
      ))}
      {/* the horizon: lived (solid) and still to come (dotted) */}
      <line x1={X0} y1={HY} x2={X1} y2={HY} stroke="var(--ink-3)" strokeDasharray="1 5" strokeLinecap="round" />
      <line ref={lived} x1={X0} y1={HY} x2={X0} y2={HY} stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" />
      {/* the sun */}
      <circle ref={halo} r="46" fill="var(--sun)" opacity="0.18" cx={X0} cy={HY} />
      <circle ref={sun} r="13" fill="var(--sun)" cx={X0} cy={HY} />
      {/* ages */}
      <text x={X0} y={HY + 30} className="ld-age">{startAge}</text>
      <text x={X1} y={HY + 30} className="ld-age" textAnchor="end">{endAge}</text>
      {FORKS.slice(1, -1).map((f, i) => (
        <text key={i} x={X0 + (X1 - X0) * f} y={HY - 14} className="ld-tick" textAnchor="middle">
          {Math.round(startAge + f * span)}
        </text>
      ))}
    </svg>
  );
}
