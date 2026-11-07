/** Print material names + base colours per kit GLB (to build the palette remap in src/world/materials.ts). */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const dir = process.argv[2] ?? "public/world";
const files = process.argv.slice(3);
for (const f of files.length ? files : readdirSync(dir).filter((x) => x.endsWith(".glb"))) {
  const doc = await io.read(join(dir, f));
  const hex = (c: number[]) =>
    "#" + c.slice(0, 3).map((v) => Math.round(Math.pow(v, 1 / 2.2) * 255).toString(16).padStart(2, "0")).join("");
  const mats = doc.getRoot().listMaterials().map((m) => `${m.getName()}${m.getBaseColorTexture() ? "(tex)" : ""}${hex(m.getBaseColorFactor())}`);
  console.log(`${f}: ${mats.join(" ")}`);
}
