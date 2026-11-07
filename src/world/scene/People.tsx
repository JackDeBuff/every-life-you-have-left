/**
 * People and pets: Quaternius rigs, recoloured from the palette (self in hero coral), aged by
 * scale / stoop / grey hair / slower walk, posed by activity, walking loops, walking in and out.
 */
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AnimationMixer,
  Box3,
  Color,
  LoopOnce,
  LoopRepeat,
  MeshStandardMaterial,
  Vector3,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Group,
  type Mesh,
  type Object3D,
} from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { animalUrl, CLIPS_URL, personUrl, type AnimalModel, type PersonModel } from "../assets";
import { HALF, Q_SCALE, type PersonSlot, type Pose, type V3 } from "../layout";
import { SWATCH } from "../palette";
import { clamp01, easeOutBack, usePresence, useMotion, type Present } from "./anim";
import { CarryBox } from "./props";

export interface SelfTracker {
  pos: Vector3;
  /** Moment overrides (Victory, wave...) for the self. */
  override: Pose | null;
}

const GREY = new Color("#C9C6C0");
const PET_H = { Dog: 0.17, Cat: 0.12 };
const petScaleCache = new Map<string, number>();

function recolorPerson(root: Object3D, slot: PersonSlot) {
  const hair = new Color(slot.hair).lerp(GREY, slot.grey);
  const pants = new Color(slot.pants);
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const remap = (mat: MeshStandardMaterial) => {
      const m = mat.clone();
      m.roughness = 0.85;
      m.metalness = 0;
      switch (mat.name) {
        case "Skin":
          m.color.set(slot.skin);
          break;
        case "Hair":
          m.color.copy(hair);
          break;
        case "Shirt":
          m.color.set(slot.shirt);
          break;
        case "Pants":
          m.color.copy(pants);
          break;
        case "Face":
          m.color.set(SWATCH.ink);
          break;
        case "Belt":
        case "Black":
          m.color.copy(pants).multiplyScalar(0.55);
          break;
        case "Hat":
          m.color.copy(hair).multiplyScalar(0.7);
          break;
        case "Vest":
        case "Detail":
        case "Details":
          m.color.set(slot.shirt).multiplyScalar(0.72);
          break;
        case "Beige":
          m.color.set("#E9D8BC");
          break;
        case "Brown":
          m.color.set("#7A5644");
          break;
        default:
          break;
      }
      return m;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map((x) => remap(x as MeshStandardMaterial)) : remap(mesh.material as MeshStandardMaterial);
  });
}

function recolorPet(root: Object3D, model: AnimalModel, seed: number) {
  const coats = model === "Dog" ? ["#D9A86C", "#F3EEE6", "#7A5644", "#2E3A4F"] : ["#E39B4B", "#A9ADB3", "#3A4250", "#F3EEE6"];
  const coat = coats[seed % coats.length]!;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const m = (mesh.material as MeshStandardMaterial).clone();
    m.color.set(coat);
    m.roughness = 0.9;
    mesh.material = m;
  });
}

const CLIP_FOR: Record<Pose, string> = {
  idle: "Idle",
  sit: "SitDown",
  walk: "Walk",
  jog: "Walk",
  carry: "Walk_Carry",
  victory: "Victory",
  wave: "Idle",
  pickup: "PickUp",
  sad: "Idle",
};

/** Walk a closed loop at constant speed; returns position + heading. */
function samplePath(path: V3[], s: number, out: Vector3): number {
  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[i]!;
    const b = path[(i + 1) % path.length]!;
    const l = Math.hypot(b[0] - a[0], b[2] - a[2]);
    segs.push(l);
    total += l;
  }
  let d = ((s % total) + total) % total;
  for (let i = 0; i < path.length; i++) {
    const l = segs[i]!;
    if (d <= l || i === path.length - 1) {
      const a = path[i]!;
      const b = path[(i + 1) % path.length]!;
      const t = l > 0 ? d / l : 0;
      out.set(a[0] + (b[0] - a[0]) * t, 0, a[2] + (b[2] - a[2]) * t);
      return Math.atan2(b[0] - a[0], b[2] - a[2]);
    }
    d -= l;
  }
  return 0;
}

interface Rig {
  root: Object3D;
  mixer: AnimationMixer;
  actions: Record<string, AnimationAction>;
  bones: Record<string, Bone | undefined>;
  baseRot: Record<string, [number, number, number]>;
}

function useRig(url: string, clipsUrl: string, prepare: (root: Object3D) => void, deps: unknown[]): Rig {
  const gltf = useGLTF(url, false, true);
  const clipsGltf = useGLTF(clipsUrl, false, true);
  const rig = useMemo(() => {
    const root = skeletonClone(gltf.scene);
    prepare(root);
    const mixer = new AnimationMixer(root);
    const clips: AnimationClip[] = gltf.animations.length ? gltf.animations : clipsGltf.animations;
    const actions: Record<string, AnimationAction> = {};
    for (const c of clips) actions[c.name] = mixer.clipAction(c);
    const bones: Record<string, Bone | undefined> = {};
    for (const n of ["Torso", "Abdomen", "Neck", "Head", "UpperArm.R", "LowerArm.R", "Shoulder.R"]) bones[n] = root.getObjectByName(n) as Bone | undefined;
    return { root, mixer, actions, bones, baseRot: {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, clipsGltf, ...deps]);
  useEffect(
    () => () => {
      rig.mixer.stopAllAction();
      rig.root.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
      });
    },
    [rig],
  );
  return rig;
}

function play(rig: Rig, name: string, opts: { once?: boolean; timeScale?: number; fade?: number } = {}) {
  const a = rig.actions[name] ?? rig.actions.Idle ?? rig.actions.Walking;
  if (!a) return null;
  for (const [n, other] of Object.entries(rig.actions)) if (n !== name && other.isRunning()) other.fadeOut(opts.fade ?? 0.35);
  a.reset();
  a.setLoop(opts.once ? LoopOnce : LoopRepeat, opts.once ? 1 : Infinity);
  a.clampWhenFinished = !!opts.once;
  a.timeScale = opts.timeScale ?? 1;
  a.fadeIn(opts.fade ?? 0.35).play();
  return a;
}

interface PersonProps {
  pr: Present<PersonSlot>;
  walkIn: boolean;
  self?: SelfTracker;
  frozen: boolean;
}

function Human({ pr, walkIn, self, frozen }: PersonProps) {
  const slot = pr.item;
  const rig = useRig(personUrl(slot.model as PersonModel), CLIPS_URL, (root) => recolorPerson(root, slot), [slot.skin, slot.hair, slot.shirt, slot.pants, slot.grey]);
  return <Mover pr={pr} rig={rig} walkIn={walkIn} self={self} frozen={frozen} scale={Q_SCALE * slot.scale} pet={false} />;
}

function Pet({ pr, walkIn, frozen }: PersonProps) {
  const slot = pr.item;
  const model = slot.model as AnimalModel;
  const url = animalUrl(model);
  const rig = useRig(url, url, (root) => recolorPet(root, model, slot.index + model.length), [model]);
  const scale = useMemo(() => {
    const k = `${model}`;
    let s = petScaleCache.get(k);
    if (s === undefined) {
      const box = new Box3().setFromObject(rig.root);
      const h = Math.max(0.01, box.max.y - box.min.y);
      s = PET_H[model] / h;
      petScaleCache.set(k, s);
    }
    return s;
  }, [model, rig]);
  return <Mover pr={pr} rig={rig} walkIn={walkIn} frozen={frozen} scale={scale} pet />;
}

function Mover({ pr, rig, walkIn, self, frozen, scale, pet }: PersonProps & { rig: Rig; scale: number; pet: boolean }) {
  const slot = pr.item;
  const group = useRef<Group>(null);
  const { time, reduced } = useMotion();
  const state = useRef({ phase: walkIn && !reduced ? "enter" : "place", s: Math.random() * 10, pose: "" as string, pos: new Vector3(), head: 0, born: time() });
  const tmp = useMemo(() => new Vector3(), []);

  // choose the clip whenever the pose / phase changes
  const choose = (phase: string, pose: Pose) => {
    const st = state.current;
    const key = `${phase}:${pose}`;
    if (st.pose === key) return;
    st.pose = key;
    if (pet) {
      play(rig, phase === "place" && !slot.path ? "Idle" : "Walking", { timeScale: pose === "jog" ? 1.6 : 1 });
      return;
    }
    if (phase === "enter" || phase === "exit") {
      play(rig, slot.carry ? "Walk_Carry" : "Walk", { timeScale: slot.ageBand === "senior" ? 0.75 : 1 });
      return;
    }
    const name = CLIP_FOR[pose];
    const slow = slot.ageBand === "senior" ? 0.72 : slot.ageBand === "middle" ? 0.9 : 1;
    if (pose === "sit") play(rig, name, { once: true, timeScale: 1.4 });
    else if (pose === "jog") play(rig, name, { timeScale: 1.75 * slow });
    else if (pose === "walk" || pose === "carry") play(rig, name, { timeScale: (slot.ageBand === "child" ? 1.2 : 1) * slow });
    else if (pose === "victory") play(rig, name, { timeScale: 0.9 });
    else play(rig, name, { timeScale: 0.9 * slow });
  };

  useEffect(() => {
    // re-evaluate pose when slot changes (same person, new activity)
    state.current.pose = "";
  }, [slot.pose, slot.pos, slot.path]);

  useFrame((_, dtRaw) => {
    const g = group.current;
    if (!g) return;
    const dt = frozen ? 0 : Math.min(dtRaw, 0.05);
    const st = state.current;
    const out = pr.state === "out";
    const pose: Pose = !pet && self?.override ? self.override : slot.pose;
    let phase = out ? "exit" : st.phase;

    // target position
    let heading = slot.rotY;
    const target = tmp.set(slot.pos[0], slot.pos[1], slot.pos[2]);
    if (slot.path && phase === "place") {
      st.s += dt * slot.speed;
      heading = samplePath(slot.path, st.s, target);
    }
    if (phase === "enter") {
      // walk from the edge to the spot
      const t = clamp01((time() - st.born) / 2.0);
      const from = slot.enterFrom;
      const end = slot.path ? new Vector3().set(slot.path[0]![0], 0, slot.path[0]![2]) : target;
      target.set(from[0] + (end.x - from[0]) * t, 0, from[2] + (end.z - from[2]) * t);
      heading = Math.atan2(end.x - from[0], end.z - from[2]);
      if (t >= 1) st.phase = phase = "place";
    }
    if (phase === "exit") {
      const t = clamp01((time() - pr.t0) / 1.6);
      const dir = Math.sign(st.pos.x || 1);
      target.set(st.pos.x + dir * dt * 0.6, 0, st.pos.z + dt * 0.4);
      heading = Math.atan2(dir * 0.6, 0.4);
      g.scale.setScalar(scale * (1 - t));
      g.visible = t < 1;
    } else {
      const k = phase === "enter" || reduced ? 1 : easeOutBack(clamp01((time() - pr.t0 - 0.2) / 0.6), 1.4);
      g.scale.setScalar(Math.max(0.0001, k) * scale);
    }
    choose(phase, pose);

    // ease toward the target (smooths spec changes for standing people)
    if (st.pos.lengthSq() === 0 || reduced) st.pos.copy(target);
    else st.pos.lerp(target, 1 - Math.exp(-dt * (phase === "place" && !slot.path ? 4 : 30)));
    st.pos.x = Math.max(-HALF + 0.15, Math.min(HALF - 0.15, st.pos.x));
    st.pos.z = Math.max(-HALF + 0.15, Math.min(HALF - 0.15, st.pos.z));
    g.position.copy(st.pos);
    let dh = heading - st.head;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    st.head += dh * (1 - Math.exp(-dt * 8));
    if (reduced) st.head = heading;
    g.rotation.y = st.head;

    rig.mixer.update(dt);
    if (!pet) {
      // ageing posture + procedural wave, applied on top of the clip
      const b = rig.bones;
      if (slot.stoop > 0 && phase !== "exit") {
        if (b.Torso) b.Torso.rotation.x += 0.16 * slot.stoop;
        if (b.Neck) b.Neck.rotation.x += 0.1 * slot.stoop;
      }
      if (pose === "wave" && b["UpperArm.R"] && b["LowerArm.R"]) {
        const w = Math.sin(time() * 9) * 0.35;
        b["UpperArm.R"].rotation.z += 2.1;
        b["LowerArm.R"].rotation.z += 0.6 + w;
      }
      if (pose === "sad" && b.Neck) b.Neck.rotation.x += 0.35;
    }
    if (self && slot.role === "self") self.pos.copy(st.pos);
  });

  return (
    <group ref={group}>
      <primitive object={rig.root} />
      {slot.carry === "box" && !pet && <CarryBox />}
    </group>
  );
}

export function People({ people, islandBorn, self, frozen }: { people: PersonSlot[]; islandBorn: number; self: SelfTracker; frozen: boolean }) {
  const { time } = useMotion();
  const list = usePresence(people, (p) => `${p.key}|${p.model}`, 1700, time);
  return (
    <>
      {list.map((pr) => {
        const walkIn = pr.t0 - islandBorn > 0.6 && pr.item.role !== "self" && !pr.item.key.startsWith("walker");
        return pr.item.pet ? (
          <Pet key={pr.key} pr={pr} walkIn={walkIn} frozen={frozen} />
        ) : (
          <Human key={pr.key} pr={pr} walkIn={walkIn} self={self} frozen={frozen} />
        );
      })}
    </>
  );
}

