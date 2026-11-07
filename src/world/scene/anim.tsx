/**
 * Motion primitives: easing, a presence list (keeps removed items alive while they animate out),
 * and <Pop>, the spring-overshoot grow-in / ease-in sink-out used for every piece.
 */
import { useFrame } from "@react-three/fiber";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Group } from "three";

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const easeOutBack = (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const easeInBack = (t: number, s = 1.70158) => (s + 1) * t * t * t - s * t * t;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);

export const now = () => performance.now() / 1000;

export interface WorldMotion {
  reduced: boolean;
  /** Seconds; pausing freezes animation time. */
  time: () => number;
}
export const MotionCtx = createContext<WorldMotion>({ reduced: false, time: now });
export const useMotion = () => useContext(MotionCtx);

export interface Present<T> {
  key: string;
  item: T;
  state: "in" | "out";
  t0: number;
}

/** Keeps items that disappeared for `exitMs` so they can animate out. */
export function usePresence<T>(items: T[], keyOf: (t: T) => string, exitMs: number, time: () => number): Present<T>[] {
  const prev = useRef<Map<string, Present<T>>>(new Map());
  const [, force] = useState(0);
  const list = useMemo(() => {
    const t = time();
    const next = new Map<string, Present<T>>();
    for (const item of items) {
      const k = keyOf(item);
      const old = prev.current.get(k);
      next.set(k, { key: k, item, state: "in", t0: old && old.state === "in" ? old.t0 : t });
    }
    for (const [k, old] of prev.current) {
      if (next.has(k)) continue;
      if (old.state === "out" && t - old.t0 > exitMs / 1000) continue;
      next.set(k, old.state === "out" ? old : { ...old, state: "out", t0: t });
    }
    prev.current = next;
    return [...next.values()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const hasOut = list.some((p) => p.state === "out");
  useEffect(() => {
    if (!hasOut) return;
    const id = window.setTimeout(() => {
      const t = time();
      let changed = false;
      for (const [k, p] of prev.current)
        if (p.state === "out" && t - p.t0 > exitMs / 1000 - 0.01) {
          prev.current.delete(k);
          changed = true;
        }
      if (changed) force((x) => x + 1);
    }, exitMs + 30);
    return () => window.clearTimeout(id);
  }, [list, hasOut, exitMs, time]);
  // after a cleanup tick, return the pruned map
  return hasOut ? [...prev.current.values()] : list;
}

export const POP_IN = 0.75;
export const POP_OUT = 0.5;

interface PopProps {
  state: "in" | "out";
  t0: number;
  delay?: number;
  children: ReactNode;
  /** Rise from below while growing (pieces), or only scale (people props). */
  rise?: number;
  position?: [number, number, number];
  rotationY?: number;
  scale?: number;
}

/** Grow in with a soft overshoot; sink out. Stops touching the scene graph once settled. */
export function Pop({ state, t0, delay = 0, children, rise = 0.25, position, rotationY = 0, scale = 1 }: PopProps) {
  const ref = useRef<Group>(null);
  const { reduced, time } = useMotion();
  const settled = useRef<string>("");
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const tag = `${state}${t0}`;
    if (settled.current === tag) return;
    let k: number;
    if (reduced) k = state === "in" ? 1 : 0;
    else if (state === "in") {
      const t = clamp01((time() - t0 - delay) / POP_IN);
      k = t <= 0 ? 0 : easeOutBack(t, 1.6);
      if (t >= 1) settled.current = tag;
    } else {
      const t = clamp01((time() - t0 - delay * 0.4) / POP_OUT);
      k = 1 - easeInBack(t, 1.2);
      if (t >= 1) settled.current = tag;
    }
    const s = Math.max(0.0001, k) * scale;
    g.scale.set(s, s, s);
    g.position.y = (position?.[1] ?? 0) - (1 - Math.min(1, k)) * rise;
    g.visible = k > 0.002;
  });
  return (
    <group ref={ref} position={position} rotation-y={rotationY} scale={0.0001} visible={false}>
      {children}
    </group>
  );
}
