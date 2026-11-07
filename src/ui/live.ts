/**
 * The live backend: the SessionAgent Durable Object (worker/agent/session-agent.ts) over the
 * snapshot/patch socket (src/lib/agent-client.ts), adapted to the UI's ClientState.
 *
 * The session id is made client-side and kept in localStorage, so a refresh resumes the same life.
 * `?new=1` (or reset()) starts a fresh one.
 *
 * What this adapter adds on top of AgentState (protocol.ts):
 *  - `decisions` only shows decisions the playhead has reached. The agent writes them 1–2 years
 *    ahead so the playhead never waits; the UI must not show a card before its year.
 *  - `dialogue`, the right-pane conversation, derived from the start quotes, decisions, answers
 *    and the agent's chat (interviewer + future selves), in life order.
 *  - `connection`, the socket status (the App offers the offline demo when it can't connect).
 * Derived fields are structurally shared: unchanged inputs keep the same array, so selectors stay
 * stable and the panes don't re-render on every patch.
 */
import { create } from "zustand";
import { TWIN_THRESHOLD } from "../../shared/schema";
import type { Decision } from "../../shared/sim";
import { slidLine } from "./format";
import { connectSession, loadOrCreateSessionId, uploadDocument, type SessionConnection } from "../lib/agent-client";
import type { AgentState, ChatEntry, ClientCalls, ClientState, ConnectionStatus } from "./types";

export type LiveSim = ClientState & ClientCalls;

const blank = (sessionId: string): ClientState => ({
  sessionId,
  phase: "start",
  speed: "auto",
  profile: null,
  appearance: null,
  portraits: [],
  settings: [],
  nudges: [],
  decisions: [],
  answers: [],
  years: [],
  playhead: { year: new Date().getFullYear(), age: 25, paused: true },
  branches: [],
  log: [],
  status: null,
  budgets: { smallLeft: 0, bigLeft: 0 },
  endAge: 70,
  verdictAtEnd: null,
  updatedAt: new Date().toISOString(),
  chat: [],
  interlude: null,
  ending: null,
  safety: null,
  thinking: false,
  bufferedTo: null,
  engine: "mock",
  error: null,
  dialogue: [],
  connection: "connecting",
  backend: "live",
});

// ---------------------------------------------------------------------------------------------
// Derivation (memoized by input identity)
// ---------------------------------------------------------------------------------------------

/** First time the client saw each pending decision (orders it against chat at the same age). */
const seen = new Map<string, number>();
let local: ChatEntry[] = [];
let dismissed: AgentState["safety"] = null;

const memo = {
  decSrc: null as Decision[] | null,
  decYear: NaN,
  decisions: [] as Decision[],
  dlgKey: [] as unknown[],
  dialogue: [] as ChatEntry[],
};

function visibleDecisions(st: AgentState): Decision[] {
  if (memo.decSrc === st.decisions && memo.decYear === st.playhead.year) return memo.decisions;
  const out = st.decisions.filter((d) => d.status !== "pending" || d.year <= st.playhead.year);
  const same = out.length === memo.decisions.length && out.every((d, i) => d === memo.decisions[i]);
  memo.decSrc = st.decisions;
  memo.decYear = st.playhead.year;
  if (!same) memo.decisions = out;
  const now = Date.now();
  for (const d of memo.decisions) if (!seen.has(d.id)) seen.set(d.id, now);
  return memo.decisions;
}

function deriveDialogue(st: AgentState, decisions: Decision[]): ChatEntry[] {
  const key = [decisions, st.answers, st.chat, st.profile?.quotes, st.profile?.knowMeScore, st.endAge, local];
  if (key.length === memo.dlgKey.length && key.every((k, i) => k === memo.dlgKey[i])) return memo.dialogue;
  memo.dlgKey = key;
  memo.dialogue = buildDialogue(st, decisions);
  return memo.dialogue;
}

function buildDialogue(st: AgentState, decisions: Decision[]): ChatEntry[] {
  const p = st.profile;
  if (!p) return local;
  type Row = { e: ChatEntry; age: number; t: number; o: number };
  const rows: Row[] = [];
  let o = 0;
  const push = (e: Partial<ChatEntry> & Pick<ChatEntry, "id" | "role" | "text">, age: number, t: number) =>
    rows.push({
      e: { channel: "main", year: p.startYear + (age - p.age), age, decisionId: null, quoteId: null, streaming: false, form: "message", at: t, ...e },
      age,
      t,
      o: o++,
    });

  // The start line, in the user's own words (one or more quotes), then the guide's welcome.
  // Start-line quotes: "start" (engine) / "start.line" (offline mock).
  for (const q of p.quotes.filter((x) => x.questionId === "start" || x.questionId === "start.line")) push({ id: `start-${q.id}`, role: "you", text: q.text, quoteId: q.id }, p.age, -3);
  push({ id: "intro-1", role: "guide", text: `Hi ${p.firstName}. I'm going to play your life forward from ${p.age} to ${st.endAge}, one year at a time. Your answers steer it.` }, p.age, -2);
  push({ id: "intro-2", role: "guide", text: "Every big choice splits it. The lives you don't pick keep running in the background. The first fork is today." }, p.age, -1);

  for (const d of decisions) {
    const ans = st.answers.find((x) => x.decisionId === d.id);
    const at = ans ? Date.parse(ans.answeredAt) : (seen.get(d.id) ?? Date.now());
    // A slid question leaves no prompt in the chat, only a quiet line (runs collapse below);
    // the life log keeps it.
    if (d.status === "slid") {
      push({ id: `slid-${d.id}`, role: "system", text: slidLine(1) }, d.age, at);
      continue;
    }
    push({ id: `d-${d.id}`, role: "guide", text: d.prompt, decisionId: d.id }, d.age, at - 2);
    if (!ans || d.status === "pending") continue;
    const opt = d.options.find((x) => x.id === ans.optionId);
    push({ id: `a-${d.id}`, role: "you", text: ans.text ?? opt?.label ?? "…", decisionId: d.id, quoteId: ans.text ? ans.quoteId : null }, d.age, at);
    if (d.kind === "big") {
      const others = st.branches.filter((b) => b.forkDecisionId === d.id).length;
      const n = others === 1 ? "life keeps" : `${others === 3 || others === 0 ? "three" : others} lives keep`;
      push({ id: `f-${d.id}`, role: "guide", text: `“${opt?.branchTitle ?? opt?.label ?? "Your own way"}” it is. The other ${n} running without you. You'll see them now and then.` }, d.age, at + 1);
    }
  }

  const letter = p.knowMeScore < TWIN_THRESHOLD;
  for (const m of st.chat) {
    const t = Date.parse(m.at) || Date.now();
    if (m.life === "interviewer") {
      // Free text becomes one or more sentence quotes; link the entry to the first one.
      const q = m.role === "user" ? p.quotes.find((x) => x.text.length > 3 && m.text.includes(x.text) && x.source === "answer" && x.questionId !== "start") : undefined;
      push({ id: m.id, role: m.role === "user" ? "you" : "guide", text: m.text, quoteId: q?.id ?? null, streaming: !m.done }, m.age, t);
    } else {
      push(
        { id: m.id, role: m.role === "user" ? "you" : "future", text: m.text, channel: `talk:${m.life}:${m.age}`, streaming: !m.done, form: letter ? "letter" : "message" },
        m.age,
        t,
      );
    }
  }
  for (const e of local) push(e, e.age ?? st.playhead.age, e.at);

  rows.sort((a, b) => a.age - b.age || a.t - b.t || a.o - b.o);
  const out: ChatEntry[] = [];
  let run = 0;
  for (const { e } of rows) {
    const slid = e.id.startsWith("slid-");
    if (slid && run > 0) {
      run++;
      out[out.length - 1] = { ...out[out.length - 1]!, text: slidLine(run) };
      continue;
    }
    run = slid ? 1 : 0;
    out.push(e);
  }
  return out;
}

function derive(st: AgentState, connection: ConnectionStatus): ClientState {
  const decisions = visibleDecisions(st);
  return {
    ...st,
    decisions,
    safety: st.safety && st.safety === dismissed ? null : st.safety,
    dialogue: deriveDialogue(st, decisions),
    connection,
    backend: "live",
  };
}

// ---------------------------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------------------------

let conn: SessionConnection | null = null;
let flushT: ReturnType<typeof setTimeout> | null = null;
let liveConnect: ((fresh: boolean) => void) | null = null;

export const useLiveSim = create<LiveSim>()((set, get) => {
  const sync = () => {
    flushT = null;
    const c = conn;
    if (!c) return;
    const st = c.getState();
    const status = c.getStatus();
    if (!st) {
      if (get().connection !== status) set({ connection: status });
      return;
    }
    set(derive(st, status));
  };
  const schedule = () => {
    // Coalesce bursts of patches into one store update (~one frame).
    if (flushT === null) flushT = setTimeout(sync, 16);
  };
  const calls = () => {
    if (!conn) connect(false);
    return conn!.calls;
  };
  const note = (text: string) => {
    const s = get();
    local = [...local, { id: `local-${local.length + 1}`, role: "system", text, channel: "main", year: s.playhead.year, age: s.playhead.age, decisionId: null, quoteId: null, streaming: false, form: "message", at: Date.now() }];
    schedule();
  };

  function connect(fresh: boolean) {
    conn?.close();
    if (flushT) clearTimeout(flushT);
    flushT = null;
    seen.clear();
    local = [];
    dismissed = null;
    memo.decSrc = null;
    memo.dlgKey = [];
    const id = loadOrCreateSessionId(fresh);
    conn = connectSession(id);
    conn.subscribe(schedule);
    set({ ...blank(id) });
  }
  liveConnect = connect;

  return {
    ...blank(""),
    async start(input) {
      await calls().start(input);
    },
    async answer(a) {
      if (a.slid || (!a.optionId && !a.text?.trim())) return calls().slide(a.decisionId);
      return calls().answer({ ...a, slid: undefined });
    },
    nudge: (id, to) => calls().nudge(id, to),
    setSpeed: (speed) => calls().setSpeed(speed),
    tick: (year) => calls().tick(year),
    pause: (paused) => calls().pause(paused),
    peekBranch: (id) => calls().peekBranch(id),
    sayTo: (life, age, text) => calls().sayTo(life, age, text),
    async addDocument(kind, text, file) {
      const name = { cv: "your CV", linkedin: "your LinkedIn PDF", ai_export: "your AI export" }[kind];
      try {
        // Raw file → R2; text → the agent (it enriches the profile and re-tunes the years ahead).
        await uploadDocument({ sessionId: get().sessionId, kind, text, file: file ?? null });
      } catch {
        await calls().addDocument(kind, text);
      }
      note(`Added ${name}. I know you a little better; the years ahead will use it.`);
    },
    reset() {
      connect(true);
    },
    dismissSafety() {
      dismissed = conn?.getState()?.safety ?? null;
      schedule();
    },
  };
});

/** Open the socket (once). `?new=1` forces a fresh session. */
export function startLive() {
  if (conn || location.pathname.startsWith("/admin") || location.hash.startsWith("#world-lab")) return;
  const fresh = new URLSearchParams(location.search).has("new");
  if (fresh) {
    const q = new URLSearchParams(location.search);
    q.delete("new");
    history.replaceState(null, "", `${location.pathname}${q.size ? `?${q}` : ""}${location.hash}`);
  }
  liveConnect?.(fresh);
}

export function stopLive() {
  conn?.close();
  conn = null;
}
