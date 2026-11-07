# ASSETS.md: third-party assets and credits

Every 3D asset in `public/world/` is **CC0 1.0 (public domain dedication)**. Attribution is not
required, but we give it gladly. The license of each pack was checked on its page before use
(Sat Nov 7, 2026). Raw downloads live in `scripts/assets/raw/` (gitignored); the pipeline is
`npx tsx scripts/assets/build.ts all` (see `scripts/assets/catalog.ts` for the exact models used).

Kenney's own site (kenney.nl) blocks scripted downloads, so the identical packs were fetched from
Kenney's official uploads on OpenGameArt. Quaternius packs come from Quaternius' own OpenGameArt
uploads (the quaternius.com pages link to Google Drive and state CC0).

| Pack | Author | Used for (kit) | Source | License |
|---|---|---|---|---|
| City Kit (Suburban) 2.0 | Kenney | neighbour houses, fences, driveways (`suburban`) | https://kenney.nl/assets/city-kit-suburban · file: https://opengameart.org/content/city-kit-suburban | CC0 1.0 |
| City Kit (Commercial) 2.1 | Kenney | mid-rise and towers, awnings, parasols (`commercial`) | https://kenney.nl/assets/city-kit-commercial · https://opengameart.org/content/city-kit-commercial | CC0 1.0 |
| City Kit (Roads) 2.2 | Kenney | roads, street lights, signs (`street`) | https://kenney.nl/assets/city-kit-roads · https://opengameart.org/content/city-kit-roads | CC0 1.0 |
| Car Kit 3.1 | Kenney | cars, moving truck, delivery van (`cars`) | https://kenney.nl/assets/car-kit · https://opengameart.org/content/car-kit | CC0 1.0 |
| Holiday Kit | Kenney | benches, lanterns, string lights, presents, snowman (`props`) | https://kenney.nl/assets/holiday-kit · https://opengameart.org/content/holiday-kit | CC0 1.0 |
| Survival Kit | Kenney | moving boxes, barrels, tent, signposts (`camp`) | https://kenney.nl/assets/survival-kit · https://opengameart.org/content/survival-kit | CC0 1.0 |
| Food Kit | Kenney | cake, coffee, wine, picnic food (`food`) | https://kenney.nl/assets/food-kit · https://opengameart.org/content/food-kit | CC0 1.0 |
| Ultimate Animated Character Pack (Nov 2019) | Quaternius | all people; shared clips Idle, Walk, SitDown, Victory, Walk_Carry, PickUp, Defeat (`people`) | https://quaternius.com/packs/ultimatedanimatedcharacter.html · https://opengameart.org/content/animated-characters-pack | CC0 1.0 |
| Animal Pack Vol. 2 | Quaternius | pet dog and cat (`animals`) | https://quaternius.com · https://opengameart.org/content/animated-animales-low-poly | CC0 1.0 |
| Ultimate Nature Pack (Jun 2019) | Quaternius | trees with summer / autumn / snow / bare variants, palms, cactus, rocks, crops (`nature`) | https://quaternius.com · https://opengameart.org/content/low-poly-nature-pack-1 | CC0 1.0 |
| Ultimate House Interior Pack (Jun 2020) | Quaternius | furniture for the cutaway rooms (`interior`) | https://quaternius.com · https://opengameart.org/content/lowpoly-house-interior-pack | CC0 1.0 |

Downloaded but not shipped (kept for later): Kenney Nature Kit 2.1, Kenney Furniture Kit,
Quaternius Stylized Nature MegaKit (all CC0 1.0, same sources).

Everything else in the world (the island, the hero buildings and cutaway rooms, sky, clouds,
particles, confetti, moment props) is generated in code in `src/world/`.

**Processing:** FBX → GLB with headless Blender (`--factory-startup --disable-autoexec`, no .blend
files opened), then gltf-transform: flatten, join, weld, smooth normals (nature), dedupe, prune,
WebP textures (≤256 px for Kenney colour maps), meshopt compression. Materials are recoloured at
runtime to the palette in `docs/WORLD.md`.

**Shipped size:** 6.9 MB total across 11 kits, lazy-loaded per setting.
