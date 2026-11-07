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
import type { DecisionSlot, DocInput, Engine, Ending, PreparedFork, SafetyResult } from "../../shared/engine";
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
import type { Profile } from "../../shared/schema";
import { loadEngine, type LoadedEngine, type UsageSink } from "../engine-select";
import type { FoldItem, SmallDecisionKit } from "../engine/smalls";
import { costOf } from "../engine/pricing";
import { bindLlm, type LlmEnv } from "../llm";
import { Mirror } from "./mirror";
import { diffState, type AgentState, type AnswerInput, type ChatMessage, type SessionUsage, type SnapshotMsg } from "./protocol";

const BUFFER_AHEAD = 4; // keep at least this many years generated past the playhead (target ≥2)
const CHUNK = 4; // generateYears chunk size (3–5)
const CHUNK_FAST = 8; // Auto/4x: one streamed call per stretch, up to the next fork
const LOOKAHEAD_SMALL = 1; // make small decisions this many years before the playhead reaches them
// D-089 small-card queue: refill when fewer than REFILL_AT cards are written ahead; one batch call
// writes up to BATCH_MAX cards for slots within BATCH_YEARS of the first; queued cards older than
// STALE_YEARS are dropped. Answers fold every FOLD_EVERY, or before the next year call.
const REFILL_AT = 2;
const BATCH_MAX = 4;
const BATCH_YEARS = 3;
const STALE_YEARS = 3;
const FOLD_EVERY = 3;
const FOLD_WAIT_MS = 4000; // the next year call waits at most this long for a pending fold
const FOLLOWUP_MS = 7000; // the next small card waits at most this long for a follow-up
// 1x: no NEW small card this late into the year right before a fork (it would be shelved by the
// fork before anyone could answer it; a 1x year lasts 6 s, 12 s while a card is up).
const PREFORK_CUTOFF_MS = 6000;
// Big ones earlier (the playhead waits at a big slot until its decision exists): ~12 s of playback
// ahead, at least 2 years. A real big decision takes ~5 s on 3.8 Flash, 15-20 s when it stalls.
const lookaheadBig = (speed: AgentState["speed"]) => Math.max(2, Math.ceil(12 / SPEED_CONFIG[speed].secondsPerYear));
const BRANCH_STEP = 5; // hidden branches advance coarsely in 5-year steps
// "Meanwhile…" safety net: the client ends the interlude with pause(false) when the 3D world's cuts
// finish (and after the fork moment); this only resumes a session whose client went away.
const INTERLUDE_S = 30;
const FLUSH_MS = 50; // patch coalescing
const HEDGE_MS = 6500; // no year streamed after this long → the fast writer races the stretch
// From a fork's answer to its "meanwhile" cuts. Past this the interlude is skipped (measured: a
// 28 s stall once); life resumes and the branches land in the background. The fork is normally
// prepared while its card is open (prepareFork), so the cuts are ready at the answer; Auto (the
// judge run, <= 3 min) waits less for a fork that isn't.
const forkDeadlineMs = (speed: AgentState["speed"]) => (speed === "auto" ? 8000 : 13_000);

/** The promise's value if it settles before `deadline` (epoch ms), else null. Rejections propagate. */
function before<T>(p: Promise<T>, deadline: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<null>((res) => (t = setTimeout(() => res(null), Math.max(0, deadline - Date.now()))))]).finally(() => clearTimeout(t));
}
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
    usage: null,
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
  private enginePromise: Promise<LoadedEngine> | null = null;
  /** Resolves when the full profile is in (answers wait for it; the first card may come sooner). */
  private profileReady: Promise<void> = Promise.resolve();
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

  // ---- D-089: small decisions in batches (see ensureDecisions / answerSmall / flushFold)
  /** The real engine's small-decision kit; null = single cards and per-answer folds (mock, or SMALL_BATCH=off). */
  private kit: SmallDecisionKit | null = null;
  /** Written-ahead small cards, served in order. `ctx` = the context they were written in, `at` = the playhead then. */
  private smallQ: { card: Decision; ctx: number; at: number }[] = [];
  /** Bumped when the context changes (a fork, a nudge, a new thread, a speed change, new documents): the queue goes. */
  private smallCtx = 0;
  private batching = false;
  private batchMisses = 0;
  /** A follow-up card being written: it is served before the queue. */
  private followUp: Promise<void> | null = null;
  /** When a due (visible) small slot first found nothing to serve. */
  private waitingSince: number | null = null;
  /** When the playhead entered its current year (or life resumed in it after a fork). */
  private yearStartedAt = Date.now();
  /** Answers whose quotes are in but which aren't folded into the profile yet. */
  private pendingFold: FoldItem[] = [];
  private foldChain: Promise<void> = Promise.resolve();

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
    if (this.cur.usage) {
      const u = this.cur.usage;
      this.spend = { ...freshSpend(), usd: u.usd, listUsd: u.listUsd ?? u.usd, calls: u.calls, byPurpose: { ...u.byPurpose }, detail: { ...(u.detail ?? {}) }, smalls: { ...freshSpend().smalls, ...(u.smalls ?? {}) } };
    }
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

  /** Session cost tally (admin + timing runs). Published at most every few seconds. */
  private spend = freshSpend();
  private spendTimer: ReturnType<typeof setTimeout> | null = null;
  private onUsage: UsageSink = (u) => {
    const c = costOf(u);
    // Latency trail for timing runs (no personal data): purpose, model, first token, total, cache hits.
    console.log(`[llm] ${u.purpose} ${u.model.replace("gemini-", "")} ft=${u.firstTokenMs ?? "-"} ms=${u.ms} in=${u.inputTokens} cached=${u.cachedTokens ?? 0}${u.hedged ? " hedged" : ""}`);
    this.spend.usd += c;
    this.spend.listUsd += costOf(u, { cache: false });
    this.spend.calls++;
    const k = u.purpose.split(".")[0] ?? u.purpose;
    this.spend.byPurpose[k] = (this.spend.byPurpose[k] ?? 0) + c;
    const d = (this.spend.detail[u.purpose] ??= { calls: 0, usd: 0, inTok: 0, cachedTok: 0, outTok: 0 });
    d.calls++;
    d.usd += c;
    d.inTok += u.inputTokens;
    d.cachedTok += u.cachedTokens ?? 0;
    d.outTok += u.outputTokens + u.thoughtTokens;
    this.publishSpend();
  };
  private publishSpend(): void {
    if (this.spendTimer) return;
    this.spendTimer = setTimeout(() => {
      this.spendTimer = null;
      const r = (x: number) => Math.round(x * 10000) / 10000;
      const sp = this.spend;
      this.update({
        usage: {
          usd: r(sp.usd),
          listUsd: r(sp.listUsd),
          calls: sp.calls,
          byPurpose: Object.fromEntries(Object.entries(sp.byPurpose).map(([a, b]) => [a, r(b)])),
          detail: Object.fromEntries(Object.entries(sp.detail).map(([a, b]) => [a, { ...b, usd: r(b.usd) }])),
          smalls: { ...sp.smalls },
        },
      });
    }, 2000);
  }

  private engInfo(): Promise<LoadedEngine> {
    if (!this.enginePromise) {
      this.enginePromise = loadEngine(this.env, this.onUsage).then((r) => {
        this.engineSync = r.engine;
        // SMALL_BATCH=off restores the old small-card path (one card per call, a fold and a
        // re-written future per answer); kept for before/after measurements.
        const off = String((this.env as Env & { SMALL_BATCH?: string }).SMALL_BATCH ?? "").toLowerCase() === "off";
        this.kit = r.small && !off ? r.small : null;
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
    const { engine, kind, provisional } = await this.engInfo();
    this.update({ thinking: true, speed: parsed.speed, appearance: parsed.appearance, engine: kind, error: null });
    let ready!: () => void;
    this.profileReady = new Promise<void>((r) => (ready = r));
    // The first card ("today") from a code-only profile, in parallel with the full profile
    // (~5 s vs ~10 s). The UI shows Play as soon as the card exists.
    if (provisional) {
      try {
        const p = this.withId(provisional(parsed));
        this.update({ profile: p, endAge: p.endAge || endAgeFor(parsed.age), playhead: { year: p.startYear, age: p.age, paused: true } });
        const slot0 = engine.planSlots(this.s).find((sl) => sl.kind === "big" && sl.year === p.startYear) ?? { year: p.startYear, age: p.age, kind: "big" as const, reason: "today" };
        this.queueDecision(slot0, this.slotKey(slot0, 0), { ...this.s, profile: p });
      } catch (e) {
        console.error("provisional start failed", e instanceof Error ? e.name : "error");
      }
    }
    this.bg("start", async () => {
      try {
        const safety = parsed.line.trim() ? await this.screen(engine, parsed.line, `Asked "What's on your mind lately?"`) : null;
        if (safety?.flagged) this.update({ safety });
        const profile = this.withId(await engine.startProfile(parsed, this.pendingDocs));
        this.pendingDocs = [];
        const endAge = profile.endAge || endAgeFor(parsed.age);
        this.update((s) => ({
          profile,
          endAge,
          playhead: s.phase === "start" ? { year: profile.startYear, age: profile.age, paused: true } : s.playhead,
        }));
      } finally {
        ready();
      }
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
    if (!d) return;
    // A small card that slid (or was shelved by a fork) while they were answering it: their answer
    // still counts, bound to the card they answered (never to whatever is pending now).
    const late = d.kind === "small" && d.status === "slid" && !a.slid && (!!a.optionId || !!a.text?.trim());
    if (d.status !== "pending" && !late) return;
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
    const opt = d.options.find((o) => o.id === rec.optionId);
    const decisionLine = this.line(d.year, "decision", opt ? `You chose: ${opt.label}` : `You said: "${short(rec.text ?? "", 18)}"`, d.id, d.domains[0] ?? null);
    this.update((s) => ({
      decisions: s.decisions.map((x) => (x.id === d.id ? answered : x)),
      answers: [...s.answers.filter((x) => !(late && x.decisionId === d.id)), rec],
      log: [...s.log.filter((l) => !(late && l.kind === "slid" && l.refId === d.id)), decisionLine],
      thinking: isBig ? true : s.thinking,
    }));
    if (!isBig && this.kit) {
      this.answerSmall(answered, rec, decisionLine.id);
      return;
    }

    this.bg("answer", async () => {
      const engine = await this.eng();
      await this.profileReady;
      // A fork: the branches start at once (they don't need the folded profile). A tapped fork
      // also starts its years now; typed words wait for the fold, so the consequence can cite them.
      const early = isBig && !rec.text;
      const forkP = isBig ? this.fork(engine, answered, rec.optionId ?? "") : null;
      // A fork rewrites its own year too: the engine writes the consequence from decision.year.
      // The old future goes now either way (the playhead must never step into it).
      if (isBig) {
        this.holdGen = !early;
        this.invalidate(d.year);
      }
      let folded: Awaited<ReturnType<Engine["applyAnswer"]>> | null = null;
      let safety: Awaited<ReturnType<Engine["safety"]>> | null;
      const kit = this.kit;
      try {
        const screened = rec.text ? this.screen(engine, rec.text, `Answering the question "${d.prompt}"`) : Promise.resolve(null);
        if (kit) {
          // D-089: the quote at once, in code; the fold takes this answer and any small answers
          // still waiting, in one call. A fork is a new context: the small-card queue goes.
          this.newContext();
          const q = kit.quoteAnswer(this.s, answered, rec);
          this.update({ profile: this.withId(q.profile) });
          folded = { profile: q.profile, quote: q.quote };
          if (q.quote) this.pendingFold.push({ decision: answered, answer: { ...rec, quoteId: q.quote.id } });
          [safety] = await Promise.all([screened, this.flushFold()]);
        } else {
          [safety, folded] = await Promise.all([screened, engine.applyAnswer(this.s, answered, rec)]);
        }
      } finally {
        if (this.holdGen) {
          this.holdGen = false;
          this.ensureBuffer();
        }
      }
      if (safety?.flagged) this.update({ safety });
      // (with the kit the fold has already patched the live profile; keep it)
      const profile = kit ? this.s.profile! : this.withId(folded!.profile);
      const quote = folded!.quote;
      const finalRec: DecisionAnswer = { ...rec, quoteId: quote?.id ?? null };
      const why = quote ? { quoteId: quote.id, reason: "In your own words." } : null;
      this.update((s) => ({
        profile,
        answers: s.answers.map((x) => (x.decisionId === d.id && x.answeredAt === rec.answeredAt ? finalRec : x)),
        log: why ? s.log.map((l) => (l.id === decisionLine.id ? { ...l, why } : l)) : s.log,
      }));
      void this.mirror.decisions([answered]);
      void this.mirror.answer(finalRec, false);
      void this.mirror.session(this.s);
      if (!isBig) this.invalidate();
      if (isBig) {
        this.bg("settings", async () => {
          const settings = await engine.settingsFor(this.s);
          this.update({ settings });
          void this.mirror.settings(settings);
        });
      }
      if (forkP) await forkP;
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
    this.newContext();
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
    this.newContext();
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
      this.yearStartedAt = Date.now();
      this.catchUpLog();
    } else if (starved !== s.thinking) {
      this.update({ thinking: starved });
    }
    this.gateCheck();
    // The end year itself plays like any other; the client asks for the year after it to end.
    if (this.s.phase === "playing" && this.s.playhead.year >= this.endYear && Math.floor(year) > this.endYear) {
      this.runEnding();
      return;
    }
    if (periodic && this.s.phase === "playing") this.bg("interlude", () => this.runInterlude());
    this.stepBranchesCoarse();
    this.ensureBuffer();
    this.ensureDecisions();
    this.precomputeEnding();
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
    this.update((s) => ({ branches: s.branches.map((x) => (x.id === branchId ? { ...stepped, status: x.status } : x)) }));
    void this.mirror.branches(this.s.branches.filter((x) => x.id === branchId));
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
    this.update({ profile: this.withId(profile) });
    void this.mirror.session(this.s);
    this.newContext();
    this.invalidate();
  }

  async sayTo(life: string, age: number, text: string): Promise<void> {
    const msg = String(text ?? "").trim().slice(0, 4000);
    if (!msg) return;
    const engine = await this.eng();
    const safety = await this.screen(engine, msg, life === "interviewer" ? "Telling a life-planning guide about themselves" : `Writing to an imagined version of themselves at ${age}`);
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
    // Words said to the interviewer are kept as a quote and re-tune the years ahead.
    if (life === "interviewer" && this.s.profile && !safety.flagged) {
      this.bg("enrich", async () => {
        const { profile } = await engine.enrichProfile(this.s.profile!, [], msg);
        this.update({ profile: this.withId(profile) });
        void this.mirror.session(this.s);
        this.newContext();
        this.invalidate();
      });
    }
  }

  /** Called by /api/portrait (DO RPC) after a portrait is stored in R2. */
  async addPortrait(p: Portrait): Promise<void> {
    this.update((s) => ({ portraits: [...s.portraits.filter((x) => x.band !== p.band), p] }));
  }

  /** Dev only: wipe the session back to the start screen. */
  async reset(): Promise<void> {
    this.epoch++;
    this.spend = freshSpend();
    this.prepared.clear();
    this.holdGen = false;
    this.endingPre = null;
    this.slots = [];
    this.making.clear();
    this.forking = false;
    this.ending = false;
    this.smallQ = [];
    this.smallCtx++;
    this.pendingFold = [];
    this.waitingSince = null;
    this.batchMisses = 0;
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
    const ph = this.s.playhead.year;
    const left = this.slots.filter((sl) => !this.materialized(sl) && sl.year >= ph);
    this.update({
      budgets: { smallLeft: left.filter((x) => x.kind === "small").length, bigLeft: left.filter((x) => x.kind === "big").length },
    });
  }

  /**
   * Create decisions shortly before the playhead reaches them (serialized). At most ONE small
   * decision exists at a time (pending or being written): the next one is written only after it is
   * answered or slides, and small slots the playhead passes meanwhile are dropped, so cards never
   * queue up (owner, Sat Nov 7: a backlog slid in bursts). No small card next to an open fork.
   */
  private ensureDecisions(): void {
    const s = this.s;
    if (!s.profile || s.phase === "ended") return;
    const ph = s.playhead.year;
    let smallBusy =
      s.decisions.some((d) => d.kind === "small" && d.status === "pending") || [...this.making].some((k) => k.startsWith("small-"));
    // The next fork that isn't answered yet (pending, or its slot not written yet).
    const openFork = Math.min(
      ...s.decisions.filter((d) => d.kind === "big" && d.status === "pending").map((d) => d.year),
      ...this.slots.filter((sl) => sl.kind === "big" && sl.year >= ph && !this.materialized(sl)).map((sl) => sl.year),
      Infinity,
    );
    // ...and the fork just answered: its consequence year plays without a small card.
    const lastFork = Math.max(...s.decisions.filter((d) => d.kind === "big" && d.status === "answered").map((d) => d.year), -Infinity);
    const byKindYear = new Map<string, number>();
    for (const sl of this.slots) {
      const k = `${sl.kind}-${sl.year}`;
      const idx = byKindYear.get(k) ?? 0;
      byKindYear.set(k, idx + 1);
      if (sl.year > ph + (sl.kind === "big" ? lookaheadBig(s.speed) : LOOKAHEAD_SMALL)) continue;
      if (sl.year < ph) continue; // passed while we were busy: skip it
      const key = this.slotKey(sl, idx);
      if (this.making.has(key) || this.materialized(sl)) continue;
      if (sl.kind === "small") {
        // 1x (several a year): a card may come the year before a fork (the fork shelves it if
        // it's still open); 2x/4x keep a year between them.
        const gap = s.speed === "1x" ? 0 : 1;
        if (smallBusy || openFork <= sl.year + gap || sl.year <= lastFork) continue;
        if (gap === 0 && openFork === sl.year + 1 && sl.year === ph && Date.now() - this.yearStartedAt > PREFORK_CUTOFF_MS) continue;
        smallBusy = true;
        // D-089: served from the written-ahead queue (instant); a single card only when batches fail.
        if (this.kit && this.batchMisses < 2) {
          this.serveSmall(sl);
          continue;
        }
      }
      this.queueDecision(sl, key);
    }
  }

  // -------------------------------------------------------------------------------------------
  // D-089: small decisions in batches
  //   - one fast call writes the next 3-5 small cards (refillSmalls); they wait in an agent-side
  //     queue and each is served the moment its slot comes (serveSmall), re-checked against the
  //     life as it stands then (kit.bindSmall)
  //   - the queue is dropped only when the context changes (newContext): a fork, a nudge, a speed
  //     change, new documents, or an answer that opens a new thread
  //   - a small answer becomes a quote at once in code; answers fold into the profile every
  //     FOLD_EVERY answers or before the next year call (flushFold), in one call. They never
  //     rewrite the buffered future: they shape the next years written.
  //   - an answer that opens a thread (or begs a question) gets ONE follow-up card, written now
  //     and served next
  // -------------------------------------------------------------------------------------------

  private newContext(): void {
    this.smallCtx++;
    this.spend.smalls.discarded += this.smallQ.length;
    this.smallQ = [];
  }

  private serveSmall(sl: DecisionSlot): void {
    const kit = this.kit!;
    const ph = this.s.playhead.year;
    const visible = sl.year <= ph;
    const n0 = this.smallQ.length;
    this.smallQ = this.smallQ.filter((q) => q.ctx === this.smallCtx && q.at >= ph - STALE_YEARS);
    this.spend.smalls.discarded += n0 - this.smallQ.length;
    if (!this.followUp) {
      while (this.smallQ.length) {
        const q = this.smallQ.shift()!;
        const bound = kit.bindSmall(this.s, q.card, sl);
        if (!bound) {
          this.spend.smalls.discarded++;
          continue;
        }
        let id = bound.id;
        while (this.s.decisions.some((x) => x.id === id)) id = `${bound.id}-${crypto.randomUUID().slice(0, 4)}`;
        const d: Decision = { ...bound, id, kind: "small", year: sl.year, age: sl.age, status: "pending" };
        this.update((st) => ({ decisions: [...st.decisions, d] }));
        this.updateBudgets();
        void this.mirror.decisions([d]);
        const sm = this.spend.smalls;
        sm.served++;
        if (this.waitingSince === null) sm.fromQueue++;
        else {
          const w = Date.now() - this.waitingSince;
          sm.waitMs += w;
          sm.maxWaitMs = Math.max(sm.maxWaitMs, w);
          // Timing trail only (no personal data): why a due card wasn't ready.
          console.log(`[small] waited ${w} ms${q.ctx !== this.smallCtx ? " (stale ctx)" : ""} queue=${this.smallQ.length} batches=${sm.batches} followUps=${sm.followUps}`);
        }
        this.waitingSince = null;
        this.publishSpend();
        this.refillSmalls();
        return;
      }
    }
    // Nothing ready: the wait counts from when the card would be on screen.
    if (visible) this.waitingSince ??= Date.now();
    this.refillSmalls();
  }

  /** One batch call at a time, for the next slots the queue doesn't cover yet. */
  private refillSmalls(): void {
    const kit = this.kit;
    const s = this.s;
    if (!kit || this.batching || !s.profile || s.phase === "ended" || s.phase === "start" || this.forking) return;
    if (this.smallQ.length >= REFILL_AT) return;
    const ph = s.playhead.year;
    // Only the slots before the next fork: the fork changes the context and drops the queue.
    const nextFork = Math.min(
      ...s.decisions.filter((d) => d.kind === "big" && d.status === "pending" && d.year >= ph).map((d) => d.year),
      ...this.slots.filter((sl) => sl.kind === "big" && sl.year >= ph && !this.materialized(sl)).map((sl) => sl.year),
      Infinity,
    );
    const upcoming = this.slots.filter((sl) => sl.kind === "small" && sl.year >= ph && sl.year < nextFork && !this.materialized(sl)).slice(this.smallQ.length);
    if (!upcoming.length) return;
    const want = upcoming.filter((sl) => sl.year <= upcoming[0]!.year + BATCH_YEARS).slice(0, BATCH_MAX);
    // The NOW block reads the years before the first card: after a fork they are being rewritten.
    const lastGen = s.years.at(-1)?.year ?? this.startYear - 1;
    if (lastGen < Math.max(ph, want[0]!.year - 1)) return;
    const ctx = this.smallCtx;
    this.batching = true;
    this.bg("smallBatch", async () => {
      let got = 0;
      try {
        await this.profileReady;
        const cards = await kit.smallBatch(this.s, want);
        got = cards.length;
        if (ctx !== this.smallCtx) {
          this.spend.smalls.discarded += cards.length;
          return;
        }
        const at = this.s.playhead.year;
        this.smallQ.push(...cards.map((card) => ({ card, ctx, at })));
        this.spend.smalls.batches++;
        this.publishSpend();
      } finally {
        this.batching = false;
        // Two empty batches in a row: single cards (queueDecision) for 30 s.
        this.batchMisses = got ? 0 : this.batchMisses + 1;
        if (this.batchMisses >= 2)
          setTimeout(() => {
            this.batchMisses = 0;
            this.ensureDecisions();
          }, 30_000);
      }
      this.ensureDecisions();
    });
  }

  /** A small answer: the quote now (code), safety now, the fold later (batched), the future untouched. */
  private answerSmall(d: Decision, rec: DecisionAnswer, logId: string): void {
    const kit = this.kit!;
    if (!this.s.profile) return;
    const { profile, quote } = kit.quoteAnswer(this.s, d, rec);
    const finalRec: DecisionAnswer = { ...rec, quoteId: quote?.id ?? null };
    this.update((s) => ({
      profile: this.withId(profile),
      answers: s.answers.map((x) => (x.decisionId === d.id && x.answeredAt === rec.answeredAt ? finalRec : x)),
      log: quote ? s.log.map((l) => (l.id === logId ? { ...l, why: { quoteId: quote.id, reason: "In your own words." } } : l)) : s.log,
    }));
    void this.mirror.decisions([d]);
    void this.mirror.answer(finalRec, false);
    void this.mirror.session(this.s);
    // Every free text is screened, per answer (fast; a second look only when flagged).
    const text = finalRec.text;
    if (text)
      this.bg("safety", async () => {
        const safety = await this.screen(await this.eng(), text, `Answering the question "${d.prompt}"`);
        if (safety.flagged) this.update({ safety });
      });
    if (quote) this.pendingFold.push({ decision: d, answer: finalRec });
    // A new thread (a new person, a job quit, a move, love, a baby) changes the context: the
    // queued cards go, the fold runs now, and one follow-up is written for it.
    const thread = kit.newThread(this.s, d, finalRec);
    if (thread) this.newContext();
    if (thread || this.pendingFold.length >= FOLD_EVERY) void this.flushFold();
    if (thread || kit.begsFollowUp(finalRec)) {
      const ph = this.s.playhead.year;
      const next = this.slots.find((sl) => sl.kind === "small" && sl.year >= ph && sl.year <= ph + 2 && !this.materialized(sl));
      if (next) this.writeFollowUp(kit.followUpSlot(next, d, finalRec, thread));
    }
    this.ensureDecisions();
  }

  private writeFollowUp(sl: DecisionSlot): void {
    if (this.followUp) return;
    const ctx = this.smallCtx;
    const p = (async () => {
      const engine = await this.eng();
      const made = await before(engine.makeDecision(this.s, sl), Date.now() + FOLLOWUP_MS).catch(() => null);
      if (made && ctx === this.smallCtx) {
        this.smallQ.unshift({ card: made, ctx, at: this.s.playhead.year });
        this.spend.smalls.followUps++;
      }
    })().finally(() => {
      this.followUp = null;
      this.ensureDecisions();
    });
    this.followUp = p;
    this.ctx.waitUntil(p);
  }

  /** Fold every waiting answer with one call; folds run one after another. */
  private flushFold(): Promise<void> {
    const kit = this.kit;
    if (!kit) return Promise.resolve();
    this.foldChain = this.foldChain
      .then(async () => {
        const items = this.pendingFold.splice(0);
        if (!items.length || !this.s.profile) return;
        const res = await kit.foldAnswers(this.s, items);
        this.spend.smalls.folds++;
        this.spend.smalls.folded += items.length;
        this.update((s) => (s.profile ? { profile: this.withId(res.apply(s.profile)) } : {}));
        void this.mirror.session(this.s);
        // The delta can show a thread the words alone didn't (a new person, job, home or plan).
        if (res.thread && items.every((i) => i.decision.kind === "small")) this.newContext();
      })
      .catch((e: unknown) => console.error("fold failed", e instanceof Error ? e.name : "error"));
    return this.foldChain;
  }


  /** Write one decision (serialized). `using` overrides the state the engine sees (provisional start). */
  private queueDecision(sl: DecisionSlot, key: string, using?: AgentState): void {
    this.making.add(key);
    const epoch = this.epoch;
    this.decisionQueue = this.decisionQueue.then(async () => {
      try {
        const engine = await this.eng();
        const made = await engine.makeDecision(using ?? this.s, sl);
        if (this.s.phase === "start" && !this.s.profile) return; // reset meanwhile
        if (epoch !== this.epoch && this.s.decisions.some((d) => d.kind === sl.kind && d.year === sl.year)) return;
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

  /**
   * Safety screen with a second look. The fast classifier reads an answer like "I'd do it, but
   * only if…" as self-harm when it can't see the question; a flag stands only if it also holds
   * with the context. Real signals flag both ways (and the engine's regex runs on both).
   */
  private async screen(engine: Engine, text: string, context: string): Promise<SafetyResult> {
    const first = await engine.safety(text);
    if (!first.flagged) return first;
    const second = await engine.safety(`${context}, they wrote: "${text}"`);
    return second.flagged ? second : { flagged: false, kind: null };
  }

  /** The engine seeds the world timeline from profile.sessionId: always the real one. */
  private withId(p: Profile): Profile {
    return p.sessionId === this.name ? p : { ...p, sessionId: this.name };
  }

  /** interlude()/ending() write advanced branch years into state.branches in place. Give them a
   * private copy and publish the result as new objects, so the patch diff (by reference) sees it. */
  private branchCopy(): AgentState {
    return { ...this.s, branches: this.s.branches.map((b) => ({ ...b })) };
  }
  private publishBranches(copy: AgentState): void {
    const byId = new Map(copy.branches.map((b) => [b.id, b]));
    this.update((s) => ({
      branches: s.branches.map((b) => {
        const c = byId.get(b.id);
        return c && (c.years !== b.years || c.verdictAtEnd !== b.verdictAtEnd) ? { ...b, years: c.years, verdictAtEnd: c.verdictAtEnd ?? b.verdictAtEnd } : b;
      }),
    }));
  }

  /**
   * Speculative forks: once a big decision exists and the chosen life is written up to its year,
   * write every option's branch, advance the other lives to that year and caption them all, while
   * the user is still on the way to (or reading) the card. At the answer the 3 unchosen branches
   * are kept and the "meanwhile" cuts are ready at once. Cost: one extra coarse branch per fork.
   */
  private prepared = new Map<string, Promise<PreparedFork | null>>();
  private maybePrepare(): void {
    const s = this.s;
    // (The first card is written from a provisional profile; preparing waits for the real one.)
    if (!s.profile || s.phase === "ended") return;
    const lastYear = s.years.at(-1)?.year ?? this.startYear - 1;
    for (const d of s.decisions) {
      if (d.kind !== "big" || d.status !== "pending" || this.prepared.has(d.id)) continue;
      if (d.year > this.startYear && lastYear < d.year - 1) continue;
      const p = (async () => {
        await this.profileReady;
        const engine = await this.eng();
        if (!engine.prepareFork) return null;
        return engine.prepareFork(this.s, d);
      })().catch((e: unknown) => {
        console.error("prepareFork failed", e instanceof Error ? e.name : "error");
        return null;
      });
      this.prepared.set(d.id, p);
      this.ctx.waitUntil(p);
    }
  }

  /** A pending big decision at or before the playhead stops time. */
  private gateCheck(): void {
    this.maybePrepare();
    const s = this.s;
    if (!s.profile || this.forking || this.ending) return;
    if (s.phase !== "playing" && s.phase !== "start") return;
    const big = s.decisions.find((d) => d.kind === "big" && d.status === "pending" && d.year <= s.playhead.year);
    if (big) {
      // A fork preempts an open small card: it is shelved silently (status "slid" with no answer
      // record and no log line, so it never resurfaces and the chat doesn't mention it). The QA
      // run locked up at 2x: the small card held the right pane while the dimmed fork waited.
      const shelved = s.decisions.filter((d) => d.kind === "small" && d.status === "pending");
      this.update((st) => ({
        phase: "deciding",
        playhead: { ...st.playhead, paused: true },
        thinking: false,
        decisions: shelved.length ? st.decisions.map((d) => (d.kind === "small" && d.status === "pending" ? { ...d, status: "slid" as const } : d)) : st.decisions,
      }));
      if (shelved.length) void this.mirror.decisions(this.s.decisions.filter((d) => shelved.some((x) => x.id === d.id)));
      this.persistNow();
      void this.mirror.session(this.s);
    }
  }

  /**
   * Drop the provisional future and regenerate. Default: years > playhead. A fork passes its own
   * year: that year is rewritten too, and its engine log lines are re-logged when it returns.
   */
  private invalidate(fromYear?: number): void {
    this.epoch++;
    const from = Math.min(fromYear ?? this.s.playhead.year + 1, this.s.playhead.year + 1);
    this.update((s) => {
      const years = s.years.filter((y) => y.year < from);
      const log = from <= s.playhead.year ? s.log.filter((l) => l.year < from || AGENT_LOG_KINDS.has(l.kind)) : s.log;
      return { years, log, bufferedTo: years.at(-1)?.year ?? null };
    });
    this.genFailures = 0;
    this.ensureBuffer();
  }

  /** Typed words on a fork: hold generation until the answer is folded (the consequence cites it). */
  private holdGen = false;

  /** Keep BUFFER_AHEAD years generated past the playhead. One run per epoch. */
  private ensureBuffer(): void {
    const s = this.s;
    if (!s.profile || s.phase === "ended" || this.holdGen) return;
    if (this.genRunning === this.epoch) return;
    const lastGen = s.years.at(-1)?.year ?? this.startYear - 1;
    if (lastGen >= this.endYear) return;
    // Never write past a fork that isn't answered yet: everything after it is rewritten at the answer.
    const openFork = Math.min(
      ...s.decisions.filter((d) => d.kind === "big" && d.status === "pending").map((d) => d.year),
      ...this.slots.filter((sl) => sl.kind === "big" && sl.year > s.playhead.year && !this.materialized(sl)).map((sl) => sl.year),
      Infinity,
    );
    if (lastGen >= openFork) return;
    // Fast speeds keep a deeper buffer and write a whole stretch per call (each call boundary costs
    // 2-9 s of prompt + first token; Auto plays a year every 1.5 s): it absorbs a stalled stretch,
    // and the whole life is written a few years before the end so the ending is ready in time.
    const fast = SPEED_CONFIG[s.speed].secondsPerYear <= 2;
    const ahead = fast ? BUFFER_AHEAD + 4 : BUFFER_AHEAD;
    if (lastGen - s.playhead.year >= ahead) return;
    const from = lastGen + 1;
    // A stretch that would leave 1-2 years before the fork (or the end) takes them too: a call
    // for a single year costs as much latency as one for eight.
    const reach = Math.min(this.endYear, openFork) - lastGen;
    const size = fast ? CHUNK_FAST : CHUNK;
    const count = reach <= size + 2 ? reach : size;
    const epoch = this.epoch;
    this.genRunning = epoch;
    this.bg("generate", async () => {
      const { engine, backup } = await this.engInfo();
      // D-089: answers waiting to be folded shape this stretch (never after a fork: it can't wait).
      if (this.kit && this.pendingFold.length && !this.forking) await before(this.flushFold(), Date.now() + FOLD_WAIT_MS);
      let got = 0;
      // A year is accepted once, when it continues the buffer: with the hedge racing, the first
      // version of a year wins (and the per-call mock fallback can't overwrite a real year).
      const accept = (y: SimYear) => {
        if (epoch !== this.epoch) return;
        got++;
        this.update((st) => {
          if (st.years.some((x) => x.year === y.year)) return {};
          const last = st.years.at(-1)?.year ?? this.startYear - 1;
          if (y.year !== last + 1) return {};
          return { years: [...st.years, y], bufferedTo: y.year };
        });
        this.catchUpLog();
        this.maybePrepare();
        this.refillSmalls();
      };
      // Hedge the slow-first-token tail (25-60 s stalls on the heavy model): if nothing has
      // streamed after HEDGE_MS, a fast writer races the same stretch; first version wins.
      const hedge =
        backup &&
        setTimeout(() => {
          if (got || epoch !== this.epoch) return;
          void backup.generateYears(this.s, from, count, accept).catch((e) => console.error("hedge generateYears failed", e instanceof Error ? e.name : "error"));
        }, HEDGE_MS);
      try {
        await engine.generateYears(this.s, from, count, accept);
        this.genFailures = 0;
      } catch (e) {
        this.genFailures++;
        console.error("generateYears failed", e instanceof Error ? e.name : "error");
        this.update({ error: `generateYears: ${errCode(e)}` });
        if (this.genFailures > 3) return;
        await new Promise((r) => setTimeout(r, 1500 * this.genFailures));
      } finally {
        if (hedge) clearTimeout(hedge);
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
    // The chosen life's own years come first: a Worker holds ~6 open connections, and a production
    // run starved 35 s at 37 while branch steps, a decision and settings shared them with the year
    // stream and its hedges. Hidden lives wait until the buffer is healthy again.
    const lastGen = this.s.years.at(-1)?.year ?? ph;
    if (this.genRunning !== null && lastGen - ph < 4) return;
    const due = this.s.branches.filter((b) => b.status === "active" && (b.years.at(-1)?.year ?? b.forkYear) + BRANCH_STEP <= ph);
    if (!due.length) return;
    this.steppingBranches = true;
    this.bg("stepBranches", async () => {
      try {
        const engine = await this.eng();
        const stepped = await Promise.all(due.map((b) => engine.stepBranch(this.s, b, ph, false).catch(() => b)));
        const byId = new Map(stepped.map((b) => [b.id, b]));
        // Keep the CURRENT status: a fork may have retired a life while its step was in flight
        // (a step result used to bring it back: 4 "active" lives at the end of a QA run).
        this.update((s) => ({ branches: s.branches.map((b) => { const n = byId.get(b.id); return n ? { ...n, status: b.status } : b; }) }));
        void this.mirror.branches(this.s.branches.filter((b) => byId.has(b.id)));
      } finally {
        this.steppingBranches = false;
      }
    });
  }

  /** After a big decision: branches → interlude → settings → playing. */
  private async fork(engine: Engine, d: Decision, chosenOptionId: string): Promise<void> {
    const deadline = Date.now() + forkDeadlineMs(this.s.speed);
    const prep = this.prepared.get(d.id) ?? null;
    try {
      const opt = d.options.find((o) => o.id === chosenOptionId);
      this.update((s) => ({ log: [...s.log, this.line(d.year, "fork", `Your life splits here: ${opt?.branchTitle ?? opt?.label ?? "your own way"}`, d.id, d.domains[0] ?? null)] }));
      const apply = (returned: Branch[]) => {
        const ids = new Set(returned.map((b) => b.id));
        this.update((s) => {
          const kept = s.branches.filter((b) => !ids.has(b.id)).map((b) => (b.status === "active" ? { ...b, status: "retired" as const } : b));
          return { branches: [...kept, ...returned] };
        });
        void this.mirror.branches(this.s.branches);
      };
      // The speculative preparation (if any) is awaited, not repeated: it started earlier.
      let prepared: PreparedFork | null = null;
      const spawn = (async () => {
        prepared = prep ? await prep : null;
        return engine.spawnBranches(this.s, d, chosenOptionId, prepared);
      })();
      const returned = await before(spawn, deadline);
      this.prepared.delete(d.id);
      if (!returned) {
        // A stalled model call must not hold the whole life: skip this "meanwhile", keep playing,
        // and let the branches land when they're written.
        console.error("fork: branches late, skipping this interlude");
        void spawn.then(apply).catch(() => {});
      } else {
        apply(returned);
        if (this.s.branches.some((b) => b.status === "active")) {
          this.forking = false;
          await this.runInterlude(deadline, prepared);
          return;
        }
      }
    } catch (e) {
      this.update({ error: `fork: ${errCode(e)}` });
    }
    this.forking = false;
    this.toPlaying();
  }

  private async runInterlude(deadline = Date.now() + forkDeadlineMs(this.s.speed), prepared: PreparedFork | null = null): Promise<void> {
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
      const copy = this.branchCopy();
      const cuts = await before(engine.interlude(copy, prepared), Math.max(deadline, Date.now() + 4000));
      if (!cuts) throw new Error("interlude_late");
      this.publishBranches(copy);
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
    this.yearStartedAt = Date.now();
    this.persistNow();
    void this.mirror.session(this.s);
    this.gateCheck();
    this.ensureBuffer();
    this.ensureDecisions();
  }

  /**
   * The ending (verdicts + five-year answers) is written as soon as the whole life is: once the
   * buffer reaches the end age and no fork is left. Any re-tune (epoch) makes it stale.
   */
  private endingPre: { epoch: number; p: Promise<{ ending: Ending; copy: AgentState }> } | null = null;
  private precomputeEnding(): void {
    const s = this.s;
    if (this.ending || !s.profile || s.phase !== "playing") return;
    // The ending takes 10-15 s on the real engine; start once all but the last 3 years are written
    // (verdicts don't hinge on them) so it's ready when the playhead reaches the end age.
    if ((s.years.at(-1)?.year ?? 0) < this.endYear - 3) return;
    if (this.slots.some((sl) => sl.kind === "big" && sl.year > s.playhead.year) || s.decisions.some((d) => d.kind === "big" && d.status === "pending")) return;
    if (this.endingPre?.epoch === this.epoch) return;
    const epoch = this.epoch;
    const p = this.computeEnding();
    p.catch(() => {});
    this.endingPre = { epoch, p };
  }
  private async computeEnding(): Promise<{ ending: Ending; copy: AgentState }> {
    const { engine, kind } = await this.engInfo();
    if (kind === "mock") {
      // The mock's ending doesn't advance branches; step them to the end first.
      const end = this.endYear;
      const stepped = await Promise.all(
        this.s.branches.map((b) => (b.status === "active" ? engine.stepBranch(this.s, b, end, false).catch(() => b) : Promise.resolve(b))),
      );
      this.update({ branches: stepped });
    }
    // The real engine's ending() advances the branches to the end itself (in place, on a copy).
    const copy = this.branchCopy();
    const ending = await engine.ending(copy);
    return { ending, copy };
  }

  private runEnding(): void {
    if (this.ending) return;
    this.ending = true;
    this.update((s) => ({ thinking: true, playhead: { ...s.playhead, paused: true } }));
    this.bg("ending", async () => {
      const pre = this.endingPre?.epoch === this.epoch ? this.endingPre.p : null;
      const { ending, copy } = await (pre ?? this.computeEnding()).catch(() => this.computeEnding());
      this.publishBranches(copy);
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

function freshSpend() {
  return {
    usd: 0,
    listUsd: 0,
    calls: 0,
    byPurpose: {} as Record<string, number>,
    detail: {} as NonNullable<SessionUsage["detail"]>,
    smalls: { served: 0, fromQueue: 0, waitMs: 0, maxWaitMs: 0, batches: 0, discarded: 0, followUps: 0, folds: 0, folded: 0 },
  };
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
