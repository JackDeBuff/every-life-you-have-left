import { useEffect, useState } from "react";
import { getHealth, type Health } from "../lib/api";
import { useRouter } from "../lib/router";

export default function Explainer() {
  const go = useRouter((s) => s.go);
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    getHealth().then(setHealth, () => setErr(true));
  }, []);

  return (
    <main className="screen">
      <h1>Every Life You Have Left</h1>
      <p>Give me 90 seconds and I'll show you four of the lives you have left.</p>
      <p className="muted">
        You answer a few questions. We play out four lives you could still live, year by year to 70, and show you
        why each turn happens: your own words, and a real statistic.
      </p>
      <div className="row">
        <button className="btn" onClick={() => go("consent")}>
          Begin
        </button>
      </div>
      <p className="status" data-ok={health ? String(health.ok && health.db) : err ? "false" : undefined} role="status">
        {health
          ? `api ok · db ${health.db ? "ok" : "down"} · generation ${health.generation ? "on" : "off"}`
          : err
            ? "api unreachable"
            : "checking api"}
      </p>
    </main>
  );
}
