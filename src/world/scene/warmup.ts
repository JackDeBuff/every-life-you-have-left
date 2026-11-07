/**
 * Shader warm-up. three.js compiles a program the first time a material variant is drawn; the
 * moments' confetti, motes and gold props are variants nothing else uses, so the first wedding or
 * graduation used to stall its first frame on a burst of compiles. Shortly after the first island
 * is up we compile stand-ins for those variants in the background (compileAsync uses
 * KHR_parallel_shader_compile where available). Programs are shared by material parameters, so
 * the real ones later hit the cache. The stand-ins are never disposed, which keeps the programs.
 */
import { AdditiveBlending, BoxGeometry, Color, DoubleSide, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial, type Camera, type Scene, type WebGLRenderer } from "three";
import { MATS } from "../materials";

let warmed = false;

export function warmShaders(gl: WebGLRenderer, scene: Scene, camera: Camera) {
  if (warmed) return;
  warmed = true;
  const geo = new BoxGeometry(0.01, 0.01, 0.01);
  const g = new Group();
  const inst = (mat: MeshStandardMaterial | MeshBasicMaterial, color = false) => {
    const m = new InstancedMesh(geo, mat, 1);
    if (color) m.setColorAt(0, new Color("#ffffff"));
    g.add(m);
  };
  // Burst (confetti / petals): instanced + per-instance colour, double-sided standard
  inst(new MeshStandardMaterial({ roughness: 0.7, side: DoubleSide }), true);
  // Motes / sparkles: instanced additive basic
  inst(new MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: AdditiveBlending, depthWrite: false }));
  // trails and caps: instanced palette standard
  inst(MATS.white);
  // gold props and glow cards
  g.add(new Mesh(geo, new MeshStandardMaterial({ color: "#E8B04A", roughness: 0.35, metalness: 0.6, emissive: new Color("#7A4E10"), emissiveIntensity: 0.4 })));
  g.add(new Mesh(geo, new MeshBasicMaterial({ color: "#FFE3A3", transparent: true, opacity: 0.5, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })));
  try {
    void gl.compileAsync(g, camera, scene).catch(() => {});
  } catch {
    /* compile is an optimisation only */
  }
}
