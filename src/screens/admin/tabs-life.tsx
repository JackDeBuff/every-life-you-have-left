/** Life (the chosen life, year by year) and Other lives (the branches). */
import { useState } from "react";
import type { LifeEvent } from "../../../shared/schema";
import type { Branch, SimYear } from "../../../shared/sim";
import type { TabProps } from "./SessionDetail";
import { keyOf, money, moneyTitle, OPTION_KEYS, ROMAN, type SessionView } from "./model";
import { chosenTitle, domainLabel, familyOf, rateLine, sceneChips } from "./present";
import { branchYearReport, eventReport, yearReport } from "./report";
import { Chip, CopyButton, Empty, Flags, Voice } from "./ui";

export function LifeTab({ v, jump, openCheck }: TabProps) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [showScene, setShowScene] = useState(true);
  const [showLog, setShowLog] = useState(false);
  if (!v.years.length) return <Empty>No years written yet{v.st.phase === "warmup" ? " (still in the warm-up)" : ""}.</Empty>;
  const flagged = (y: SimYear) => (v.violationsAt.get(`y-${y.year}`)?.length ?? 0) + y.events.reduce((n, e) => n + (v.violationsAt.get(`e-${e.id}`)?.length ?? 0), 0);
  const years = onlyFlagged ? v.years.filter((y) => flagged(y) > 0) : v.years;
  return (
    <div className="adm-life">
      <div className="adm-yearstrip" aria-label="Jump to a year">
        {v.years.map((y) => (
          <button
            key={y.year}
            type="button"
            title={`${y.year} · age ${y.age}${v.forkYears.has(y.year) ? " · fork" : ""}${flagged(y) ? ` · ${flagged(y)} checks` : ""}`}
            data-fork={v.forkYears.has(y.year)}
            data-flag={flagged(y) > 0}
            data-buffered={y.year > v.playheadYear}
            onClick={() => jump("life", `y-${y.year}`)}
          >
            {y.age}
          </button>
        ))}
      </div>
      <div className="adm-toolbar meta">
        <label className="adm-check">
          <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} /> Only years with check results
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={showScene} onChange={(e) => setShowScene(e.target.checked)} /> 3D scene
        </label>
        <label className="adm-check">
          <input type="checkbox" checked={showLog} onChange={(e) => setShowLog(e.target.checked)} /> Life log lines
        </label>
        <span className="faint">
          {v.years.filter((y) => y.year <= v.playheadYear).length} played · buffered to {v.years.at(-1)?.year} · money in {v.currency} (hover for ≈ $)
        </span>
      </div>
      {years.map((y) => (
        <YearBlock key={y.year} v={v} y={y} showScene={showScene} showLog={showLog} jump={jump} openCheck={openCheck} />
      ))}
    </div>
  );
}

function YearBlock({ v, y, showScene, showLog, jump, openCheck }: { v: SessionView; y: SimYear; showScene: boolean; showLog: boolean } & Pick<TabProps, "jump" | "openCheck">) {
  const life = y.life;
  const fork = v.rows.find((r) => r.kind === "big" && r.year === y.year);
  const decs = v.rows.filter((r) => r.kind === "small" && r.year === y.year);
  const log = v.st.log.filter((l) => l.year === y.year);
  const buffered = y.year > v.playheadYear;
  return (
    <article className="adm-year" id={`y-${y.year}`} data-fork={!!fork} data-buffered={buffered}>
      <div className="adm-yhead">
        <div className="adm-ynum">
          <b>{y.year}</b>
          <span>age {y.age}</span>
        </div>
        <div className="adm-ymeta">
          <span>{y.place}</span>
          <span className="sep">·</span>
          <span>{life?.work ?? <span className="faint">(no work line)</span>}</span>
          <span className="sep">·</span>
          <span className="data" title={moneyTitle(y.money.income, v.currency)}>
            income {money(y.money.income, v.currency)}
          </span>
          <span className="sep">·</span>
          <span className="data" title={moneyTitle(y.money.netWorth, v.currency)}>
            net worth {money(y.money.netWorth, v.currency)}
          </span>
        </div>
        <div className="adm-yact">
          {buffered && <Chip tone="info">buffered</Chip>}
          {fork && <Chip tone="sun">fork</Chip>}
          {decs.length > 0 && (
            <button type="button" className="adm-linkbtn meta" onClick={() => jump("decisions", `d-${decs[0]!.id}`)}>
              {decs.length} small
            </button>
          )}
          <CopyButton compact text={() => yearReport(v, y)} title={`Copy bug report: ${y.year}`} />
        </div>
      </div>
      <p className="adm-summary">{y.summary}</p>
      {life && (
        <div className="adm-people meta">
          <span className="label">People</span>
          {life.people.length ? (
            life.people.map((p) => (
              <Chip key={`${p.role}-${p.name}`} tone="quiet">
                {p.name} <span className="faint">({p.relation}{p.age !== null ? `, ${p.age}` : ""})</span>
              </Chip>
            ))
          ) : (
            <span className="faint">no one listed</span>
          )}
          {life.ch.map((c) => (
            <Chip key={c} tone={c.startsWith("+") ? "up" : c.startsWith("-") ? "down" : "mixed"}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      {y.events.length > 0 && (
        <ul className="adm-events">
          {y.events.map((e) => (
            <EventRow key={e.id} v={v} y={y} e={e} openCheck={openCheck} />
          ))}
        </ul>
      )}
      {showScene && (
        <div className="adm-scene meta" title="SceneSpec for the 3D world">
          <span className="label">Scene</span>
          {sceneChips(y.scene).map((c, i) => (
            <span key={i} className="adm-scenechip">
              {c}
            </span>
          ))}
        </div>
      )}
      {fork && <ForkBlock v={v} id={fork.id} jump={jump} />}
      {showLog && log.length > 0 && (
        <ul className="adm-loglines meta">
          {log.map((l) => (
            <li key={l.id}>
              <span className="label">{l.kind}</span> {l.text}
            </li>
          ))}
        </ul>
      )}
      <Flags items={v.violationsAt.get(`y-${y.year}`)?.filter((x) => !x.at.eventId)} onOpen={openCheck} />
    </article>
  );
}

function EventRow({ v, y, e, openCheck }: { v: SessionView; y: SimYear; e: LifeEvent; openCheck: TabProps["openCheck"] }) {
  const q = e.cause ? v.quotes.get(e.cause.quoteId) : undefined;
  const rate = rateLine(e.baseRate?.statId);
  return (
    <li id={`e-${e.id}`} className={`adm-event fam-${familyOf(e.domain)}`} data-tone={e.tone}>
      <div className="adm-ehead">
        <span className="adm-tick" aria-hidden="true" />
        <b>{e.title}</b>
        <Chip tone="quiet">{domainLabel(e.domain)}</Chip>
        <Chip tone="quiet">{e.category}</Chip>
        {e.isTurningPoint && <Chip tone="sun">turning point</Chip>}
        <Chip tone={e.tone}>{e.tone}</Chip>
        <span className="adm-eid faint">{e.id}</span>
        <CopyButton compact text={() => eventReport(v, y, e)} title="Copy bug report: this event" />
      </div>
      <p>{e.narrative}</p>
      {(e.cause || rate) && (
        <div className="adm-why meta">
          <span className="label">Why</span>
          {e.cause && (
            <span>
              {q ? <Voice>“{q.quote.text}”</Voice> : <span className="adm-bad">quote {e.cause.quoteId} not found</span>}{" "}
              <span className="faint">
                ({e.cause.quoteId}
                {q ? ` · ${q.from}` : ""})
              </span>{" "}
              — {e.cause.reason}
            </span>
          )}
          {rate && (
            <span className="adm-rate">
              base rate <b>{rate.id}</b>: {rate.display} <span className="faint">{rate.source}</span>
            </span>
          )}
        </div>
      )}
      <Flags items={v.violationsAt.get(`e-${e.id}`)} onOpen={openCheck} />
    </li>
  );
}

/** A fork's year: the option taken against the three that became other lives. */
function ForkBlock({ v, id, jump }: { v: SessionView; id: string; jump: TabProps["jump"] }) {
  const r = v.rowOf.get(id)!;
  const branches = v.branchesOf.get(id) ?? [];
  const chosen = r.answer?.optionId ?? null;
  return (
    <div className="adm-fork">
      <div className="adm-forkhead">
        <span className="label">Fork</span>
        <button type="button" className="adm-linkbtn" onClick={() => jump("decisions", `d-${id}`)}>
          {r.prompt}
        </button>
        <Chip tone={r.status === "answered" ? "quiet" : "sun"}>{r.status}</Chip>
      </div>
      <ol className="adm-forkopts">
        {r.options.map((o, i) => {
          const b = branches.find((x) => x.optionId === o.id);
          const on = o.id === chosen;
          return (
            <li key={o.id} data-on={on}>
              <span className="kbd">{OPTION_KEYS[i]}</span>
              <span className="adm-otitle">{o.branchTitle ?? o.label}</span>
              <span className="faint">{o.branchTitle ? o.label : ""}</span>
              {on ? (
                <Chip tone="sun">chosen</Chip>
              ) : b ? (
                <button type="button" className="adm-linkbtn meta" onClick={() => jump("lives", `b-${b.id}`)}>
                  {b.status === "active" ? "keeps running" : "retired"} · {b.id}
                </button>
              ) : (
                <span className="faint meta">{r.status === "answered" ? "no branch" : ""}</span>
              )}
            </li>
          );
        })}
      </ol>
      {r.answer && !chosen && r.answer.text && (
        <p className="meta">
          Their own path: <Voice>“{r.answer.text}”</Voice>
          {branches.length ? <span className="faint"> · all four options became other lives</span> : null}
        </p>
      )}
      {r.answer?.text && chosen && (
        <p className="meta">
          Said with it ({keyOf(chosen, r.options)}): <Voice>“{r.answer.text}”</Voice>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

export function LivesTab({ v, jump, openCheck }: TabProps) {
  const bs = [...v.st.branches].sort((a, b) => (a.status === b.status ? a.forkYear - b.forkYear : a.status === "active" ? -1 : 1));
  if (!bs.length) return <Empty>No other lives yet (they start at the first fork).</Empty>;
  const ending = v.st.ending;
  let n = 0;
  return (
    <div className="adm-lives">
      {bs.map((b) => {
        const r = v.rowOf.get(b.forkDecisionId);
        const opt = r?.options.find((o) => o.id === b.optionId);
        const numeral = b.status === "active" ? ROMAN[n++] : null;
        return (
          <article key={b.id} id={`b-${b.id}`} className="adm-branch" data-status={b.status}>
            <header>
              <h3>
                {numeral && <span className="adm-numeral">{numeral}</span>}
                {b.title}
              </h3>
              <Chip tone={b.status === "active" ? "sun" : "quiet"}>{b.status}</Chip>
              <span className="meta faint">
                {b.id} · divergence {b.divergence.toFixed(2)}
              </span>
            </header>
            <p className="meta">
              Forked at {b.forkAge} ({b.forkYear}) from{" "}
              <button type="button" className="adm-linkbtn" onClick={() => jump("decisions", `d-${b.forkDecisionId}`)}>
                {r ? `“${r.prompt}”` : b.forkDecisionId}
              </button>{" "}
              · option {keyOf(b.optionId, r?.options ?? [])}: {opt?.label ?? b.optionId}
              {r?.status === "answered" ? <span className="faint"> · you chose {chosenTitle(r)}</span> : null}
            </p>
            {(ending?.branchVerdicts?.[b.id] || b.verdictAtEnd) && (
              <p className="adm-verdict">
                <span className="label">Verdict</span> {ending?.branchVerdicts?.[b.id] ?? b.verdictAtEnd}
              </p>
            )}
            {ending?.fiveYear?.[b.id] && (
              <p className="meta">
                <span className="label">Five-year answer</span> <Voice>{ending.fiveYear[b.id]}</Voice>
              </p>
            )}
            {ending?.people?.[b.id] && (
              <p className="meta">
                <span className="label">People at the end</span> {ending.people[b.id]}
              </p>
            )}
            <BranchYears v={v} b={b} />
            <Flags items={v.violationsAt.get(`b-${b.id}`)} onOpen={openCheck} />
          </article>
        );
      })}
    </div>
  );
}

function BranchYears({ v, b }: { v: SessionView; b: Branch }) {
  return (
    <div className="adm-tablewrap">
      <table className="adm-table adm-table-tight">
        <thead>
          <tr>
            <th className="num">Year</th>
            <th className="num">Age</th>
            <th>Place · work</th>
            <th className="num">Income</th>
            <th className="num">Net worth</th>
            <th>Summary and events</th>
            <th aria-label="Copy" />
          </tr>
        </thead>
        <tbody>
          {b.years.map((y) => (
            <tr key={y.year}>
              <td className="num">{y.year}</td>
              <td className="num">{y.age}</td>
              <td>
                {y.place}
                <div className="faint">{y.life?.work ?? ""}</div>
              </td>
              <td className="num" title={moneyTitle(y.money.income, v.currency)}>
                {money(y.money.income, v.currency, true)}
              </td>
              <td className="num" title={moneyTitle(y.money.netWorth, v.currency)}>
                {money(y.money.netWorth, v.currency, true)}
              </td>
              <td>
                {y.summary}
                {y.events.length > 0 && <div className="faint">{y.events.map((e) => `${e.isTurningPoint ? "TP: " : ""}${e.title}`).join(" · ")}</div>}
                {(y.life?.people.length ?? 0) > 0 && <div className="faint">{y.life!.people.map((p) => `${p.name}${p.age !== null ? ` ${p.age}` : ""}`).join(", ")}</div>}
              </td>
              <td>
                <CopyButton compact text={() => branchYearReport(v, b, y)} title="Copy bug report: this branch year" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

