/** Left pane: portrait, bio (name, rolling age, place, work, people, net worth), the life rose, tell me more. */
import { useEffect, useRef, useState } from "react";
import type { SimYearL } from "../../../worker/engine/ledger";
import { money } from "../format";
import { gsap, reducedMotion } from "../motion";
import { useSim } from "../session";
import { LifeRose } from "./LifeRose";
import { Portrait } from "./Portrait";
import { TellMeMore } from "./TellMeMore";

export function LeftPane() {
  return (
    <aside className="pane left scroll" data-region="left" aria-label="You">
      <Bio />
      <section className="status" aria-label="Status">
        <h3 className="label pane-h">This year, at a glance</h3>
        <StatusRose />
      </section>
      <TellMeMore />
    </aside>
  );
}

function StatusRose() {
  const states = useSim((s) => s.status);
  const log = useSim((s) => s.log);
  return <LifeRose states={states} log={log} size={224} />;
}

export function Bio() {
  const p = useSim((s) => s.profile);
  const appearance = useSim((s) => s.appearance);
  const portraits = useSim((s) => s.portraits);
  const age = useSim((s) => s.playhead.age);
  const year = useSim((s) => s.playhead.year);
  const endAge = useSim((s) => s.endAge);
  const yr = useSim((s) => s.years.find((y) => y.year === s.playhead.year) ?? null);
  const forks = useSim((s) => s.decisions.filter((d) => d.kind === "big" && d.status === "answered").length);
  const places = useSim((s) => new Set(s.years.filter((y) => y.year <= s.playhead.year).map((y) => y.place)).size);
  if (!p) return null;
  const startAge = p.age;
  const progress = (age - startAge) / Math.max(1, endAge - startAge);
  // The year's own work line (engine life ledger) follows forks and retirement; the profile fact
  // is only what they said at the start.
  const work = (yr as SimYearL | null)?.life?.work || p.facts.find((f) => f.key === "occupation")?.value || "";
  // People in this year of the life (engine ledger: partner, children with code-computed ages,
  // pets, family), falling back to the start profile for years written before the ledger existed.
  const ledgerPeople = (yr as SimYearL | null)?.life?.people;
  const people = ledgerPeople?.length
    ? ledgerPeople.slice(0, 5).map((x, i) => {
        const name = x.name.replace(/^your /, "");
        const label = name[0]!.toUpperCase() + name.slice(1);
        return { id: `${i}-${x.name}`, label: x.role === "child" && x.age !== null ? `${label}, ${x.age}` : label, relation: x.role === "partner" ? "partner" : x.relation };
      })
    : [...p.people].sort((a, b) => b.closeness - a.closeness).slice(0, 5);
  const yearsIn = age - startAge;
  return (
    <section className="bio" aria-label="Bio">
      <div className="bio-top">
        <Portrait appearance={appearance} age={age} progress={progress} portraits={portraits} size={96} label={`${p.firstName}, illustrated, at ${age}`} />
        <div className="bio-id">
          <p className="bio-name">{p.firstName}</p>
          <p className="bio-age" aria-label={`Age ${age}`}>
            <Roll value={age} />
          </p>
          <p className="bio-year label">
            {year} · {endAge - age > 0 ? `${endAge - age} to go` : "the end age"}
          </p>
        </div>
      </div>
      <dl className="bio-rows">
        <div>
          <dt className="label">Lives in</dt>
          <dd>{yr?.place ?? p.city}</dd>
        </div>
        <div>
          <dt className="label">Work</dt>
          <dd>{work}</dd>
        </div>
        {people.length > 0 && (
          <div>
            <dt className="label">People</dt>
            <dd className="people">
              {people.map((x) => (
                <span key={x.id} className="person" data-rel={x.relation}>
                  {x.label}
                  {["partner", "spouse", "friend"].includes(x.relation) && <span className="faint"> · {x.relation}</span>}
                </span>
              ))}
            </dd>
          </div>
        )}
        <div className="money-row">
          <dt className="label">Net worth</dt>
          <dd>
            <Count value={yr?.money.netWorth ?? 0} className="money data" />
            <span className="money-note">A projection, not a prediction. Today's dollars.</span>
          </dd>
        </div>
      </dl>
      <p className="so-far small muted">
        {yearsIn === 0 ? "Day one. Nothing's decided yet." : `${yearsIn} ${yearsIn === 1 ? "year" : "years"} in · ${places} ${places === 1 ? "place" : "places"} · ${forks} ${forks === 1 ? "fork" : "forks"}`}
      </p>
    </section>
  );
}

/** The age rolls like an odometer: old number slides up and out, new one rises in. */
export function Roll({ value }: { value: number }) {
  const [pair, setPair] = useState<{ now: number; was: number | null; k: number }>({ now: value, was: null, k: 0 });
  useEffect(() => {
    if (value !== pair.now) setPair((p) => ({ now: value, was: p.now, k: p.k + 1 }));
  }, [value, pair.now]);
  return (
    <span className="roll">
      {pair.was !== null && !reducedMotion() && (
        <span key={`w${pair.k}`} className="roll-out" aria-hidden="true">
          {pair.was}
        </span>
      )}
      <span key={`n${pair.k}`} className={pair.was !== null && !reducedMotion() ? "roll-in" : ""}>
        {pair.now}
      </span>
    </span>
  );
}

/** Money counts toward its new value instead of jumping. */
export function Count({ value, className }: { value: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const cur = useRef({ v: value });
  useEffect(() => {
    if (!el.current) return;
    if (reducedMotion()) {
      el.current.textContent = money(value);
      cur.current.v = value;
      return;
    }
    const tw = gsap.to(cur.current, {
      v: value,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => {
        if (el.current) el.current.textContent = money(cur.current.v);
      },
    });
    return () => {
      tw.kill();
    };
  }, [value]);
  return (
    <span ref={el} className={className}>
      {money(value)}
    </span>
  );
}
