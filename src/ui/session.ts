/**
 * The one place the UI gets session state and calls from.
 * Today: the local mock (src/ui/mock/store.ts). At integration, the lead points `useSim` at the
 * real session-agent client with the same shape (ClientState & ClientCalls).
 */
import { useMockSim } from "./mock/store";
import type { ClientCalls, ClientState } from "./types";

export type Sim = ClientState & ClientCalls;

/** React hook: `useSim((s) => s.phase)`. */
export const useSim = useMockSim;

/** Imperative access for event handlers and the clock. */
export const sim = (): Sim => useMockSim.getState();
