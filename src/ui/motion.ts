/** Motion helpers shared by the choreographies (docs/UI.md §6). */
import { gsap } from "gsap";

export const reducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export const EASE = {
  settle: "expo.out",
  exit: "expo.in",
  tide: "sine.inOut",
  spring: "back.out(1.5)",
} as const;

export const DUR = { press: 0.09, micro: 0.14, quick: 0.22, base: 0.36, slow: 0.64 } as const;

gsap.defaults({ ease: EASE.settle, duration: DUR.base });

/** The sun drifts gold → amber → evening coral as the life goes on. t in [0, 1]. */
const STOPS: [number, [number, number, number]][] = [
  [0, [245, 178, 31]],
  [0.5, [255, 140, 43]],
  [1, [255, 95, 74]],
];
export function sunAt(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i]!;
    const [b, cb] = STOPS[i + 1]!;
    if (x >= a && x <= b) {
      const k = (x - a) / (b - a);
      const c = ca.map((v, j) => Math.round(v + (cb[j]! - v) * k));
      return `rgb(${c[0]} ${c[1]} ${c[2]})`;
    }
  }
  return "rgb(255 95 74)";
}

export function setSun(t: number) {
  document.documentElement.style.setProperty("--sun", sunAt(t));
}

export { gsap };
