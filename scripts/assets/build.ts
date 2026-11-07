/**
 * Asset pipeline for the 3D world: raw CC0 packs -> compressed GLBs in public/world/ + manifest.
 *
 *   npx tsx scripts/assets/build.ts convert   # FBX -> GLB via headless Blender (cached)
 *   npx tsx scripts/assets/build.ts pack      # merge, dedupe, prune, meshopt, webp -> public/world/
 *   npx tsx scripts/assets/build.ts all
 *
 * Raw packs live in scripts/assets/raw/<pack>/x (gitignored; see ASSETS.md for sources + licenses).
 * Static kits become one GLB each (one named root node per model). Animated kits (people, animals)
 * become one GLB per character so bone names stay unique per file; clips ship once in anims.glb.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join as pjoin, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO, getBounds, type Node as GNode } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  dedup,
  flatten,
  join,
  meshopt,
  mergeDocuments,
  normals,
  prune,
  textureCompress,
  unpartition,
  weld,
} from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";
import { KITS, type Kit } from "./catalog";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const RAW = pjoin(HERE, "raw");
const CONVERTED = pjoin(RAW, "_glb");
const OUT = pjoin(ROOT, "public/world");

const srcPath = (kit: Kit, src: string) => pjoin(RAW, kit.pack, "x", src);
const convertedPath = (kit: Kit, id: string) => pjoin(CONVERTED, kit.name, `${id}.glb`);
const inputGlb = (kit: Kit, id: string, src: string) =>
  src.endsWith(".glb") ? srcPath(kit, src) : convertedPath(kit, id);

async function makeIO() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
}

function convert() {
  const jobs: { in: string; out: string; anim: boolean }[] = [];
  for (const kit of KITS) {
    for (const m of kit.models) {
      if (m.src.endsWith(".glb")) continue;
      const input = srcPath(kit, m.src);
      if (!existsSync(input)) throw new Error(`missing ${input}`);
      jobs.push({ in: input, out: convertedPath(kit, m.id), anim: !!kit.animated });
    }
  }
  mkdirSync(CONVERTED, { recursive: true });
  const jobsFile = pjoin(CONVERTED, "jobs.json");
  writeFileSync(jobsFile, JSON.stringify(jobs, null, 1));
  const r = spawnSync(
    "blender",
    ["-b", "--factory-startup", "--disable-autoexec", "--python", pjoin(HERE, "blender_convert.py"), "--", jobsFile],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const ok = (r.stdout.match(/^OK /gm) ?? []).length;
  if (r.status !== 0) {
    console.error(r.stdout.slice(-4000), r.stderr.slice(-4000));
    throw new Error("blender failed");
  }
  console.log(`converted ${ok} new files (${jobs.length} total jobs)`);
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Blender exports alpha 0 for some FBX materials; everything in the world is opaque. Clip names -> short. */
function tidy(doc: Document) {
  for (const m of doc.getRoot().listMaterials()) {
    const c = m.getBaseColorFactor();
    m.setBaseColorFactor([c[0], c[1], c[2], 1]);
    m.setAlphaMode("OPAQUE");
    m.setMetallicFactor(0);
    m.setRoughnessFactor(Math.max(0.6, m.getRoughnessFactor()));
  }
  for (const a of doc.getRoot().listAnimations()) a.setName(a.getName().split("|").pop() ?? a.getName());
}

/** Soft shading: drop flat normals, weld shared corners, recompute smooth normals. */
async function smoothNormals(doc: Document) {
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const n = prim.getAttribute("NORMAL");
      if (n) {
        prim.setAttribute("NORMAL", null);
        n.dispose();
      }
    }
  await doc.transform(weld(), normals({ overwrite: true }));
}

interface ModelInfo {
  min: number[];
  max: number[];
}

/** Wrap all scene roots of a single-model document under one node named `id`. */
function wrapScene(doc: Document, id: string): GNode {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const wrapper = doc.createNode(id);
  for (const child of scene.listChildren()) {
    scene.removeChild(child);
    wrapper.addChild(child);
  }
  scene.addChild(wrapper);
  return wrapper;
}

async function packStaticKit(io: NodeIO, kit: Kit) {
  const target = new Document();
  const mainScene = target.createScene(kit.name);
  target.getRoot().setDefaultScene(mainScene);
  target.createBuffer();
  const models: Record<string, ModelInfo> = {};

  for (const m of kit.models) {
    const file = inputGlb(kit, m.id, m.src);
    if (!existsSync(file)) {
      console.warn(`  skip ${m.id} (missing ${file})`);
      continue;
    }
    const doc = await io.read(file);
    for (const a of doc.getRoot().listAnimations()) a.dispose();
    tidy(doc);
    await doc.transform(flatten(), join({ keepNamed: false }), weld());
    if (kit.smooth) await smoothNormals(doc);
    const wrapper = wrapScene(doc, m.id);
    const b = getBounds(wrapper);
    models[m.id] = { min: b.min.map(round), max: b.max.map(round) };
    const map = mergeDocuments(target, doc);
    const mergedWrapper = map.get(wrapper) as GNode;
    for (const s of target.getRoot().listScenes()) if (s !== mainScene && s.listChildren().includes(mergedWrapper)) {
      s.removeChild(mergedWrapper);
      s.dispose();
    }
    mainScene.addChild(mergedWrapper);
  }
  for (const s of target.getRoot().listScenes()) if (s !== mainScene) s.dispose();

  await target.transform(
    unpartition(),
    dedup(),
    prune({ keepLeaves: true }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [kit.texSize ?? 512, kit.texSize ?? 512] }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const outFile = pjoin(OUT, `${kit.name}.glb`);
  await io.write(outFile, target);
  return { url: `/world/${kit.name}.glb`, bytes: statSync(outFile).size, models };
}

async function packAnimatedKit(io: NodeIO, kit: Kit, clipsWritten: { done: boolean }) {
  const dir = pjoin(OUT, kit.name);
  mkdirSync(dir, { recursive: true });
  const models: Record<string, ModelInfo & { url: string; bytes: number; clips?: string[] }> = {};
  for (const m of kit.models) {
    const file = inputGlb(kit, m.id, m.src);
    if (!existsSync(file)) {
      console.warn(`  skip ${m.id}`);
      continue;
    }
    const doc = await io.read(file);
    tidy(doc);
    const anims = doc.getRoot().listAnimations();
    const clipNames = anims.map((a) => a.getName());
    // People share one rig: ship their clips once (people/anims.glb); animals keep their own.
    const keepClips = kit.name !== "people" || !clipsWritten.done;
    if (kit.name === "people" && !clipsWritten.done) {
      clipsWritten.done = true;
    }
    if (!keepClips) for (const a of anims) a.dispose();
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
    const b = getBounds(scene);
    await doc.transform(
      dedup(),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: "webp", resize: [256, 256] }),
      meshopt({ encoder: MeshoptEncoder, level: "medium" }),
    );
    const outFile = pjoin(dir, `${m.id}.glb`);
    await io.write(outFile, doc);
    models[m.id] = {
      url: `/world/${kit.name}/${m.id}.glb`,
      bytes: statSync(outFile).size,
      min: b.min.map(round),
      max: b.max.map(round),
      ...(keepClips ? { clips: clipNames } : {}),
    };
  }
  return { models };
}

async function pack() {
  const io = await makeIO();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const manifest: Record<string, unknown> = { version: 1, generated: new Date().toISOString(), kits: {} };
  const kits = manifest.kits as Record<string, unknown>;
  const clipsWritten = { done: false };
  let total = 0;
  for (const kit of KITS) {
    console.log(`kit ${kit.name} (${kit.models.length} models)`);
    if (kit.animated) {
      const r = await packAnimatedKit(io, kit, clipsWritten);
      const bytes = Object.values(r.models).reduce((s, m) => s + m.bytes, 0);
      total += bytes;
      kits[kit.name] = { animated: true, bytes, models: r.models };
      console.log(`  ${(bytes / 1024).toFixed(0)} KB`);
    } else {
      const r = await packStaticKit(io, kit);
      total += r.bytes;
      kits[kit.name] = r;
      console.log(`  ${(r.bytes / 1024).toFixed(0)} KB`);
    }
  }
  manifest.totalBytes = total;
  writeFileSync(pjoin(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  // The runtime imports a copy (bounds + urls) so layout code can size models without a fetch.
  writeFileSync(pjoin(ROOT, "src/world/manifest.json"), JSON.stringify(manifest));
  console.log(`total ${(total / 1024 / 1024).toFixed(2)} MB`);
}

async function inspect(file: string) {
  const io = await makeIO();
  const doc = await io.read(file);
  const root = doc.getRoot();
  console.log("animations:", root.listAnimations().map((a) => `${a.getName()}(${a.listChannels().length})`).join(", "));
  console.log("materials:", root.listMaterials().map((m) => `${m.getName()}#${m.getBaseColorFactor().map((v) => v.toFixed(2)).join(",")}`).join(" | "));
  console.log("nodes:", root.listNodes().slice(0, 40).map((n) => n.getName()).join(", "));
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  console.log("bounds:", JSON.stringify(getBounds(scene)));
  console.log("meshes:", root.listMeshes().length, "prims:", root.listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0));
  console.log("skins:", root.listSkins().length, "size:", readFileSync(file).length);
}

const cmd = process.argv[2] ?? "all";
if (cmd === "convert") convert();
else if (cmd === "pack") await pack();
else if (cmd === "inspect") await inspect(process.argv[3]!);
else {
  convert();
  await pack();
}
