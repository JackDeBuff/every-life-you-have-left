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
import { assignLandmarks } from "../landmarks";
import { compose, type Layout } from "../layout";
import { cloneLook, dampLook, lerpLook, lookFor, type Look } from "../palette";
import { clamp01, easeInCubic, easeOutBack, useMotion } from "./anim";
import { Atmosphere } from "./Atmosphere";
import { CameraRig, makeRig, type RigState } from "./CameraRig";
import { Cars } from "./Cars";
import { Hero } from "./Hero";
import { Island } from "./Island";
import { Landmark } from "./Landmark";
import { LookCtx } from "./look";
import { MomentDirector, type Moment } from "./Moments";
import { People, type SelfTracker } from "./People";
import { Pieces } from "./Pieces";
import { Post } from "./Post";
import { Procs } from "./Procs";
import { markShadows, ShadowDirector } from "./shadows";
import { PracticalLights } from "./practical";
import { warmShaders } from "./warmup";
import { Weather } from "./Weather";

export interface SceneProps {
  spec: SceneSpec;
  mode: "life" | "interlude";
  cuts: InterludeCut[] | undefined;
  appearance: Appearance | null;
  onMomentDone?: () => void;
  onCut?: (index: number, cut: InterludeCut) => void;
  onInterludeDone?: () => void;
  /** Seconds per interlude cut (default 2.5). */
  cutSeconds?: number;
  /** DOM-level fade (interlude cut joins). */
  fade: (on: boolean) => void;
  /** Reduced motion: called with a snapshot before a change is applied. */
  snapshot: (dataUrl: string) => void;
  /** Quality tier (World.tsx): 2 high, 1 medium, 0 low. */
  tier: 0 | 1 | 2;
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
  // The island's own matrix is recomposed only while it rises or sinks (matrixAutoUpdate off), so a
  // settled island does not force a world-matrix update of everything on it every frame.
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    let y = 0;
    let s = 1;
    let vis = true;
    if (reduced) vis = item.leaving === null;
    else if (item.leaving !== null) {
      const k = clamp01((time() - item.leaving) / 1.5);
      y = -easeInCubic(k) * 11;
      s = 1 - 0.25 * k;
      vis = k < 1;
    } else if (item.rise) {
      const k = clamp01((time() - item.born - 0.35) / 1.6);
      y = (1 - easeOutBack(k, 1.1)) * -10;
      s = 0.8 + 0.2 * Math.min(1, k * 1.2);
    }
    g.visible = vis;
    if (g.position.y !== y || g.scale.x !== s) {
      g.position.y = y;
      g.scale.setScalar(s);
      g.updateMatrix();
      markShadows();
    }
  });
  return (
    <group ref={ref} matrixAutoUpdate={false}>
      <Island coast={layout.coast} seed={layout.placeKey} />
      <Procs procs={layout.procs} />
      <Suspense fallback={null}>
        <Pieces pieces={layout.pieces} flavor={spec.flavor} snowy={layout.snowCover > 0.5} />
      </Suspense>
      <Suspense fallback={null}>
        <Hero hero={layout.hero} flavor={spec.flavor} snowy={layout.snowCover > 0.5} />
      </Suspense>
      <Suspense fallback={null}>
        <People people={layout.people} islandBorn={item.born} self={self} frozen={frozen} track={item.leaving === null} />
      </Suspense>
      <Suspense fallback={null}>
        <Cars lanes={layout.cars} flavor={spec.flavor} />
      </Suspense>
      {layout.landmark && <Landmark spec={layout.landmark} t0={item.born} />}
    </group>
  );
}

function preloadFor(layout: Layout) {
  for (const k of layout.kits) preloadKit(k);
  preloadUrl(CLIPS_URL);
  for (const p of layout.people) preloadUrl(p.pet ? animalUrl(p.model as "Dog" | "Cat") : personUrl(p.model as Parameters<typeof personUrl>[0]));
}

export function WorldScene(props: SceneProps) {
  const { mode, cuts, appearance, onMomentDone, onCut, onInterludeDone, fade, snapshot, tier } = props;
  const cutLen = Math.max(1.2, props.cutSeconds ?? 2.5);
  const { time, reduced } = useMotion();
  const { gl, invalidate } = useThree();
  const rig = useRef<RigState>(makeRig());
  const self = useMemo<SelfTracker>(() => ({ pos: new Vector3(1.5, 0, 1.5), override: null, cast: new Map() }), []);
  const memory = useRef(0);
  const glowBoost = useRef(0);

  // ----- which spec is on screen (life: the prop; interlude: the current cut) -----
  const [cutIndex, setCutIndex] = useState(0);
  const cutAt = mode === "interlude" && cuts && cuts.length ? Math.min(cutIndex, cuts.length - 1) : null;
  const cutSpec = cutAt !== null ? cuts![cutAt]!.scene : null;
  const wantedRaw = cutSpec ?? props.spec;
  // A cut is keyed by its index too: two lives in one city can share a spec but never a landmark.
  const stable = useRef<{ key: string; spec: SceneSpec; cut: number | null }>({ key: "", spec: wantedRaw, cut: cutAt });
  const wantedKey = JSON.stringify(wantedRaw) + (cutAt === null ? "" : `|cut${cutAt}`);
  if (stable.current.key !== wantedKey) stable.current = { key: wantedKey, spec: wantedRaw, cut: cutAt };
  const deferred = useDeferredValue(stable.current);

  // reduced motion: snapshot the old frame before applying a new spec, then crossfade in the DOM
  const [appliedState, setApplied] = useState(deferred);
  const applied = appliedState.spec;
  const pendingSnap = useRef<typeof deferred | null>(null);
  useEffect(() => {
    if (deferred === appliedState) return;
    if (reduced && mode === "life") {
      pendingSnap.current = deferred;
      invalidate();
    } else setApplied(deferred);
  }, [deferred, appliedState, reduced, mode, invalidate]);
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

  // Interlude cuts: one signature landmark + accent per branch (src/world/landmarks.ts).
  const marksKey = cuts?.map((c) => `${c.branchId}${c.age}${c.scene.placeLabel}`).join("|") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marks = useMemo(() => assignLandmarks(cuts ?? []), [marksKey]);
  const appliedCut = appliedState.cut;
  const mark = appliedCut !== null ? (marks[appliedCut] ?? null) : null;
  const layout = useMemo(() => compose(applied, appearance, mark), [applied, appearance, mark]);

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

  // prefetch the remaining kits when idle (lazy, after the first scene is up), and warm the
  // moments' shader variants in the background before the first one plays
  const { scene, camera } = useThree();
  useEffect(() => {
    const id = window.setTimeout(() => ALL_KITS.forEach((k) => preloadKit(k)), 8000);
    const w = window.setTimeout(() => warmShaders(gl, scene, camera), 2500);
    return () => {
      window.clearTimeout(id);
      window.clearTimeout(w);
    };
  }, [gl, scene, camera]);

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
    // the turntable: each year looks from a slightly different angle (fixed under reduced motion)
    R.yaw = reduced ? 38 : 38 + Math.sin(step * 1.7) * 11;
    R.pitch = layout.indoor ? 37 : 30;
    R.dist = layout.indoor ? INDOOR_DIST : LIFE_DIST;
    R.focus.set(layout.focus[0], layout.focus[1], layout.focus[2]);
    R.shot = null;
  }, [layout, mode, reduced]);

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
  const cutState = useRef({ index: 0, fading: false, finished: false });
  // The interlude a frame is timing. A frame can run between the commit that switches to a new
  // interlude and the effects below; without this, it would time the new cuts with the last
  // interlude's clock and index and end the new one at once.
  const timing = useRef("");
  useEffect(() => {
    if (mode !== "interlude" || !cuts?.length) return;
    setCutIndex(0);
    cutT0.current = time();
    cutState.current = { index: 0, fading: false, finished: false };
    timing.current = cutsKey;
    for (const c of cuts) preloadFor(compose(c.scene, appearance));
    onCut?.(0, cuts[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cutsKey]);
  useEffect(() => {
    cutState.current = { index: cutIndex, fading: false, finished: false };
  }, [cutIndex]);
  useFrame(() => {
    if (mode !== "interlude" || !cuts?.length) {
      rig.current.shot = null;
      memory.current = Math.max(0, memory.current - 0.05);
      timing.current = "";
      return;
    }
    if (timing.current !== cutsKey) {
      timing.current = cutsKey;
      cutT0.current = time();
      cutState.current = { index: 0, fading: false, finished: false };
    }
    memory.current = 0.6;
    const k = (time() - cutT0.current) / cutLen;
    const i = cutState.current.index;
    const yaw0 = 22 + i * 32;
    const lm = layout.landmark;
    if (lm) {
      // frame the life AND its landmark: aim between the stage and the landmark, a little higher, a little wider
      const tall = lm.kind !== "canal" && lm.kind !== "bridge";
      rig.current.shot = { yaw0, yaw1: yaw0 + (reduced ? 0 : 10), dist0: 29, dist1: reduced ? 29 : 25, pitch: 26, t: clamp01(k) };
      rig.current.focus.set(layout.focus[0] * 0.55 + lm.pos[0] * 0.45 * (tall ? 1 : 0.4), tall ? 1.15 : 0.4, layout.focus[2] * 0.55 + lm.pos[2] * 0.45 * (tall ? 1 : 0.4));
    } else {
      rig.current.shot = { yaw0, yaw1: yaw0 + (reduced ? 0 : 10), dist0: 27, dist1: reduced ? 27 : 22, pitch: 27, t: clamp01(k) };
      rig.current.focus.set(layout.focus[0], 0.3, layout.focus[2]);
    }
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

  const frozen = !!useMotion().paused;
  const top = islands.find((i) => i.leaving === null) ?? islands[islands.length - 1]!;
  return (
    <LookCtx.Provider value={eff}>
      <CameraRig rig={rig} />
      <ShadowDirector live={mode === "interlude"} />
      <PracticalLights />
      <Atmosphere center={[top.layout.focus[0], 0, top.layout.focus[2]]} shadowSize={tier === 0 ? 1024 : 2048} />
      <Weather spec={applied} />
      {islands.map((it) => (
        <Diorama key={it.id} item={it} self={self} frozen={frozen} />
      ))}
      {moment && (
        <Suspense fallback={null}>
          <MomentDirector key={moment.token} moment={moment.kind} token={moment.token} layout={layout} self={self} rig={rig} memory={memory} glowBoost={glowBoost} onDone={momentDone} />
        </Suspense>
      )}
      <Post memory={memory as MutableRefObject<number>} tier={tier} />
    </LookCtx.Provider>
  );
}
