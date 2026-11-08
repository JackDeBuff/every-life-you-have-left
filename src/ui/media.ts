/**
 * Media wiring for the live backend (worker/media.ts):
 *  - portraits: /api/portrait "now" (selfie or the picked look), then the aged bands 35/50/70 in
 *    the background; they arrive in state.portraits through the agent and the Portrait swaps in
 *    the band for the current age
 *  - read aloud: Gemini TTS (/api/tts, voice "future"), browser speech as the fallback
 * Uploads go through the live store's addDocument (/api/upload), transcription through HoldToTalk.
 */
import type { Appearance } from "../../shared/sim";
import { makePortrait, speak } from "../lib/agent-client";
import { duckMusic } from "./music";

/** Downscale a selfie to a JPEG data URL (keeps the upload small and strips metadata). */
export async function fileToJpegDataUrl(file: File, max = 768): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const started = new Set<string>();

/**
 * Generate the portraits for a session (once). Only when the user gave us something to draw from:
 * a selfie or a picked look. Without either we keep the faceless placeholder; we never guess how
 * someone looks (D-011).
 */
export function startPortraits(p: { sessionId: string; age: number; endAge: number; appearance: Appearance | null; selfie: File | null }) {
  if (started.has(p.sessionId) || (!p.selfie && !p.appearance)) return;
  started.add(p.sessionId);
  void (async () => {
    try {
      const selfie = p.selfie ? await fileToJpegDataUrl(p.selfie) : null;
      await makePortrait({ sessionId: p.sessionId, age: p.age, band: "now", appearance: p.appearance, selfie });
      for (const band of ["35", "50", "70"] as const) {
        const n = Number(band);
        if (n <= p.age + 2 || n > p.endAge + 3) continue;
        await makePortrait({ sessionId: p.sessionId, age: p.age, band, appearance: p.appearance });
      }
    } catch (e) {
      console.warn("[portrait] keeping the drawn placeholder:", e instanceof Error ? e.message : e);
    }
  })();
}

const warmed = new Set<string>();
/** Ask the server to render (and cache in R2) a reading ahead of the click. Fire and forget. */
export function warmVoice(text: string, sessionId?: string) {
  if (!text || warmed.has(text)) return;
  warmed.add(text);
  void fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice: "future", sessionId }) })
    .then((r) => r.arrayBuffer())
    .catch(() => {});
}

export interface Reading {
  stop(): void;
  done: Promise<void>;
}

/** Read text aloud in the older, warm "future" voice. Falls back to the browser's speech. */
export async function readAloud(text: string, sessionId?: string): Promise<Reading> {
  try {
    const url = await speak(text, "future", sessionId);
    const a = new Audio(url);
    const release = duckMusic("voice");
    const done = new Promise<void>((res) => {
      a.onended = () => res();
      a.onerror = () => res();
    }).finally(release);
    try {
      await a.play();
    } catch (e) {
      release();
      throw e;
    }
    return {
      stop: () => {
        a.pause();
        release();
        URL.revokeObjectURL(url);
      },
      done,
    };
  } catch {
    const synth = window.speechSynthesis;
    if (!synth) return { stop: () => {}, done: Promise.resolve() };
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.96;
    const release = duckMusic("voice");
    const done = new Promise<void>((res) => {
      u.onend = () => res();
      u.onerror = () => res();
    }).finally(release);
    synth.cancel();
    synth.speak(u);
    return { stop: () => (synth.cancel(), release()), done };
  }
}
