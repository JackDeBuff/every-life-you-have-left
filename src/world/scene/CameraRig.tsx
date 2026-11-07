/**
 * Camera language (docs/WORLD.md §5): a narrow-FOV orbit around the focus, a breathing drift at
 * rest, a turntable step each year, a dolly for indoor rooms, a push-in for moments, and an
 * external "shot" override for interlude cuts. Reduced motion: fixed framing, no drift.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import { Vector3, type PerspectiveCamera } from "three";
import { useMotion } from "./anim";

export interface RigState {
  /** Base yaw (deg) for this year: the turntable. */
  yaw: number;
  pitch: number;
  dist: number;
  focus: Vector3;
  /** 0..1 push toward `pushTarget` (moments). */
  push: number;
  pushTarget: Vector3;
  /** Interlude shot override: start/end yaw + dist, progress driven externally. */
  shot: { yaw0: number; yaw1: number; dist0: number; dist1: number; pitch: number; t: number } | null;
  /** Extra vertical lift for place transitions (camera follows rising island). */
  lift: number;
}

export function makeRig(): RigState {
  return {
    yaw: 40,
    pitch: 31,
    dist: 37,
    focus: new Vector3(0.4, 0.2, 0.4),
    push: 0,
    pushTarget: new Vector3(),
    shot: null,
    lift: 0,
  };
}

const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

export function CameraRig({ rig }: { rig: MutableRefObject<RigState> }) {
  const { camera, size } = useThree();
  const { time, reduced } = useMotion();
  const cur = useRef({ yaw: rig.current.yaw, pitch: rig.current.pitch, dist: rig.current.dist, focus: rig.current.focus.clone(), init: false });
  const tmpFocus = useRef(new Vector3());
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const R = rig.current;
    const c = cur.current;
    const aspect = size.width / Math.max(1, size.height);
    // keep the island framed on narrow panes
    const fit = aspect < 1.25 ? 1.25 / aspect : 1;
    let yaw = R.yaw;
    let pitch = R.pitch;
    let dist = R.dist * fit;
    const focus = tmpFocus.current.copy(R.focus);
    if (R.shot) {
      const t = R.shot.t;
      yaw = R.shot.yaw0 + (R.shot.yaw1 - R.shot.yaw0) * t;
      dist = (R.shot.dist0 + (R.shot.dist1 - R.shot.dist0) * t) * fit;
      pitch = R.shot.pitch;
    }
    if (R.push > 0) {
      const k = R.push;
      focus.lerp(R.pushTarget, k * 0.85);
      dist *= 1 - 0.42 * k;
      pitch -= 4 * k;
    }
    if (!reduced && !R.shot) {
      const t = time();
      yaw += Math.sin(t * 0.26) * 2.6;
      pitch += Math.sin(t * 0.19 + 1.3) * 0.8;
    }
    const snap = import.meta.env.DEV && (window as unknown as { __camSnap?: boolean }).__camSnap;
    if (reduced || !c.init || R.shot || snap) {
      c.yaw = yaw;
      c.pitch = pitch;
      c.dist = dist;
      c.focus.copy(focus);
      c.init = true;
    } else {
      c.yaw = damp(c.yaw, yaw, 2.2, dt);
      c.pitch = damp(c.pitch, pitch, 2.2, dt);
      c.dist = damp(c.dist, dist, 2.0, dt);
      c.focus.lerp(focus, 1 - Math.exp(-2.2 * dt));
    }
    const y = (c.yaw * Math.PI) / 180;
    const p = (c.pitch * Math.PI) / 180;
    camera.position.set(
      c.focus.x + Math.cos(p) * Math.sin(y) * c.dist,
      c.focus.y + Math.sin(p) * c.dist + R.lift,
      c.focus.z + Math.cos(p) * Math.cos(y) * c.dist,
    );
    camera.lookAt(c.focus.x, c.focus.y + R.lift * 0.6, c.focus.z);
    (camera as PerspectiveCamera).updateMatrixWorld();
  }, -1);
  return null;
}
