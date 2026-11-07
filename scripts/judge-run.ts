/**
 * Time the Auto judge path against a real SessionAgent, without a browser: this script plays the
 * client's part the way src/ui does (the life clock of src/ui/clock.ts, the fork moment, the
 * interlude cuts driven by the 3D world, moment holds, the reading time on each card), so the
 * numbers match a visible browser tab without depending on one (a hidden pane stalls rAF).
 *
 *   npx tsx scripts/judge-run.ts [baseUrl] [--read 2] [--persona alex|maya|dev] [--pick random|cycle|0..3]
 *                                [--legacy] [--out file.json]
 *   baseUrl defaults to http://127.0.0.1:4173 (vite preview of a production build).
 *   --legacy   the client as of 29a2c96: 1.75 s cuts, every moment held 0.7 s.
 *
 * Prints the timeline (Start click = 0), per-fork waits, starved time, the money at the end of each
 * life, and the session's model spend (state.usage).
 */
import { applyServerMsg, agentPath, isServerMsg, type AgentState, type AnswerInput } from "../worker/agent/protocol";
import { SPEED_CONFIG, type SimYear, type StartInput } from "../shared/sim";
import { cutSecondsFor, FORK_MOMENT_S, MOMENT_RULES, playableMoments, SMALL_DECISION_SCALE } from "../src/ui/pacing";

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

const PERSONAS: Record<string, StartInput> = {
  alex: {
    firstName: "Alex", age: 25, city: "Durham", region: "NC", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false,
    line: "I'm a data analyst at a regional bank. Singapore offered me a transfer and I haven't answered. Money scares me, I still have $28k in loans. If nobody judged me, I'd paint for a living.",
  },
  maya: {
    firstName: "Maya", age: 31, city: "Columbus", region: "OH", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false,
    line: "I'm an ER nurse and I'm tired. A friend wants me to co-found a home-care startup with her. My husband wants a second kid. I'm scared of losing the pension.",
  },
  dev: {
    firstName: "Dev", age: 28, city: "Austin", region: "TX", country: "US", via: "text", speed: "auto", appearance: null, hasSelfie: false,
    line: "I'm a software engineer up for a manager role. Part of me wants to quit and build furniture. My dad is getting older back in Ohio.",
  },
};
const input = PERSONAS[flag("persona", "alex")] ?? PERSONAS.alex!;

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
let starvedS = 0;
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
const cut = legacy ? 1.75 : cutSecondsFor("auto");

function frame() {
  const s = state;
  const now = performance.now();
  const dt = last ? Math.min(1000, now - last) : 16;
  last = now;
  if (!s || s.phase === "start" || !s.profile) return;
  const year = s.playhead.year;
  const visibleDecisions = s.decisions.filter((d) => d.status !== "pending" || d.year <= year);

  // A big card: read it, then answer (the fork moment plays for FORK_MOMENT_S).
  const big = visibleDecisions.find((d) => d.kind === "big" && d.status === "pending");
  if (s.phase === "deciding" && big && !forks.some((f) => f.id === big.id)) {
    if (firstCard === null) firstCard = T();
    const k = forks.length;
    const idx = pick === "random" ? Math.floor(Math.random() * 4) : pick === "cycle" ? k % 4 : Number(pick) % 4;
    const opt = big.options[idx]!;
    const f: Fork = { id: big.id, year: big.year, age: big.age, shown: T(), answered: null, cuts: null, ilStart: null, ilEnd: null, resumed: null, skipped: false, firstYear: null, choice: `${opt.branchTitle ?? opt.label}` };
    forks.push(f);
    log(`card ${k + 1} @${big.age}: "${big.prompt.slice(0, 90)}" → ${opt.id} ${f.choice}`);
    setTimeout(() => {
      f.answered = T();
      forkUntil = performance.now() + FORK_MOMENT_S * 1000;
      ilEndCalled = false;
      const a: AnswerInput = { decisionId: big.id, optionId: opt.id, text: null, via: "tap" };
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

  // Moments: the world holds the clock for a moment's cinematic (WorldView).
  const y = s.years.find((x) => x.year === year);
  const playable = legacy ? null : playableMoments(s.years, "auto");
  const mom = y?.scene.moment && (legacy || playable!.has(year)) ? y.scene.moment : null;
  const key = s.phase === "playing" && mom ? `${year}:${mom}` : null;
  if (key && key !== lastMomentKey) {
    const hold = legacy ? 0.7 : MOMENT_RULES.auto.holdS;
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
  const held = now < forkUntil || now < momentUntil;
  const playing = s.phase === "playing" && !s.playhead.paused && !held;
  const target = playing ? (smallPending ? (legacy ? 0.25 : SMALL_DECISION_SCALE) : 1) : 0;
  const k = Math.min(1, dt / (target < scale ? 260 : 600));
  scale += (target - scale) * k;
  if (Math.abs(scale - target) < 0.002) scale = target;
  if (s.phase !== "playing" && awaiting === null) progress = 0;
  const spy = SPEED_CONFIG[s.speed].secondsPerYear;
  if (playing || scale > 0) progress += ((dt / 1000) * scale) / spy;
  if (progress >= 1) {
    if (awaiting === null) {
      if (buffered && s.phase === "playing") {
        awaiting = next;
        sentAt = now;
        void call("tick", next).catch(() => {});
      } else {
        progress = 1;
        if (playing && !buffered) starvedS += dt / 1000;
      }
    } else {
      progress = Math.min(progress, 1.5);
      if (now - sentAt > 1500 && s.phase === "playing") {
        sentAt = now;
        void call("tick", awaiting).catch(() => {});
      }
      if (playing && now - sentAt > 300) starvedS += dt / 1000;
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
  void call("start", input);
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
    }
  }, 16);
  await until(() => ended !== null, TIMEOUT_MS);
  clearInterval(loop);
  await new Promise((r) => setTimeout(r, 2500)); // let the last usage patch land
  const s = state!;
  console.log("\n— Auto judge run —");
  console.log(`total (Start → ending): ${fmt(ended)} s   first card: ${fmt(firstCard)} s   starved: ${starvedS.toFixed(1)} s   moments: ${momentsPlayed} (${momentHoldS.toFixed(1)} s held)`);
  console.log("fork  age  shown  answer  cuts   il.start il.end resumed  answer→cuts  answer→resume  firstYear");
  for (const [i, f] of forks.entries()) {
    const ac = f.cuts !== null && f.answered !== null ? f.cuts - f.answered : null;
    const ar = f.resumed !== null && f.answered !== null ? f.resumed - f.answered : null;
    const fy = f.firstYear !== null && f.answered !== null ? f.firstYear - f.answered : null;
    console.log(`${String(i + 1).padStart(4)} ${String(f.age).padStart(4)} ${fmt(f.shown)} ${fmt(f.answered)}  ${fmt(f.cuts)}  ${fmt(f.ilStart)}  ${fmt(f.ilEnd)}  ${fmt(f.resumed)}     ${fmt(ac)}        ${fmt(ar)}      ${fmt(fy)}${f.skipped ? "  (interlude skipped)" : ""}  ${f.choice}`);
  }
  const end = s.profile!.birthYear + s.endAge;
  const lives = [
    { title: "Your life", y: lastOf(s.years) },
    ...s.branches.filter((b) => b.status === "active").map((b) => ({ title: b.title, y: lastOf(b.years) })),
  ];
  console.log(`money at ${s.endAge} (${end}):`);
  for (const l of lives) console.log(`  ${l.title.padEnd(28)} ${money(l.y?.money.netWorth).padStart(8)}  income ${money(l.y?.money.income)}  (${l.y?.year}, ${l.y?.place})`);
  const nws = lives.map((l) => l.y?.money.netWorth ?? 0);
  console.log(`  spread: ${money(Math.min(...nws))} – ${money(Math.max(...nws))} (max/min ${(Math.max(...nws) / Math.max(1, Math.min(...nws))).toFixed(2)}x)`);
  console.log(`usage: $${s.usage?.usd.toFixed(3) ?? "?"} over ${s.usage?.calls ?? "?"} calls ${JSON.stringify(s.usage?.byPurpose ?? {})}`);
  console.log(`engine ${s.engine}, error ${s.error ?? "none"}`);
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify({ sessionId, legacy, readS: READ_S, total: ended, firstCard, starvedS, momentsPlayed, forks, lives: lives.map((l) => ({ title: l.title, netWorth: l.y?.money.netWorth, income: l.y?.money.income, year: l.y?.year })), usage: s.usage }, null, 2));
  }
  ws.close();
  process.exit(ended !== null ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
