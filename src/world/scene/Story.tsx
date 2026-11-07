/**
 * The year's story inside the canvas: name tags that follow the characters, and the "beat" camera
 * (a gentle push toward whatever changed this year: the newborn, the new partner, the new home),
 * which then settles back to the turntable framing. Reduced motion: tags only, no camera move.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Vector3 } from "three";
import type { SceneSpec } from "../../../shared/sim";
import type { Layout } from "../layout";
import type { WorldStory } from "../story";
import { useMotion } from "./anim";
import type { RigState } from "./CameraRig";
import type { SelfTracker } from "./People";

/**
 * Positions the DOM name tags (World.tsx) over the characters every frame, writing styles only
 * when they change. Hidden in interludes and while a new island is still rising.
 */
export function NameTags({ tags, self, hidden, rising }: { tags: Map<string, HTMLElement>; self: SelfTracker; hidden: boolean; rising: number | null }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const { time } = useMotion();
  const v = useMemo(() => new Vector3(), []);
  const last = useMemo(() => new Map<HTMLElement, string>(), []);
  const widths = useMemo(() => new Map<HTMLElement, number>(), []);
  const frame = useRef(0);
  const placed = useMemo(() => [] as { el: HTMLElement; x: number; y: number; w: number }[], []);
  useFrame(() => {
    const hide = hidden || (rising !== null && time() - rising < 2.0);
    placed.length = 0;
    const measure = frame.current++ % 30 === 0;
    for (const [key, el] of tags) {
      const c = self.cast.get(key);
      if (hide || !c?.on) continue;
      v.copy(c.pos);
      v.y += c.h + 0.04;
      v.project(camera);
      if (v.z >= 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue;
      let w = widths.get(el);
      if (w === undefined || measure) widths.set(el, (w = el.offsetWidth || 44));
      placed.push({ el, x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, w });
    }
    // two people side by side: lift the farther one's tag so both stay readable
    placed.sort((a, b) => b.y - a.y);
    for (let i = 1; i < placed.length; i++) {
      const p = placed[i]!;
      for (let guard = 0; guard < 4; guard++) {
        const hit = placed.slice(0, i).some((q) => Math.abs(q.x - p.x) < (q.w + p.w) / 2 + 3 && Math.abs(q.y - p.y) < 19);
        if (!hit) break;
        p.y -= 19;
      }
    }
    const shown = new Set<HTMLElement>();
    for (const p of placed) {
      shown.add(p.el);
      const css = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      if (last.get(p.el) === css) continue;
      last.set(p.el, css);
      p.el.style.transform = css;
      p.el.dataset.on = "true";
    }
    for (const el of tags.values()) {
      if (shown.has(el) || last.get(el) === "off") continue;
      last.set(el, "off");
      el.dataset.on = "false";
    }
  }, 0.95);
  return null;
}

const BEAT_HOLD = 2.6;

/**
 * The beat camera: eases the rig's push toward the beat's subject for ~2.6 s, then releases.
 * A moment's cinematic owns the push while it plays; interlude shots and reduced motion skip it.
 */
export function BeatDirector({ story, applied, layout, self, rig, moment }: { story: WorldStory | null; applied: SceneSpec; layout: Layout; self: SelfTracker; rig: MutableRefObject<RigState>; moment: boolean }) {
  const { time, reduced } = useMotion();
  const beat = story?.beat ?? null;
  const token = beat ? `${story!.year}|${beat.text}` : null;
  const st = useRef({ token: null as string | null, t0: -99, push: 0, owned: false });
  const target = useMemo(() => new Vector3(), []);
  useEffect(() => {
    if (token && token !== st.current.token) {
      st.current.token = token;
      st.current.t0 = time();
    }
  }, [token, time]);
  // a new place: wait for the island to rise before leaning in
  const delay = useRef(0);
  useEffect(() => {
    delay.current = beat?.kind === "move" ? 1.4 : 0.2;
  }, [beat?.kind, applied.placeLabel]);
  useFrame((_, dtRaw) => {
    const s = st.current;
    const R = rig.current;
    if (moment || reduced || R.shot) {
      s.push = 0;
      s.owned = false;
      return;
    }
    const dt = Math.min(dtRaw, 0.05);
    const k = time() - s.t0 - delay.current;
    const live = !!beat && token === s.token && k > 0 && k < BEAT_HOLD;
    const peak = layout.indoor ? 0.3 : 0.5;
    const want = live ? peak : 0;
    s.push += (want - s.push) * (1 - Math.exp(-dt * (want > s.push ? 2.0 : 1.4)));
    if (!live && s.push < 0.003) {
      if (s.owned) R.push = 0;
      s.owned = false;
      s.push = 0;
      return;
    }
    if (live) {
      const f = beat!.focus;
      if (f === "home") target.set(layout.hero.pos[0] + layout.hero.w * 0.2, 0.45, layout.hero.pos[2] + layout.hero.d * 0.2);
      else if (f === "stage") target.set(layout.stage[0], 0.3, layout.stage[2]);
      else {
        const c = self.cast.get(f)?.on ? self.cast.get(f)! : self.cast.get("self0");
        if (c) target.set(c.pos.x, 0.3, c.pos.z);
      }
      if (!s.owned) R.pushTarget.copy(target);
      else R.pushTarget.lerp(target, 1 - Math.exp(-dt * 3));
    }
    R.push = s.push;
    s.owned = true;
  });
  return null;
}
