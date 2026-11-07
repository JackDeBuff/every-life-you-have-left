/** Cars gliding along the street lanes; they shrink in and out at the island edge. */
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group, Mesh } from "three";
import type { SceneSpec } from "../../../shared/sim";
import { loadKit, template } from "../assets";
import type { CarLane } from "../layout";
import { clamp01, freezeStatic, smooth, useMotion } from "./anim";
import { BlobShadow } from "./props";

const CAR_SCALE = 0.3;

function Car({ lane, flavor }: { lane: CarLane; flavor: SceneSpec["flavor"] }) {
  const gltf = loadKit("cars");
  // Cars move every frame, so they stay out of the shadow map (a blob shadow grounds them instead).
  const obj = useMemo(() => {
    const o = template("cars", gltf.scene, lane.id, flavor).clone();
    o.traverse((x) => {
      if ((x as Mesh).isMesh) x.castShadow = false;
    });
    return freezeStatic(o);
  }, [gltf, lane.id, flavor]);
  const ref = useRef<Group>(null);
  const { time, reduced } = useMotion();
  const len = Math.hypot(lane.to[0] - lane.from[0], lane.to[2] - lane.from[2]);
  const heading = Math.atan2(lane.to[0] - lane.from[0], lane.to[2] - lane.from[2]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    // (reduced motion parks each car mid-lane; an offset past 1 used to park it off the lane end,
    // where the edge fade below turned into a giant scale)
    const u = reduced ? (0.35 + lane.offset) % 1 : ((time() * lane.speed) / len + lane.offset) % 1;
    g.position.set(lane.from[0] + (lane.to[0] - lane.from[0]) * u, 0.02, lane.from[2] + (lane.to[2] - lane.from[2]) * u);
    const edge = Math.min(u, 1 - u) * len;
    const k = smooth(clamp01(edge / 0.6));
    g.scale.setScalar(CAR_SCALE * Math.max(0.0001, k));
    g.rotation.y = heading;
  });
  return (
    <group ref={ref}>
      <primitive object={obj} />
      <BlobShadow w={0.34} d={0.62} parentScale={CAR_SCALE} y={0.03} />
    </group>
  );
}

export function Cars({ lanes, flavor }: { lanes: CarLane[]; flavor: SceneSpec["flavor"] }) {
  return (
    <>
      {lanes.map((l) => (
        <Car key={`${l.key}-${l.id}`} lane={l} flavor={flavor} />
      ))}
    </>
  );
}
