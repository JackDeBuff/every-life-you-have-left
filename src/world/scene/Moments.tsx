/**
 * Moments (docs/WORLD.md §8): 3-5 s mini-cinematics layered over the year's scene. The director
 * pushes the camera in on the self, plays the beat (props, confetti, light), pulls back, then
 * reports done. Reduced motion: no camera move, the beat's props appear still, then done.
 */
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  InstancedMesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Group,
} from "three";
import type { SceneSpec } from "../../../shared/sim";
import type { Layout, Pose } from "../layout";
import { MATS, solid } from "../materials";
import { SWATCH } from "../palette";
import { rng } from "../rng";
import { clamp01, easeInOutCubic, easeOutBack, easeOutCubic, useMotion } from "./anim";
import type { RigState } from "./CameraRig";
import type { SelfTracker } from "./People";
import { markShadows } from "./shadows";
import { PracticalLight } from "./practical";

export type Moment = NonNullable<SceneSpec["moment"]>;

export const MOMENT_DURATION: Record<Moment, number> = {
  graduation: 4.4, new_job: 4.0, promotion: 4.2, layoff: 4.4, wedding: 4.8, new_baby: 4.2, moving_in: 4.2, house_keys: 4.6,
  first_show: 4.4, launch: 4.0, travel_abroad: 4.6, breakup: 4.2, reunion: 4.0, caregiving_start: 4.0, retirement: 4.6, award: 4.4,
};

const SELF_POSE: Partial<Record<Moment, Pose>> = {
  graduation: "victory", promotion: "victory", award: "victory", wedding: "idle", launch: "victory", reunion: "wave",
  travel_abroad: "wave", retirement: "victory", layoff: "sad", breakup: "sad", new_job: "wave", house_keys: "victory", moving_in: "idle",
  first_show: "idle", new_baby: "idle", caregiving_start: "idle",
};

const BOX = new BoxGeometry(1, 1, 1);
const PLANE = new PlaneGeometry(1, 1);
const SPH = new SphereGeometry(0.5, 12, 8);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 16);
const CONE = new ConeGeometry(0.5, 1, 20, 1, true);
const CONFETTI = ["#EE8E7A", "#F2C66D", "#6FB7B4", "#FBF8F1", "#A9C59A", "#F4B6C2"];
const GOLD = new MeshStandardMaterial({ color: "#E8B04A", roughness: 0.35, metalness: 0.6, emissive: new Color("#7A4E10"), emissiveIntensity: 0.4 });
const GLOW = new MeshBasicMaterial({ color: "#FFE3A3", transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });

/** A burst of tumbling confetti (or petals / caps) from a point. */
function Burst({ origin, count = 180, colors = CONFETTI, start = 0.6, t, spread = 1.2, up = 2.6, size = 0.06, gravity = 2.2, shape = "paper" }: {
  origin: Vector3; count?: number; colors?: string[]; start?: number; t: MutableRefObject<number>; spread?: number; up?: number; size?: number; gravity?: number; shape?: "paper" | "petal";
}) {
  const ref = useRef<InstancedMesh>(null);
  const parts = useMemo(() => {
    const r = rng(`burst${count}${up}`);
    return Array.from({ length: count }, () => ({
      v: new Vector3(r.range(-1, 1) * spread * 0.9, r.range(0.6, 1) * up, r.range(-1, 1) * spread * 0.9),
      spin: new Vector3(r.range(-8, 8), r.range(-8, 8), r.range(-8, 8)),
      c: new Color(r.pick(colors)),
      d: r.range(0, 0.25),
    }));
  }, [count, colors, spread, up]);
  const mat = useMemo(() => new MeshStandardMaterial({ roughness: 0.7, side: DoubleSide }), []);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    parts.forEach((p, i) => m.setColorAt(i, p.c));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [parts]);
  const o = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const tt = t.current - start;
    parts.forEach((p, i) => {
      const k = tt - p.d;
      if (k <= 0) {
        o.scale.setScalar(0.0001);
      } else {
        const drag = 1 - Math.exp(-k * 1.6);
        const flutter = shape === "petal" ? Math.sin(k * 5 + i) * 0.1 : 0;
        o.position.set(origin.x + (p.v.x / 1.6) * drag + flutter, origin.y + (p.v.y / 1.6) * drag - 0.5 * gravity * k * k * 0.35, origin.z + (p.v.z / 1.6) * drag);
        if (o.position.y < 0.01) o.position.y = 0.01;
        o.rotation.set(p.spin.x * k, p.spin.y * k, p.spin.z * k);
        const fade = clamp01(1 - (k - 2.6) / 0.8);
        o.scale.set(size * fade, size * 0.6 * fade, size * fade);
      }
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[PLANE, mat, count]} frustumCulled={false} castShadow />;
}

/** Warm motes rising (sparkles). */
function Motes({ origin, t, start = 0.4, count = 40, radius = 0.5, color = "#FFE3A3" }: { origin: Vector3; t: MutableRefObject<number>; start?: number; count?: number; radius?: number; color?: string }) {
  const ref = useRef<InstancedMesh>(null);
  const mat = useMemo(() => new MeshBasicMaterial({ color, transparent: true, blending: AdditiveBlending, depthWrite: false }), [color]);
  const parts = useMemo(() => {
    const r = rng(`motes${count}`);
    return Array.from({ length: count }, () => ({ a: r.range(0, 6.28), r: r.range(0.1, 1) * radius, s: r.range(0.3, 0.9), d: r.range(0, 1.5), w: r.range(1, 3) }));
  }, [count, radius]);
  const o = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const tt = t.current - start;
    parts.forEach((p, i) => {
      const k = (tt - p.d) % 2.2;
      const alive = tt - p.d > 0;
      o.position.set(origin.x + Math.cos(p.a + k * 0.6) * p.r, origin.y + k * p.s * 0.6, origin.z + Math.sin(p.a + k * 0.6) * p.r);
      const s = alive ? 0.022 * Math.sin(Math.PI * clamp01(k / 2.2)) * (0.7 + 0.3 * Math.sin(k * p.w * 6)) : 0.0001;
      o.scale.setScalar(Math.max(0.0001, s));
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[SPH, mat, count]} frustumCulled={false} />;
}

function Appear({ t, at, children, from = 0.0001, rise = 0, ...rest }: { t: MutableRefObject<number>; at: number; children: React.ReactNode; from?: number; rise?: number; position?: [number, number, number]; rotation?: [number, number, number] }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const k = easeOutBack(clamp01((t.current - at) / 0.6), 1.5);
    ref.current.scale.setScalar(Math.max(from, k));
    ref.current.visible = k > 0.01;
    if (rise) ref.current.position.y = (rest.position?.[1] ?? 0) + (1 - clamp01((t.current - at) / 0.6)) * -rise;
  });
  return (
    <group ref={ref} {...rest} visible={false}>
      {children}
    </group>
  );
}

function Cap({ i, origin, t }: { i: number; origin: Vector3; t: MutableRefObject<number> }) {
  const ref = useRef<Group>(null);
  const r = useMemo(() => rng(`cap${i}`), [i]);
  const v = useMemo(() => new Vector3(r.range(-0.5, 0.5), r.range(2.6, 3.4), r.range(-0.5, 0.5)), [r]);
  const spin = useMemo(() => r.range(4, 9), [r]);
  useFrame(() => {
    if (!ref.current) return;
    const k = Math.max(0, t.current - 0.9 - i * 0.05);
    const y = Math.max(0.03, origin.y + 0.35 + v.y * k - 2.6 * k * k);
    ref.current.position.set(origin.x + v.x * k + (i - 2) * 0.12, y, origin.z + v.z * k);
    ref.current.rotation.set(spin * k, spin * 0.7 * k, 0);
    ref.current.visible = t.current > 0.85;
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={BOX} material={MATS.ink} scale={[0.2, 0.018, 0.2]} castShadow />
      <mesh geometry={CYL} material={MATS.ink} position={[0, -0.035, 0]} scale={[0.12, 0.065, 0.12]} />
      <mesh geometry={BOX} material={solid(SWATCH.butter)} position={[0.04, -0.03, 0.04]} scale={[0.008, 0.06, 0.008]} />
    </group>
  );
}

function Key({ t, at }: { t: MutableRefObject<number>; at: Vector3 }) {
  const ref = useRef<Group>(null);
  const torus = useMemo(() => new TorusGeometry(0.06, 0.018, 8, 20), []);
  useFrame(() => {
    if (!ref.current) return;
    const k = clamp01((t.current - 0.6) / 0.8);
    ref.current.position.set(at.x, at.y + 0.2 + easeOutCubic(k) * 0.45 + Math.sin(t.current * 2) * 0.03, at.z);
    ref.current.rotation.y = t.current * 3.2;
    ref.current.scale.setScalar(Math.max(0.0001, easeOutBack(k)) * (t.current > 3.3 ? clamp01(1 - (t.current - 3.3) / 0.5) : 1) + 0.0001);
  });
  return (
    <group ref={ref}>
      <mesh geometry={torus} material={GOLD} position={[0, 0.07, 0]} castShadow />
      <mesh geometry={BOX} material={GOLD} position={[0, -0.06, 0]} scale={[0.024, 0.2, 0.02]} />
      <mesh geometry={BOX} material={GOLD} position={[0.025, -0.13, 0]} scale={[0.035, 0.022, 0.02]} />
      <mesh geometry={BOX} material={GOLD} position={[0.022, -0.09, 0]} scale={[0.028, 0.02, 0.02]} />
      <PracticalLight color="#FFD27A" intensity={1.2} distance={1.5} />
    </group>
  );
}

function Beam({ t, at, height = 2.2, radius = 0.32, start = 0.5, color = "#FFE3A3" }: { t: MutableRefObject<number>; at: Vector3; height?: number; radius?: number; start?: number; color?: string }) {
  const ref = useRef<Group>(null);
  const mat = useMemo(() => {
    const m = GLOW.clone();
    m.color.set(color);
    return m;
  }, [color]);
  useFrame(() => {
    if (!ref.current) return;
    const k = clamp01((t.current - start) / 0.6) * clamp01(1 - (t.current - 3.6) / 0.6);
    mat.opacity = 0.32 * k;
    ref.current.visible = k > 0.01;
  });
  return (
    <group ref={ref} position={[at.x, at.y + height / 2, at.z]} visible={false}>
      <mesh geometry={CONE} material={mat} scale={[radius * 2, height, radius * 2]} rotation-x={Math.PI} renderOrder={6} />
    </group>
  );
}

function Rocket({ t, at }: { t: MutableRefObject<number>; at: Vector3 }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const k = clamp01((t.current - 0.8) / 2.4);
    ref.current.position.set(at.x + Math.sin(k * 3) * 0.2, at.y + 0.3 + easeInOutCubic(k) * 3.2, at.z);
    ref.current.rotation.z = Math.cos(k * 3) * 0.2;
    ref.current.visible = t.current > 0.6 && k < 1;
  });
  return (
    <group ref={ref} visible={false}>
      <mesh geometry={CYL} material={MATS.white} scale={[0.06, 0.16, 0.06]} castShadow />
      <mesh geometry={new ConeGeometry(0.03, 0.08, 12)} material={solid(SWATCH.coral)} position={[0, 0.12, 0]} />
      <mesh geometry={SPH} material={MATS.lamp} position={[0, -0.1, 0]} scale={[0.05, 0.08, 0.05]} />
      <PracticalLight color="#FFB774" intensity={0.8} distance={1.2} position={[0, -0.12, 0]} />
    </group>
  );
}

function PaperPlane({ t, from }: { t: MutableRefObject<number>; from: Vector3 }) {
  const ref = useRef<Group>(null);
  const trail = useRef<InstancedMesh>(null);
  const o = useMemo(() => new Object3D(), []);
  const geo = useMemo(() => {
    const g = new ConeGeometry(0.08, 0.26, 3);
    g.rotateX(Math.PI / 2);
    g.scale(1, 0.25, 1);
    return g;
  }, []);
  const path = (k: number, out: Vector3) => out.set(from.x - 1.5 + k * 7.5, from.y + 0.8 + Math.sin(k * Math.PI) * 2.2, from.z + 1.5 - k * 7.0);
  const p = useMemo(() => new Vector3(), []);
  const q = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const k = clamp01((t.current - 0.7) / 3.2);
    path(k, p);
    path(Math.min(1, k + 0.01), q);
    if (ref.current) {
      ref.current.position.copy(p);
      ref.current.lookAt(q);
      ref.current.visible = k > 0 && k < 1;
    }
    const m = trail.current;
    if (m) {
      for (let i = 0; i < 40; i++) {
        const kk = k - i * 0.012;
        if (kk <= 0 || i % 2) o.scale.setScalar(0.0001);
        else {
          path(kk, o.position);
          o.scale.setScalar(0.018 * (1 - i / 40));
        }
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={ref} visible={false}>
        <mesh geometry={geo} material={MATS.white} castShadow />
      </group>
      <instancedMesh ref={trail} args={[SPH, MATS.white, 40]} frustumCulled={false} />
    </>
  );
}

function Arch({ at }: { at: Vector3 }) {
  const torus = useMemo(() => new TorusGeometry(0.42, 0.03, 8, 24, Math.PI), []);
  const r = rng("arch");
  const flowers = Array.from({ length: 18 }, (_, i) => {
    const a = (i / 17) * Math.PI;
    return { p: [Math.cos(a) * 0.42, Math.sin(a) * 0.42, r.range(-0.03, 0.03)] as [number, number, number], c: r.pick(["#F4B6C2", "#FBF8F1", "#EE8E7A", "#F2C66D"]) };
  });
  return (
    <group position={[at.x - 0.15, at.y, at.z - 0.15]} rotation-y={Math.PI / 4}>
      <mesh geometry={torus} material={MATS.white} castShadow />
      {flowers.map((f, i) => (
        <mesh key={i} geometry={SPH} material={solid(f.c)} position={f.p} scale={0.07} />
      ))}
    </group>
  );
}

function Trophy() {
  return (
    <group>
      <mesh geometry={CYL} material={GOLD} position={[0, 0.02, 0]} scale={[0.1, 0.04, 0.1]} />
      <mesh geometry={CYL} material={GOLD} position={[0, 0.08, 0]} scale={[0.025, 0.1, 0.025]} />
      <mesh geometry={SPH} material={GOLD} position={[0, 0.17, 0]} scale={[0.14, 0.12, 0.14]} />
      <PracticalLight color="#FFD27A" intensity={0.9} distance={1.3} position={[0, 0.25, 0]} />
    </group>
  );
}

interface DirectorProps {
  moment: Moment;
  token: number;
  layout: Layout;
  self: SelfTracker;
  rig: MutableRefObject<RigState>;
  memory: MutableRefObject<number>;
  glowBoost: MutableRefObject<number>;
  onDone: () => void;
}

/** Plays one moment; parent re-keys it by token. */
export function MomentDirector({ moment, layout, self, rig, memory, glowBoost, onDone }: DirectorProps) {
  const { time, reduced } = useMotion();
  const t0 = useRef(time());
  const t = useRef(0);
  const done = useRef(false);
  const dur = MOMENT_DURATION[moment];
  const origin = useMemo(() => self.pos.clone(), [self]);
  const door = useMemo(() => new Vector3(layout.hero.pos[0] + layout.hero.w * 0.28, 0.5, layout.hero.pos[2] + layout.hero.d / 2 + 0.1), [layout]);
  const stage = useMemo(() => new Vector3(layout.stage[0], 0, layout.stage[2]), [layout]);
  useEffect(() => {
    self.override = SELF_POSE[moment] ?? null;
    return () => {
      self.override = null;
      rig.current.push = 0;
      memory.current = 0;
      glowBoost.current = 0;
    };
  }, [moment, self, rig, memory, glowBoost]);
  useEffect(() => {
    if (!reduced) return;
    const id = window.setTimeout(() => {
      if (done.current) return;
      done.current = true;
      self.override = null;
      onDone();
    }, 2600);
    return () => window.clearTimeout(id);
  }, [reduced, onDone, self]);
  useFrame(() => {
    markShadows();
    // dev: window.__momentT freezes the beat at a time (for screenshots)
    const dbg = import.meta.env.DEV ? (window as unknown as { __momentT?: number }).__momentT : undefined;
    t.current = dbg ?? (reduced ? 2.2 : time() - t0.current);
    const k = t.current;
    const R = rig.current;
    if (!reduced) {
      const pin = easeInOutCubic(clamp01(k / 0.8));
      const pout = easeInOutCubic(clamp01((k - (dur - 0.9)) / 0.9));
      R.push = Math.max(0, pin - pout);
      R.pushTarget.copy(moment === "house_keys" || moment === "moving_in" ? door : self.pos).setY(0.35);
    }
    if (moment === "layoff" || moment === "breakup") memory.current = 0.55 * Math.sin(Math.PI * clamp01(k / dur));
    if (moment === "house_keys") glowBoost.current = k > 2.0 ? clamp01((k - 2.0) / 0.4) * clamp01(1 - (k - 3.8) / 0.6) : 0;
    if (moment === "moving_in") glowBoost.current = k > 1.8 ? clamp01((k - 1.8) / 0.6) * clamp01(1 - (k - 3.6) / 0.6) * 0.7 : 0;
    if (k >= dur && !done.current && dbg === undefined) {
      done.current = true;
      self.override = null;
      onDone();
    }
  });

  const at = origin;
  switch (moment) {
    case "graduation":
      return (
        <>
          {[0, 1, 2, 3, 4].map((i) => <Cap key={i} i={i} origin={at} t={t} />)}
          <Burst origin={new Vector3(at.x, at.y + 0.5, at.z)} t={t} start={1.0} />
          <Motes origin={at} t={t} />
        </>
      );
    case "new_job":
      return (
        <>
          <Beam t={t} at={at} height={1.6} radius={0.22} />
          <Motes origin={at} t={t} count={30} />
          <Appear t={t} at={0.7} position={[at.x + 0.35, 0, at.z - 0.25]}>
            <mesh geometry={BOX} material={MATS.wood} position={[0, 0.15, 0]} scale={[0.02, 0.3, 0.02]} />
            <mesh geometry={BOX} material={solid(SWATCH.butter)} position={[0, 0.32, 0]} scale={[0.24, 0.14, 0.02]} castShadow />
          </Appear>
        </>
      );
    case "promotion":
      return (
        <>
          {[0, 1, 2].map((i) => (
            <Appear key={i} t={t} at={0.5 + i * 0.25} position={[at.x + 0.35 - i * 0.18, 0, at.z + 0.35 - i * 0.18]}>
              <mesh geometry={BOX} material={MATS.lamp} position={[0, 0.02 + i * 0.05, 0]} scale={[0.22, 0.04 + i * 0.1, 0.22]} />
            </Appear>
          ))}
          <Motes origin={at} t={t} count={50} radius={0.6} />
          <Burst origin={new Vector3(at.x, 0.8, at.z)} t={t} start={2.0} count={60} up={1.4} />
        </>
      );
    case "layoff":
      return (
        <Appear t={t} at={0.4} position={[at.x + 0.18, 0, at.z + 0.12]}>
          <mesh geometry={BOX} material={solid("#C9A27A")} position={[0, 0.06, 0]} scale={[0.16, 0.12, 0.12]} castShadow />
          <mesh geometry={SPH} material={MATS.foliage} position={[0.03, 0.15, 0]} scale={[0.07, 0.1, 0.07]} />
          <mesh geometry={BOX} material={MATS.white} position={[-0.04, 0.13, 0.01]} scale={[0.05, 0.06, 0.004]} />
        </Appear>
      );
    case "wedding":
      return (
        <>
          <Arch at={at} />
          <Burst origin={new Vector3(at.x, 1.4, at.z)} t={t} start={0.8} count={120} colors={["#F4B6C2", "#FBF8F1", "#F7D6DC"]} up={0.3} spread={1.2} gravity={0.9} shape="petal" />
          <Motes origin={at} t={t} count={36} />
        </>
      );
    case "new_baby":
      return (
        <>
          <Motes origin={at} t={t} count={60} radius={0.7} color="#FFF0D0" />
          <Beam t={t} at={at} height={1.2} radius={0.35} color="#FFF0D0" />
        </>
      );
    case "moving_in":
      return (
        <>
          {[0, 1, 2, 3].map((i) => (
            <Appear key={i} t={t} at={0.4 + i * 0.18} position={[door.x + 0.2 + (i % 2) * 0.15, (i > 1 ? 0.1 : 0), door.z + 0.25 + (i % 2) * 0.08]}>
              <mesh geometry={BOX} material={solid("#C9A27A")} position={[0, 0.05, 0]} scale={[0.14, 0.1, 0.12]} rotation-y={i * 0.4} castShadow />
            </Appear>
          ))}
          <Motes origin={door} t={t} start={1.8} count={30} />
        </>
      );
    case "house_keys":
      return (
        <>
          <Key t={t} at={door} />
          <Motes origin={door} t={t} start={2.0} count={50} radius={0.8} />
        </>
      );
    case "first_show":
      return (
        <>
          <Beam t={t} at={at} height={1.4} radius={0.4} color="#FFF4DA" />
          <Motes origin={at} t={t} count={30} />
        </>
      );
    case "launch":
      return (
        <>
          <Rocket t={t} at={at} />
          <Burst origin={new Vector3(at.x, 0.6, at.z)} t={t} start={1.4} count={90} up={2.0} />
        </>
      );
    case "travel_abroad":
      return (
        <>
          <PaperPlane t={t} from={at} />
          <Appear t={t} at={0.3} position={[at.x + 0.22, 0, at.z + 0.06]}>
            <mesh geometry={BOX} material={solid(SWATCH.coral)} position={[0, 0.1, 0]} scale={[0.14, 0.18, 0.08]} castShadow />
            <mesh geometry={BOX} material={MATS.ink} position={[0, 0.21, 0]} scale={[0.05, 0.04, 0.01]} />
          </Appear>
        </>
      );
    case "breakup":
      return <Motes origin={at} t={t} count={24} color="#B9C7D3" radius={0.6} />;
    case "reunion":
      return <Motes origin={at} t={t} count={50} radius={0.7} />;
    case "caregiving_start":
      return (
        <>
          <Motes origin={at} t={t} count={30} color="#FFE8C0" />
          <Appear t={t} at={0.6} position={[at.x - 0.25, 0, at.z - 0.2]}>
            <PracticalLight color="#FFC98A" intensity={1.4} distance={1.6} position={[0, 0.5, 0]} />
          </Appear>
        </>
      );
    case "retirement":
      return (
        <>
          <Appear t={t} at={0.5} position={[stage.x, 0, stage.z]}>
            <mesh geometry={CYL} material={MATS.white} position={[0, 0.06, 0]} scale={[0.14, 0.08, 0.14]} castShadow />
            <mesh geometry={CYL} material={solid(SWATCH.coral)} position={[0, 0.11, 0]} scale={[0.1, 0.04, 0.1]} />
          </Appear>
          <Burst origin={new Vector3(at.x, 0.8, at.z)} t={t} start={1.2} count={100} up={1.8} />
          <Motes origin={at} t={t} count={40} />
        </>
      );
    case "award":
      return (
        <>
          <Beam t={t} at={at} height={2.0} radius={0.25} />
          <Appear t={t} at={0.9} position={[at.x + 0.25, 0.42, at.z + 0.1]} rise={0.3}>
            <Trophy />
          </Appear>
          <Burst origin={new Vector3(at.x, 0.9, at.z)} t={t} start={1.6} count={110} />
        </>
      );
  }
}
