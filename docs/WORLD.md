# WORLD.md: art direction for the 3D world

The middle pane shows **the chosen life, this year** as a small floating diorama. It is the expo
hook, so it has to read in one glance from two metres away, feel alive at rest, and change with
meaning when a year turns. This document is the contract between the look and the code in
`src/world/`. The component API is at the end.

---

## 1. One idea: a life on a turntable

Every year is **one small island block** on a soft sky, seen from slightly above like a model on
a desk. The camera turns a little each year, as if someone is slowly rotating the model to look at
the next part of a life. Places (Durham, Singapore, Lisbon) are different islands; years in the
same place are the same island with things added, removed, recoloured and re-lit.

Three rules come out of that idea:

1. **Same place, same island.** Layout is seeded by `placeLabel + setting + flavor`, so a year in
   Lisbon looks like the year before it in Lisbon. Only what the spec changed moves.
2. **The hero vignette is the activity.** The front of the island is a small stage. Indoors it is a
   dollhouse cutaway of the home (roof lifted, two front walls gone). Outdoors it is a garden,
   street, plaza or path. People and props there say what this year is about.
3. **Light tells the time; colour tells the mood.** Season, time of day and weather drive sky,
   sun and particles. Mood only drives the colour grade, never the content.

## 2. References and what we take from each

| Reference | What we take | What we leave |
|---|---|---|
| **Townscaper** (Oskar Stålberg) | A tight, restrained palette of a dozen swatches; island-on-water silhouette; windows that glow warm at dusk; things "plop" in with a springy overshoot | Procedural wave-function architecture (out of scope) |
| **Tiny Glade** (Pounce Light) | "Stylized meets physical": soft GI-like light, ambient occlusion in creases, warm bounce, everything feels touchable; growth animations that build pieces upward | Ray-traced GI (we fake it with hemisphere light + AO) |
| **Monument Valley** (ustwo) | Calm compositions with lots of negative space, gradient skies, a strong single silhouette per screen, pastel without being sugary | Impossible geometry; purple-heavy palettes |
| **Alba: A Wildlife Adventure** (ustwo) | Mediterranean light: saturated sea, white and ochre walls, terracotta roofs, hard but warm sun. Drives `europe_south` | Open world camera |
| **Islanders** (Grizzly Games) | Floating island as a frame; the soil cross-section under the grass; tiny buildings as tokens | Minimal UI grey-blue mood (we want warmer) |
| **Mini Motorways** (Dinosaur Polo Club) | Muted, map-like colour blocks and readable roads; cars as moving colour dots that make a city feel alive | Flat top-down camera |
| **Bruno Simon's portfolio** | Toy-diorama scale where characters are slightly too big for buildings; playful physics-y motion (overshoot, settle); the scene always moves a little | Car-driving interaction, baked single-mood lighting |
| **Isometric room dioramas** (the ArtStation/Blender "cutaway room" genre) | The interior cutaway: floor + two back walls, one window, furniture tells the story, a warm lamp at night | Cluttered "every object you own" rooms |
| **Codrops / three.js journey demos** | Tilt-shift DOF used lightly, gradient backgrounds, single-draw particles, shader-driven grow-in | Heavy chromatic aberration, film grain, noisy glitch postprocessing |
| **Poly.pizza / Quaternius showcases** | Quaternius seasonal tree variants (summer / autumn / snow / bare) and chibi animated characters | The default flat grey-lit "stock low-poly" render |

**Avoid:** *1 in 8 Billion*'s charcoal and pink/mint look, the generic low-poly stock look (flat
grey lighting, faceted normals everywhere, random saturated colours), purple gradients, and noisy
post (grain, chromatic aberration, heavy bloom).

**How we avoid the stock low-poly look with stock low-poly assets:**
- **One palette.** Every Quaternius material is remapped at load time to our palette by material
  name (leaves, bark, rock, skin, hair, cloth). Kenney buildings get flavour-specific colour maps
  (their atlas is recoloured per region). Nothing renders in the pack's original colours by
  accident.
- **Soft shading.** Smooth hemisphere light, warm sun, one soft shadow map, gentle N8AO in
  creases. No pure black anywhere; shadows are tinted navy-teal.
- **Composition.** A few hero objects, generous ground, a clear front stage. We never fill every
  tile.

## 3. Palette

Base swatches (shared by every scene):

| Token | Hex | Use |
|---|---|---|
| cream | `#F4EBDD` | paths, plazas, light walls |
| sand | `#E7D3B0` | beach, dry ground |
| sage | `#A9C59A` | grass (base) |
| moss | `#6F9A6A` | dark grass, hedges |
| pine | `#3F6B5A` | conifers |
| terracotta | `#D9825B` | roofs (south), pots |
| clay | `#B5654A` | brick |
| butter | `#F2C66D` | sun, lamps, accents |
| coral | `#EE8E7A` | accents, flowers |
| sea | `#6FB7B4` | water |
| deep sea | `#3E8C93` | water depth, shadows on water |
| ink | `#2E3A4F` | darkest shadow tint (never pure black) |
| soil | `#9C6B4E` / `#7A5240` | island cross-section strata |

### Per season (vegetation + ground)

| Season | Grass | Foliage | Accent particles | Sun |
|---|---|---|---|---|
| spring | `#B5D69B` fresh | `#93C47D`, blossom `#F4B6C2` | petals (pink/white) | `#FFF1DC`, mid-high |
| summer | `#9DC283` | `#6FA35E` deep | fireflies at night, pollen motes by day | `#FFF4E0`, high |
| autumn | `#C8B57A` straw | `#E39B4B`, `#C8643B`, `#D8B04A` | falling leaves | `#FFD9A8`, low |
| winter | snow `#F3F6F8` over `#DCE4EA` | bare / snow-capped pines `#3F6B5A` | snow | `#E8F0FF`, low and cool |

### Per time of day (sky top → horizon, sun, ambient)

| Time | Sky top | Horizon | Sun colour / intensity | Ambient (sky / ground) |
|---|---|---|---|---|
| dawn | `#9FC3E0` | `#F6D3B8` | `#FFC9A0` / 1.6 | `#C9D9EE` / `#E8C6B0` |
| day | `#8EC5EA` | `#E8F1F2` | `#FFF4E2` / 2.6 | `#CFE6F5` / `#D8CDB4` |
| golden | `#7FB0D6` | `#F7C99A` | `#FFB774` / 2.2 | `#B9CDE3` / `#E3B98F` |
| night | `#1B2A41` | `#33506B` | moon `#9DB8E0` / 0.5 | `#3A5272` / `#1E2A38` |

Night is **deep teal-navy, never purple**. At golden hour and night, windows, lamps and string
lights glow butter-amber (`#FFC56B`), and bloom picks them up.

### Per weather

- **clear**: full sun, crisp shadows.
- **cloudy**: sun ×0.55, shadows softer and lighter, sky desaturated toward `#C9D3DA`, slow cloud
  puffs drift over the island.
- **rain**: sun ×0.35, sky `#8D9CA8 → #C3CCD2`, streak particles, wet darker ground (roughness
  down), ripples on water.
- **snow**: snow layer on ground and roofs, flakes, cool light.
- **fog**: scene fog close in (island edges soften), sun ×0.6, low contrast.

Regional flavour by `flavor` (walls / roofs / vegetation / ground):

| flavor | walls | roofs | vegetation | notes |
|---|---|---|---|---|
| us_south | brick `#B5654A`, white trim | slate `#5B6470` | oaks, magnolia, porches | Durham |
| us_northeast | `#E9E2D3` clapboard, navy | `#4B5563` | maples, birch | |
| us_west | stucco `#EBD9BE` | `#C9764F` | palms + pines, dry grass | |
| us_midwest | `#F1EBDD` | `#7B4B3A` | corn, wheat, oaks | |
| europe_south | white `#F7F2E8`, ochre `#E8C27A` | terracotta `#D9825B` | cypress-like pines, olive bushes, hills | Lisbon |
| europe_north | red `#B4553F`, mustard `#DDB45A`, white | dark `#3E4652` | pines, birch (snow-ready) | |
| east_asia | `#F2EEE6`, grey | `#4F5D6B` | maples, blossom in spring | |
| southeast_asia | pastel shophouses `#F2D3B3`, `#B7DCCF`, `#F4E3A1` | `#C9764F` | palms, broad leaves, humid haze | Singapore |
| south_asia | `#F0D9A8`, `#E7A983` | flat roofs | palms, bushes | |
| latam | `#F1B97A`, `#9ED3C6`, `#EE8E7A` | terracotta | palms, cactus | |
| middle_east | sand `#E7D3B0` | flat roofs | palms, cactus | |
| africa | `#E8C49A`, `#C9764F` | `#8E5B3E` | acacia-like trees, red earth | |
| oceania | `#F4EBDD`, `#9ED3C6` | `#6E7A86` | eucalyptus-like birch, palms | |

### Mood grade (applied last, blended over ~1.5 s)

| Mood | Saturation | Exposure | Shadow tint | Highlight tint | Vignette | Bloom |
|---|---|---|---|---|---|---|
| bright | +12% | +0.05 | teal | warm | 0.18 | 0.35 |
| calm | 0 | 0 | teal | neutral | 0.22 | 0.25 |
| tense | −15% | −0.04 | green-teal | cool | 0.38 | 0.15 |
| heavy | −30% | −0.10 | blue | grey | 0.45 | 0.10 |
| joyful | +20% | +0.06 | warm | gold | 0.15 | 0.55 |

## 4. Lighting

- **Hemisphere light** (sky and ground colours from the tables above) does most of the work: it
  is our fake GI.
- **One directional sun** with a 2048 shadow map fitted tightly to the island (PCF with radius 4,
  normal bias for low-poly acne). The sun azimuth follows time of day; elevation follows season.
- **N8AO** at half resolution, small radius, low intensity: just enough to ground objects and
  darken creases under eaves and furniture.
- **Practical lights** at golden hour and night: window glass, lamp heads and string lights are
  emissive; the hero room gets one warm point light. No more than 2 real point lights per scene.
- **Post chain** (in order): N8AO → Bloom (mipmap, threshold 0.82) → mood grade (custom effect:
  saturation, exposure, contrast, split-toning, interlude "memory") → neutral tone mapping →
  tilt-shift (very light) → vignette. No grain, no chromatic aberration. (AgX was tried first and
  greyed the palette; Khronos neutral keeps the swatches true.)
- **Sky.** The camera looks ~30° down, so the visible backdrop is all below the true horizon. The
  sky shader shifts its gradient so the frame reads sky-top colour at the top to horizon glow at
  the bottom, with a sea of soft clouds below the island and a few puffs drifting around it.

## 5. Camera language

- **Lens.** Perspective, narrow FOV (22°), far away (23.5 units outdoors, 10.8 indoors). This
  flattens perspective toward isometric while keeping depth cues, which reads as "miniature".
  Pitch 30° (37° indoors), yaw ~38°.
- **At rest.** A slow breathing orbit (±3° yaw over ~24 s) and a tiny vertical bob. Always on in
  life mode, off with reduced motion.
- **A year turns.** The camera eases to a new angle within ±11° of the base yaw (time passing as a
  turn of the turntable, bounded so the back of the island never comes round). It never cuts.
- **A place changes.** The old island sinks and fades into the fog below; clouds sweep across; the
  new island rises from below with a soft overshoot while the camera pulls back and settles.
- **Indoors.** The camera dollies ~25% closer to the home and lowers a few degrees, so the
  cutaway room fills the frame.
- **Moments.** A short push-in on the self character (to ~60% distance), the beat plays, then a
  pull-back to rest. 3–5 s total, eased with `easeInOutCubic`.
- **Interlude.** Each cut starts already in motion (a slow dolly or truck), letterboxed, with a
  cooler, slightly desaturated "memory" grade. Cuts are joined by a fast fade through the sky
  colour, never a hard cut.
- **A landmark per branch** (`landmarks.ts`, `scene/Landmark.tsx`): each cut gets one procedural
  silhouette from its place (canal, cable car, Marina towers, supertrees, lattice tower, clock tower,
  stepped spire, needle, pagoda, sails, bridge), else its setting/region (lighthouse, windmill, water
  tower, big tree, ferris wheel, balloon), never twice in one interlude, plus the branch accent
  (I `#F0A830`, II `#24A094`, III `#DC5A78`) on the landmark and the front door. Each cut re-seeds its
  neighbourhood, so three lives in one city still differ; in a city the towers step down so the
  landmark is the skyline, and the cut camera frames it.

## 6. Character style

- Quaternius chibi characters (big heads, short limbs) at **toy scale**: 0.6 units tall next to
  ~1.1-unit Kenney houses (about half a house). That exaggeration keeps people readable in a small
  pane. The self always wears the hero coral shirt so "you" is findable at a glance.
- **Skin, hair and clothing are recoloured** from our palette. The self uses `appearance` when
  given (skin swatch tone1–6, hair colour); otherwise a neutral mid tone and dark-brown hair.
  Other people get varied, seeded tones. Race is never inferred.
- **Age bands** (self and others):

  | Band | Scale | Posture | Hair | Walk speed |
  |---|---|---|---|---|
  | baby | in a pram or carried | — | — | — |
  | child | 0.58 | upright | as parent | 1.15× |
  | teen | 0.85 | upright | as is | 1.0× |
  | young_adult | 1.0 | upright | as is | 1.0× |
  | adult | 1.0 | upright | as is | 0.95× |
  | middle | 1.0 | slight stoop (spine 4°) | 30% grey | 0.9× |
  | senior | 0.96 | stoop (spine 10°, head 6°) | 85% grey | 0.7× |

- The partner **walks in** when they first appear; a pet trots behind the self.
- Poses come from the shared Quaternius clips (shipped once): `Idle`, `Walk`, `SitDown` (played
  once and held), `Walk_Carry`, `Victory`, `PickUp`. The pack has no wave or run, so **wave** is a
  procedural arm on top of `Idle` and **jog** is `Walk` at 1.75×. Stoop and the sad head-dip are
  procedural bone offsets, undone before each mixer update so they never accumulate.
- Ambient walkers (muted clothes) stroll the sidewalks so towns feel lived in; they are not people
  from the spec.

## 7. Transitions

| Change | What moves | Duration |
|---|---|---|
| Same place, new year | camera turns +12°; changed pieces sink (ease-in back) or grow in (spring overshoot), staggered by distance from the centre | 1.6 s |
| Season | foliage swaps (old trees shrink to 0 while new variants grow), ground and sky blend, particles crossfade | 1.6 s |
| Time / weather / mood | uniforms blend (sky, sun, fog, grade) | 1.5 s |
| Indoors ↔ outdoors | roof lifts and floats / settles, front walls slide down / up, furniture pops in | 1.2 s |
| New place | old island sinks into fog, new one rises | 2.2 s |
| People | new people walk in from the island edge; leaving people walk out and fade | 2 s |
| Reduced motion | everything above becomes a 600 ms crossfade of the canvas; camera fixed | 0.6 s |

## 8. Moments (3–5 s each, then `onMomentDone`)

| Moment | Beat |
|---|---|
| graduation | caps fly up, confetti burst, self in Victory |
| new_job | self walks to a lit office door, sign glows, a small sparkle |
| promotion | a short stair of light under the self, rising star motes |
| layoff | self walks out carrying a box, light dims one notch, a single leaf falls |
| wedding | arch of flowers, petals shower, partner and self face each other |
| new_baby | soft light bloom over a pram, gentle sparkles |
| moving_in | boxes pop in, front door swings open, warm light spills out |
| house_keys | a golden key spins above the door, then every window lights up |
| first_show | spotlight cone on a canvas on an easel, guests turn |
| launch | a little rocket of confetti rises from the laptop, sparkles |
| travel_abroad | suitcase rolls, a paper plane leaves a dotted trail across the sky |
| breakup | the partner walks away; colours cool slightly; rain-like motes |
| reunion | a friend walks in, both Wave, warm motes |
| caregiving_start | parent sits; self walks to them; a lamp warms up |
| retirement | string lights and a cake; friends raise a toast (Victory) |
| award | a trophy rises on a beam of light, confetti |

## 9. Performance

- DPR capped at 1.5 (1.25 on small GPUs), AO half resolution, one shadow map.
- Shared materials per palette slot; geometry shared across clones; instanced clouds, bulbs,
  confetti and particles (one draw each). A typical city year is ~540 draw calls (shadow + AO +
  post included) and ~170k triangles.
- Measured (useFrame work + full post chain, GPU-synchronised, on the dev Mac): **2.2 ms per
  frame** at 800×450 (DPR 1.5, the expo pane size) and **5–6 ms** full-screen at 1440×810. The lab's
  rAF counter read ~105 fps. A MacBook Air GPU is roughly 3–4× slower, which keeps the pane well
  inside 16.7 ms.
- Pixel budget: DPR = clamp(sqrt(1.6 MP / canvas area), 1, 1.5), so a full-screen world does not
  render 3 MP. Three quality tiers (World.tsx): 2 = DPR 1.5, MSAA x4, AO; 1 = DPR 1.25, MSAA x2,
  cheaper AO; 0 = DPR 1, no AO / tilt-shift, 1024 shadow map. drei's `PerformanceMonitor` starts
  6 s after the world is up (load hitches are not a slow machine) and steps a tier down or back
  up. `?perf` exposes `window.__r3f` in production; `?perf=hi|mid|lo` pins a tier.
- **Per-frame rules (keep them):**
  - Shadows on demand (`scene/shadows.ts`): the shadow map re-renders only when a caster moves;
    animators call `markShadows()`. People, pets and cars never cast into it (blob shadows).
  - The light count never changes: room lamps and moment glows come from a fixed pool of two
    point lights (`scene/practical.tsx`). Mounting a light recompiles every material.
  - Never dispose a material whose program others will need (character colours are cached).
  - Static subtrees freeze their matrices (`freezeStatic`, `Pop` once settled); the scene root
    and a settled island do not recompose.
  - N8AO's transparency mode stays off (it auto-enables on any transparent material and costs
    two extra scene renders and four traversals a frame).
  - Year turns re-render only what changed (pieces, procs and the hero are memoised on content).
- Measured Sat Nov 7 (prod build, 1440×900, DPR 2 screen, M4 Pro, headless Chromium on Metal;
  "old" = before these rules): lab steady state 414 → 232 draw calls, 3 → 1 scene renders a
  frame, 63 → 36 shader programs, worst year-turn frame 77 → 23 ms; demo at a 4× CPU throttle
  with the quality pinned high, 47 → 51 fps, frames over 50 ms 23 → 12, shader links in 40 s
  31 → 5.
- `frameloop="demand"` when the world is hidden, off-screen or in reduced motion; `always` while it
  is visible and animating.
- Kits are lazy-loaded per setting (`manifest.json` lists URLs and sizes): the current spec's kits
  load first (Suspense), the rest prefetch 8 s later so place changes do not wait. Everything is
  meshopt compressed with WebP textures: **6.9 MB total** for 11 kits.
- WebGL failure shows a static poster; dispose geometries and materials on unmount.

## 10. Component API

```tsx
<World
  spec={SceneSpec}               // shared/sim.ts
  mode="life" | "interlude"
  cuts={InterludeCut[]}          // shared/engine.ts; used when mode="interlude"
  appearance={Appearance | null} // shared/sim.ts; tints the self
  onMomentDone={() => void}      // after spec.moment's cinematic finishes
  onCut={(index, cut) => void}   // interlude: a cut starts (UI draws the caption)
  onInterludeDone={() => void}   // interlude: all cuts played
  paused={boolean}               // optional: freeze animation (e.g. while the UI dims the pane)
  story={WorldStory | null}      // optional, life mode: storyFor(year, prevYear) from src/world/story.ts
/>
```

Lab: `/#world-lab` (every SceneSpec field, every moment, an "Alex's life" autoplay and an
interlude demo). `/#world-lab-bare` hides the panel for screenshots. In dev, `window.__lab`
(setSpec, setMode, setCuts, setPaused, setAuto), `window.__r3f`, `window.__momentT` (freeze a
moment at t seconds) and `window.__camSnap` (no camera damping) exist for scripted captures.

Behaviour notes for the UI:
- A spec with a `moment` plays it once per distinct spec (content-compared, so re-renders with an
  equal object never replay it). `onMomentDone` fires at the end (after 2.6 s under reduced motion).
- Interlude: `onCut(i)` fires as cut `i` starts (~2.5 s each, joined by a 220 ms fade);
  `onInterludeDone` after the last. Switching `mode` back to `"life"` restores the life spec.
- `paused` freezes world time; anything that mounts while paused simply appears.
- `story` (src/world/story.ts, pure, from `SimYear.life`): names over the people of the life
  (tags are DOM nodes positioned from inside the canvas), ledger people the scene should add
  (arrivals, the household on home years, a parent's visit; never anyone not in the ledger), and
  one beat a year (a birth, a new partner, a move, a new home, new work, a visit). The camera eases
  toward the beat's subject for ~2.6 s; `beatLine(beat, caption)` is the line the UI shows under
  the caption (null when the caption already says it).

## 11. Code map (`src/world/`)

| File | Role |
|---|---|
| `World.tsx` | public component: Canvas, WebGL check + poster, reduced motion, visibility, pause clock, fades |
| `layout.ts` | the composer: SceneSpec → Layout (setting templates, hero, rooms, stages, people, cars) |
| `palette.ts` | swatches, flavour styles, `lookFor(spec)` and look blending |
| `materials.ts` | shared palette materials, Quaternius material remaps |
| `assets.ts` | manifest, kit loading, Kenney colour-map recolouring, templates |
| `scene/WorldScene.tsx` | islands (rise/sink), look blending, camera, moments, interlude cuts |
| `scene/Island.tsx`, `Procs.tsx`, `Pieces.tsx`, `Hero.tsx` | ground block, procedural set pieces, kit models, dollhouse hero |
| `scene/People.tsx`, `Cars.tsx`, `Weather.tsx`, `Atmosphere.tsx` | characters, traffic, particles, sky/light/fog/clouds |
| `scene/Moments.tsx`, `CameraRig.tsx`, `Post.tsx` | 16 cinematics, camera language, post chain + grade |
| `story.ts`, `scene/Story.tsx` | the year's story (cast, beat, extra people); name tags + beat camera |
| `scene/shadows.ts`, `practical.tsx`, `warmup.ts` | shadows on demand, fixed light pool, shader warm-up |
| `Lab.tsx`, `alex.ts` | the lab page and Alex's 17 years + demo interlude cuts |
