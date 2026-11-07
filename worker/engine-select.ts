/**
 * Picks the Engine for a session.
 *   ENGINE=mock                 → worker/engine-mock.ts (no LLM)
 *   ENGINE=real (default)       → worker/engine/index.ts (Engine agent's code), if it exists and loads
 *   GENERATION_ENABLED="false"  → mock, always (D-032 kill switch)
 *   no GCP_API_KEY              → mock
 *
 * The real module is found with import.meta.glob, so a missing worker/engine/index.ts can't break
 * the build: the glob is just empty. worker/engine/index.ts exports
 *   createEngine({ llm: createFetchLlm({ apiKey, project, location }) }): Engine
 *   provisionalProfile(input): Profile   (code-only, lets the first card render before the profile)
 * Older shapes (createEngine(env), `engine`, default) still load.
 */
import type { Engine } from "../shared/engine";
import type { Profile } from "../shared/schema";
import type { StartInput } from "../shared/sim";
import { createMockEngine } from "./engine-mock";
import { bindLlm, generationEnabled, type LlmEnv } from "./llm";

export type EngineKind = "mock" | "real";

type EngineModule = {
  createEngine?: (arg: never) => Engine;
  createFetchLlm?: (cfg: { apiKey: string; project: string; location?: string }) => unknown;
  provisionalProfile?: (input: StartInput) => Profile;
  engine?: Engine;
  default?: Engine | ((env: Env) => Engine);
};

export interface LoadedEngine {
  engine: Engine;
  kind: EngineKind;
  reason: string;
  /** Code-only profile from the start screen (real engine only), for the first card in parallel. */
  provisional?: (input: StartInput) => Profile;
  /** Real engine only: the same engine with the fast model writing every year, to race stalls. */
  backup?: Engine;
}

const REAL = import.meta.glob<EngineModule>("./engine/index.ts");

export function wantsReal(env: Env): boolean {
  const e = env as Env & { ENGINE?: string };
  return String(e.ENGINE ?? "real").toLowerCase() !== "mock" && generationEnabled(env) && !!env.GCP_API_KEY;
}

const isEngine = (x: unknown): x is Engine => !!x && typeof x === "object" && typeof (x as Engine).generateYears === "function";

/** Every real model call's usage (the session agent tallies the session's cost from it). */
export type UsageSink = (u: { purpose: string; model: string; inputTokens: number; outputTokens: number; thoughtTokens: number; hedged: boolean; ms: number; firstTokenMs?: number }) => void;

export async function loadEngine(env: Env, onUsage?: UsageSink): Promise<LoadedEngine> {
  bindLlm(env as unknown as LlmEnv);
  if (!wantsReal(env)) return { engine: createMockEngine(), kind: "mock", reason: generationEnabled(env) ? "ENGINE=mock" : "generation_disabled" };
  const load = REAL["./engine/index.ts"];
  if (!load) return { engine: createMockEngine(), kind: "mock", reason: "engine_missing" };
  try {
    const mod = await load();
    const llm =
      typeof mod.createFetchLlm === "function"
        ? mod.createFetchLlm({ apiKey: env.GCP_API_KEY, project: env.GCP_PROJECT, location: (env as Env & { GCP_LOCATION?: string }).GCP_LOCATION || "global" })
        : null;
    type Create = (d: { llm: unknown; models?: Record<string, unknown>; onUsage?: UsageSink }) => Engine;
    const made =
      typeof mod.createEngine === "function" && llm
        ? (mod.createEngine as Create)({ llm, onUsage })
      : typeof mod.createEngine === "function" ? (mod.createEngine as (env: Env) => Engine)(env)
      : isEngine(mod.engine) ? mod.engine
      : typeof mod.default === "function" ? (mod.default as (env: Env) => Engine)(env)
      : mod.default;
    // The hedge writer: every year on the fast model (no heavy lead after forks). No mock fallback:
    // if it fails, the primary simply keeps going.
    const FAST = env.MODEL_FAST || "gemini-3.5-flash-lite";
    const backup =
      typeof mod.createEngine === "function" && llm
        ? (mod.createEngine as Create)({ llm, onUsage, models: { forkLeadYears: 0, yearsBySpeed: { "1x": FAST, "2x": FAST, "4x": FAST, auto: FAST } } })
        : undefined;
    if (isEngine(made)) return { engine: resilient(made, createMockEngine()), kind: "real", reason: "ok", provisional: mod.provisionalProfile, backup: isEngine(backup) ? backup : undefined };
    return { engine: createMockEngine(), kind: "mock", reason: "engine_bad_export" };
  } catch (e) {
    console.error("engine load failed", e instanceof Error ? e.name : "error");
    return { engine: createMockEngine(), kind: "mock", reason: "engine_load_failed" };
  }
}

/** Per-call budgets before a real call is abandoned for the mock (ms). */
const BUDGET: Partial<Record<keyof Engine, number>> = {
  startProfile: 30_000, enrichProfile: 30_000, makeDecision: 25_000, applyAnswer: 25_000, generateYears: 60_000,
  spawnBranches: 30_000, prepareFork: 45_000, stepBranch: 30_000, interlude: 25_000, settingsFor: 25_000, ending: 40_000, safety: 8_000,
};

class Timeout extends Error {
  constructor(what: string) {
    super(`timeout:${what}`);
    this.name = "Timeout";
  }
}

function within<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Timeout(what)), ms)))]).finally(() => clearTimeout(t));
}

/**
 * Wrap the real engine so any call that throws or runs past its budget is answered by the mock
 * instead (the expo must never stall). Errors are logged by name only (no user data).
 */
export function resilient(real: Engine, mock: Engine): Engine {
  const warn = (m: string, e: unknown) => console.error(`engine.${m} fell back to mock`, e instanceof Error ? e.name : "error");
  const wrap = <K extends keyof Engine>(m: K) =>
    (async (...args: unknown[]) => {
      try {
        return await within((real[m] as (...a: unknown[]) => Promise<unknown>)(...args), BUDGET[m] ?? 30_000, m);
      } catch (e) {
        warn(m, e);
        return (mock[m] as (...a: unknown[]) => Promise<unknown>)(...args);
      }
    }) as unknown as Engine[K];
  return {
    startProfile: wrap("startProfile"),
    enrichProfile: wrap("enrichProfile"),
    makeDecision: wrap("makeDecision"),
    applyAnswer: wrap("applyAnswer"),
    spawnBranches: wrap("spawnBranches"),
    stepBranch: wrap("stepBranch"),
    interlude: wrap("interlude"),
    // Speculative: no mock fallback (a failed preparation just means the fork is written at the answer).
    prepareFork: real.prepareFork ? (state, d) => within(real.prepareFork!(state, d), BUDGET.prepareFork!, "prepareFork") : undefined,
    settingsFor: wrap("settingsFor"),
    ending: wrap("ending"),
    safety: wrap("safety"),
    planSlots(state) {
      try {
        return real.planSlots(state);
      } catch (e) {
        warn("planSlots", e);
        return mock.planSlots(state);
      }
    },
    logFor(state, year) {
      try {
        return real.logFor(state, year);
      } catch (e) {
        warn("logFor", e);
        return mock.logFor(state, year);
      }
    },
    async generateYears(state, fromYear, count, onYear) {
      // Years already streamed by the real engine are kept; the mock fills in the rest.
      let live = true;
      let next = fromYear;
      const emit = (y: Parameters<typeof onYear>[0]) => {
        if (!live) return;
        next = Math.max(next, y.year + 1);
        onYear(y);
      };
      try {
        return await within(real.generateYears(state, fromYear, count, emit), BUDGET.generateYears!, "generateYears");
      } catch (e) {
        live = false;
        warn("generateYears", e);
        const left = fromYear + count - next;
        return left > 0 ? mock.generateYears(state, next, left, onYear) : [];
      }
    },
    async *replyAs(state, life, age, history, text) {
      let yielded = false;
      try {
        for await (const d of real.replyAs(state, life, age, history, text)) {
          yielded = true;
          yield d;
        }
      } catch (e) {
        warn("replyAs", e);
        if (!yielded) yield* mock.replyAs(state, life, age, history, text);
      }
    },
  };
}
