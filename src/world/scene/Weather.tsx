/**
 * Weather and season particles on the GPU (one draw each): rain, snow, spring petals, autumn
 * leaves, summer-night fireflies, sunny motes. Each fades in/out as the spec changes.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, ShaderMaterial, type Points } from "three";
import type { SceneSpec } from "../../../shared/sim";
import { TEMPERATE } from "../palette";
import { rng } from "../rng";
import { useMotion } from "./anim";

const vert = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime; uniform float uSize; uniform float uOpacity; uniform float uFall; uniform float uSway;
uniform float uSpin; uniform float uHeight; uniform float uBase; uniform float uPixelRatio; uniform float uBlink;
uniform vec3 uColorA; uniform vec3 uColorB; uniform float uShape;
varying float vAlpha; varying vec3 vColor; varying float vSpin;
void main() {
  vec3 p = position;
  float t = uTime;
  p.y = uBase + mod(position.y - t * uFall * (0.7 + aSeed.x * 0.6), uHeight);
  p.x += sin(t * (0.5 + aSeed.y) + aSeed.z * 6.28) * uSway;
  p.z += cos(t * (0.4 + aSeed.x) + aSeed.y * 6.28) * uSway;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uSize * (0.6 + aSeed.y * 0.8) * (300.0 / -mv.z), uShape > 0.5 && uShape < 1.5 ? 20.0 : 9.0) * uPixelRatio;
  float rel = (p.y - uBase) / uHeight;
  vAlpha = uOpacity * smoothstep(0.0, 0.08, rel) * smoothstep(1.0, 0.85, rel);
  vAlpha *= mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.6 + aSeed.z * 30.0)), uBlink);
  vColor = mix(uColorA, uColorB, aSeed.z);
  vSpin = t * uSpin * (aSeed.x - 0.5) * 4.0 + aSeed.y * 6.28;
}`;
const frag = /* glsl */ `
uniform float uShape;
varying float vAlpha; varying vec3 vColor; varying float vSpin;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float a = 0.0;
  if (uShape < 0.5) {            // soft round (snow, motes)
    a = smoothstep(0.5, 0.15, length(uv));
  } else if (uShape < 1.5) {     // rain streak
    a = smoothstep(0.07, 0.0, abs(uv.x)) * smoothstep(0.5, 0.2, abs(uv.y));
  } else if (uShape < 2.5) {     // petal / leaf: rotated ellipse
    float c = cos(vSpin), s = sin(vSpin);
    vec2 r = vec2(c * uv.x - s * uv.y, s * uv.x + c * uv.y);
    a = smoothstep(0.22, 0.17, length(r * vec2(1.0, 2.1)));
  } else {                       // glow
    float d = length(uv);
    a = smoothstep(0.5, 0.0, d) * 0.6 + smoothstep(0.12, 0.0, d);
  }
  if (a * vAlpha < 0.01) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}`;

interface Kind {
  key: string;
  count: number;
  shape: number;
  size: number;
  fall: number;
  sway: number;
  spin: number;
  height: number;
  base: number;
  blink: number;
  a: string;
  b: string;
  additive: boolean;
  opacity: number;
  /** Spawn half-extent in x/z (default 6.5). */
  radius?: number;
}

const KINDS: Kind[] = [
  { key: "rain", count: 1400, shape: 1, size: 1.5, fall: 6.5, sway: 0.03, spin: 0, height: 5, base: -0.2, blink: 0, a: "#C9D8E4", b: "#AFC3D2", additive: false, opacity: 0.38, radius: 5.6 },
  { key: "snow", count: 650, shape: 0, size: 0.32, fall: 0.45, sway: 0.25, spin: 0, height: 4.5, base: -0.2, blink: 0, a: "#FFFFFF", b: "#EAF1F7", additive: false, opacity: 0.9, radius: 5.6 },
  { key: "petals", count: 140, shape: 2, size: 0.9, fall: 0.35, sway: 0.6, spin: 1, height: 6, base: 0, blink: 0, a: "#F4B6C2", b: "#FBF8F1", additive: false, opacity: 0.95 },
  { key: "leaves", count: 110, shape: 2, size: 1.05, fall: 0.45, sway: 0.55, spin: 1.2, height: 6, base: 0, blink: 0, a: "#E39B4B", b: "#C8643B", additive: false, opacity: 0.95 },
  { key: "fireflies", count: 44, shape: 3, size: 0.42, fall: 0.03, sway: 0.4, spin: 0, height: 1.1, base: 0.12, blink: 1, a: "#FFE08A", b: "#F2C66D", additive: true, opacity: 0.9, radius: 4.2 },
  { key: "motes", count: 46, shape: 3, size: 0.32, fall: -0.06, sway: 0.35, spin: 0, height: 1.8, base: 0.15, blink: 0.6, a: "#FFE7A8", b: "#FFD58A", additive: true, opacity: 0.5, radius: 4 },
];

export function activeKinds(spec: Pick<SceneSpec, "weather" | "season" | "timeOfDay" | "mood" | "flavor">): Set<string> {
  const s = new Set<string>();
  if (spec.weather === "rain") s.add("rain");
  if (spec.weather === "snow") s.add("snow");
  const dry = spec.weather === "clear" || spec.weather === "cloudy";
  if (spec.season === "spring" && dry) s.add("petals");
  if (spec.season === "autumn" && TEMPERATE[spec.flavor] && spec.weather !== "rain") s.add("leaves");
  if ((spec.season === "summer" || (!TEMPERATE[spec.flavor] && spec.season !== "winter")) && spec.timeOfDay === "night" && dry) s.add("fireflies");
  if (spec.mood === "joyful" && spec.weather !== "rain" && spec.weather !== "snow") s.add("motes");
  return s;
}

function Layer({ kind, on }: { kind: Kind; on: boolean }) {
  const ref = useRef<Points>(null);
  const { gl } = useThree();
  const { time, reduced } = useMotion();
  const geo = useMemo(() => {
    const r = rng(kind.key);
    const pos = new Float32Array(kind.count * 3);
    const seed = new Float32Array(kind.count * 3);
    for (let i = 0; i < kind.count; i++) {
      const ext = kind.radius ?? 6.5;
      pos[i * 3] = r.range(-ext, ext);
      pos[i * 3 + 1] = r.range(0, kind.height);
      pos[i * 3 + 2] = r.range(-ext, ext);
      seed[i * 3] = r();
      seed[i * 3 + 1] = r();
      seed[i * 3 + 2] = r();
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new BufferAttribute(seed, 3));
    return g;
  }, [kind]);
  const mat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        blending: kind.additive ? AdditiveBlending : NormalBlending,
        uniforms: {
          uTime: { value: 0 },
          uSize: { value: kind.size },
          uOpacity: { value: 0 },
          uFall: { value: kind.fall },
          uSway: { value: kind.sway },
          uSpin: { value: kind.spin },
          uHeight: { value: kind.height },
          uBase: { value: kind.base },
          uPixelRatio: { value: 1 },
          uBlink: { value: kind.blink },
          uShape: { value: kind.shape },
          uColorA: { value: new Color(kind.a) },
          uColorB: { value: new Color(kind.b) },
        },
      }),
    [kind],
  );
  useEffect(() => () => {
    geo.dispose();
    mat.dispose();
  }, [geo, mat]);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    const target = on ? kind.opacity : 0;
    const cur = u.uOpacity!.value as number;
    u.uOpacity!.value = reduced ? target : cur + (target - cur) * (1 - Math.exp(-dt * 2.2));
    u.uTime!.value = reduced ? 3.3 : time();
    u.uPixelRatio!.value = gl.getPixelRatio();
    if (ref.current) ref.current.visible = (u.uOpacity!.value as number) > 0.005;
  });
  return <points ref={ref} geometry={geo} material={mat} frustumCulled={false} renderOrder={5} />;
}

export function Weather({ spec }: { spec: Pick<SceneSpec, "weather" | "season" | "timeOfDay" | "mood" | "flavor"> }) {
  const active = activeKinds(spec);
  return (
    <>
      {KINDS.map((k) => (
        <Layer key={k.key} kind={k} on={active.has(k.key)} />
      ))}
    </>
  );
}
