/**
 * Loads GCP settings for node scripts from the environment or the repo's gitignored .dev.vars.
 * Never prints values.
 */
import { existsSync, readFileSync } from "node:fs";
import { createFetchLlm, type LlmPort } from "../../worker/engine/llm-port";

export function loadEnv(): { apiKey: string; project: string } {
  const vars: Record<string, string> = {};
  const file = new URL("../../.dev.vars", import.meta.url);
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) vars[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
    }
  }
  const apiKey = process.env.GCP_API_KEY || vars.GCP_API_KEY || "";
  const project = process.env.GCP_PROJECT || vars.GCP_PROJECT || "triangle-ai-hack-2026";
  if (!apiKey) throw new Error("GCP_API_KEY missing: copy .dev.vars into the repo root (it is gitignored).");
  return { apiKey, project };
}

export function nodeLlm(): LlmPort {
  const { apiKey, project } = loadEnv();
  return createFetchLlm({ apiKey, project, retries: 2 });
}
