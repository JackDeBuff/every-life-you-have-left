/**
 * Timeline bar (SPEC §1, §2, §4): age axis from now to endAge, a linear sun playhead, big forks ◆
 * with the threads of the lives you didn't choose, small choices as dots, speed keys and pause.
 * The part not lived yet sits on a sunken band. Click a ◆ for "the road not taken" (RoadNotTaken).
 */
import { PrivacyBits } from "../privacy/mine";
import { MusicToggle } from "../MusicToggle";
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { Branch, Decision, SpeedMode } from "../../../shared/sim";
import { clock } from "../clock";
import { ROMAN } from "../format";
import { Icon } from "../icons";
import { gsap, reducedMotion } from "../motion";
import { sim, useSim } from "../session";
import { RoadNotTaken, RunningLife } from "./RoadNotTaken";
import "./timeline.css";

const PAD = 18;
const H = 64;
const LINE_Y = 40;

export function TimelineBar() {
  const startYear = useSim((s) => s.profile?.startYear ?? 2026);
  const startAge = useSim((s) => s.profile?.age ?? 25);
  const endAge = useSim((s) => s.endAge);
  const name = useSim((s) => s.profile?.firstName ?? "");
  const decisions = useSim((s) => s.decisions);
  const answers = useSim((s) => s.answers);
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
  const ahead = useRef<SVGRectElement>(null);
  const aheadLabel = useRef<SVGTextElement>(null);
  const sunG = useRef<SVGGElement>(null);
  const ageText = useRef<SVGTextElement>(null);
  useEffect(() => {
    const reduce = reducedMotion();
    const right = w - PAD + 6;
    return clock.subscribe((yf, scale) => {
      const y = reduce ? Math.floor(yf) : yf;
      const px = PAD + ((y - startYear) / span) * (w - PAD * 2);
      lived.current?.setAttribute("x2", px.toFixed(1));
      if (ahead.current) {
        const ax = Math.min(right, px + 16);
        ahead.current.setAttribute("x", ax.toFixed(1));
        ahead.current.setAttribute("width", Math.max(0, right - ax).toFixed(1));
      }
      // "not lived yet" only while there's room for it beside the sun
      aheadLabel.current?.setAttribute("opacity", right - px > 110 ? "1" : "0");
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
      const end = y === startYear || y === endYear;
      // A round age within 2 years of either end keeps its long tick but not its label ("18 20" collided).
      const crowded = !end && (y - startYear < 3 || endYear - y < 3);
      out.push({ year: y, age, major: end || (age % 5 === 0 && !crowded) });
    }
    return out;
  }, [startYear, endYear, startAge]);

  const bigs = decisions.filter((d) => d.kind === "big");
  const smalls = decisions.filter((d) => d.kind === "small" && d.status !== "pending");
  const smallTitle = (d: Decision) => {
    const a = answers.find((x) => x.decisionId === d.id);
    const o = a?.optionId ? d.options.find((x) => x.id === a.optionId) : null;
    const said = d.status === "slid" ? "It slid by." : o ? `You: ${o.label}` : a?.text ? `You: "${a.text.slice(0, 80)}"` : "";
    return `Small choice at ${d.age}: ${d.prompt.replace(/^It's \d{4}\.\s*/, "")} ${said}`.trim();
  };

  return (
    <header className="tl" data-region="timeline">
      <div className="tl-id">
        <span className="wordmark">Every Life You Have Left</span>
        <span className="tl-who small faint">
          {name ? `${name} · ${startYear}–${endYear}` : ""}
          <Legend />
          <PrivacyBits />
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
          {/* Not lived yet: a sunken band from just past the sun to 70. */}
          <rect ref={ahead} x={PAD + 16} y={LINE_Y - 16} width={Math.max(0, w - PAD * 2 - 10)} height={34} rx="3" className="tl-ahead-band" />
          <text ref={aheadLabel} x={w - PAD} y={LINE_Y - 7} textAnchor="end" className="tl-ahead-label">
            not lived yet
          </text>
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
            <g key={d.id} className="tl-small" data-slid={d.status === "slid"}>
              <title>{smallTitle(d)}</title>
              <circle cx={x(d.year)} cy={LINE_Y - 9} r="6" fill="transparent" />
              <circle cx={x(d.year)} cy={LINE_Y - 9} r="2.4" className="tl-small-dot" />
            </g>
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
          <RoadNotTaken key={d.id} d={d} left={x(d.year)} onClosed={focusOpenCard} />
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
        <rect x={x - 6} y={LINE_Y - 6} width="12" height="12" transform={`rotate(45 ${x} ${LINE_Y})`} className="tl-fork" data-fork-marker={d.id} />
      )}
    </g>
  );
}

/**
 * After a peek closes, an open decision card gets the focus back: Enter then decides instead of
 * re-opening the peek from its ◆ (QA, Sat Nov 7). Returns false when there's no card to focus.
 */
function focusOpenCard(): boolean {
  const ae = document.activeElement as HTMLElement | null;
  // Only take it from the timeline (or nowhere): never from whatever they moved on to.
  if (ae && ae !== document.body && !ae.closest(".tl, .pop")) return false;
  const card = document.querySelector<HTMLElement>(".pane.right .dcard");
  if (!card) return false;
  card.focus({ preventScroll: true });
  return true;
}

function LivesLeft() {
  const active = useSim(useShallow((s) => s.branches.filter((b) => b.status === "active")));
  const ref = useRef<HTMLSpanElement>(null);
  const n = active.length;
  useEffect(() => {
    // Opacity and scale only: a digit sliding inside a clipped box got cut off (owner's playtest).
    if (!ref.current || reducedMotion() || n === 0) return;
    gsap.fromTo(ref.current, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, delay: 1.6, ease: "expo.out" });
  }, [n]);
  const lives = n === 1 ? "life" : "lives";
  const tip = n ? `${n} ${lives} you didn't choose, still running beside yours. Click to see ${n === 1 ? "it" : "them"} today.` : "Each big fork leaves the answers you didn't pick running as other lives.";
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="lives-left" disabled={!n} data-tip={tip} aria-label={n ? `${n} other ${lives} still running. Show ${n === 1 ? "it" : "them"}.` : "No other lives yet"}>
          <svg width="22" height="16" viewBox="0 0 26 18" aria-hidden="true" className="lives-glyph">
            <path d="M1 9 H25" stroke="var(--ink)" strokeWidth="1.8" />
            <path d="M6 9 C10 9 12 3 25 3" stroke="var(--ink-3)" strokeDasharray="3 1.5" fill="none" opacity={n > 0 ? 1 : 0.25} />
            <path d="M6 9 C10 9 12 15 25 15" stroke="var(--ink-3)" strokeDasharray="1 1.5" fill="none" opacity={n > 1 ? 1 : 0.25} />
            <path d="M9 9 C13 9 15 6 25 6" stroke="var(--ink-3)" strokeDasharray="4 1.5 1 1.5" fill="none" opacity={n > 2 ? 1 : 0.25} />
          </svg>
          <span ref={ref} className="lives-n data">
            {n}
          </span>
          <span className="lives-label">
            {n ? `other ${lives}` : "no other"}
            <br />
            {n ? "still running" : "lives yet"}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="pop rn"
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby="lives-h"
          onCloseAutoFocus={(e) => {
            // Radix returns focus to the trigger; with a card open, the card gets it (Enter decides).
            if (document.querySelector(".pane.right .dcard")) {
              e.preventDefault();
              focusOpenCard();
            }
          }}
        >
          <p className="label" id="lives-h">
            Your other lives, today
          </p>
          <p className="rn-hint">
            <Icon name="info" size={14} /> Each big fork leaves the answers you didn't pick running as lives you didn't live. Up to three run at once.
          </p>
          <ul className="rn-list">
            {active.map((b, i) => (
              <RunningLife key={b.id} b={b} numeral={ROMAN[i]!} />
            ))}
          </ul>
          <Popover.Close className="pop-x" aria-label="Close">
            <Icon name="x" size={14} />
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** How to read the bar: shapes, lines and the sun. */
function Legend() {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="tl-legend-btn" aria-label="How to read the timeline">
          <Icon name="info" size={13} />
          <span>Key</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="pop tl-legend" side="bottom" align="start" sideOffset={8} collisionPadding={12} aria-labelledby="tl-legend-h">
          <p className="label" id="tl-legend-h">
            How to read the timeline
          </p>
          <ul>
            <li>
              <svg width="22" height="16" aria-hidden="true">
                <circle cx="11" cy="8" r="5" fill="var(--sun)" />
              </svg>
              <span>You, now.</span>
            </li>
            <li>
              <svg width="22" height="16" aria-hidden="true">
                <rect x="6.5" y="3.5" width="9" height="9" transform="rotate(45 11 8)" className="tl-fork" />
              </svg>
              <span>
                <b>Big fork.</b> Click it: what you chose, and who you'd be today with the other answers.
              </span>
            </li>
            <li>
              <svg width="22" height="16" aria-hidden="true">
                <circle cx="11" cy="8" r="2.6" className="tl-small-dot" />
              </svg>
              <span>
                <b>Small choice.</b> Hover it for the question and your answer.
              </span>
            </li>
            <li>
              <svg width="22" height="16" aria-hidden="true">
                <path d="M2 12 C 8 12, 10 4, 21 4" fill="none" stroke="var(--ink-2)" strokeDasharray="3 2" />
              </svg>
              <span>A life you didn't choose, still running beside yours.</span>
            </li>
            <li>
              <svg width="22" height="16" aria-hidden="true">
                <line x1="1" x2="21" y1="8" y2="8" stroke="var(--ink)" strokeWidth="2" />
              </svg>
              <span>Years you've lived.</span>
            </li>
            <li>
              <svg width="22" height="16" aria-hidden="true">
                <rect x="0" y="2" width="22" height="12" rx="2" className="tl-ahead-band" />
                <line x1="2" x2="20" y1="8" y2="8" stroke="var(--ink-3)" strokeDasharray="1 4" strokeLinecap="round" />
              </svg>
              <span>Not lived yet. Nothing there is decided yet.</span>
            </li>
          </ul>
          <Popover.Close className="pop-x" aria-label="Close">
            <Icon name="x" size={14} />
          </Popover.Close>
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
      <MusicToggle />
      <span className="slowed label" data-on={slowed && !paused} aria-live="polite">
        {slowed && !paused ? "Time slowed" : ""}
      </span>
    </div>
  );
}
