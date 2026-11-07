/** UI-only state (not part of the session): highlights, phone tabs, choreography flags. */
import { create } from "zustand";

interface Ui {
  /** Quote to highlight in the dialogue; nonce re-triggers the sweep. */
  highlight: { quoteId: string; nonce: number } | null;
  showQuote: (quoteId: string) => void;
  /** A fork moment is playing for this decision. */
  forking: { decisionId: string; optionId: string } | null;
  setForking: (f: Ui["forking"]) => void;
  mobileTab: "log" | "bio" | "settings";
  setMobileTab: (t: Ui["mobileTab"]) => void;
  sheetOpen: boolean;
  setSheetOpen: (o: boolean) => void;
  /** The 3D world is mounted and has WebGL (it drives the interlude's timing). */
  world3d: boolean;
  /** Interlude cut the 3D world is showing now (-1 = none yet). */
  worldCut: number;
  /**
   * The know-me score when they last removed a learned item. The score only ever drops for that
   * (the agent keeps it monotonic otherwise), so the meter says why for a few seconds.
   */
  knowDrop: { from: number; at: number } | null;
  noteRemoval: (from: number) => void;
}

/** How long the meter explains a drop after a removal. */
export const KNOW_DROP_MS = 8000;

/** "I know you 41% (45% before you removed that)" while the explanation is fresh, else null. */
export function knowDropNote(score: number, drop: Ui["knowDrop"], now = Date.now()): string | null {
  if (!drop || score >= drop.from || now - drop.at > KNOW_DROP_MS) return null;
  return `${drop.from}% before you removed that`;
}

export const useUi = create<Ui>((set) => ({
  highlight: null,
  showQuote: (quoteId) => set((s) => ({ highlight: { quoteId, nonce: (s.highlight?.nonce ?? 0) + 1 }, sheetOpen: true })),
  forking: null,
  setForking: (forking) => set({ forking }),
  mobileTab: "log",
  setMobileTab: (mobileTab) => set({ mobileTab }),
  sheetOpen: false,
  setSheetOpen: (sheetOpen) => set({ sheetOpen }),
  world3d: false,
  worldCut: -1,
  knowDrop: null,
  noteRemoval: (from) => {
    const at = Date.now();
    const cur = useUi.getState().knowDrop;
    // Several removals in a row: "before" is the score before the first of them.
    set({ knowDrop: { from: cur && at - cur.at < KNOW_DROP_MS ? Math.max(cur.from, from) : from, at } });
    // Re-render the meters once the note expires.
    setTimeout(() => useUi.getState().knowDrop?.at === at && set({ knowDrop: null }), KNOW_DROP_MS + 50);
  },
}));

// QA handle (dev): UI flags (forking, worldCut, world3d).
if (import.meta.env.DEV) (window as unknown as { __ui: typeof useUi }).__ui = useUi;
