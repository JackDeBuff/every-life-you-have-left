/** Health: model cost by purpose, engine errors and warnings, and the engine's code checks over this session. */
import { useMemo, useState } from "react";
import type { TabProps } from "./SessionDetail";
import { anchorFor, clock, cost } from "./model";
import { violationReport } from "./report";
import type { CheckLevel, Violation } from "./types";
import { AIcon, Chip, CopyButton, Empty, KV, LEVEL_LABEL, Section } from "./ui";

export function HealthTab({ v, checks, jump, focus }: TabProps & { focus: string | null }) {
  const st = v.st;
  const u = st.usage;
  const [level, setLevel] = useState<CheckLevel | "all">("all");
  const [group, setGroup] = useState<string>("all");
  const byPurpose = u ? Object.entries(u.byPurpose).sort((a, b) => b[1] - a[1]) : [];
  const detail = u?.detail ? Object.entries(u.detail).sort((a, b) => b[1].usd - a[1].usd) : [];
  const log = v.detail.engineLog;
  const shown = useMemo(() => (checks?.violations ?? []).filter((x) => (level === "all" || x.level === level) && (group === "all" || x.group === group)), [checks, level, group]);
  const where = (x: Violation) => {
    const parts = [x.at.year !== undefined ? `${x.at.year}${x.at.age !== undefined ? ` · ${x.at.age}` : ""}` : "", x.at.decisionId ?? "", x.at.eventId ?? "", x.at.branchId ?? ""].filter(Boolean);
    return parts.join(" · ") || x.at.tab;
  };
  return (
    <div className="adm-health">
      <div className="adm-cols">
        <Section title="Model cost">
          {u ? (
            <>
              <KV
                rows={[
                  ["Total", <b>{cost(u.usd)}</b>],
                  ["List price (no cache)", cost(u.listUsd)],
                  ["Calls", String(u.calls)],
                ]}
              />
              <table className="adm-table adm-table-tight">
                <thead>
                  <tr>
                    <th>Purpose</th>
                    <th className="num">Cost</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {byPurpose.map(([k, x]) => (
                    <tr key={k}>
                      <td>{k}</td>
                      <td className="num">{cost(x)}</td>
                      <td className="num">{u.usd ? `${Math.round((x / u.usd) * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <Empty>
              No spend recorded (
              {st.engine === "mock" ? "mock engine" : v.detail.source === "d1" ? "the tally lives in the session's Durable Object, which couldn't be read; this is the D1 copy" : "this session predates the tally"}).
            </Empty>
          )}
        </Section>
        <Section title="Engine">
          <KV
            rows={[
              ["Engine", st.engine],
              ["Phase", `${st.phase}${st.thinking ? " (thinking)" : ""}`],
              ["Buffered to", st.bufferedTo !== null ? String(st.bufferedTo) : "—"],
              ["Next fork", st.nextFork !== undefined && st.nextFork !== null ? String(st.nextFork) : "—"],
              ["Budgets left", `${st.budgets.smallLeft} small · ${st.budgets.bigLeft} big`],
              ["Last error", st.error ? <span className="adm-bad">{st.error}</span> : "none"],
              ["Safety", st.safety?.flagged ? <span className="adm-bad">flagged ({st.safety.kind})</span> : "clear"],
              ["Source", v.detail.source === "durable_object" ? `Durable Object${v.detail.liveAwake ? " (running)" : " (stored)"}` : `D1 copy (${v.detail.liveError ?? "no DO state"})`],
            ]}
          />
          {u?.smalls && (
            <p className="meta faint">
              Small cards: {u.smalls.served} served, {u.smalls.fromQueue} from the queue, wait {Math.round(u.smalls.waitMs / 1000)} s (max {Math.round(u.smalls.maxWaitMs / 1000)} s), {u.smalls.batches} batches, {u.smalls.discarded} discarded, {u.smalls.followUps} follow-ups, {u.smalls.folds} folds ({u.smalls.folded} answers)
            </p>
          )}
        </Section>
      </div>

      {detail.length > 0 && (
        <Section title="Calls by full purpose">
          <div className="adm-tablewrap">
            <table className="adm-table adm-table-tight">
              <thead>
                <tr>
                  <th>Purpose</th>
                  <th className="num">Calls</th>
                  <th className="num">Cost</th>
                  <th className="num">In tokens</th>
                  <th className="num">Cached</th>
                  <th className="num">Out + thought</th>
                </tr>
              </thead>
              <tbody>
                {detail.map(([k, x]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td className="num">{x.calls}</td>
                    <td className="num">{cost(x.usd)}</td>
                    <td className="num">{x.inTok.toLocaleString("en-US")}</td>
                    <td className="num">{x.cachedTok.toLocaleString("en-US")}</td>
                    <td className="num">{x.outTok.toLocaleString("en-US")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      <Section title={`Engine errors and warnings (${log.length})`}>
        {log.length ? (
          <div className="adm-tablewrap">
            <table className="adm-table adm-table-tight">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Code</th>
                  <th>Life · year</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {log.map((x, i) => (
                  <tr key={i} data-level={x.level}>
                    <td className="nowrap">{clock(x.created_at)}</td>
                    <td>
                      <Chip tone={x.level === "error" ? "error" : "warn"}>{x.level}</Chip>
                    </td>
                    <td className="nowrap">{x.code}</td>
                    <td className="nowrap">
                      {x.year !== null && x.life === "you" ? (
                        <button type="button" className="adm-linkbtn" onClick={() => jump("life", `y-${x.year}`)}>
                          your life · {x.year}
                        </button>
                      ) : x.life ? (
                        <button type="button" className="adm-linkbtn" onClick={() => jump("lives", `b-${x.life}`)}>
                          {x.life}
                          {x.year !== null ? ` · ${x.year}` : ""}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="adm-detailcell">{x.detail ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{st.error ? `None logged (the last error above predates the engine log).` : "None logged. Year-writer warnings (repaired / fallback / filler years) and errors are kept from migration 0004 on."}</Empty>
        )}
      </Section>

      <Section
        id="checks"
        title={checks ? `Code checks · ${checks.counts.error} errors · ${checks.counts.warn} warnings · ${checks.counts.info} info` : "Code checks"}
        aside={checks ? <span className="meta faint">{checks.scanned.years} years, {checks.scanned.decisions} cards, {checks.scanned.branches} other lives · {checks.ms} ms · {checks.source === "durable_object" ? "Durable Object" : "D1 copy"}</span> : null}
      >
        {!checks ? (
          <Empty>The checks didn't load.</Empty>
        ) : (
          <>
            <div className="adm-groups">
              {checks.groups.map((g) => (
                <button key={g.group} type="button" data-on={group === g.group} data-zero={g.count === 0} title={g.source} onClick={() => setGroup(group === g.group ? "all" : g.group)}>
                  <span className="adm-gcount" data-bad={g.count > 0}>
                    {g.count}
                  </span>
                  <span>{g.label}</span>
                </button>
              ))}
            </div>
            <div className="adm-toolbar meta">
              <div className="adm-seg" role="group" aria-label="Level">
                {(["all", "error", "warn", "info"] as const).map((l) => (
                  <button key={l} type="button" data-on={level === l} onClick={() => setLevel(l)}>
                    {l === "all" ? "all" : LEVEL_LABEL[l]} <span className="faint">{l === "all" ? checks.violations.length : checks.counts[l]}</span>
                  </button>
                ))}
              </div>
              {group !== "all" && (
                <button type="button" className="adm-linkbtn" onClick={() => setGroup("all")}>
                  <AIcon name="x" size={12} /> {group}
                </button>
              )}
            </div>
            {shown.length ? (
              <ol className="adm-violations">
                {shown.map((x) => (
                  <li key={x.id} id={`c-${x.id}`} data-level={x.level} data-focus={focus === x.id}>
                    <Chip tone={x.level === "error" ? "error" : x.level === "warn" ? "warn" : "info"}>{LEVEL_LABEL[x.level]}</Chip>
                    <span className="adm-vkind">
                      {x.group}:{x.kind}
                    </span>
                    <button type="button" className="adm-linkbtn adm-vwhere" onClick={() => jump(x.at.tab, anchorFor(x.at))}>
                      {where(x)}
                    </button>
                    <span className="adm-vmsg">
                      {x.msg}
                      {x.text && <span className="faint"> · “{x.text}”</span>}
                    </span>
                    <CopyButton compact text={() => violationReport(v, x)} title="Copy bug report: this check" />
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>{checks.violations.length ? "Nothing at this filter." : "Every check passes on this session."}</Empty>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
