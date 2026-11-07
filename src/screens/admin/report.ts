/**
 * "Copy bug report for Claude": compact markdown blocks the owner pastes into a chat with Claude.
 * Each says where the problem is, carries the item's JSON and the context needed to judge it (the
 * year before and after, the NOW snapshot from the ledger, the quote it cites), and leaves a
 * "What's wrong:" line to fill in.
 */
import { getBaseRate } from "../../../shared/baseRates";
import { formatMoney } from "../../../shared/currency";
import type { LifeEvent } from "../../../shared/schema";
import type { Branch, SimYear } from "../../../shared/sim";
import { chosenTitle } from "./present";
import { dayTime, toDate, type DecisionRow, type SessionView } from "./model";
import type { Tab, Violation } from "./types";

/**
 * Compact JSON: one line per top-level key, nested objects on that line, and each item of an array
 * of objects (events, people) on a line of its own. Valid JSON, about a third of the pretty size.
 */
export function compactJson(x: unknown): string {
  if (!x || typeof x !== "object" || Array.isArray(x)) return JSON.stringify(x);
  const lines = Object.entries(x as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const val =
        Array.isArray(v) && v.some((i) => i && typeof i === "object")
          ? `[\n${v.map((i) => `    ${JSON.stringify(i)}`).join(",\n")}\n  ]`
          : v && typeof v === "object" && !Array.isArray(v) && Object.values(v).some((i) => Array.isArray(i) && i.some((j) => j && typeof j === "object"))
            ? compactJson(v).replace(/\n/g, "\n  ")
            : JSON.stringify(v);
      return `  ${JSON.stringify(k)}: ${val}`;
    });
  return `{\n${lines.join(",\n")}\n}`;
}
const fence = (x: unknown) => "```json\n" + compactJson(x) + "\n```";
const link = (v: SessionView, tab: Tab, anchor?: string) => `${location.origin}/admin?s=${encodeURIComponent(v.id)}&tab=${tab}${anchor ? `#${anchor}` : ""}`;

function header(v: SessionView, where: string, url: string): string[] {
  const p = v.st.profile;
  const who = p ? `${p.firstName ?? "?"}, ${p.age}, ${[p.city, p.region, p.country].filter(Boolean).join(", ")} (${v.currency})` : "no profile yet";
  return [
    `## Bug report · Every Life You Have Left`,
    `Session \`${v.id}\` · ${v.st.speed} · phase ${v.st.phase} · engine ${v.st.engine} · ${who} · source ${v.detail.source === "durable_object" ? "Durable Object" : "D1 copy"}`,
    `Where: ${where}`,
    `Admin: ${url}`,
    ``,
    `**What's wrong:** `,
    ``,
  ];
}

/** A year without its scene and people noise: enough to see what the life said that year. */
function compactYear(y: SimYear | undefined) {
  if (!y) return null;
  return {
    year: y.year, age: y.age, place: y.place, summary: y.summary, work: y.life?.work ?? null, ch: y.life?.ch ?? [],
    money: y.money, events: y.events.map((e) => `${e.isTurningPoint ? "[TP] " : ""}${e.title} (${e.category}, ${e.tone})`),
  };
}

/** The ledger snapshot the engine wrote for a year (NOW block), plus the forks taken by then. */
function nowSnapshot(v: SessionView, year: number, exceptId?: string) {
  const ys = v.years.filter((y) => y.year <= year);
  const y = ys.at(-1);
  if (!y) return null;
  return {
    asOf: y.year, age: y.age, place: y.place, work: y.life?.work ?? null,
    people: (y.life?.people ?? []).map((x) => `${x.name} (${x.relation}${x.age !== null ? `, ${x.age}` : ""})`),
    money: { incomeUsd: y.money.income, netWorthUsd: y.money.netWorth, shown: `${formatMoney(y.money.income, v.currency)} / ${formatMoney(y.money.netWorth, v.currency)}` },
    forksTaken: v.rows.filter((r) => r.kind === "big" && r.status === "answered" && r.id !== exceptId && (r.year ?? 0) <= year).map((r) => `${r.age} (${r.year}): ${chosenTitle(r)}`),
  };
}

function quoteLine(v: SessionView, id: string | null | undefined): string | null {
  if (!id) return null;
  const q = v.quotes.get(id);
  return q ? `Related quote: ${id} (${q.from}): "${q.quote.text}"` : `Related quote: ${id} (not in the profile)`;
}

function checksLines(vs: Violation[] | undefined): string[] {
  if (!vs?.length) return [];
  return ["", "Code checks on this item:", ...vs.map((x) => `- ${x.level} ${x.group}:${x.kind}: ${x.msg}`)];
}

export function yearReport(v: SessionView, y: SimYear): string {
  const i = v.years.indexOf(y);
  const fork = v.rows.find((r) => r.kind === "big" && r.year === y.year);
  const lines = [
    ...header(v, `year ${y.year} (age ${y.age})${y.year > v.playheadYear ? " · buffered, not played yet" : ""}`, link(v, "life", `y-${y.year}`)),
    `### Year`,
    fence(y),
    `### Context`,
    `NOW (ledger, ${y.year}):`,
    fence(nowSnapshot(v, y.year)),
    `Previous year:`,
    fence(compactYear(v.years[i - 1])),
    `Next year:`,
    fence(compactYear(v.years[i + 1])),
  ];
  if (fork) lines.push(`Fork this year: ${fork.id}: "${fork.prompt}" → ${chosenTitle(fork)}`);
  const qs = [...new Set(y.events.map((e) => e.cause?.quoteId).filter(Boolean))].map((id) => quoteLine(v, id)).filter(Boolean) as string[];
  lines.push(...qs, ...checksLines(v.violationsAt.get(`y-${y.year}`)));
  return lines.join("\n");
}

export function eventReport(v: SessionView, y: SimYear, e: LifeEvent): string {
  const i = v.years.indexOf(y);
  const rate = e.baseRate ? getBaseRate(e.baseRate.statId) : undefined;
  const lines = [
    ...header(v, `event \`${e.id}\` in ${y.year} (age ${y.age})`, link(v, "life", `e-${e.id}`)),
    `### Event`,
    fence(e),
    `### Context`,
    `The year: ${y.year} · ${y.place} · "${y.summary}"`,
    `NOW (ledger, ${y.year}):`,
    fence(nowSnapshot(v, y.year)),
    `Previous year:`,
    fence(compactYear(v.years[i - 1])),
    `Next year:`,
    fence(compactYear(v.years[i + 1])),
  ];
  const q = quoteLine(v, e.cause?.quoteId);
  if (q) lines.push(q);
  if (rate) lines.push(`Base rate: ${rate.id}: ${rate.display} (${rate.source}, ${rate.year})`);
  lines.push(...checksLines(v.violationsAt.get(`e-${e.id}`)));
  return lines.join("\n");
}

export function decisionReport(v: SessionView, r: DecisionRow): string {
  const year = r.year ?? v.st.profile?.startYear ?? v.playheadYear;
  const yi = v.years.findIndex((y) => y.year === year);
  const lines = [
    ...header(v, `${r.kind === "warm" ? "warm-up question" : `${r.kind} decision`} \`${r.id}\`${r.year !== null ? ` in ${r.year} (age ${r.age})` : ""}`, link(v, "decisions", `d-${r.id}`)),
    `### ${r.kind === "warm" ? "Warm-up question" : "Decision"}`,
    fence(r.decision ?? r.warm),
    `### Answer`,
    r.answer
      ? fence({ ...r.answer, option: r.options.find((o) => o.id === r.answer!.optionId)?.label ?? null, chosen: r.kind === "big" ? chosenTitle(r) : undefined })
      : "(not answered)",
    `### Context`,
    `NOW (ledger, the year it was asked):`,
    fence(nowSnapshot(v, year, r.id)),
    `Year before:`,
    fence(compactYear(v.years[yi - 1])),
    `Its year:`,
    fence(compactYear(v.years[yi])),
  ];
  const earlier = v.rows.filter((x) => x.kind === "big" && x.id !== r.id && (x.year ?? 0) <= year && x.status === "answered");
  if (r.kind === "big" && earlier.length) lines.push(`Earlier forks: ${earlier.map((x) => `${x.age}: "${x.prompt}" → ${chosenTitle(x)}`).join(" | ")}`);
  for (const id of [r.whyQuoteId, r.answer?.quoteId]) {
    const q = quoteLine(v, id);
    if (q) lines.push(q);
  }
  lines.push(...checksLines(v.violationsAt.get(`d-${r.id}`)));
  return lines.join("\n");
}

export function branchYearReport(v: SessionView, b: Branch, y: SimYear): string {
  const i = b.years.indexOf(y);
  return [
    ...header(v, `other life \`${b.id}\` ("${b.title}", forked at ${b.forkAge}) · ${y.year} (age ${y.age})`, link(v, "lives", `b-${b.id}`)),
    `### Branch year`,
    fence(y),
    `### Context`,
    `Branch: ${b.title} · status ${b.status} · fork ${b.forkDecisionId} option ${b.optionId} · divergence ${b.divergence.toFixed(2)}`,
    `Previous snapshot:`,
    fence(compactYear(b.years[i - 1])),
    `Next snapshot:`,
    fence(compactYear(b.years[i + 1])),
    `Your life the same year:`,
    fence(compactYear(v.yearOf.get(y.year))),
    ...checksLines(v.violationsAt.get(`b-${b.id}`)?.filter((x) => x.at.year === y.year)),
  ].join("\n");
}

export function violationReport(v: SessionView, x: Violation): string {
  const anchor = x.at.decisionId ? `d-${x.at.decisionId}` : x.at.eventId ? `e-${x.at.eventId}` : x.at.year !== undefined ? `y-${x.at.year}` : undefined;
  const y = x.at.year !== undefined ? v.yearOf.get(x.at.year) : undefined;
  return [
    ...header(v, `code check ${x.group}:${x.kind} (${x.level})${x.at.year !== undefined ? ` · ${x.at.year}` : ""}`, link(v, x.at.tab === "lives" ? "lives" : x.at.tab, anchor)),
    `Check: ${x.msg}`,
    x.text ? `Checked text: "${x.text}"` : "",
    x.at.decisionId && v.rowOf.get(x.at.decisionId) ? fence(v.rowOf.get(x.at.decisionId)!.decision ?? v.rowOf.get(x.at.decisionId)!.warm) : "",
    x.at.eventId && y ? fence(y.events.find((e) => e.id === x.at.eventId)) : "",
    y ? `NOW (ledger, ${y.year}):\n${fence(nowSnapshot(v, y.year))}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function sessionSummary(v: SessionView, checks: { counts: Record<string, number>; violations: Violation[] } | null): string {
  const st = v.st;
  const p = st.profile;
  const d = v.detail;
  const created = toDate(String(d.session.created_at ?? ""));
  const lines = [
    `## Session summary · Every Life You Have Left`,
    `Session \`${v.id}\` · ${st.speed} · phase ${st.phase} · engine ${st.engine} · created ${created ? dayTime(created) : "?"} · updated ${dayTime(st.updatedAt)}`,
    `Admin: ${link(v, "life")}`,
    ``,
    `**What's wrong:** `,
    ``,
  ];
  if (p) {
    lines.push(
      `Person: ${p.firstName ?? "?"}, ${p.age} (born ${p.birthYear}), ${[p.city, p.region, p.country].filter(Boolean).join(", ")} · shows ${v.currency} · ${p.gender ?? "gender not set"} · know-me ${p.knowMeScore} · end age ${st.endAge}`,
    );
    const start = p.quotes.filter((q) => q.questionId === "start" && v.quotes.get(q.id)?.from === "start line");
    if (start.length) lines.push(`Start line: "${start.map((q) => q.text).join(" ")}"`);
    if (p.facts.length) lines.push(`Facts: ${p.facts.map((f) => `${f.label}: ${f.value}`).join(" · ")}`);
    if (p.people.length) lines.push(`People: ${p.people.map((x) => `${x.label} (${x.relation}${x.born ? `, b. ${x.born}` : ""})`).join(", ")}`);
    if (p.plans?.length) lines.push(`Plans: ${p.plans.map((x) => `${x.year} ${x.text} (${x.certainty})`).join(" · ")}`);
  }
  const warm = v.rows.filter((r) => r.kind === "warm");
  if (warm.length) lines.push(`Warm-up: ${warm.map((r) => `${r.id.replace(/^w-/, "")} ${r.status}${r.answer?.text ? ` "${r.answer.text}"` : r.answer?.optionId ? ` → ${r.options.find((o) => o.id === r.answer!.optionId)?.label ?? r.answer.optionId}` : ""}`).join(" · ")}`);
  const forks = v.rows.filter((r) => r.kind === "big");
  if (forks.length) {
    lines.push(`Forks (${forks.length}):`);
    for (const r of forks) lines.push(`- ${r.age} (${r.year}) ${r.status}: "${r.prompt}" → ${r.status === "answered" ? chosenTitle(r) : r.status}`);
  }
  const smalls = v.rows.filter((r) => r.kind === "small");
  if (smalls.length) lines.push(`Small decisions: ${smalls.length} (${smalls.filter((r) => r.status === "answered").length} answered, ${smalls.filter((r) => r.status === "slid").length} slid, ${smalls.filter((r) => r.answer?.text).length} with their own words)`);
  const played = v.years.filter((y) => y.year <= v.playheadYear);
  lines.push(`Years: ${played.length} played (${played[0]?.year ?? "?"}–${played.at(-1)?.year ?? "?"}), buffered to ${v.years.at(-1)?.year ?? "?"} · playhead ${st.playhead.year} (age ${st.playhead.age})`);
  const last = played.at(-1);
  if (last) lines.push(`Now: ${last.place} · ${last.life?.work ?? "?"} · ${(last.life?.people ?? []).map((x) => `${x.name} (${x.relation}${x.age !== null ? `, ${x.age}` : ""})`).join(", ") || "no one listed"} · income ${formatMoney(last.money.income, v.currency)} · net worth ${formatMoney(last.money.netWorth, v.currency)}`);
  lines.push(`Other lives: ${st.branches.filter((b) => b.status === "active").length} active, ${st.branches.filter((b) => b.status === "retired").length} retired`);
  if (st.ending) lines.push(`Ending: "${st.ending.verdict}"${st.ending.postcard ? ` · postcard "${st.ending.postcard}"` : ""}`);
  if (st.usage) lines.push(`Model cost: $${st.usage.usd.toFixed(3)} over ${st.usage.calls} calls (${Object.entries(st.usage.byPurpose).sort((a, b) => b[1] - a[1]).map(([k, x]) => `${k} $${x.toFixed(3)}`).join(", ")})`);
  if (st.error) lines.push(`Last engine error: ${st.error}`);
  const errs = d.engineLog.filter((x) => x.level === "error");
  if (errs.length) lines.push(`Engine errors logged: ${errs.length} (${[...new Set(errs.map((x) => x.code))].join(", ")})`);
  if (checks) {
    lines.push(`Code checks: ${checks.counts.error ?? 0} errors, ${checks.counts.warn ?? 0} warnings, ${checks.counts.info ?? 0} info`);
    for (const x of checks.violations.filter((x) => x.level !== "info").slice(0, 15)) lines.push(`- ${x.level} ${x.group}:${x.kind}${x.at.year !== undefined ? ` @ ${x.at.year}` : ""}${x.at.decisionId ? ` (${x.at.decisionId})` : ""}: ${x.msg}`);
  }
  return lines.join("\n");
}
