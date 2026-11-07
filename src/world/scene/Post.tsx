/**
 * Post chain (docs/WORLD.md §4): gentle N8AO -> soft bloom -> mood grade (custom) -> neutral tone map ->
 * very light tilt-shift -> vignette. No grain, no chromatic aberration.
 */
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, TiltShift2, ToneMapping, Vignette } from "@react-three/postprocessing";
import { BlendFunction, Effect, ToneMappingMode, type BloomEffect, type VignetteEffect } from "postprocessing";
import { useMemo, useRef } from "react";
import { Color, Uniform } from "three";
import { useLookRef } from "./look";

const gradeFrag = /* glsl */ `
uniform float uSat; uniform float uExposure; uniform float uContrast; uniform float uSplit; uniform float uMemory;
uniform vec3 uShadow; uniform vec3 uHighlight;
const vec3 W = vec3(0.2126, 0.7152, 0.0722);
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb * exp2(uExposure);
  float l = dot(c, W);
  float sat = uSat - uMemory * 0.22;
  c = mix(vec3(l), c, 1.0 + sat);
  c = max((c - 0.18) * (1.0 + uContrast) + 0.18, 0.0);
  float lw = smoothstep(0.02, 0.5, l);
  vec3 sh = uShadow / max(dot(uShadow, W), 1e-3);
  vec3 hi = uHighlight / max(dot(uHighlight, W), 1e-3);
  vec3 tint = mix(sh, hi, lw);
  c *= mix(vec3(1.0), tint, uSplit);
  c = mix(c, c * vec3(0.94, 0.98, 1.06), uMemory * 0.6);
  outputColor = vec4(c, inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super("GradeEffect", gradeFrag, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uSat", new Uniform(0)],
        ["uExposure", new Uniform(0)],
        ["uContrast", new Uniform(0)],
        ["uSplit", new Uniform(0.12)],
        ["uMemory", new Uniform(0)],
        ["uShadow", new Uniform(new Color("#2E5F7A"))],
        ["uHighlight", new Uniform(new Color("#FFF1DE"))],
      ]),
    });
  }
}

/** The N8AO pass object (the wrapper forwards its ref to it). */
interface AOPass {
  autoDetectTransparency: boolean;
  configuration: { transparencyAware: boolean };
}

/**
 * N8AO's transparency mode switches itself on whenever any material in the scene is transparent
 * (water, blob shadows, weather), and then traverses the scene four times and renders it twice
 * more on every frame: 3 scene renders instead of 1. The AO is subtle enough that letting it see
 * through those few surfaces is invisible, so it stays off. (A callback ref: the composer mounts
 * its children a render after this component's own effects run.)
 */
function quietAO(p: AOPass | null) {
  if (!p) return;
  p.autoDetectTransparency = false;
  p.configuration.transparencyAware = false;
}

export interface PostProps {
  /** 0..1 "memory" grade for interlude cuts (cooler, less saturated). */
  memory: MutableNumber;
  /** 2 high, 1 medium, 0 low (no AO, no tilt-shift, no MSAA). */
  tier: 0 | 1 | 2;
}
export interface MutableNumber {
  current: number;
}

export function Post({ memory, tier }: PostProps) {
  const look = useLookRef();
  const grade = useMemo(() => new GradeEffect(), []);
  const bloom = useRef<BloomEffect>(null);
  const vignette = useRef<VignetteEffect>(null);
  useFrame(() => {
    const L = look.current;
    const u = grade.uniforms;
    u.get("uSat")!.value = L.saturation;
    u.get("uExposure")!.value = L.exposure;
    u.get("uContrast")!.value = L.contrast;
    u.get("uSplit")!.value = L.split;
    u.get("uMemory")!.value = memory.current;
    (u.get("uShadow")!.value as Color).copy(L.shadowTint);
    (u.get("uHighlight")!.value as Color).copy(L.highlightTint);
    if (bloom.current) bloom.current.intensity = L.bloom;
    if (vignette.current) vignette.current.darkness = L.vignette + memory.current * 0.15;
  });
  return (
    <EffectComposer key={`t${tier}`} multisampling={tier === 2 ? 4 : tier === 1 ? 2 : 0} enableNormalPass={false}>
      {tier > 0 ? <N8AO ref={quietAO} halfRes aoRadius={0.55} distanceFalloff={0.6} intensity={2.2} quality={tier === 2 ? "medium" : "performance"} color="#1E2A38" /> : <></>}
      <Bloom ref={bloom} mipmapBlur luminanceThreshold={0.82} luminanceSmoothing={0.2} intensity={0.3} radius={0.65} />
      <primitive object={grade} dispose={null} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      {tier > 0 ? <TiltShift2 blur={0.08} taper={0.55} start={[0.5, 0.0]} end={[0.5, 1.0]} samples={tier === 2 ? 8 : 5} /> : <></>}
      <Vignette ref={vignette} offset={0.32} darkness={0.22} eskil={false} />
    </EffectComposer>
  );
}
