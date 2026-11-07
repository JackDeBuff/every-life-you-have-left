/**
 * Inside the Canvas: owns the islands (one per place; old ones sink, new ones rise), the blending
 * look, the camera rig, moments and interlude cuts.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Vector3, type Group } from "three";
import type { Appearance, SceneSpec } from "../../../shared/sim";
import type { InterludeCut } from "../../../shared/engine";
import { personUrl, preloadKit, preloadUrl, animalUrl, CLIPS_URL, type StaticKit } from "../assets";
import { compose, type Layout } from "../layout";
import { cloneLook, dampLook, lerpLook, lookFor, type Look } from "../palette";
import { clamp01, easeInCubic, easeOutBack, useMotion } from "./anim";
import { Atmosphere } from "./Atmosphere";
import { CameraRig, makeRig, type RigState } from "./CameraRig";
import { Cars } from "./Cars";
import { Hero } from "./Hero";
import { Island } from "./Island";
import { LookCtx } from "./look";
import { MomentDirector, type Moment } from "./Moments";
import { People, type SelfTracker } from "./People";
import { Pieces } from "./Pieces";
import { Post } from "./Post";
import { Procs } from "./Procs";
import { Weather } from "./Weather";

export interface SceneProps {
  spec: SceneSpec;
  mode: "life" | "interlude";
  cuts: InterludeCut[] | undefined;
  appearance: Appearance | null;
  onMomentDone?: () => void;
  onCut?: (index: number, cut: InterludeCut) => void;
  onInterludeDone?: () => void;
  /** DOM-level fade (interlude cut joins). */
  fade: (on: boolean) => void;
  /** Reduced motion: called with a snapshot before a change is applied. */
  snapshot: (dataUrl: string) => void;
  quality: "high" | "low";
}

interface IslandItem {
  id: number;
  spec: SceneSpec;
  layout: Layout;
  born: number;
  /** Rise up from the clouds (a new place) or just appear (first load, interlude, reduced motion). */
  rise: boolean;
  leaving: number | null;
}

const ALL_KITS: StaticKit[] = ["nature", "street", "props", "suburban", "commercial", "cars", "interior", "camp", "food"];
const LIFE_DIST = 23.5;
const INDOOR_DIST = 10.8;

function Diorama({ item, self, frozen }: { item: IslandItem; self: SelfTracker; frozen: boolean }) {
  const ref = useRef<Group>(null);
  const { time, reduced } = useMotion();
  const { layout, spec } = item;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    if (reduced) {
      g.position.y = 0;
      g.scale.setScalar(1);
      g.visible = item.leaving === null;
      return;
    }
    if (item.leaving !== null) {
      const k = clamp01((time() - item.leaving) / 1.5);
      g.position.y = -easeInCubic(k) * 11;
      g.scale.setScalar(1 - 0.25 * k);
      g.visible = k < 1;
    } else if (!item.rise) {
      g.position.y = 0;
      g.scale.setScalar(1);
    } else {
      const k = clamp01((time() - item.born - 0.35) / 1.6);
      g.position.y = (1 - easeOutBack(k, 1.1)) * -10;
      g.scale.setScalar(0.8 + 0.2 * Math.min(1, k * 1.2));
    }
  });
  return (
    <group ref={ref}>
      <Island coast={layout.coast} seed={layout.placeKey} />
      <Procs procs={layout.procs} />
      <Suspense fallback={null}>
        <Pieces pieces={layout.pieces} flavor={spec.flavor} snowy={layout.snowCover > 0.5} />
      </Suspense>
      <Suspense fallback={null}>
        <Hero hero={layout.hero} flavor={spec.flavor} snowy={layout.snowCover > 0.5} />
      </Suspense>
      <Suspense fallback={null}>
        <People people={layout.people} islandBorn={item.born} self={self} frozen={frozen} />
      </Suspense>
      <Suspense fallback={null}>
        <Cars lanes={layout.cars} flavor={spec.flavor} />
      </Suspense>
    </group>
  );
}

function preloadFor(layout: Layout) {
  for (const k of layout.kits) preloadKit(k);
  preloadUrl(CLIPS_URL);
  for (const p of layout.people) preloadUrl(p.pet ? animalUrl(p.model as "Dog" | "Cat") : personUrl(p.model as Parameters<typeof personUrl>[0]));
}

export function WorldScene(props: SceneProps) {
  const { mode, cuts, appearance, onMomentDone, onCut, onInterludeDone, fade, snapshot, quality } = props;
  const { time, reduced } = useMotion();
  const { gl, invalidate } = useThree();
  const rig = useRef<RigState>(makeRig());
  const self = useMemo<SelfTracker>(() => ({ pos: new Vector3(1.5, 0, 1.5), override: null }), []);
  const memory = useRef(0);
  const glowBoost = useRef(0);

  // ----- which spec is on screen (life: the prop; interlude: the current cut) -----
  const [cutIndex, setCutIndex] = useState(0);
  const cutSpec = mode === "interlude" && cuts && cuts.length ? cuts[Math.min(cutIndex, cuts.length - 1)]!.scene : null;
  const wanted = cutSpec ?? props.spec;
  const deferred = useDeferredValue(wanted);

  // reduced motion: snapshot the old frame before applying a new spec, then crossfade in the DOM
  const [applied, setApplied] = useState<SceneSpec>(deferred);
  const pendingSnap = useRef<SceneSpec | null>(null);
  useEffect(() => {
    if (deferred === applied) return;
    if (reduced && mode === "life") {
      pendingSnap.current = deferred;
      invalidate();
    } else setApplied(deferred);
  }, [deferred, applied, reduced, mode, invalidate]);
  useFrame(() => {
    const next = pendingSnap.current;
    if (!next) return;
    pendingSnap.current = null;
    try {
      snapshot(gl.domElement.toDataURL("image/jpeg", 0.85));
    } catch {
      /* tainted or lost context: just switch */
    }
    setApplied(next);
    invalidate();
  }, 2);

  const layout = useMemo(() => compose(applied, appearance), [applied, appearance]);

  // ----- islands: same place updates in place; a new place sinks the old island -----
  const idRef = useRef(0);
  const [islands, setIslands] = useState<IslandItem[]>(() => [{ id: 0, spec: applied, layout, born: time(), rise: false, leaving: null }]);
  const yearStep = useRef(0);
  useEffect(() => {
    setIslands((prev) => {
      const top = prev.find((i) => i.leaving === null);
      if (top && top.layout.placeKey === layout.placeKey) {
        if (top.layout === layout) return prev;
        return prev.map((i) => (i === top ? { ...i, spec: applied, layout } : i));
      }
      const t = time();
      const instant = mode === "interlude" || reduced;
      const kept = instant ? [] : prev.filter((i) => i.leaving === null || t - i.leaving < 1.6).map((i) => (i.leaving === null ? { ...i, leaving: t } : i));
      return [...kept, { id: ++idRef.current, spec: applied, layout, born: t, rise: !instant, leaving: null }];
    });
    yearStep.current += 1;
    preloadFor(layout);
    invalidate();
  }, [layout, applied, time, mode, reduced, invalidate]);
  useEffect(() => {
    if (!islands.some((i) => i.leaving !== null)) return;
    const id = window.setTimeout(() => setIslands((prev) => prev.filter((i) => i.leaving === null || time() - i.leaving < 1.55)), 1700);
    return () => window.clearTimeout(id);
  }, [islands, time]);

  // prefetch the remaining kits when idle (lazy, after the first scene is up)
  useEffect(() => {
    const id = window.setTimeout(() => ALL_KITS.forEach((k) => preloadKit(k)), 4000);
    return () => window.clearTimeout(id);
  }, []);

  // ----- look -----
  const target = useMemo(() => lookFor(applied), [applied]);
  const base = useRef<Look>(cloneLook(target));
  const eff = useRef<Look>(cloneLook(target));
  useFrame((_, dt) => {
    if (reduced || mode === "interlude") lerpLook(base.current, base.current, target, 1);
    else dampLook(base.current, target, 1.7, Math.min(dt, 0.05));
    const e = eff.current;
    Object.assign(e, base.current);
    e.windowGlow = base.current.windowGlow + glowBoost.current * 1.2;
    e.lampGlow = base.current.lampGlow + glowBoost.current;
    e.exposure = base.current.exposure - memory.current * 0.08;
  }, -2);

  // ----- camera: turntable step per year, dolly for rooms -----
  useEffect(() => {
    const R = rig.current;
    if (mode === "interlude") return;
    const step = yearStep.current;
    R.yaw = 38 + Math.sin(step * 1.7) * 11;
    R.pitch = layout.indoor ? 37 : 30;
    R.dist = layout.indoor ? INDOOR_DIST : LIFE_DIST;
    R.focus.set(layout.focus[0], layout.focus[1], layout.focus[2]);
    R.shot = null;
  }, [layout, mode]);

  // ----- moments -----
  const momentToken = useRef(0);
  const [moment, setMoment] = useState<{ kind: Moment; token: number } | null>(null);
  useEffect(() => {
    if (mode !== "life") {
      setMoment(null);
      return;
    }
    if (applied.moment) setMoment({ kind: applied.moment, token: ++momentToken.current });
    else setMoment(null);
  }, [applied, mode]);
  const momentDone = useCallback(() => {
    setMoment(null);
    onMomentDone?.();
  }, [onMomentDone]);

  // ----- interlude: three cuts, ~2.5 s each, title-card feel -----
  const cutT0 = useRef(time());
  const cutsKey = cuts?.map((c) => `${c.branchId}${c.age}`).join("|") ?? "";
  useEffect(() => {
    if (mode !== "interlude" || !cuts?.length) return;
    setCutIndex(0);
    cutT0.current = time();
    for (const c of cuts) preloadFor(compose(c.scene, appearance));
    onCut?.(0, cuts[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cutsKey]);
  const cutState = useRef({ index: 0, fading: false, finished: false });
  useEffect(() => {
    cutState.current = { index: cutIndex, fading: false, finished: false };
  }, [cutIndex, cutsKey]);
  useFrame(() => {
    if (mode !== "interlude" || !cuts?.length) {
      rig.current.shot = null;
      memory.current = Math.max(0, memory.current - 0.05);
      return;
    }
    memory.current = 0.6;
    const CUT = 2.5;
    const k = (time() - cutT0.current) / CUT;
    const i = cutState.current.index;
    const yaw0 = 22 + i * 32;
    rig.current.shot = { yaw0, yaw1: yaw0 + (reduced ? 0 : 10), dist0: 27, dist1: reduced ? 27 : 22, pitch: 27, t: clamp01(k) };
    rig.current.focus.set(layout.focus[0], 0.3, layout.focus[2]);
    if (k > 0.9 && !cutState.current.fading && !cutState.current.finished) {
      cutState.current.fading = true;
      fade(true);
    }
    if (k >= 1 && !cutState.current.finished) {
      cutState.current.finished = true;
      if (i + 1 < cuts.length) {
        cutT0.current = time();
        setCutIndex(i + 1);
        window.setTimeout(() => fade(false), 120);
        onCut?.(i + 1, cuts[i + 1]!);
      } else {
        window.setTimeout(() => fade(false), 160);
        onInterludeDone?.();
      }
    }
  });

  const frozen = false;
  const top = islands.find((i) => i.leaving === null) ?? islands[islands.length - 1]!;
  return (
    <LookCtx.Provider value={eff}>
      <CameraRig rig={rig} />
      <Atmosphere center={[top.layout.focus[0], 0, top.layout.focus[2]]} />
      <Weather spec={applied} />
      {islands.map((it) => (
        <Diorama key={it.id} item={it} self={self} frozen={frozen} />
      ))}
      {moment && (
        <Suspense fallback={null}>
          <MomentDirector key={moment.token} moment={moment.kind} token={moment.token} layout={layout} self={self} rig={rig} memory={memory} glowBoost={glowBoost} onDone={momentDone} />
        </Suspense>
      )}
      <Post memory={memory as MutableRefObject<number>} quality={quality} />
    </LookCtx.Provider>
  );
}
