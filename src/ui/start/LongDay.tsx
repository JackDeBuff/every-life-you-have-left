/**
 * The start screen's living illustration: a life as one long day. The sun crosses the sky from
 * your age to the end age and the sky takes its colour; at each fork three threads peel away below
 * the horizon, like reflections, and keep going. One of them is named: a life you could still live.
 */
import { useEffect, useMemo, useRef } from "react";
import { gsap, reducedMotion, sunAt } from "../motion";

const W = 800;
const H = 440;
const HY = 272; // horizon
const X0 = 36;
const X1 = 764;
const FORKS = [0.07, 0.24, 0.45, 0.67];
const NAMES = ["Say yes to the move", "Start your own thing", "Have a kid", "Retire by the sea"];

function arc(p: number) {
  const x = X0 + (X1 - X0) * p;
  const y = HY - 820 * p * (1 - p);
  return { x, y };
}

function threads(fx: number, i: number) {
  const drops = [34, 70, 112];
  return drops.map((d, k) => {
    const ex = Math.min(X1, fx + 210 + k * 46 - i * 8);
    const ey = HY + d * (0.62 + (i % 2) * 0.16);
    return { d: `M${fx} ${HY} C ${fx + 30} ${HY + 1}, ${fx + 70 + k * 10} ${ey}, ${ex} ${ey}`, ex, ey };
  });
}

export function LongDay({ startAge, endAge }: { startAge: number; endAge: number }) {
  const root = useRef<SVGSVGElement>(null);
  const sun = useRef<SVGCircleElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const glow = useRef<SVGRadialGradientElement>(null);
  const glowStop = useRef<SVGStopElement>(null);
  const lived = useRef<SVGLineElement>(null);
  const forkRefs = useRef<(SVGGElement | null)[]>([]);
  const paths = useMemo(() => FORKS.map((f, i) => threads(X0 + (X1 - X0) * f, i)), []);
  const span = endAge - startAge;

  useEffect(() => {
    const state = { p: 0 };
    const render = () => {
      const { x, y } = arc(state.p);
      const c = sunAt(state.p);
      for (const el of [sun.current, halo.current]) {
        el?.setAttribute("cx", x.toFixed(1));
        el?.setAttribute("cy", y.toFixed(1));
        el?.setAttribute("fill", c);
      }
      glow.current?.setAttribute("cx", x.toFixed(1));
      glow.current?.setAttribute("cy", y.toFixed(1));
      glowStop.current?.setAttribute("stop-color", c);
      lived.current?.setAttribute("x2", x.toFixed(1));
      FORKS.forEach((f, i) => {
        const g = forkRefs.current[i];
        if (!g) return;
        const on = state.p >= f;
        if (g.dataset.on === String(on)) return;
        g.dataset.on = String(on);
        const ps = g.querySelectorAll<SVGPathElement>("path");
        const label = g.querySelector("text");
        if (on) {
          ps.forEach((p, k) => {
            const L = p.getTotalLength();
            gsap.fromTo(p, { strokeDasharray: `${L} ${L}`, strokeDashoffset: L, opacity: 0.9 }, { strokeDashoffset: 0, opacity: 0.6, duration: 1.8, delay: k * 0.12, ease: "expo.out", onComplete: () => p.removeAttribute("stroke-dasharray") });
          });
          gsap.fromTo(label, { opacity: 0, x: -6 }, { opacity: 1, x: 0, duration: 0.8, delay: 0.9, ease: "expo.out" });
          gsap.fromTo(g.querySelector(".ld-diamond"), { scale: 0.3, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.7, ease: "back.out(2.2)" });
        } else {
          gsap.to([...ps, label], { opacity: 0, duration: 0.6 });
        }
      });
    };
    if (reducedMotion()) {
      state.p = 0.74;
      render();
      return;
    }
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.4 });
    tl.fromTo(state, { p: 0 }, { p: 1, duration: 18, ease: "none", onUpdate: render });
    tl.to(root.current, { opacity: 0.2, duration: 0.7, ease: "sine.inOut" }, ">-0.1");
    tl.set(state, { p: 0, onComplete: render });
    tl.to(root.current, { opacity: 1, duration: 0.9, ease: "sine.inOut" });
    return () => {
      tl.kill();
    };
  }, []);

  return (
    <svg ref={root} className="longday" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`A life from ${startAge} to ${endAge}, drawn as one long day. At each fork, other lives peel away and keep going.`}>
      <defs>
        <radialGradient id="ld-glow" ref={glow} gradientUnits="userSpaceOnUse" cx={X0} cy={HY} r="230">
          <stop ref={glowStop} offset="0" stopColor="var(--sun)" stopOpacity="0.34" />
          <stop offset="1" stopColor="var(--sun)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ld-fade" x1="0" x2="1">
          <stop offset="0" stopColor="var(--ink-2)" stopOpacity="1" />
          <stop offset="0.75" stopColor="var(--ink-2)" stopOpacity="0.7" />
          <stop offset="1" stopColor="var(--ink-2)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* the sky takes the sun's colour */}
      <rect x="-40" y="-160" width={W + 80} height={HY + 160} fill="url(#ld-glow)" />
      {/* the sun's path */}
      <path d={`M${X0} ${HY} Q ${W / 2} ${HY - 410} ${X1} ${HY}`} fill="none" stroke="var(--hair-2)" strokeDasharray="1.5 6" strokeLinecap="round" />
      {/* year ruler */}
      {Array.from({ length: span + 1 }, (_, k) => {
        const x = X0 + ((X1 - X0) * k) / Math.max(1, span);
        const major = (startAge + k) % 5 === 0;
        return <line key={k} x1={x} x2={x} y1={HY + 4} y2={HY + (major ? 10 : 6)} stroke="var(--ink-3)" strokeOpacity={major ? 0.8 : 0.35} />;
      })}
      {/* forks + threads */}
      {paths.map((ps, i) => (
        <g key={i} ref={(el) => void (forkRefs.current[i] = el)} data-on="false">
          {ps.map((t, k) => (
            <path key={k} d={t.d} fill="none" stroke="url(#ld-fade)" strokeWidth={1.2} strokeDasharray={k === 0 ? "6 3" : k === 1 ? "2 3" : "10 3 2 3"} opacity="0" />
          ))}
          <text x={ps[i % 3]!.ex - 4} y={ps[i % 3]!.ey - 6} textAnchor="end" className="ld-name" opacity="0">
            {NAMES[i]}
          </text>
          <rect className="ld-diamond" x={X0 + (X1 - X0) * FORKS[i]! - 5.5} y={HY - 5.5} width="11" height="11" transform={`rotate(45 ${X0 + (X1 - X0) * FORKS[i]!} ${HY})`} fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.6" />
        </g>
      ))}
      {/* the horizon: lived (solid) and still to come (dotted) */}
      <line x1={X0} y1={HY} x2={X1} y2={HY} stroke="var(--ink-3)" strokeDasharray="1 5" strokeLinecap="round" />
      <line ref={lived} x1={X0} y1={HY} x2={X0} y2={HY} stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
      {/* the sun */}
      <circle ref={halo} r="52" fill="var(--sun)" opacity="0.16" cx={X0} cy={HY} />
      <circle ref={sun} r="14" fill="var(--sun)" cx={X0} cy={HY} />
      {/* ages */}
      <text x={X0} y={HY + 28} className="ld-age">
        {startAge}
      </text>
      <text x={X1} y={HY + 28} className="ld-age" textAnchor="end">
        {endAge}
      </text>
      <g className="ld-legend" transform={`translate(${X0} ${H - 10})`}>
        <line x1="0" x2="22" y1="-4" y2="-4" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" />
        <text x="30" y="0" className="ld-key">
          the life you choose
        </text>
        <line x1="170" x2="192" y1="-4" y2="-4" stroke="var(--ink-2)" strokeWidth="1.2" strokeDasharray="5 3" />
        <text x="200" y="0" className="ld-key">
          the lives you have left, still running
        </text>
      </g>
    </svg>
  );
}
