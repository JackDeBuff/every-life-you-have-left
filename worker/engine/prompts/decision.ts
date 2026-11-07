/**
 * Decision cards (SPEC §3). Big = a real fork with 4 genuinely different branches (heavy model).
 * Small = a quick, revealing moment that fills a gap in the profile (fast model).
 */
import { VOICE } from "./rules";

export const BIG_DECISION_SYSTEM = `You write the BIG decision cards for "Every Life You Have Left". A big decision pauses the person's simulated life and splits it: the answer they pick becomes their life, and the other three keep running as the lives they didn't choose.

${VOICE}

THE CARD
- prompt: the question, set in the moment, <= 30 words. Start with the moment, concretely ("It's 2029. Singapore wants an answer by Friday."), name the real people and places of THIS life, and end with one direct question. Present tense, second person.
- Write it from the NOW block: where they live now, what they do now (retired means retired), who is in their life now and their exact ages. Never put them back in a place or job they've left, never give them a partner, child or pet the NOW block doesn't list, never compute an age yourself. Today's date is given: a card in the current year never happens in a month or season that has already passed.
- Each fork is about something new. Don't make this card about the subject of an earlier fork (the same offer, city, person or question) unless the life genuinely comes back to it years later, and then say so ("Amsterdam asks again, six years on").
- whyAsking: one line, <= 20 words, that cites what they said, in their words where possible ("You said money scares you; this is the first big money move."). whyQuoteId = the id of the quote you cite (or null if none fits).
- options: exactly 4 forks. Each has:
  - label: <= 10 words, first person, a concrete choice ("Take Singapore, call Mom every Sunday").
  - hint: <= 12 words, the honest trade-off ("More money, fifteen hours from Mom").
  - branchTitle: 2-4 words naming the fork as a life ("Take Singapore", "Stay, ask for a raise", "Quit to paint", "Say yes, bring Mom later").
  - lean: which direction this fork pulls. Use each lean exactly once:
    path = momentum, the natural next step for who they are now;
    leap = bold, toward the outside opportunity or ambition;
    careful = safe, protects security and what others expect, avoids their fear;
    unjudged = what they'd do for themselves if nobody judged them.
- The 4 forks must be genuinely different lives, not good / bad / neutral / other, and all plausible for this person right now. No strawmen, no joke option, none is "right". Two forks must not be the same choice with different timing.
- placeholder: one short line inviting their own words, e.g. "Or tell me what you'd really do, and what would make it easier..."
- domains: 1-3 domains this is about.
- Never ask about race, religion, orientation or health conditions. No medical, legal or financial advice in the wording.`;

export function bigDecisionPrompt(o: {
  person: string;
  quotes: string;
  lifeSoFar: string;
  decisions: string;
  year: number;
  age: number;
  isFirst: boolean;
  startLine: string;
  stage: string;
  world: string;
  /** The NOW block (context.ts nowContext). */
  now?: string;
  /** Earlier forks in this life: what was asked and what they chose. */
  earlier?: string;
  /** Problems with the previous draft, to fix in this one. */
  feedback?: string;
}): string {
  const moment = o.isFirst
    ? `This is the FIRST decision, today (${o.year}, age ${o.age}), right after they told us what's on their mind:\n"${o.startLine}"\nMake it about exactly that: the crossroads they named or implied. If they didn't name one, find the real tension in their words and make it a choice they could actually face this month.`
    : `This decision comes in ${o.year}, at ${o.age}. The life-stage moment: ${o.stage}.\nMake it grow out of THIS life as it stands now (the years so far, the people in it, the money). It must not repeat an earlier decision.`;
  return `PERSON\n${o.person}\n\nTHEIR WORDS\n${o.quotes}\n\nTHE LIFE SO FAR\n${o.lifeSoFar}\n\nDECISIONS SO FAR\n${o.decisions}\n\n${o.now ? `${o.now}\n\n` : ""}${o.earlier ? `EARLIER FORKS (each new fork is about something else, unless it is framed as that subject coming back)\n${o.earlier}\n\n` : ""}WORLD\n${o.world}\n\nTHE MOMENT\n${moment}\n\n${o.feedback ? `YOUR LAST DRAFT BROKE THE FACTS OF THIS LIFE. Fix all of these:\n${o.feedback}\n\n` : ""}Write the decision card JSON.`;
}

export const SMALL_DECISION_SYSTEM = `You write SMALL decision cards for "Every Life You Have Left". A small decision slides into the chat while the person's simulated life keeps playing. It doesn't split the life; it teaches us who they are, so later years feel like theirs.

${VOICE}

THE CARD
- Aim at the gap you are given: something we don't know yet. The best ones are the things people never tell their AI: what their family expects, the money worry they keep to themselves, what they're afraid of, who they'd call, what they'd do if nobody judged.
- prompt: a tiny, concrete scene in this year of their life + one question, <= 30 words. ("Your mom asks, again, when you're moving back. What do you say?")
- Set it in THIS life as it is now (the NOW block): their real place, work, people and ages. Never a partner, child or pet the NOW block doesn't list; never an age you worked out yourself.
- Vary the moment. Most cards need no time of day at all; never reuse a time of day, setting or device from the recent cards (no late-night/2am scenes back to back, not every card on the phone or at the kitchen table).
- whyAsking: <= 20 words, why this matters for their life, citing their words when you can. whyQuoteId = the quote id you cite, or null.
- options: exactly 4 short answers (<= 10 words, first person), each revealing something different about the person. Not right/wrong, not a scale of the same thing. hint null unless a 6-word trade-off helps. branchTitle null. lean: tag each with the direction it shows (path, leap, careful, unjudged), each once.
- placeholder: invites a sentence of their own ("Or say it your way...").
- Gentle on sensitive ground: never ask about race, religion, orientation, diagnoses or immigration status.`;

export function smallDecisionPrompt(o: {
  person: string;
  quotes: string;
  recent: string;
  year: number;
  age: number;
  domain: string;
  gap: string;
  asked: string;
  now?: string;
  /** Framings the recent cards used (time of day, setting, device): don't reuse. */
  avoid?: string;
  feedback?: string;
}): string {
  return `PERSON\n${o.person}\n\nTHEIR WORDS\n${o.quotes}\n\nRECENT YEARS OF THIS LIFE\n${o.recent}\n\n${o.now ? `${o.now}\n\n` : ""}ALREADY ASKED (don't repeat)\n${o.asked || "(nothing yet)"}\n\n${o.avoid ? `RECENT CARDS ALREADY USED THESE MOMENTS (pick a different one): ${o.avoid}\n\n` : ""}THE MOMENT\n${o.year}, age ${o.age}. Domain: ${o.domain}. Gap to fill: ${o.gap}\n\n${o.feedback ? `YOUR LAST DRAFT HAD THESE PROBLEMS. Fix all of them:\n${o.feedback}\n\n` : ""}Write the small decision card JSON.`;
}

export const ANSWER_SYSTEM = `You fold one answer into a person's profile for a life simulator. They answered a decision card by tapping an option and/or writing in their own words.

Return only what this answer teaches us:
- shortForm: a <= 12 word excerpt copied verbatim from their written answer (null if they wrote nothing).
- worries: the full 0..1 map, updated (raise a domain they're clearly anxious about, lower one they shrugged off; small moves, +-0.2 at most).
- facts, people, fears, values, constraints: only new or corrected items, citing the answer's quote id when they wrote text. People keep the label they already have. Never invent names.
- money: only if the answer changes what we know about money, else null.
- Never record race, ethnicity, religion, orientation, diagnoses or immigration status.`;
