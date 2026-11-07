/**
 * The play screen (SPEC §1): timeline bar over three panes. One focus at a time: a big decision dims
 * everything but the card. Phone (<820px): world on top, tabs, the chat as a bottom sheet.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clock } from "../ui/clock";
import { Bio, LeftPane } from "../ui/left/Bio";
import { LifeRose } from "../ui/left/LifeRose";
import { TellMeMore } from "../ui/left/TellMeMore";
import { Interlude } from "../ui/middle/Interlude";
import { Learned } from "../ui/middle/Learned";
import { LifeLog } from "../ui/middle/LifeLog";
import { CurrentWorld } from "../ui/middle/WorldView";
import { setSun } from "../ui/motion";
import { LiveSettings } from "../ui/right/LiveSettings";
import { RightPane } from "../ui/right/Dialogue";
import { sim, useSim } from "../ui/session";
import { SpeedKeys, TimelineBar } from "../ui/timeline/TimelineBar";
import { useUi } from "../ui/uiStore";

export function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** The sun drifts with the playhead's age (gold → coral). */
export function useSunSync() {
  const age = useSim((s) => s.playhead.age);
  const start = useSim((s) => s.profile?.age ?? 25);
  const end = useSim((s) => s.endAge);
  useEffect(() => setSun((age - start) / Math.max(1, end - start)), [age, start, end]);
}

function useAutopilot() {
  useEffect(() => {
    const on = new URLSearchParams(location.search).get("autopilot");
    if (!on) return;
    const id = window.setInterval(() => {
      const s = sim();
      if (useUi.getState().forking) return;
      const d = s.decisions.find((x) => x.status === "pending");
      if (!d) return;
      const card = document.querySelector<HTMLElement>(".dcard");
      if (!card || card.dataset.auto === d.id) return;
      card.dataset.auto = d.id;
      window.setTimeout(() => {
        const k = String(1 + Math.floor(Math.random() * 4));
        window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
        window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })), 500);
      }, Number(on) > 10 ? Number(on) : 1400);
    }, 300);
    return () => clearInterval(id);
  }, []);
}

export default function Play() {
  const phone = useMedia("(max-width: 819px)");
  const phase = useSim((s) => s.phase);
  const pendingBig = useSim((s) => s.decisions.some((d) => d.kind === "big" && d.status === "pending"));
  const forking = useUi((s) => s.forking);
  useSunSync();
  useAutopilot();

  useEffect(() => {
    clock.reset();
    clock.start();
    return () => clock.stop();
  }, []);

  const dim = pendingBig && !forking;
  const play = useRef<HTMLDivElement>(null);
  const cols = usePaneWidths();

  if (phone) return <PhonePlay dim={dim} />;
  return (
    <div className="play" ref={play} data-dim={dim} data-phase={phase} style={cols.style}>
      <TimelineBar />
      <LeftPane />
      <main className="pane middle" data-region="middle" aria-label="Your life">
        <div className="world-wrap">
          <CurrentWorld />
          <MeanwhileOverlay />
        </div>
        {phase === "warmup" ? <Learned /> : <LifeLog />}
      </main>
      <RightPane />
      <ColumnResizer side="left" cols={cols} play={play} />
      <ColumnResizer side="right" cols={cols} play={play} />
    </div>
  );
}

/*
 * Resizable columns: drag the hairline between the panes (or focus it and use the arrow keys).
 * Widths persist per browser; a double-click (or Enter) puts the default back. The CSS defaults
 * (tokens.css --left-w / --right-w) apply until the user moves a divider. The timeline bar's grid
 * reads the same variables, so it follows.
 */
type Side = "left" | "right";
const WIDTH_KEY: Record<Side, string> = { left: "elyl.pane.left.v1", right: "elyl.pane.right.v1" };
/** The middle column (world + life log) never gets narrower than this. */
const MIDDLE_MIN = 380;

function readWidth(side: Side): number | null {
  try {
    const v = Number(window.localStorage.getItem(WIDTH_KEY[side]));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}
function writeWidth(side: Side, v: number | null) {
  try {
    if (v === null) window.localStorage.removeItem(WIDTH_KEY[side]);
    else window.localStorage.setItem(WIDTH_KEY[side], String(Math.round(v)));
  } catch {
    /* storage blocked: the width just doesn't persist */
  }
}
/** Mirrors tokens.css: 300 / 420, and 280 / 384 at ≤1360 px. */
const defaultWidth = (side: Side, vw: number) => (side === "left" ? (vw > 1360 ? 300 : 280) : vw > 1360 ? 420 : 384);

interface PaneWidths {
  /** The width a column has now (the user's, clamped to this window, or the default). */
  width: (side: Side) => number;
  bounds: (side: Side) => { min: number; max: number };
  commit: (side: Side, v: number | null) => void;
  style: CSSProperties | undefined;
}

function usePaneWidths(): PaneWidths {
  const [vw, setVw] = useState(() => window.innerWidth);
  const [set, setSet] = useState<Record<Side, number | null>>(() => ({ left: readWidth("left"), right: readWidth("right") }));
  useEffect(() => {
    const on = () => setVw(window.innerWidth);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const raw = (side: Side) => set[side] ?? defaultWidth(side, vw);
  const bounds = (side: Side) => {
    const other = raw(side === "left" ? "right" : "left");
    const min = side === "left" ? 240 : 340;
    const max = side === "left" ? Math.min(420, vw - other - MIDDLE_MIN) : Math.min(Math.round(vw * 0.55), vw - other - MIDDLE_MIN);
    return { min, max: Math.max(min, max) };
  };
  const width = (side: Side) => {
    const b = bounds(side);
    return Math.min(b.max, Math.max(b.min, raw(side)));
  };
  const commit = useCallback((side: Side, v: number | null) => {
    writeWidth(side, v);
    setSet((s) => ({ ...s, [side]: v === null ? null : Math.round(v) }));
  }, []);
  const vars: Record<string, string> = {};
  if (set.left !== null) vars["--left-w"] = `${width("left")}px`;
  if (set.right !== null) vars["--right-w"] = `${width("right")}px`;
  return { width, bounds, commit, style: Object.keys(vars).length ? (vars as CSSProperties) : undefined };
}

function ColumnResizer({ side, cols, play }: { side: Side; cols: PaneWidths; play: RefObject<HTMLDivElement | null> }) {
  const drag = useRef<{ id: number; v: number } | null>(null);
  const handle = useRef<HTMLDivElement>(null);
  const now = cols.width(side);
  const { min, max } = cols.bounds(side);
  const prop = side === "left" ? "--left-w" : "--right-w";
  const clampV = (v: number) => Math.min(max, Math.max(min, v));

  /** While dragging, write the width straight to the grid (no React render per frame). */
  const preview = (v: number) => {
    play.current?.style.setProperty(prop, `${Math.round(v)}px`);
    handle.current?.setAttribute("aria-valuenow", String(Math.round(v)));
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, v: now };
    play.current?.setAttribute("data-resizing", side);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    drag.current.v = clampV(side === "left" ? e.clientX : window.innerWidth - e.clientX);
    preview(drag.current.v);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.id !== e.pointerId) return;
    const v = drag.current.v;
    drag.current = null;
    play.current?.removeAttribute("data-resizing");
    if (Math.round(v) !== Math.round(now)) cols.commit(side, v);
  };
  const reset = () => {
    play.current?.style.removeProperty(prop);
    cols.commit(side, null);
  };
  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    // The arrows move the divider the way they point.
    const dir = side === "left" ? 1 : -1;
    let v: number | null = null;
    if (e.key === "ArrowLeft") v = now - step * dir;
    else if (e.key === "ArrowRight") v = now + step * dir;
    else if (e.key === "Home") v = side === "left" ? min : max;
    else if (e.key === "End") v = side === "left" ? max : min;
    else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      reset();
      return;
    }
    if (v === null) return;
    e.preventDefault();
    e.stopPropagation();
    cols.commit(side, clampV(v));
  };

  return (
    <div
      ref={handle}
      className="col-resizer"
      data-side={side}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "right" ? "Resize the conversation pane" : "Resize the bio pane"}
      aria-valuenow={Math.round(now)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onDoubleClick={reset}
      onKeyDown={onKey}
    >
      <span className="col-grip" aria-hidden="true" />
    </div>
  );
}

/**
 * "Meanwhile, in your other lives…" from the end of the fork moment: while the agent writes the
 * branches (phase still "deciding", the card answered) the title holds; the cuts play when they
 * arrive (phase "interlude"). Periodic interludes (1×/2×) just start at "interlude".
 */
function MeanwhileOverlay() {
  const phase = useSim((s) => s.phase);
  const cuts = useSim((s) => s.interlude);
  const pendingBig = useSim((s) => s.decisions.some((d) => d.kind === "big" && d.status === "pending"));
  const lastFork = useSim((s) => s.decisions.findLast((d) => d.kind === "big" && d.status === "answered")?.id ?? "none");
  const forking = useUi((s) => !!s.forking);
  const show = !forking && (phase === "interlude" || (phase === "deciding" && !pendingBig && lastFork !== "none"));
  if (!show) return null;
  return <Interlude key={lastFork} cuts={cuts ?? []} />;
}

function PhonePlay({ dim }: { dim: boolean }) {
  const tab = useUi((s) => s.mobileTab);
  const setTab = useUi((s) => s.setMobileTab);
  const sheetOpen = useUi((s) => s.sheetOpen);
  const setSheet = useUi((s) => s.setSheetOpen);
  const pending = useSim((s) => s.decisions.find((d) => d.status === "pending"));
  const forking = useUi((s) => s.forking);
  const states = useSim((s) => s.status);
  const log = useSim((s) => s.log);
  const lastGuide = useSim((s) => [...s.dialogue].reverse().find((c) => c.channel === "main"));
  // The warm-up's questions hold the sheet open like any card (D-090).
  const warming = useSim((s) => s.phase === "warmup");
  const open = sheetOpen || !!pending || !!forking || warming;
  const tabs = useMemo(() => ["log", "bio", "settings"] as const, []);
  return (
    <div className="phone" data-dim={dim} data-sheet={open}>
      <header className="ph-bar">
        <span className="wordmark">Every Life You Have Left</span>
        <SpeedKeys />
      </header>
      <div className="ph-timeline">
        <TimelineBar />
      </div>
      <div className="world-wrap ph-world">
        <CurrentWorld />
        <MeanwhileOverlay />
      </div>
      <nav className="ph-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t === "log" ? "Log" : t === "bio" ? "Bio" : "Steer"}
          </button>
        ))}
      </nav>
      <div className="ph-body">
        {tab === "log" && (warming ? <Learned /> : <LifeLog />)}
        {tab === "bio" && (
          <div className="ph-bio scroll">
            <Bio />
            <LifeRose states={states} log={log} size={260} />
            <TellMeMore />
          </div>
        )}
        {tab === "settings" && (
          <div className="ph-settings">
            <LiveSettings />
          </div>
        )}
      </div>
      <section className="sheet" data-open={open} aria-label="Conversation">
        <button className="sheet-handle" onClick={() => setSheet(!sheetOpen)} aria-expanded={open} disabled={!!pending || warming}>
          <span className="grip" />
          {!open && <span className="small sheet-peek">{lastGuide?.text ?? "Conversation"}</span>}
        </button>
        <div className="sheet-body">
          <RightPane tabs={false} />
        </div>
      </section>
    </div>
  );
}
