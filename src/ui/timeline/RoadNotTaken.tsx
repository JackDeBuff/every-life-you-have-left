/**
 * "Road not taken" (owner's design, Sat Nov 7): click a past fork ◆ to see the question, the
 * answer you chose and where it led you, and, for every other answer, who you'd be today: at the
 * playhead's age, not at the branch's newest snapshot (which runs up to 10 years ahead).
 *
 * Branch years are coarse (the fork year, then every 5 years), so "today" is the snapshot nearest
 * the playhead; when its age isn't today's, the line says so ("at 30 you'd be…").
 */
import * as Popover from "@radix-ui/react-popover";
import { useState } from "react";
import type { Branch, Decision, DecisionOption, SimYear } from "../../../shared/sim";
import { moneyHint, moneyShort, ROMAN, useCurrency } from "../format";
import { Icon } from "../icons";
import { useSim } from "../session";

const HINT_KEY = "elyl.forkHintSeen";

/** The snapshot nearest `year` (ties go to the past: never show the future when today is as close). */
export function snapshotNear(years: SimYear[], year: number): SimYear | null {
  let best: SimYear | null = null;
  for (const y of years) {
    if (!best) best = y;
    else {
      const d = Math.abs(y.year - year);
      const bd = Math.abs(best.year - year);
      if (d < bd || (d === bd && y.year <= year)) best = y;
    }
  }
  return best;
}

/** The last snapshot at or before `year` (what a faded life last looked like). */
const lastSeen = (years: SimYear[], year: number): SimYear | null => years.filter((y) => y.year <= year).at(-1) ?? years[0] ?? null;

const city = (place: string) => place.split(",")[0]?.trim() || place;

/** "Singapore · Senior analyst · $42k net worth": only the facts that read simply. */
export function Facts({ y }: { y: SimYear }) {
  const cur = useCurrency();
  const work = y.life?.work?.trim();
  return (
    <p className="rn-facts">
      {city(y.place)}
      {work && work.length <= 40 ? ` · ${work}` : ""}
      {" · "}
      <span className="data" title={moneyHint(y.money.netWorth, cur)}>
        {moneyShort(y.money.netWorth, cur)}
      </span>{" "}
      net worth
    </p>
  );
}

/** Where a life stands near `year`: one summary line + facts, with the age stated when it isn't today's. */
export function LifeToday({ years, year, age, lead }: { years: SimYear[]; year: number; age: number; lead: (atAge: number | null) => string }) {
  const y = snapshotNear(years, year);
  if (!y) return <p className="rn-line muted">Just split off. You'll see it in the next "Meanwhile".</p>;
  return (
    <>
      <p className="rn-line">
        <span className="rn-lead">{lead(y.age === age ? null : y.age)}</span> {y.summary}
      </p>
      <Facts y={y} />
    </>
  );
}

type Row =
  | { kind: "running"; o: DecisionOption; b: Branch; numeral: string }
  | { kind: "faded"; o: DecisionOption; b: Branch }
  | { kind: "pending"; o: DecisionOption }
  | { kind: "unfollowed"; o: DecisionOption };

const STATE: Record<Row["kind"], string> = { running: "Still running", faded: "Faded out", pending: "Being written", unfollowed: "Not followed" };

const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

export function RoadNotTaken({ d, left, onClosed }: { d: Decision; left: number; onClosed: () => void }) {
  const [hint, setHint] = useState(false);
  if (d.status === "pending") return null;
  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) return;
        // The one-line explainer shows the first time a fork is opened in this browser.
        try {
          setHint(localStorage.getItem(HINT_KEY) !== "1");
          localStorage.setItem(HINT_KEY, "1");
        } catch {
          setHint(true);
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          className="tl-fork-hit"
          style={{ left: left - 12 }}
          data-tip={`Big fork at ${d.age}: see the roads not taken`}
          aria-label={`Big fork at ${d.age}, ${d.year}. Show what you chose and the roads not taken.`}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="pop rn"
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={`rn-q-${d.id}`}
          onCloseAutoFocus={(e) => {
            if (document.querySelector(".pane.right .dcard")) {
              e.preventDefault();
              onClosed();
            }
          }}
        >
          <RoadBody d={d} hint={hint} />
          <Popover.Close className="pop-x" aria-label="Close">
            <Icon name="x" size={14} />
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function RoadBody({ d, hint }: { d: Decision; hint: boolean }) {
  const answers = useSim((s) => s.answers);
  const years = useSim((s) => s.years);
  const allBranches = useSim((s) => s.branches);
  const ph = useSim((s) => s.playhead);
  const answer = answers.find((a) => a.decisionId === d.id);
  const chosen = answer?.optionId ? d.options.find((o) => o.id === answer.optionId) ?? null : null;
  const ownWords = !chosen && answer?.text?.trim() ? answer.text.trim() : null;
  const active = allBranches.filter((b) => b.status === "active").map((b) => b.id);
  const mine = allBranches.filter((b) => b.forkDecisionId === d.id);
  // Branches are written right after the answer: a fork you just passed may not have them yet.
  const justNow = mine.length === 0 && ph.year - d.year <= 1;

  const rows: Row[] = d.options
    .filter((o) => o.id !== chosen?.id)
    .map((o): Row => {
      const b = mine.find((x) => x.optionId === o.id);
      if (!b) return justNow ? { kind: "pending", o } : { kind: "unfollowed", o };
      if (b.status === "retired") return { kind: "faded", o, b };
      return { kind: "running", o, b, numeral: ROMAN[Math.max(0, active.indexOf(b.id))] ?? "" };
    });
  const order = { running: 0, pending: 1, faded: 2, unfollowed: 3 } as const;
  rows.sort((a, b) => order[a.kind] - order[b.kind]);

  const myYears = years.filter((y) => y.year <= ph.year);
  const q = d.prompt.replace(/^It's \d{4}\.\s*/, "");
  const nRunning = rows.filter((r) => r.kind === "running").length;

  return (
    <>
      {hint && (
        <p className="rn-hint">
          <Icon name="info" size={14} /> Each fork leaves the other answers running as lives you didn't live.
        </p>
      )}
      <p className="label">
        Fork at {d.age} · {d.year}
      </p>
      <p className="rn-q" id={`rn-q-${d.id}`}>
        {q}
      </p>

      <section className="rn-you">
        <p className="rn-chose">
          <span className="rn-tag rn-tag-you">You chose</span>
          <span className="rn-opt">{chosen ? chosen.label : ownWords ? `In your own words: "${short(ownWords, 70)}"` : "You let it pass"}</span>
        </p>
        <LifeToday years={myYears} year={ph.year} age={ph.age} lead={(at) => (at === null ? `Today, at ${ph.age}:` : `At ${at}:`)} />
      </section>

      {rows.length > 0 && (
        <>
          <p className="label rn-others-h">
            The other answers{nRunning ? ` · ${nRunning} still running` : ""}
          </p>
          <ul className="rn-list">
            {rows.map((r) => (
              <li key={r.o.id} className="rn-row" data-kind={r.kind}>
                <div className="rn-head">
                  <p className="rn-if">
                    If you'd chosen <span className="rn-opt">{r.o.label}</span>
                  </p>
                  <span className="rn-tag rn-tag-state">{STATE[r.kind]}{r.kind === "running" && r.numeral ? ` · ${r.numeral}` : ""}</span>
                </div>
                {r.kind === "running" && (
                  <LifeToday years={r.b.years} year={ph.year} age={ph.age} lead={(at) => (at === null ? `Today you'd be ${ph.age}:` : `At ${at}:`)} />
                )}
                {r.kind === "faded" && <Faded b={r.b} year={ph.year} />}
                {r.kind === "pending" && <p className="rn-line muted">This life is still being written. Look again in a moment.</p>}
                {r.kind === "unfollowed" && (
                  <p className="rn-line muted">Only three other lives run at once, and this one stayed too close to a life already running.</p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Faded({ b, year }: { b: Branch; year: number }) {
  const y = lastSeen(b.years, year);
  const right = !y || y.age <= b.forkAge;
  return (
    <p className="rn-line muted">
      {right ? "This path faded out right away" : `This path faded out after ${y!.age}`}: it ran too close to another of your lives, so we stopped following it.
    </p>
  );
}

/** Used by the "other lives" list: a running life today. */
export function RunningLife({ b, numeral }: { b: Branch; numeral: string }) {
  const ph = useSim((s) => s.playhead);
  const d = useSim((s) => s.decisions.find((x) => x.id === b.forkDecisionId));
  const opt = d?.options.find((o) => o.id === b.optionId);
  return (
    <li className="rn-row" data-kind="running">
      <p className="rn-if">
        <span className="rn-tag rn-tag-state rn-num">{numeral}</span><span className="rn-opt">{b.title}</span>
      </p>
      <p className="rn-from">
        Split off at {b.forkAge}
        {opt ? `, when you didn't pick "${opt.label}"` : ""}
      </p>
      <LifeToday years={b.years} year={ph.year} age={ph.age} lead={(at) => (at === null ? `Today, at ${ph.age}:` : `At ${at}:`)} />
    </li>
  );
}
