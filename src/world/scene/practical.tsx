/**
 * Practical lights (the hero room's lamp, a moment's warm glow) come from a FIXED pool of point
 * lights that is always mounted. three.js bakes the number of lights into every shader, so a light
 * that mounts or unmounts (a moment starting, a second island rising with its own room lamp)
 * recompiles every material in the scene: a hitch of 100+ ms on a laptop. Components ask for a
 * light each frame with <PracticalLight> / requestLight(); the pool serves the brightest request.
 */
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Color, Vector3, type Object3D, type PointLight } from "three";

export type LightSlot = "room" | "moment";

interface Req {
  pos: Vector3;
  color: Color;
  intensity: number;
  distance: number;
  decay: number;
  fresh: boolean;
}

const mk = (): Req => ({ pos: new Vector3(), color: new Color(), intensity: 0, distance: 1, decay: 2, fresh: false });
const REQ: Record<LightSlot, Req> = { room: mk(), moment: mk() };

/** Ask for the slot's light this frame at `anchor`'s world position (the brightest request wins). */
export function requestLight(slot: LightSlot, anchor: Object3D, intensity: number, color: string, distance: number, decay = 2) {
  const r = REQ[slot];
  if (r.fresh && r.intensity >= intensity) return;
  anchor.getWorldPosition(r.pos);
  r.color.set(color);
  r.intensity = intensity;
  r.distance = distance;
  r.decay = decay;
  r.fresh = true;
}

/** A point light that lives in the pool: drop-in for a static <pointLight> inside a moment. */
export function PracticalLight({ color, intensity, distance, decay = 2, position, slot = "moment" }: { color: string; intensity: number; distance: number; decay?: number; position?: [number, number, number]; slot?: LightSlot }) {
  const ref = useRef<Object3D>(null);
  useFrame(() => {
    // a light inside a hidden group (a rocket before launch) stays dark, as a real one would
    for (let o: Object3D | null = ref.current; o; o = o.parent) if (!o.visible) return;
    if (ref.current) requestLight(slot, ref.current, intensity, color, distance, decay);
  });
  return <object3D ref={ref} position={position} />;
}

/** The pool itself: mounted once in the scene, applied after the requests (priority 0.8). */
export function PracticalLights() {
  const room = useRef<PointLight>(null);
  const moment = useRef<PointLight>(null);
  useFrame(() => {
    for (const [slot, light] of [["room", room.current], ["moment", moment.current]] as const) {
      if (!light) continue;
      const r = REQ[slot];
      if (r.fresh) {
        light.position.copy(r.pos);
        light.color.copy(r.color);
        light.intensity = r.intensity;
        light.distance = r.distance;
        light.decay = r.decay;
      } else light.intensity = 0;
      r.fresh = false;
      r.intensity = 0;
    }
  }, 0.8);
  return (
    <>
      <pointLight ref={room} intensity={0} />
      <pointLight ref={moment} intensity={0} />
    </>
  );
}
