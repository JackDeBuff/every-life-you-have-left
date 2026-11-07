/**
 * replyAs: the interviewer, or a future self at an age in the chosen life or a branch.
 * Letters-style voice when we know little; the digital twin (writes like them) once
 * knowMeScore >= TWIN_THRESHOLD (D-026). The persona only knows its life up to that age.
 */
import { getBaseRate } from "../../shared/baseRates";
import { TWIN_THRESHOLD } from "../../shared/schema";
import type { SessionState, SimYear } from "../../shared/sim";
import { decisionsBlock, lifeSoFarBlock, nowContext, personBlock, quotesBlock, yearLine } from "./context";
import { branchForks, forksTaken, profileAsOf, type LifeNow } from "./ledger";
import type { Caller } from "./models";
import { futureSelfSystem, INTERVIEWER_SYSTEM } from "./prompts/chat";
import { BREAK_CHARACTER } from "./prompts/extras";
import { branchLabel } from "./branches";
import { regexSafety } from "./extras";
import { sentences, wordCount } from "./util";

/** Style notes + verbatim samples of the user's own writing (for the twin). */
export function styleNotes(state: SessionState): string | null {
  const p = state.profile;
  if (!p || p.knowMeScore < TWIN_THRESHOLD) return null;
  const own = p.quotes.filter((q) => q.source === "answer" || q.source === "pause" || q.source === "ai_export");
  const text = own.map((q) => q.text).join(" ");
  if (wordCount(text) < 40) return null;
  const sents = sentences(text);
  const avg = Math.round(wordCount(text) / Math.max(1, sents.length));
  const lowerStarts = sents.filter((s) => /^[a-z]/.test(s)).length / Math.max(1, sents.length);
  const contractions = (text.match(/\b\w+'(?:m|re|s|ll|d|ve|t)\b/gi) ?? []).length / Math.max(1, wordCount(text));
  const notes = [
    `- Average sentence: about ${avg} words.`,
    lowerStarts > 0.4 ? "- Often starts sentences in lowercase; keep that." : "- Normal capitalisation.",
    contractions > 0.03 ? "- Uses contractions a lot (I'm, can't, it's)." : "- Few contractions.",
    /!/.test(text) ? "- Uses exclamation marks sometimes." : "- No exclamation marks.",
    /\.\.\.|…/.test(text) ? "- Trails off with ellipses sometimes." : "",
    /\b(lol|haha|tbh|ngl|idk|kinda|gonna|wanna)\b/i.test(text) ? "- Casual words (lol, tbh, kinda, gonna); use them the way they do." : "",
  ].filter(Boolean);
  const samples = own
    .slice()
    .sort((a, b) => wordCount(b.text) - wordCount(a.text))
    .slice(0, 8)
    .map((q) => `"${q.text.slice(0, 300)}"`);
  return `${notes.join("\n")}\nSamples of how they write (copy the rhythm, word choice and punctuation, not the content):\n${samples.join("\n")}`;
}

function lifeYearsUpTo(state: SessionState, life: string, age: number): { years: SimYear[]; title: string; forkLine: string; path: LifeNow["path"] } | null {
  const p = state.profile!;
  const year = p.birthYear + age;
  if (life === "chosen") {
    const years = state.years.filter((y) => y.year <= year);
    const forks = state.decisions.filter((d) => d.kind === "big" && d.status === "answered" && d.year <= year);
    const last = forks.at(-1);
    const opt = last ? last.options.find((o) => o.id === state.answers.find((a) => a.decisionId === last.id)?.optionId) : undefined;
    return { years, title: "Your Path", forkLine: opt?.branchTitle ? `the life where you chose "${opt.branchTitle}"` : "the life you chose", path: forksTaken(state, year) };
  }
  const b = state.branches.find((x) => x.id === life);
  if (!b) return null;
  const shared = state.years.filter((y) => y.year < b.forkYear);
  const own = b.years.filter((y) => y.year <= year);
  const decision = state.decisions.find((d) => d.id === b.forkDecisionId);
  return { years: [...shared, ...own], title: b.title, forkLine: branchLabel(state, decision, b).split(". From here")[0]!, path: branchForks(state, b) };
}

export async function* reply(
  call: Caller,
  state: SessionState,
  life: string,
  age: number,
  history: { role: "user" | "assistant"; text: string }[],
  text: string,
  today: Date = new Date(),
): AsyncGenerator<string> {
  if (regexSafety(text).flagged) {
    yield BREAK_CHARACTER;
    return;
  }
  const p = state.profile!;
  let system: string;
  if (life === "interviewer") {
    const now = state.years.filter((y) => y.year <= state.playhead.year);
    const statIds = [...new Set(now.flatMap((y) => y.events.map((e) => e.baseRate?.statId)).filter((x): x is NonNullable<typeof x> => Boolean(x)))];
    const stats = statIds.map((id) => getBaseRate(id)).filter((b): b is NonNullable<typeof b> => Boolean(b)).map((b) => `- ${b.display} (${b.source})`).join("\n");
    const nowText = nowContext({ profile: p, years: now, atYear: state.playhead.year, path: forksTaken(state, state.playhead.year), today }).text;
    system = `${INTERVIEWER_SYSTEM}\n\nWHO THEY ARE\n${personBlock(p)}\n\nTHEIR WORDS\n${quotesBlock(p)}\n\nTHEIR SIMULATED LIFE SO FAR\n${lifeSoFarBlock(now, 20)}\n\n${nowText}\n\nDECISIONS\n${decisionsBlock(state, state.playhead.year)}\n\nSTATISTICS BEHIND THEIR LIFE (cite only these; never invent a number or a study)\n${stats || "(none cited yet: explain with their own words and choices instead)"}`;
  } else {
    const l = lifeYearsUpTo(state, life, age);
    if (!l) {
      yield "I can't find that life anymore.";
      return;
    }
    const year = p.birthYear + age;
    const branchFork = life === "chosen" ? null : (state.branches.find((x) => x.id === life)?.forkYear ?? null);
    const yearsText = l.years.length
      ? l.years
          .filter((y, i, arr) => i >= arr.length - 12 || y.events.some((e) => e.isTurningPoint))
          .map(yearLine)
          .join("\n")
      : "(your life is just starting)";
    system = futureSelfSystem({
      name: p.firstName ?? "you",
      age,
      year,
      startAge: p.age,
      startYear: p.startYear,
      lifeTitle: l.title,
      forkLine: l.forkLine,
      person: personBlock(p),
      quotes: quotesBlock(p),
      // the life ledger at that age: place, work, people with code-computed ages (never guessed)
      years: `${yearsText}\n\n${nowContext({ profile: branchFork === null ? p : profileAsOf(p, state.decisions, branchFork), years: l.years, atYear: year, path: l.path, today, title: `YOU, NOW (${year})` }).text}`,
      twin: styleNotes(state),
    });
  }
  const turns = history.slice(-12).map((h) => ({ role: h.role, text: h.text }));
  let said = false;
  try {
    for await (const d of call.stream({
      tier: "heavy",
      purpose: life === "interviewer" ? "chat.interviewer" : "chat.self",
      system,
      prompt: text,
      history: turns,
      maxOutputTokens: 800,
      hedgeMs: 5000,
    })) {
      said = true;
      yield d;
    }
  } catch (e) {
    if (said) throw e;
    yield "Sorry, I lost my train of thought for a second. Ask me that again?";
  }
}
