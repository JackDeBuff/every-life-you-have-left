/**
 * The hero home: a procedural building in the flavour palette that opens like a dollhouse for
 * indoor years (front walls slide down, the upper floors and roof float up) to show the room.
 */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Shape, type Group, type Material, type PointLight } from "three";
import type { SceneSpec } from "../../../shared/sim";
import type { HeroSpec } from "../layout";
import { MATS, solid } from "../materials";
import { clamp01, easeInOutCubic, Pop, usePresence, useMotion } from "./anim";
import { PieceItem } from "./Pieces";
import { ProcItem } from "./Procs";
import { useLookRef } from "./look";

const BOX = new BoxGeometry(1, 1, 1);
BOX.translate(0, 0.5, 0);
const COL = new CylinderGeometry(0.5, 0.5, 1, 10);
COL.translate(0, 0.5, 0);
const HIP = new CylinderGeometry(0.22, 0.7071, 1, 4, 1);
HIP.rotateY(Math.PI / 4);
HIP.translate(0, 0.5, 0);
const GABLE = (() => {
  const s = new Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
})();

const T = 0.06; // wall thickness

function Box({ p, s, m, cast = true }: { p: [number, number, number]; s: [number, number, number]; m: Material; cast?: boolean }) {
  return <mesh geometry={BOX} material={m} position={p} scale={s} castShadow={cast} receiveShadow />;
}

interface Mats {
  wall: Material;
  wall2: Material;
  roof: Material;
  trim: Material;
  door: Material;
  floor: Material;
  wallIn: Material;
  rug: Material | null;
}

/** Windows along one facade. axis "x": facade normal +-x (runs along z); "z": runs along x. */
function Windows({ len, axis, side, y, h, big, m, count }: { len: number; axis: "x" | "z"; side: number; y: number; h: number; big: boolean; m: Mats; count?: number }) {
  const n = count ?? Math.max(1, Math.floor(len / (big ? 0.55 : 0.62)));
  const ww = big ? (len / n) * 0.72 : 0.2;
  const wh = big ? h * 0.62 : 0.26;
  const out = [] as React.ReactElement[];
  for (let i = 0; i < n; i++) {
    const t = -len / 2 + (len / n) * (i + 0.5);
    const off = side * 0.012;
    if (axis === "z") {
      out.push(
        <group key={i} position={[t, y + h * 0.5 - wh / 2, off]}>
          <Box p={[0, -0.02, 0]} s={[ww + 0.05, wh + 0.04, 0.03]} m={m.trim} cast={false} />
          <Box p={[0, 0, side * 0.008]} s={[ww, wh, 0.025]} m={MATS.glass} cast={false} />
          {big && <Box p={[0, 0, side * 0.02]} s={[0.012, wh, 0.012]} m={m.trim} cast={false} />}
        </group>,
      );
    } else {
      out.push(
        <group key={i} position={[off, y + h * 0.5 - wh / 2, t]}>
          <Box p={[0, -0.02, 0]} s={[0.03, wh + 0.04, ww + 0.05]} m={m.trim} cast={false} />
          <Box p={[side * 0.008, 0, 0]} s={[0.025, wh, ww]} m={MATS.glass} cast={false} />
          {big && <Box p={[side * 0.02, 0, 0]} s={[0.012, wh, 0.012]} m={m.trim} cast={false} />}
        </group>,
      );
    }
  }
  return <>{out}</>;
}

function Building({ hero, cutRef, flavor }: { hero: HeroSpec; cutRef: React.MutableRefObject<number>; flavor: SceneSpec["flavor"] }) {
  const { w, d, floorH: fh, floors } = hero;
  const m: Mats = useMemo(
    () => ({
      wall: solid(hero.wall),
      wall2: solid(hero.wall2),
      roof: solid(hero.roofColor, 0.8),
      trim: solid(hero.trim),
      door: solid(hero.door),
      floor: solid(hero.room.floor, 0.7),
      wallIn: solid(hero.room.wallIn),
      rug: hero.room.rug ? solid(hero.room.rug) : null,
    }),
    [hero.wall, hero.wall2, hero.roofColor, hero.trim, hero.door, hero.room.floor, hero.room.wallIn, hero.room.rug],
  );
  const frontX = useRef<Group>(null);
  const frontZ = useRef<Group>(null);
  const upper = useRef<Group>(null);
  const room = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const look = useLookRef();
  const { time } = useMotion();
  const roomList = usePresence(hero.room.pieces, (p) => p.key, 600, time);
  const roomProcs = usePresence(hero.room.procs, (p) => p.key, 600, time);

  useFrame(() => {
    const c = easeInOutCubic(clamp01(cutRef.current));
    if (frontX.current) {
      frontX.current.position.y = -c * fh * 1.02;
      frontX.current.visible = c < 0.99;
    }
    if (frontZ.current) {
      frontZ.current.position.y = -c * fh * 1.02;
      frontZ.current.visible = c < 0.99;
    }
    if (upper.current) {
      const lift = 2.6 + floors * 0.4;
      upper.current.position.set(-c * 0.5, fh + c * lift, -c * 0.5);
      upper.current.rotation.z = c * 0.04;
      upper.current.visible = c < 0.995;
    }
    if (room.current) room.current.visible = c > 0.02;
    if (light.current) light.current.intensity = c * (0.6 + look.current.windowGlow * 2.2);
  });

  const isOffice = hero.kind === "office";
  const groundWalls = isOffice ? m.wall2 : m.wall;
  const upperFloors = Math.max(0, floors - 1);
  const roofH = hero.roof === "flat" ? 0 : hero.roof === "gable" ? Math.min(0.75, d * 0.38) : Math.min(0.62, d * 0.32);
  const big = hero.bigWindows;

  return (
    <group>
      {/* plinth + floor */}
      <Box p={[0, -0.02, 0]} s={[w + 0.12, 0.06, d + 0.12]} m={m.trim} />
      <Box p={[0, 0.02, 0]} s={[w - T, 0.03, d - T]} m={m.floor} cast={false} />
      {/* back walls (always) */}
      <Box p={[-w / 2 + T / 2, 0, 0]} s={[T, fh, d]} m={groundWalls} />
      <Box p={[0, 0, -d / 2 + T / 2]} s={[w, fh, T]} m={groundWalls} />
      {/* inner panels (seen only in cutaway) */}
      <group ref={room} visible={false}>
        <Box p={[-w / 2 + T + 0.004, 0.05, 0]} s={[0.008, fh - 0.06, d - 2 * T]} m={m.wallIn} cast={false} />
        <Box p={[0, 0.05, -d / 2 + T + 0.004]} s={[w - 2 * T, fh - 0.06, 0.008]} m={m.wallIn} cast={false} />
        <Box p={[-w / 2 + T + 0.01, 0.035, 0]} s={[0.012, 0.05, d - 2 * T]} m={m.trim} cast={false} />
        <Box p={[0, 0.035, -d / 2 + T + 0.01]} s={[w - 2 * T, 0.05, 0.012]} m={m.trim} cast={false} />
        <group position={[-w / 2 + T + 0.01, 0, 0]}>
          <Windows len={d * 0.6} axis="x" side={1} y={0.05} h={fh} big={big} m={m} count={1} />
        </group>
        <group position={[w * 0.18, 0, -d / 2 + T + 0.01]}>
          <Windows len={w * 0.4} axis="z" side={1} y={0.05} h={fh} big={big} m={m} count={1} />
        </group>
        {m.rug && <Box p={[0.15, 0.035, 0.15]} s={[w * 0.45, 0.008, d * 0.42]} m={m.rug} cast={false} />}
        <group position={[0, 0.035, 0]}>
          {roomList.map((pr) => (
            <PieceItem key={pr.key} pr={pr} flavor={flavor} />
          ))}
          {roomProcs.map((pr) => (
            <ProcItem key={pr.key} pr={pr} />
          ))}
        </group>
        <pointLight ref={light} position={[0.1, fh * 0.8, 0.1]} color="#FFD7A0" intensity={0} distance={2.6} decay={1.6} />
      </group>
      {/* back facade windows (outside) */}
      <group position={[-w / 2 - 0.001, 0, 0]}>
        <Windows len={d} axis="x" side={-1} y={0} h={fh} big={big} m={m} />
      </group>
      <group position={[0, 0, -d / 2 - 0.001]}>
        <Windows len={w} axis="z" side={-1} y={0} h={fh} big={big} m={m} />
      </group>
      {/* front walls: slide down for the cutaway */}
      <group ref={frontX}>
        <Box p={[w / 2 - T / 2, 0, 0]} s={[T, fh, d]} m={groundWalls} />
        <group position={[w / 2 + 0.001, 0, 0]}>
          <Windows len={d} axis="x" side={1} y={0} h={fh} big={big} m={m} />
        </group>
      </group>
      <group ref={frontZ}>
        <Box p={[0, 0, d / 2 - T / 2]} s={[w, fh, T]} m={groundWalls} />
        <group position={[-w * 0.22, 0, d / 2 + 0.001]}>
          <Windows len={w * 0.55} axis="z" side={1} y={0} h={fh} big={big} m={m} />
        </group>
        {/* door */}
        <Box p={[w * 0.28, 0.02, d / 2 + 0.005]} s={[0.26, 0.44, 0.03]} m={m.trim} cast={false} />
        <Box p={[w * 0.28, 0.03, d / 2 + 0.018]} s={[0.2, 0.39, 0.02]} m={m.door} cast={false} />
      </group>
      <Box p={[w * 0.28, -0.02, d / 2 + 0.12]} s={[0.36, 0.05, 0.2]} m={m.trim} />

      {hero.porch && (
        <group position={[-w * 0.18, 0, d / 2 + 0.24]}>
          <Box p={[0, -0.01, 0]} s={[w * 0.5, 0.05, 0.46]} m={MATS.wood} />
          {[-1, 1].map((sx) => (
            <mesh key={sx} geometry={COL} material={m.trim} position={[sx * w * 0.23, 0, 0.18]} scale={[0.05, fh, 0.05]} castShadow />
          ))}
          <Box p={[0, fh, 0]} s={[w * 0.54, 0.05, 0.52]} m={m.roof} />
        </group>
      )}
      {hero.arcade && (
        <group position={[0, 0, d / 2 + 0.2]}>
          {[-0.45, -0.15, 0.15, 0.45].map((t) => (
            <mesh key={t} geometry={COL} material={m.trim} position={[t * w, 0, 0.12]} scale={[0.06, fh, 0.06]} castShadow />
          ))}
          <Box p={[0, fh - 0.05, 0]} s={[w + 0.06, 0.06, 0.44]} m={m.trim} />
        </group>
      )}

      {/* upper floors + roof: float up for the cutaway */}
      <group ref={upper} position={[0, fh, 0]}>
        <Box p={[0, -0.02, 0]} s={[w + 0.06, 0.05, d + 0.06]} m={m.trim} />
        {Array.from({ length: upperFloors }, (_, i) => (
          <group key={i} position={[0, i * fh, 0]}>
            <Box p={[0, 0, 0]} s={[w, fh, d]} m={i % 2 === 1 && hero.kind === "shophouse" ? m.wall2 : m.wall} />
            <group position={[w / 2 + 0.001, 0, 0]}>
              <Windows len={d} axis="x" side={1} y={0} h={fh} big={big} m={m} />
            </group>
            <group position={[0, 0, d / 2 + 0.001]}>
              <Windows len={w} axis="z" side={1} y={0} h={fh} big={big} m={m} />
            </group>
            <group position={[-w / 2 - 0.001, 0, 0]}>
              <Windows len={d} axis="x" side={-1} y={0} h={fh} big={big} m={m} />
            </group>
            <group position={[0, 0, -d / 2 - 0.001]}>
              <Windows len={w} axis="z" side={-1} y={0} h={fh} big={big} m={m} />
            </group>
            {hero.balconies && (
              <group position={[w * 0.18, 0.02, d / 2 + 0.1]}>
                <Box p={[0, 0, 0]} s={[w * 0.42, 0.03, 0.2]} m={m.trim} />
                <Box p={[0, 0.03, 0.09]} s={[w * 0.42, 0.13, 0.015]} m={MATS.metal} cast={false} />
              </group>
            )}
            <Box p={[0, fh - 0.03, 0]} s={[w + 0.04, 0.035, d + 0.04]} m={m.trim} cast={false} />
          </group>
        ))}
        <group position={[0, upperFloors * fh, 0]}>
          {hero.roof === "flat" && (
            <>
              <Box p={[0, 0, 0]} s={[w + 0.04, 0.05, d + 0.04]} m={m.roof} />
              <Box p={[0, 0.05, d / 2 - 0.01]} s={[w + 0.06, 0.1, 0.05]} m={m.trim} />
              <Box p={[0, 0.05, -d / 2 + 0.01]} s={[w + 0.06, 0.1, 0.05]} m={m.trim} />
              <Box p={[w / 2 - 0.01, 0.05, 0]} s={[0.05, 0.1, d + 0.06]} m={m.trim} />
              <Box p={[-w / 2 + 0.01, 0.05, 0]} s={[0.05, 0.1, d + 0.06]} m={m.trim} />
              {isOffice ? null : <Box p={[-w * 0.25, 0.05, -d * 0.2]} s={[0.35, 0.18, 0.3]} m={MATS.metal} />}
            </>
          )}
          {hero.roof === "gable" && <mesh geometry={GABLE} material={m.roof} scale={[w + 0.2, roofH, d + 0.22]} castShadow receiveShadow />}
          {hero.roof === "hip" && <mesh geometry={HIP} material={m.roof} scale={[w + 0.22, roofH, d + 0.22]} castShadow receiveShadow />}
          {hero.chimney && hero.roof !== "flat" && <Box p={[-w * 0.28, roofH * 0.35, -d * 0.12]} s={[0.16, roofH * 0.75, 0.16]} m={m.trim} />}
        </group>
      </group>
    </group>
  );
}

export function Hero({ hero, flavor, snowy }: { hero: HeroSpec; flavor: SceneSpec["flavor"]; snowy: boolean }) {
  const { time, reduced } = useMotion();
  const list = usePresence([hero], (h) => h.key, 800, time);
  return (
    <group position={hero.pos}>
      {list.map((pr) => (
        <Pop key={pr.key} state={pr.state} t0={pr.t0} delay={0.15} rise={0.5}>
          <HeroCut hero={snowy ? { ...pr.item, roofColor: "#EEF3F6" } : pr.item} flavor={flavor} reduced={reduced} />
        </Pop>
      ))}
    </group>
  );
}

function HeroCut({ hero, flavor, reduced }: { hero: HeroSpec; flavor: SceneSpec["flavor"]; reduced: boolean }) {
  const cut = useRef(hero.cutaway ? 1 : 0);
  useFrame((_, dt) => {
    const target = hero.cutaway ? 1 : 0;
    if (reduced) cut.current = target;
    else cut.current += Math.sign(target - cut.current) * Math.min(Math.abs(target - cut.current), dt / 1.1);
  });
  return <Building hero={hero} cutRef={cut} flavor={flavor} />;
}
