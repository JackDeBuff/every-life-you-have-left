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
  const [degraded, setDegraded] = useState(false);
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

  const quality = useMemo<"high" | "low">(() => {
    const cores = navigator.hardwareConcurrency ?? 8;
    return cores >= 8 && window.devicePixelRatio <= 2 ? "high" : "low";
  }, []);

  const maxDpr = quality === "high" ? 1.5 : 1.25;
  const dpr = degraded ? 1 : Math.max(1, Math.min(maxDpr, Math.sqrt(1.6e6 / area)));

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
            if (import.meta.env.DEV) (window as unknown as { __r3f: unknown }).__r3f = state;
          }}
        >
          <MotionCtx.Provider value={motion}>
            <PerformanceMonitor onDecline={() => setDegraded(true)} flipflops={2} onFallback={() => setDegraded(true)} />
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
              quality={degraded ? "low" : quality}
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
