/**
 * <World>: the 3D diorama of the chosen life this year (docs/SPEC.md §7, docs/WORLD.md).
 *
 *   <World spec mode="life" | "interlude" cuts appearance onMomentDone onCut onInterludeDone paused />
 *
 * Handles: WebGL failure -> static poster; prefers-reduced-motion -> fixed camera + crossfades;
 * frameloop "demand" when hidden / off-screen / paused; capped DPR.
 */
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PCFShadowMap } from "three";
import type { InterludeCut } from "../../shared/engine";
import type { Appearance, SceneSpec } from "../../shared/sim";
import { MotionCtx, type WorldMotion } from "./scene/anim";
import { WorldScene } from "./scene/WorldScene";
import "./world.css";

export interface WorldProps {
  spec: SceneSpec;
  mode?: "life" | "interlude";
  cuts?: InterludeCut[];
  appearance?: Appearance | null;
  /** The current spec's moment finished its cinematic. */
  onMomentDone?: () => void;
  /** Interlude: cut `index` starts now (draw its caption). */
  onCut?: (index: number, cut: InterludeCut) => void;
  /** Interlude: all cuts played. */
  onInterludeDone?: () => void;
  /** Freeze animation (e.g. while a decision card dims the pane). */
  paused?: boolean;
  /** Interlude: seconds per cut (default 2.5). The UI shortens it in Auto to keep the run ≤3 min. */
  cutSeconds?: number;
  className?: string;
}

/**
 * `?perf` exposes the R3F state (renderer.info) in production builds, for frame-time measurements;
 * `?perf=hi|mid|lo` also pins the quality tier (no adaptive changes), for A/B numbers.
 */
const PERF_PARAM = typeof location !== "undefined" ? new URLSearchParams(location.search).get("perf") : null;
const PERF_HOOK = PERF_PARAM !== null;
const PINNED: Tier | null = PERF_PARAM === "hi" ? 2 : PERF_PARAM === "mid" ? 1 : PERF_PARAM === "lo" ? 0 : null;

/**
 * Quality tiers. 2: DPR <= 1.5, MSAA x4, AO; 1: DPR <= 1.25, MSAA x2, cheaper AO; 0: DPR 1, no
 * MSAA, no AO / tilt-shift, smaller shadow map. Machines start at 2 (1 on small CPUs / very high
 * DPR screens) and step down (or back up) with the measured frame rate.
 */
export type Tier = 0 | 1 | 2;
const TIER_PIXELS: Record<Tier, { maxDpr: number; mp: number }> = { 2: { maxDpr: 1.5, mp: 1.6e6 }, 1: { maxDpr: 1.25, mp: 1.1e6 }, 0: { maxDpr: 1, mp: 0 } };

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[world] falling back to poster:", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Poster({ caption }: { caption?: string }) {
  return (
    <div className="world-poster" role="img" aria-label={caption ? `Illustration: ${caption}` : "Illustration of a small town on a floating island"}>
      <img src="/world/poster.jpg" alt="" draggable={false} />
    </div>
  );
}

export function World({ spec, mode = "life", cuts, appearance = null, onMomentDone, onCut, onInterludeDone, paused = false, cutSeconds, className }: WorldProps) {
  const reduced = usePrefersReducedMotion();
  const [gl] = useState(webglAvailable);
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [fadeOn, setFadeOn] = useState(false);
  // Pixel budget: keep the drawing buffer near 1.6 MP (crisp in the expo pane, sane full-screen),
  // and step down further if the frame rate declines (drei PerformanceMonitor).
  const [area, setArea] = useState(800 * 450);
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => {
      const r = e[0]?.contentRect;
      if (r) setArea(Math.max(1, r.width * r.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [snap, setSnap] = useState<{ url: string; id: number } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => setVisible(e[0]?.isIntersecting ?? true), { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const on = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  // A clock that stops while paused, so animation resumes where it left off.
  const clock = useRef({ offset: 0, pausedAt: null as number | null });
  useEffect(() => {
    const c = clock.current;
    const t = performance.now() / 1000;
    if (paused && c.pausedAt === null) c.pausedAt = t;
    if (!paused && c.pausedAt !== null) {
      c.offset += t - c.pausedAt;
      c.pausedAt = null;
    }
  }, [paused]);
  const motion = useMemo<WorldMotion>(
    () => ({
      reduced,
      paused,
      time: () => {
        const c = clock.current;
        return (c.pausedAt ?? performance.now() / 1000) - c.offset;
      },
    }),
    [reduced, paused],
  );

  const active = visible && pageVisible && !paused && !reduced;
  const fade = useCallback((on: boolean) => setFadeOn(on), []);
  const snapshot = useCallback((url: string) => setSnap({ url, id: performance.now() }), []);
  useEffect(() => {
    if (!snap) return;
    const id = window.setTimeout(() => setSnap(null), 700);
    return () => window.clearTimeout(id);
  }, [snap]);

  const startTier = useMemo<Tier>(() => {
    if (PINNED !== null) return PINNED;
    const cores = navigator.hardwareConcurrency ?? 8;
    return cores >= 8 && window.devicePixelRatio <= 2 ? 2 : 1;
  }, []);
  const [tier, setTier] = useState<Tier>(startTier);
  // Adaptive quality watches the frame rate only once the scene has warmed up (kit loads and
  // shader compiles in the first seconds are not a slow machine) and only while it animates.
  const [watch, setWatch] = useState(false);
  useEffect(() => {
    if (!active || PINNED !== null) return;
    const id = window.setTimeout(() => setWatch(true), 6000);
    return () => {
      window.clearTimeout(id);
      setWatch(false);
    };
  }, [active]);
  const step = useCallback((d: -1 | 1) => setTier((t) => Math.max(0, Math.min(startTier, t + d)) as Tier), [startTier]);

  const px = TIER_PIXELS[tier];
  const dpr = tier === 0 ? 1 : Math.max(1, Math.min(px.maxDpr, Math.sqrt(px.mp / area)));

  if (!gl) {
    return (
      <div className={`world ${className ?? ""}`}>
        <Poster caption={spec.caption} />
      </div>
    );
  }

  return (
    <div ref={host} className={`world ${className ?? ""}`} data-mode={mode}>
      <Boundary fallback={<Poster caption={spec.caption} />}>
        <Canvas
          className="world-canvas"
          flat
          shadows={{ type: PCFShadowMap, enabled: true }}
          dpr={dpr}
          frameloop={active ? "always" : "demand"}
          gl={{ antialias: false, powerPreference: "high-performance", stencil: false, preserveDrawingBuffer: false }}
          camera={{ fov: 22, near: 1, far: 260, position: [25, 20, 25] }}
          onCreated={(state) => {
            state.gl.domElement.addEventListener("webglcontextlost", (e) => e.preventDefault());
            // Production: don't block on getProgramInfoLog after every shader link (it stalls the
            // frame until the compile finishes; parallel compilation can't help while it does).
            state.gl.debug.checkShaderErrors = import.meta.env.DEV;
            // The scene root never moves: without this, its per-frame updateMatrix() would force
            // a world-matrix recompute of every object. Static set pieces freeze their own matrices.
            state.scene.matrixAutoUpdate = false;
            state.scene.updateMatrix();
            if (import.meta.env.DEV || PERF_HOOK) (window as unknown as { __r3f: unknown }).__r3f = state;
          }}
        >
          <MotionCtx.Provider value={motion}>
            {watch && <PerformanceMonitor ms={400} iterations={8} bounds={(hz) => (hz > 90 ? [55, 85] : [44, 57])} flipflops={3} onDecline={() => step(-1)} onIncline={() => step(1)} />}
            <DemandTicker on={!active && visible && pageVisible} />
            <WorldScene
              spec={spec}
              mode={mode}
              cuts={cuts}
              appearance={appearance}
              onMomentDone={onMomentDone}
              onCut={onCut}
              onInterludeDone={onInterludeDone}
              cutSeconds={cutSeconds}
              fade={fade}
              snapshot={snapshot}
              tier={tier}
            />
          </MotionCtx.Provider>
        </Canvas>
      </Boundary>
      {mode === "interlude" && <div className="world-letterbox" aria-hidden />}
      <div className="world-fade" data-on={fadeOn} aria-hidden />
      {snap && <img key={snap.id} className="world-snap" src={snap.url} alt="" aria-hidden />}
    </div>
  );
}

/** In demand mode (reduced motion / paused) render a few frames a second so loads and moments still show. */
function DemandTicker({ on }: { on: boolean }) {
  return on ? <Ticker /> : null;
}
function Ticker() {
  const inv = useThree((s) => s.invalidate);
  useEffect(() => {
    const id = window.setInterval(inv, 250);
    return () => window.clearInterval(id);
  }, [inv]);
  return null;
}

export default World;
