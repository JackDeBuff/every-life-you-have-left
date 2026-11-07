/**
 * Sky dome, sun + hemisphere light, fog, and the cloud layers (a sea of clouds below the island,
 * a few puffs drifting at eye level). Everything reads the blending Look each frame.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  BackSide,
  Color,
  Fog,
  InstancedMesh,
  Matrix4,
  Object3D,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type DirectionalLight,
  type HemisphereLight,
} from "three";
import { GLOW_MATERIALS } from "../assets";
import { MATS, updateMaterials } from "../materials";
import { rng } from "../rng";
import { useMotion } from "./anim";
import { useLookRef } from "./look";
import { BLOB_MAT } from "./props";
import { markShadows } from "./shadows";

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
  gl_Position = p.xyww;
}`;
const skyFrag = /* glsl */ `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom; uniform vec3 uSunDir; uniform vec3 uSun;
uniform float uGlow; uniform float uStars;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  // The camera looks down ~30 deg, so the visible backdrop is below the true horizon: shift the
  // gradient so the frame reads top colour -> horizon glow -> soft bottom.
  vec3 col = h > -0.78 ? mix(uHorizon, uTop, smoothstep(-0.74, -0.12, h)) : mix(uHorizon, uBottom, smoothstep(-0.78, -1.0, h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSun * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6) * uGlow;
  float star = step(0.9965, hash(floor(d * 220.0))) * smoothstep(-0.6, -0.2, h);
  col += vec3(0.9, 0.95, 1.0) * star * uStars * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function Atmosphere({ center, shadowSize = 2048 }: { center: [number, number, number]; shadowSize?: number }) {
  const look = useLookRef();
  const { scene, camera } = useThree();
  const sun = useRef<DirectionalLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const skyMat = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new Color() },
          uHorizon: { value: new Color() },
          uBottom: { value: new Color() },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSun: { value: new Color() },
          uGlow: { value: 0 },
          uStars: { value: 0 },
        },
      }),
    [],
  );
  const skyGeo = useMemo(() => new SphereGeometry(90, 32, 16), []);
  const fog = useMemo(() => new Fog("#ffffff", 30, 80), []);
  useEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
      skyMat.dispose();
      skyGeo.dispose();
    };
  }, [scene, fog, skyMat, skyGeo]);

  const target = useMemo(() => new Object3D(), []);
  useEffect(() => {
    scene.add(target);
    return () => {
      scene.remove(target);
    };
  }, [scene, target]);

  const tmp = useMemo(() => new Color(), []);
  const dir = useMemo(() => new Vector3(), []);
  const lastSun = useMemo(() => new Vector3(0, -1, 0), []);
  const sunTick = useRef(0);
  useFrame(() => {
    const L = look.current;
    const u = skyMat.uniforms;
    (u.uTop!.value as Color).copy(L.skyTop);
    (u.uHorizon!.value as Color).copy(L.skyHorizon);
    (u.uBottom!.value as Color).copy(L.skyHorizon).lerp(tmp.set("#ffffff"), 0.18);
    (u.uSun!.value as Color).copy(L.sun);
    u.uGlow!.value = 0.25 + L.windowGlow * 0.3;
    u.uStars!.value = L.stars;
    const el = (L.sunElevation * Math.PI) / 180;
    const az = (L.sunAzimuth * Math.PI) / 180;
    dir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    (u.uSunDir!.value as Vector3).copy(dir);
    if (sun.current) {
      sun.current.position.set(center[0] + dir.x * 20, dir.y * 20, center[2] + dir.z * 20);
      // the shadow map only re-renders when the sun (or the island under it) has moved a visible
      // step (~0.15 deg), and while the sun glides through a look blend only every 4th frame
      // (a 60 ms lag nobody sees); a jump (new island) updates at once
      const moved = sun.current.position.distanceToSquared(lastSun);
      sunTick.current++;
      if (moved > 1 || (moved > 0.0025 && sunTick.current % 4 === 0)) {
        lastSun.copy(sun.current.position);
        markShadows(1);
      }
      target.position.set(center[0], 0, center[2]);
      sun.current.target = target;
      sun.current.color.copy(L.sun);
      sun.current.intensity = L.sunIntensity * (0.55 + 0.45 * L.shadowStrength);
    }
    if (hemi.current) {
      hemi.current.color.copy(L.hemiSky);
      hemi.current.groundColor.copy(L.hemiGround);
      hemi.current.intensity = L.hemiIntensity * (1.25 - 0.25 * L.shadowStrength);
    }
    const D = camera.position.length();
    const haze = Math.min(1, Math.max(0, (L.fogDensity - 0.004) / 0.036));
    fog.color.copy(L.fog);
    fog.near = D + 3 - haze * 12;
    fog.far = D + 70 - haze * 58;
    updateMaterials(L);
    BLOB_MAT.opacity = 0.16 + 0.2 * L.shadowStrength;
    for (const m of GLOW_MATERIALS) m.emissiveIntensity = L.windowGlow * 1.3;
  });

  return (
    <>
      <mesh geometry={skyGeo} material={skyMat} renderOrder={-10} frustumCulled={false} />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.025}
        shadow-radius={4}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-camera-near={1}
        shadow-camera-far={45}
      />
      <Clouds />
    </>
  );
}

const PUFF = new SphereGeometry(1, 12, 8);

/** A soft sea of clouds below and a few drifting puffs around the island. */
function Clouds() {
  const below = useRef<InstancedMesh>(null);
  const around = useRef<InstancedMesh>(null);
  const look = useLookRef();
  const { time, reduced } = useMotion();
  const data = useMemo(() => {
    const r = rng("clouds");
    const sea = Array.from({ length: 46 }, () => {
      const a = r.range(0, Math.PI * 2);
      const d = r.range(7, 28);
      return { x: Math.cos(a) * d, y: r.range(-11, -8.5), z: Math.sin(a) * d, s: r.range(1.6, 3.4), sy: r.range(0.45, 0.65) };
    });
    const puffs = Array.from({ length: 7 }, (_, i) => {
      const a = (i / 7) * Math.PI * 2 + r.range(-0.3, 0.3);
      const d = r.range(13, 18);
      return { a, d, y: r.range(-2.5, 1.5), s: r.range(0.6, 1.0), speed: r.range(0.008, 0.02), parts: r.int(3, 5), seed: r.range(0, 10) };
    });
    return { sea, puffs };
  }, []);
  const m = useMemo(() => new Matrix4(), []);
  useEffect(() => {
    const mesh = below.current;
    if (!mesh) return;
    const o = new Object3D();
    data.sea.forEach((c, i) => {
      o.position.set(c.x, c.y, c.z);
      o.scale.set(c.s, c.s * c.sy, c.s);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [data]);
  const total = data.puffs.reduce((s, p) => s + p.parts, 0);
  const o = useMemo(() => new Object3D(), []);
  useFrame(() => {
    const mesh = around.current;
    if (!mesh) return;
    const t = reduced ? 0 : time();
    let k = 0;
    const vis = 0.35 + look.current.cloudiness * 0.65;
    for (const p of data.puffs) {
      const a = p.a + t * p.speed;
      const cx = Math.cos(a) * p.d;
      const cz = Math.sin(a) * p.d;
      for (let j = 0; j < p.parts; j++) {
        const off = (j - (p.parts - 1) / 2) * 0.55 * p.s;
        o.position.set(cx + Math.cos(a + Math.PI / 2) * off, p.y + Math.sin(j * 1.7 + p.seed) * 0.12, cz + Math.sin(a + Math.PI / 2) * off);
        const s = p.s * (0.65 + 0.35 * Math.sin(j * 2.1 + p.seed) ** 2) * vis;
        o.scale.set(s, s * 0.62, s);
        o.updateMatrix();
        mesh.setMatrixAt(k++, o.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    m.identity();
  });
  return (
    <>
      <instancedMesh ref={below} args={[PUFF, MATS.cloud, data.sea.length]} frustumCulled={false} />
      <instancedMesh ref={around} args={[PUFF, MATS.cloud, total]} frustumCulled={false} />
    </>
  );
}
