import type { ReactNode } from "react";
import { useRouter, type Screen } from "../lib/router";

interface Props {
  title: string;
  owner: string;
  children?: ReactNode;
  next?: { to: Screen; label: string };
  back?: Screen;
}

/** Temporary screen body. Each WP replaces its own screens; keep the props stable until then. */
export function Placeholder({ title, owner, children, next, back }: Props) {
  const go = useRouter((s) => s.go);
  return (
    <main className="screen">
      <h1>{title}</h1>
      <p className="muted">Placeholder, owned by {owner}.</p>
      {children}
      <div className="row">
        {back && (
          <button className="btn ghost" onClick={() => go(back)}>
            Back
          </button>
        )}
        {next && (
          <button className="btn" onClick={() => go(next.to)}>
            {next.label}
          </button>
        )}
      </div>
    </main>
  );
}
