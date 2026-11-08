/**
 * World walkability check (free, no model calls): composes every setting x activity x home and
 * asserts that no walker, vignette walk or walk-in passes through the hero home or any solid model.
 *   npx tsx scripts/qa/world-walk.ts
 */
import { ACTIVITIES, FLAVORS, HOMES, SETTINGS_PLACE, type SceneSpec } from "../../shared/sim";
import { compose, HALF, type V3 } from "../../src/world/layout";
import { blockedAt, heroRects, obstaclesFor } from "../../src/world/walkable";

let checked = 0;
const fails: string[] = [];
const sample = (pts: V3[], closed: boolean, f: (x: number, z: number) => boolean) => {
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.03));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      if (f(a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t)) return [a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return null;
};
for (const setting of SETTINGS_PLACE)
  for (const activity of ACTIVITIES)
    for (const home of HOMES)
      for (const flavor of [FLAVORS[0], FLAVORS[1], FLAVORS[7]]) {
        const spec: SceneSpec = {
          setting, flavor, placeLabel: `Test ${setting} ${flavor}`, home, activity,
          people: [{ role: "self", ageBand: "adult" }, { role: "partner", ageBand: "adult" }, { role: "child", ageBand: "child" }, { role: "parent", ageBand: "senior" }, { role: "pet", ageBand: "adult" }],
          season: "summer", timeOfDay: "day", weather: "clear", mood: "calm", moment: null, caption: "",
        };
        const L = compose(spec, null);
        const o = obstaclesFor({ half: HALF, pieces: L.pieces, procs: L.procs, hero: L.hero, hills: L.hills, landmark: L.landmark, coast: L.coast });
        const house = { ...o, rects: heroRects(L.hero), circles: [], bands: [], seaX: null };
        for (const p of L.people) {
          checked++;
          const tag = `${setting}/${activity}/${home}/${flavor} ${p.key}`;
          // 1. nothing walks through the house (shrunk by 0.02 so touching the wall line is allowed)
          const inHouse = (x: number, z: number) => blockedAt(house, x, z, 0.04) && !(Math.abs(x) > HALF - 0.3 || Math.abs(z) > HALF - 0.3);
          if (p.path && !L.indoor) {
            const hit = sample(p.path, true, inHouse);
            if (hit) fails.push(`${tag}: path through the house at ${hit.map((v) => v.toFixed(2))}`);
          }
          if (p.key.startsWith("walker")) {
            const hit = sample(p.path!, true, (x, z) => blockedAt(o, x, z, 0.06));
            if (hit) fails.push(`${tag}: walker through an obstacle at ${hit.map((v) => v.toFixed(2))}`);
          }
          if (L.indoor && p.role !== "self" && !p.key.startsWith("walker")) {
            // walk-in: outside part clear of the house, then the door
            const outside = [p.enterFrom, ...p.enterVia.slice(0, -1)];
            const hit = sample(outside, false, inHouse);
            if (hit) fails.push(`${tag}: walk-in through a wall at ${hit.map((v) => v.toFixed(2))}`);
          }
          if (!L.indoor && p.role !== "self" && !p.key.startsWith("walker")) {
            const pts = [p.enterFrom, ...p.enterVia, p.path ? p.path[0]! : p.pos];
            const hit = sample(pts.slice(0, -1).length ? pts.slice(0, -1) : pts, false, inHouse);
            if (hit) fails.push(`${tag}: walk-in through the house at ${hit.map((v) => v.toFixed(2))}`);
          }
        }
      }
console.log(`world-walk: ${checked} people checked, ${fails.length} problems`);
for (const f of fails.slice(0, 40)) console.log("  " + f);
process.exit(fails.length ? 1 : 0);
