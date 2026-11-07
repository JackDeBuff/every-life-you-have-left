/**
 * Time the Auto judge path against a real SessionAgent, without a browser: this script plays the
 * client's part the way src/ui does (the life clock of src/ui/clock.ts, the fork moment, the
 * interlude cuts driven by the 3D world, moment holds, the reading time on each card), so the
 * numbers match a visible browser tab without depending on one (a hidden pane stalls rAF).
 *
 *   npx tsx scripts/judge-run.ts [baseUrl] [--read 2] [--persona alex|maya|ploy|dev] [--pick random|cycle|0..3]
 *                                [--legacy] [--out file.json]
 *                                [--speed 1x|2x|4x|auto] [--small-read 3] [--years N] [--timeout ms]
 *   baseUrl defaults to http://127.0.0.1:4173 (vite preview of a production build).
 *   --legacy   the client as of 29a2c96: 1.75 s cuts, every moment held 0.7 s.
 *   --speed    1x/2x/4x also answer the small cards (after --small-read s; about half with a
 *              sentence of their own, a few that open a new thread), so a deep-mode life's cost
 *              and pacing can be measured. --years N stops after N years (a partial life).
 *
 * Prints the timeline (Start click = 0), per-fork waits, starved time, the money at the end of each
 * life, and the session's model spend (state.usage).
 */
import { applyServerMsg, agentPath, isServerMsg, type AgentState, type AnswerInput } from "../worker/agent/protocol";
import { SPEED_CONFIG, type SimYear, type StartInput } from "../shared/sim";
import { CLOCK_EASE_IN_MS, CLOCK_EASE_OUT_MS, cutSecondsFor, FORK_MOMENT_S, holdsYearEnd, MOMENT_RULES, playableMoments, secondsPerYearNow, SMALL_DECISION_SCALE } from "../src/ui/pacing";
import { bestGuessLegacy, QA_DOCS, QA_PERSONAS, QA_SCRIPTS } from "./qa/personas";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : dflt;
};
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const READ_S = Number(flag("read", "2"));
const legacy = args.includes("--legacy");
const pick = flag("pick", "random");
const out = flag("out", "");
const TIMEOUT_MS = Number(flag("timeout", "420000"));
const SPEED = flag("speed", "auto") as StartInput["speed"];
const SMALL_READ_S = Number(flag("small-read", String(READ_S)));
const STOP_YEARS = Number(flag("years", "0"));
const SNAP_YEARS = Number(flag("snap", "10"));
let snap: { usage: unknown; at: number; smalls: number } | null = null;

const PERSONAS: Record<string, StartInput> = {
  alex: {
    firstName: "Alex", age: 25, city: "Durham", region: "NC", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: "USD",
    line: "I'm a data analyst at a regional bank. Singapore offered me a transfer and I haven't answered. Money scares me, I still have $28k in loans. If nobody judged me, I'd paint for a living.",
  },
  maya: {
    firstName: "Maya", age: 31, city: "Columbus", region: "OH", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: "USD",
    line: "I'm an ER nurse and I'm tired. A friend wants me to co-found a home-care startup with her. My husband wants a second kid. I'm scared of losing the pension.",
  },
  ploy: {
    firstName: "Ploy", age: 27, city: "Durham", region: "NC", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: "USD",
    line: "I'm a UX designer in Durham. My parents in Bangkok want me to come home, and a Bangkok startup offered me a lead role. I send money home every month.",
  },
  dev: {
    firstName: "Dev", age: 28, city: "Austin", region: "TX", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: "USD",
    line: "I'm a software engineer up for a manager role. Part of me wants to quit and build furniture. My dad is getting older back in Ohio.",
  },
};
// The final QA's personas (scripts/qa): Sam (minimal), Chidi (naira, typed fork answers), Margo (an AI export).
Object.assign(PERSONAS, QA_PERSONAS);
const persona = flag("persona", "alex");
const input = { ...(PERSONAS[persona] ?? PERSONAS.alex!), speed: SPEED };
const qa = QA_SCRIPTS[persona] ?? null;
/** --legacy-answer: answer typed forks the way the old card did (guess an option from shared words). */
const legacyAnswer = args.includes("--legacy-answer");
const dump = flag("dump", "");
/** What the client saw: each year as first played, each fork card as first shown, the profile when the warm-up ended. */
const seenYears = new Map<number, { summary: string; ch: string[]; people: string[]; events: string[] }>();
const shownCards = new Map<string, { year: number; age: number; prompt: string; options: string[] }>();
let warmEnd: { at: number; questions: { key: string; status: string }[]; facts: number; people: string[]; quotes: number; fears: number; plans: number; money: string } | null = null;
let warmQ1: { prompt: string; options: string[] } | null = null;

// Small-card answers (1x/2x/4x): a tap, often a sentence. Every 9th opens a new thread (a person
// they never mentioned, a move, quitting), which drops the queue and asks for a follow-up.
const SMALL_TEXTS = [
  "Honestly I'd keep it to myself for a while.",
  "I'd call my mom first, she always knows.",
  "Money first, then everything else.",
  "I think I'd surprise myself and say yes.",
  "Probably the safe answer, but it would bug me.",
  "It depends on whether I'm sleeping enough, honestly.",
  "I'd write it down and decide on Sunday.",
  "That one scares me more than I admit.",
];
const THREAD_TEXTS = [
  "My friend Jonah keeps saying I should just go for it.",
  "I'm moving to a smaller place across town next month.",
  "My sister Nina is the one I'd tell, she gets it.",
];
let smallAnswered = 0;
let smallWithText = 0;
const smallGaps: number[] = [];
let lastSmallAnswerAt: number | null = null;
let lastSmallAnswerYear: number | null = null;
const handledSmall = new Set<string>();
/** Small cards on screen, by the year they came up in (served per year). */
const smallShownByYear = new Map<number, number>();
/** Cards that were on screen and closed before the script answered (a fork cut them off). */
let smallCutOff = 0;
/** Every "meanwhile": phase start, cuts on screen, phase end, and whether a fork led to it. */
const interludes: { start: number; cuts: number | null; end: number | null; fork: boolean; n: number }[] = [];
let smallAt = 0;

const sessionId = `judge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const ws = new WebSocket(`${base.replace(/^http/, "ws")}${agentPath(sessionId)}`);
let state: AgentState | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function call<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ws.send(JSON.stringify({ type: "rpc", id, method, args: params }));
    setTimeout(() => pending.delete(id) && reject(new Error(`rpc ${method} timed out`)), 60_000);
  });
}
ws.addEventListener("message", (ev) => {
  let m: unknown;
  try {
    m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
  } catch {
    return;
  }
  if (isServerMsg(m)) {
    state = applyServerMsg(state, m);
    return;
  }
  const r = m as { type?: string; id?: string; success?: boolean; result?: unknown; error?: string };
  if (r.type === "rpc" && r.id && pending.has(r.id)) {
    const p = pending.get(r.id)!;
    pending.delete(r.id);
    if (r.success) p.resolve(r.result);
    else p.reject(new Error(r.error ?? "rpc error"));
  }
});

let t0 = 0;
const T = () => (performance.now() - t0) / 1000;
const fmt = (x: number | null | undefined) => (x === null || x === undefined ? "  -  " : x.toFixed(1).padStart(5));
const log = (...a: unknown[]) => console.log(`[${fmt(T())}s]`, ...a);

interface Fork {
  id: string;
  year: number;
  age: number;
  shown: number;
  answered: number | null;
  cuts: number | null;
  ilStart: number | null;
  ilEnd: number | null;
  resumed: number | null;
  skipped: boolean;
  firstYear: number | null;
  choice: string;
}
const forks: Fork[] = [];
let firstCard: number | null = null;
let lastWarm: string | null = null;
let firstWarm: number | null = null;
let lastWarmAnswer: number | null = null;
let warmAsked = 0;
let starvedS = 0;
/** Starved stretches: the playhead waiting at a year for the agent (buffer behind, gate, ending). */
const starves: { at: number; year: number; s: number; why: string }[] = [];
const starve = (year: number, dt: number, why: string) => {
  starvedS += dt;
  const cur = starves.at(-1);
  if (cur && cur.year === year && T() - (cur.at + cur.s) < 0.2) cur.s += dt;
  else starves.push({ at: T(), year, s: dt, why });
};
let momentsPlayed = 0;
let momentHoldS = 0;
let ended: number | null = null;

// --- the client's life clock (src/ui/clock.ts), the fork moment and the world's interlude ---
let progress = 0;
let scale = 0;
let awaiting: number | null = null;
let sentAt = 0;
let last = 0;
let forkUntil = 0;
let momentUntil = 0;
let lastMomentKey: string | null = null;
let ilEndCalled = false;
const cut = legacy ? 1.75 : cutSecondsFor(SPEED);
let periodicIl: { start: number; ended: boolean } | null = null;

function frame() {
  const s = state;
  const now = performance.now();
  const dt = last ? Math.min(1000, now - last) : 16;
  last = now;
  if (!s || s.phase === "start" || !s.profile) return;
  // The warm-up (D-090): tap an answer to each question after the reading time. The clock is still.
  if (s.phase === "warmup") {
    const cur = s.warmup?.current ?? null;
    if (cur && cur !== lastWarm) {
      lastWarm = cur;
      if (firstWarm === null) firstWarm = T();
      const q = s.warmup!.questions.find((x) => x.id === cur)!;
      warmQ1 ??= { prompt: q.prompt, options: q.options.map((o) => o.label) };
      const opt = q.options[warmAsked++ % 4]!;
      // QA personas answer in their own words (so the profile learns what the persona says)
      const text = qa?.warm[q.key] ?? null;
      log(`warm-up ${warmAsked}: ${q.key} → ${text ? `"${text.slice(0, 60)}"` : `"${opt.label}"`}`);
      setTimeout(() => {
        lastWarmAnswer = T();
        void call("answerWarmup", text ? { questionId: cur, optionId: null, text, via: "text" } : { questionId: cur, optionId: opt.id, text: null, via: "tap" }).catch((e) => log("answerWarmup failed", e));
      }, READ_S * 1000);
    }
    return;
  }
  if (!warmEnd && s.profile) {
    const p = s.profile;
    warmEnd = {
      at: T(),
      questions: (s.warmup?.questions ?? []).map((q) => ({ key: q.key, status: q.status })),
      facts: p.facts.filter((f) => !f.id.startsWith("fw") && !(f.key === "location" && f.source !== "upload")).length,
      people: p.people.map((x) => `${x.label} (${x.relation}${x.born ? `, b. ${x.born}` : ""})`),
      quotes: p.quotes.length,
      fears: p.fears.length,
      plans: (p.plans ?? []).length,
      money: `${p.money.feel}, income ${p.money.incomeUsd ?? "?"} USD${p.money.assumed ? " (assumed)" : ""}`,
    };
  }
  // What the client saw, for the QA analysis: years as first played, fork cards as first shown.
  for (const y of s.years) {
    if (y.year > s.playhead.year || seenYears.has(y.year)) continue;
    const life = (y as SimYear & { life?: { ch: string[]; people: { name: string }[] } }).life;
    seenYears.set(y.year, { summary: y.summary, ch: life?.ch ?? [], people: life?.people.map((p) => p.name) ?? [], events: y.events.map((e) => e.title) });
  }
  for (const d of s.decisions)
    if (d.kind === "big" && d.status === "pending" && s.phase === "deciding" && d.year <= s.playhead.year && !shownCards.has(d.id))
      shownCards.set(d.id, { year: d.year, age: d.age, prompt: d.prompt, options: d.options.map((o) => `${o.label} [${o.branchTitle ?? ""}]`) });
  const year = s.playhead.year;
  const visibleDecisions = s.decisions.filter((d) => d.status !== "pending" || d.year <= year);

  // A big card: read it, then answer (the fork moment plays for FORK_MOMENT_S).
  const big = visibleDecisions.find((d) => d.kind === "big" && d.status === "pending");
  if (s.phase === "deciding" && big && !forks.some((f) => f.id === big.id)) {
    if (firstCard === null) firstCard = T();
    const k = forks.length;
    const idx = pick === "random" ? Math.floor(Math.random() * 4) : pick === "cycle" ? k % 4 : Number(pick) % 4;
    // QA personas: a scripted answer per fork (an option matching a pattern, and/or their own words)
    const step = qa?.big[k] ?? null;
    const matched = step?.match ? big.options.find((o) => step.match!.test(`${o.label} ${o.branchTitle ?? ""}`)) : undefined;
    const typedOnly = !!step?.text && step.tap === false;
    const opt = typedOnly ? (legacyAnswer ? big.options.find((o) => o.id === bestGuessLegacy(big, step!.text!))! : null) : (matched ?? big.options[idx]!);
    const text = step?.text ?? null;
    const f: Fork = { id: big.id, year: big.year, age: big.age, shown: T(), answered: null, cuts: null, ilStart: null, ilEnd: null, resumed: null, skipped: false, firstYear: null, choice: opt ? `${opt.branchTitle ?? opt.label}` : `typed: ${text}` };
    forks.push(f);
    log(`card ${k + 1} @${big.age}: "${big.prompt.slice(0, 90)}" → ${opt ? `${opt.id} ${f.choice}` : f.choice}${text && opt ? ` + "${text}"` : ""}`);
    setTimeout(() => {
      f.answered = T();
      forkUntil = performance.now() + FORK_MOMENT_S * 1000;
      ilEndCalled = false;
      const a: AnswerInput = { decisionId: big.id, optionId: opt?.id ?? null, text, via: text ? "text" : "tap" };
      void call("answer", a).catch((e) => log("answer failed", e));
    }, READ_S * 1000);
  }
  const f = forks.at(-1);
  if (f && f.answered !== null) {
    if (f.cuts === null && s.phase === "interlude" && s.interlude?.length) f.cuts = T();
    if (f.firstYear === null && (s.bufferedTo ?? 0) >= f.year && s.years.some((y) => y.year === f.year)) f.firstYear = T();
    // The world plays the cuts once the fork moment is over.
    if (f.ilStart === null && s.phase === "interlude" && s.interlude?.length && now >= forkUntil) f.ilStart = T();
    if (f.ilStart !== null && !ilEndCalled && T() - f.ilStart >= cut * (s.interlude?.length ?? 3)) {
      ilEndCalled = true;
      f.ilEnd = T();
      void call("pause", false).catch(() => {});
    }
    if (f.resumed === null && s.phase === "playing" && now >= forkUntil) {
      f.resumed = T();
      if (f.ilStart === null) f.skipped = true;
    }
  }

  // A small card (1x/2x/4x): read it, then answer (a tap, often with a sentence).
  const small = visibleDecisions.find((d) => d.kind === "small" && d.status === "pending");
  if (small && s.phase === "playing" && !handledSmall.has(small.id)) {
    handledSmall.add(small.id);
    smallShownByYear.set(s.playhead.year, (smallShownByYear.get(s.playhead.year) ?? 0) + 1);
    // Time to show: from the previous answer to this card, when it's due in the same year.
    if (lastSmallAnswerAt !== null && lastSmallAnswerYear !== null && small.year <= lastSmallAnswerYear) smallGaps.push(T() - lastSmallAnswerAt);
    lastSmallAnswerAt = null;
    const k = smallAnswered;
    setTimeout(() => {
      const cur = state?.decisions.find((d) => d.id === small.id);
      if (!cur || cur.status !== "pending") {
        smallCutOff++;
        return;
      }
      const opt = small.options[Math.floor(Math.random() * 4)]!;
      const text = k % 9 === 4 ? THREAD_TEXTS[(k / 9) % THREAD_TEXTS.length | 0]! : k % 2 === 0 ? SMALL_TEXTS[k % SMALL_TEXTS.length]! : null;
      smallAnswered++;
      if (text) smallWithText++;
      lastSmallAnswerAt = T();
      lastSmallAnswerYear = state?.playhead.year ?? small.year;
      const a: AnswerInput = { decisionId: small.id, optionId: opt.id, text, via: text ? "text" : "tap" };
      void call("answer", a).catch((e) => log("small answer failed", e));
    }, SMALL_READ_S * 1000);
  }
  // Every interlude's length (phase start → cuts → resume).
  const il = interludes.at(-1);
  if (s.phase === "interlude" && (!il || il.end !== null)) interludes.push({ start: T(), cuts: null, end: null, fork: !!(f && f.answered !== null && f.resumed === null), n: 0 });
  else if (il && il.end === null) {
    if (il.cuts === null && s.interlude?.length) (il.cuts = T()), (il.n = s.interlude.length);
    if (s.phase !== "interlude") il.end = T();
  }
  // A periodic "meanwhile" (1x/2x, every 10 years): the world plays the cuts, then resumes.
  if (s.phase === "interlude" && s.interlude?.length && !(f && f.answered !== null && f.resumed === null)) {
    if (!periodicIl) periodicIl = { start: T(), ended: false };
    if (!periodicIl.ended && T() - periodicIl.start >= cut * s.interlude.length) {
      periodicIl.ended = true;
      void call("pause", false).catch(() => {});
    }
  } else if (s.phase !== "interlude") periodicIl = null;

  // Moments: the world holds the clock for a moment's cinematic (WorldView).
  const y = s.years.find((x) => x.year === year);
  const playable = legacy ? null : playableMoments(s.years, SPEED);
  const mom = y?.scene.moment && (legacy || playable!.has(year)) ? y.scene.moment : null;
  const key = s.phase === "playing" && mom ? `${year}:${mom}` : null;
  if (key && key !== lastMomentKey) {
    const hold = legacy ? 0.7 : MOMENT_RULES[SPEED].holdS;
    momentUntil = now + hold * 1000;
    momentsPlayed++;
    momentHoldS += hold;
  }
  lastMomentKey = key;

  if (awaiting !== null && year >= awaiting) {
    progress = Math.max(0, Math.min(0.5, progress - 1 - (year - awaiting)));
    awaiting = null;
  }
  const endYear = s.profile.startYear + (s.endAge - s.profile.age);
  const next = year + 1;
  const buffered = next > endYear || s.bufferedTo === null || s.bufferedTo >= next;
  const smallPending = visibleDecisions.some((d) => d.kind === "small" && d.status === "pending");
  if (smallPending) smallAt = now;
  const holdEnd = !legacy && holdsYearEnd({ speed: s.speed, smallOpen: smallPending, smallDue: s.smallDue, nextYear: next, nextFork: s.nextFork, msSinceSmall: now - smallAt });
  const held = now < forkUntil || now < momentUntil;
  const playing = s.phase === "playing" && !s.playhead.paused && !held;
  const target = playing ? (smallPending ? (legacy ? 0.25 : SMALL_DECISION_SCALE) : 1) : 0;
  const k = Math.min(1, dt / (target < scale ? (legacy ? 260 : CLOCK_EASE_OUT_MS) : legacy ? 600 : CLOCK_EASE_IN_MS));
  scale += (target - scale) * k;
  if (Math.abs(scale - target) < 0.002) scale = target;
  if (s.phase !== "playing" && awaiting === null) progress = 0;
  const spy = legacy ? SPEED_CONFIG[s.speed].secondsPerYear : secondsPerYearNow({ speed: s.speed, base: SPEED_CONFIG[s.speed].secondsPerYear, nextFork: s.nextFork, endingReady: s.endingReady });
  if (playing || scale > 0) progress += ((dt / 1000) * scale) / spy;
  if (progress >= 1) {
    if (awaiting === null) {
      if (holdEnd && s.phase === "playing") {
        progress = 1; // the year waits for the small card (src/ui/clock.ts), not for the agent
      } else if (buffered && s.phase === "playing") {
        awaiting = next;
        sentAt = now;
        void call("tick", next).catch(() => {});
      } else {
        progress = 1;
        if (playing && !buffered) starve(year, dt / 1000, `buffer ${s.bufferedTo}`);
      }
    } else {
      progress = Math.min(progress, 1.5);
      if (now - sentAt > 1500 && s.phase === "playing") {
        sentAt = now;
        void call("tick", awaiting).catch(() => {});
      }
      if (playing && now - sentAt > 300) starve(year, dt / 1000, s.thinking ? "agent thinking" : "tick unconfirmed");
    }
  }
}

const lastOf = (ys: SimYear[]) => ys.at(-1);
const money = (n: number | undefined) => (n === undefined ? "?" : `$${Math.round(n / 1000)}k`);

async function main() {
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res(), { once: true });
    ws.addEventListener("error", () => rej(new Error("websocket failed")), { once: true });
  });
  const until = async (pred: () => boolean, ms: number) => {
    const end = Date.now() + ms;
    while (Date.now() < end && !pred()) await new Promise((r) => setTimeout(r, 20));
  };
  await until(() => state?.phase === "start", 10_000);
  t0 = performance.now();
  void call("start", input, ...(QA_DOCS[persona] ? [QA_DOCS[persona]] : []));
  log(`start (${input.firstName}, ${input.age}, ${legacy ? "legacy client" : "current client"}, read ${READ_S}s) session ${sessionId}`);
  let lastYear = 0;
  let lastPhase = "";
  const loop = setInterval(() => {
    frame();
    const s = state!;
    if (s.phase !== lastPhase) {
      lastPhase = s.phase;
      if (s.phase === "ended") ended = T();
    }
    if (s.playhead.year !== lastYear && s.phase === "playing") {
      lastYear = s.playhead.year;
      if (!snap && s.profile && s.playhead.year >= s.profile.startYear + SNAP_YEARS)
        snap = { usage: JSON.parse(JSON.stringify(s.usage ?? null)), at: T(), smalls: s.decisions.filter((d) => d.kind === "small").length };
    }
  }, 16);
  await until(() => ended !== null || (STOP_YEARS > 0 && !!state?.profile && state.playhead.year >= state.profile.startYear + STOP_YEARS), TIMEOUT_MS);
  clearInterval(loop);
  await new Promise((r) => setTimeout(r, 2500)); // let the last usage patch land
  const s = state!;
  console.log(`\n— ${SPEED === "auto" ? "Auto judge" : SPEED} run${ended === null ? ` (stopped at ${s.playhead.year}, age ${s.playhead.age})` : ""} —`);
  console.log(`total (Start → ending): ${fmt(ended)} s   first card: ${fmt(firstCard)} s   starved: ${starvedS.toFixed(1)} s   moments: ${momentsPlayed} (${momentHoldS.toFixed(1)} s held)`);
  console.log(`warm-up: ${warmAsked} questions, first at ${fmt(firstWarm)} s, last answer at ${fmt(lastWarmAnswer)} s → first fork ${lastWarmAnswer !== null && firstCard !== null ? `${(firstCard - lastWarmAnswer).toFixed(1)} s later` : "-"}`);
  console.log("fork  age  shown  answer  cuts   il.start il.end resumed  answer→cuts  answer→resume  firstYear");
  for (const [i, f] of forks.entries()) {
    const ac = f.cuts !== null && f.answered !== null ? f.cuts - f.answered : null;
    const ar = f.resumed !== null && f.answered !== null ? f.resumed - f.answered : null;
    const fy = f.firstYear !== null && f.answered !== null ? f.firstYear - f.answered : null;
    console.log(`${String(i + 1).padStart(4)} ${String(f.age).padStart(4)} ${fmt(f.shown)} ${fmt(f.answered)}  ${fmt(f.cuts)}  ${fmt(f.ilStart)}  ${fmt(f.ilEnd)}  ${fmt(f.resumed)}     ${fmt(ac)}        ${fmt(ar)}      ${fmt(fy)}${f.skipped ? "  (interlude skipped)" : ""}  ${f.choice}`);
  }
  for (const x of starves.filter((x) => x.s >= 0.4)) console.log(`  starved ${x.s.toFixed(1)} s at ${x.at.toFixed(1)} s, year ${x.year} (${x.why})`);
  const end = s.profile!.birthYear + s.endAge;
  const lives = [
    { title: "Your life", y: lastOf(s.years) },
    ...s.branches.filter((b) => b.status === "active").map((b) => ({ title: b.title, y: lastOf(b.years) })),
  ];
  console.log(`money at ${s.endAge} (${end}):`);
  for (const l of lives) console.log(`  ${l.title.padEnd(28)} ${money(l.y?.money.netWorth).padStart(8)}  income ${money(l.y?.money.income)}  (${l.y?.year}, ${l.y?.place})`);
  const nws = lives.map((l) => l.y?.money.netWorth ?? 0);
  console.log(`  spread: ${money(Math.min(...nws))} – ${money(Math.max(...nws))} (max/min ${(Math.max(...nws) / Math.max(1, Math.min(...nws))).toFixed(2)}x)`);
  if (s.ending) {
    console.log(`verdict (you): ${s.ending.verdict}`);
    for (const b of s.branches.filter((x) => x.status === "active")) console.log(`verdict (${b.title}): ${s.ending.branchVerdicts[b.id] ?? "-"}`);
  }
  console.log(`usage: $${s.usage?.usd.toFixed(3) ?? "?"} (list price $${s.usage?.listUsd?.toFixed(3) ?? "?"}) over ${s.usage?.calls ?? "?"} calls ${JSON.stringify(s.usage?.byPurpose ?? {})}`);
  const det = s.usage?.detail ?? {};
  let inT = 0;
  let cT = 0;
  console.log("purpose                 calls      $      in tok   cached  hit%");
  for (const [k, v] of Object.entries(det).sort((a, b) => b[1].usd - a[1].usd)) {
    inT += v.inTok;
    cT += v.cachedTok;
    console.log(`${k.padEnd(22)} ${String(v.calls).padStart(6)} ${v.usd.toFixed(3).padStart(7)} ${String(v.inTok).padStart(10)} ${String(v.cachedTok).padStart(8)} ${(v.inTok ? (100 * v.cachedTok) / v.inTok : 0).toFixed(0).padStart(5)}`);
  }
  console.log(`cache: ${cT} of ${inT} input tokens (${inT ? ((100 * cT) / inT).toFixed(1) : 0}%)`);
  const sm = s.usage?.smalls;
  const smallsShown = s.decisions.filter((d) => d.kind === "small").length;
  const gaps = smallGaps.slice().sort((a, b) => a - b);
  console.log(`small cards: ${smallsShown} shown, ${smallAnswered} answered (${smallWithText} with text); same-year answer → next card: median ${gaps.length ? gaps[gaps.length >> 1]!.toFixed(2) : "-"} s, max ${gaps.length ? gaps.at(-1)!.toFixed(2) : "-"} s over ${gaps.length}`);
  if (sm) console.log(`agent: served ${sm.served} (${sm.fromQueue} straight from the queue, waits ${sm.waitMs} ms total, max ${sm.maxWaitMs} ms), batches ${sm.batches}, discarded ${sm.discarded}, follow-ups ${sm.followUps}, folds ${sm.folds} (${sm.folded} answers)`);
  console.log(`big decisions: ${s.decisions.filter((d) => d.kind === "big").length}; years ${s.years.length}; wall ${fmt(T())} s`);
  const played = Math.max(1, s.playhead.year - s.profile!.startYear + 1);
  const shown = [...smallShownByYear.values()].reduce((a, b) => a + b, 0);
  console.log(`small cards on screen: ${shown} over ${played} years = ${(shown / played).toFixed(2)} a year (1 every ${shown ? (played / shown).toFixed(1) : "-"} years); cut off by a fork: ${smallCutOff}`);
  console.log(`  by age: ${[...smallShownByYear].sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y - s.profile!.birthYear}:${n}`).join(" ")}`);
  const ages = s.decisions.filter((d) => d.kind === "big").map((d) => d.age);
  console.log(`  fork ages: ${ages.join(" ")} (gaps ${ages.slice(1).map((a, i) => a - ages[i]!).join(" ")})`);
  for (const x of interludes) console.log(`  interlude ${x.fork ? "fork    " : "periodic"} @${fmt(x.start)}: cuts after ${fmt(x.cuts !== null ? x.cuts - x.start : null)} s, ${x.n} cuts, ${fmt(x.end !== null ? x.end - x.start : null)} s long`);
  const ar = forks.filter((x) => x.resumed !== null && x.answered !== null).map((x) => x.resumed! - x.answered!);
  if (ar.length) console.log(`fork -> resume: median ${ar.slice().sort((a, b) => a - b)[ar.length >> 1]!.toFixed(1)} s, max ${Math.max(...ar).toFixed(1)} s over ${ar.length}`);
  if (snap) {
    const u = snap.usage as { usd?: number; calls?: number; detail?: Record<string, { calls: number }> } | null;
    console.log(`after ${SNAP_YEARS} years (${fmt(snap.at)} s): $${u?.usd?.toFixed(3) ?? "?"} over ${u?.calls ?? "?"} calls, ${snap.smalls} small cards; calls ${JSON.stringify(Object.fromEntries(Object.entries(u?.detail ?? {}).map(([k, v]) => [k, v.calls])))}`);
  }
  console.log(`engine ${s.engine}, error ${s.error ?? "none"}`);
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify({ sessionId, speed: SPEED, legacy, readS: READ_S, smallReadS: SMALL_READ_S, total: ended, wall: T(), firstCard, warmup: { asked: warmAsked, first: firstWarm, lastAnswer: lastWarmAnswer }, starvedS, momentsPlayed, forks, interludes, smallShownByYear: Object.fromEntries(smallShownByYear), smallCutOff, smallAnswered, smallWithText, smallGaps, lives: lives.map((l) => ({ title: l.title, netWorth: l.y?.money.netWorth, income: l.y?.money.income, year: l.y?.year })), usage: s.usage, snap, decisions: s.decisions.map((d) => ({ id: d.id, kind: d.kind, year: d.year, status: d.status, prompt: d.prompt })), answers: s.answers }, null, 2));
  }
  if (dump) {
    const fs = await import("node:fs");
    fs.writeFileSync(
      dump,
      JSON.stringify({ persona, legacyAnswer, sessionId, ended, wall: T(), input, warmQ1, warmEnd, seenYears: Object.fromEntries(seenYears), shownCards: Object.fromEntries(shownCards), forks, state: s }, null, 1),
    );
    console.log(`state dumped to ${dump}`);
  }
  ws.close();
  process.exit(ended !== null || STOP_YEARS > 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
