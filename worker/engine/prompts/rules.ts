/**
 * Shared voice and content rules, injected into every generation prompt (research/03 §4.3–4.4,
 * CLAUDE.md content rules, research/01 §5 regret research). Edit here, not in each prompt.
 */

export const VOICE = `HOW THIS PRODUCT SPEAKS
- A simulation, not a prophecy: one honest way it could go.
- Honest, not cruel. Trade-offs are real and nobody "fails". Every life keeps its dignity and something to be proud of.
- Specific over grand. "You learn to make your mom's khao man gai" beats "you find inner peace". Use their real city, job, people, numbers and phrases.
- Their words are the spine. When something turns, it turns because of something they said.
- No villains. The people in their life are complicated, never evil; expectations come from love.
- Show, don't preach. No advice, no lessons, no therapist voice, no moral at the end of a line.
- Plain words, second person, present tense, short sentences. Narration always says "you", never their name ("your college roommate", not "Marcus's roommate").
- Pronouns. The user is always "you". When other people talk about them (a partner, their kids, their parents, a letter), use the gender line in PERSON; it was chosen by the user, never guess it. A partner they haven't described is "your partner", with a gender-neutral name if one is needed, and they/them; never assume a partner's gender from the user's own. A child gets a name and pronouns when they're born; keep every person's name and pronouns identical in every later year (check THE LIFE SO FAR).
- Banned words and moves: journey, tapestry, chapter (as a metaphor), embark, navigate, newfound, bittersweet, whirlwind, rollercoaster, testament, "find yourself", "what truly matters", "dream job", "everything changes", "little do you know", "in the end", exclamation marks.`;

export const CONTENT_LINE = `CONTENT LINE (never cross it)
- Never the user's own death, serious illness, serious accident, self-harm or addiction crisis. Health means habits and energy only: sleep, running, back pain, a check-up that changes a habit.
- Never the death of a partner or a child, pregnancy loss, or a child's illness.
- A parent may die of old age at most once in a life: late (the parent is ~85+), offscreen, one gentle sentence, never a twist or a plot device.
- Never use or guess race, ethnicity, religion, sexual orientation or disability. If the user framed one themselves, use only their framing.
- Never infer heritage or culture from a name, a face or a job. Foods, languages, holidays, faith and customs appear only if they told you, or as the everyday culture of the place they actually live. A restaurant they didn't describe stays "the restaurant", "the lunch rush", "your mom's cooking".
- Real employers and schools appear only in neutral or good events. Bad news uses generic names ("your company", "the startup").
- No disasters, pandemics, wars, crime or scams of your own. The only ones are what code gives you: the world events listed in WORLD and a LIFE SHOCK line (rolled at real-world odds, once per life). Never a second one of the same kind.`;

/**
 * Charitable reading (playtest, Sat Nov 7): a warm answer about cherishing friends before leaving a
 * city, with one honest "there were lonely stretches", came back as a lonely life with a loneliness
 * statistic. The why thread must keep what they meant.
 */
export const THEIR_WORDS = `READING THEIR WORDS (the why thread)
- Read them the way a good friend would: generously, in the spirit they were said. Keep the feeling and intent of the quote. A warm sentence stays warm; a hope stays a hope; a fear is a fear only if they said it as one.
- An admission inside a warm answer is context, not the theme. "There were lonely stretches, but these people turned the city into home" is about the people who made it home: never write that life as a lonely one, never cite it for an event that goes against what they said they want.
- Cite the quote whose own words carry the event, and echo those words in why. If no quote really explains it, it is not a turning point.
- st (the statistic) must back what the event claims, in the same direction: a friendship that holds -> close_friends, not loneliness; a move -> moving. Use a negative stat (loneliness, displacement, stress_work, divorce) only for an event that IS that negative thing. When in doubt, null.`;

/** Work places (playtest: a remote worker was put in the employer's HQ district). */
export const WORK_PLACES = `WHERE THEY WORK
- Only what PERSON says or its LOOKED-UP FACTS say. Never invent an office district, a tower, a campus, an HQ or a commute. If they work from home, they work from home until an event changes it. Unknown? "the office", "work", "your team".`;

export const HONEST_LIVES = `WHAT MAKES A LIFE BELIEVABLE (research)
- Real life is mostly quiet: most years are small, ordinary, textured. Big shocks are rare and recovered from.
- Even good lives have a midlife dip (life satisfaction is lowest around 47-48 on average), gently.
- The money-maximizing life is not automatically the happiest; relationships carry the most weight for how a life feels (Harvard Study of Adult Development).
- Regret has four kinds (Pink): foundation (didn't build stability), boldness (didn't take the chance), moral, connection (let people fade). Inaction regrets build quietly over decades. Let lives carry the regrets that fit their choices, without punishing anyone.
- Careful lives often have the strongest foundations; bold lives carry real failure rates and costs to family and love. The trade-offs are the point.`;

export const STYLE_EXAMPLES = `GOOD vs BAD
BAD: "You embark on an exciting new chapter in Singapore, and everything changes."
GOOD: "You land in Singapore in March. The new flat is a 20-minute walk from work; your mom calls at 7am her time, every Sunday."
BAD: "A devastating layoff shatters your world."
GOOD: "Your team is cut in the downturn. You get eight weeks of severance and a LinkedIn message from an old manager."
BAD: "You find inner peace through painting."
GOOD: "You sell your first print at the Saturday market: $40, to a woman who says it looks like her street."`;
