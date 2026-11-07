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
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SceneSpec, SimYear } from "../../../shared/sim";
import { flavorFor, selfAgeBand } from "../../../worker/engine/world";
import { clock, useClockUi } from "../clock";
import { sim, useSim } from "../session";
import { useUi } from "../uiStore";
import { WorldSlot } from "./WorldSlot";

const World3D = lazy(() => import("../../world/World"));

/** Seconds per interlude cut: shorter in Auto to keep the judge run near 3 minutes. */
export const cutSecondsFor = (speed: string) => (speed === "auto" ? 1.9 : 2.6);

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

/**
 * Before the first year is written (the first card comes from a provisional profile), a calm
 * "today" scene of where they live, so the world is never empty.
 */
function todayScene(city: string, region: string | null, country: string, age: number): SceneSpec {
  const m = new Date().getMonth();
  const place = [city, region ?? (country !== "US" ? country : null)].filter(Boolean).join(", ");
  return {
    setting: "city_midrise",
    flavor: flavorFor(place, country, region) ?? "us_south",
    placeLabel: place,
    home: "apartment",
    activity: "resting",
    people: [{ role: "self", ageBand: selfAgeBand(age) }],
    season: m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn",
    timeOfDay: "golden",
    weather: "clear",
    mood: "calm",
    moment: null,
    caption: "Today",
  };
}

export function CurrentWorld() {
  const raw = useSim((s) => sceneAt(s.years, s.playhead.year));
  const city = useSim((s) => s.profile?.city ?? null);
  const region = useSim((s) => s.profile?.region ?? null);
  const country = useSim((s) => s.profile?.country ?? "US");
  const startAge = useSim((s) => s.profile?.age ?? 25);
  const today = useMemo(() => (city ? todayScene(city, region, country, startAge) : null), [city, region, country, startAge]);
  // A fork rewrites its own year: keep showing the last scene while the new one is written,
  // so the World never unmounts mid-interlude.
  const last = useRef<SceneSpec | null>(null);
  if (raw) last.current = raw;
  const spec = raw ?? last.current ?? today;
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

  // Captions start from "no cut yet" for every interlude (also when one ends).
  useEffect(() => {
    useUi.setState({ worldCut: -1 });
  }, [showInterlude]);

  // A moment's cinematic holds the year until it finishes, capped. In Auto the cap is short (the
  // engine marks many years with a moment; a full 4 s each would push the run past 3 minutes).
  const momentKey = world3d && !showInterlude && phase === "playing" && spec?.moment ? `${year}:${spec.moment}` : null;
  useEffect(() => {
    if (!momentKey) return;
    clock.hold("moment", true);
    const id = window.setTimeout(() => clock.hold("moment", false), speed === "auto" ? 1000 : speed === "4x" ? 2200 : 4600);
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

  // "Life is thinking…": the buffer is behind the playhead or the year isn't written yet. (While a
  // fork is being worked out, the "Meanwhile…" overlay says so instead.)
  const thinking = (starved && phase === "playing") || (!raw && phase === "playing");

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
            cutSeconds={cutSecondsFor(speed)}
          />
          {!showInterlude && <Caption spec={spec} />}
        </Suspense>
      ) : (
        <WorldSlot spec={spec} />
      )}
      {thinking && <Thinking />}
    </>
  );
}

const LINES = ["Life is thinking", "Writing the next years", "Weighing what you said", "Still writing, nearly there"];

/** Calm, intentional waiting: the line changes every few seconds so a long wait reads as work. */
function Thinking() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setN((x) => x + 1), 3500);
    return () => window.clearInterval(id);
  }, []);
  const lines = LINES;
  return (
    <p className="thinking-chip" role="status" aria-live="polite">
      <span key={n} className="thinking-line">
        {lines[Math.min(n, lines.length - 1)]}
      </span>
      <span className="dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </p>
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
