/**
 * The island block: a bevelled grass top (clipped by a coastline when coastal), soil strata,
 * a rocky underside, and water for the coast. Shapes are built once per (coast) variant.
 */
import { useMemo } from "react";
import { ConeGeometry, ExtrudeGeometry, Shape, Vector2 } from "three";
import { MATS } from "../materials";
import { HALF } from "../layout";
import { rng } from "../rng";

const R = 0.9; // corner radius
const TOP = 0.26; // land layer thickness
const MID = 0.4;
const DEEP = 0.5;

function roundedRectPoints(half: number, r: number, seg = 6): Vector2[] {
  const pts: Vector2[] = [];
  const corners: [number, number, number][] = [
    [half - r, half - r, 0],
    [-half + r, half - r, Math.PI / 2],
    [-half + r, -half + r, Math.PI],
    [half - r, -half + r, (3 * Math.PI) / 2],
  ];
  for (const [cx, cy, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      pts.push(new Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  return pts;
}

/** World z maps to shape -y (see the rotation below). The coast cuts the back-left (x < coastX(z)). */
const coastX = (z: number) => -1.45 + 0.35 * Math.sin(z * 0.9) + 0.12 * Math.sin(z * 2.3);

function landShape(coast: boolean, half: number): Shape {
  if (!coast) return new Shape(roundedRectPoints(half, R));
  const pts: Vector2[] = [];
  // coastline from world z = -half to +half (shape y = -z)
  for (let i = 0; i <= 24; i++) {
    const z = -half + (i / 24) * (2 * half);
    pts.push(new Vector2(coastX(z), -z));
  }
  // then along the land side of the rounded rect: front edge (z=+half) to the right, around, back
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + ((a1 - a0) * i) / 6;
      pts.push(new Vector2(cx + Math.cos(a) * R, cy + Math.sin(a) * R));
    }
  };
  // world z=+half is shape y=-half (bottom edge); go right along it
  pts.push(new Vector2(half - R, -half));
  arc(half - R, -half + R, -Math.PI / 2, 0);
  pts.push(new Vector2(half, half - R));
  arc(half - R, half - R, 0, Math.PI / 2);
  pts.push(new Vector2(coastX(-half), half));
  return new Shape(pts);
}

function extrude(shape: Shape, depth: number, bevel: number) {
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 6,
  });
  g.rotateX(-Math.PI / 2); // shape (x, y) -> world (x, -z); depth -> +y
  g.computeVertexNormals();
  return g;
}

export function Island({ coast, seed }: { coast: boolean; seed: string }) {
  const geo = useMemo(() => {
    const land = extrude(landShape(coast, HALF - 0.06), TOP - 0.06, 0.06);
    land.translate(0, -TOP + 0.0, 0);
    const mid = extrude(new Shape(roundedRectPoints(HALF, R)), MID, 0);
    mid.translate(0, -TOP - MID, 0);
    const deep = extrude(new Shape(roundedRectPoints(HALF - 0.12, R)), DEEP, 0);
    deep.translate(0, -TOP - MID - DEEP, 0);
    const water = extrude(new Shape(roundedRectPoints(HALF - 0.08, R)), 0.02, 0);
    water.translate(0, -0.1, 0);
    return { land, mid, deep, water };
  }, [coast]);

  const rocks = useMemo(() => {
    const r = rng(`${seed}|rocks`);
    const out: { pos: [number, number, number]; s: [number, number, number]; rot: number }[] = [];
    const y0 = -TOP - MID - DEEP;
    out.push({ pos: [0, y0, 0], s: [HALF * 0.95, 2.6, HALF * 0.95], rot: 0.4 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r.range(-0.3, 0.3);
      const d = r.range(1.6, 3.2);
      out.push({ pos: [Math.cos(a) * d, y0, Math.sin(a) * d], s: [r.range(1.0, 1.7), r.range(1.0, 1.9), r.range(1.0, 1.7)], rot: r.range(0, 6) });
    }
    return out;
  }, [seed]);

  const cone = useMemo(() => {
    const g = new ConeGeometry(1, 1, 7, 1);
    g.rotateX(Math.PI);
    g.translate(0, -0.5, 0);
    return g;
  }, []);

  return (
    <group>
      <mesh geometry={geo.land} material={[MATS.grass, MATS.soilTop]} receiveShadow castShadow />
      <mesh geometry={geo.mid} material={[coast ? MATS.sand : MATS.soilTop, MATS.soilMid]} receiveShadow />
      <mesh geometry={geo.deep} material={[MATS.soilDeep, MATS.soilDeep]} />
      {rocks.map((k, i) => (
        <mesh key={i} geometry={cone} material={MATS.rockBase} position={k.pos} scale={k.s} rotation-y={k.rot} />
      ))}
      {coast && <mesh geometry={geo.water} material={MATS.water} receiveShadow />}
    </group>
  );
}
