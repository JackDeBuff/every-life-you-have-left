/**
 * Hold to talk: MediaRecorder → POST /api/transcribe → editable text.
 * If the mic is unavailable or the endpoint fails (mock mode), a local mock transcript is used so
 * the demo never dead-ends. Hold with the pointer, or hold Space while the button has focus.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

type Status = "idle" | "listening" | "transcribing" | "error";

const MOCK: string[] = [
  "Honestly, I'd stay, but only if I can keep painting on weekends.",
  "I think I'd go. I'm scared, but I'd regret not trying more.",
  "I want my mom close, whatever I pick. That part isn't negotiable.",
  "Money matters less to me than having my evenings back.",
];

export async function transcribe(blob: Blob | null, hint: string): Promise<string> {
  if (blob && blob.size > 0) {
    try {
      const fd = new FormData();
      fd.append("audio", blob, "voice.webm");
      fd.append("hint", hint);
      const res = await fetch("/api/transcribe", { method: "POST", body: fd });
      if (res.ok) {
        const j = (await res.json()) as { text?: string };
        if (j.text) return j.text;
      }
    } catch {
      /* fall through to the mock */
    }
  }
  await new Promise((r) => setTimeout(r, 700));
  return MOCK[Math.floor(Math.random() * MOCK.length)]!;
}

export function HoldToTalk({ onText, hint = "", compact = false, disabled = false }: { onText: (t: string) => void; hint?: string; compact?: boolean; disabled?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [level, setLevel] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number>(0);
  const started = useRef(0);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  async function begin() {
    if (disabled || status === "listening" || status === "transcribing") return;
    setStatus("listening");
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
    } catch {
      // No mic (or denied): keep the gesture alive and fall back to the mock transcript.
      rec.current = null;
      const fake = () => {
        setLevel(0.25 + Math.random() * 0.5);
        raf.current = requestAnimationFrame(fake);
      };
      fake();
    }
  }

  async function end() {
    if (status !== "listening") return;
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
    if (held < 250 && blob === null) {
      setStatus("idle");
      return;
    }
    const text = await transcribe(blob, hint);
    onText(text);
    setStatus("idle");
  }

  const label = status === "listening" ? "Listening… release to stop" : status === "transcribing" ? "Writing it down…" : "Hold to talk";
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
      <Icon name="mic" size={compact ? 15 : 16} />
      {!compact && <span className="talk-label">{status === "idle" ? "Hold to talk" : status === "listening" ? "Listening" : "Writing…"}</span>}
    </button>
  );
}
