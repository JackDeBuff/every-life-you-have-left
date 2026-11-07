/**
 * The branch's signature landmark in an interlude cut (src/world/landmarks.ts): a simple procedural
 * silhouette, readable from across the room, in our palette plus the branch's accent. Things that
 * move (a wheel, sails, a beam, a gondola, a balloon) keep the cut alive; reduced motion holds still.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  type Group,
  type Material,
} from "three";
import type { LandmarkSpec } from "../landmarks";
import { MATS, solid } from "../materials";
import { Pop, useMotion } from "./anim";

const BOX = new BoxGeometry(1, 1, 1);
BOX.translate(0, 0.5, 0);
const BOXC = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 16);
CYL.translate(0, 0.5, 0);
const CYL8 = new CylinderGeometry(0.5, 0.5, 1, 8);
CYL8.translate(0, 0.5, 0);
const SPH = new SphereGeometry(0.5, 18, 14);
const CONE4 = new CylinderGeometry(0, 0.5, 1, 4);
CONE4.translate(0, 0.5, 0);
const CONE = new CylinderGeometry(0, 0.5, 1, 16);
CONE.translate(0, 0.5, 0);
const RING = new TorusGeometry(1.5, 0.045, 6, 56);
const SHELL = new SphereGeometry(1, 18, 10, 0, Math.PI, 0, Math.PI / 2);

/** Geometry made once per shape (render bodies ask for the same few sizes again and again). */
const GEO = new Map<string, CylinderGeometry | TorusGeometry>();
const cyl = (rt: number, rb: number, h: number, seg: number, open = false) => {
  const k = `c${rt},${rb},${h},${seg},${open}`;
  let g = GEO.get(k) as CylinderGeometry | undefined;
  if (!g) GEO.set(k, (g = new CylinderGeometry(rt, rb, h, seg, 1, open)));
  return g;
};
const torus = (r: number, t: number, rs: number, ts: number, arc = Math.PI * 2) => {
  const k = `t${r},${t},${rs},${ts},${arc}`;
  let g = GEO.get(k) as TorusGeometry | undefined;
  if (!g) GEO.set(k, (g = new TorusGeometry(r, t, rs, ts, arc)));
  return g;
};

const STONE = "#D9CFBE";
const INKY = "#3E4652";
const STEEL = "#7E8794";

const glowCache = new Map<string, MeshStandardMaterial>();
/** The accent, lit a little from inside so it reads at night and through the interlude grade. */
function glow(hex: string, k = 0.35): MeshStandardMaterial {
  const key = `${hex}|${k}`;
  let m = glowCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ color: hex, roughness: 0.7, emissive: new Color(hex), emissiveIntensity: k });
    glowCache.set(key, m);
  }
  return m;
}
const beamCache = new Map<string, MeshBasicMaterial>();
function beam(hex: string): MeshBasicMaterial {
  let m = beamCache.get(hex);
  if (!m) {
    m = new MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.28, depthWrite: false, side: DoubleSide });
    beamCache.set(hex, m);
  }
  return m;
}
const stripeCache = new Map<string, MeshStandardMaterial>();
function stripes(a: string, b: string): MeshStandardMaterial {
  const key = `${a}${b}`;
  let m = stripeCache.get(key);
  if (!m) {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 8;
    const ctx = c.getContext("2d")!;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? b : a;
      ctx.fillRect(i * 16, 0, 16, 8);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    m = new MeshStandardMaterial({ map: t, roughness: 0.8, emissive: new Color(a), emissiveIntensity: 0.12 });
    stripeCache.set(key, m);
  }
  return m;
}

type V = [number, number, number];
function B({ p, s, m, r }: { p: V; s: V; m: Material; r?: V }) {
  return <mesh geometry={BOX} material={m} position={p} scale={s} rotation={r} castShadow receiveShadow />;
}
function C({ p, s, m, g = CYL }: { p: V; s: V; m: Material; g?: CylinderGeometry }) {
  return <mesh geometry={g} material={m} position={p} scale={s} castShadow receiveShadow />;
}

/** Spins a group about one local axis (seconds per turn). */
function useSpin(axis: "x" | "y" | "z", period: number, phase = 0) {
  const ref = useRef<Group>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    if (!ref.current || reduced) return;
    ref.current.rotation[axis] = phase + (time() / period) * Math.PI * 2;
  });
  return ref;
}

function Lighthouse({ a, sea }: { a: string; sea: boolean }) {
  const lamp = useSpin("y", 4.5);
  return (
    <group>
      {sea && <mesh geometry={SPH} material={MATS.rock} position={[0, -0.12, 0]} scale={[1.7, 0.7, 1.4]} castShadow receiveShadow />}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} geometry={cyl(0.33 - (i + 1) * 0.035, 0.33 - i * 0.035, 0.62, 18)} material={i % 2 ? MATS.white : glow(a, 0.18)} position={[0, 0.48 + i * 0.62, 0]} castShadow receiveShadow />
      ))}
      <C p={[0, 2.7, 0]} s={[0.46, 0.06, 0.46]} m={solid(INKY)} />
      <C p={[0, 2.76, 0]} s={[0.26, 0.34, 0.26]} m={MATS.lamp} />
      <C p={[0, 3.1, 0]} s={[0.4, 0.34, 0.4]} m={solid(INKY)} g={CONE as CylinderGeometry} />
      <group ref={lamp} position={[0, 2.93, 0]}>
        <mesh geometry={BOXC} material={beam("#FFE6A8")} position={[1.3, 0, 0]} scale={[2.6, 0.16, 0.02]} />
      </group>
    </group>
  );
}

function BigTree({ a }: { a: string }) {
  const swing = useRef<Group>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    if (swing.current && !reduced) swing.current.rotation.x = Math.sin(time() * 1.4) * 0.28;
  });
  return (
    <group>
      <mesh geometry={cyl(0.2, 0.42, 2.0, 10)} material={MATS.bark} position={[0, 1.0, 0]} castShadow />
      <mesh geometry={BOXC} material={MATS.bark} position={[0.42, 1.75, 0.1]} rotation-z={-0.9} scale={[0.14, 0.9, 0.14]} castShadow />
      {(
        [
          [0, 2.6, 0, 1.55],
          [0.9, 2.25, 0.35, 1.1],
          [-0.8, 2.35, -0.2, 1.15],
          [0.15, 3.25, -0.25, 1.1],
          [-0.2, 2.2, 0.8, 1.0],
        ] as [number, number, number, number][]
      ).map(([x, y, z, r], i) => (
        <mesh key={i} geometry={SPH} material={i % 2 ? MATS.foliageDark : MATS.foliage} position={[x, y, z]} scale={[r * 1.6, r * 1.25, r * 1.6]} castShadow receiveShadow />
      ))}
      {/* lanterns strung through the canopy, in the branch's colour */}
      {(
        [
          [1.35, 1.75, 0.9],
          [-1.25, 1.85, 0.75],
          [0.2, 1.7, 1.55],
          [1.6, 2.4, -0.4],
          [-0.9, 2.55, 1.2],
        ] as V[]
      ).map((p, i) => (
        <group key={`l${i}`} position={p}>
          <B p={[0, 0.12, 0]} s={[0.01, 0.2, 0.01]} m={solid(INKY)} />
          <mesh geometry={SPH} material={glow(a, 0.9)} scale={0.17} />
        </group>
      ))}
      {/* a swing on the low branch, in the branch's colour */}
      <group ref={swing} position={[0.85, 2.0, 0.1]}>
        <B p={[-0.14, -1.45, 0]} s={[0.012, 1.45, 0.012]} m={solid(INKY)} />
        <B p={[0.14, -1.45, 0]} s={[0.012, 1.45, 0.012]} m={solid(INKY)} />
        <B p={[0, -1.5, 0]} s={[0.36, 0.05, 0.16]} m={glow(a)} />
      </group>
    </group>
  );
}

function FerrisWheel({ a }: { a: string }) {
  const wheel = useSpin("z", 26);
  const cabins = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);
  const ref = useRef<Group>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    // cabins hang level while the wheel turns
    if (!ref.current || reduced) return;
    const w = (time() / 26) * Math.PI * 2;
    ref.current.children.forEach((c) => (c.rotation.z = -w));
  });
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => <B key={`${sx}${sz}`} p={[sx * 0.62, 0, sz * 0.42]} s={[0.07, 2.25, 0.07]} r={[sz * -0.16, 0, sx * 0.27]} m={solid(STEEL, 0.6)} />),
      )}
      <group position={[0, 2.15, 0]}>
        <group ref={wheel}>
          <mesh geometry={RING} material={MATS.white} castShadow />
          <mesh geometry={RING} material={MATS.white} scale={0.62} />
          {cabins.map((t, i) => (
            <mesh key={i} geometry={BOXC} material={MATS.white} rotation-z={t} position={[Math.cos(t) * 0.75, Math.sin(t) * 0.75, 0]} scale={[1.5, 0.025, 0.025]} />
          ))}
          <group ref={ref}>
            {cabins.map((t, i) => (
              <group key={i} position={[Math.cos(t) * 1.5, Math.sin(t) * 1.5, 0]}>
                <mesh geometry={BOXC} material={i % 2 ? glow(a) : MATS.white} position={[0, -0.16, 0]} scale={[0.2, 0.2, 0.26]} castShadow />
              </group>
            ))}
          </group>
        </group>
        <mesh geometry={CYL} material={solid(INKY)} rotation-x={Math.PI / 2} position={[0, 0, -0.5]} scale={[0.16, 1, 0.16]} />
      </group>
    </group>
  );
}

function WaterTower({ a }: { a: string }) {
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <B key={i} p={[x! * 0.62, 0, z! * 0.62]} s={[0.07, 2.25, 0.07]} r={[-z! * 0.09, 0, x! * 0.09]} m={solid(STEEL, 0.6)} />
      ))}
      <C p={[0, 0.9, 0]} s={[1.0, 0.05, 1.0]} m={solid(STEEL, 0.6)} g={CYL8} />
      <C p={[0, 2.2, 0]} s={[1.5, 0.95, 1.5]} m={MATS.white} />
      <C p={[0, 2.5, 0]} s={[1.52, 0.3, 1.52]} m={glow(a, 0.25)} />
      <C p={[0, 3.15, 0]} s={[1.6, 0.55, 1.6]} m={solid(INKY)} g={CONE as CylinderGeometry} />
      <mesh geometry={SPH} material={glow(a)} position={[0, 3.75, 0]} scale={0.14} />
    </group>
  );
}

function Windmill({ a }: { a: string }) {
  const blades = useSpin("z", 7);
  return (
    <group>
      <mesh geometry={cyl(0.42, 0.68, 2.5, 8)} material={solid("#F4EBDD")} position={[0, 1.25, 0]} castShadow receiveShadow />
      <B p={[0, 0, 0.6]} s={[0.3, 0.5, 0.12]} m={glow(a)} />
      <C p={[0, 2.5, 0]} s={[1.0, 0.65, 1.0]} m={solid(INKY)} g={CONE as CylinderGeometry} />
      <group position={[0, 2.6, 0.55]}>
        <group ref={blades}>
          {[0, 1, 2, 3].map((i) => (
            <group key={i} rotation-z={(i * Math.PI) / 2}>
              <mesh geometry={BOXC} material={MATS.woodDark} position={[0, 0.85, 0]} scale={[0.05, 1.7, 0.04]} castShadow />
              <mesh geometry={BOXC} material={i % 2 ? MATS.white : glow(a, 0.2)} position={[0.15, 0.95, 0]} scale={[0.26, 1.3, 0.02]} castShadow />
            </group>
          ))}
          <mesh geometry={SPH} material={solid(INKY)} scale={0.16} />
        </group>
      </group>
    </group>
  );
}

function Canal({ a }: { a: string }) {
  const boat = useRef<Group>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    if (!boat.current || reduced) return;
    const t = time();
    boat.current.position.x = 1.6 + Math.sin(t * 0.25) * 1.2;
    boat.current.position.y = Math.sin(t * 1.3) * 0.012;
  });
  return (
    <group>
      <B p={[0, -0.01, 0]} s={[9.2, 0.045, 1.1]} m={MATS.water} />
      {[-0.6, 0.6].map((z) => (
        <B key={z} p={[0, 0, z]} s={[9.2, 0.1, 0.14]} m={solid(STONE)} />
      ))}
      {/* an arched brick bridge where the side street crosses */}
      <group position={[-2.1, 0, 0]}>
        <mesh geometry={torus(0.62, 0.16, 8, 20, Math.PI)} material={solid("#B5654A")} rotation-y={Math.PI / 2} scale={[1, 0.55, 1]} castShadow />
        <B p={[0, 0.34, 0]} s={[1.1, 0.06, 1.5]} m={solid("#B5654A")} />
        {[-0.5, 0.5].map((x) => (
          <B key={x} p={[x, 0.4, 0]} s={[0.05, 0.16, 1.5]} m={glow(a, 0.2)} />
        ))}
      </group>
      <group ref={boat} position={[1.6, 0, 0]}>
        <B p={[0, 0, 0]} s={[1.2, 0.16, 0.36]} m={glow(a, 0.15)} />
        <B p={[0.1, 0.16, 0]} s={[0.6, 0.18, 0.28]} m={MATS.white} />
        <B p={[0.1, 0.34, 0]} s={[0.66, 0.03, 0.32]} m={solid(INKY)} />
      </group>
      {/* bikes on the quay */}
      {[-3.6, -3.2, 3.4].map((x, i) => (
        <group key={x} position={[x, 0.05, -0.82]} rotation-y={i * 0.2}>
          <mesh geometry={torus(0.08, 0.012, 4, 14)} material={solid(INKY)} position={[-0.1, 0.09, 0]} />
          <mesh geometry={torus(0.08, 0.012, 4, 14)} material={solid(INKY)} position={[0.1, 0.09, 0]} />
          <B p={[0, 0.1, 0]} s={[0.2, 0.02, 0.015]} m={i === 1 ? glow(a) : solid(INKY)} />
        </group>
      ))}
    </group>
  );
}

function CableCar({ a, from }: { a: string; from: V }) {
  // From the pylon top on the back-left corner, down along the back of the island and off its edge.
  const A: V = [0, 3.7, 0];
  const Bp: V = [7.6 - from[0], 2.0, -4.3 - from[2]];
  const dx = Bp[0] - A[0];
  const dy = Bp[1] - A[1];
  const dz = Bp[2] - A[2];
  const len = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(-dz, dx);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const g1 = useRef<Group>(null);
  const g2 = useRef<Group>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    const t = reduced ? 0.3 : time() / 14;
    [g1, g2].forEach((g, i) => {
      if (!g.current) return;
      const k = (((t + i * 0.5) % 1) + 1) % 1;
      const u = 0.12 + k * 0.7;
      g.current.position.set(A[0] + dx * u, A[1] + dy * u - 0.42, A[2] + dz * u);
    });
  });
  return (
    <group>
      <B p={[0, 0, 0]} s={[0.22, 3.7, 0.22]} m={solid(STEEL, 0.6)} />
      <B p={[0, 3.62, 0]} s={[0.8, 0.12, 0.18]} m={solid(STEEL, 0.6)} />
      <group position={A} rotation={[0, yaw, pitch]}>
        <mesh geometry={BOXC} material={solid(INKY)} position={[len / 2, 0, 0]} scale={[len, 0.022, 0.022]} />
      </group>
      {[g1, g2].map((g, i) => (
        <group key={i} ref={g}>
          <B p={[0, 0.16, 0]} s={[0.02, 0.28, 0.02]} m={solid(INKY)} />
          <mesh geometry={BOXC} material={i === 0 ? glow(a) : MATS.white} scale={[0.42, 0.32, 0.3]} castShadow />
          <mesh geometry={BOXC} material={MATS.glass} position={[0, 0.04, 0]} scale={[0.44, 0.12, 0.31]} />
        </group>
      ))}
    </group>
  );
}

function MarinaTowers({ a }: { a: string }) {
  // one face is window glass, so the towers light up at night like the rest of the city
  const glass = MATS.glass;
  return (
    <group>
      {[-1.05, 0, 1.05].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <B p={[-0.13, 0, 0]} s={[0.24, 3.2 - i * 0.05, 0.7]} r={[0, 0, 0.03]} m={glass} />
          <B p={[0.13, 0, 0]} s={[0.24, 3.2 - i * 0.05, 0.7]} r={[0, 0, -0.03]} m={solid("#E6EEF1", 0.4)} />
        </group>
      ))}
      {/* the deck across the top, like a boat */}
      <mesh geometry={SPH} material={solid("#E9ECEC", 0.5)} position={[0.25, 3.28, 0]} scale={[3.9, 0.2, 0.62]} castShadow />
      <mesh geometry={SPH} material={MATS.foliage} position={[0.25, 3.36, 0]} scale={[3.3, 0.06, 0.4]} />
      <B p={[0.25, 3.18, 0.3]} s={[3.4, 0.03, 0.02]} m={glow(a, 0.8)} />
    </group>
  );
}

function Supertrees({ a }: { a: string }) {
  const trunk = solid("#5A6270", 0.8);
  const trees: [number, number, number, number][] = [
    [-0.9, -0.3, 3.3, 0.85],
    [0.35, -0.7, 2.6, 0.7],
    [0.9, 0.6, 2.1, 0.62],
    [-0.4, 0.8, 1.8, 0.55],
  ];
  return (
    <group>
      {trees.map(([x, z, h, r], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh geometry={cyl(r, 0.13, h, 12, true)} material={trunk} position={[0, h / 2, 0]} castShadow />
          <mesh geometry={cyl(r * 0.35, 0.1, h * 0.9, 8)} material={MATS.foliageDark} position={[0, h * 0.45, 0]} />
          <mesh geometry={torus(r, 0.05, 6, 28)} material={glow(a, 0.9)} position={[0, h, 0]} rotation-x={Math.PI / 2} />
          <C p={[0, h - 0.02, 0]} s={[r * 1.9, 0.05, r * 1.9]} m={trunk} />
        </group>
      ))}
      <B p={[-0.25, 2.0, -0.5]} s={[1.4, 0.05, 0.12]} r={[0, 0.3, 0]} m={glow(a, 0.3)} />
    </group>
  );
}

function LatticeTower({ a }: { a: string }) {
  const iron = solid("#8C6A52", 0.7);
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <B key={i} p={[x! * 0.62, 0, z! * 0.62]} s={[0.12, 1.45, 0.12]} r={[z! * -0.32, 0, x! * 0.32]} m={iron} />
      ))}
      <B p={[0, 1.25, 0]} s={[0.95, 0.08, 0.95]} m={glow(a, 0.3)} />
      <mesh geometry={cyl(0.14, 0.42, 1.7, 4)} material={iron} position={[0, 2.18, 0]} rotation-y={Math.PI / 4} castShadow />
      <B p={[0, 3.0, 0]} s={[0.4, 0.06, 0.4]} m={glow(a, 0.3)} />
      <mesh geometry={cyl(0.015, 0.15, 1.4, 4)} material={iron} position={[0, 3.72, 0]} rotation-y={Math.PI / 4} castShadow />
    </group>
  );
}

function ClockTower({ a }: { a: string }) {
  const sand = solid("#D8C49A");
  return (
    <group>
      <B p={[0, 0, 0]} s={[0.78, 2.9, 0.78]} m={sand} />
      {[-0.26, 0, 0.26].map((x) => (
        <B key={x} p={[x, 0.2, 0.395]} s={[0.05, 2.5, 0.02]} m={solid("#BFA97E")} />
      ))}
      <B p={[0, 2.9, 0]} s={[0.9, 0.85, 0.9]} m={sand} />
      {[0, Math.PI / 2].map((r) => (
        <group key={r} rotation-y={r}>
          <mesh geometry={CYL} material={MATS.white} position={[0, 3.32, 0.455]} rotation-x={Math.PI / 2} scale={[0.6, 0.02, 0.6]} />
          <B p={[0, 3.32, 0.47]} s={[0.03, 0.22, 0.01]} m={solid(INKY)} />
          <B p={[0.06, 3.32, 0.47]} s={[0.14, 0.03, 0.01]} m={solid(INKY)} />
        </group>
      ))}
      <mesh geometry={CONE4} material={solid(INKY)} position={[0, 3.75, 0]} rotation-y={Math.PI / 4} scale={[1.15, 1.0, 1.15]} castShadow />
      <mesh geometry={SPH} material={glow(a, 0.5)} position={[0, 4.8, 0]} scale={0.14} />
    </group>
  );
}

function StepSpire({ a }: { a: string }) {
  const stone = solid("#CFC8BA", 0.7);
  const tiers: [number, number, number][] = [
    [1.15, 0, 2.3],
    [0.85, 2.3, 0.75],
    [0.6, 3.05, 0.5],
    [0.38, 3.55, 0.35],
  ];
  return (
    <group>
      {tiers.map(([w, y, h], i) => (
        <group key={i}>
          <B p={[0, y, 0]} s={[w, h, w]} m={stone} />
          <B p={[0, y + h - 0.03, 0]} s={[w + 0.03, 0.04, w + 0.03]} m={i === 3 ? glow(a, 0.6) : solid("#B9B2A4")} />
          {i === 0 && [-0.3, 0, 0.3].map((x) => <B key={x} p={[x, 0.1, w / 2 + 0.005]} s={[0.12, h - 0.2, 0.01]} m={MATS.glass} />)}
        </group>
      ))}
      <mesh geometry={cyl(0.02, 0.09, 0.9, 6)} material={solid(STEEL)} position={[0, 4.35, 0]} castShadow />
    </group>
  );
}

function Needle({ a }: { a: string }) {
  return (
    <group>
      {[0, 1, 2].map((i) => (
        <B key={i} p={[Math.cos((i * 2 * Math.PI) / 3) * 0.32, 0, Math.sin((i * 2 * Math.PI) / 3) * 0.32]} s={[0.07, 3.3, 0.07]} r={[Math.sin((i * 2 * Math.PI) / 3) * -0.09, 0, Math.cos((i * 2 * Math.PI) / 3) * 0.09]} m={MATS.white} />
      ))}
      <C p={[0, 0, 0]} s={[0.16, 3.6, 0.16]} m={MATS.white} />
      <mesh geometry={cyl(0.85, 0.42, 0.32, 28)} material={MATS.white} position={[0, 3.45, 0]} castShadow />
      <mesh geometry={cyl(0.86, 0.86, 0.08, 28)} material={glow(a, 0.6)} position={[0, 3.62, 0]} />
      <mesh geometry={cyl(0.5, 0.75, 0.16, 28)} material={MATS.white} position={[0, 3.74, 0]} castShadow />
      <mesh geometry={cyl(0.015, 0.06, 0.9, 6)} material={solid(STEEL)} position={[0, 4.25, 0]} />
    </group>
  );
}

function Pagoda({ a }: { a: string }) {
  const body = solid("#C8553D");
  const roof = solid(INKY);
  return (
    <group>
      <B p={[0, 0, 0]} s={[1.5, 0.12, 1.5]} m={solid(STONE)} />
      {[0, 1, 2, 3, 4].map((i) => {
        const w = 1.05 - i * 0.15;
        const y = 0.12 + i * 0.66;
        return (
          <group key={i}>
            <B p={[0, y, 0]} s={[w, 0.42, w]} m={body} />
            <B p={[0, y + 0.1, w / 2 + 0.005]} s={[w * 0.4, 0.22, 0.01]} m={glow(a, 0.5)} />
            <mesh geometry={CONE4} material={roof} position={[0, y + 0.4, 0]} rotation-y={Math.PI / 4} scale={[w * 1.9, 0.32, w * 1.9]} castShadow />
          </group>
        );
      })}
      <mesh geometry={cyl(0.015, 0.05, 0.8, 6)} material={glow("#E3B341", 0.4)} position={[0, 3.75, 0]} />
    </group>
  );
}

function Sails({ a }: { a: string }) {
  const shells: [number, number, number, number][] = [
    [-0.9, 1.2, 1.0, 0],
    [-0.15, 1.45, 1.1, 0],
    [0.6, 1.1, 0.9, 0],
    [1.15, 0.8, 0.7, 0],
  ];
  return (
    <group>
      <B p={[0.1, 0, 0]} s={[3.2, 0.32, 1.4]} m={solid("#D8C49A")} />
      <B p={[0.1, 0.32, 0.71]} s={[3.2, 0.02, 0.02]} m={glow(a, 0.6)} />
      {shells.map(([x, h, d], i) => (
        <mesh key={i} geometry={SHELL} material={solid("#F7F4EC", 0.6)} position={[x, 0.32, 0]} rotation={[0, -Math.PI / 2, 0]} scale={[d * 0.55, h, 0.45]} castShadow receiveShadow />
      ))}
    </group>
  );
}

function Bridge({ a }: { a: string }) {
  const red = solid("#C2482F", 0.7);
  const towers = [-2.4, 2.4];
  const cable = (z0: number, z1: number, x: number) => {
    const n = 12;
    return Array.from({ length: n }, (_, i) => {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const y = (t: number) => 3.1 - Math.sin(t * Math.PI) * 1.85;
      const za = z0 + (z1 - z0) * t0;
      const zb = z0 + (z1 - z0) * t1;
      const ya = y(t0);
      const yb = y(t1);
      const len = Math.hypot(zb - za, yb - ya);
      return <mesh key={`${x}${i}`} geometry={BOXC} material={red} position={[x, (ya + yb) / 2, (za + zb) / 2]} rotation-x={-Math.atan2(yb - ya, zb - za)} scale={[0.03, 0.03, len]} />;
    });
  };
  return (
    <group>
      <B p={[0, 0.95, 0]} s={[0.7, 0.1, 10.4]} m={red} />
      <B p={[0.36, 1.05, 0]} s={[0.02, 0.06, 10.4]} m={glow(a, 0.5)} />
      {towers.map((z) => (
        <group key={z} position={[0, 0, z]}>
          {[-0.3, 0.3].map((x) => (
            <B key={x} p={[x, -0.15, 0]} s={[0.12, 3.3, 0.16]} m={red} />
          ))}
          {[1.6, 2.6, 3.05].map((y) => (
            <B key={y} p={[0, y, 0]} s={[0.66, 0.08, 0.14]} m={red} />
          ))}
        </group>
      ))}
      {[-0.3, 0.3].flatMap((x) => [...cable(-5.2, -2.4, x).slice(6), ...cable(-2.4, 2.4, x), ...cable(2.4, 5.2, x).slice(0, 6)])}
    </group>
  );
}

function Balloon({ a }: { a: string }) {
  const ref = useRef<Group>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    if (!ref.current || reduced) return;
    const t = time();
    ref.current.position.y = 3.0 + Math.sin(t * 0.7) * 0.18;
    ref.current.rotation.y = t * 0.15;
  });
  const env = useMemo(() => stripes(a, "#F7F4EC"), [a]);
  return (
    <group ref={ref} position={[0, 3.0, 0]}>
      <mesh geometry={SPH} material={env} scale={[1.5, 1.7, 1.5]} castShadow />
      <mesh geometry={cyl(0.42, 0.18, 0.45, 16)} material={env} position={[0, -0.95, 0]} />
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <B key={i} p={[x! * 0.13, -1.55, z! * 0.13]} s={[0.01, 0.42, 0.01]} m={solid(INKY)} />
      ))}
      <B p={[0, -1.78, 0]} s={[0.34, 0.24, 0.34]} m={MATS.wood} />
    </group>
  );
}

function Body({ l }: { l: LandmarkSpec }) {
  const a = l.accent;
  switch (l.kind) {
    case "lighthouse":
      return <Lighthouse a={a} sea={l.pos[0] < -3 && l.clear[0]!.r < 1.1} />;
    case "bigTree":
      return <BigTree a={a} />;
    case "ferrisWheel":
      return <FerrisWheel a={a} />;
    case "waterTower":
      return <WaterTower a={a} />;
    case "windmill":
      return <Windmill a={a} />;
    case "canal":
      return <Canal a={a} />;
    case "cableCar":
      return <CableCar a={a} from={l.pos} />;
    case "marinaTowers":
      return <MarinaTowers a={a} />;
    case "supertrees":
      return <Supertrees a={a} />;
    case "latticeTower":
      return <LatticeTower a={a} />;
    case "clockTower":
      return <ClockTower a={a} />;
    case "stepSpire":
      return <StepSpire a={a} />;
    case "needle":
      return <Needle a={a} />;
    case "pagoda":
      return <Pagoda a={a} />;
    case "sails":
      return <Sails a={a} />;
    case "bridge":
      return <Bridge a={a} />;
    case "balloon":
      return <Balloon a={a} />;
  }
}

/** Rises in with the island; `t0` is the island's birth time. */
export function Landmark({ spec, t0 }: { spec: LandmarkSpec; t0: number }) {
  // A cable car's cable is laid out in world terms, so it is not turned to face the camera.
  const rot = spec.kind === "cableCar" || spec.kind === "canal" || spec.kind === "bridge" ? 0 : spec.rotY;
  return (
    <Pop state="in" t0={t0} delay={0.1} position={spec.pos} rotationY={rot} rise={0.6} scale={spec.scale}>
      <Body l={spec} />
    </Pop>
  );
}
