/**
 * Procedural set pieces (roads, paths, plazas, fields, bus stop, string lights, easel, desk,
 * pram, picnic blanket, academic halls...). All share unit geometries and palette materials.
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useRef } from "react";
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  SphereGeometry,
  TorusGeometry,
  type Material,
} from "three";
import type { ProcSpec } from "../layout";
import { MATS, solid } from "../materials";
import { rng } from "../rng";
import { Pop, usePresence, useMotion, type Present } from "./anim";

const BOX = new BoxGeometry(1, 1, 1);
BOX.translate(0, 0.5, 0);
const BOXC = new BoxGeometry(1, 1, 1);
const CYL = new CylinderGeometry(0.5, 0.5, 1, 14);
CYL.translate(0, 0.5, 0);
const SPH = new SphereGeometry(0.5, 14, 10);
const BULB = new SphereGeometry(0.018, 6, 5);
const CONE4 = new CylinderGeometry(0, 0.5, 1, 4);
const CONE3 = new CylinderGeometry(0, 0.5, 1, 3);
const RING = new TorusGeometry(2.55, 0.17, 3, 48);
RING.rotateX(Math.PI / 2);

function B({ p, s, m, r = 0 }: { p: [number, number, number]; s: [number, number, number]; m: Material; r?: number }) {
  return <mesh geometry={BOX} material={m} position={p} scale={s} rotation-y={r} castShadow receiveShadow />;
}
function C({ p, s, m }: { p: [number, number, number]; s: [number, number, number]; m: Material }) {
  return <mesh geometry={CYL} material={m} position={p} scale={s} castShadow receiveShadow />;
}

const texCache = new Map<string, CanvasTexture>();
function canvasTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
const matCache = new Map<string, MeshStandardMaterial>();
function texMat(key: string, tex: CanvasTexture, emissive = false) {
  let m = matCache.get(key);
  if (!m) {
    m = new MeshStandardMaterial({ map: tex, roughness: 0.9 });
    if (emissive) {
      m.emissiveMap = tex;
      m.emissive.set("#ffffff");
      m.emissiveIntensity = 0.15;
    }
    matCache.set(key, m);
  }
  return m;
}

const PAINT = ["#EE8E7A", "#F2C66D", "#6FB7B4", "#3E8C93", "#F4EBDD", "#D9825B", "#A9C59A", "#2E3A4F"];
function paintingTex(seed: number) {
  return canvasTex(`paint${seed}`, 128, 160, (ctx) => {
    const r = rng(seed);
    ctx.fillStyle = r.pick(["#F4EBDD", "#FBF8F1", "#2E3A4F"]);
    ctx.fillRect(0, 0, 128, 160);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = r.pick(PAINT);
      ctx.globalAlpha = r.range(0.6, 1);
      if (r.chance(0.5)) {
        ctx.beginPath();
        ctx.arc(r.range(10, 118), r.range(10, 150), r.range(10, 42), 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(r.range(0, 90), r.range(0, 120), r.range(20, 70), r.range(10, 60));
    }
    ctx.globalAlpha = 1;
  });
}
function plaidTex(a: string, b: string) {
  return canvasTex(`plaid${a}${b}`, 64, 64, (ctx) => {
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = a;
    ctx.globalAlpha = 0.75;
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(i * 16, 0, 8, 64);
      ctx.fillRect(0, i * 16, 64, 8);
    }
    ctx.globalAlpha = 1;
  });
}
function pavingTex(base: string) {
  const t = canvasTex(`pave${base}`, 128, 128, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 128, 128);
    const r = rng(base);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        ctx.globalAlpha = r.range(0.0, 0.08);
        ctx.fillStyle = r.chance(0.5) ? "#ffffff" : "#8a7a66";
        ctx.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
      }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#8a7a66";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 16, 0);
      ctx.lineTo(i * 16, 128);
      ctx.moveTo(0, i * 16);
      ctx.lineTo(128, i * 16);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
function crosswalkTex() {
  return canvasTex("crosswalk", 64, 16, (ctx) => {
    ctx.fillStyle = "#5E6672";
    ctx.fillRect(0, 0, 64, 16);
    ctx.fillStyle = "#F4EBDD";
    for (let i = 0; i < 6; i++) ctx.fillRect(3 + i * 10.5, 1, 6, 14);
  });
}
function screenTex() {
  return canvasTex("screen", 32, 24, (ctx) => {
    ctx.fillStyle = "#CFE3EA";
    ctx.fillRect(0, 0, 32, 24);
    ctx.fillStyle = "#6FB7B4";
    ctx.fillRect(3, 4, 18, 3);
    ctx.fillStyle = "#EE8E7A";
    ctx.fillRect(3, 10, 12, 2);
    ctx.fillStyle = "#9FB4C7";
    for (let i = 0; i < 3; i++) ctx.fillRect(3, 14 + i * 3, 24 - i * 5, 1.5);
  });
}
function whiteboardTex() {
  return canvasTex("wb", 96, 64, (ctx) => {
    ctx.fillStyle = "#FBF8F1";
    ctx.fillRect(0, 0, 96, 64);
    ctx.strokeStyle = "#3E8C93";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 50);
    ctx.lineTo(30, 34);
    ctx.lineTo(52, 40);
    ctx.lineTo(86, 12);
    ctx.stroke();
    ctx.fillStyle = "#EE8E7A";
    for (let i = 0; i < 4; i++) ctx.fillRect(10 + i * 9, 8, 6, 6);
  });
}

/** String lights: bulbs along a sagging line between two poles. */
function StringLights({ size }: { size: [number, number, number] }) {
  const ref = useRef<InstancedMesh>(null);
  const n = 22;
  const [len, h] = size;
  useLayoutEffect(() => {
    const m = new Matrix4();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = -len / 2 + t * len;
      const y = h - Math.sin(t * Math.PI) * 0.16;
      m.makeTranslation(x, y, 0);
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [len, h]);
  return (
    <group>
      <C p={[-len / 2, 0, 0]} s={[0.025, h + 0.02, 0.025]} m={MATS.woodDark} />
      <C p={[len / 2, 0, 0]} s={[0.025, h + 0.02, 0.025]} m={MATS.woodDark} />
      <instancedMesh ref={ref} args={[BULB, MATS.lamp, n]} />
    </group>
  );
}

function Fountain({ size }: { size: [number, number, number] }) {
  const water = useRef<InstancedMesh>(null);
  const { time, reduced } = useMotion();
  useFrame(() => {
    if (!water.current || reduced) return;
    const m = new Matrix4();
    const t = time();
    for (let i = 0; i < 8; i++) {
      const k = ((t * 0.8 + i / 8) % 1);
      m.makeTranslation(Math.cos(i) * 0.05 * k, 0.32 + Math.sin(k * Math.PI) * 0.18, Math.sin(i) * 0.05 * k);
      water.current.setMatrixAt(i, m);
    }
    water.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <C p={[0, 0, 0]} s={[size[0], 0.12, size[2]]} m={solid("#E9E0D0")} />
      <C p={[0, 0.06, 0]} s={[size[0] * 0.85, 0.08, size[2] * 0.85]} m={MATS.water} />
      <C p={[0, 0, 0]} s={[0.1, 0.3, 0.1]} m={solid("#E9E0D0")} />
      <instancedMesh ref={water} args={[SPH, MATS.water, 8]} scale={0.06} />
    </group>
  );
}

function ProcBody({ p }: { p: ProcSpec }) {
  const [w, h, d] = p.size;
  const col = (hex: string | undefined, fallback: Material) => (hex ? solid(hex) : fallback);
  switch (p.type) {
    case "road":
    case "roadZ": {
      const along = p.type === "road" ? w : d;
      const dashes = Math.floor(along / 0.5);
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, 0.02, d]} m={MATS.road} />
          {Array.from({ length: dashes }, (_, i) => {
            const t = -along / 2 + 0.25 + i * 0.5;
            return p.type === "road" ? (
              <B key={i} p={[t, 0.02, 0]} s={[0.22, 0.004, 0.035]} m={MATS.roadLine} />
            ) : (
              <B key={i} p={[0, 0.02, t]} s={[0.035, 0.004, 0.22]} m={MATS.roadLine} />
            );
          })}
        </group>
      );
    }
    case "sidewalk":
      return <B p={[0, 0, 0]} s={[w, h, d]} m={MATS.sidewalk} />;
    case "crosswalk":
      return <mesh geometry={BOX} position={[0, 0.005, 0]} scale={[w, 0.022, d]} rotation-y={p.rotY} material={texMat("cw", crosswalkTex())} receiveShadow />;
    case "path":
      if (p.color === "ring") return <mesh geometry={RING} scale={[1, 0.12, 1]} position={[0, 0.0, 0]} material={col(p.color2, MATS.path)} receiveShadow />;
      return <B p={[0, 0, 0]} s={[w, h, d]} m={col(p.color, MATS.path)} />;
    case "plaza":
      return <B p={[0, 0, 0]} s={[w, h, d]} m={texMat(`pave${p.color}`, pavingTex(p.color ?? "#EFE4CF"))} />;
    case "lawn":
      return <B p={[0, 0, 0]} s={[w, h, d]} m={MATS.grassDark} />;
    case "field":
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, h, d]} m={col(p.color, MATS.soilTop)} />
          {Array.from({ length: Math.floor(d / 0.4) }, (_, i) => (
            <B key={i} p={[0, h, -d / 2 + 0.2 + i * 0.4]} s={[w * 0.96, 0.025, 0.12]} m={solid("#9C7650")} />
          ))}
        </group>
      );
    case "planter":
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, h, d]} m={col(p.color, MATS.path)} />
          <B p={[0, h, 0]} s={[w * 0.8, 0.01, d * 0.8]} m={MATS.soilTop} />
        </group>
      );
    case "hedge":
      return <mesh geometry={BOXC} position={[0, h / 2, 0]} scale={[w, h, d]} material={MATS.foliageDark} castShadow receiveShadow />;
    case "flowerBed": {
      const r = rng(p.key);
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, h, d]} m={MATS.soilTop} />
          {Array.from({ length: 10 }, (_, i) => (
            <mesh key={i} geometry={SPH} material={solid(r.pick(["#EE8E7A", "#F2C66D", "#F4B6C2", "#FBF8F1"]))} position={[r.range(-w / 2 + 0.05, w / 2 - 0.05), h + 0.03, r.range(-d / 2 + 0.04, d / 2 - 0.04)]} scale={0.06} castShadow />
          ))}
        </group>
      );
    }
    case "mailbox":
      return (
        <group>
          <B p={[0, 0, 0]} s={[0.025, 0.14, 0.025]} m={MATS.woodDark} />
          <B p={[0, 0.14, 0]} s={[0.07, 0.06, 0.11]} m={solid("#2F4F6F")} />
        </group>
      );
    case "busStop":
      return (
        <group>
          <B p={[-w / 2 + 0.02, 0, 0]} s={[0.03, 0.42, 0.03]} m={MATS.metal} />
          <B p={[w / 2 - 0.02, 0, 0]} s={[0.03, 0.42, 0.03]} m={MATS.metal} />
          <B p={[0, 0.42, 0]} s={[w + 0.06, 0.03, d + 0.06]} m={col(p.color, MATS.metal)} />
          <B p={[0, 0.08, -d / 2 + 0.02]} s={[w, 0.3, 0.015]} m={MATS.glass} />
          <B p={[0, 0.09, 0]} s={[w * 0.8, 0.025, 0.1]} m={MATS.wood} />
          <B p={[w / 2 + 0.12, 0, 0]} s={[0.02, 0.5, 0.02]} m={MATS.metal} />
          <mesh geometry={CYL} material={solid("#3E8C93")} position={[w / 2 + 0.12, 0.48, 0]} rotation-x={Math.PI / 2} scale={[0.1, 0.02, 0.1]} />
        </group>
      );
    case "stringLights":
      return <StringLights size={p.size} />;
    case "picnic":
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, 0.012, d]} m={texMat(`plaid${p.color}`, plaidTex(p.color ?? "#EE8E7A", p.color2 ?? "#F4EBDD"))} />
          <B p={[w / 2 - 0.12, 0.012, -d / 2 + 0.12]} s={[0.12, 0.08, 0.08]} m={MATS.wood} />
        </group>
      );
    case "pram":
      return (
        <group>
          <mesh geometry={SPH} material={col(p.color, MATS.white)} position={[0, 0.12, 0]} scale={[w, h * 0.55, d]} castShadow />
          <mesh geometry={SPH} material={solid("#F0CDB4")} position={[0.02, 0.17, 0]} scale={0.06} />
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh key={`${sx}${sz}`} geometry={CYL} material={MATS.ink} position={[sx * w * 0.35, 0.0, sz * d * 0.45]} rotation-x={Math.PI / 2} scale={[0.05, 0.015, 0.05]} />
            )),
          )}
          <B p={[-w / 2, 0.14, 0]} s={[0.015, 0.12, 0.015]} m={MATS.metal} />
        </group>
      );
    case "suitcase":
      return (
        <group>
          <mesh geometry={BOXC} material={col(p.color, MATS.white)} position={[0, h / 2 + 0.01, 0]} scale={[w, h, d]} castShadow />
          <B p={[0, h + 0.01, 0]} s={[0.05, 0.05, 0.01]} m={MATS.ink} />
        </group>
      );
    case "easel": {
      const tex = paintingTex(p.seed ?? 1);
      return (
        <group>
          <B p={[-0.1, 0, 0.03]} s={[0.02, 0.5, 0.02]} m={MATS.wood} r={0.1} />
          <B p={[0.1, 0, 0.03]} s={[0.02, 0.5, 0.02]} m={MATS.wood} r={-0.1} />
          <B p={[0, 0, -0.06]} s={[0.02, 0.48, 0.02]} m={MATS.wood} />
          <mesh geometry={BOXC} position={[0, 0.36, 0.045]} scale={[w, h * 0.5, 0.012]} material={texMat(`paint${p.seed}`, tex, true)} castShadow />
          <B p={[0, 0.2, 0.05]} s={[w + 0.02, 0.012, 0.05]} m={MATS.wood} />
        </group>
      );
    }
    case "canvasStack":
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <mesh key={i} geometry={BOXC} position={[i * 0.03, h / 2 - i * 0.03, 0.02 + i * 0.02]} rotation-x={-0.18} scale={[w - i * 0.05, h - i * 0.06, 0.012]} material={texMat(`paint${(p.seed ?? 3) + i}`, paintingTex((p.seed ?? 3) + i))} castShadow />
          ))}
        </group>
      );
    case "desk":
    case "monitorDesk":
    case "partyTable":
    case "parasolTable": {
      const top = col(p.color, MATS.wood);
      const legs = (
        <>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => <B key={`${sx}${sz}`} p={[sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)]} s={[0.022, h, 0.022]} m={MATS.woodDark} />),
          )}
          <B p={[0, h, 0]} s={[w, 0.025, d]} m={top} />
        </>
      );
      if (p.type === "parasolTable")
        return (
          <group>
            <C p={[0, 0, 0]} s={[w, 0.02, w]} m={MATS.metal} />
            <C p={[0, 0, 0]} s={[0.025, h, 0.025]} m={MATS.metal} />
            <C p={[0, h, 0]} s={[w, 0.02, w]} m={MATS.white} />
            <C p={[0, h, 0]} s={[0.018, 0.55, 0.018]} m={MATS.metal} />
            <mesh geometry={CYL} position={[0, h + 0.5, 0]} scale={[w * 2.2, 0.08, w * 2.2]} material={col(p.color, MATS.white)} castShadow />
          </group>
        );
      return (
        <group>
          {legs}
          {p.type === "monitorDesk" && (
            <group position={[0, h + 0.025, 0]}>
              <B p={[0.02, 0, 0]} s={[0.04, 0.05, 0.04]} m={MATS.ink} />
              <mesh geometry={BOXC} position={[0.0, 0.12, 0]} scale={[0.02, 0.12, 0.2]} material={MATS.ink} castShadow />
              <mesh geometry={BOXC} position={[0.012, 0.12, 0]} scale={[0.004, 0.105, 0.185]} material={texMat("screen", screenTex(), true)} />
            </group>
          )}
          {p.type === "partyTable" && <B p={[0, h + 0.025, 0]} s={[w * 1.02, 0.008, d * 1.04]} m={solid("#FBF8F1")} />}
        </group>
      );
    }
    case "laptop":
      return (
        <group position={[0, 0.275, 0]}>
          <B p={[0, 0, 0]} s={[w, 0.008, d]} m={MATS.metal} />
          <mesh geometry={BOXC} position={[-w / 2 + 0.004, 0.045, 0]} rotation-z={-0.25} scale={[0.006, 0.085, d]} material={MATS.metal} />
          <mesh geometry={BOXC} position={[-w / 2 + 0.01, 0.045, 0]} rotation-z={-0.25} scale={[0.002, 0.075, d * 0.9]} material={texMat("screen", screenTex(), true)} />
        </group>
      );
    case "bookStack": {
      const r = rng(p.key);
      return (
        <group position={[0, 0.275, 0]}>
          {[0, 1, 2].map((i) => (
            <B key={i} p={[0, i * 0.022, 0]} s={[w, 0.02, d]} m={solid(r.pick(["#5E9AA0", "#E8C27A", "#EE8E7A", "#F4EBDD"]))} r={r.range(-0.3, 0.3)} />
          ))}
        </group>
      );
    }
    case "whiteboard":
      return (
        <group>
          <mesh geometry={BOXC} position={[0, 0.42, 0]} scale={[w, h, d]} material={texMat("wb", whiteboardTex())} castShadow />
        </group>
      );
    case "barn":
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, h * 0.55, d]} m={col(p.color, MATS.wood)} />
          <mesh geometry={BOXC} position={[0, h * 0.55 + 0.16, 0]} rotation-x={Math.PI / 4} scale={[w * 1.04, d * 0.5, d * 0.5]} material={solid("#5B6470")} castShadow />
          <B p={[w / 2 + 0.002, 0, 0]} s={[0.01, h * 0.42, d * 0.42]} m={MATS.white} />
        </group>
      );
    case "academic":
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, h, d]} m={col(p.color, MATS.wood)} />
          <B p={[0, h, 0]} s={[w + 0.08, 0.08, d + 0.08]} m={col(p.color2, MATS.white)} />
          {Array.from({ length: 6 }, (_, i) => (
            <C key={i} p={[-w / 2 + 0.35 + (i * (w - 0.7)) / 5, 0, d / 2 + 0.12]} s={[0.1, h * 0.72, 0.1]} m={col(p.color2, MATS.white)} />
          ))}
          <B p={[0, h * 0.72, d / 2 + 0.12]} s={[w * 0.9, 0.1, 0.22]} m={col(p.color2, MATS.white)} />
          {Array.from({ length: 5 }, (_, i) =>
            [0.3, 0.62].map((yy) => <B key={`${i}${yy}`} p={[-w / 2 + 0.4 + (i * (w - 0.8)) / 4, h * yy, d / 2 + 0.005]} s={[0.18, 0.24, 0.02]} m={MATS.glass} />),
          )}
        </group>
      );
    case "tower":
      return (
        <group>
          <B p={[0, 0, 0]} s={[w, h, d]} m={col(p.color, MATS.wood)} />
          <B p={[0, h, 0]} s={[w + 0.06, 0.06, d + 0.06]} m={col(p.color2, MATS.white)} />
          <mesh geometry={CYL} position={[0, h * 0.78, d / 2 + 0.01]} rotation-x={Math.PI / 2} scale={[0.4, 0.02, 0.4]} material={MATS.white} />
          <mesh geometry={CONE4} position={[0, h + 0.36, 0]} rotation-y={Math.PI / 4} scale={[w * 1.35, 0.6, w * 1.35]} material={solid("#5B6470")} castShadow />
        </group>
      );
    case "fountain":
      return <Fountain size={p.size} />;
    case "pier":
      return (
        <group>
          <B p={[0, -0.04, 0]} s={[w, 0.04, d]} m={col(p.color, MATS.wood)} />
          {Array.from({ length: 5 }, (_, i) => (
            <C key={i} p={[-w / 2 + 0.1 + i * ((w - 0.2) / 4), -0.3, d / 2]} s={[0.05, 0.28, 0.05]} m={MATS.woodDark} />
          ))}
        </group>
      );
    case "boat":
      return <Boat p={p} />;
    case "wallArt":
    case "wallArtZ": {
      const alongZ = p.type === "wallArt";
      return (
        <group position={[0, 0.4, 0]}>
          <mesh geometry={BOXC} scale={alongZ ? [0.02, h + 0.03, d + 0.03] : [w + 0.03, h + 0.03, 0.02]} material={MATS.woodDark} />
          <mesh geometry={BOXC} position={alongZ ? [0.011, 0, 0] : [0, 0, 0.011]} scale={alongZ ? [0.004, h, d] : [w, h, 0.004]} material={texMat(`paint${p.seed}`, paintingTex(p.seed ?? 5), true)} />
        </group>
      );
    }
    case "gallery":
    case "spotlight":
    case "podium":
    case "arch":
    case "hill":
    default:
      return null;
  }
}

function Boat({ p }: { p: ProcSpec }) {
  const ref = useRef<import("three").Group>(null);
  const { time, reduced } = useMotion();
  const [w, h, d] = p.size;
  useFrame(() => {
    if (!ref.current || reduced) return;
    const t = time();
    ref.current.position.y = -0.1 + Math.sin(t * 1.3 + p.pos[0]) * 0.012;
    ref.current.rotation.z = Math.sin(t * 1.1 + p.pos[2]) * 0.04;
  });
  return (
    <group ref={ref}>
      <mesh geometry={SPH} material={solid(p.color ?? "#F4EBDD")} scale={[w, h, d]} castShadow />
      <B p={[0, h * 0.2, 0]} s={[w * 0.9, 0.02, d * 0.75]} m={MATS.wood} />
      <B p={[0, 0, 0]} s={[0.02, 0.5, 0.02]} m={MATS.woodDark} />
      <mesh geometry={CONE3} material={solid(p.color2 ?? "#EE8E7A")} position={[0.1, 0.32, 0]} scale={[0.28, 0.36, 0.02]} castShadow />
    </group>
  );
}

export function ProcItem({ pr }: { pr: Present<ProcSpec> }) {
  const p = pr.item;
  const flat = p.type === "road" || p.type === "roadZ" || p.type === "sidewalk" || p.type === "path" || p.type === "plaza" || p.type === "lawn" || p.type === "field" || p.type === "crosswalk";
  return (
    <Pop state={pr.state} t0={pr.t0} delay={p.delay} position={p.pos} rotationY={p.type === "crosswalk" ? 0 : p.rotY} rise={flat ? 0.02 : 0.2}>
      <ProcBody p={p} />
    </Pop>
  );
}

export function Procs({ procs }: { procs: ProcSpec[] }) {
  const { time } = useMotion();
  const list = usePresence(procs, (p) => p.key, 700, time);
  return (
    <>
      {list.map((pr) => (
        <ProcItem key={pr.key} pr={pr} />
      ))}
    </>
  );
}
