/**
 * Where people may walk on the island (owner, Sat Nov 7: walkers were "breaking through the wall of
 * my house" and strolling through the living room).
 *
 * Obstacles come from what the layout actually placed: the hero home (walls, steps, porch), every
 * kit model by its real footprint (manifest bounds x scale, rotated), solid procedural props, the
 * landmark's lot, the canal and the sea. Ambient walkers keep to sidewalks and only use the stretch
 * that is clear; vignette walks and walk-ins are routed around obstacles with a small grid A*.
 * Pure and deterministic, like the rest of the layout.
 */
import { bounds } from "./assets";
import type { LandmarkSpec } from "./landmarks";
import type { PieceSpec, ProcSpec, ProcType, V3 } from "./layout";

interface Rect {
  x: number;
  z: number;
  hw: number;
  hd: number;
  rot: number;
}
interface Circle {
  x: number;
  z: number;
  r: number;
}
export interface Obstacles {
  half: number;
  rects: Rect[];
  circles: Circle[];
  bands: { z: number; half: number }[];
  /** Coast: the sea starts left of this x. */
  seaX: number | null;
  grid?: { c: number; blocked: Uint8Array };
}

/** Half a person's shoulder width at PERSON_H = 0.6, plus a hair of air. */
export const BODY = 0.08;

/** Flat or overhead procs people can walk over / under. */
const OPEN: ReadonlySet<ProcType> = new Set<ProcType>(["road", "roadZ", "sidewalk", "crosswalk", "path", "plaza", "lawn", "field", "picnic", "stringLights", "wallArt", "wallArtZ", "hill"]);
const TREE = /Tree|Willow|Cactus/;
const GROUND_COVER = /^(Grass|Flowers|Plant_[123]|Wheat|Corn|Lilypad)/;

export interface HeroFootprint {
  pos: V3;
  w: number;
  d: number;
  porch: boolean;
  arcade: boolean;
}

/** The front door of the hero home, outside and inside (world). */
export function heroDoor(h: HeroFootprint): { out: V3; inside: V3 } {
  const x = h.pos[0] + h.w * 0.28;
  const front = h.pos[2] + h.d / 2;
  return { out: [x, 0, front + 0.36], inside: [x, 0, front - 0.22] };
}

export function heroRects(h: HeroFootprint): Rect[] {
  const [x, , z] = h.pos;
  const out: Rect[] = [
    { x, z, hw: h.w / 2 + 0.06, hd: h.d / 2 + 0.06, rot: 0 }, // walls + plinth
    { x: x + h.w * 0.28, z: z + h.d / 2 + 0.12, hw: 0.18, hd: 0.1, rot: 0 }, // door step
  ];
  if (h.porch) out.push({ x: x - h.w * 0.18, z: z + h.d / 2 + 0.24, hw: h.w * 0.27, hd: 0.26, rot: 0 });
  // the shophouse arcade is a colonnade: only its columns block (you walk under it to the door)
  if (h.arcade) for (const t of [-0.45, -0.15, 0.15, 0.45]) out.push({ x: x + t * h.w, z: z + h.d / 2 + 0.32, hw: 0.04, hd: 0.04, rot: 0 });
  return out;
}

function pieceObstacle(p: PieceSpec): Rect | Circle | null {
  if (p.kit === "interior" || p.kit === "food") return null;
  if (p.kit === "nature") {
    if (GROUND_COVER.test(p.id)) return null;
    if (TREE.test(p.id)) return { x: p.pos[0], z: p.pos[2], r: p.id.startsWith("Palm") || p.id.startsWith("Cactus") ? 0.12 : 0.2 };
    const b = bounds(p.kit, p.id);
    return { x: p.pos[0], z: p.pos[2], r: 0.35 * Math.max(b.max[0]! - b.min[0]!, b.max[2]! - b.min[2]!) * p.scale };
  }
  if (p.id.startsWith("detail-awning")) return null; // overhead
  const b = bounds(p.kit, p.id);
  const cx = (b.min[0]! + b.max[0]!) / 2;
  const cz = (b.min[2]! + b.max[2]!) / 2;
  const c = Math.cos(p.rotY);
  const s = Math.sin(p.rotY);
  const ox = (cx * c + cz * s) * p.scale;
  const oz = (-cx * s + cz * c) * p.scale;
  return { x: p.pos[0] + ox, z: p.pos[2] + oz, hw: ((b.max[0]! - b.min[0]!) / 2) * p.scale, hd: ((b.max[2]! - b.min[2]!) / 2) * p.scale, rot: p.rotY };
}

export function obstaclesFor(a: {
  half: number;
  pieces: PieceSpec[];
  procs: ProcSpec[];
  hero: HeroFootprint;
  hills: { pos: V3; r: number }[];
  landmark: LandmarkSpec | null;
  coast: boolean;
}): Obstacles {
  const o: Obstacles = { half: a.half, rects: heroRects(a.hero), circles: [], bands: [], seaX: a.coast ? -1.0 : null };
  for (const p of a.pieces) {
    const x = pieceObstacle(p);
    if (!x) continue;
    if ("r" in x) o.circles.push(x);
    else o.rects.push(x);
  }
  for (const p of a.procs) {
    if (OPEN.has(p.type)) continue;
    o.rects.push({ x: p.pos[0], z: p.pos[2], hw: p.size[0] / 2, hd: p.size[2] / 2, rot: p.rotY });
  }
  for (const h of a.hills) o.circles.push({ x: h.pos[0], z: h.pos[2], r: h.r * 0.8 });
  if (a.landmark) {
    for (const c of a.landmark.clear) o.circles.push({ x: c.x, z: c.z, r: c.r * 0.85 });
    if (a.landmark.band) o.bands.push(a.landmark.band);
  }
  return o;
}

export function blockedAt(o: Obstacles, x: number, z: number, c = BODY): boolean {
  const h = o.half;
  if (Math.abs(x) > h - 0.3 || Math.abs(z) > h - 0.3) return true;
  const cx = Math.max(0, Math.abs(x) - (h - 0.9));
  const cz = Math.max(0, Math.abs(z) - (h - 0.9));
  if (Math.hypot(cx, cz) > 0.5) return true;
  if (o.seaX !== null && x < o.seaX) return true;
  for (const b of o.bands) if (Math.abs(z - b.z) < b.half + c) return true;
  for (const k of o.circles) if (Math.hypot(k.x - x, k.z - z) < k.r + c) return true;
  for (const r of o.rects) {
    const dx = x - r.x;
    const dz = z - r.z;
    const cs = Math.cos(r.rot);
    const sn = Math.sin(r.rot);
    const lx = dx * cs - dz * sn;
    const lz = dx * sn + dz * cs;
    if (Math.abs(lx) < r.hw + c && Math.abs(lz) < r.hd + c) return true;
  }
  return false;
}

const STEP = 0.04;

export function segmentClear(o: Obstacles, a: V3, b: V3, c = BODY): boolean {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / STEP));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (blockedAt(o, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, c)) return false;
  }
  return true;
}

/** The longest clear stretch of the line a-b, or null when none is at least `minLen` long. */
export function clearRun(o: Obstacles, a: V3, b: V3, minLen: number, c = BODY): [V3, V3] | null {
  const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const n = Math.max(1, Math.ceil(len / STEP));
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= n + 1; i++) {
    const t = i / n;
    const free = i <= n && !blockedAt(o, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, c);
    if (free && start < 0) start = i;
    if (!free && start >= 0) {
      const end = i - 1;
      if (!best || end - start > best[1] - best[0]) best = [start, end];
      start = -1;
    }
  }
  if (!best) return null;
  const at = (i: number): V3 => [a[0] + ((b[0] - a[0]) * i) / n, 0, a[2] + ((b[2] - a[2]) * i) / n];
  const p0 = at(best[0]);
  const p1 = at(best[1]);
  return Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) >= minLen ? [p0, p1] : null;
}

// ---- grid A* ----------------------------------------------------------------------------------
const CELL = 0.1;

function grid(o: Obstacles, c: number) {
  if (o.grid && o.grid.c === c) return o.grid.blocked;
  const n = Math.round((2 * o.half) / CELL) + 1;
  const blocked = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) blocked[j * n + i] = blockedAt(o, -o.half + i * CELL, -o.half + j * CELL, c) ? 1 : 0;
  o.grid = { c, blocked };
  return blocked;
}

const cellOf = (o: Obstacles, v: number) => Math.round((v + o.half) / CELL);
const posOf = (o: Obstacles, i: number) => -o.half + i * CELL;

function nearestFree(o: Obstacles, g: Uint8Array, i0: number, j0: number): [number, number] | null {
  const n = Math.round((2 * o.half) / CELL) + 1;
  for (let rad = 0; rad < n; rad++) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let j = j0 - rad; j <= j0 + rad; j++)
      for (let i = i0 - rad; i <= i0 + rad; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rad || i < 0 || j < 0 || i >= n || j >= n || g[j * n + i]) continue;
        const d = Math.hypot(i - i0, j - j0);
        if (d < bd) [bd, best] = [d, [i, j]];
      }
    if (best) return best;
  }
  return null;
}

/** A clear point near p (p itself when it is clear). */
export function snapFree(o: Obstacles, p: V3, c = BODY): V3 {
  if (!blockedAt(o, p[0], p[2], c)) return p;
  const g = grid(o, c);
  const f = nearestFree(o, g, cellOf(o, p[0]), cellOf(o, p[2]));
  return f ? [posOf(o, f[0]), 0, posOf(o, f[1])] : p;
}

/**
 * Waypoints from a to b that keep clear of every obstacle (b is the last one). A straight line
 * when that is clear; otherwise A* on a 0.1 grid, string-pulled. When b itself sits inside
 * something (a chair, a bench), the route ends beside it and takes the last small step in.
 */
export function route(o: Obstacles, a: V3, b: V3, c = BODY): V3[] {
  if (segmentClear(o, a, b, c)) return [b];
  const g = grid(o, c);
  const n = Math.round((2 * o.half) / CELL) + 1;
  const s = nearestFree(o, g, cellOf(o, a[0]), cellOf(o, a[2]));
  const t = nearestFree(o, g, cellOf(o, b[0]), cellOf(o, b[2]));
  if (!s || !t) return [b];
  const si = s[1] * n + s[0];
  const ti = t[1] * n + t[0];
  const gScore = new Float32Array(n * n).fill(Infinity);
  const from = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const h = (k: number) => {
    const dx = Math.abs((k % n) - t[0]);
    const dz = Math.abs(Math.floor(k / n) - t[1]);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // binary heap of [f, k]
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]![0] <= heap[i]![0]) break;
      [heap[p], heap[i]] = [heap[i]!, heap[p]!];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i]!, heap[m]!];
        i = m;
      }
    }
    return top;
  };
  gScore[si] = 0;
  push(h(si), si);
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    closed[k] = 1;
    if (k === ti) break;
    const ki = k % n;
    const kj = Math.floor(k / n);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ki + di;
        const j = kj + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const nk = j * n + i;
        if (g[nk] || closed[nk]) continue;
        // no corner cutting
        if (di && dj && (g[kj * n + i] || g[j * n + ki])) continue;
        const ng = gScore[k]! + (di && dj ? Math.SQRT2 : 1);
        if (ng < gScore[nk]!) {
          gScore[nk] = ng;
          from[nk] = k;
          push(ng + h(nk), nk);
        }
      }
  }
  if (from[ti] === -1 && ti !== si) return [b]; // unreachable: leave it to the straight line
  const cells: V3[] = [];
  for (let k = ti; k !== -1; k = from[k]!) cells.push([posOf(o, k % n), 0, posOf(o, Math.floor(k / n))]);
  cells.reverse();
  // string-pull: from each anchor jump to the farthest cell still in clear sight
  const out: V3[] = [];
  let anchor: V3 = blockedAt(o, a[0], a[2], c) ? cells[0]! : a;
  if (anchor !== a) out.push(anchor);
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    while (j > i + 1 && !segmentClear(o, anchor, cells[j]!, c)) j--;
    anchor = cells[j]!;
    out.push(anchor);
    i = j;
  }
  const last = out[out.length - 1];
  if (!blockedAt(o, b[0], b[2], c) && last && segmentClear(o, last, b, c)) out[out.length - 1] = b;
  else out.push(b);
  return out;
}

/** A closed walking loop with every leg routed clear (each corner snapped clear first). */
export function routeLoop(o: Obstacles, path: V3[], c = BODY): V3[] {
  const pts = path.map((p) => snapFree(o, p, c));
  const out: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    out.push(a, ...route(o, a, b, c).slice(0, -1));
  }
  return out;
}
