/** Small hand-held props in rig units (the Quaternius rig is ~3.3 units tall). */
import { BoxGeometry } from "three";
import { solid } from "../materials";

const BOX = new BoxGeometry(1, 1, 1);
const CARDBOARD = solid("#C9A27A");
const TAPE = solid("#E8D3B0");

export function CarryBox() {
  return (
    <group position={[0, 1.75, 0.75]}>
      <mesh geometry={BOX} material={CARDBOARD} scale={[1.1, 0.8, 0.8]} castShadow />
      <mesh geometry={BOX} material={TAPE} position={[0, 0.401, 0]} scale={[1.12, 0.02, 0.18]} />
    </group>
  );
}
