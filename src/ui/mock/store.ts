/**
 * Local mock of the session agent: implements SessionState transitions and SessionCalls with fake
 * timers and generated content, so the whole UI plays end to end without a backend.
 * The lead swaps this for the real agent client in `src/ui/session.ts` (same shapes).
 */
import { create } from "zustand";
import { currencyForCountry } from "../../../shared/currency";
import { DOMAIN_KEYS, type DomainKey } from "../../../shared/domains";
import { endAgeFor, TWIN_THRESHOLD, type Profile, type Quote } from "../../../shared/schema";
import {
  SPEED_CONFIG,
  type Branch,
  type Decision,
  type DecisionAnswer,
  type LiveSetting,
  type LogLine,
  type SessionState,
  type SimYear,
  type SpeedMode,
  type StartInput,
} from "../../../shared/sim";
import { slidLine } from "../format";
import type { ChatEntry, ClientCalls, ClientState, InterludeCut } from "../types";
import {
  cap,
  firstFork,
  fiveYearFor,
  interludeCaption,
  laterFork,
  nudgeEffect,
  nudgeLine,
  offerPlaceOf,
  replyFrom,
  settingsFor,
  smallDecision,
  verdictFor,
  type Ctx,
  type DecisionDraft,
  type Effect,
} from "./content";
import { initialTraj, placeTraits, shortOf, stepYear, tagQuote, type LifeCtx, type Traj } from "./life";
import { hash, rngFrom } from "./rng";

// ---------------------------------------------------------------------------------------------
// Internal (non-reactive) engine state
// ---------------------------------------------------------------------------------------------
interface Slot {
  year: number;
  kind: "small" | "big";
  domain?: DomainKey;
}
interface Internal {
  seed: number;
  input: StartInput | null;
  ctx: LifeCtx | null;
  /** Chosen life: trajectory after each generated year (key = year), plus the base before the first year. */
  trajAt: Map<number, Traj>;
  baseTraj: Traj | null;
  /** Effects decided at the start of a year that must be applied before generating it. */
  pendingEffects: Map<number, Effect[]>;
  branchTraj: Map<string, { traj: Traj; full: SimYear[]; atFive?: Traj }>;
  drafts: Map<string, DecisionDraft>;
  slots: Slot[];
  usedStages: Set<string>;
  extraPlaces: string[];
  qn: number;
  dn: number;
  ln: number;
  cn: number;
  timers: number[];
  /** Year the last interlude was triggered (to avoid repeats). */
  lastInterludeYear: number;
}

const fresh = (): Internal => ({
  seed: 1,
  input: null,
  ctx: null,
  trajAt: new Map(),
  baseTraj: null,
  pendingEffects: new Map(),
  branchTraj: new Map(),
  drafts: new Map(),
  slots: [],
  usedStages: new Set(),
  extraPlaces: [],
  qn: 0,
  dn: 0,
  ln: 0,
  cn: 0,
  timers: [],
  lastInterludeYear: -1,
});
let I = fresh();

const NOW_YEAR = 2026;
const BUFFER = 3;
const SAFETY_RE = /\b(kill myself|end my life|suicid|self[- ]harm|hurt myself|want to die|don'?t want to (live|be here)|cutting myself)\b/i;
const ABUSE_RE = /\b(he hits me|she hits me|abus(e|ed|ive)|beats me|afraid of my (partner|husband|wife|boyfriend|girlfriend))\b/i;

const emptyState = (): ClientState => ({
  sessionId: `mock-${Math.random().toString(36).slice(2, 8)}`,
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
  playhead: { year: NOW_YEAR, age: 25, paused: false },
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
  connection: "open",
  backend: "mock",
});

type Store = ClientState & ClientCalls;

export const useMockSim = create<Store>()((set, get) => {
  // -------------------------------------------------------------------------------------------
  // helpers bound to the store
  // -------------------------------------------------------------------------------------------
  const patch = (p: Partial<ClientState>) => set({ ...p, updatedAt: new Date().toISOString() } as Partial<Store>);
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(fn, ms);
    I.timers.push(id);
  };
  const ageAt = (year: number) => (I.input ? I.input.age + (year - I.ctx!.startYear) : 0);
  const endYear = () => I.ctx!.startYear + (get().endAge - I.ctx!.startAge);

  const chat = (e: Partial<ChatEntry> & Pick<ChatEntry, "role" | "text">): ChatEntry => {
    const s = get();
    const entry: ChatEntry = {
      id: `c${++I.cn}`,
      channel: "main",
      year: s.playhead.year,
      age: s.playhead.age,
      decisionId: null,
      quoteId: null,
      streaming: false,
      form: "message",
      at: Date.now(),
      ...e,
    };
    set({ dialogue: [...get().dialogue, entry] } as Partial<Store>);
    return entry;
  };

  const log = (lines: Omit<LogLine, "id">[]) => {
    if (!lines.length) return;
    set({ log: [...get().log, ...lines.map((l) => ({ ...l, id: `l${++I.ln}` }))] } as Partial<Store>);
  };

  const addQuote = (text: string, source: Quote["source"], questionId: string | null): Quote => {
    const p = get().profile!;
    const quote: Quote = { id: `q${++I.qn}`, text: text.trim(), questionId, source, shortForm: shortOf(text.trim(), 12) };
    const profile: Profile = { ...p, quotes: [...p.quotes, quote], profileVersion: p.profileVersion + 1, updatedAt: new Date().toISOString() };
    I.ctx!.quotes = profile.quotes;
    patch({ profile });
    return quote;
  };

  const bumpKnowMe = (n: number) => {
    const p = get().profile;
    if (!p) return;
    patch({ profile: { ...p, knowMeScore: Math.min(100, p.knowMeScore + n) } });
  };

  const screen = (text: string | null) => {
    if (!text) return;
    if (SAFETY_RE.test(text)) patch({ safety: { flagged: true, kind: "self_harm" } });
    else if (ABUSE_RE.test(text)) patch({ safety: { flagged: true, kind: "abuse" } });
  };

  const applyEffect = (t: Traj, e: Effect) => {
    const nudge = (k: "drive" | "caution" | "family" | "craft" | "balance") => {
      if (e[k] !== undefined) t[k] = Math.max(0, Math.min(1, t[k] + e[k]!));
    };
    (["drive", "caution", "family", "craft", "balance"] as const).forEach(nudge);
    if (e.move !== undefined) {
      if (e.move === null) {
        // "Move back" / "go home": back to where the life started.
        const s = I.input!;
        Object.assign(t, placeTraits(s.city, s.region, s.country), { city: s.city, farFromHome: false });
      } else {
        Object.assign(t, placeTraits(e.move.city, e.move.region, e.move.country), { city: e.move.city, farFromHome: e.move.far });
        if (!I.extraPlaces.includes(t.place)) I.extraPlaces.push(t.place);
      }
    }
    if (e.work) t.work = e.work;
    if (e.workKind) t.workKind = e.workKind;
    if (e.kidsPlan) t.kidsPlan = e.kidsPlan;
    if (e.seekPartner && t.partner === "none") t.balance = Math.min(1, t.balance + 0.1);
    if (e.incomeMul) t.income = Math.round(t.income * e.incomeMul);
    if (e.netWorthAdd) t.netWorth += e.netWorthAdd;
    if (e.risk) t.risk = Math.min(95, t.risk + e.risk);
    if (e.retireAge) t.retireAge = e.retireAge;
    if (e.caring !== undefined) t.caring = e.caring;
    if (e.home) t.home = e.home;
    if (e.invest) t.invest = e.invest;
    if (e.leap) t.flags.leap = 1;
  };

  const queueFrom = (t: Traj, e: Effect, year: number) => {
    for (const q of e.queue ?? []) t.queued.push({ ...q, year: year + q.inYears, moment: q.moment ?? null });
  };

  /** Regenerate the chosen life from `fromYear` (inclusive) to keep a buffer ahead of the playhead. */
  const regenerate = (fromYear: number) => {
    const s = get();
    const kept = s.years.filter((y) => y.year < fromYear);
    for (const k of [...I.trajAt.keys()]) if (k >= fromYear) I.trajAt.delete(k);
    const out = [...kept];
    let prev = I.trajAt.get(fromYear - 1) ?? structuredClone(I.baseTraj!);
    const target = Math.min(endYear(), Math.max(s.playhead.year, fromYear) + BUFFER);
    for (let y = fromYear; y <= target; y++) {
      prev = structuredClone(prev);
      for (const e of I.pendingEffects.get(y) ?? []) {
        applyEffect(prev, e);
        queueFrom(prev, e, y);
      }
      const { traj, year } = stepYear(prev, y, ageAt(y), I.ctx!);
      year.decisionIds = s.decisions.filter((d) => d.year === y).map((d) => d.id);
      I.trajAt.set(y, traj);
      out.push(year);
      prev = traj;
    }
    patch({ years: out, bufferedTo: out[out.length - 1]?.year ?? null });
  };

  const extend = () => {
    const s = get();
    const last = s.years[s.years.length - 1];
    if (!last || last.year >= Math.min(endYear(), s.playhead.year + BUFFER)) return;
    regenerate(last.year + 1);
  };

  const yearOf = (y: number) => get().years.find((x) => x.year === y) ?? null;

  const logYear = (y: number) => {
    const yr = yearOf(y);
    if (!yr) return;
    const prev = yearOf(y - 1);
    let top: DomainKey | null = null;
    if (prev) {
      let best = 0;
      for (const k of DOMAIN_KEYS) {
        const d = Math.abs(yr.states[k] - prev.states[k]);
        if (k !== "risk" && d > best) (best = d), (top = k);
      }
    }
    const lines: Omit<LogLine, "id">[] = [];
    if (!yr.events.length) lines.push({ year: y, age: yr.age, kind: "year", text: yr.summary, domain: top, tone: null, why: null, baseRate: null, refId: null });
    for (const e of yr.events) {
      lines.push({ year: y, age: yr.age, kind: "event", text: `${e.title}. ${e.narrative}`, domain: e.domain, tone: e.tone, why: e.cause, baseRate: e.baseRate, refId: e.id });
    }
    log(lines);
    patch({ status: yr.states });
    syncProfile(y);
  };

  /** Keep profile facts/people in step with the chosen life (work, partner, kids), as the engine would. */
  const syncProfile = (y: number) => {
    const p = get().profile;
    const t = I.trajAt.get(y);
    if (!p || !t) return;
    const facts = p.facts.map((f) => (f.key === "occupation" ? { ...f, value: t.work } : f.key === "location" ? { ...f, value: t.place } : f));
    const base = p.people.filter((x) => !x.id.startsWith("p-life-"));
    const extra: Profile["people"] = [];
    if (t.partner !== "none" && t.partnerName) extra.push({ id: "p-life-partner", label: t.partnerName, relation: t.partner === "married" ? "spouse" : "partner", closeness: 0.95, influence: 0.8, expectation: null, quoteIds: [] });
    t.kids.forEach((b, i) => {
      if (y >= b) extra.push({ id: `p-life-kid-${i}`, label: y - b === 0 ? "Baby" : `Kid, ${y - b}`, relation: "child", closeness: 0.9 - i * 0.01, influence: 0.6, expectation: null, quoteIds: [] });
    });
    const people = [...extra, ...base.map((x) => (t.caring && x.relation.match(/mother|father|grand/) ? { ...x, closeness: 0.97 } : x))];
    patch({ profile: { ...p, facts, people } });
  };

  // -------------------------------------------------------------------------------------------
  // Decisions
  // -------------------------------------------------------------------------------------------
  const planSlots = (fromYear: number, speed: SpeedMode) => {
    const cfg = SPEED_CONFIG[speed];
    const start = I.ctx!.startYear;
    const end = endYear();
    const span = end - start;
    const kept = I.slots.filter((s) => s.year < fromYear || (s.year === fromYear && s.kind === "big" && fromYear === start));
    const left = end - fromYear;
    const bigTotal = Math.max(2, Math.round((cfg.bigBudget * span) / 45));
    const fractions = speed === "auto" ? [0, 0.11, 0.27, 0.5, 0.78] : Array.from({ length: bigTotal }, (_, i) => (i / bigTotal) * 0.92);
    const bigYears = fractions.map((f) => start + Math.round(f * span)).filter((y) => y >= fromYear && y < end);
    const out: Slot[] = [...kept];
    for (const y of bigYears) if (!out.some((s) => s.year === y && s.kind === "big")) out.push({ year: y, kind: "big" });
    const smallTotal = Math.round((cfg.smallBudget * left) / 45);
    if (smallTotal > 0) {
      const perYear = Math.min(1, smallTotal / Math.max(1, left));
      const worries = get().profile?.worries;
      const weighted = DOMAIN_KEYS.flatMap((k) => Array(1 + Math.round((worries?.[k] ?? 0.1) * 6)).fill(k) as DomainKey[]);
      const r = rngFrom(hash(I.seed, "small", fromYear, speed));
      for (let y = fromYear + 1; y < end; y++) {
        if (out.some((s) => s.year === y)) continue;
        if (r() < perYear) out.push({ year: y, kind: "small", domain: weighted[Math.floor(r() * weighted.length)] });
      }
    }
    I.slots = out.sort((a, b) => a.year - b.year);
    patch({
      budgets: {
        bigLeft: I.slots.filter((s) => s.kind === "big" && s.year >= fromYear).length,
        smallLeft: I.slots.filter((s) => s.kind === "small" && s.year >= fromYear).length,
      },
    });
  };

  const makeDecision = (year: number, kind: "small" | "big", domain?: DomainKey) => {
    const s = get();
    const age = ageAt(year);
    const t = structuredClone(I.trajAt.get(year - 1) ?? I.baseTraj!);
    const r = rngFrom(hash(I.seed, "decision", year, kind));
    const c: Ctx = { year, age, name: I.input!.firstName, t, quotes: s.profile!.quotes, line: I.input!.line, r };
    let draft: DecisionDraft;
    if (kind === "big") {
      if (year === I.ctx!.startYear && !s.decisions.length) draft = firstFork(c);
      else {
        const { key, draft: d } = laterFork(c, I.usedStages);
        I.usedStages.add(key);
        draft = d;
      }
    } else draft = smallDecision(c, domain ?? "happiness");
    const id = `d-${age}-${++I.dn}`;
    I.drafts.set(id, draft);
    const d: Decision = {
      id,
      kind,
      year,
      age,
      domains: draft.domains.slice(0, 3),
      prompt: draft.prompt,
      whyAsking: draft.whyAsking,
      whyQuoteId: draft.whyQuoteId,
      options: draft.options.map((o, i) => ({ id: "abcd"[i]!, label: o.label, hint: o.hint, branchTitle: o.branchTitle })),
      placeholder: draft.placeholder,
      status: "pending",
    };
    patch({ decisions: [...s.decisions, d] });
    chat({ role: "guide", text: d.prompt, decisionId: id, year, age });
    if (kind === "big") patch({ phase: "deciding" });
  };

  const bestOptionFor = (d: Decision, text: string): string => {
    const words = new Set(text.toLowerCase().match(/[a-z']{3,}/g) ?? []);
    let best = d.options[0]!.id;
    let score = -1;
    for (const o of d.options) {
      const w = `${o.label} ${o.branchTitle ?? ""} ${o.hint ?? ""}`.toLowerCase().match(/[a-z']{3,}/g) ?? [];
      const sc = w.filter((x) => words.has(x)).length;
      if (sc > score) (score = sc), (best = o.id);
    }
    return best;
  };

  // -------------------------------------------------------------------------------------------
  // Branches
  // -------------------------------------------------------------------------------------------
  const branchCtx = (id: string): LifeCtx => ({ ...I.ctx!, lifeId: id });

  const stepBranches = (untilYear: number) => {
    const s = get();
    const branches = s.branches.map((b) => {
      if (b.status !== "active") return b;
      const bt = I.branchTraj.get(b.id);
      if (!bt) return b;
      let last = bt.full[bt.full.length - 1]?.year ?? b.forkYear - 1;
      while (last < Math.min(untilYear, endYear())) {
        last += 1;
        const { traj, year } = stepYear(bt.traj, last, ageAt(last), branchCtx(b.id));
        bt.traj = traj;
        bt.full.push(year);
        if (last === I.ctx!.startYear + 5) bt.atFive = structuredClone(traj);
      }
      return { ...b, years: coarse(bt.full, b.forkYear), divergence: divergenceOf(bt.traj, bt.full[bt.full.length - 1]) };
    });
    patch({ branches });
  };

  const coarse = (full: SimYear[], forkYear: number) =>
    full.filter((y, i) => (y.year - forkYear) % 5 === 0 || i === full.length - 1);

  const divergenceOf = (t: Traj, y: SimYear | undefined): number => {
    const me = I.trajAt.get(get().playhead.year) ?? I.baseTraj!;
    const my = yearOf(get().playhead.year);
    let d = 0;
    if (y && my) for (const k of DOMAIN_KEYS) d += Math.abs(y.states[k] - my.states[k]);
    d = d / (DOMAIN_KEYS.length * 100);
    if (t.place !== me.place) d += 0.25;
    if (t.workKind !== me.workKind) d += 0.2;
    if (t.kids.length !== me.kids.length) d += 0.1;
    return Math.min(1, d);
  };

  const spawnBranches = (d: Decision, chosen: string, baseTraj: Traj) => {
    const draft = I.drafts.get(d.id)!;
    const born: Branch[] = [];
    draft.options.forEach((o, i) => {
      const oid = "abcd"[i]!;
      if (oid === chosen) return;
      const id = `b-${d.id}-${oid}`;
      const t = structuredClone(baseTraj);
      applyEffect(t, o.effect);
      queueFrom(t, o.effect, d.year);
      I.branchTraj.set(id, { traj: t, full: [] });
      born.push({ id, forkDecisionId: d.id, optionId: oid, title: o.branchTitle ?? o.label, forkYear: d.year, forkAge: d.age, status: "active", years: [], verdictAtEnd: null, divergence: 0.5 });
    });
    patch({ branches: [...get().branches, ...born] });
    stepBranches(d.year);
    // Keep the three most different lives running (state distance AND variety of path): always the
    // most divergent of this fork's newcomers, then the most divergent others, penalising a fork that
    // already has a life kept. Retire the rest quietly.
    const active = get().branches.filter((b) => b.status === "active");
    const newcomers = active.filter((b) => b.forkDecisionId === d.id).sort((a, b) => b.divergence - a.divergence);
    const keep = new Set<string>(newcomers.slice(0, 1).map((b) => b.id));
    const perFork = new Map<string, number>();
    if (keep.size) perFork.set(d.id, 1);
    while (keep.size < 3) {
      let best: Branch | null = null;
      let score = -Infinity;
      for (const b of active) {
        if (keep.has(b.id)) continue;
        const sc = b.divergence - 0.22 * (perFork.get(b.forkDecisionId) ?? 0);
        if (sc > score) (score = sc), (best = b);
      }
      if (!best) break;
      keep.add(best.id);
      perFork.set(best.forkDecisionId, (perFork.get(best.forkDecisionId) ?? 0) + 1);
    }
    patch({ branches: get().branches.map((b) => (b.status === "active" && !keep.has(b.id) ? { ...b, status: "retired" as const } : b)) });
  };

  const startInterlude = (forkYear: number) => {
    const s = get();
    const active = s.branches.filter((b) => b.status === "active");
    if (!active.length) {
      patch({ phase: "playing" });
      return;
    }
    I.lastInterludeYear = forkYear;
    const cuts: InterludeCut[] = active.map((b) => {
      const full = I.branchTraj.get(b.id)!.full;
      const y = full[full.length - 1]!;
      // The caption tells the most telling thing that happened in that life lately, not just this year.
      const recent = [...full].reverse().find((x) => x.year > y.year - 6 && x.events.some((e) => e.category !== "texture"));
      const ev = recent?.events.find((e) => e.category !== "texture");
      const line = ev ? (recent!.year === y.year ? ev.title : `${ev.title}, at ${recent!.age}`) : y.summary;
      return { branchId: b.id, title: b.title, age: y.age, scene: y.scene, caption: interludeCaption(b.title, line, y.age) };
    });
    patch({ phase: "interlude", interlude: cuts });
    log([{ year: s.playhead.year, age: s.playhead.age, kind: "interlude", text: "Meanwhile, in your other lives…", domain: null, tone: null, why: null, baseRate: null, refId: null }]);
  };

  // -------------------------------------------------------------------------------------------
  // Ending
  // -------------------------------------------------------------------------------------------
  const finish = () => {
    const s = get();
    stepBranches(endYear());
    const r = rngFrom(hash(I.seed, "ending"));
    const myT = I.trajAt.get(endYear()) ?? I.baseTraj!;
    const used = new Set<string>();
    const verdict = verdictFor(myT, r, used);
    const branchVerdicts: Record<string, string> = {};
    const fiveYear: Record<string, string> = {};
    const quotes = s.profile!.quotes;
    fiveYear.chosen = fiveYearFor(I.input!.firstName, I.ctx!.startYear, s.years, I.trajAt.get(I.ctx!.startYear + 5) ?? myT, quotes);
    const branches = get().branches.map((b) => {
      if (b.status !== "active") return b;
      const bt = I.branchTraj.get(b.id)!;
      const v = verdictFor(bt.traj, rngFrom(hash(I.seed, b.id)), used);
      branchVerdicts[b.id] = v;
      const before = s.years.filter((y) => y.year < b.forkYear);
      const atFive = bt.full.find((y) => y.year === I.ctx!.startYear + 5);
      const fiveT = bt.atFive ?? (b.forkYear > I.ctx!.startYear + 5 ? I.trajAt.get(I.ctx!.startYear + 5) : undefined) ?? bt.traj;
      fiveYear[b.id] = fiveYearFor(I.input!.firstName, I.ctx!.startYear, [...before, ...bt.full], atFive ? { ...fiveT, place: atFive.place } : fiveT, quotes);
      return { ...b, verdictAtEnd: v, years: bt.full };
    });
    patch({ branches, verdictAtEnd: verdict, ending: { verdict, branchVerdicts, fiveYear }, phase: "ended" });
    chat({ role: "guide", text: `That's seventy. Four lives, all of them yours. Talk to any version of you, at any age.` });
  };

  // -------------------------------------------------------------------------------------------
  // SessionCalls
  // -------------------------------------------------------------------------------------------
  return {
    ...emptyState(),

    async start(input) {
      I.timers.forEach(clearTimeout);
      I = fresh();
      I.seed = hash(input.firstName, input.age, input.city, input.line);
      I.input = input;
      const endAge = endAgeFor(input.age);
      const startYear = NOW_YEAR;
      // Each sentence of the start line becomes its own quote, so a turning point can cite the exact one.
      const sentences = (input.line.trim() || "I'm not sure yet.").split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter((x) => x.length > 2);
      const startQuotes: Quote[] = sentences.map((text) => ({ id: `q${++I.qn}`, text, questionId: "start.line", source: "answer", shortForm: shortOf(text, 12) }));
      const q1 = startQuotes[0]!;
      const traj = initialTraj({ firstName: input.firstName, age: input.age, city: input.city, region: input.region, country: input.country, line: input.line });
      const offer = offerPlaceOf(input.line, input.city);
      if (offer) I.extraPlaces.push(placeTraits(offer, null, "").place.replace(/, $/, ""));
      const worries = Object.fromEntries(DOMAIN_KEYS.map((k) => [k, 0.1])) as Profile["worries"];
      for (const d of tagQuote(input.line)) worries[d] = 0.7;
      const profile: Profile = {
        sessionId: get().sessionId,
        profileVersion: 1,
        firstName: input.firstName,
        gender: input.appearance?.gender ?? null,
        currency: input.currency ?? currencyForCountry(input.country),
        age: input.age,
        birthYear: startYear - input.age,
        country: input.country,
        region: input.region,
        city: input.city,
        startYear,
        endAge,
        facts: [
          { id: "f1", key: "location", label: "Home", value: traj.place, source: "answer", quoteIds: [], confidence: 1 },
          { id: "f2", key: "occupation", label: "Work", value: traj.work, source: "inferred", quoteIds: [q1.id], confidence: 0.4 },
        ],
        values: [],
        fears: [],
        people: traj.parent !== "your parents" ? [{ id: "p1", label: traj.parent, relation: traj.parent === "Mom" ? "mother" : traj.parent === "Dad" ? "father" : "grandmother", closeness: 0.8, influence: 0.7, expectation: null, quoteIds: [q1.id] }] : [],
        constraints: [],
        money: { feel: traj.netWorth < 0 ? "tight" : "okay", incomeUsd: traj.income, debtUsd: traj.netWorth < 0 ? -traj.netWorth : null, debtKind: traj.netWorth < 0 ? "student_loans" : null, savingsUsd: null, supportsFamily: false, assumed: true },
        worries,
        seeds: { path: { text: q1.text, quoteIds: [q1.id] }, leap: { text: q1.text, quoteIds: [q1.id] }, careful: { text: q1.text, quoteIds: [q1.id] }, unjudged: { text: q1.text, quoteIds: [q1.id] } },
        quotes: startQuotes,
        assumptions: [{ field: "money.incomeUsd", value: String(traj.income), reason: "Typical for your age; tell me more to fix it." }],
        knowMeScore: Math.min(60, 16 + Math.round(input.line.length / 12) + (input.hasSelfie ? 3 : 0)),
        updatedAt: new Date().toISOString(),
      };
      I.ctx = { seed: I.seed, lifeId: "chosen", startYear, startAge: input.age, endAge, firstName: input.firstName, quotes: profile.quotes, world: {} };
      const span = endAge - input.age;
      if (span > 8) I.ctx.world[startYear + Math.min(7, span - 2)] = "A two-year downturn";
      if (span > 26) I.ctx.world[startYear + 24] = "Another slow, tight year for everyone";
      I.baseTraj = traj;
      set({
        ...emptyState(),
        sessionId: get().sessionId,
        speed: input.speed,
        appearance: input.appearance,
        profile,
        endAge,
        playhead: { year: startYear, age: input.age, paused: false },
        phase: "start",
      } as Partial<Store>);
      screen(input.line);
      // Pretend to think: the profile is "built" by a model.
      await new Promise<void>((res) => later(900, res));
      planSlots(startYear, input.speed);
      regenerate(startYear);
      patch({ status: traj.states, settings: settingsFor(traj, profile.quotes, [], I.extraPlaces), phase: "playing" });
      if (input.line.trim()) for (const q of startQuotes) chat({ role: "you", text: q.text, quoteId: q.id });
      chat({ role: "guide", text: `Hi ${input.firstName}. I'm going to play your life forward from ${input.age} to ${endAge}, one year at a time. Your answers steer it.` });
      chat({ role: "guide", text: "Every big choice splits it. The lives you don't pick keep running in the background. The first fork is today." });
      makeDecision(startYear, "big");
    },

    async answer(a) {
      const s = get();
      const d = s.decisions.find((x) => x.id === a.decisionId);
      if (!d || d.status !== "pending") return;
      screen(a.text);
      const slid = !!a.slid || (!a.optionId && !a.text?.trim());
      let quoteId: string | null = null;
      if (a.text?.trim()) {
        quoteId = addQuote(a.text, "answer", d.id).id;
        bumpKnowMe(7);
      } else if (!slid) bumpKnowMe(2);
      const optionId = slid ? null : (a.optionId ?? bestOptionFor(d, a.text ?? ""));
      const answer: DecisionAnswer = { decisionId: a.decisionId, optionId: a.optionId, text: a.text, via: a.via, quoteId, answeredAt: new Date().toISOString() };
      patch({
        answers: [...get().answers, answer],
        decisions: get().decisions.map((x) => (x.id === d.id ? { ...x, status: slid ? "slid" : "answered" } : x)),
      });
      const opt = d.options.find((o) => o.id === optionId) ?? null;
      const draft = I.drafts.get(d.id)!;
      const effect = optionId ? draft.options["abcd".indexOf(optionId)]!.effect : null;

      if (slid) {
        // No prompt and no line per slide in the chat: one quiet line per run (the log keeps each).
        const dl = get().dialogue.filter((e) => !(e.decisionId === d.id && e.role === "guide"));
        const last = dl.at(-1);
        const run = last?.id.startsWith("slid-") ? Number(last.id.split("-")[1]) || 1 : 0;
        if (run) set({ dialogue: [...dl.slice(0, -1), { ...last!, id: `slid-${run + 1}-${d.id}`, text: slidLine(run + 1) }] } as Partial<Store>);
        else {
          set({ dialogue: dl } as Partial<Store>);
          chat({ id: `slid-1-${d.id}`, role: "system", text: slidLine(1) });
        }
        log([{ year: d.year, age: d.age, kind: "slid", text: `You let it slide: ${shortOf(d.prompt.replace(/^It's \d{4}\.\s*/, ""), 12)}`, domain: d.domains[0] ?? null, tone: null, why: null, baseRate: null, refId: d.id }]);
        return;
      }

      chat({ role: "you", text: a.text?.trim() ? a.text.trim() : opt!.label, decisionId: d.id, quoteId, year: d.year, age: d.age });

      if (d.kind === "small") {
        const from = d.year + 1;
        if (effect) I.pendingEffects.set(from, [...(I.pendingEffects.get(from) ?? []), effect]);
        if (quoteId) {
          // Your own words outweigh a tap: they nudge harder.
          I.pendingEffects.set(from, [...(I.pendingEffects.get(from) ?? []), { balance: /rest|sleep|family|friend/i.test(a.text!) ? 0.05 : 0, drive: /work|career|push/i.test(a.text!) ? 0.05 : 0 }]);
        }
        log([{ year: d.year, age: d.age, kind: "decision", text: a.text?.trim() ? `You decide, in your words: “${shortOf(a.text, 14)}”` : `You choose: ${opt!.label.toLowerCase()}.`, domain: d.domains[0] ?? null, tone: null, why: quoteId ? { quoteId, reason: "Your own words, kept as a quote." } : null, baseRate: null, refId: d.id }]);
        regenerate(from);
        return;
      }

      // Big: a fork. The chosen option continues as your life; the other three branch.
      const base = structuredClone(I.trajAt.get(d.year - 1) ?? I.baseTraj!);
      I.pendingEffects.set(d.year, [...(I.pendingEffects.get(d.year) ?? []), effect!]);
      spawnBranches(d, optionId!, base);
      regenerate(d.year);
      const others = get().branches.filter((b) => b.forkDecisionId === d.id).map((b) => b.title);
      log([
        { year: d.year, age: d.age, kind: "fork", text: `Your life splits. You choose “${opt!.branchTitle ?? opt!.label}”. ${others.length} other lives keep running.`, domain: d.domains[0] ?? null, tone: "mixed", why: quoteId ? { quoteId, reason: "You said it in your own words." } : d.whyQuoteId ? { quoteId: d.whyQuoteId, reason: d.whyAsking } : null, baseRate: null, refId: d.id },
      ]);
      logYear(d.year);
      const t = I.trajAt.get(d.year) ?? I.baseTraj!;
      patch({ settings: settingsFor(t, get().profile!.quotes, get().settings, I.extraPlaces) });
      chat({ role: "guide", text: `“${opt!.branchTitle ?? opt!.label}” it is. The other ${others.length === 1 ? "life keeps" : `${others.length === 3 ? "three" : others.length} lives keep`} running without you. You'll see them now and then.`, decisionId: null });
      startInterlude(d.year);
    },

    async nudge(settingId, to) {
      const s = get();
      const setting = s.settings.find((x) => x.id === settingId);
      if (!setting || setting.value === to) return;
      const from = setting.value;
      const year = s.playhead.year;
      const t = I.trajAt.get(year) ?? I.baseTraj!;
      const eff = nudgeEffect(settingId, to, t);
      I.pendingEffects.set(year + 1, [...(I.pendingEffects.get(year + 1) ?? []), eff]);
      const toLabel = setting.type === "slider" ? (Number(to) < 35 ? "more work" : Number(to) > 65 ? "more life" : "somewhere in the middle") : setting.type === "toggle" ? (to === "true" ? "On" : "Off") : (setting.options.find((o) => o.value === to)?.label ?? to);
      patch({
        settings: s.settings.map((x) => (x.id === settingId ? { ...x, value: to } : x)),
        nudges: [...s.nudges, { settingId, from, to, year, age: s.playhead.age }],
      });
      log([{ year, age: s.playhead.age, kind: "nudge", text: nudgeLine(settingId, setting.label, toLabel, s.playhead.age), domain: settingId === "invest" ? "wealth" : settingId === "family" ? "family" : settingId === "balance" ? "mentalHealth" : settingId === "place" ? "risk" : "lifeGoals", tone: null, why: null, baseRate: null, refId: settingId }]);
      regenerate(year + 1);
    },

    async setSpeed(speed) {
      patch({ speed });
      if (I.ctx) planSlots(get().playhead.year + 1, speed);
    },

    async tick(year) {
      const s = get();
      if (!I.ctx || s.phase === "ended" || s.phase === "start") return;
      if (year <= s.playhead.year) return;
      if (year > endYear()) {
        finish();
        return;
      }
      patch({ playhead: { ...s.playhead, year, age: ageAt(year) } });
      extend();
      stepBranches(year);
      const slot = I.slots.find((x) => x.year === year);
      if (slot?.kind === "big" && !get().decisions.some((d) => d.year === year && d.kind === "big")) {
        // A fork preempts an open small card: shelve it silently (no chat line, never asked again).
        const open = get().decisions.filter((d) => d.kind === "small" && d.status === "pending");
        if (open.length)
          set({
            decisions: get().decisions.map((d) => (open.includes(d) ? { ...d, status: "slid" as const } : d)),
            dialogue: get().dialogue.filter((e) => !open.some((d) => d.id === e.decisionId && e.role === "guide")),
          } as Partial<Store>);
        makeDecision(year, "big");
        return; // the year is logged once the fork is answered
      }
      logYear(year);
      if (slot?.kind === "small" && !get().decisions.some((d) => d.status === "pending")) makeDecision(year, "small", slot.domain);
      const every = SPEED_CONFIG[get().speed].interludeEveryYears;
      if (every && (year - I.ctx.startYear) % every === 0 && year !== I.lastInterludeYear && get().branches.some((b) => b.status === "active")) startInterlude(year);
      patch({ budgets: { bigLeft: I.slots.filter((x) => x.kind === "big" && x.year > year).length, smallLeft: I.slots.filter((x) => x.kind === "small" && x.year > year).length } });
    },

    async pause(paused) {
      const s = get();
      if (s.phase === "interlude" && !paused) {
        patch({ phase: "playing", interlude: null, playhead: { ...s.playhead, paused: false } });
        return;
      }
      patch({ playhead: { ...s.playhead, paused } });
    },

    async peekBranch(branchId) {
      const b = get().branches.find((x) => x.id === branchId);
      if (!b) throw new Error("no branch");
      const bt = I.branchTraj.get(branchId);
      return { ...b, years: bt ? [...bt.full] : b.years };
    },

    async addDocument(kind, text) {
      screen(text);
      const sentence = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).find((x) => x.length > 30 && x.length < 220) ?? text.slice(0, 160);
      addQuote(sentence, kind, null);
      bumpKnowMe(kind === "ai_export" ? 22 : 15);
      const name = { cv: "your CV", linkedin: "your LinkedIn PDF", ai_export: "your AI export" }[kind];
      chat({ role: "system", text: `Added ${name}. I know you a little better; the years ahead will use it.` });
      regenerate(get().playhead.year + 1);
    },

    async sayTo(life, age, text) {
      const s = get();
      screen(text);
      if (life === "interviewer") {
        const q = addQuote(text, "answer", "free");
        chat({ role: "you", text, quoteId: q.id });
        bumpKnowMe(6);
        const from = s.playhead.year + 1;
        const l = text.toLowerCase();
        const eff: Effect = {
          drive: /career|promot|ambiti|work harder|money/.test(l) ? 0.08 : 0,
          family: /mom|dad|family|kids|parent/.test(l) ? 0.08 : 0,
          craft: /paint|art|music|write|make/.test(l) ? 0.1 : 0,
          balance: /tired|rest|burn|sleep|slow/.test(l) ? 0.1 : 0,
        };
        I.pendingEffects.set(from, [...(I.pendingEffects.get(from) ?? []), eff]);
        regenerate(from);
        await new Promise<void>((res) => later(650, res));
        chat({ role: "guide", text: `Kept, in your words. I'll carry it into the years from ${s.playhead.age + 1}.` });
        return;
      }
      const channel = `talk:${life}:${age}`;
      chat({ role: "you", text, channel });
      addQuote(text, "answer", channel);
      const letter = (s.profile?.knowMeScore ?? 0) < TWIN_THRESHOLD;
      const isBranch = life !== "chosen";
      const bt = isBranch ? I.branchTraj.get(life) : null;
      const yr = isBranch ? (bt?.full.find((y) => y.age === age) ?? bt?.full[bt.full.length - 1] ?? null) : (s.years.find((y) => y.age === age) ?? null);
      const t = isBranch ? bt?.traj : I.trajAt.get(yr?.year ?? s.playhead.year);
      const title = isBranch ? (s.branches.find((b) => b.id === life)?.title ?? "another life") : "Your life";
      const full = replyFrom({ life, title, age, nowAge: I.input?.age ?? age, t: t ?? I.baseTraj!, year: yr, quotes: get().profile!.quotes, text, letter, name: I.input?.firstName ?? "you" });
      const entry = chat({ role: "future", text: "", channel, streaming: true, form: letter ? "letter" : "message", age });
      const words = full.split(/(\s+)/);
      let i = 0;
      await new Promise<void>((res) => {
        const tickWords = () => {
          i += 3;
          const txt = words.slice(0, i).join("");
          set({ dialogue: get().dialogue.map((c) => (c.id === entry.id ? { ...c, text: txt, streaming: i < words.length } : c)) } as Partial<Store>);
          if (i < words.length) later(45, tickWords);
          else res();
        };
        later(500, tickWords);
      });
    },

    reset() {
      I.timers.forEach(clearTimeout);
      I = fresh();
      set({ ...emptyState() } as Partial<Store>);
    },

    dismissSafety() {
      patch({ safety: null });
    },
  };
});

/** Small read helpers shared by the UI. */
export const lifeTitle = (s: SessionState, life: string) => (life === "chosen" ? "Your life" : (s.branches.find((b) => b.id === life)?.title ?? "Another life"));
export const settingById = (s: SessionState, id: string): LiveSetting | undefined => s.settings.find((x) => x.id === id);
export { cap };

