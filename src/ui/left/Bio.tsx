/** Left pane: portrait, bio (name, rolling age, place, work, people, net worth), the life rose, tell me more. */
import { useEffect, useRef, useState } from "react";
import { pronounsFor } from "../../../shared/schema";
import { CURRENCIES, CURRENCY_CODES, currencyForPlace, type CurrencyCode } from "../../../shared/currency";
import { money, moneyHint, moneyNote, setCurrencyPref, useCurrency, useCurrencyPref } from "../format";
import { Icon } from "../icons";
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
  // This year, or (while it's being rewritten after a fork) the latest year already lived; the
  // net worth must not flash $0 meanwhile (QA). Day one: their own savings minus debt, if known.
  const yr = useSim((s) => s.years.find((y) => y.year === s.playhead.year) ?? s.years.findLast((y) => y.year <= s.playhead.year) ?? null);
  const dayOne = useSim((s) => (s.profile?.money.savingsUsd ?? 0) - (s.profile?.money.debtUsd ?? 0));
  const lastNw = useRef<number | null>(null);
  if (yr) lastNw.current = yr.money.netWorth;
  const netWorth = yr?.money.netWorth ?? lastNw.current ?? dayOne;
  const sid = useSim((s) => s.sessionId);
  const pref = useCurrencyPref();
  const forks = useSim((s) => s.decisions.filter((d) => d.kind === "big" && d.status === "answered").length);
  const cur = useCurrency();
  const places = useSim((s) => new Set(s.years.filter((y) => y.year <= s.playhead.year).map((y) => y.place)).size);
  if (!p) return null;
  const startAge = p.age;
  const progress = (age - startAge) / Math.max(1, endAge - startAge);
  const work = p.facts.find((f) => f.key === "occupation")?.value ?? "";
  const people = [...p.people].sort((a, b) => b.closeness - a.closeness).slice(0, 5);
  const yearsIn = age - startAge;
  // The life moved somewhere with another currency: offer to show money in it (once per currency).
  const here = currencyForPlace(yr?.place);
  const offer = here && here !== cur && !pref.dismissed.includes(here) ? here : null;
  return (
    <section className="bio" aria-label="Bio">
      <div className="bio-top">
        <Portrait appearance={appearance} age={age} progress={progress} portraits={portraits} size={96} label={`${p.firstName}, illustrated, at ${age}`} />
        <div className="bio-id">
          <p className="bio-name">
            {p.firstName}
            {p.gender && p.gender !== "undisclosed" && <span className="bio-pron">{pronounsFor(p.gender)}</span>}
          </p>
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
            <span className="money-line">
              <Count value={netWorth} code={cur} className="money data" />
              <select className="cur-pick" aria-label="Show money in" value={cur} onChange={(e) => setCurrencyPref(sid, { override: e.target.value as CurrencyCode })}>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {CURRENCIES[c].symbol} {c}
                  </option>
                ))}
              </select>
            </span>
            {offer && (
              <span className="cur-offer small">
                <button type="button" className="cur-offer-yes" onClick={() => setCurrencyPref(sid, { override: offer })}>
                  You're in {yr!.place.split(",")[0]} now · show {CURRENCIES[offer].symbol}?
                </button>
                <button type="button" className="cur-offer-no" aria-label="Keep the current currency" onClick={() => setCurrencyPref(sid, { dismissed: [...pref.dismissed, offer] })}>
                  <Icon name="x" size={11} />
                </button>
              </span>
            )}
            <span className="money-note">{moneyNote(cur)}</span>
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
export function Count({ value, className, code = "USD" }: { value: number; className?: string; code?: CurrencyCode }) {
  const el = useRef<HTMLSpanElement>(null);
  const cur = useRef({ v: value });
  useEffect(() => {
    if (!el.current) return;
    if (reducedMotion()) {
      el.current.textContent = money(value, code);
      cur.current.v = value;
      return;
    }
    const tw = gsap.to(cur.current, {
      v: value,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => {
        if (el.current) el.current.textContent = money(cur.current.v, code);
      },
    });
    return () => {
      tw.kill();
    };
  }, [value, code]);
  return (
    <span ref={el} className={className} title={moneyHint(value, code)}>
      {money(value, code)}
    </span>
  );
}
