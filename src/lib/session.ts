/**
 * Session store (WP3 owns the details). Holds what the flow has collected so far.
 * Types come from shared/schema.ts so the UI and Worker can't drift.
 */
import { create } from "zustand";
import type { Answer, Life, LifePlan, Profile } from "../../shared/schema";
import type { LifeKey } from "../../shared/lives";

export type Mode = "quick" | "deep";

interface SessionState {
  sessionId: string | null;
  mode: Mode;
  voice: boolean;
  answers: Answer[];
  profile: Profile | null;
  plan: LifePlan | null;
  /** Lives as they stream in; partial while generating. */
  lives: Partial<Record<LifeKey, Partial<Life>>>;
  set: (patch: Partial<Omit<SessionState, "set">>) => void;
  reset: () => void;
}

const empty = {
  sessionId: null, mode: "quick" as Mode, voice: true, answers: [], profile: null, plan: null, lives: {},
};

export const useSession = create<SessionState>((set) => ({
  ...empty,
  set: (patch) => set(patch),
  reset: () => set(empty),
}));
