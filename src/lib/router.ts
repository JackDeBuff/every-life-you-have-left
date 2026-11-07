/**
 * Tiny state-based router (no dependency beyond zustand). Screens are an enum, not URLs; the
 * browser back button works through history.state. Only /admin and /s/:id are real paths.
 */
import { create } from "zustand";

export const SCREENS = [
  "explainer", "consent", "setup", "uploads", "profile", "questions", "story", "result", "letters", "admin",
] as const;
export type Screen = (typeof SCREENS)[number];

const initial = (): Screen => (location.pathname.startsWith("/admin") ? "admin" : "explainer");

interface RouterState {
  screen: Screen;
  go: (s: Screen, opts?: { replace?: boolean }) => void;
}

export const useRouter = create<RouterState>((set) => ({
  screen: initial(),
  go: (screen, opts) => {
    const url = screen === "admin" ? "/admin" : "/";
    if (opts?.replace) history.replaceState({ screen }, "", url);
    else history.pushState({ screen }, "", url);
    set({ screen });
    window.scrollTo({ top: 0 });
  },
}));

window.addEventListener("popstate", (e) => {
  const s = (e.state as { screen?: Screen } | null)?.screen;
  useRouter.setState({ screen: s && SCREENS.includes(s) ? s : initial() });
});
history.replaceState({ screen: useRouter.getState().screen }, "");
