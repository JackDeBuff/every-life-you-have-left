/**
 * SessionAgent: one Durable Object (Agents SDK, SQLite-backed) per session. It owns state,
 * transport, storage and the orchestration loop (SPEC §2, §4, §8). The Engine (shared/engine.ts)
 * owns prompts and generation; this file never builds a prompt.
 *
 * Client URL: wss://<host>/agents/session-agent/<sessionId>  (see src/lib/agent-client.ts)
 * Calls (SDK RPC, `@callable` registered at the bottom): every SessionCalls method, plus
 *   addPortrait(p) and reset() (dev).
 * State: AgentState = SessionState + SessionExtras (worker/agent/protocol.ts), sent as snapshot +
 *   patches, persisted with setState (debounced).
 *
 * The loop
 *   start   → profile → [settings, first year, first big decision ("today")] → phase deciding
 *   tick    → the client reports the year it wants to show; the agent advances the playhead up to
 *             the buffered years, stops at big decisions (phase deciding), logs played years, and
 *             keeps BUFFER_AHEAD years generated ahead in chunks of CHUNK.
 *   answer  → applyAnswer, invalidate the buffered future, regenerate from playhead+1.
 *             big: spawnBranches → interlude (phase interlude, auto-resumes after INTERLUDE_S
 *             or on pause(false)) → settingsFor → playing.
 *   nudge   → SettingNudge from next year, invalidate, regenerate.
 *   setSpeed→ re-plan slots for the rest of the life (budgets rescale with years left).
 *   endAge  → step branches to the end, ending(), phase ended.
 */
import { Agent, callable, type Connection, type ConnectionContext } from "agents";
import type { DecisionSlot, DocInput, Engine } from "../../shared/engine";
import { endAgeFor } from "../../shared/schema";
import {
  SPEED_CONFIG,
  SpeedMode,
  StartInput,
  type Branch,
  type Decision,
  type DecisionAnswer,
  type LogLine,
  type Portrait,
  type SessionCalls,
  type SimYear,
} from "../../shared/sim";
import { loadEngine, type EngineKind } from "../engine-select";
import { bindLlm, type LlmEnv } from "../llm";
import { Mirror } from "./mirror";
import { diffState, type AgentState, type AnswerInput, type ChatMessage, type SnapshotMsg } from "./protocol";

const BUFFER_AHEAD = 4; // keep at least this many years generated past the playhead (target ≥2)
const CHUNK = 4; // generateYears chunk size (3–5)
const LOOKAHEAD_SMALL = 1; // make small decisions this many years before the playhead reaches them
const LOOKAHEAD_BIG = 2; // big ones earlier: the playhead waits at a big slot until its decision exists
const BRANCH_STEP = 5; // hidden branches advance coarsely in 5-year steps
const INTERLUDE_S = 9; // "Meanwhile…" length before auto-resume
const FLUSH_MS = 50; // patch coalescing
const PERSIST_MS = 1000; // setState debounce
const AGENT_LOG_KINDS = new Set(["decision", "nudge", "fork", "interlude", "slid"]);

const nowIso = () => new Date().toISOString();
const errCode = (e: unknown) => (e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "error");

export function initialAgentState(sessionId: string): AgentState {
  const y = new Date().getUTCFullYear();
  return {
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
    playhead: { year: y, age: 0, paused: true },
    branches: [],
    log: [],
    status: null,
    budgets: { smallLeft: 0, bigLeft: 0 },
    endAge: 70,
    verdictAtEnd: null,
    updatedAt: nowIso(),
    chat: [],
    interlude: null,
    ending: null,
    safety: null,
    thinking: false,
    bufferedTo: null,
    engine: "mock",
    error: null,
  };
}

export class SessionAgent extends Agent<Env, AgentState> implements SessionCalls {
  initialState = initialAgentState("");
  static options = { sendIdentityOnConnect: false };

  private cur: AgentState | null = null;
  private lastSent: AgentState | null = null;
  private rev = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private enginePromise: Promise<{ engine: Engine; kind: EngineKind; reason: string }> | null = null;
  private engineSync: Engine | null = null;
  private interludeSeq = 0;
  private epoch = 0;
  private genRunning: number | null = null;
  private genFailures = 0;
  private slots: DecisionSlot[] = [];
  private making = new Set<string>();
  private decisionQueue: Promise<void> = Promise.resolve();
  private forking = false;
  private ending = false;
  private pendingDocs: DocInput[] = [];
  private mirrorDb: Mirror | null = null;

  // -------------------------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------------------------

  /** SDK protocol messages (full-state broadcasts) off: we send snapshot + patches ourselves. */
  shouldSendProtocolMessages(_c: Connection, _ctx: ConnectionContext): boolean {
    return false;
  }

  async onStart(): Promise<void> {
    bindLlm(this.env as unknown as LlmEnv);
    const st = this.state;
    this.cur = st && st.sessionId ? { ...initialAgentState(this.name), ...st } : initialAgentState(this.name);
    if (this.cur.phase !== "start" && this.cur.profile) {
      const ph = this.cur.playhead.year;
      this.slots = (await this.eng()).planSlots(this.cur).filter((sl) => sl.year > ph);
    }
  }

  onConnect(connection: Connection, _ctx: ConnectionContext): void {
    const msg: SnapshotMsg = { type: "elyl:snapshot", rev: this.rev, state: this.s };
    connection.send(JSON.stringify(msg));
  }

  private get s(): AgentState {
    if (!this.cur) this.cur = { ...initialAgentState(this.name), ...(this.state ?? {}) };
    return this.cur;
  }

  private get mirror(): Mirror {
    if (!this.mirrorDb) this.mirrorDb = new Mirror(this.env.DB, this.name);
    return this.mirrorDb;
  }

  private engInfo(): Promise<{ engine: Engine; kind: EngineKind; reason: string }> {
    if (!this.enginePromise) {
      this.enginePromise = loadEngine(this.env).then((r) => {
        this.engineSync = r.engine;
        return r;
      });
    }
    return this.enginePromise;
  }
  private eng(): Promise<Engine> {
    return this.engInfo().then((r) => r.engine);
  }

  /** Immutable top-level update; schedules a patch flush and a debounced persist. */
  private update(patch: Partial<AgentState> | ((s: AgentState) => Partial<AgentState>)): AgentState {
    const base = this.s;
    const p = typeof patch === "function" ? patch(base) : patch;
    this.cur = { ...base, ...p, updatedAt: nowIso() };
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_MS);
    if (!this.persistTimer) this.persistTimer = setTimeout(() => this.persist(), PERSIST_MS);
    return this.cur;
  }

  private flush(): void {
    this.flushTimer = null;
    const next = this.s;
    if (!this.lastSent) {
      this.rev++;
      this.broadcast(JSON.stringify({ type: "elyl:snapshot", rev: this.rev, state: next } satisfies SnapshotMsg));
    } else {
      const patch = diffState(this.lastSent, next, this.rev + 1);
      if (patch) {
        this.rev++;
        this.broadcast(JSON.stringify(patch));
      }
    }
    this.lastSent = next;
  }

  private persist(): void {
    this.persistTimer = null;
    try {
      this.setState(this.s);
    } catch (e) {
      console.error("persist failed", errCode(e));
    }
  }

  /** Persist now (phase changes). */
  private persistNow(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persist();
  }

  /** Fire-and-forget with error capture. */
  private bg(name: string, fn: () => Promise<void>): void {
    const p = fn().catch((e) => {
      console.error(`bg ${name} failed`, e instanceof Error ? e.name : "error");
      this.update({ error: `${name}: ${errCode(e)}`, thinking: false });
    });
    this.ctx.waitUntil(p);
  }

  private get startYear(): number {
    return this.s.profile?.startYear ?? this.s.playhead.year;
  }
  private get startAge(): number {
    return this.s.profile?.age ?? this.s.playhead.age;
  }
  private get endYear(): number {
    return this.startYear + (this.s.endAge - this.startAge);
  }
  private ageAt(year: number): number {
    return this.startAge + (year - this.startYear);
  }

  // -------------------------------------------------------------------------------------------
  // SessionCalls
  // -------------------------------------------------------------------------------------------

  async start(input: StartInput): Promise<void> {
    const parsed = StartInput.parse(input);
    if (this.s.phase !== "start" || this.s.profile || this.s.thinking) return; // idempotent
    const { engine, kind } = await this.engInfo();
    this.update({ thinking: true, speed: parsed.speed, appearance: parsed.appearance, engine: kind, error: null });
    this.bg("start", async () => {
      const safety = parsed.line.trim() ? await engine.safety(parsed.line) : null;
      if (safety?.flagged) this.update({ safety });
      const profile = { ...(await engine.startProfile(parsed, this.pendingDocs)), sessionId: this.name };
      this.pendingDocs = [];
      const endAge = profile.endAge || endAgeFor(parsed.age);
      this.update({
        profile,
        endAge,
        playhead: { year: profile.startYear, age: profile.age, paused: true },
      });
      this.slots = engine.planSlots(this.s);
      this.updateBudgets();
      this.persistNow();
      void this.mirror.session(this.s, parsed);
      // In parallel: settings, the buffer (first year gives the world a scene), the first fork.
      this.bg("settings", async () => {
        const settings = await engine.settingsFor(this.s);
        this.update({ settings });
        void this.mirror.settings(settings);
      });
      this.ensureBuffer();
      this.ensureDecisions();
    });
  }

  async answer(a: AnswerInput): Promise<void> {
    const d = this.s.decisions.find((x) => x.id === a.decisionId);
    if (!d || d.status !== "pending") return;
    const rec: DecisionAnswer = {
      decisionId: d.id,
      optionId: a.optionId ?? null,
      text: a.text?.trim() ? a.text.trim().slice(0, 4000) : null,
      via: a.via,
      quoteId: null,
      answeredAt: nowIso(),
    };

    if (a.slid && d.kind === "small") {
      const slid: Decision = { ...d, status: "slid" };
      this.update((s) => ({
        decisions: s.decisions.map((x) => (x.id === d.id ? slid : x)),
        answers: [...s.answers, rec],
        log: [...s.log, this.line(d.year, "slid", `You let it slide: ${short(d.prompt, 16)}`, d.id, d.domains[0] ?? null)],
      }));
      void this.mirror.decisions([slid]);
      void this.mirror.answer(rec, true);
      this.ensureDecisions();
      return;
    }

    const answered: Decision = { ...d, status: "answered" };
    const isBig = d.kind === "big";
    if (isBig) this.forking = true;
    this.update((s) => ({
      decisions: s.decisions.map((x) => (x.id === d.id ? answered : x)),
      answers: [...s.answers, rec],
      thinking: isBig ? true : s.thinking,
    }));

    this.bg("answer", async () => {
      const engine = await this.eng();
      if (rec.text) {
        const safety = await engine.safety(rec.text);
        this.update({ safety: safety.flagged ? safety : this.s.safety });
      }
      const { profile, quote } = await engine.applyAnswer(this.s, answered, rec);
      const finalRec: DecisionAnswer = { ...rec, quoteId: quote?.id ?? null };
      const opt = d.options.find((o) => o.id === rec.optionId);
      const text = opt ? `You chose: ${opt.label}` : `You said: "${short(rec.text ?? "", 18)}"`;
      const why = quote ? { quoteId: quote.id, reason: "In your own words." } : null;
      this.update((s) => ({
        profile,
        answers: s.answers.map((x) => (x.decisionId === d.id && x.answeredAt === rec.answeredAt ? finalRec : x)),
        log: [...s.log, { ...this.line(d.year, "decision", text, d.id, d.domains[0] ?? null), why }],
      }));
      void this.mirror.decisions([answered]);
      void this.mirror.answer(finalRec, false);
      void this.mirror.session(this.s);

      this.invalidate();
      if (!isBig) return;
      await this.fork(engine, answered, rec.optionId ?? "");
    });
  }

  async nudge(settingId: string, to: string): Promise<void> {
    const st = this.s.settings.find((x) => x.id === settingId);
    if (!st || st.value === to || !this.s.profile) return;
    const year = Math.min(this.endYear, this.s.playhead.year + 1);
    const n = { settingId, from: st.value, to, year, age: this.ageAt(year) };
    const label = st.options.find((o) => o.value === to)?.label ?? to;
    const text =
      st.type === "slider" ? `At ${n.age} you moved "${st.label}" to ${to}`
      : st.type === "toggle" ? `At ${n.age} you turned ${to === "true" ? "on" : "off"} "${st.label}"`
      : `At ${n.age} you shifted ${st.label.toLowerCase()} to ${label.toLowerCase()}`;
    this.update((s) => ({
      settings: s.settings.map((x) => (x.id === settingId ? { ...x, value: to } : x)),
      nudges: [...s.nudges, n],
      log: [...s.log, this.line(s.playhead.year, "nudge", text, settingId, null)],
    }));
    void this.mirror.nudge(n);
    this.invalidate();
  }

  async setSpeed(speed: SpeedMode): Promise<void> {
    const sp = SpeedMode.parse(speed);
    if (sp === this.s.speed) return;
    this.update({ speed: sp });
    if (!this.s.profile) return;
    const engine = await this.eng();
    const ph = this.s.playhead.year;
    this.slots = engine.planSlots(this.s).filter((sl) => sl.year > ph);
    // Drop future decisions that haven't been reached; the new plan replaces them.
    this.update((s) => ({ decisions: s.decisions.filter((d) => d.status !== "pending" || d.year <= ph) }));
    this.updateBudgets();
    this.ensureDecisions();
  }

  async tick(year: number): Promise<void> {
    const s = this.s;
    if (s.phase !== "playing" || !s.profile || this.ending) return;
    const target = Math.max(s.playhead.year, Math.floor(year));
    const lastGen = s.years.at(-1)?.year ?? this.startYear - 1;
    let gate = Infinity;
    for (const d of s.decisions) if (d.kind === "big" && d.status === "pending" && d.year > s.playhead.year) gate = Math.min(gate, d.year);
    // A big slot whose decision isn't written yet also holds the playhead (at its year, not past it).
    for (const sl of this.slots) if (sl.kind === "big" && sl.year >= s.playhead.year && !this.materialized(sl)) gate = Math.min(gate, sl.year);
    let next = Math.min(target, lastGen, gate, this.endYear);
    // Periodic interlude (1×/2×): stop on the year it falls due.
    const every = SPEED_CONFIG[s.speed].interludeEveryYears;
    let periodic = false;
    if (every && s.branches.some((b) => b.status === "active")) {
      for (let y = s.playhead.year + 1; y <= next; y++) {
        if ((y - this.startYear) % every === 0) {
          next = y;
          periodic = true;
          break;
        }
      }
    }
    const starved = target > lastGen || (gate <= target && gate !== Infinity && !s.decisions.some((d) => d.kind === "big" && d.status === "pending" && d.year === gate));
    if (next > s.playhead.year) {
      const yr = s.years.find((y) => y.year === next);
      this.update({ playhead: { year: next, age: this.ageAt(next), paused: false }, status: yr?.states ?? s.status, thinking: starved });
      this.catchUpLog();
    } else if (starved !== s.thinking) {
      this.update({ thinking: starved });
    }
    this.gateCheck();
    if (this.s.phase === "playing" && this.s.playhead.year >= this.endYear) {
      this.runEnding();
      return;
    }
    if (periodic && this.s.phase === "playing") this.bg("interlude", () => this.runInterlude());
    this.stepBranchesCoarse();
    this.ensureBuffer();
    this.ensureDecisions();
  }

  async pause(paused: boolean): Promise<void> {
    if (this.s.phase === "interlude" && !paused) {
      this.endInterlude();
      return;
    }
    this.update((s) => ({ playhead: { ...s.playhead, paused } }));
  }

  async peekBranch(branchId: string): Promise<Branch> {
    const b = this.s.branches.find((x) => x.id === branchId);
    if (!b) throw new Error("unknown_branch");
    const engine = await this.eng();
    const stepped = await engine.stepBranch(this.s, b, this.s.playhead.year, true);
    this.update((s) => ({ branches: s.branches.map((x) => (x.id === branchId ? stepped : x)) }));
    void this.mirror.branches([stepped]);
    return stepped;
  }

  async addDocument(kind: "cv" | "linkedin" | "ai_export", text: string): Promise<void> {
    const doc: DocInput = { kind, text: String(text).slice(0, 60_000) };
    if (!doc.text.trim()) return;
    const id = `u-${crypto.randomUUID().slice(0, 8)}`;
    void this.mirror.upload(id, kind, null, null, doc.text);
    if (!this.s.profile) {
      this.pendingDocs.push(doc);
      return;
    }
    const engine = await this.eng();
    const { profile } = await engine.enrichProfile(this.s.profile, [doc], null);
    this.update({ profile });
    void this.mirror.session(this.s);
    this.invalidate();
  }

  async sayTo(life: string, age: number, text: string): Promise<void> {
    const msg = String(text ?? "").trim().slice(0, 4000);
    if (!msg) return;
    const engine = await this.eng();
    const safety = await engine.safety(msg);
    if (safety.flagged) this.update({ safety });
    const history = this.s.chat.filter((m) => m.life === life && m.done).slice(-20).map((m) => ({ role: m.role, text: m.text }));
    const user: ChatMessage = { id: `m-${crypto.randomUUID().slice(0, 8)}`, life, age, role: "user", text: msg, done: true, at: nowIso() };
    let reply: ChatMessage = { id: `m-${crypto.randomUUID().slice(0, 8)}`, life, age, role: "assistant", text: "", done: false, at: nowIso() };
    this.update((s) => ({ chat: [...s.chat, user, reply] }));
    void this.mirror.chat(user);
    const replace = (m: ChatMessage) => this.update((s) => ({ chat: s.chat.map((x) => (x.id === m.id ? m : x)) }));
    try {
      for await (const delta of engine.replyAs(this.s, life, age, history, msg)) {
        reply = { ...reply, text: reply.text + delta };
        replace(reply);
      }
    } catch (e) {
      this.update({ error: `sayTo: ${errCode(e)}` });
    }
    reply = { ...reply, done: true, text: reply.text || "…" };
    replace(reply);
    void this.mirror.chat(reply);
  }

  /** Called by /api/portrait (DO RPC) after a portrait is stored in R2. */
  async addPortrait(p: Portrait): Promise<void> {
    this.update((s) => ({ portraits: [...s.portraits.filter((x) => x.band !== p.band), p] }));
  }

  /** Dev only: wipe the session back to the start screen. */
  async reset(): Promise<void> {
    this.epoch++;
    this.slots = [];
    this.making.clear();
    this.forking = false;
    this.ending = false;
    this.cur = initialAgentState(this.name);
    this.lastSent = null;
    this.update({});
    this.persistNow();
  }

  // -------------------------------------------------------------------------------------------
  // The loop
  // -------------------------------------------------------------------------------------------

  private line(year: number, kind: LogLine["kind"], text: string, refId: string | null, domain: LogLine["domain"]): LogLine {
    return {
      id: `log-${kind}-${refId ?? year}-${crypto.randomUUID().slice(0, 6)}`,
      year, age: this.ageAt(year), kind, text, domain, tone: null, why: null, baseRate: null, refId,
    };
  }

  private slotKey(sl: DecisionSlot, idx: number) {
    return `${sl.kind}-${sl.year}-${idx}`;
  }
  /** A slot is materialized when there are enough decisions of its kind in its year. */
  private materialized(sl: DecisionSlot): boolean {
    const idx = this.slots.filter((x) => x.kind === sl.kind && x.year === sl.year).indexOf(sl);
    const have = this.s.decisions.filter((d) => d.kind === sl.kind && d.year === sl.year).length;
    return have > Math.max(0, idx);
  }

  private updateBudgets(): void {
    const left = this.slots.filter((sl) => !this.materialized(sl));
    this.update({
      budgets: { smallLeft: left.filter((x) => x.kind === "small").length, bigLeft: left.filter((x) => x.kind === "big").length },
    });
  }

  /** Create decisions shortly before the playhead reaches them (serialized). */
  private ensureDecisions(): void {
    const s = this.s;
    if (!s.profile || s.phase === "ended") return;
    const ph = s.playhead.year;
    const byKindYear = new Map<string, number>();
    for (const sl of this.slots) {
      const k = `${sl.kind}-${sl.year}`;
      const idx = byKindYear.get(k) ?? 0;
      byKindYear.set(k, idx + 1);
      if (sl.year > ph + (sl.kind === "big" ? LOOKAHEAD_BIG : LOOKAHEAD_SMALL)) continue;
      if (sl.year < ph) continue; // passed while we were busy: skip it
      const key = this.slotKey(sl, idx);
      if (this.making.has(key) || this.materialized(sl)) continue;
      this.making.add(key);
      this.decisionQueue = this.decisionQueue.then(async () => {
        try {
          const engine = await this.eng();
          const made = await engine.makeDecision(this.s, sl);
          let id = made.id;
          while (this.s.decisions.some((d) => d.id === id)) id = `${made.id}-${crypto.randomUUID().slice(0, 4)}`;
          const d: Decision = { ...made, id, kind: sl.kind, year: sl.year, age: sl.age, status: "pending" };
          this.update((st) => ({ decisions: [...st.decisions, d] }));
          this.updateBudgets();
          void this.mirror.decisions([d]);
          this.gateCheck();
        } catch (e) {
          console.error("makeDecision failed", e instanceof Error ? e.name : "error");
          this.update({ error: `makeDecision: ${errCode(e)}` });
        } finally {
          this.making.delete(key);
        }
      });
    }
  }

  /** A pending big decision at or before the playhead stops time. */
  private gateCheck(): void {
    const s = this.s;
    if (!s.profile || this.forking || this.ending) return;
    if (s.phase !== "playing" && s.phase !== "start") return;
    const big = s.decisions.find((d) => d.kind === "big" && d.status === "pending" && d.year <= s.playhead.year);
    if (big) {
      this.update((st) => ({ phase: "deciding", playhead: { ...st.playhead, paused: true }, thinking: false }));
      this.persistNow();
      void this.mirror.session(this.s);
    }
  }

  /** Drop the provisional future (years > playhead) and regenerate. */
  private invalidate(): void {
    this.epoch++;
    const ph = this.s.playhead.year;
    this.update((s) => {
      const years = s.years.filter((y) => y.year <= ph);
      return { years, bufferedTo: years.at(-1)?.year ?? null };
    });
    this.genFailures = 0;
    this.ensureBuffer();
  }

  /** Keep BUFFER_AHEAD years generated past the playhead. One run per epoch. */
  private ensureBuffer(): void {
    const s = this.s;
    if (!s.profile || s.phase === "ended") return;
    if (this.genRunning === this.epoch) return;
    const lastGen = s.years.at(-1)?.year ?? this.startYear - 1;
    if (lastGen >= this.endYear) return;
    if (lastGen - s.playhead.year >= BUFFER_AHEAD) return;
    const from = lastGen + 1;
    const count = Math.min(CHUNK, this.endYear - lastGen);
    const epoch = this.epoch;
    this.genRunning = epoch;
    this.bg("generate", async () => {
      const engine = await this.eng();
      try {
        await engine.generateYears(this.s, from, count, (y: SimYear) => {
          if (epoch !== this.epoch) return;
          this.update((st) => {
            if (st.years.some((x) => x.year === y.year) || y.year <= (st.years.at(-1)?.year ?? -Infinity)) {
              const years = st.years.map((x) => (x.year === y.year ? y : x));
              return { years };
            }
            return { years: [...st.years, y], bufferedTo: y.year };
          });
          this.catchUpLog();
        });
        this.genFailures = 0;
      } catch (e) {
        this.genFailures++;
        console.error("generateYears failed", e instanceof Error ? e.name : "error");
        this.update({ error: `generateYears: ${errCode(e)}` });
        if (this.genFailures > 3) return;
        await new Promise((r) => setTimeout(r, 1500 * this.genFailures));
      } finally {
        if (this.genRunning === epoch) this.genRunning = null;
      }
      if (epoch === this.epoch) {
        this.ensureBuffer();
        this.ensureDecisions();
        if (this.s.thinking && !this.forking && this.s.phase === "playing") {
          const lg = this.s.years.at(-1)?.year ?? 0;
          if (lg > this.s.playhead.year) this.update({ thinking: false });
        }
      }
    });
  }

  /** Log every played year (≤ playhead) once, from engine.logFor. */
  private catchUpLog(): void {
    const s = this.s;
    const logged = new Set(s.log.filter((l) => l.kind === "year").map((l) => l.year));
    const fresh: LogLine[] = [];
    const played: SimYear[] = [];
    const ids = new Set(s.log.map((l) => l.id));
    for (const y of s.years) {
      if (y.year > s.playhead.year || logged.has(y.year)) continue;
      played.push(y);
      // Engine and mock are both sync here (logFor is pure).
      for (const l of this.engineLogFor(y)) {
        if (AGENT_LOG_KINDS.has(l.kind) || ids.has(l.id)) continue;
        ids.add(l.id);
        fresh.push(l);
      }
    }
    if (!fresh.length) return;
    // Agent lines (decisions/nudges) for the same year stay after the year's own lines.
    this.update((st) => ({ log: [...st.log, ...fresh].sort((a, b) => a.year - b.year), status: st.years.find((y) => y.year === st.playhead.year)?.states ?? st.status }));
    void this.mirror.years(played);
    void this.mirror.session(this.s);
  }

  /** engine.logFor is pure/sync; the engine has always loaded before any year exists. */
  private engineLogFor(y: SimYear): LogLine[] {
    const yearLine: LogLine = { id: `log-${y.year}-y`, year: y.year, age: y.age, kind: "year", text: y.summary, domain: null, tone: null, why: null, baseRate: null, refId: null };
    if (!this.engineSync) return [yearLine];
    try {
      const lines = this.engineSync.logFor(this.s, y);
      return lines.some((l) => l.kind === "year") ? lines : [yearLine, ...lines];
    } catch {
      return [yearLine];
    }
  }

  /** Hidden branches follow the playhead coarsely (5-year steps, cheap). One pass at a time. */
  private steppingBranches = false;
  private stepBranchesCoarse(): void {
    if (this.steppingBranches) return;
    const ph = this.s.playhead.year;
    const due = this.s.branches.filter((b) => b.status === "active" && (b.years.at(-1)?.year ?? b.forkYear) + BRANCH_STEP <= ph);
    if (!due.length) return;
    this.steppingBranches = true;
    this.bg("stepBranches", async () => {
      try {
        const engine = await this.eng();
        const stepped = await Promise.all(due.map((b) => engine.stepBranch(this.s, b, ph, false).catch(() => b)));
        const byId = new Map(stepped.map((b) => [b.id, b]));
        this.update((s) => ({ branches: s.branches.map((b) => byId.get(b.id) ?? b) }));
        void this.mirror.branches(stepped);
      } finally {
        this.steppingBranches = false;
      }
    });
  }

  /** After a big decision: branches → interlude → settings → playing. */
  private async fork(engine: Engine, d: Decision, chosenOptionId: string): Promise<void> {
    try {
      const opt = d.options.find((o) => o.id === chosenOptionId);
      this.update((s) => ({ log: [...s.log, this.line(d.year, "fork", `Your life splits here: ${opt?.branchTitle ?? opt?.label ?? "your own way"}`, d.id, d.domains[0] ?? null)] }));
      const returned = await engine.spawnBranches(this.s, d, chosenOptionId);
      const ids = new Set(returned.map((b) => b.id));
      this.update((s) => {
        const kept = s.branches.filter((b) => !ids.has(b.id)).map((b) => (b.status === "active" ? { ...b, status: "retired" as const } : b));
        return { branches: [...kept, ...returned] };
      });
      void this.mirror.branches(this.s.branches);
      this.bg("settings", async () => {
        const settings = await engine.settingsFor(this.s);
        this.update({ settings });
        void this.mirror.settings(settings);
      });
      if (this.s.branches.some((b) => b.status === "active")) {
        this.forking = false;
        await this.runInterlude();
        return;
      }
    } catch (e) {
      this.update({ error: `fork: ${errCode(e)}` });
    }
    this.forking = false;
    this.toPlaying();
  }

  private async runInterlude(): Promise<void> {
    const engine = await this.eng();
    const seq = ++this.interludeSeq;
    this.update((s) => ({
      phase: "interlude",
      interlude: null,
      thinking: true,
      playhead: { ...s.playhead, paused: true },
      log: [...s.log, this.line(s.playhead.year, "interlude", "Meanwhile, in your other lives…", null, null)],
    }));
    this.persistNow();
    try {
      const cuts = await engine.interlude(this.s);
      if (this.s.phase !== "interlude") return; // skipped by the client meanwhile
      this.update({ interlude: cuts, thinking: false });
      await this.schedule(INTERLUDE_S, "endInterlude", { seq });
    } catch (e) {
      this.update({ error: `interlude: ${errCode(e)}` });
      this.endInterlude();
    }
  }

  /** Scheduled (alarm, with seq) or client pause(false) (no seq). Stale alarms are ignored. */
  async endInterlude(payload?: { seq?: number }): Promise<void> {
    if (this.s.phase !== "interlude") return;
    if (payload?.seq && this.interludeSeq && payload.seq !== this.interludeSeq) return;
    this.update({ interlude: null });
    this.toPlaying();
  }

  private toPlaying(): void {
    this.update((s) => ({ phase: "playing", thinking: false, playhead: { ...s.playhead, paused: false } }));
    this.persistNow();
    void this.mirror.session(this.s);
    this.gateCheck();
    this.ensureBuffer();
    this.ensureDecisions();
  }

  private runEnding(): void {
    if (this.ending) return;
    this.ending = true;
    this.update((s) => ({ thinking: true, playhead: { ...s.playhead, paused: true } }));
    this.bg("ending", async () => {
      const engine = await this.eng();
      const end = this.endYear;
      const stepped = await Promise.all(
        this.s.branches.map((b) => (b.status === "active" ? engine.stepBranch(this.s, b, end, false).catch(() => b) : Promise.resolve(b))),
      );
      this.update({ branches: stepped });
      const ending = await engine.ending(this.s);
      this.update((s) => ({
        phase: "ended",
        thinking: false,
        ending,
        verdictAtEnd: ending.verdict,
        branches: s.branches.map((b) => (ending.branchVerdicts[b.id] ? { ...b, verdictAtEnd: ending.branchVerdicts[b.id]! } : b)),
      }));
      this.persistNow();
      void this.mirror.branches(this.s.branches);
      void this.mirror.session(this.s);
    });
  }
}

function short(s: string, n: number): string {
  const w = s.split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(" ")}…` : s;
}

// `@callable()` without decorator syntax: Vite's Oxc transform doesn't support TC39 decorators,
// and registration is just metadata on the method (agents/callable-decorator).
const CALLABLE: (keyof SessionAgent & string)[] = [
  "start", "answer", "nudge", "setSpeed", "tick", "pause", "peekBranch", "addDocument", "sayTo", "addPortrait", "reset",
];
for (const name of CALLABLE) {
  const fn = SessionAgent.prototype[name] as unknown as (...a: unknown[]) => unknown;
  callable()(fn, {} as ClassMethodDecoratorContext);
}
