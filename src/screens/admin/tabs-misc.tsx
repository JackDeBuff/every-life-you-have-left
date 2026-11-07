/** Settings & nudges, chat & letters, uploads, portraits, ending. */
import { TWIN_THRESHOLD } from "../../../shared/schema";
import type { TabProps } from "./SessionDetail";
import { clock, dayTime, ROMAN, type SessionView } from "./model";
import { Chip, Empty, Flags, KV, Section, Voice } from "./ui";

const lifeName = (v: SessionView, life: string) => {
  if (life === "interviewer") return "Interviewer";
  if (life === "chosen") return "Your life";
  const b = v.st.branches.find((x) => x.id === life);
  const active = v.st.branches.filter((x) => x.status === "active");
  const i = b ? active.indexOf(b) : -1;
  return b ? `${i >= 0 ? `${ROMAN[i]} · ` : ""}${b.title}` : life;
};

export function SettingsTab({ v }: TabProps) {
  const st = v.st;
  const hist = v.detail.settings;
  const label = (id: string) => st.settings.find((s) => s.id === id)?.label ?? hist.flatMap((h) => h.settings).find((s) => s.id === id)?.label ?? id;
  return (
    <div className="adm-settings">
      <Section title={`Live settings now (${st.settings.length})`}>
        {st.settings.length ? (
          <table className="adm-table adm-table-tight">
            <thead>
              <tr>
                <th>Label</th>
                <th>Type</th>
                <th>Value</th>
                <th>Options / ends</th>
                <th>Hint</th>
                <th>From quotes</th>
              </tr>
            </thead>
            <tbody>
              {st.settings.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.label}
                    <div className="faint">{s.id}</div>
                  </td>
                  <td>{s.type}{s.multi ? " (multi)" : ""}</td>
                  <td>
                    <b>{s.options.find((o) => o.value === s.value)?.label ?? s.value}</b>
                  </td>
                  <td className="faint">{s.type === "slider" ? `${s.leftLabel ?? ""} ↔ ${s.rightLabel ?? ""}` : s.options.map((o) => o.label).join(" · ")}</td>
                  <td>{s.hint}</td>
                  <td className="faint">{s.sourceQuoteIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No settings (yet).</Empty>
        )}
      </Section>
      <Section title={`Nudges (${st.nudges.length})`}>
        {st.nudges.length ? (
          <ul className="adm-list">
            {st.nudges.map((n, i) => {
              const d1 = v.detail.nudges[i];
              return (
                <li key={i}>
                  <b>
                    {n.year} · {n.age}
                  </b>{" "}
                  {label(n.settingId)}: {n.from} → <b>{n.to}</b> {d1 ? <span className="faint">({clock(d1.created_at)})</span> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>They never moved a setting.</Empty>
        )}
      </Section>
      <Section title={`Every generated set (${hist.length}, D1)`}>
        {hist.length ? (
          <ol className="adm-list">
            {hist.map((h, i) => (
              <li key={i}>
                <b>{dayTime(h.at)}</b> {h.settings.map((s) => `${s.label} = ${s.options.find((o) => o.value === s.value)?.label ?? s.value}`).join(" · ")}
              </li>
            ))}
          </ol>
        ) : (
          <Empty>None mirrored.</Empty>
        )}
      </Section>
    </div>
  );
}

export function ChatTab({ v }: TabProps) {
  const chat = v.st.chat;
  if (!chat.length) return <Empty>No chat or letters in this session.</Empty>;
  const letters = (v.st.profile?.knowMeScore ?? 0) < TWIN_THRESHOLD;
  const groups = new Map<string, typeof chat>();
  for (const m of chat) {
    const k = `${m.life}|${m.age}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  return (
    <div className="adm-chat">
      <p className="meta faint">
        Future selves answer as {letters ? "letters" : "the twin chat"} (know-me {v.st.profile?.knowMeScore ?? 0}, twin at {TWIN_THRESHOLD}).
      </p>
      {[...groups.entries()].map(([k, ms]) => {
        const [life, age] = k.split("|");
        return (
          <Section key={k} title={`${lifeName(v, life!)}${life === "interviewer" ? "" : ` at ${age}`} · ${ms.length}`}>
            <ol className="adm-thread">
              {ms.map((m) => (
                <li key={m.id} data-role={m.role}>
                  <span className="label">{m.role === "user" ? "Them" : life === "interviewer" ? "Interviewer" : "Future self"}</span>
                  <span className="faint meta">{clock(m.at)}{m.done ? "" : " · streaming"}</span>
                  <p>{m.role === "user" ? <Voice>{m.text}</Voice> : m.text}</p>
                </li>
              ))}
            </ol>
          </Section>
        );
      })}
    </div>
  );
}

export function UploadsTab({ v }: TabProps) {
  const ups = v.detail.uploads;
  const files = v.detail.media.filter((m) => m.kind.startsWith("upload"));
  if (!ups.length && !files.length) return <Empty>No uploads.</Empty>;
  return (
    <div className="adm-uploads">
      {ups.map((u) => (
        <details key={u.id} className="adm-upload">
          <summary>
            <Chip tone="quiet">{u.kind}</Chip> <b>{u.filename ?? "(pasted text)"}</b> <span className="faint meta">{u.chars ?? 0} chars · {dayTime(u.created_at)} · {u.id}</span>
          </summary>
          <pre>{u.text ?? ""}</pre>
        </details>
      ))}
      {files.length > 0 && (
        <Section title="Raw files (R2)">
          <ul className="adm-list">
            {files.map((m) => (
              <li key={m.key}>
                <a href={m.url} target="_blank" rel="noreferrer">
                  {m.key.split("/").at(-1)}
                </a>{" "}
                <span className="faint">
                  {m.kind} · {dayTime(m.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function PortraitsTab({ v }: TabProps) {
  const ps = v.st.portraits;
  const media = v.detail.media;
  const tts = media.filter((m) => m.kind === "tts");
  const shown = new Set(ps.map((p) => p.url));
  const extra = media.filter((m) => (m.kind === "portrait" || m.kind === "selfie") && !shown.has(m.url));
  return (
    <div className="adm-portraits">
      {!ps.length && !extra.length && <Empty>No portraits (only made with a selfie or a chosen look).</Empty>}
      <div className="adm-pgrid">
        {ps.map((p) => {
          const m = media.find((x) => x.url === p.url);
          return (
            <figure key={p.url}>
              <img src={p.url} alt={`Portrait, band ${p.band}`} loading="lazy" />
              <figcaption className="meta">
                <b>{p.band === "now" ? "now" : `~${p.band}`}</b> · for age {p.forAge}
                {m?.model ? <span className="faint"> · {m.model}</span> : null}
              </figcaption>
            </figure>
          );
        })}
        {extra.map((m) => (
          <figure key={m.key}>
            <img src={m.url} alt={`${m.kind} ${m.band ?? ""}`} loading="lazy" />
            <figcaption className="meta">
              <b>{m.kind}</b> {m.band ?? ""} <span className="faint">· not in the session state · {m.model ?? ""}</span>
            </figcaption>
          </figure>
        ))}
      </div>
      {tts.length > 0 && (
        <Section title={`Read-aloud audio (${tts.length})`}>
          <ul className="adm-list">
            {tts.map((m) => (
              <li key={m.key}>
                <audio controls preload="none" src={m.url} /> <span className="faint meta">voice {m.band} · {m.model} · {dayTime(m.created_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function EndingTab({ v, openCheck }: TabProps) {
  const e = v.st.ending;
  if (!e) return <Empty>{v.st.phase === "ended" ? "Ended, but no ending is stored." : "Not at the end yet."}</Empty>;
  const lives = ["chosen", ...v.st.branches.filter((b) => b.status === "active").map((b) => b.id), ...Object.keys(e.fiveYear ?? {}).filter((k) => k !== "chosen" && !v.st.branches.some((b) => b.id === k && b.status === "active"))];
  return (
    <div className="adm-ending" id="ending">
      <Section title="Postcard and verdict">
        <KV
          rows={[
            ["Verdict (your life)", e.verdict],
            ["Postcard line", e.postcard ?? "—"],
            ["verdictAtEnd", v.st.verdictAtEnd ?? "—"],
          ]}
        />
      </Section>
      <Section title="Each life at the end">
        <table className="adm-table adm-table-tight">
          <thead>
            <tr>
              <th>Life</th>
              <th>Verdict</th>
              <th>Five-year answer</th>
              <th>People</th>
            </tr>
          </thead>
          <tbody>
            {[...new Set(lives)].map((id) => (
              <tr key={id}>
                <td className="nowrap">{lifeName(v, id)}</td>
                <td>{id === "chosen" ? e.verdict : e.branchVerdicts?.[id] ?? "—"}</td>
                <td>{e.fiveYear?.[id] ? <Voice>{e.fiveYear[id]}</Voice> : "—"}</td>
                <td className="faint">{e.people?.[id] ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Flags items={v.violationsAt.get("ending")} onOpen={openCheck} />
    </div>
  );
}
