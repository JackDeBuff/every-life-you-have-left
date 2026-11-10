/**
 * In-game music: 11 original cues in public/music/ (Opus .ogg, AAC .m4a fallback), looped
 * sample-accurately with Web Audio (an <audio loop> leaves a gap at the seam). The loop points and
 * lengths come from the composer's manifest (src/ui/music-cues.json).
 *
 *   engine     one AudioContext (made on the first click or key press: browsers start audio only
 *              after a gesture), a bus for mute, a duck stage for voices, 1.5 s cross-fades
 *   director   useMusicDirector() (./musicDirector.ts) picks the cue from the session (warm-up, the age's bed, a heavy or
 *              joyful year, a big decision, the split stinger, the interlude, the ending at 70)
 *   mute       MusicToggle in the play bar and on the ending; remembered per browser
 *
 * Voices duck the music (readAloud: -6 dB; the microphone while you hold to talk: nearly silent).
 * Decoded cues are ~30 MB each in memory, so only the last few are kept.
 */
import { create } from "zustand";
import table from "./music-cues.json";

export type CueName = keyof typeof table.cues;
type CueInfo = (typeof table.cues)[CueName];
const CUES = table.cues as Record<CueName, CueInfo>;
const BASE = "/music/";
/** The bus level: the beds are mastered at -20 LUFS and meant to sit under reading. */
const LEVEL = 0.6;
const FADE = 1.5;
const KEEP = 4;
const KEY = "elyl.music.muted";

function readMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const useMusic = create<{ muted: boolean }>(() => ({ muted: readMuted() }));

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let duck: GainNode | null = null;
let current: { name: CueName; src: AudioBufferSourceNode; gain: GainNode; at: number } | null = null;
let wanted: CueName | null = null;
const buffers = new Map<CueName, Promise<{ buffer: AudioBuffer; offset: number } | null>>();

function engine(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  // iOS Safari mutes Web Audio while the ringer switch is on silent (the default "ambient" session).
  // "playback" lets the music play like a video does; the in-game mute button still turns it off.
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    /* Safari < 16.4: no audioSession API */
  }
  ctx = new AC();
  bus = ctx.createGain();
  duck = ctx.createGain();
  bus.gain.value = useMusic.getState().muted ? 0 : LEVEL;
  duck.connect(bus).connect(ctx.destination);
  return ctx;
}

async function decode(c: AudioContext, url: string): Promise<AudioBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`music ${r.status}`);
  return c.decodeAudioData(await r.arrayBuffer());
}

function load(name: CueName) {
  const hit = buffers.get(name);
  if (hit) {
    buffers.delete(name); // most recent last
    buffers.set(name, hit);
    return hit;
  }
  const c = engine();
  if (!c) return Promise.resolve(null);
  const info = CUES[name];
  const p = (async () => {
    try {
      return { buffer: await decode(c, BASE + info.ogg), offset: 0 };
    } catch {
      try {
        const buffer = await decode(c, BASE + info.m4a);
        // AAC priming (1024 samples) left in by a decoder that ignores the MP4 edit list.
        const extra = buffer.duration - info.len / info.rate;
        return { buffer, offset: extra >= 1024 / info.rate - 1e-4 ? 1024 / info.rate : 0 };
      } catch {
        return null;
      }
    }
  })();
  buffers.set(name, p);
  while (buffers.size > KEEP) {
    const oldest = [...buffers.keys()].find((k) => k !== current?.name && k !== name);
    if (!oldest) break;
    buffers.delete(oldest);
  }
  return p;
}

function fadeOut(node: { src: AudioBufferSourceNode; gain: GainNode }, c: AudioContext, fade = FADE) {
  const t = c.currentTime;
  node.gain.gain.cancelScheduledValues(t);
  node.gain.gain.setValueAtTime(node.gain.gain.value, t);
  node.gain.gain.linearRampToValueAtTime(0, t + fade);
  node.src.stop(t + fade + 0.05);
}

/** Cross-fade to a looping cue (null: fade to silence). The last call wins if loads overlap. */
export async function play(name: CueName | null) {
  wanted = name;
  const c = engine();
  if (!c || current?.name === name) return;
  if (!name) {
    if (current) fadeOut(current, c);
    current = null;
    return;
  }
  const got = await load(name);
  if (!got || wanted !== name || current?.name === name) return;
  const info = CUES[name];
  const src = c.createBufferSource();
  src.buffer = got.buffer;
  src.loop = info.kind === "loop";
  src.loopStart = got.offset + info.loopStart;
  src.loopEnd = got.offset + info.loopEnd;
  const gain = c.createGain();
  src.connect(gain).connect(duck!);
  const t = c.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + FADE);
  src.start(t, got.offset);
  if (current) fadeOut(current, c);
  current = { name, src, gain, at: performance.now() };
}

/** The one-shot when a big choice splits the life, over whatever is playing. */
export async function stinger() {
  const c = engine();
  if (!c || c.state !== "running") return;
  const got = await load("turning-point");
  if (!got) return;
  const src = c.createBufferSource();
  src.buffer = got.buffer;
  src.connect(duck!);
  src.start(c.currentTime, got.offset);
}

/** Start (or resume) audio. Browsers only allow it inside a user gesture. */
function unlock() {
  const c = engine();
  if (c && c.state === "suspended" && !document.hidden) void c.resume();
  if (wanted && current?.name !== wanted) void play(wanted);
}

export function setMuted(m: boolean) {
  useMusic.setState({ muted: m });
  try {
    localStorage.setItem(KEY, m ? "1" : "0");
  } catch {
    /* private window */
  }
  if (bus && ctx) bus.gain.setTargetAtTime(m ? 0 : LEVEL, ctx.currentTime, 0.08);
  if (!m) unlock();
}

// Ducking: the quietest active hold wins (several can overlap).
const holds = new Set<{ level: number }>();
function applyDuck() {
  if (!duck || !ctx) return;
  const level = Math.min(1, ...[...holds].map((h) => h.level));
  duck.gain.setTargetAtTime(level, ctx.currentTime, level < 1 ? 0.08 : 0.3);
}
/** Lower the music while a voice plays ("voice": -6 dB) or the mic records ("mic": almost off). Returns the release. */
export function duckMusic(kind: "voice" | "mic"): () => void {
  const h = { level: kind === "voice" ? 0.5 : 0.08 };
  holds.add(h);
  applyDuck();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    holds.delete(h);
    applyDuck();
  };
}

if (typeof window !== "undefined") {
  for (const ev of ["pointerdown", "keydown", "touchend"] as const) window.addEventListener(ev, unlock, { capture: true, passive: true });
  // A hidden tab goes quiet; it comes back where it was.
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (!useMusic.getState().muted) void ctx.resume();
  });
}

/** What is playing now, and since when (performance.now()). */
export const nowPlaying = (): { name: CueName; at: number } | null => (current ? { name: current.name, at: current.at } : null);

// QA handle: what the music is doing, from the console.
if (typeof window !== "undefined")
  (window as unknown as { __music: () => object }).__music = () => ({ state: ctx?.state ?? "none", playing: current?.name ?? null, wanted, muted: useMusic.getState().muted, cached: [...buffers.keys()] });
