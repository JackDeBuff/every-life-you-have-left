/**
 * Shadows on demand. The sun's shadow map is re-rendered only when something that casts a shadow
 * moves: a piece popping in or out, an island rising, the hero's roof lifting, the sun turning, a
 * moment's props. Characters, pets and cars do not cast into the map (they get soft blob shadows,
 * see BlobShadow), so a settled year costs no shadow pass at all.
 *
 * Animators call markShadows() every frame they move a shadow caster; <ShadowDirector> turns that
 * into renderer.shadowMap.needsUpdate before the frame renders.
 */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";

let dirty = 3;

/** Something that casts a shadow moved this frame: re-render the shadow map for the next `frames` frames. */
export function markShadows(frames = 2) {
  if (frames > dirty) dirty = frames;
}

/** `live`: re-render every frame (interlude cuts, whose landmarks animate). */
export function ShadowDirector({ live }: { live: boolean }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    dirty = 3;
    return () => {
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);
  // Priority 0.9: after the animators (priority 0) and before the composer renders (priority 1).
  useFrame(() => {
    if (live || dirty > 0) {
      gl.shadowMap.needsUpdate = true;
      if (dirty > 0) dirty--;
    }
  }, 0.9);
  return null;
}
