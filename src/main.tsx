import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// /#world-lab: the 3D world lab (src/world/Lab.tsx), loaded only on that hash.
const WorldLab = lazy(() => import("./world/Lab"));
const isWorldLab = () => location.hash.startsWith("#world-lab");
// /#look-lab: every placeholder-portrait combination (src/ui/left/LookLab.tsx), for visual QA.
const LookLab = lazy(() => import("./ui/left/LookLab"));
const isLookLab = () => location.hash.startsWith("#look-lab");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isWorldLab() ? (
      <Suspense fallback={null}>
        <WorldLab />
      </Suspense>
    ) : isLookLab() ? (
      <Suspense fallback={null}>
        <LookLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
