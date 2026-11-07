import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/global.css";

// /#world-lab: the 3D world lab (src/world/Lab.tsx), loaded only on that hash.
const WorldLab = lazy(() => import("./world/Lab"));
const isWorldLab = () => location.hash.startsWith("#world-lab");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isWorldLab() ? (
      <Suspense fallback={null}>
        <WorldLab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
