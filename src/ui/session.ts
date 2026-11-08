/**
 * The one place the UI gets session state and calls from.
 *
 *   live (default)   the real SessionAgent over a WebSocket (src/ui/live.ts)
 *   mock             the offline demo (src/ui/mock/store.ts): `?demo=alex`, or the "Play the
 *                    offline demo" offer when the socket can't connect (SPEC §10)
 *
 * Both fill the same ClientState & ClientCalls. Switching backend remounts the app (App keys its
 * tree on the backend), so `useSim` never changes store under a mounted component.
 */
import { create, useStore } from "zustand";
import { startLive, stopLive, useLiveSim } from "./live";
import { useMockSim } from "./mock/store";
import type { Backend, ClientCalls, ClientState } from "./types";

export type Sim = ClientState & ClientCalls;

const initial = (): Backend => {
  const q = new URLSearchParams(location.search);
  return q.get("demo") === "alex" || q.has("offline") ? "mock" : "live";
};

export const useBackend = create<{ mode: Backend }>(() => ({ mode: initial() }));

const storeFor = (m: Backend) => (m === "mock" ? useMockSim : useLiveSim);

// (/admin never opens a session socket: connecting would create an empty session)
// (/privacy neither: reading the policy must not start a life)
if (useBackend.getState().mode === "live" && !location.pathname.startsWith("/admin") && !location.pathname.startsWith("/privacy")) startLive();

/** React hook: `useSim((s) => s.phase)`. */
export function useSim<T>(selector: (s: Sim) => T): T {
  const mode = useBackend((b) => b.mode);
  return useStore(storeFor(mode) as typeof useLiveSim, selector as (s: ReturnType<typeof useLiveSim.getState>) => T);
}

/** Imperative access for event handlers and the clock. */
export const sim = (): Sim => storeFor(useBackend.getState().mode).getState();

export const backend = (): Backend => useBackend.getState().mode;

/** The offline fallback: switch to the local mock with the sample person pre-filled. */
export function playOfflineDemo() {
  stopLive();
  const q = new URLSearchParams(location.search);
  q.set("demo", "alex");
  history.replaceState(null, "", `${location.pathname}?${q}${location.hash}`);
  useMockSim.getState().reset();
  useBackend.setState({ mode: "mock" });
}

// QA handle (also in production): the active session's state, for timing runs from the console.
(window as unknown as { __sim: () => Sim }).__sim = sim;
