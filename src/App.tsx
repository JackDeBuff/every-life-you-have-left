import { useEffect } from "react";
import Admin from "./screens/Admin";
import Ending from "./screens/Ending";
import Play from "./screens/Play";
import Start from "./screens/Start";
import { ConnectionNotice } from "./ui/ConnectionNotice";
import { CrisisBanner } from "./ui/CrisisBanner";
import { setSun } from "./ui/motion";
import { useBackend, useSim } from "./ui/session";

/**
 * Screens follow the session phase: start → playing/deciding/interlude → ended. /admin is separate.
 * The tree is keyed on the backend (live agent / offline mock) so switching remounts everything.
 */
export default function App() {
  const mode = useBackend((b) => b.mode);
  useEffect(() => {
    // ?theme=dark|light forces a theme (screenshots, projectors); otherwise follow the system.
    const q = new URLSearchParams(location.search);
    const t = q.get("theme");
    if (t === "dark" || t === "light") document.documentElement.dataset.theme = t;
    // ?still=1: finish every CSS animation instantly (headless screenshots).
    if (q.get("still")) document.documentElement.classList.add("still");
  }, []);
  if (location.pathname.startsWith("/admin")) return <Admin />;
  return <Screens key={mode} />;
}

function Screens() {
  const phase = useSim((s) => s.phase);
  const hasProfile = useSim((s) => !!s.profile);
  useEffect(() => {
    if (phase === "start") setSun(0);
  }, [phase]);
  // Play takes over as soon as there is a profile (the agent sets a provisional one at once): the
  // world builds "today" while the first card is written, instead of a spinner on the start form.
  const starting = !hasProfile;
  return (
    <>
      {starting ? <Start /> : phase === "ended" ? <Ending /> : <Play />}
      <CrisisBanner />
      <ConnectionNotice />
    </>
  );
}
