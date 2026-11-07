/** Decisions: every card in order (the warm-up first), with why-asking, the four options, the answer and timing. */
import { useState } from "react";
import type { TabProps } from "./SessionDetail";
import { clock, dur, keyOf, OPTION_KEYS, type DecisionRow, type SessionView } from "./model";
import { chosenTitle, domainLabel } from "./present";
import { decisionReport } from "./report";
import { Chip, CopyButton, Empty, Flags, Voice } from "./ui";

type Filter = "all" | "warm" | "big" | "small" | "typed" | "flagged";

export function DecisionsTab({ v, jump, openCheck }: TabProps) {
  const [filter, setFilter] = useState<Filter>("all");
  if (!v.rows.length) return <Empty>No decisions yet.</Empty>;
  const flagged = (r: DecisionRow) => (v.violationsAt.get(`d-${r.id}`)?.length ?? 0) > 0;
  const rows = v.rows.filter((r) =>
    filter === "all" ? true : filter === "warm" ? r.kind === "warm" : filter === "big" ? r.kind === "big" : filter === "small" ? r.kind === "small" : filter === "typed" ? !!r.answer?.text : flagged(r),
  );
  const count = (f: Filter) => v.rows.filter((r) => (f === "warm" ? r.kind === "warm" : f === "big" ? r.kind === "big" : f === "small" ? r.kind === "small" : f === "typed" ? !!r.answer?.text : f === "flagged" ? flagged(r) : true)).length;
  return (
    <div className="adm-decisions">
      <div className="adm-toolbar meta">
        <div className="adm-seg" role="group" aria-label="Show">
          {(["all", "warm", "big", "small", "typed", "flagged"] as Filter[]).map((f) => (
            <button key={f} type="button" data-on={filter === f} onClick={() => setFilter(f)}>
              {f === "warm" ? "warm-up" : f === "typed" ? "own words" : f === "flagged" ? "with checks" : f} <span className="faint">{count(f)}</span>
            </button>
          ))}
        </div>
        <span className="faint">Timing: written = when the engine wrote the card (D1); answered = when the answer arrived; gap = since the answer before it.</span>
      </div>
      {rows.map((r) => (
        <DecisionCard key={r.id} v={v} r={r} jump={jump} openCheck={openCheck} />
      ))}
    </div>
  );
}

function DecisionCard({ v, r, jump, openCheck }: { v: SessionView; r: DecisionRow } & Pick<TabProps, "jump" | "openCheck">) {
  const why = r.whyQuoteId ? v.quotes.get(r.whyQuoteId) : undefined;
  const said = r.answer?.quoteId ? v.quotes.get(r.answer.quoteId) : undefined;
  const branches = v.branchesOf.get(r.id) ?? [];
  const covered = r.warm?.covered;
  return (
    <article className="adm-dcard" id={`d-${r.id}`} data-kind={r.kind} data-status={r.status}>
      <div className="adm-dchead">
        <Chip tone={r.kind === "big" ? "sun" : r.kind === "warm" ? "info" : "quiet"}>{r.kind === "warm" ? "warm-up" : r.kind}</Chip>
        <span className="adm-did">{r.id}</span>
        {r.year !== null && (
          <button type="button" className="adm-linkbtn meta" onClick={() => jump("life", `y-${r.year}`)}>
            {r.year} · age {r.age}
          </button>
        )}
        <Chip tone={r.status === "answered" ? "quiet" : r.status === "slid" || r.status === "skipped" ? "mixed" : r.status === "covered" ? "info" : "sun"}>{r.status}</Chip>
        {r.decision?.domains.map((d) => (
          <Chip key={d} tone="quiet">
            {domainLabel(d)}
          </Chip>
        ))}
        {r.warm?.personal && <Chip tone="info">personalized</Chip>}
        <span className="adm-timing meta faint">
          {r.written && <>written {clock(r.written)} · </>}
          {r.answer?.at ? <>answered {clock(r.answer.at)}</> : null}
          {r.gapMs !== null && <> · gap {dur(r.gapMs)}</>}
        </span>
        <CopyButton compact text={() => decisionReport(v, r)} title="Copy bug report: this decision" />
      </div>
      <h3 className="adm-prompt">{r.prompt}</h3>
      {r.whyAsking && (
        <p className="adm-whyask meta">
          <span className="label">Why I'm asking</span> {r.whyAsking}
          {r.whyQuoteId && (
            <span className="adm-cite">
              {" "}
              {why ? <Voice>“{why.quote.text}”</Voice> : <span className="adm-bad">quote {r.whyQuoteId} not found</span>} <span className="faint">({r.whyQuoteId}{why ? ` · ${why.from}` : ""})</span>
            </span>
          )}
        </p>
      )}
      {covered && (
        <p className="meta">
          <span className="label">Covered by</span> {covered.by} ({Math.round(covered.confidence * 100)}%): <Voice>{covered.evidence}</Voice>
        </p>
      )}
      {r.options.length > 0 && (
        <ol className="adm-opts">
          {r.options.map((o, i) => {
            const on = r.answer?.optionId === o.id;
            const b = branches.find((x) => x.optionId === o.id);
            return (
              <li key={o.id} data-on={on}>
                <span className="kbd">{OPTION_KEYS[i]}</span>
                <div>
                  <div className="adm-olabel">
                    {o.label}
                    {o.branchTitle && <span className="adm-btitle"> · {o.branchTitle}</span>}
                  </div>
                  {o.hint && <div className="faint meta">{o.hint}</div>}
                </div>
                <div className="adm-oside meta">
                  {on && <Chip tone="sun">tapped</Chip>}
                  {b && (
                    <button type="button" className="adm-linkbtn" onClick={() => jump("lives", `b-${b.id}`)}>
                      {b.status === "active" ? "other life" : "retired life"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="adm-answer">
        <span className="label">Answer</span>
        {!r.answer ? (
          <span className="faint">{r.status === "pending" || r.status === "queued" || r.status === "asking" ? "not answered yet" : r.status === "covered" ? "never asked (covered)" : "none"}</span>
        ) : (
          <>
            {r.answer.slid || r.status === "slid" ? <Chip tone="mixed">let it slide</Chip> : null}
            {r.answer.optionId && (
              <span>
                tapped <b>{keyOf(r.answer.optionId, r.options)}</b> {r.options.find((o) => o.id === r.answer!.optionId)?.label}
              </span>
            )}
            {r.answer.text && <Voice>“{r.answer.text}”</Voice>}
            <Chip tone="quiet">{r.answer.via}</Chip>
            {r.answer.quoteId && (
              <span className="faint meta">
                → quote {r.answer.quoteId}
                {said ? ` · ${said.from}` : ""}
              </span>
            )}
            {r.kind === "big" && r.status === "answered" && <span className="meta">→ {chosenTitle(r)}</span>}
          </>
        )}
      </div>
      {r.placeholder && <p className="faint meta">Say-more placeholder: {r.placeholder}</p>}
      <Flags items={v.violationsAt.get(`d-${r.id}`)} onOpen={openCheck} />
    </article>
  );
}
