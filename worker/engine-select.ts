/**
 * Picks the Engine for a session.
 *   ENGINE=mock                 → worker/engine-mock.ts (no LLM)
 *   ENGINE=real (default)       → worker/engine/index.ts (Engine agent's code), if it exists and loads
 *   GENERATION_ENABLED="false"  → mock, always (D-032 kill switch)
 *   no GCP_API_KEY              → mock
 *
 * The real module is found with import.meta.glob, so a missing worker/engine/index.ts can't break
 * the build: the glob is just empty. The module may export any of:
 *   export function createEngine(env: Env): Engine    (preferred)
 *   export const engine: Engine
 *   export default Engine | (env) => Engine
 */
import type { Engine } from "../shared/engine";
import { createMockEngine } from "./engine-mock";
import { bindLlm, generationEnabled, type LlmEnv } from "./llm";

export type EngineKind = "mock" | "real";

type EngineModule = {
  createEngine?: (env: Env) => Engine;
  engine?: Engine;
  default?: Engine | ((env: Env) => Engine);
};

const REAL = import.meta.glob<EngineModule>("./engine/index.ts");

export function wantsReal(env: Env): boolean {
  const e = env as Env & { ENGINE?: string };
  return String(e.ENGINE ?? "real").toLowerCase() !== "mock" && generationEnabled(env) && !!env.GCP_API_KEY;
}

const isEngine = (x: unknown): x is Engine => !!x && typeof x === "object" && typeof (x as Engine).generateYears === "function";

export async function loadEngine(env: Env): Promise<{ engine: Engine; kind: EngineKind; reason: string }> {
  bindLlm(env as unknown as LlmEnv);
  if (!wantsReal(env)) return { engine: createMockEngine(), kind: "mock", reason: generationEnabled(env) ? "ENGINE=mock" : "generation_disabled" };
  const load = REAL["./engine/index.ts"];
  if (!load) return { engine: createMockEngine(), kind: "mock", reason: "engine_missing" };
  try {
    const mod = await load();
    const made =
      typeof mod.createEngine === "function" ? mod.createEngine(env)
      : isEngine(mod.engine) ? mod.engine
      : typeof mod.default === "function" ? (mod.default as (env: Env) => Engine)(env)
      : mod.default;
    if (isEngine(made)) return { engine: made, kind: "real", reason: "ok" };
    return { engine: createMockEngine(), kind: "mock", reason: "engine_bad_export" };
  } catch (e) {
    console.error("engine load failed", e instanceof Error ? e.name : "error");
    return { engine: createMockEngine(), kind: "mock", reason: "engine_load_failed" };
  }
}
