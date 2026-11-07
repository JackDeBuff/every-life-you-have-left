/**
 * Renders session state into compact, readable text blocks for prompts. Pure.
 * Compact matters: every year call carries this, so tokens here are paid ~10x per session.
 */
import { BASE_RATES } from "../../shared/baseRates";
import { CURRENCIES, displayCurrency, formatMoney } from "../../shared/currency";
import { DOMAINS, DOMAIN_KEYS, type DomainKey } from "../../shared/domains";
import type { Profile, WorldEvent } from "../../shared/schema";
import type { Decision, DecisionAnswer, LiveSetting, SessionState, SettingNudge, SimYear } from "../../shared/sim";
import { usd } from "./util";

export function personBlock(p: Profile): string {
  const lines: string[] = [];
  const where = [p.city, p.region, p.country].filter(Boolean).join(", ");
  lines.push(`${p.firstName ?? "They"}, ${p.age}, born ${p.birthYear}, lives in ${where}. Today is ${p.startYear}.`);
  lines.push(genderLine(p.gender));
  if (p.country.toUpperCase() !== "US")
    lines.push(`Not in the US: the base-rate table is US data, applied as approximate. Use local realities for money (in USD), housing, family norms and careers.`);
  for (const f of p.facts) lines.push(`- ${f.label}: ${f.value}${f.source === "inferred" ? " (our guess)" : ""}`);
  if (p.people.length)
    lines.push(
      `People: ${p.people
        .map((x) => `${x.label} (${x.relation}${x.expectation ? `; expects: ${x.expectation}` : ""})`)
        .join("; ")}`,
    );
  if (p.constraints.length) lines.push(`Constraints: ${p.constraints.map((c) => c.text).join("; ")}`);
  const plans = (p.plans ?? []).filter((x) => x.year >= p.startYear);
  if (plans.length)
    lines.push(
      `KNOWN PLANS (they told us; baseline reality in this life: it happens on time unless a decision in this life changed it):\n${plans
        .map((x) => `- ${x.year}${x.when ? ` (${x.when})` : ""}: ${x.text} [${x.certainty}${x.quoteIds[0] ? `, ${x.quoteIds[0]}` : ""}]`)
        .join("\n")}`,
    );
  const m = p.money;
  lines.push(
    `Money: feels ${m.feel}` +
      (m.incomeUsd != null ? `, income ~${usd(m.incomeUsd)}/yr` : "") +
      (m.debtUsd ? `, ${usd(m.debtUsd)} ${m.debtKind ?? "debt"}` : "") +
      (m.savingsUsd != null ? `, savings ~${usd(m.savingsUsd)}` : "") +
      (m.supportsFamily ? ", supports family" : "") +
      (m.assumed ? " (partly guessed)" : ""),
  );
  const cur = displayCurrency(p);
  if (cur !== "USD") {
    const c = CURRENCIES[cur];
    lines.push(
      `Currency: they think in ${c.name} (${c.symbol}). Number fields (inc, nw, money) stay USD. When a sentence they read names an amount, write it in ${cur} at 1 USD = ${c.perUsd} ${cur}, rounded (e.g. $1,500 -> ${formatMoney(1500, cur)}, $85,000 -> ${formatMoney(85000, cur)}).`,
    );
  }
  if (p.values.length) lines.push(`Values: ${p.values.map((v) => v.label).join(", ")}`);
  if (p.fears.length) lines.push(`Fears: ${p.fears.map((f) => `${f.text} (${f.kind})`).join("; ")}`);
  const top = topWorries(p, 3);
  if (top.length) lines.push(`Worries most about: ${top.map(([d, w]) => `${DOMAINS[d].label.toLowerCase()} (${w.toFixed(1)})`).join(", ")}`);
  lines.push(
    `Seeds: momentum = ${p.seeds.path.text}; the leap = ${p.seeds.leap.text}; fear wins = ${p.seeds.careful.text}; unjudged = ${p.seeds.unjudged.text}`,
  );
  return lines.join("\n");
}

/** Pronouns for the user, from the gender they picked themselves (never guessed). */
export function genderLine(g: Profile["gender"]): string {
  const how =
    g === "woman" ? "a woman: others call them she/her (a daughter, a wife or partner, a mom to her kids)"
    : g === "man" ? "a man: others call them he/him (a son, a husband or partner, a dad to his kids)"
    : g === "nonbinary" ? "non-binary: others call them they/them, in neutral words (child, partner or spouse, parent)"
    : "not given: others call them they/them, in neutral words (child, partner, parent). Never guess it from their name or anything else";
  return `Gender (they chose it): ${how}. Narration still says "you".`;
}

export function topWorries(p: Profile, n: number): [DomainKey, number][] {
  return DOMAIN_KEYS.map((d) => [d, p.worries[d]] as [DomainKey, number])
    .filter(([, w]) => w >= 0.3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

export function quotesBlock(p: Profile): string {
  if (!p.quotes.length) return "(none yet)";
  return p.quotes.map((q) => `${q.id}: "${q.text}"`).join("\n");
}

export function yearLine(y: SimYear): string {
  const ev = y.events
    .map((e) => `${e.isTurningPoint ? "*" : ""}${e.title} [${e.category}${e.cause ? `, ${e.cause.quoteId}` : ""}]`)
    .join("; ");
  const people = y.scene.people
    .filter((x) => x.role !== "self")
    .map((x) => x.role)
    .join("+");
  return `${y.year} (${y.age}) ${y.place} | ${usd(y.money.income)}/yr, net ${usd(y.money.netWorth)} | ${y.scene.home}${people ? `, with ${people}` : ""} | ${y.summary}${ev ? ` | ${ev}` : ""}`;
}

export function statesLine(y: SimYear): string {
  return DOMAIN_KEYS.map((d) => `${d} ${y.states[d]}`).join(", ");
}

/** The life so far, compact: older years one line each, the latest with its states. */
export function lifeSoFarBlock(years: SimYear[], maxLines = 40): string {
  if (!years.length) return "(nothing yet: this life starts now)";
  const shown = years.length > maxLines ? [...years.slice(0, 3), ...years.slice(-(maxLines - 3))] : years;
  const lines = shown.map(yearLine);
  if (years.length > maxLines) lines.splice(3, 0, `... (${years.length - maxLines} quieter years) ...`);
  const last = years[years.length - 1]!;
  lines.push(`Latest states (0-100): ${statesLine(last)}`);
  return lines.join("\n");
}

export function answerFor(state: SessionState, d: Decision): DecisionAnswer | undefined {
  return state.answers.find((a) => a.decisionId === d.id);
}

export function decisionLine(state: SessionState, d: Decision): string {
  const a = answerFor(state, d);
  const opt = a?.optionId ? d.options.find((o) => o.id === a.optionId) : undefined;
  const head = `${d.year} (${d.age}) ${d.kind.toUpperCase()}: "${d.prompt}"`;
  if (d.status === "slid") return `${head} -> let it slide (no answer; life follows its inertia)`;
  if (!a) return `${head} -> (not answered yet)`;
  const said = a.text ? ` and said "${a.text.slice(0, 400)}"${a.quoteId ? ` [${a.quoteId}]` : ""}` : "";
  return `${head} -> chose "${opt?.label ?? "their own answer"}"${opt?.branchTitle ? ` (${opt.branchTitle})` : ""}${said}`;
}

export function decisionsBlock(state: SessionState, uptoYear: number): string {
  const ds = state.decisions.filter((d) => d.year <= uptoYear && d.status !== "pending").sort((a, b) => a.year - b.year);
  if (!ds.length) return "(none)";
  return ds.map((d) => decisionLine(state, d)).join("\n");
}

export function settingValueLabel(s: LiveSetting, v: string): string {
  if (s.type === "slider") return `${v}/100 (0 = ${s.leftLabel ?? "left"}, 100 = ${s.rightLabel ?? "right"})`;
  if (s.type === "toggle") return v === "true" ? "on" : "off";
  const vals = v.split(",").map((x) => x.trim());
  return vals.map((x) => s.options.find((o) => o.value === x)?.label ?? x).join(", ");
}

export function settingsBlock(settings: LiveSetting[], nudges: SettingNudge[], uptoYear: number): string {
  if (!settings.length) return "(none)";
  const lines = settings.map((s) => `- ${s.label}: ${settingValueLabel(s, s.value)} (${s.hint})`);
  const ns = nudges.filter((n) => n.year <= uptoYear);
  for (const n of ns) {
    const s = settings.find((x) => x.id === n.settingId);
    if (!s) continue;
    lines.push(
      `  NUDGE at ${n.age} (${n.year}): "${s.label}" moved from ${settingValueLabel(s, n.from)} to ${settingValueLabel(s, n.to)}; applies from ${n.year + 1}.`,
    );
  }
  return lines.join("\n");
}

export function worldBlock(world: WorldEvent[]): string {
  if (!world.length) return "(no world events in this span)";
  return world.map((w) => `${w.id}: ${w.year}, ${w.kind}, "${w.title}"`).join("\n");
}

/** The base-rate table as the model sees it: id + the number + how to use it. */
export function baseRatesBlock(): string {
  return BASE_RATES.map((b) => `${b.id} [${b.domain}]: ${b.stat}. Use: ${b.howToUse}`).join("\n");
}

export const domainMeanings = () => DOMAIN_KEYS.map((d) => `${d}: ${DOMAINS[d].meaning}`).join("\n");
