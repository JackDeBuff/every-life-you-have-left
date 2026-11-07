/**
 * The middle pane's world: the real 3D <World> (src/world/, lazy chunk) with the 2D <WorldSlot> as
 * its Suspense fallback and as the no-WebGL fallback.
 *
 *   spec        years[playhead].scene (the chosen life, this year)
 *   interlude   mode="interlude" + cuts while the agent is in phase "interlude"; the world drives
 *               the cut timing (onCut → the overlay's captions) and onInterludeDone → pause(false)
 *   moments     a year with a moment holds the clock until onMomentDone (capped, so Auto stays
 *               near 3 minutes)
 *   paused      while a big decision dims the pane
 *
 * The World only re-renders when one of these props changes (a year turns, a phase changes); the
 * per-frame playhead never touches React.
 */
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { SceneSpec, SimYear } from "../../../shared/sim";
import { clock, useClockUi } from "../clock";
import { sim, useSim } from "../session";
import { useUi } from "../uiStore";
import { WorldSlot } from "./WorldSlot";

const World3D = lazy(() => import("../../world/World"));

function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The scene for the playhead's year (or the latest generated year before it). */
export function sceneAt(years: SimYear[], year: number): SceneSpec | null {
  let best: SimYear | null = null;
  for (const y of years) {
    if (y.year === year) return y.scene;
    if (y.year < year && (!best || y.year > best.year)) best = y;
  }
  return best?.scene ?? null;
}

function Mounted() {
  useEffect(() => {
    useUi.setState({ world3d: true });
    return () => useUi.setState({ world3d: false });
  }, []);
  return null;
}

export function CurrentWorld() {
  const spec = useSim((s) => sceneAt(s.years, s.playhead.year));
  const year = useSim((s) => s.playhead.year);
  const appearance = useSim((s) => s.appearance);
  const phase = useSim((s) => s.phase);
  const cuts = useSim((s) => s.interlude);
  const speed = useSim((s) => s.speed);
  const pendingBig = useSim((s) => s.decisions.some((d) => d.kind === "big" && d.status === "pending"));
  const forking = useUi((s) => !!s.forking);
  const world3d = useUi((s) => s.world3d);
  const starved = useClockUi((s) => s.starved);
  const [gl] = useState(webglOk);
  const showInterlude = phase === "interlude" && !!cuts?.length && !forking;

  useEffect(() => {
    if (showInterlude) useUi.setState({ worldCut: -1 });
  }, [showInterlude]);

  // A moment's cinematic holds the year until it finishes (capped).
  const momentKey = world3d && !showInterlude && phase === "playing" && spec?.moment ? `${year}:${spec.moment}` : null;
  useEffect(() => {
    if (!momentKey) return;
    clock.hold("moment", true);
    const id = window.setTimeout(() => clock.hold("moment", false), speed === "auto" ? 2600 : 4600);
    return () => {
      window.clearTimeout(id);
      clock.hold("moment", false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [momentKey]);
  const onMomentDone = useCallback(() => clock.hold("moment", false), []);
  const onCut = useCallback((i: number) => useUi.setState({ worldCut: i }), []);
  const onInterludeDone = useCallback(() => {
    if (sim().phase === "interlude") void sim().pause(false).catch(() => {});
  }, []);

  const thinking = (starved && phase === "playing") || (!spec && phase !== "ended") || (phase === "interlude" && !cuts?.length);

  return (
    <>
      {gl && spec ? (
        <Suspense fallback={<WorldSlot spec={spec} />}>
          <Mounted />
          <World3D
            spec={spec}
            mode={showInterlude ? "interlude" : "life"}
            cuts={showInterlude ? cuts! : undefined}
            appearance={appearance}
            onMomentDone={onMomentDone}
            onCut={onCut}
            onInterludeDone={onInterludeDone}
            paused={pendingBig && !forking}
            cutSeconds={speed === "auto" ? 2.1 : 2.6}
          />
          {!showInterlude && <Caption spec={spec} />}
        </Suspense>
      ) : (
        <WorldSlot spec={spec} />
      )}
      {thinking && (
        <p className="thinking-chip" role="status">
          Life is thinking
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
      )}
    </>
  );
}

/** Place + caption over the 3D world (the 2D slot draws its own). */
function Caption({ spec }: { spec: SceneSpec }) {
  return (
    <div className="world-cap">
      <span className="label">{spec.placeLabel}</span>
      <span className="world-caption">{spec.caption}</span>
    </div>
  );
}
