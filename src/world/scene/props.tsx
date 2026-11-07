/** Small hand-held props in rig units (the Quaternius rig is ~3.3 units tall), and blob shadows. */
import { BoxGeometry, CanvasTexture, CircleGeometry, MeshBasicMaterial } from "three";
import { solid } from "../materials";
import { SWATCH } from "../palette";

const BOX = new BoxGeometry(1, 1, 1);
const CARDBOARD = solid("#C9A27A");
const TAPE = solid("#E8D3B0");

export function CarryBox() {
  return (
    <group position={[0, 1.75, 0.75]}>
      <mesh geometry={BOX} material={CARDBOARD} scale={[1.1, 0.8, 0.8]} />
      <mesh geometry={BOX} material={TAPE} position={[0, 0.401, 0]} scale={[1.12, 0.02, 0.18]} />
    </group>
  );
}

function blobTexture() {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.7)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const BLOB_GEO = new CircleGeometry(0.5, 20).rotateX(-Math.PI / 2);
/** Shared by every blob; Atmosphere sets its opacity from the look (softer at night / in cloud). */
export const BLOB_MAT = new MeshBasicMaterial({
  color: SWATCH.ink,
  alphaMap: blobTexture(),
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});

/**
 * A soft contact shadow under a character, pet or car. They move every frame, so they stay out of
 * the sun's shadow map (which only re-renders when the set changes, see shadows.ts). Sizes are in
 * world units; `parentScale` undoes the scale of the group the blob sits in.
 */
export function BlobShadow({ w, d = w, parentScale = 1, y = 0.045 }: { w: number; d?: number; parentScale?: number; y?: number }) {
  const k = 1 / Math.max(1e-4, parentScale);
  return <mesh geometry={BLOB_GEO} material={BLOB_MAT} position={[0, y * k, 0]} scale={[w * k, 1, d * k]} renderOrder={1} />;
}
