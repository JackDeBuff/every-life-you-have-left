"""Headless Blender: convert FBX/OBJ files to GLB.

Run (never opens .blend files, so no embedded scripts can run):
  blender -b --factory-startup --disable-autoexec --python scripts/assets/blender_convert.py -- jobs.json

jobs.json = [{"in": "/abs/file.fbx", "out": "/abs/file.glb", "anim": true}, ...]
"""
import json
import os
import sys

import bpy  # type: ignore

argv = sys.argv[sys.argv.index("--") + 1 :]
jobs = json.load(open(argv[0]))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


for job in jobs:
    src, dst, anim = job["in"], job["out"], bool(job.get("anim"))
    if os.path.exists(dst) and os.path.getmtime(dst) > os.path.getmtime(src):
        continue
    reset()
    ext = os.path.splitext(src)[1].lower()
    if ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=src, automatic_bone_orientation=False, ignore_leaf_bones=True)
    elif ext == ".obj":
        bpy.ops.wm.obj_import(filepath=src)
    else:
        print("skip", src)
        continue
    # Bake object transforms (FBX often carries 100x scale / -90 X rotation) on static meshes.
    if not anim:
        for ob in bpy.context.scene.objects:
            ob.select_set(ob.type == "MESH")
        if any(o.type == "MESH" for o in bpy.context.scene.objects):
            bpy.context.view_layer.objects.active = next(o for o in bpy.context.scene.objects if o.type == "MESH")
            bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=dst,
        export_format="GLB",
        export_animations=anim,
        export_skins=anim,
        export_morph=False,
        export_apply=not anim,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )
    print("OK", os.path.basename(dst))
