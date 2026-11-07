/**
 * World lab (/#world-lab): set every SceneSpec field, trigger each moment, autoplay Alex's life,
 * and play an interlude. For building and judging the 3D world in isolation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { InterludeCut } from "../../shared/engine";
import {
  ACTIVITIES, AGE_BANDS, FLAVORS, HOMES, MOMENTS, MOODS, ROLES, SEASONS, SETTINGS_PLACE, TIMES, WEATHERS,
  type Appearance, type SceneSpec,
} from "../../shared/sim";
import { ALEX, DEMO_CUTS } from "./alex";
import { MANIFEST } from "./assets";
import { World } from "./World";
import "./lab.css";

type Field = "setting" | "flavor" | "home" | "activity" | "season" | "timeOfDay" | "weather" | "mood";
const FIELDS: [Field, readonly string[]][] = [
  ["setting", SETTINGS_PLACE], ["flavor", FLAVORS], ["home", HOMES], ["activity", ACTIVITIES],
  ["season", SEASONS], ["timeOfDay", TIMES], ["weather", WEATHERS], ["mood", MOODS],
];

const HAIR_STYLES = ["short", "medium", "long", "curly", "coily", "shaved", "bun"] as const;
const HAIR_COLORS = ["black", "dark_brown", "brown", "auburn", "blonde", "red", "gray", "dyed"] as const;
const SKINS = ["tone1", "tone2", "tone3", "tone4", "tone5", "tone6"] as const;

function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const t = performance.now();
      if (t - last >= 1000) {
        setFps(Math.round((frames * 1000) / (t - last)));
        frames = 0;
        last = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

export default function Lab() {
  const [spec, setSpec] = useState<SceneSpec>(ALEX[0]!.spec);
  const [mode, setMode] = useState<"life" | "interlude">("life");
  const [cuts, setCuts] = useState<InterludeCut[] | undefined>(undefined);
  const [cutLine, setCutLine] = useState<string | null>(null);
  const [appearance, setAppearance] = useState<Appearance | null>(null);
  const [auto, setAuto] = useState(false);
  const [autoIdx, setAutoIdx] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  /** Seconds per interlude cut (scripted stills of each branch's landmark hold a cut longer). */
  const [cutSeconds, setCutSeconds] = useState<number | undefined>(undefined);
  const [cutAt, setCutAt] = useState(-1);
  const fps = useFps();
  const waitingMoment = useRef(false);
  const cutAtRef = useRef(-1);
  cutAtRef.current = cutAt;

  // dev hook for scripted screenshots: window.__lab.setSpec({...})
  useEffect(() => {
    (window as unknown as { __lab: unknown }).__lab = { setSpec, setMode, setCuts, ALEX, DEMO_CUTS, setAppearance, setPaused, setAuto, setAutoIdx, setCutSeconds, cutAt: () => cutAtRef.current };
  }, []);

  const note = useCallback((s: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${s}`, ...l].slice(0, 8)), []);
  const set = <K extends keyof SceneSpec>(k: K, v: SceneSpec[K]) => setSpec((s) => ({ ...s, [k]: v }));

  // Alex autoplay: one year every 2 s; a year with a moment waits for onMomentDone.
  useEffect(() => {
    if (!auto) return;
    const y = ALEX[autoIdx];
    if (!y) {
      setAuto(false);
      return;
    }
    setMode("life");
    setSpec(y.spec);
    note(`${y.year} · ${y.age} · ${y.spec.caption}`);
    waitingMoment.current = !!y.spec.moment;
    if (waitingMoment.current) return;
    const id = window.setTimeout(() => setAutoIdx((i) => i + 1), 2000);
    return () => window.clearTimeout(id);
  }, [auto, autoIdx, note]);

  const onMomentDone = useCallback(() => {
    note("onMomentDone");
    if (auto && waitingMoment.current) {
      waitingMoment.current = false;
      window.setTimeout(() => setAutoIdx((i) => i + 1), 900);
    } else setSpec((s) => ({ ...s, moment: null }));
  }, [auto, note]);

  const playInterlude = () => {
    setAuto(false);
    setCuts(DEMO_CUTS);
    setMode("interlude");
    note("interlude start");
  };
  const onCut = useCallback((i: number, c: InterludeCut) => {
    setCutLine(`${c.title} · ${c.caption}`);
    setCutAt(i);
    note(`onCut ${i} ${c.title}`);
  }, [note]);
  const onInterludeDone = useCallback(() => {
    note("onInterludeDone");
    setCutLine(null);
    setCutAt(-1);
    setMode("life");
  }, [note]);

  const people = spec.people;
  const setPerson = (i: number, patch: Partial<SceneSpec["people"][number]>) =>
    set("people", people.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="wl" data-bare={location.hash.includes("bare") || undefined}>
      <div className="wl-stage">
        <World spec={spec} mode={mode} cuts={cuts} appearance={appearance} onMomentDone={onMomentDone} onCut={onCut} onInterludeDone={onInterludeDone} paused={paused} cutSeconds={cutSeconds} />
        <div className="wl-caption">
          {mode === "interlude" ? (
            <>
              <span className="wl-kicker">Meanwhile, in your other lives</span>
              <span>{cutLine}</span>
            </>
          ) : (
            <>
              <span className="wl-kicker">{spec.placeLabel}</span>
              <span>{spec.caption}</span>
            </>
          )}
        </div>
        <div className="wl-fps">{fps} fps</div>
      </div>
      <aside className="wl-panel">
        <h1>World lab</h1>
        <div className="wl-row">
          <button className="btn" onClick={() => { setAutoIdx(0); setAuto((a) => !a); }}>{auto ? "Stop" : "Play Alex's life"}</button>
          <button className="btn ghost" onClick={playInterlude}>Interlude demo</button>
          <button className="btn ghost" onClick={() => setPaused((p) => !p)}>{paused ? "Resume" : "Pause"}</button>
        </div>
        <div className="wl-row wl-years">
          {ALEX.map((y, i) => (
            <button key={y.year} className="wl-chip" aria-pressed={spec === y.spec} onClick={() => { setAuto(false); setMode("life"); setSpec(y.spec); setAutoIdx(i); }}>
              {y.age}
            </button>
          ))}
        </div>
        <fieldset>
          <legend>Scene</legend>
          <label className="wl-field">
            <span>placeLabel</span>
            <input value={spec.placeLabel} onChange={(e) => set("placeLabel", e.target.value)} />
          </label>
          <label className="wl-field">
            <span>caption</span>
            <input value={spec.caption} onChange={(e) => set("caption", e.target.value)} />
          </label>
          {FIELDS.map(([k, opts]) => (
            <label key={k} className="wl-field">
              <span>{k}</span>
              <select value={spec[k] as string} onChange={(e) => set(k, e.target.value as never)}>
                {opts.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>People</legend>
          {people.map((p, i) => (
            <div key={i} className="wl-person">
              <select value={p.role} onChange={(e) => setPerson(i, { role: e.target.value as never })}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <select value={p.ageBand} onChange={(e) => setPerson(i, { ageBand: e.target.value as never })}>
                {AGE_BANDS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <button className="wl-x" aria-label="Remove person" disabled={p.role === "self"} onClick={() => set("people", people.filter((_, j) => j !== i))}>remove</button>
            </div>
          ))}
          <button className="btn ghost" disabled={people.length >= 6} onClick={() => set("people", [...people, { role: "friend", ageBand: "adult" }])}>Add person</button>
        </fieldset>
        <fieldset>
          <legend>Moments</legend>
          <div className="wl-row">
            {MOMENTS.map((m) => (
              <button key={m} className="wl-chip" onClick={() => { setAuto(false); setMode("life"); setSpec((s) => ({ ...s, moment: m })); note(`moment ${m}`); }}>
                {m.replace("_", " ")}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Appearance (self)</legend>
          <label className="wl-field">
            <span>use</span>
            <input type="checkbox" checked={!!appearance} onChange={(e) => setAppearance(e.target.checked ? { hairStyle: "curly", hairColor: "dark_brown", skinTone: "tone4", glasses: false, facialHair: false, gender: null } : null)} />
          </label>
          {appearance && (
            <>
              <label className="wl-field"><span>hairStyle</span>
                <select value={appearance.hairStyle ?? ""} onChange={(e) => setAppearance({ ...appearance, hairStyle: e.target.value as never })}>{HAIR_STYLES.map((h) => <option key={h}>{h}</option>)}</select>
              </label>
              <label className="wl-field"><span>hairColor</span>
                <select value={appearance.hairColor ?? ""} onChange={(e) => setAppearance({ ...appearance, hairColor: e.target.value as never })}>{HAIR_COLORS.map((h) => <option key={h}>{h}</option>)}</select>
              </label>
              <label className="wl-field"><span>skinTone</span>
                <select value={appearance.skinTone ?? ""} onChange={(e) => setAppearance({ ...appearance, skinTone: e.target.value as never })}>{SKINS.map((h) => <option key={h}>{h}</option>)}</select>
              </label>
              <label className="wl-field"><span>gender</span>
                <select value={appearance.gender ?? ""} onChange={(e) => setAppearance({ ...appearance, gender: (e.target.value || null) as never })}>{["", "woman", "man", "nonbinary", "undisclosed"].map((h) => <option key={h} value={h}>{h || "not set"}</option>)}</select>
              </label>
            </>
          )}
        </fieldset>
        <p className="wl-meta">Assets: {(MANIFEST.totalBytes / 1024 / 1024).toFixed(1)} MB across {Object.keys(MANIFEST.kits).length} kits, loaded per setting.</p>
        <ol className="wl-log">{log.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </aside>
    </div>
  );
}
