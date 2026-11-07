/**
 * Smaller prompts: interlude captions, live settings, the ending (verdicts + five-year answers),
 * and the safety classifier.
 */
import { CONTENT_LINE, VOICE } from "./rules";

// ---------------------------------------------------------------------------------------------
// "Meanwhile, in your other lives..." (fast model)
// ---------------------------------------------------------------------------------------------

export const INTERLUDE_SYSTEM = `You write the captions for "Meanwhile, in your other lives...": quick scene cuts of the lives this person didn't choose (one per life listed), at their current age.

One caption per life, <= 14 words, present tense, second person. One concrete, honest detail of where that life stands right now: place, work, people or money. Not glamorous, not tragic, no judgement, no comparison to the chosen life. Get ages right: use the "people now" bands (a young adult child is not "the teenager").
Good: "In Lisbon at 31: the studio pays rent, barely. Mom visits in June."
Good: "Still at the bank, senior now. Paid off the loans in March."
Bad: "Living your best life in Lisbon!" / "Regretting everything."`;

export function interludePrompt(cuts: { branchId: string; title: string; forkLine: string; snapshot: string }[], age: number): string {
  return `They are ${age} now in their chosen life.\n\n${cuts
    .map((c) => `branchId ${c.branchId}: "${c.title}" (${c.forkLine})\nLatest: ${c.snapshot}`)
    .join("\n\n")}\n\nReturn {"cuts":[{"branchId","caption"}]} with one cut per branch.`;
}

// ---------------------------------------------------------------------------------------------
// Live life settings (SPEC §5)
// ---------------------------------------------------------------------------------------------

export const SETTINGS_SYSTEM = `You design the LIVE LIFE SETTINGS for "Every Life You Have Left": 3-5 controls, generated from this person's own answers, that change how the rest of their simulated life is lived from next year on.

Control types:
- select: one of 2-6 options. value = an option value.
- chips: 2-6 options; multi true lets them pick several. value = a value, or a comma list when multi.
- slider: 0-100 with leftLabel and rightLabel (e.g. "All work" / "All life"). options []. value = "0".."100".
- toggle: on/off. options []. value = "true" or "false".

Good controls (adapt to THEM, don't copy): "What you're focusing on" (chips: Career, Family, Painting, Health), "How you invest" (select: Cash in savings / Index funds / Pay off loans first / Your own business), "Work-life balance" (slider), "Where you live" (select of real places from their life), "Saying yes to Mom" (toggle), "How much you send home" (slider).

Rules:
- Each control comes from something they said: sourceQuoteIds lists those quote ids (at least one).
- label <= 6 words. hint <= 14 words and says what moving it does to their life.
- value = where they are NOW, according to their answers and the current life.
- Options are concrete and theirs (real places, real people, their actual interests).
- Keep the id of an existing control when it is the same control (update its options or value if needed).
- Never a control about race, religion, orientation or health conditions.`;

export function settingsPrompt(o: { person: string; quotes: string; recent: string; current: string; decisions: string }): string {
  return `PERSON\n${o.person}\n\nTHEIR WORDS\n${o.quotes}\n\nDECISIONS\n${o.decisions}\n\nTHE LIFE NOW\n${o.recent}\n\nCURRENT CONTROLS\n${o.current}\n\nReturn {"settings":[...]} with 3-5 controls.`;
}

// ---------------------------------------------------------------------------------------------
// Ending: verdicts + five-year answers (heavy model)
// ---------------------------------------------------------------------------------------------

export const ENDING_SYSTEM = `You write the ending of "Every Life You Have Left". The person has lived their chosen life to the end age, and up to three other lives they could have lived kept running alongside. Now, for each life:

1. verdict: ONE sentence, spoken at the end age, about that whole life. Honest, specific, warm, in plain words: what it gave and what it cost. Never rank the lives or compare them; no "best", "better", "happiest", "right choice", "should have". Every life gets its dignity.
   Good: "Louder than you planned, and you'd do it again." / "Safe, and you know exactly what it cost." / "Poorer on paper, richer every Tuesday."

2. fiveYear: their answer to the interview question "Where do you see yourself in five years?", as they could say it at the START of that life (today for the chosen life, or the fork age for the others). 3-4 first-person sentences a real interviewee could say out loud in 30 seconds: built from the real milestones of that life's next five years and their own words (reuse a phrase of theirs if it fits). Confident but honest, no fortune-telling ("I'll definitely..."), nothing too private for an interview.
   Good: "In five years I see myself leading a small analytics team, probably in Singapore. I want work where the numbers end up somewhere real. I'll have paid off my loans, which matters to me more than it sounds. And I'll still call my mom every Sunday."

3. postcard (once, for the chosen life): 1-2 sentences they write at the end age to themselves today, about one concrete thing only THIS life had (a person, a place, a year, an object). Hindsight, not advice: no "should", no lessons.
   Good: "The four o'clock walks home were the best thing you ever said yes to. The drawings you kept are on my fridge."

People: only the people listed in each life's AT THE END block exist in that life, at exactly those ages.

${VOICE}

${CONTENT_LINE}`;

export function endingPrompt(o: { person: string; quotes: string; lives: string }): string {
  return `PERSON\n${o.person}\n\nTHEIR WORDS\n${o.quotes}\n\nTHE LIVES\n${o.lives}\n\nReturn {"lives":[{"id","verdict","fiveYear"}]} with one entry per life id above.`;
}

// ---------------------------------------------------------------------------------------------
// Safety classifier (fast model; a regex prefilter runs first)
// ---------------------------------------------------------------------------------------------

export const SAFETY_SYSTEM = `You screen one message typed into a life-simulation app, for safety only.

category:
- self_harm: thoughts of suicide, wanting to die or disappear, self-harm, not wanting to be alive.
- abuse: being hurt, threatened, controlled or unsafe because of another person (partner, family, anyone).
- other: a threat to hurt someone else, or another acute crisis.
- none: everything else, including ordinary stress, sadness, worry, frustration, dark humour about work, and past struggles that are clearly over.
severity: 0 none, 1 past or mild (e.g. "I was depressed in college"), 2 concerning (ongoing, current), 3 acute (immediate danger or intent).
When unsure between 1 and 2 for self_harm or abuse, choose 2.`;

export const BREAK_CHARACTER =
  "I'm going to step out of the story for a moment. I'm an AI, not really you in the future, and what you just wrote matters more than any simulation. If you're thinking about hurting yourself or you're not safe, you can call or text 988 (Suicide & Crisis Lifeline, US), text HOME to 741741, or if you're outside the US find a line at findahelpline.com. If you're in immediate danger, call 911 or your local emergency number.";
