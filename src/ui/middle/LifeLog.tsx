/** The life log (SPEC §7): newest at the bottom, auto-scrolls, domain ticks, why popovers, fork rows. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DOMAINS } from "../../../shared/domains";
import type { LogLine } from "../../../shared/sim";
import { ROMAN } from "../format";
import { Icon } from "../icons";
import { famVar } from "../left/LifeRose";
import { useSim } from "../session";
import { WhyPopover } from "./WhyCard";

export function LifeLog() {
  const log = useSim((s) => s.log);
  const branches = useSim((s) => s.branches);
  const box = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);

  const groups = useMemo(() => {
    const out: { year: number; age: number; lines: LogLine[] }[] = [];
    for (const l of log) {
      const g = out[out.length - 1];
      if (g && g.year === l.year) g.lines.push(l);
      else out.push({ year: l.year, age: l.age, lines: [l] });
    }
    return out;
  }, [log]);

  useLayoutEffect(() => {
    const el = box.current;
    if (el && pinned) el.scrollTo({ top: el.scrollHeight, behavior: log.length < 3 ? "auto" : "smooth" });
  }, [log.length, pinned]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let user = false;
    const mark = () => {
      user = true;
    };
    const on = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (atBottom) setPinned(true);
      else if (user) setPinned(false);
      user = false;
    };
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("touchmove", mark, { passive: true });
    el.addEventListener("keydown", mark);
    el.addEventListener("scroll", on, { passive: true });
    return () => {
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchmove", mark);
      el.removeEventListener("keydown", mark);
      el.removeEventListener("scroll", on);
    };
  }, []);

  return (
    <section className="log" aria-label="Life log">
      <div className="log-head">
        <h3 className="label">Life log</h3>
        <span className="label faint">{log.length ? `${groups.length} ${groups.length === 1 ? "year" : "years"}` : ""}</span>
      </div>
      <div className="log-body scroll" ref={box} role="log" aria-live="polite">
        {!log.length && <p className="log-empty small faint">Your years will write themselves here, one line at a time.</p>}
        {groups.map((g) => (
          <div key={g.year} className="log-year">
            <div className="log-when data">
              <span>{g.year}</span>
              <span className="log-age">{g.age}</span>
            </div>
            <div className="log-lines">
              {g.lines.map((l) => (l.kind === "fork" ? <ForkRow key={l.id} line={l} titles={branches.filter((b) => b.forkDecisionId === l.refId).map((b) => b.title)} /> : <Line key={l.id} line={l} />))}
            </div>
          </div>
        ))}
      </div>
      {!pinned && (
        <button className="jump btn ghost sm" onClick={() => setPinned(true)}>
          <Icon name="caretDown" size={13} /> Back to now
        </button>
      )}
    </section>
  );
}

function Line({ line }: { line: LogLine }) {
  const fam = line.domain ? DOMAINS[line.domain].family : null;
  const [title, ...rest] = line.kind === "event" ? line.text.split(/(?<=\.)\s/) : [line.text];
  const hasWhy = !!(line.why || line.baseRate);
  return (
    <div className="log-line" data-kind={line.kind} data-tone={line.tone ?? undefined}>
      <span className="tick" style={fam ? { background: famVar(fam) } : undefined} title={line.domain ? DOMAINS[line.domain].label : undefined} />
      <p className="log-text">
        {line.kind === "nudge" && <Icon name="sliders" size={12} className="log-ico" />}
        {line.kind === "event" ? (
          <>
            <span className="log-title">{title}</span> <span className="muted">{rest.join(" ")}</span>
          </>
        ) : (
          line.text
        )}
        {hasWhy && (
          <WhyPopover line={line}>
            <button className="why-link" aria-label="Why did this happen?">
              why
            </button>
          </WhyPopover>
        )}
      </p>
    </div>
  );
}

function ForkRow({ line, titles }: { line: LogLine; titles: string[] }) {
  const chosen = line.text.match(/“([^”]+)”/)?.[1] ?? "";
  return (
    <div className="log-fork">
      <svg className="fork-glyph" width="64" height="44" viewBox="0 0 64 44" aria-hidden="true">
        <path d="M0 22 H64" stroke="var(--ink)" strokeWidth="2" />
        <path d="M12 22 C24 22 30 8 64 8" stroke="var(--ink-3)" strokeDasharray="5 2.5" fill="none" />
        <path d="M12 22 C24 22 30 36 64 36" stroke="var(--ink-3)" strokeDasharray="1.5 2.5" fill="none" />
        <path d="M16 22 C28 22 34 15 64 15" stroke="var(--ink-3)" strokeDasharray="8 2.5 1.5 2.5" fill="none" />
        <rect x="7" y="17" width="10" height="10" transform="rotate(45 12 22)" fill="var(--sun)" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
      <div>
        <p className="fork-l">
          <span className="label">Your life splits</span>
        </p>
        <p className="fork-chosen">You: {chosen}</p>
        <p className="fork-others small muted">
          {titles.map((t, i) => (
            <span key={t}>
              <span className="numeral">{ROMAN[i]}</span> {t}
              {i < titles.length - 1 ? "   " : ""}
            </span>
          ))}
        </p>
      </div>
      {(line.why || line.baseRate) && (
        <WhyPopover line={line}>
          <button className="why-link">why</button>
        </WhyPopover>
      )}
    </div>
  );
}
