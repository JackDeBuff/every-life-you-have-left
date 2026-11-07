import { useEffect } from "react";
import Admin from "./screens/Admin";
import Ending from "./screens/Ending";
import Play from "./screens/Play";
import Start from "./screens/Start";
import { CrisisBanner } from "./ui/CrisisBanner";
import { setSun } from "./ui/motion";
import { useSim } from "./ui/session";

/** Screens follow the session phase: start → playing/deciding/interlude → ended. /admin is separate. */
export default function App() {
  const phase = useSim((s) => s.phase);
  const hasProfile = useSim((s) => !!s.profile);

  useEffect(() => {
    // ?theme=dark|light forces a theme (screenshots, projectors); otherwise follow the system.
    const q = new URLSearchParams(location.search);
    const t = q.get("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    // ?still=1: finish every CSS animation instantly (headless screenshots).
    if (q.get("still")) document.documentElement.classList.add("still");
  }, []);
  useEffect(() => {
    if (phase === "start") setSun(0);
  }, [phase]);

  if (location.pathname.startsWith("/admin")) return <Admin />;
  return (
    <>
      {phase === "start" || !hasProfile ? <Start /> : phase === "ended" ? <Ending /> : <Play />}
      <CrisisBanner />
    </>
  );
}
