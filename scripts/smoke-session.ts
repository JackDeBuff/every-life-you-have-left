/**
 * Scripted client for the SessionAgent loop (no browser).
 *
 *   npx tsx scripts/smoke-session.ts [baseUrl] [--speed auto|4x|2x|1x] [--tick-ms 120] [--quiet]
 *   baseUrl defaults to http://localhost:5173 (npm run dev). Prod: https://every-life-you-have-left.supawich.workers.dev
 *
 * Runs: start → first big decision → answer (tap + say-more text) → interlude → years stream
 * (ticks) → more big decisions → small decisions (answered and slid) → a nudge → sayTo → peekBranch
 * → ending. Exits 0 when phase reaches "ended" with an ending, 1 otherwise.
 */
import { applyServerMsg, agentPath, isServerMsg, type AgentState, type AnswerInput } from "../worker/agent/protocol";
import type { StartInput } from "../shared/sim";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : dflt;
};
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://localhost:5173").replace(/\/$/, "");
const speed = flag("speed", "auto") as StartInput["speed"];
const tickMs = Number(flag("tick-ms", "120"));
const quiet = args.includes("--quiet");
/** Let interludes auto-resume (server alarm, ~9 s) instead of skipping them with pause(false). */
const waitInterlude = args.includes("--wait-interlude");
const TIMEOUT_MS = Number(flag("timeout", "240000"));

const sessionId = `smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const url = `${base.replace(/^http/, "ws")}${agentPath(sessionId)}`;
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s]`, ...a);

let state: AgentState | null = null;
let msgs = 0;
let bytes = 0;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
const ws = new WebSocket(url);

function call<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ws.send(JSON.stringify({ type: "rpc", id, method, args: params }));
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`rpc ${method} timed out`));
    }, 60_000);
  });
}

ws.addEventListener("message", (ev) => {
  const raw = typeof ev.data === "string" ? ev.data : "";
  msgs++;
  bytes += raw.length;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return;
  }
  if (isServerMsg(m)) {
    state = applyServerMsg(state, m);
    return;
  }
  const r = m as { type?: string; id?: string; success?: boolean; result?: unknown; error?: string; done?: boolean };
  if (r.type === "rpc" && r.id && pending.has(r.id)) {
    const p = pending.get(r.id)!;
    pending.delete(r.id);
    if (r.success) p.resolve(r.result);
    else p.reject(new Error(r.error ?? "rpc error"));
  }
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(pred: (s: AgentState) => boolean, what: string, ms = 60_000): Promise<AgentState> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (state && pred(state)) return state;
    await sleep(40);
  }
  throw new Error(`timed out waiting for: ${what} (phase=${state?.phase}, error=${state?.error})`);
}

const seen = { big: 0, small: 0, slid: 0, interludes: 0, nudged: false, chatted: false, peeked: false };
let lastPhase = "";

async function main() {
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res(), { once: true });
    ws.addEventListener("error", () => rej(new Error(`websocket failed: ${url}`)), { once: true });
  });
  log(`connected ${url}`);
  await until((s) => s.phase === "start", "snapshot");

  const input: StartInput = {
    firstName: "Sam", age: 27, city: "Durham", region: "NC", country: "US",
    line: "I keep thinking about moving to Lisbon, but my mom is here and money is tight.",
    via: "text", speed, appearance: null, hasSelfie: false, currency: null,
  };
  await call("start", input);
  log("start() sent");

  const deadline = t0 + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const s = state!;
    if (s.phase !== lastPhase) {
      log(`phase → ${s.phase}  (playhead ${s.playhead.year}/${s.playhead.age}, years ${s.years.length}, buffered→${s.bufferedTo}, engine ${s.engine}${s.error ? `, error ${s.error}` : ""})`);
      lastPhase = s.phase;
    }
    if (s.phase === "ended") break;

    if (s.phase === "deciding") {
      const d = s.decisions.find((x) => x.kind === "big" && x.status === "pending");
      if (d) {
        const opt = d.options[seen.big % 4]!;
        log(`BIG ${d.id} @${d.year}: "${d.prompt}" → ${opt.id} "${opt.label}" [${opt.branchTitle}]`);
        const a: AnswerInput = { decisionId: d.id, optionId: opt.id, text: seen.big === 0 ? "Only if I can still fly home for Mom's birthday." : null, via: seen.big === 0 ? "text" : "tap" };
        await call("answer", a);
        seen.big++;
        await until((x) => x.decisions.find((y) => y.id === d.id)?.status === "answered", "answered");
        if (seen.big === 2 && speed === "auto") {
          // Exercise small decisions: switch to 4x for the rest of the life.
          await call("setSpeed", "4x");
          log("setSpeed(4x)");
        }
      }
      await sleep(60);
      continue;
    }

    if (s.phase === "interlude") {
      if (s.interlude?.length) {
        seen.interludes++;
        log(`INTERLUDE: ${s.interlude.map((c) => `${c.title} @${c.age} (${c.scene.setting}/${c.scene.activity})`).join(" | ")}`);
        if (!waitInterlude) {
          await sleep(300);
          await call("pause", false); // skip ahead (the UI lets it play ~9 s)
        }
        await until((x) => x.phase !== "interlude", "interlude end", 30_000);
      } else await sleep(60);
      continue;
    }

    if (s.phase === "playing") {
      // Small decisions at or before the playhead: answer half, slide half.
      const smalls = s.decisions.filter((d) => d.kind === "small" && d.status === "pending" && d.year <= s.playhead.year);
      for (const d of smalls) {
        const slide = (seen.small + seen.slid) % 2 === 1;
        const a: AnswerInput = slide
          ? { decisionId: d.id, optionId: null, text: null, via: "tap", slid: true }
          : { decisionId: d.id, optionId: "a", text: null, via: "tap" };
        await call("answer", a);
        if (slide) seen.slid++;
        else seen.small++;
        if (!quiet) log(`small ${d.id} @${d.year} ${slide ? "slid" : "→ a"}: ${d.prompt}`);
      }
      if (!seen.nudged && s.settings.length && s.playhead.age >= s.profile!.age + 3) {
        const st = s.settings.find((x) => x.type === "slider") ?? s.settings[0]!;
        await call("nudge", st.id, st.type === "slider" ? "80" : st.options.at(-1)?.value ?? "true");
        seen.nudged = true;
        log(`nudge ${st.id}`);
      }
      if (!seen.chatted && s.branches.length) {
        seen.chatted = true;
        void call("sayTo", "chosen", s.playhead.age + 10, "Was it worth it?").then(() => log(`sayTo reply: "${state!.chat.at(-1)?.text.slice(0, 100)}"`));
      }
      if (!seen.peeked && s.branches.some((b) => b.status === "active")) {
        seen.peeked = true;
        const b = s.branches.find((x) => x.status === "active")!;
        const peeked = await call<{ years: unknown[] }>("peekBranch", b.id);
        log(`peekBranch ${b.id} "${b.title}": ${peeked.years.length} years`);
      }
      const want = s.playhead.year + 1;
      await call("tick", want);
      if (!quiet && state!.playhead.year !== s.playhead.year) {
        const y = state!.years.find((x) => x.year === state!.playhead.year);
        log(`year ${state!.playhead.year} (${state!.playhead.age}) ${y?.scene.setting}/${y?.scene.activity}${y?.scene.moment ? ` [${y.scene.moment}]` : ""}: ${y?.summary}`);
      }
      await sleep(tickMs);
      continue;
    }
    await sleep(60);
  }

  const s = state!;
  const ok = s.phase === "ended" && !!s.ending;
  log("—".repeat(40));
  log(`result: ${ok ? "PASS" : "FAIL"}  phase=${s.phase} engine=${s.engine}`);
  log(`years=${s.years.length} log=${s.log.length} decisions=${s.decisions.length} (big answered ${seen.big}, small ${seen.small}, slid ${seen.slid}) interludes=${seen.interludes}`);
  log(`branches: ${s.branches.map((b) => `${b.title}[${b.status}, ${b.years.length}y]`).join(", ")}`);
  log(`verdict: ${s.verdictAtEnd}`);
  log(`five-year (chosen): ${s.ending?.fiveYear.chosen?.slice(0, 140)}`);
  log(`ws messages=${msgs} bytes=${(bytes / 1024).toFixed(0)}KB  final state=${(JSON.stringify(s).length / 1024).toFixed(0)}KB  session=${sessionId}`);
  ws.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  log("FAIL", e instanceof Error ? e.message : e);
  ws.close();
  process.exit(1);
});
