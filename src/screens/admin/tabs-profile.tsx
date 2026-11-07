/** Profile: facts, quotes (id + where each came from), people, money, plans, worries, seeds, know-me. */
import { DOMAIN_KEYS } from "../../../shared/domains";
import { TWIN_THRESHOLD } from "../../../shared/schema";
import type { TabProps } from "./SessionDetail";
import { money, moneyTitle } from "./model";
import { domainLabel, pct } from "./present";
import { Chip, Empty, KV, RawJson, Section, Voice } from "./ui";

export function ProfileTab({ v }: TabProps) {
  const p = v.st.profile;
  if (!p) return <Empty>No profile yet.</Empty>;
  const start = v.detail.session.start;
  const ids = (xs: string[]) => (xs.length ? <span className="faint">{xs.join(", ")}</span> : <span className="faint">—</span>);
  const m = p.money;
  return (
    <div className="adm-profile">
      <div className="adm-cols">
        <Section title="Person">
          <KV
            rows={[
              ["Name", p.firstName],
              ["Age · born", `${p.age} · ${p.birthYear}`],
              ["Gender", p.gender ?? "not set (they/them)"],
              ["Place", [p.city, p.region, p.country].filter(Boolean).join(", ")],
              ["Display currency", `${v.currency}${p.currency ? " (their pick)" : " (from the country)"}`],
              ["Years", `${p.startYear} → age ${p.endAge}`],
              ["Profile version", `v${p.profileVersion} · ${p.updatedAt}`],
              ["Know-me", `${p.knowMeScore} (${p.knowMeScore >= TWIN_THRESHOLD ? "twin chat" : "letters"}, twin at ${TWIN_THRESHOLD})`],
            ]}
          />
        </Section>
        <Section title="Start screen">
          {start ? (
            <KV
              rows={[
                ["Line", start.line ? <Voice>“{start.line}”</Voice> : <span className="faint">(nothing typed)</span>],
                ["Via", start.via],
                ["Speed", start.speed],
                ["Selfie", start.hasSelfie ? "yes" : "no"],
                ["Look", start.appearance ? Object.entries(start.appearance).filter(([, x]) => x !== null).map(([k, x]) => `${k}: ${String(x)}`).join(" · ") || "—" : "—"],
              ]}
            />
          ) : (
            <Empty>Start input not mirrored.</Empty>
          )}
        </Section>
        <Section title="Money (profile)">
          <KV
            rows={[
              ["Feel", m.feel],
              ["Income / yr", <span title={moneyTitle(m.incomeUsd, v.currency)}>{money(m.incomeUsd, v.currency)}</span>],
              ["Debt", <span title={moneyTitle(m.debtUsd, v.currency)}>{money(m.debtUsd, v.currency)}{m.debtKind ? ` (${m.debtKind})` : ""}</span>],
              ["Savings", <span title={moneyTitle(m.savingsUsd, v.currency)}>{money(m.savingsUsd, v.currency)}</span>],
              ["Supports family", m.supportsFamily ? "yes" : "no"],
              ["Guessed", m.assumed ? "yes (assumed)" : "no (stated)"],
            ]}
          />
        </Section>
      </div>

      <Section title={`Quotes (${p.quotes.length})`}>
        <table className="adm-table adm-table-tight">
          <thead>
            <tr>
              <th>Id</th>
              <th>From</th>
              <th>Their words</th>
              <th>Short form</th>
            </tr>
          </thead>
          <tbody>
            {p.quotes.map((q) => (
              <tr key={q.id} id={`q-${q.id}`}>
                <td className="nowrap">{q.id}</td>
                <td className="nowrap">
                  <Chip tone="quiet">{v.quotes.get(q.id)?.from ?? q.source}</Chip>
                </td>
                <td>
                  <Voice>{q.text}</Voice>
                </td>
                <td className="faint">{q.shortForm ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`Facts (${p.facts.length})`}>
        <table className="adm-table adm-table-tight">
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
              <th>Value</th>
              <th>Source</th>
              <th className="num">Conf.</th>
              <th>Quotes</th>
            </tr>
          </thead>
          <tbody>
            {p.facts.map((f) => (
              <tr key={f.id}>
                <td className="faint">{f.key}</td>
                <td>{f.label}</td>
                <td>{f.value}</td>
                <td>{f.source}</td>
                <td className="num">{pct(f.confidence)}</td>
                <td>{ids(f.quoteIds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={`People (${p.people.length})`}>
        {p.people.length ? (
          <table className="adm-table adm-table-tight">
            <thead>
              <tr>
                <th>Label</th>
                <th>Relation</th>
                <th className="num">Born (age now)</th>
                <th className="num">Close</th>
                <th className="num">Influence</th>
                <th>Expects</th>
                <th>Quotes</th>
              </tr>
            </thead>
            <tbody>
              {p.people.map((x) => (
                <tr key={x.id}>
                  <td>{x.label}</td>
                  <td>{x.relation}</td>
                  <td className="num">{x.born ? `${x.born} (${p.startYear - x.born})` : "—"}</td>
                  <td className="num">{pct(x.closeness)}</td>
                  <td className="num">{pct(x.influence)}</td>
                  <td>{x.expectation ?? ""}</td>
                  <td>{ids(x.quoteIds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No people.</Empty>
        )}
      </Section>

      <div className="adm-cols">
        <Section title={`Planned events (${p.plans?.length ?? 0})`}>
          {p.plans?.length ? (
            <ul className="adm-list">
              {p.plans.map((x) => (
                <li key={x.id}>
                  <b>{x.year}</b>
                  {x.when ? ` (${x.when})` : ""} {x.text} <Chip tone="quiet">{x.kind}</Chip> <Chip tone={x.certainty === "fixed" ? "sun" : "quiet"}>{x.certainty}</Chip> {ids(x.quoteIds)}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>None.</Empty>
          )}
        </Section>
        <Section title="Worries (attention, not odds)">
          <dl className="adm-worries">
            {DOMAIN_KEYS.map((k) => (
              <div key={k} data-hi={p.worries[k] >= 0.5}>
                <dt>{domainLabel(k)}</dt>
                <dd className="data">{p.worries[k].toFixed(2)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <div className="adm-cols">
        <Section title={`Fears (${p.fears.length})`}>
          <ul className="adm-list">
            {p.fears.map((x) => (
              <li key={x.id}>
                {x.text} <Chip tone="quiet">{x.kind}</Chip> {ids(x.quoteIds)}
              </li>
            ))}
          </ul>
        </Section>
        <Section title={`Values (${p.values.length})`}>
          <ul className="adm-list">
            {p.values.map((x) => (
              <li key={x.id}>
                {x.label} <span className="faint">{x.weight.toFixed(2)}</span> {ids(x.quoteIds)}
              </li>
            ))}
          </ul>
        </Section>
        <Section title={`Constraints (${p.constraints.length})`}>
          <ul className="adm-list">
            {p.constraints.map((x) => (
              <li key={x.id}>
                {x.text} <Chip tone="quiet">{x.kind}</Chip> {ids(x.quoteIds)}
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Seeds (what each archetype grows from)">
        <KV rows={(["path", "leap", "careful", "unjudged"] as const).map((k) => [k, <span>{p.seeds[k].text} {ids(p.seeds[k].quoteIds)}</span>])} />
      </Section>
      {p.assumptions.length > 0 && (
        <Section title={`Assumptions (${p.assumptions.length})`}>
          <ul className="adm-list">
            {p.assumptions.map((a, i) => (
              <li key={i}>
                <b>{a.field}</b> = {a.value} <span className="faint">— {a.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <RawJson value={p} label="Profile JSON" />
    </div>
  );
}
