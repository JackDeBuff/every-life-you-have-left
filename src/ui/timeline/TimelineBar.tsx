/**
 * Timeline bar (SPEC §1, §2, §4): age axis from now to endAge, a linear sun playhead, fork ◆ with
 * the threads of the lives you didn't choose, small-decision ticks, speed keys and pause.
 * Hover a ◆ to peek the branches.
 */
import * as HoverCard from "@radix-ui/react-hover-card";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Branch, Decision, SpeedMode } from "../../../shared/sim";
import { clock } from "../clock";
import { moneyHint, moneyShort, ROMAN, useCurrency } from "../format";
import { Icon } from "../icons";
import { Portrait } from "../left/Portrait";
import { MiniRose } from "../left/LifeRose";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";

const PAD = 18;
const H = 64;
const LINE_Y = 40;

export function TimelineBar() {
  const startYear = useSim((s) => s.profile?.startYear ?? 2026);
  const startAge = useSim((s) => s.profile?.age ?? 25);
  const endAge = useSim((s) => s.endAge);
  const name = useSim((s) => s.profile?.firstName ?? "");
  const decisions = useSim((s) => s.decisions);
  const branches = useSim((s) => s.branches);
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  const endYear = startYear + (endAge - startAge);
  const span = Math.max(1, endYear - startYear);
  const x = (year: number) => PAD + ((year - startYear) / span) * (w - PAD * 2);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Playhead: moved every frame by the clock, never by React.
  const lived = useRef<SVGLineElement>(null);
  const sunG = useRef<SVGGElement>(null);
  const ageText = useRef<SVGTextElement>(null);
  useEffect(() => {
    const reduce = reducedMotion();
    return clock.subscribe((yf, scale) => {
      const y = reduce ? Math.floor(yf) : yf;
      const px = PAD + ((y - startYear) / span) * (w - PAD * 2);
      lived.current?.setAttribute("x2", px.toFixed(1));
      sunG.current?.setAttribute("transform", `translate(${px.toFixed(1)} ${LINE_Y})`);
      if (ageText.current) {
        const a = startAge + Math.floor(yf - startYear);
        const t = `${a}`;
        if (ageText.current.textContent !== t) ageText.current.textContent = t;
      }
      sunG.current?.style.setProperty("--pulse", String(0.5 + scale * 0.5));
    });
  }, [w, startYear, span, startAge]);

  const ticks = useMemo(() => {
    const out: { year: number; age: number; major: boolean }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      const age = startAge + (y - startYear);
      out.push({ year: y, age, major: age % 5 === 0 || y === startYear || y === endYear });
    }
    return out;
  }, [startYear, endYear, startAge]);

  const bigs = decisions.filter((d) => d.kind === "big");
  const smalls = decisions.filter((d) => d.kind === "small");

  return (
    <header className="tl" data-region="timeline">
      <div className="tl-id">
        <span className="wordmark">Every Life You Have Left</span>
        <span className="tl-who small faint">
          {name ? `${name} · ${startYear}–${endYear}` : ""}
        </span>
      </div>

      <div className="tl-axis" ref={ref}>
        <svg width={w} height={H} className="tl-svg" aria-label={`Your life from ${startAge} to ${endAge}`}>
          <defs>
            <linearGradient id="thread-fade" x1="0" x2="1">
              <stop offset="0" stopColor="var(--ink-2)" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--ink-2)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t.year} transform={`translate(${x(t.year)} 0)`}>
              <line y1={LINE_Y + 5} y2={LINE_Y + (t.major ? 10 : 7)} stroke="var(--ink-3)" strokeOpacity={t.major ? 0.9 : 0.45} />
              {t.major && (
                <text y={LINE_Y + 22} textAnchor="middle" className="tl-age">
                  {t.age}
                </text>
              )}
            </g>
          ))}
          <line x1={PAD} x2={w - PAD} y1={LINE_Y} y2={LINE_Y} stroke="var(--ink-3)" strokeDasharray="1 4" strokeLinecap="round" />
          {bigs.map((d) => (
            <Threads key={d.id} d={d} x={x(d.year)} branches={branches.filter((b) => b.forkDecisionId === d.id)} />
          ))}
          <line ref={lived} x1={PAD} x2={PAD} y1={LINE_Y} y2={LINE_Y} stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
          {smalls.map((d) => (
            <line key={d.id} x1={x(d.year)} x2={x(d.year)} y1={LINE_Y - 9} y2={LINE_Y - 4} stroke={d.status === "slid" ? "var(--ink-3)" : "var(--ink-2)"} strokeWidth="1.5" strokeDasharray={d.status === "slid" ? "1 1.5" : undefined} className="tl-small" />
          ))}
          <g ref={sunG} className="tl-sun" transform={`translate(${PAD} ${LINE_Y})`}>
            <circle r="15" fill="var(--sun)" className="tl-halo" />
            <circle r="6.5" fill="var(--sun)" stroke="var(--panel)" strokeWidth="2" />
            <text ref={ageText} y={-14} textAnchor="middle" className="tl-now">
              {startAge}
            </text>
          </g>
          {/* An open fork sits on top of the sun: you are standing at it. */}
          {bigs
            .filter((d) => d.status === "pending")
            .map((d) => (
              <rect key={d.id} x={x(d.year) - 6.5} y={LINE_Y - 6.5} width="13" height="13" transform={`rotate(45 ${x(d.year)} ${LINE_Y})`} className="tl-fork" data-pending="true" data-fork-marker={d.id} />
            ))}
        </svg>
        {bigs.map((d) => (
          <ForkPeek key={d.id} d={d} left={x(d.year)} branches={branches.filter((b) => b.forkDecisionId === d.id)} />
        ))}
      </div>

      <div className="tl-controls">
        <LivesLeft />
        <SpeedKeys />
      </div>
    </header>
  );
}

/** Three threads peel away from a fork: up, down, further down. Retired ones end in a dot. */
function Threads({ d, x, branches }: { d: Decision; x: number; branches: Branch[] }) {
  const g = useRef<SVGGElement>(null);
  const drawn = useRef(new Set<string>());
  useEffect(() => {
    if (!g.current) return;
    g.current.querySelectorAll<SVGPathElement>("path[data-id]").forEach((p) => {
      const id = p.dataset.id!;
      if (drawn.current.has(id)) return;
      drawn.current.add(id);
      if (reducedMotion()) return;
      const L = p.getTotalLength();
      gsap.fromTo(p, { strokeDashoffset: L, strokeDasharray: `${L} ${L}` }, { strokeDashoffset: 0, duration: 1.1, delay: 1.0, ease: "expo.out", onComplete: () => p.removeAttribute("stroke-dasharray") });
    });
  }, [branches.length]);
  const shapes = [
    { dy: -14, len: 70, dash: "5 2.5" },
    { dy: 12, len: 86, dash: "1.5 2.5" },
    { dy: -24, len: 54, dash: "8 2.5 1.5 2.5" },
  ];
  return (
    <g ref={g}>
      {branches.map((b, i) => {
        const s = shapes[i % 3]!;
        const retired = b.status === "retired";
        const len = retired ? s.len * 0.45 : s.len;
        const ex = x + len;
        const ey = LINE_Y + s.dy * (retired ? 0.6 : 1);
        return (
          <g key={b.id} opacity={retired ? 0.35 : 1}>
            <path data-id={b.id} d={`M${x} ${LINE_Y} C ${x + 14} ${LINE_Y}, ${x + len * 0.3} ${ey}, ${ex} ${ey}`} fill="none" stroke="url(#thread-fade)" strokeWidth="1.2" strokeDasharray={s.dash} />
            {retired && <circle cx={ex} cy={ey} r="1.6" fill="var(--ink-3)" />}
          </g>
        );
      })}
      {d.status !== "pending" && (
        <rect x={x - 5} y={LINE_Y - 5} width="10" height="10" transform={`rotate(45 ${x} ${LINE_Y})`} className="tl-fork" data-fork-marker={d.id} />
      )}
    </g>
  );
}

function ForkPeek({ d, left, branches }: { d: Decision; left: number; branches: Branch[] }) {
  const active = useSim(useShallow((s) => s.branches.filter((b) => b.status === "active").map((b) => b.id)));
  if (d.status === "pending") return null;
  const chosen = d.options.find((o) => sim().answers.find((a) => a.decisionId === d.id)?.optionId === o.id);
  return (
    <HoverCard.Root openDelay={120} closeDelay={80}>
      <HoverCard.Trigger asChild>
        <button className="tl-fork-hit" style={{ left: left - 11 }} aria-label={`Fork at ${d.age}: peek the lives you didn't choose`} />
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content className="pop peek" side="bottom" align="start" sideOffset={6} collisionPadding={12}>
          <p className="label">
            Fork at {d.age} · {d.year}
          </p>
          <p className="peek-q">{d.prompt.replace(/^It's \d{4}\.\s*/, "")}</p>
          {chosen && (
            <p className="peek-chosen small">
              <span className="peek-you">You</span> {chosen.branchTitle ?? chosen.label}
            </p>
          )}
          <div className="peek-list">
            {branches.map((b) => (
              <BranchRow key={b.id} b={b} numeral={ROMAN[Math.max(0, active.indexOf(b.id))] ?? "·"} />
            ))}
          </div>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

export function BranchRow({ b, numeral }: { b: Branch; numeral: string }) {
  const appearance = useSim((s) => s.appearance);
  const cur = useCurrency();
  const startAge = useSim((s) => s.profile?.age ?? 25);
  const endAge = useSim((s) => s.endAge);
  const y = b.years[b.years.length - 1];
  const people = y?.scene.people.filter((p) => p.role !== "self") ?? [];
  return (
    <div className="branch-row" data-retired={b.status === "retired"}>
      <Portrait appearance={appearance} age={y?.age ?? b.forkAge} progress={((y?.age ?? b.forkAge) - startAge) / (endAge - startAge)} size={40} />
      <div className="branch-main">
        <p className="branch-title">
          <span className="numeral">{b.status === "retired" ? "·" : numeral}</span> {b.title}
        </p>
        {y ? (
          <>
            <p className="small muted">
              {y.age} · {y.place} · <span className="data" title={moneyHint(y.money.netWorth, cur)}>{moneyShort(y.money.netWorth, cur)}</span>
              {people.length ? ` · ${people.length} at home` : ""}
            </p>
            <p className="small">{y.summary}</p>
          </>
        ) : (
          <p className="small faint">Just split off.</p>
        )}
        {b.status === "retired" && <p className="small faint">Retired quietly: too close to another life.</p>}
      </div>
      {y && <MiniRose states={y.states} size={40} />}
    </div>
  );
}

function LivesLeft() {
  const active = useSim(useShallow((s) => s.branches.filter((b) => b.status === "active")));
  const ref = useRef<HTMLSpanElement>(null);
  const n = active.length;
  useEffect(() => {
    if (!ref.current || reducedMotion() || n === 0) return;
    gsap.fromTo(ref.current, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.6, delay: 1.6, ease: "expo.out" });
  }, [n]);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="lives-left" disabled={!n} aria-label={`${n} other lives running. Show them.`}>
          <svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true">
            <path d="M1 9 H25" stroke="var(--ink)" strokeWidth="1.8" />
            <path d="M6 9 C10 9 12 3 25 3" stroke="var(--ink-3)" strokeDasharray="3 1.5" fill="none" opacity={n > 0 ? 1 : 0.25} />
            <path d="M6 9 C10 9 12 15 25 15" stroke="var(--ink-3)" strokeDasharray="1 1.5" fill="none" opacity={n > 1 ? 1 : 0.25} />
            <path d="M9 9 C13 9 15 6 25 6" stroke="var(--ink-3)" strokeDasharray="4 1.5 1 1.5" fill="none" opacity={n > 2 ? 1 : 0.25} />
          </svg>
          <span className="lives-n">
            <span ref={ref} className="data">{n}</span>
          </span>
          <span className="lives-label">{n === 1 ? "life" : "lives"} left</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop peek" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
          <p className="label">The lives you have left</p>
          <p className="small muted" style={{ marginBottom: 10 }}>
            They keep running in the background, roughly, five years at a time.
          </p>
          <div className="peek-list">
            {active.map((b, i) => (
              <BranchRow key={b.id} b={b} numeral={ROMAN[i]!} />
            ))}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const KEYS: { id: SpeedMode; label: string }[] = [
  { id: "1x", label: "1×" },
  { id: "2x", label: "2×" },
  { id: "4x", label: "4×" },
  { id: "auto", label: "Auto" },
];

export function SpeedKeys() {
  const speed = useSim((s) => s.speed);
  const paused = useSim((s) => s.playhead.paused);
  const phase = useSim((s) => s.phase);
  const slowed = useSim((s) => s.decisions.some((d) => d.kind === "small" && d.status === "pending"));
  return (
    <div className="keys" role="group" aria-label="Speed">
      {KEYS.map((k) => (
        <button key={k.id} className="key" data-on={speed === k.id} aria-pressed={speed === k.id} onClick={() => void sim().setSpeed(k.id)}>
          <span className="led" />
          <span className="key-l">{k.label}</span>
        </button>
      ))}
      <button className="key pausekey" data-on={paused} aria-label={paused ? "Resume" : "Pause"} disabled={phase !== "playing"} onClick={() => void sim().pause(!paused)}>
        <span className="led" />
        <Icon name={paused ? "play" : "pause"} size={13} />
      </button>
      <span className="slowed label" data-on={slowed && !paused} aria-live="polite">
        {slowed && !paused ? "Time slowed" : ""}
      </span>
    </div>
  );
}
