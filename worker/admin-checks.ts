/**
 * GET /api/admin/session/:id/checks: the engine's own pure code checks, re-run over a stored session
 * (no model calls). What the generators use to repair a card or a year before it is shown
 * (worker/engine/consistency.ts, calendar.ts, ledger.ts, validate.ts) and what `npm run check:qa`
 * counts in a finished run (scripts/qa/live.ts), plus a few cheap sanity checks on the stored data.
 * Every violation says where it is (tab + year / decision / event / branch) so /admin can link to it.
 *
 * The checks see the session as it is stored now, so a card written ahead is checked against the
 * years written since; the same yardstick check:qa uses.
 */
import { isBaseRateId } from "../shared/baseRates";
import { displayCurrency } from "../shared/currency";
import type { Decision, SimYear } from "../shared/sim";
import type { AgentState } from "./agent/protocol";
import { chosenOf, ownShort } from "./engine/answers";
import { pastTimeIssues } from "./engine/calendar";
import { framingIssues, peopleIssues, similarity, stateIssues, type Issue } from "./engine/consistency";
import { bigCardIssues } from "./engine/decisions";
import { cityOf, forksTaken, lifeAt, lifeOf, type LifeNow } from "./engine/ledger";
import { bannedHits, clicheCount } from "./engine/validate";
import { moneyUnit } from "./engine/warmup";
import { PARENT_DEATH_RE } from "./engine/world";
import type { CheckAt, CheckGroup, CheckLevel, CheckTab, ChecksResult, Violation } from "./admin-types";

export type { CheckAt, CheckGroup, CheckLevel, CheckTab, ChecksResult, Violation } from "./admin-types";

const GROUPS: Omit<CheckGroup, "count">[] = [
  { group: "fork", label: "Big decisions against the life and every fork taken", source: "engine/decisions.ts bigCardIssues (consistency.ts forkIssues, peopleIssues; calendar.ts pastTimeIssues)" },
  { group: "small", label: "Small cards against the life (place, work, people, date, framing)", source: "consistency.ts stateIssues, peopleIssues, framingIssues; calendar.ts pastTimeIssues (as engine/smalls.ts)" },
  { group: "year.people", label: "Year text against the people ledger", source: "consistency.ts peopleIssues with the year's changes (as engine/years.ts)" },
  { group: "year.repeat", label: "Repeated lines (summary or turning point copied from a recent year)", source: "consistency.ts similarity (as engine/years.ts)" },
  { group: "year.date", label: "First-year text set in a month that has passed", source: "calendar.ts pastTimeIssues" },
  { group: "content", label: "Content rules: death, serious illness, accidents", source: "engine/validate.ts bannedHits (a parent's old-age death is allowed once, from 48)" },
  { group: "why", label: "The why thread: causes and base rates", source: "validate.ts rules: every turning point cites a real quote; base-rate ids exist" },
  { group: "ledger", label: "People over time (no one vanishes; at most one parent's death, logged)", source: "scripts/qa/live.ts (check:qa) over ledger.ts snapshots" },
  { group: "sequence", label: "Years and ages in order", source: "admin-checks.ts" },
  { group: "typed", label: "Typed fork answers: their own path, in their own words", source: "scripts/qa/live.ts (check:qa), engine/answers.ts" },
  { group: "decision", label: "Decision shape: four options, branch titles, cited quote", source: "shared/sim.ts contract, admin-checks.ts" },
  { group: "copy", label: "Pre-written copy in the wrong currency", source: "scripts/qa/live.ts (check:qa), engine/warmup.ts moneyUnit" },
  { group: "scene", label: "3D scene place against the year's place", source: "admin-checks.ts (ledger.ts cityOf)" },
  { group: "world", label: "World events (at most 2 per life)", source: "validate.ts rule" },
  { group: "money", label: "Money jumps with no event to explain them (heuristic)", source: "admin-checks.ts" },
  { group: "ending", label: "Ending: no ranking, no people who don't exist", source: "engine/extras.ts rules (peopleIssues against the end ledger)" },
  { group: "branch", label: "Other lives: content rules and the why thread", source: "validate.ts bannedHits, quote ids" },
];

const RANKING = /\b(best|better|worse|worst|happiest|richest|right choice|wrong choice|should have|most successful)\b/i;
const CLOSE_DEATH =
  /\b(partner|wife|husband|spouse|son|daughter|child|baby|kid|fianc\w*|girlfriend|boyfriend)\b[^.]{0,50}\b(die[sd]?|death|dead|funeral|pass(?:es|ed)? away|killed|widow\w*)\b|\bwidow\w*\b/i;
const MONEY_EVENTS = new Set(["career_move", "career_change", "job_loss", "burnout", "money_up", "money_down", "home", "move", "marriage", "divorce", "child", "caregiving"]);
const PEOPLE_ROLES = new Set(["partner", "child", "parent", "sibling"]);

const clip = (s: string, n = 220) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const issueLevel = (i: Issue): CheckLevel => (i.kind === "framing" || i.kind === "duplicate" ? "info" : "warn");

/** Run every check. `today` = when the session was played (the first year is "what's left of it"). */
export function runChecks(s: AgentState, opts: { today: Date; decisionTimes?: Record<string, string> }): ChecksResult {
  const out: Violation[] = [];
  const seen = new Set<string>();
  const add = (v: Omit<Violation, "id">) => {
    const key = `${v.group}|${v.kind}|${v.at.decisionId ?? ""}|${v.at.eventId ?? ""}|${v.at.year ?? ""}|${v.at.branchId ?? ""}|${v.msg}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...v, id: `c${out.length + 1}` });
  };
  const p = s.profile;
  const years = [...s.years].sort((a, b) => a.year - b.year);
  const empty: ChecksResult = { groups: GROUPS.map((g) => ({ ...g, count: 0 })), violations: [], counts: { error: 0, warn: 0, info: 0 }, scanned: { years: 0, decisions: 0, branches: 0 } };
  if (!p) return empty;
  const quoteIds = new Set(p.quotes.map((q) => q.id));
  const whenWritten = (d: Decision) => {
    const t = opts.decisionTimes?.[d.id];
    const at = t ? new Date(t.includes("T") ? t : `${t.replace(" ", "T")}Z`) : null;
    return at && !Number.isNaN(at.getTime()) ? at : opts.today;
  };
  const guard = (group: string, fn: () => void) => {
    try {
      fn();
    } catch (e) {
      add({ group, kind: "check_crashed", level: "info", msg: `this check could not run on this session (${e instanceof Error ? e.message.slice(0, 120) : "error"})`, at: { tab: "life" } });
    }
  };

  // Ledger snapshots, memoised: the life at a year from the years before it (cards) or through it (years).
  const before = new Map<number, LifeNow>();
  const through = new Map<number, LifeNow>();
  const nowBefore = (year: number) => {
    let n = before.get(year);
    if (!n) before.set(year, (n = lifeAt(p, years.filter((y) => y.year < year), year, forksTaken(s, year))));
    return n;
  };
  const nowThrough = (year: number) => {
    let n = through.get(year);
    if (!n) through.set(year, (n = lifeAt(p, years, year, forksTaken(s, year))));
    return n;
  };

  // 1. Big decisions (each against the session as it stood when it was asked: earlier forks only)
  guard("fork", () => {
    const bigs = s.decisions.filter((d) => d.kind === "big" && d.status !== "slid").sort((a, b) => a.year - b.year);
    for (const d of bigs) {
      const view: AgentState = {
        ...s,
        decisions: s.decisions.filter((x) => x.kind === "big" && (x.year < d.year || x.id === d.id)).map((x) => (x.id === d.id ? { ...x, status: "pending" as const } : x)),
        answers: s.answers.filter((a) => a.decisionId !== d.id),
      };
      for (const i of bigCardIssues(view, d, whenWritten(d)))
        add({ group: "fork", kind: i.kind, level: issueLevel(i), msg: i.msg, at: { tab: "decisions", decisionId: d.id, year: d.year, age: d.age }, text: clip(d.prompt) });
    }
  });

  // 2. Small cards
  guard("small", () => {
    const smalls = s.decisions.filter((d) => d.kind === "small");
    smalls.forEach((d, i) => {
      const now = nowBefore(d.year);
      const head = `${d.prompt} ${d.whyAsking}`;
      const all = [d.prompt, d.whyAsking, ...d.options.map((o) => `${o.label}. ${o.hint ?? ""}`)].join(" ");
      const issues: Issue[] = [
        ...stateIssues(head, now),
        ...peopleIssues(all, now).filter((x) => x.kind !== "age"),
        ...pastTimeIssues(head, whenWritten(d), p.country, d.year).map((msg) => ({ kind: "past_time" as const, msg })),
        ...framingIssues(d.prompt, smalls.slice(0, i)),
      ];
      for (const x of issues) add({ group: "small", kind: x.kind, level: issueLevel(x), msg: x.msg, at: { tab: "decisions", decisionId: d.id, year: d.year, age: d.age }, text: clip(d.prompt) });
    });
  });

  // 3-5. Years of the chosen life
  guard("year.people", () => {
    for (const y of years) {
      const now = nowThrough(y.year);
      const allow = { changes: lifeOf(y)?.ch ?? [] };
      for (const e of y.events)
        for (const i of peopleIssues(`${e.title}. ${e.narrative}`, now, allow))
          add({ group: "year.people", kind: i.kind, level: "warn", msg: i.msg, at: { tab: "life", year: y.year, age: y.age, eventId: e.id }, text: clip(`${e.title}. ${e.narrative}`) });
      for (const i of peopleIssues(`${y.summary} ${y.scene?.caption ?? ""}`, now, allow))
        add({ group: "year.people", kind: i.kind, level: "warn", msg: `summary/caption: ${i.msg}`, at: { tab: "life", year: y.year, age: y.age }, text: clip(y.summary) });
    }
  });
  guard("year.repeat", () => {
    years.forEach((y, k) => {
      const recent = years.slice(Math.max(0, k - 3), k);
      const dupS = recent.find((r) => similarity(r.summary, y.summary) >= 0.7);
      if (dupS) add({ group: "year.repeat", kind: "summary", level: "warn", msg: `summary repeats ${dupS.year}'s line ("${clip(dupS.summary, 120)}")`, at: { tab: "life", year: y.year, age: y.age }, text: clip(y.summary) });
      for (const e of y.events) {
        const dup = recent.find((r) => r.events.some((pe) => similarity(pe.title, e.title) >= 0.8));
        if (dup && e.isTurningPoint && e.title.length > 12)
          add({ group: "year.repeat", kind: "event", level: "warn", msg: `turning point "${e.title}" repeats an event of ${dup.year}`, at: { tab: "life", year: y.year, age: y.age, eventId: e.id } });
      }
    });
  });
  guard("year.date", () => {
    const first = years.find((y) => y.year === p.startYear);
    if (!first) return;
    for (const m of pastTimeIssues(first.summary, opts.today, p.country, first.year)) add({ group: "year.date", kind: "past_time", level: "warn", msg: `summary: ${m}`, at: { tab: "life", year: first.year, age: first.age } });
    for (const e of first.events)
      for (const m of pastTimeIssues(`${e.title}. ${e.narrative}`, opts.today, p.country, first.year))
        add({ group: "year.date", kind: "past_time", level: "warn", msg: m, at: { tab: "life", year: first.year, age: first.age, eventId: e.id } });
  });

  // 6-7. Content rules and the why thread (chosen life; branches below)
  let parentDeaths = 0;
  const contentOf = (y: SimYear, tab: CheckTab, group: string, branchId?: string) => {
    const at = (eventId?: string): CheckAt => ({ tab, year: y.year, age: y.age, eventId, branchId });
    for (const e of y.events) {
      const text = `${e.title}. ${e.narrative} ${e.cause?.reason ?? ""}`;
      const hits = bannedHits(text);
      if (hits.length) {
        const parentDeath = PARENT_DEATH_RE.test(text) && !CLOSE_DEATH.test(text);
        if (CLOSE_DEATH.test(text)) add({ group, kind: "close_death", level: "error", msg: `a partner's or child's death (${hits.join(", ")}): never allowed`, at: at(e.id), text: clip(text) });
        else if (parentDeath) {
          if (!branchId) parentDeaths++;
          if (y.age < 48) add({ group, kind: "parent_death_early", level: "error", msg: `a parent's death at ${y.age}: only allowed late (from 48)`, at: at(e.id), text: clip(text) });
          const others = hits.filter((h) => !/die|death|dead|pass|funeral/i.test(h));
          if (others.length) add({ group, kind: "banned", level: "error", msg: `banned content (${others.join(", ")})`, at: at(e.id), text: clip(text) });
        } else add({ group, kind: "banned", level: "error", msg: `banned content (${hits.join(", ")}): no death, serious illness or accidents`, at: at(e.id), text: clip(text) });
      }
      const cl = clicheCount(`${e.title} ${e.narrative}`);
      if (cl && !branchId) add({ group, kind: "cliche", level: "info", msg: `${cl} cliché${cl > 1 ? "s" : ""} (journey, tapestry, navigate...)`, at: at(e.id), text: clip(e.narrative) });
      const whyGroup = branchId ? group : "why";
      if (e.isTurningPoint && !e.cause) add({ group: whyGroup, kind: "no_cause", level: "error", msg: `turning point "${e.title}" has no why (every turning point cites a quote)`, at: at(e.id) });
      if (e.cause && !quoteIds.has(e.cause.quoteId)) add({ group: whyGroup, kind: "unknown_quote", level: e.isTurningPoint ? "error" : "warn", msg: `"${e.title}" cites ${e.cause.quoteId}, which is not one of their quotes`, at: at(e.id) });
      if (e.baseRate && !isBaseRateId(e.baseRate.statId)) add({ group: whyGroup, kind: "unknown_rate", level: "warn", msg: `"${e.title}" cites base rate "${e.baseRate.statId}", which is not in shared/baseRates.ts`, at: at(e.id) });
    }
    const sh = bannedHits(`${y.summary} ${y.scene?.caption ?? ""}`).filter((h) => !(PARENT_DEATH_RE.test(y.summary) && /die|death|pass|funeral/i.test(h) && y.age >= 48));
    if (sh.length) add({ group, kind: "banned", level: "error", msg: `summary/caption: banned content (${sh.join(", ")})`, at: at(), text: clip(y.summary) });
  };
  guard("content", () => {
    for (const y of years) contentOf(y, "life", "content");
    if (parentDeaths > 1) add({ group: "content", kind: "two_parent_deaths", level: "error", msg: `${parentDeaths} parent deaths in this life (at most once)`, at: { tab: "life" } });
  });
  guard("why", () => {
    for (const d of s.decisions)
      if (d.whyQuoteId && !quoteIds.has(d.whyQuoteId)) add({ group: "why", kind: "unknown_quote", level: "warn", msg: `"why I'm asking" cites ${d.whyQuoteId}, which is not one of their quotes`, at: { tab: "decisions", decisionId: d.id, year: d.year, age: d.age } });
    for (const q of s.warmup?.questions ?? [])
      if (q.whyQuoteId && !quoteIds.has(q.whyQuoteId)) add({ group: "why", kind: "unknown_quote", level: "warn", msg: `warm-up "${q.key}" cites ${q.whyQuoteId}, which is not one of their quotes`, at: { tab: "decisions", decisionId: q.id } });
  });

  // 8. People over time (check:qa)
  guard("ledger", () => {
    let deaths = 0;
    for (let i = 1; i < years.length; i++) {
      const a = lifeOf(years[i - 1]!);
      const b = lifeOf(years[i]!);
      if (!a || !b) continue;
      const y = years[i]!;
      for (const x of a.people.filter((q) => PEOPLE_ROLES.has(q.role))) {
        if (b.people.some((q) => q.name === x.name)) continue;
        if (!b.ch.some((c) => c.startsWith(`-${x.role}`) || (x.role === "partner" && c.startsWith("+partner"))))
          add({ group: "ledger", kind: "vanished", level: "warn", msg: `${x.name} (${x.relation}) left People with no change logged`, at: { tab: "life", year: y.year, age: y.age } });
      }
      for (const c of b.ch.filter((c) => c.startsWith("-parent"))) {
        deaths++;
        const re = /\b(dies|died|passes|passed|death|funeral)\b/i;
        const logged = s.log.some((l) => l.year === y.year && re.test(l.text)) || y.events.some((e) => re.test(`${e.title} ${e.narrative}`));
        if (!logged) add({ group: "ledger", kind: "death_not_logged", level: "warn", msg: `${c} with no line in the log or the year's events`, at: { tab: "life", year: y.year, age: y.age } });
      }
      for (const x of b.people) {
        const prev = a.people.find((q) => q.name === x.name && q.role === x.role);
        if (prev && prev.age !== null && x.age !== null && x.age - prev.age !== y.year - years[i - 1]!.year)
          add({ group: "ledger", kind: "age_jump", level: "warn", msg: `${x.name} is ${prev.age} in ${years[i - 1]!.year} and ${x.age} in ${y.year}`, at: { tab: "life", year: y.year, age: y.age } });
      }
    }
    if (deaths > 1) add({ group: "ledger", kind: "two_parent_deaths", level: "error", msg: `${deaths} parent deaths in People (at most once)`, at: { tab: "life" } });
  });

  // Years and ages in order
  guard("sequence", () => {
    years.forEach((y, i) => {
      if (y.age !== y.year - p.birthYear) add({ group: "sequence", kind: "age", level: "error", msg: `age ${y.age} in ${y.year}, but born ${p.birthYear} (should be ${y.year - p.birthYear})`, at: { tab: "life", year: y.year, age: y.age } });
      const prev = years[i - 1];
      if (prev && y.year === prev.year) add({ group: "sequence", kind: "duplicate_year", level: "error", msg: `${y.year} appears twice`, at: { tab: "life", year: y.year, age: y.age } });
      else if (prev && y.year !== prev.year + 1) add({ group: "sequence", kind: "gap", level: "warn", msg: `no years between ${prev.year} and ${y.year}`, at: { tab: "life", year: y.year, age: y.age } });
    });
    if (years.length && years[0]!.year !== p.startYear) add({ group: "sequence", kind: "start", level: "warn", msg: `the life starts in ${years[0]!.year}, the profile in ${p.startYear}`, at: { tab: "life", year: years[0]!.year } });
  });

  // 9. Typed fork answers (check:qa)
  guard("typed", () => {
    for (const d of s.decisions.filter((x) => x.kind === "big" && x.status === "answered")) {
      const a = s.answers.find((x) => x.decisionId === d.id);
      if (!a?.text?.trim()) continue;
      const refuses = /^\s*(no|none of these|neither)\b/i.test(a.text);
      const at: CheckAt = { tab: "decisions", decisionId: d.id, year: d.year, age: d.age };
      if (refuses && a.optionId) add({ group: "typed", kind: "filed_under_option", level: "warn", msg: `"${clip(a.text, 120)}" was filed as "${d.options.find((o) => o.id === a.optionId)?.label}"`, at });
      const c = chosenOf(d, a);
      if (!c.own) continue;
      const line = s.log.find((l) => l.refId === d.id && l.kind === "decision");
      const want = `You chose: ${ownShort(a.text)}`;
      if (line && line.text !== want) add({ group: "typed", kind: "log_line", level: "warn", msg: `log says "${line.text}", want "${want}"`, at });
    }
  });

  // Decision shape
  guard("decision", () => {
    for (const d of s.decisions) {
      const at: CheckAt = { tab: "decisions", decisionId: d.id, year: d.year, age: d.age };
      if (d.options.length !== 4) add({ group: "decision", kind: "options", level: "error", msg: `${d.options.length} options (the card always has 4)`, at });
      const labels = d.options.map((o) => o.label.trim().toLowerCase());
      if (new Set(labels).size !== labels.length) add({ group: "decision", kind: "same_label", level: "warn", msg: "two options have the same label", at });
      if (d.kind === "big" && d.options.some((o) => !o.branchTitle)) add({ group: "decision", kind: "no_branch_title", level: "warn", msg: "a fork option has no branch title", at });
      if (d.age !== d.year - p.birthYear) add({ group: "decision", kind: "age", level: "warn", msg: `card age ${d.age} in ${d.year} (born ${p.birthYear})`, at });
    }
  });

  // 10. Copy in the wrong currency (check:qa)
  guard("copy", () => {
    const cur = displayCurrency(p);
    if (moneyUnit(cur) === "dollar") return;
    for (const q of s.warmup?.questions ?? [])
      for (const o of q.options) if (/dollar/i.test(o.label)) add({ group: "copy", kind: "dollar", level: "warn", msg: `"${o.label}" for a ${cur} user`, at: { tab: "decisions", decisionId: q.id } });
    for (const d of s.decisions)
      for (const t of [d.prompt, ...d.options.map((o) => o.label)]) if (/\bdollars?\b/i.test(t)) add({ group: "copy", kind: "dollar", level: "info", msg: `says "dollar" to a ${cur} user: "${clip(t, 120)}"`, at: { tab: "decisions", decisionId: d.id, year: d.year, age: d.age } });
  });

  // 3D scene vs place
  guard("scene", () => {
    for (const y of years) {
      const label = y.scene?.placeLabel ?? "";
      if (!label || !y.place) continue;
      const a = cityOf(label);
      const b = cityOf(y.place);
      if (a && b && a !== b && !y.place.toLowerCase().includes(a) && !label.toLowerCase().includes(b))
        add({ group: "scene", kind: "place", level: "warn", msg: `the 3D scene says "${label}", the year says "${y.place}"`, at: { tab: "life", year: y.year, age: y.age } });
    }
  });

  // World events
  guard("world", () => {
    const w = years.flatMap((y) => y.events.filter((e) => e.category === "world_context").map((e) => ({ y, e })));
    w.slice(2).forEach(({ y, e }, k) => add({ group: "world", kind: "too_many", level: "warn", msg: `world event #${k + 3} in this life (at most 2): "${e.title}"`, at: { tab: "life", year: y.year, age: y.age, eventId: e.id } }));
  });

  // Money jumps (heuristic)
  guard("money", () => {
    const forkYears = new Set(s.decisions.filter((d) => d.kind === "big" && d.status === "answered").map((d) => d.year));
    for (let i = 1; i < years.length; i++) {
      const a = years[i - 1]!;
      const b = years[i]!;
      const explained = forkYears.has(b.year) || forkYears.has(a.year) || b.events.some((e) => MONEY_EVENTS.has(e.category)) || (lifeOf(b)?.work ?? "") !== (lifeOf(a)?.work ?? "");
      if (explained) continue;
      const ia = a.money.income;
      const ib = b.money.income;
      if (ia > 5000 && (ib > ia * 1.8 || ib < ia * 0.45))
        add({ group: "money", kind: "income_jump", level: "info", msg: `income $${Math.round(ia).toLocaleString("en-US")} → $${Math.round(ib).toLocaleString("en-US")} with no work or money event`, at: { tab: "life", year: b.year, age: b.age } });
      const na = a.money.netWorth;
      const nb = b.money.netWorth;
      if (Math.abs(nb - na) > Math.max(150_000, 0.6 * Math.max(Math.abs(na), 50_000)))
        add({ group: "money", kind: "net_worth_jump", level: "info", msg: `net worth $${Math.round(na).toLocaleString("en-US")} → $${Math.round(nb).toLocaleString("en-US")} in a year with no money event`, at: { tab: "life", year: b.year, age: b.age } });
    }
  });

  // Ending
  guard("ending", () => {
    const e = s.ending;
    if (!e) return;
    const verdicts: [string, string][] = [["chosen", e.verdict], ...Object.entries(e.branchVerdicts ?? {})];
    for (const [id, v] of verdicts)
      if (v && RANKING.test(v)) add({ group: "ending", kind: "ranking", level: "warn", msg: `verdict for ${id === "chosen" ? "your life" : id} ranks or compares: "${clip(v, 160)}"`, at: { tab: "ending", branchId: id === "chosen" ? undefined : id } });
    const last = years.at(-1);
    if (last) {
      const end = nowThrough(last.year);
      for (const [label, t] of [["verdict", e.verdict], ["postcard", e.postcard ?? ""], ["five-year answer", e.fiveYear?.chosen ?? ""]] as const)
        for (const i of peopleIssues(t, end).filter((x) => x.kind !== "age")) add({ group: "ending", kind: i.kind, level: "warn", msg: `${label}: ${i.msg}`, at: { tab: "ending" }, text: clip(t) });
    }
  });

  // Branches: content and why on their (coarse) years
  guard("branch", () => {
    for (const b of s.branches) for (const y of b.years) contentOf(y, "lives", "branch", b.id);
  });

  const counts: Record<CheckLevel, number> = { error: 0, warn: 0, info: 0 };
  for (const v of out) counts[v.level]++;
  return {
    groups: GROUPS.map((g) => ({ ...g, count: out.filter((v) => v.group === g.group).length })),
    violations: out,
    counts,
    scanned: { years: years.length, decisions: s.decisions.length + (s.warmup?.questions.length ?? 0), branches: s.branches.length },
  };
}
