/**
 * Client for the SessionAgent (worker/agent/session-agent.ts). No SDK dependency: a small
 * reconnecting WebSocket that speaks the Agents SDK RPC frames plus our snapshot/patch protocol
 * (worker/agent/protocol.ts).
 *
 *   const id = useMemo(() => loadOrCreateSessionId(), []);
 *   const { state, status, calls } = useSessionAgent(id);
 *   await calls.start({ firstName, age, city, region, country, line, via: "text", speed: "auto", appearance: null, hasSelfie: false });
 *   // play: every SPEED_CONFIG[state.speed].secondsPerYear while state.phase === "playing" && !state.playhead.paused
 *   calls.tick(state.playhead.year + 1);
 *   calls.answer({ decisionId, optionId: "b", text: "…", via: "tap" });
 *   calls.slide(decisionId);                       // small decision timed out ("let it slide")
 *   calls.pause(false)                             // during phase "interlude": skip to playing
 *
 * URL: ws(s)://<same host>/agents/session-agent/<sessionId>. The session id is client-made
 * (newSessionId) and is also the D1 / admin id.
 *
 * State = SessionState (shared/sim.ts) + SessionExtras: chat, interlude (cuts while phase is
 * "interlude"), ending (verdicts + fiveYear when phase is "ended"), safety (show 988 when flagged),
 * thinking ("life is thinking…"), bufferedTo, engine, error.
 * Years > playhead.year are provisional (buffered future). The log only holds played years.
 *
 * Media helpers (same origin): transcribe(), makePortrait(), speak(), uploadDocument().
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Branch, SpeedMode, StartInput, Appearance, Portrait } from "../../shared/sim";
import type { DocInput } from "../../shared/engine";
import { agentPath, applyServerMsg, isServerMsg, type AgentState, type AnswerInput, type ForgetKind, type WarmAnswerInput } from "../../worker/agent/protocol";

export type { AgentState, AnswerInput, ChatMessage, SessionExtras, WarmAnswerInput, WarmupState, WarmQuestion, ForgetKind } from "../../worker/agent/protocol";

export type ConnectionStatus = "connecting" | "open" | "closed";

export interface SessionClientCalls {
  /** `docs`: the start screen's uploads (text), so the warm-up and the first profile see them. */
  start(input: StartInput, docs?: DocInput[]): Promise<void>;
  /** The warm-up (phase "warmup"): answer (or skip) the question on screen. */
  answerWarmup(a: WarmAnswerInput): Promise<void>;
  /** "Here's what I learned" ×: remove a learned item from the profile. */
  forget(kind: ForgetKind, id: string): Promise<void>;
  answer(answer: AnswerInput): Promise<void>;
  /** A small decision timed out: logged as "let it slide", the life follows its inertia. */
  slide(decisionId: string): Promise<void>;
  nudge(settingId: string, to: string): Promise<void>;
  setSpeed(speed: SpeedMode): Promise<void>;
  tick(year: number): Promise<void>;
  pause(paused: boolean): Promise<void>;
  peekBranch(branchId: string): Promise<Branch>;
  addDocument(kind: "cv" | "linkedin" | "ai_export", text: string): Promise<void>;
  /** life = "interviewer" | "chosen" | branchId. The reply streams into state.chat. */
  sayTo(life: string, age: number, text: string): Promise<void>;
  /** Dev: wipe this session back to phase "start". */
  reset(): Promise<void>;
}

export interface SessionConnection {
  readonly calls: SessionClientCalls;
  getState(): AgentState | null;
  getStatus(): ConnectionStatus;
  subscribe(fn: () => void): () => void;
  close(): void;
}

export function newSessionId(): string {
  return `s-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

const STORAGE_KEY = "elyl.sessionId";
/** Reuse this tab's session across reloads (localStorage), or make a new one. */
export function loadOrCreateSessionId(fresh = false): string {
  try {
    const old = fresh ? null : localStorage.getItem(STORAGE_KEY);
    if (old) return old;
    const id = newSessionId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return newSessionId();
  }
}

export function sessionUrl(sessionId: string, host = typeof location !== "undefined" ? location.host : "localhost:5173", secure = typeof location !== "undefined" ? location.protocol === "https:" : false) {
  return `${secure ? "wss" : "ws"}://${host}${agentPath(sessionId)}`;
}

/** Framework-free connection (also usable from scripts). Reconnects with backoff; queues calls while offline. */
export function connectSession(sessionId: string, opts: { url?: string; callTimeoutMs?: number } = {}): SessionConnection {
  const url = opts.url ?? sessionUrl(sessionId);
  const timeoutMs = opts.callTimeoutMs ?? 60_000;
  let ws: WebSocket | null = null;
  let state: AgentState | null = null;
  let status: ConnectionStatus = "connecting";
  let closed = false;
  let retry = 0;
  const listeners = new Set<() => void>();
  const outbox: string[] = [];
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const emit = () => listeners.forEach((fn) => fn());

  const open = () => {
    if (closed) return;
    status = "connecting";
    emit();
    const sock = new WebSocket(url);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      status = "open";
      while (outbox.length) sock.send(outbox.shift()!);
      emit();
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data !== "string") return;
      let m: unknown;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (isServerMsg(m)) {
        state = applyServerMsg(state, m);
        emit();
        return;
      }
      const r = m as { type?: string; id?: string; success?: boolean; result?: unknown; error?: string };
      if (r.type === "rpc" && r.id) {
        const p = pending.get(r.id);
        if (!p) return;
        pending.delete(r.id);
        clearTimeout(p.timer);
        if (r.success) p.resolve(r.result);
        else p.reject(new Error(r.error ?? "rpc_error"));
      }
    };
    sock.onclose = () => {
      if (ws !== sock) return;
      ws = null;
      status = "closed";
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error("connection_closed"));
        pending.delete(id);
      }
      emit();
      if (!closed) setTimeout(open, Math.min(5000, 400 * 2 ** retry++));
    };
    sock.onerror = () => sock.close();
  };

  const rpc = <T>(method: string, ...args: unknown[]): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`rpc_timeout:${method}`));
      }, timeoutMs);
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      const frame = JSON.stringify({ type: "rpc", id, method, args });
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame);
      else outbox.push(frame);
    });

  const calls: SessionClientCalls = {
    start: (input, docs) => (docs?.length ? rpc("start", input, docs) : rpc("start", input)),
    answerWarmup: (a) => rpc("answerWarmup", a),
    forget: (kind, id) => rpc("forget", kind, id),
    answer: (a) => rpc("answer", a),
    slide: (decisionId) => rpc("answer", { decisionId, optionId: null, text: null, via: "tap", slid: true } satisfies AnswerInput),
    nudge: (settingId, to) => rpc("nudge", settingId, to),
    setSpeed: (speed) => rpc("setSpeed", speed),
    tick: (year) => rpc("tick", year),
    pause: (paused) => rpc("pause", paused),
    peekBranch: (branchId) => rpc("peekBranch", branchId),
    addDocument: (kind, text) => rpc("addDocument", kind, text),
    sayTo: (life, age, text) => rpc("sayTo", life, age, text),
    reset: () => rpc("reset"),
  };

  open();
  return {
    calls,
    getState: () => state,
    getStatus: () => status,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    close() {
      closed = true;
      ws?.close();
    },
  };
}

/** React hook: live AgentState + typed calls. Pass null to stay disconnected. */
export function useSessionAgent(sessionId: string | null): {
  state: AgentState | null;
  status: ConnectionStatus;
  calls: SessionClientCalls;
} {
  const conn = useMemo(() => (sessionId ? connectSession(sessionId) : null), [sessionId]);
  const [snap, setSnap] = useState<{ state: AgentState | null; status: ConnectionStatus }>({ state: null, status: "connecting" });
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (!conn) return;
    const push = () => {
      // Coalesce bursts into one render per frame.
      if (raf.current !== null) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        setSnap({ state: conn.getState(), status: conn.getStatus() });
      });
    };
    const off = conn.subscribe(push);
    push();
    return () => {
      off();
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
      conn.close();
    };
  }, [conn]);
  const calls = useMemo<SessionClientCalls>(() => conn?.calls ?? OFFLINE, [conn]);
  return { state: snap.state, status: conn ? snap.status : "closed", calls };
}

const offline = () => Promise.reject(new Error("no_session"));
const OFFLINE: SessionClientCalls = {
  start: offline, answerWarmup: offline, forget: offline, answer: offline, slide: offline, nudge: offline, setSpeed: offline, tick: offline,
  pause: offline, peekBranch: offline, addDocument: offline, sayTo: offline, reset: offline,
};

// ---------------------------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------------------------

/** Hold-to-talk: send the recorded Blob, get the transcript back (show it so the user can edit). */
export async function transcribe(audio: Blob): Promise<string> {
  const res = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": audio.type || "audio/webm" }, body: audio });
  const j = (await res.json()) as { ok: boolean; text?: string; error?: string };
  if (!j.ok) throw new Error(j.error ?? `transcribe ${res.status}`);
  return j.text ?? "";
}

/**
 * Illustrated portrait (never photoreal). band "now" first (with an optional selfie data URL),
 * then "35" | "50" | "70" lazily; aged versions reuse the stored base image. The agent's
 * state.portraits updates too.
 */
export async function makePortrait(p: { sessionId: string; age: number; band?: Portrait["band"]; appearance?: Appearance | null; selfie?: string | null }): Promise<Portrait & { model: string }> {
  const res = await fetch("/api/portrait", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(p) });
  const j = (await res.json()) as Portrait & { ok: boolean; model: string; error?: string };
  if (!j.ok) throw new Error(j.error ?? `portrait ${res.status}`);
  return j;
}

/** Gemini TTS. voice "future" (older, warm; default) or "interviewer". Returns an object URL for <audio>. */
export async function speak(text: string, voice: "future" | "interviewer" = "future", sessionId?: string): Promise<string> {
  const res = await fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice, sessionId }) });
  if (!res.ok) throw new Error(`tts ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** CV / LinkedIn PDF / AI export. Pass the pdf.js text when you have it; the raw file goes to R2. */
export async function uploadDocument(p: { sessionId: string; kind: "cv" | "linkedin" | "ai_export"; text?: string; file?: File | null }): Promise<{ chars: number }> {
  const form = new FormData();
  form.set("sessionId", p.sessionId);
  form.set("kind", p.kind);
  if (p.text) form.set("text", p.text);
  if (p.file) form.set("file", p.file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  const j = (await res.json()) as { ok: boolean; chars?: number; error?: string };
  if (!j.ok) throw new Error(j.error ?? `upload ${res.status}`);
  return { chars: j.chars ?? 0 };
}
