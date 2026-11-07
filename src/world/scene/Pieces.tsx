/** Kit models placed by the composer, each growing in / sinking out with <Pop>. */
import { useMemo } from "react";
import type { Mesh, Object3D } from "three";
import type { SceneSpec } from "../../../shared/sim";
import { loadKit, template } from "../assets";
import type { PieceSpec } from "../layout";
import { MATS, solid } from "../materials";
import { Pop, usePresence, useMotion, type Present } from "./anim";

const BLOSSOM_DARK = solid("#E79AAE");

function Model({ p, flavor }: { p: PieceSpec; flavor: SceneSpec["flavor"] }) {
  const gltf = loadKit(p.kit);
  const obj = useMemo<Object3D>(() => {
    const o = template(p.kit, gltf.scene, p.id, flavor, p.variant).clone();
    if (p.tint === "blossom")
      o.traverse((x) => {
        const m = x as Mesh;
        if (!m.isMesh) return;
        if (m.material === MATS.foliage) m.material = MATS.blossom;
        else if (m.material === MATS.foliageDark) m.material = BLOSSOM_DARK;
      });
    return o;
  }, [gltf, p.kit, p.id, flavor, p.variant, p.tint]);
  return <primitive object={obj} />;
}

export function PieceItem({ pr, flavor }: { pr: Present<PieceSpec>; flavor: SceneSpec["flavor"] }) {
  const p = pr.item;
  return (
    <Pop state={pr.state} t0={pr.t0} delay={p.delay} position={p.pos} rotationY={p.rotY} scale={p.scale} rise={0.3}>
      <Model p={p} flavor={flavor} />
    </Pop>
  );
}

export function Pieces({ pieces, flavor }: { pieces: PieceSpec[]; flavor: SceneSpec["flavor"] }) {
  const { time } = useMotion();
  const list = usePresence(pieces, (p) => p.key, 700, time);
  return (
    <>
      {list.map((pr) => (
        <PieceItem key={pr.key} pr={pr} flavor={flavor} />
      ))}
    </>
  );
}
