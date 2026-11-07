/** settingsFor, ending, safety and logFor. */
import type { Ending, SafetyResult } from "../../shared/engine";
import type { Branch, LiveSetting, LogLine, SessionState, SimYear } from "../../shared/sim";
import { fixPeopleNumbers, peopleIssues, similarity } from "./consistency";
import { decisionsBlock, lifeSoFarBlock, nowContext, personBlock, quotesBlock, settingValueLabel, yearLine } from "./context";
import { branchForks, forksTaken, lifeAt, nowBlock, peopleNowLine, peopleSummary, profileAsOf, type LifeNow } from "./ledger";
import type { Caller } from "./models";
import { ENDING_SYSTEM, endingPrompt, SAFETY_SYSTEM, SETTINGS_SYSTEM, settingsPrompt } from "./prompts/extras";
import { EndingLLM, SafetyLLM, SettingsLLM } from "./schemas";
import { clampInt, slug, truncateWords } from "./util";

// ---------------------------------------------------------------------------------------------
// Live settings (SPEC §5)
// ---------------------------------------------------------------------------------------------

function fixSetting(s: LiveSetting, validQuotes: Set<string>, fallbackQuote: string | undefined): LiveSetting | null {
  const out: LiveSetting = { ...s, id: slug(s.id || s.label), label: truncateWords(s.label, 7), hint: truncateWords(s.hint, 16) };
  out.sourceQuoteIds = s.sourceQuoteIds.filter((q) => validQuotes.has(q));
  if (!out.sourceQuoteIds.length && fallbackQuote) out.sourceQuoteIds = [fallbackQuote];
  if (/\b(race|ethnic|religio|orientation|diagnos|disab)/i.test(`${s.label} ${s.hint}`)) return null;
  switch (s.type) {
    case "slider":
      out.options = [];
      out.multi = false;
      out.leftLabel = s.leftLabel ?? "Less";
      out.rightLabel = s.rightLabel ?? "More";
      out.value = String(clampInt(Number(s.value), 0, 100, 50));
      break;
    case "toggle":
      out.options = [];
      out.multi = false;
      out.leftLabel = null;
      out.rightLabel = null;
      out.value = /^(true|on|yes|1)$/i.test(s.value) ? "true" : "false";
      break;
    case "select":
    case "chips": {
      const opts = s.options
        .filter((o) => o.label?.trim())
        .slice(0, 6)
        .map((o) => ({ value: slug(o.value || o.label), label: truncateWords(o.label, 5) }));
      if (opts.length < 2) return null;
      out.options = opts;
      out.multi = s.type === "chips" ? s.multi : false;
      out.leftLabel = null;
      out.rightLabel = null;
      const vals = s.value
        .split(",")
        .map((v) => slug(v.trim()))
        .filter((v) => opts.some((o) => o.value === v));
      out.value = out.multi ? (vals.length ? vals.join(",") : opts[0]!.value) : (vals[0] ?? opts[0]!.value);
      break;
    }
  }
  return out;
}

export async function settingsForState(call: Caller, state: SessionState, today: Date = new Date()): Promise<LiveSetting[]> {
  const profile = state.profile!;
  const past = state.years.filter((y) => y.year <= state.playhead.year);
  // settings follow the life as it stands (after the latest fork), not the start profile
  const now = nowContext({ profile, years: past, atYear: state.playhead.year, path: forksTaken(state, state.playhead.year), today }).text;
  const current = state.settings.length
    ? state.settings.map((s) => `${s.id}: ${s.type} "${s.label}" = ${settingValueLabel(s, s.value)}`).join("\n")
    : "(none yet)";
  try {
    const r = await call.json({
      tier: "heavy",
      purpose: "settings",
      system: SETTINGS_SYSTEM,
      prompt: settingsPrompt({
        person: personBlock(profile),
        quotes: quotesBlock(profile),
        recent: `${lifeSoFarBlock(past.slice(-4), 4)}\n\n${now}`,
        current,
        decisions: decisionsBlock(state, state.playhead.year),
      }),
      schema: SettingsLLM,
      maxOutputTokens: 2500,
      hedgeMs: 9000,
    });
    if (!r.data) return state.settings;
    const valid = new Set(profile.quotes.map((q) => q.id));
    const fq = profile.quotes.at(-1)?.id;
    const seen = new Set<string>();
    const out: LiveSetting[] = [];
    for (const s of r.data.settings) {
      const f = fixSetting(s as LiveSetting, valid, fq);
      if (!f || seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(f);
    }
    return out.length >= 3 ? out.slice(0, 5) : state.settings.length ? state.settings : out;
  } catch {
    return state.settings;
  }
}

// ---------------------------------------------------------------------------------------------
// Ending (verdicts + five-year answers)
// ---------------------------------------------------------------------------------------------

const RANKING = /\b(best|better|worse|worst|happiest|richest|right choice|wrong choice|should have|most successful)\b/i;

function compactLife(years: SimYear[], fromYear: number, maxLines: number): string {
  const ys = years.filter((y) => y.year >= fromYear);
  const important = ys.filter((y, i) => i < 6 || y.events.some((e) => e.isTurningPoint) || i === ys.length - 1);
  return important.slice(0, maxLines).map(yearLine).join("\n");
}

/**
 * What the ending returns beyond the contract.
 * CONTRACT-REQUEST: add to shared/engine.ts Ending:
 *   postcard: string                  the chosen life's postcard line (life-specific, replaces the
 *                                     fixed "Decide the small things faster..." in Ending.tsx)
 *   people: Record<string, string>    per life ("chosen" | branchId): who is in it at the end age,
 *                                     computed from the life ledger in code (never by the model)
 */
export type EndingX = Ending & { postcard?: string; people?: Record<string, string> };

export async function endingFor(call: Caller, state: SessionState, branches: Branch[]): Promise<EndingX> {
  const profile = state.profile!;
  const start = profile.startYear;
  const endYear = profile.birthYear + (state.endAge || profile.endAge);
  const lives: string[] = [];
  // Each life's facts at the start (for the five-year answer) and at the end (for the verdict),
  // from the ledger: place, work, people with code-computed ages. The model never counts people.
  const startCtx = (years: SimYear[], atYear: number) => {
    const n = lifeAt(profile, years.filter((y) => y.year < atYear), atYear);
    return `${n.place}; ${n.work}; people: ${peopleNowLine(n)}`;
  };
  const chosenEnd = lifeAt(profile, state.years, endYear, forksTaken(state));
  const ends: Record<string, LifeNow> = { chosen: chosenEnd };
  lives.push(
    `id "chosen": THEIR CHOSEN LIFE (from ${start}, age ${profile.age})\nDecisions: ${decisionsBlock(state, 9999).split("\n").slice(0, 8).join(" / ")}\nAt the start: ${startCtx(state.years, start)}\n${compactLife(state.years, start, 30)}\n${nowBlock(chosenEnd, { title: `AT THE END (${endYear})` })}`,
  );
  for (const b of branches) {
    const shared = state.years.filter((y) => y.year < b.forkYear);
    const bEnd = lifeAt(profileAsOf(profile, state.decisions, b.forkYear), [...shared, ...b.years], endYear, branchForks(state, b));
    ends[b.id] = bEnd;
    lives.push(
      `id "${b.id}": "${b.title}" (forked at ${b.forkAge} in ${b.forkYear}; five-year answer is spoken at ${b.forkAge})\nShared past up to then: ${shared.length ? yearLine(shared[shared.length - 1]!) : "(none)"}\nAt the fork: ${startCtx(shared, b.forkYear)}\n${compactLife(b.years, b.forkYear, 14)}\n${nowBlock(bEnd, { title: `AT THE END (${endYear})` })}`,
    );
  }
  const people = Object.fromEntries(Object.entries(ends).map(([id, n]) => [id, peopleSummary(n)]));
  const fallback = (): EndingX => ({
    verdict: "A life with your fingerprints on it.",
    branchVerdicts: Object.fromEntries(branches.map((b) => [b.id, `The life where you chose "${b.title}".`])),
    fiveYear: {},
    people,
  });
  /** Ranking (D-010) and people that don't exist in that life, per verdict. */
  const problems = (data: { lives: { id: string; verdict: string; fiveYear: string }[]; postcard: string }) => {
    const out: string[] = [];
    for (const l of data.lives) {
      if (RANKING.test(l.verdict)) out.push(`verdict for ${l.id} ranks or compares ("${l.verdict}"): no best, better, worse, happiest, right choice or should have`);
      const n = ends[l.id];
      if (n) for (const i of peopleIssues(l.verdict, n).filter((x) => x.kind !== "age")) out.push(`verdict for ${l.id}: ${i.msg}`);
    }
    for (const i of peopleIssues(data.postcard ?? "", chosenEnd).filter((x) => x.kind !== "age")) out.push(`postcard: ${i.msg}`);
    return out;
  };
  try {
    const prompt = endingPrompt({ person: personBlock(profile), quotes: quotesBlock(profile), lives: lives.join("\n\n") });
    const ask = (extra: string) =>
      call.json({ tier: "heavy", purpose: "ending", system: ENDING_SYSTEM, prompt: prompt + extra, schema: EndingLLM, maxOutputTokens: 3200 });
    let r = await ask("");
    // One rewrite if a verdict ranks the lives or gives a life people it doesn't have.
    const bad = r.data ? problems(r.data) : [];
    if (bad.length) {
      const again = await ask(`\n\nYour previous draft had these problems. Rewrite so none remain (keep everything else):\n${bad.map((b) => `- ${b}`).join("\n")}`);
      if (again.data && problems(again.data).length < bad.length) r = again;
    }
    if (!r.data) return fallback();
    const fix = (id: string, t: string) => (ends[id] ? fixPeopleNumbers(t, ends[id]!).text : t);
    const byId = new Map(r.data.lives.map((l) => [l.id, l]));
    const chosen = byId.get("chosen");
    const postcard = r.data.postcard?.trim();
    return {
      verdict: fix("chosen", chosen?.verdict.trim() || fallback().verdict),
      branchVerdicts: Object.fromEntries(branches.map((b) => [b.id, fix(b.id, byId.get(b.id)?.verdict.trim() || `The life where you chose "${b.title}".`)])),
      fiveYear: Object.fromEntries(
        [["chosen", chosen?.fiveYear], ...branches.map((b) => [b.id, byId.get(b.id)?.fiveYear] as const)].filter((x): x is [string, string] => Boolean(x[1])),
      ),
      postcard: postcard && !/\bshould\b/i.test(postcard) ? fix("chosen", postcard) : undefined,
      people,
    };
  } catch {
    return fallback();
  }
}

// ---------------------------------------------------------------------------------------------
// Safety (research/03 §4.1): instant regex prefilter, then a fast classifier
// ---------------------------------------------------------------------------------------------

const SELF_HARM_RE =
  /\b(kill(?:ing)? my ?self|end(?:ing)? (?:it all|my life)|suicid\w*|don'?t want to (?:be alive|live|exist|wake up)|want(?:ing)? to die|hurt(?:ing)? my ?self|self[- ]harm|cut(?:ting)? myself|no reason to live|better off (?:dead|without me)|overdose)\b/i;
const ABUSE_RE =
  /\b((?:he|she|they|my (?:partner|husband|wife|boyfriend|girlfriend|dad|father|mom|mother|stepdad|stepmom)) (?:hits|beats|chokes|hurts|threatens|controls) me|not safe at home|afraid (?:of|to go) (?:him|her|home)|abus(?:e|es|ed|ive) me|being abused|domestic violence)\b/i;

export function regexSafety(text: string): SafetyResult {
  if (SELF_HARM_RE.test(text)) return { flagged: true, kind: "self_harm" };
  if (ABUSE_RE.test(text)) return { flagged: true, kind: "abuse" };
  return { flagged: false, kind: null };
}

const RISKY_WORDS = /\b(die|dead|death|hurt|harm|kill|abus\w*|hit|hits|unsafe|afraid|scared|hopeless|worthless|disappear|give up|can'?t go on|pills|cut|stop|burden|end)\b/i;

export async function safetyCheck(call: Caller, text: string): Promise<SafetyResult> {
  const t = text.trim();
  if (!t) return { flagged: false, kind: null };
  const quick = regexSafety(t);
  if (quick.flagged) return quick;
  // Very short texts with no risky word ("yes", "Lisbon") skip the model call; everything else is classified.
  if (t.split(/\s+/).length < 4 && !RISKY_WORDS.test(t)) return { flagged: false, kind: null };
  try {
    const r = await call.json({
      tier: "fast",
      purpose: "safety",
      system: SAFETY_SYSTEM,
      prompt: `MESSAGE\n"""\n${t.slice(0, 4000)}\n"""`,
      schema: SafetyLLM,
      maxOutputTokens: 200,
      hedgeMs: 3000,
      timeoutMs: 8000,
    });
    const d = r.data;
    if (!d || d.category === "none" || d.severity < 2) return { flagged: false, kind: null };
    return { flagged: true, kind: d.category };
  } catch {
    return { flagged: false, kind: null };
  }
}

// ---------------------------------------------------------------------------------------------
// logFor (PURE)
// ---------------------------------------------------------------------------------------------

export function logLines(state: SessionState, year: SimYear): LogLine[] {
  const out: LogLine[] = [];
  const base = { year: year.year, age: year.age };
  let n = 0;
  const id = (kind: string) => `log-${year.year}-${kind}-${++n}`;
  const domainOf = year.events.find((e) => e.isTurningPoint)?.domain ?? year.events[0]?.domain ?? null;
  // Near-duplicate lines from the last 3 years never show twice in the log (normalised similarity).
  const earlier = state.years.filter((y) => y.year < year.year && y.year >= year.year - 3);
  const seenLines = earlier.flatMap((y) => [y.summary, ...y.events.map((e) => e.title)]);
  const repeats = (t: string, th: number) => seenLines.some((x) => similarity(x, t) >= th);
  let yearText = year.summary;
  let skipEvent = -1;
  if (repeats(year.summary, 0.7)) {
    // the summary repeats an earlier year's: lead with this year's own event instead
    const i = year.events.findIndex((e) => e.narrative && !repeats(e.title, 0.8));
    if (i >= 0) (yearText = year.events[i]!.narrative), (skipEvent = i);
  }
  out.push({ ...base, id: id("year"), kind: "year", text: truncateWords(yearText, 24), domain: domainOf, tone: null, why: null, baseRate: null, refId: null });

  for (const d of state.decisions.filter((x) => x.year === year.year)) {
    const a = state.answers.find((x) => x.decisionId === d.id);
    const opt = a?.optionId ? d.options.find((o) => o.id === a.optionId) : undefined;
    const why = a?.quoteId ? { quoteId: a.quoteId, reason: "In your own words, at the moment you chose." } : d.whyQuoteId ? { quoteId: d.whyQuoteId, reason: d.whyAsking } : null;
    if (d.status === "slid") {
      out.push({ ...base, id: id("slid"), kind: "slid", text: truncateWords(`You let it slide: ${d.prompt}`, 24), domain: d.domains[0] ?? null, tone: null, why: null, baseRate: null, refId: d.id });
    } else if (d.status === "answered" && d.kind === "big") {
      const others = d.options.filter((o) => o.id !== opt?.id && o.branchTitle).map((o) => o.branchTitle).join(", ");
      out.push({
        ...base, id: id("fork"), kind: "fork",
        text: truncateWords(`You chose ${opt?.branchTitle ?? opt?.label ?? "your own way"}. ${others ? `The lives where you chose ${others} keep running.` : ""}`, 24),
        domain: d.domains[0] ?? null, tone: null, why, baseRate: null, refId: d.id,
      });
    } else if (d.status === "answered") {
      out.push({
        ...base, id: id("decision"), kind: "decision",
        text: truncateWords(opt ? `${opt.label}${a?.text ? `: "${a.text}"` : ""}` : a?.text ? `"${a.text}"` : d.prompt, 24),
        domain: d.domains[0] ?? null, tone: null, why, baseRate: null, refId: d.id,
      });
    }
  }

  for (const [i, e] of year.events.entries()) {
    if (i === skipEvent || (!e.isTurningPoint && (repeats(e.title, 0.8) || similarity(e.title, yearText) >= 0.8))) continue;
    out.push({
      ...base, id: id("event"), kind: "event", text: truncateWords(e.title, 24), domain: e.domain, tone: e.tone,
      why: e.cause, baseRate: e.baseRate, refId: e.id,
    });
  }

  for (const nd of state.nudges.filter((x) => x.year === year.year)) {
    const s = state.settings.find((x) => x.id === nd.settingId);
    if (!s) continue;
    out.push({
      ...base, id: id("nudge"), kind: "nudge",
      text: truncateWords(`At ${nd.age} you shifted ${s.label.toLowerCase()} to ${settingValueLabel(s, nd.to)}.`, 24),
      domain: null, tone: null, why: s.sourceQuoteIds[0] ? { quoteId: s.sourceQuoteIds[0], reason: s.hint } : null, baseRate: null, refId: s.id,
    });
  }
  return out;
}
