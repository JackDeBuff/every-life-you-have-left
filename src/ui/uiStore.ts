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
}));
