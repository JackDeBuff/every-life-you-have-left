/** Small building blocks for /admin: icons, copy buttons, chips, key-value rows, raw JSON. */
import { useState, type ReactNode, type SVGProps } from "react";
import { Icon, type IconName } from "../../ui/icons";
import type { CheckLevel, Violation } from "./types";

// Phosphor (MIT, https://phosphoricons.com) via the better-icons MCP, like src/ui/icons.tsx.
const A = {
  search: "m229.66 218.34l-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32M40 112a72 72 0 1 1 72 72a72.08 72.08 0 0 1-72-72",
  warning: "M236.8 188.09L149.35 36.22a24.76 24.76 0 0 0-42.7 0L19.2 188.09a23.51 23.51 0 0 0 0 23.72A24.35 24.35 0 0 0 40.55 224h174.9a24.35 24.35 0 0 0 21.33-12.19a23.51 23.51 0 0 0 .02-23.72m-13.87 15.71a8.5 8.5 0 0 1-7.48 4.2H40.55a8.5 8.5 0 0 1-7.48-4.2a7.59 7.59 0 0 1 0-7.72l87.45-151.87a8.75 8.75 0 0 1 15 0l87.45 151.87a7.59 7.59 0 0 1-.04 7.72M120 144v-40a8 8 0 0 1 16 0v40a8 8 0 0 1-16 0m20 36a12 12 0 1 1-12-12a12 12 0 0 1 12 12",
  signOut: "M120 216a8 8 0 0 1-8 8H48a8 8 0 0 1-8-8V40a8 8 0 0 1 8-8h64a8 8 0 0 1 0 16H56v160h56a8 8 0 0 1 8 8m109.66-93.66l-40-40a8 8 0 0 0-11.32 11.32L204.69 120H112a8 8 0 0 0 0 16h92.69l-26.35 26.34a8 8 0 0 0 11.32 11.32l40-40a8 8 0 0 0 0-11.32",
  refresh: "M240 56v48a8 8 0 0 1-8 8h-48a8 8 0 0 1 0-16h27.4l-26.59-24.36l-.25-.24a80 80 0 1 0-1.67 114.78a8 8 0 0 1 11 11.63A95.44 95.44 0 0 1 128 224h-1.32a96 96 0 1 1 69.07-164L224 85.8V56a8 8 0 1 1 16 0",
  fork: "M224 64a32 32 0 1 0-40 31v17a8 8 0 0 1-8 8H80a8 8 0 0 1-8-8V95a32 32 0 1 0-16 0v17a24 24 0 0 0 24 24h40v25a32 32 0 1 0 16 0v-25h40a24 24 0 0 0 24-24V95a32.06 32.06 0 0 0 24-31M48 64a16 16 0 1 1 16 16a16 16 0 0 1-16-16m96 128a16 16 0 1 1-16-16a16 16 0 0 1 16 16m48-112a16 16 0 1 1 16-16a16 16 0 0 1-16 16",
  bug: "M144 92a12 12 0 1 1 12 12a12 12 0 0 1-12-12m-44-12a12 12 0 1 0 12 12a12 12 0 0 0-12-12m116 64a87.8 87.8 0 0 1-3 23l22.24 9.72A8 8 0 0 1 232 192a7.9 7.9 0 0 1-3.2-.67L207.38 182a88 88 0 0 1-158.76 0l-21.42 9.33a7.9 7.9 0 0 1-3.2.67a8 8 0 0 1-3.2-15.33L43 167a87.8 87.8 0 0 1-3-23v-8H16a8 8 0 0 1 0-16h24v-8a87.8 87.8 0 0 1 3-23l-22.2-9.67a8 8 0 1 1 6.4-14.66L48.62 74a88 88 0 0 1 158.76 0l21.42-9.36a8 8 0 0 1 6.4 14.66L213 89.05a87.8 87.8 0 0 1 3 23v8h24a8 8 0 0 1 0 16h-24ZM56 120h144v-8a72 72 0 0 0-144 0Zm64 95.54V136H56v8a72.08 72.08 0 0 0 64 71.54M200 144v-8h-64v79.54A72.08 72.08 0 0 0 200 144",
} as const;
export type AdminIconName = keyof typeof A;

export function AIcon({ name, size = 15, ...rest }: { name: AdminIconName | IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  if (name in A)
    return (
      <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
        <path d={A[name as AdminIconName]} />
      </svg>
    );
  return <Icon name={name as IconName} size={size} {...rest} />;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // http or a blocked clipboard: the textarea fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/** A small "copy" button. `text` is computed on click (bug reports are built lazily). */
export function CopyButton({ text, label = "Copy", title, compact }: { text: () => string; label?: string; title?: string; compact?: boolean }) {
  const [state, setState] = useState<"idle" | "done" | "fail">("idle");
  return (
    <button
      type="button"
      className={`adm-copy${compact ? " compact" : ""}`}
      data-state={state}
      title={title ?? label}
      aria-label={title ?? label}
      onClick={async (e) => {
        e.stopPropagation();
        const ok = await copyText(text());
        setState(ok ? "done" : "fail");
        window.setTimeout(() => setState("idle"), 1400);
      }}
    >
      <AIcon name={state === "done" ? "check" : "bug"} size={13} />
      {!compact && <span>{state === "done" ? "Copied" : state === "fail" ? "Copy failed" : label}</span>}
    </button>
  );
}

export const Chip = ({ children, tone, title }: { children: ReactNode; tone?: "sun" | "warn" | "error" | "info" | "up" | "down" | "mixed" | "quiet"; title?: string }) => (
  <span className="adm-chip" data-tone={tone} title={title}>
    {children}
  </span>
);

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="adm-kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RawJson({ value, label = "JSON" }: { value: unknown; label?: string }) {
  return (
    <details className="adm-raw">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}

export const Section = ({ title, aside, children, id }: { title: ReactNode; aside?: ReactNode; children: ReactNode; id?: string }) => (
  <section className="adm-section" id={id}>
    <header>
      <h3 className="label">{title}</h3>
      {aside}
    </header>
    {children}
  </section>
);

export const Empty = ({ children }: { children: ReactNode }) => <p className="adm-empty">{children}</p>;

/** The user's own words: serif italic, like everywhere in the product. */
export const Voice = ({ children }: { children: ReactNode }) => <span className="voice">{children}</span>;

export const LEVEL_LABEL: Record<CheckLevel, string> = { error: "Error", warn: "Warning", info: "Info" };

/** The code checks on one item, inline. */
export function Flags({ items, onOpen }: { items: Violation[] | undefined; onOpen?: (v: Violation) => void }) {
  if (!items?.length) return null;
  return (
    <ul className="adm-flags">
      {items.map((v) => (
        <li key={v.id} data-level={v.level}>
          <AIcon name="warning" size={12} />
          <span className="adm-flag-kind">
            {v.group}:{v.kind}
          </span>
          <span>{v.msg}</span>
          {onOpen && (
            <button type="button" className="adm-linkbtn" onClick={() => onOpen(v)}>
              in Health
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
