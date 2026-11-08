/**
 * Hold to talk: MediaRecorder → POST /api/transcribe → editable text.
 * Live: the real transcript, or a short "couldn't hear that" (we never put words in your mouth).
 * Offline demo (mock backend): if the mic or the endpoint fails, a sample transcript is used so the
 * demo never dead-ends. Hold with the pointer, or hold Space while the button has focus.
 * Blocked mic (permission denied): no pretend listening; a calm note says so at once. With
 * `onNotice` the parent shows the note inline under its field; without it, a small bubble does.
 */
import { duckMusic } from "./music";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { backend } from "./session";

type Status = "idle" | "listening" | "transcribing" | "error" | "blocked";

export const MIC_BLOCKED = "Microphone is blocked. Type instead, or allow it in your browser.";

/** A remembered "deny" for this site, when the browser can tell us without prompting. */
async function micDenied(): Promise<boolean> {
  try {
    const p = await navigator.permissions?.query({ name: "microphone" as PermissionName });
    return p?.state === "denied";
  } catch {
    return false;
  }
}

const isBlocked = (err: unknown) => {
  const name = (err as { name?: string } | null)?.name ?? "";
  return name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError";
};

const MOCK: string[] = [
  "Honestly, I'd stay, but only if I can keep painting on weekends.",
  "I think I'd go. I'm scared, but I'd regret not trying more.",
  "I want my mom close, whatever I pick. That part isn't negotiable.",
  "Money matters less to me than having my evenings back.",
];

export async function transcribe(blob: Blob | null, hint: string): Promise<string> {
  const live = backend() === "live";
  if (live && (!blob || !blob.size)) throw new Error("no_audio");
  if (blob && blob.size > 0) {
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      fd.append("hint", hint);
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (res.ok) {
        const j = (await res.json()) as { text?: string };
        if (j.text?.trim()) return j.text.trim();
      }
    } catch {
      /* fall through */
    }
    if (live) throw new Error("transcribe_failed");
  }
  await new Promise((r) => setTimeout(r, 700));
  return MOCK[Math.floor(Math.random() * MOCK.length)]!;
}

export function HoldToTalk({
  onText,
  hint = "",
  compact = false,
  disabled = false,
  onNotice,
}: {
  onText: (t: string) => void;
  hint?: string;
  compact?: boolean;
  disabled?: boolean;
  /** Show notes (blocked mic, couldn't hear) inline in the parent instead of the bubble. */
  onNotice?: (note: string | null) => void;
}) {
  const [status, setStatusState] = useState<Status>("idle");
  const statusRef = useRef<Status>("idle");
  const setStatus = (s: Status | ((p: Status) => Status)) => {
    const next = typeof s === "function" ? s(statusRef.current) : s;
    statusRef.current = next;
    setStatusState(next);
  };
  const notice = useRef(onNotice);
  notice.current = onNotice;
  const noteTimer = useRef(0);
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const started = useRef(0);
  const unduck = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      stopAll();
      window.clearTimeout(noteTimer.current);
    },
    [],
  );

  /** Show a note for a few seconds, then go quiet again. */
  function note(kind: "error" | "blocked", text: string) {
    setStatus(kind);
    notice.current?.(text);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(
      () => {
        setStatus((s) => (s === kind ? "idle" : s));
        notice.current?.(null);
      },
      kind === "blocked" ? 6000 : 2600,
    );
  }

  function stopAll() {
    unduck.current?.();
    unduck.current = null;
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function begin() {
    const st = statusRef.current;
    if (disabled || st === "listening" || st === "transcribing") return;
    if (await micDenied()) {
      note("blocked", MIC_BLOCKED);
      return;
    }
    notice.current?.(null);
    setStatus("listening");
    unduck.current?.();
    unduck.current = duckMusic("mic"); // the music would leak into the recording
    started.current = performance.now();
    chunks.current = [];
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 256;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf.current = requestAnimationFrame(loop);
      };
      loop();
      const r = new MediaRecorder(s);
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.start();
      rec.current = r;
    } catch (err) {
      rec.current = null;
      if (isBlocked(err)) {
        stopAll();
        note("blocked", MIC_BLOCKED);
        return;
      }
      // No mic device: keep the gesture alive (the offline demo falls back to a sample transcript).
      const fake = () => {
        setLevel(0.25 + Math.random() * 0.5);
        raf.current = requestAnimationFrame(fake);
      };
      fake();
    }
  }

  async function end() {
    if (statusRef.current !== "listening") return;
    const held = performance.now() - started.current;
    setStatus("transcribing");
    setLevel(0);
    const r = rec.current;
    let blob: Blob | null = null;
    if (r && r.state !== "inactive") {
      await new Promise<void>((res) => {
        r.onstop = () => res();
        r.stop();
      });
      blob = new Blob(chunks.current, { type: r.mimeType || "audio/webm" });
    }
    stopAll();
    if (held < 250) {
      setStatus("idle");
      return;
    }
    try {
      const text = await transcribe(blob, hint);
      onText(text);
      setStatus("idle");
    } catch {
      note("error", rec.current ? "I couldn't hear that. Try again, or type it." : "No microphone. Type it instead.");
    }
  }

  const label =
    status === "listening" ? "Listening… release to stop"
    : status === "transcribing" ? "Writing it down…"
    : status === "error" ? (rec.current ? "I couldn't hear that. Try again, or type it." : "No microphone. Type it instead.")
    : status === "blocked" ? MIC_BLOCKED
    : "Hold to talk";
  return (
    <button
      type="button"
      className={`talk ${compact ? "compact" : ""}`}
      data-status={status}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{ ["--lvl" as string]: level.toFixed(3) }}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        void begin();
      }}
      onPointerUp={() => void end()}
      onPointerCancel={() => void end()}
      onKeyDown={(e) => {
        if ((e.key === " " || e.key === "Enter") && !e.repeat) {
          e.preventDefault();
          void begin();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === " " || e.key === "Enter") void end();
      }}
    >
      <span className="talk-ring" aria-hidden="true" />
      {(status === "error" || status === "blocked") && !onNotice && (
        <span className={`talk-err${status === "blocked" ? " wrap" : ""}`} role="status">
          {label}
        </span>
      )}
      <Icon name="mic" size={compact ? 15 : 16} />
      {!compact && <span className="talk-label">{status === "idle" ? "Hold to talk" : status === "listening" ? "Listening" : status === "error" ? "Try again" : status === "blocked" ? "Mic blocked" : "Writing…"}</span>}
    </button>
  );
}
