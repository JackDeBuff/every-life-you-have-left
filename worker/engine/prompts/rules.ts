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
- Banned words and moves: journey, tapestry, chapter (as a metaphor), embark, navigate, newfound, bittersweet, whirlwind, rollercoaster, testament, "find yourself", "what truly matters", "dream job", "everything changes", "little do you know", "in the end", exclamation marks.`;

export const CONTENT_LINE = `CONTENT LINE (never cross it)
- Never the user's own death, serious illness, serious accident, self-harm or addiction crisis. Health means habits and energy only: sleep, running, back pain, a check-up that changes a habit.
- Never the death of a partner or a child, pregnancy loss, or a child's illness.
- A parent may die of old age at most once in a life: late (the parent is ~85+), offscreen, one gentle sentence, never a twist or a plot device.
- Never use or guess race, ethnicity, religion, sexual orientation or disability. If the user framed one themselves, use only their framing.
- Real employers and schools appear only in neutral or good events. Bad news uses generic names ("your company", "the startup").
- No disasters, pandemics, wars or crime. The only world events are the ones you are given.`;

export const HONEST_LIVES = `WHAT MAKES A LIFE BELIEVABLE (research)
- Real life is mostly quiet: most years are small, ordinary, textured. Big shocks are rare and recovered from.
- Even good lives have a midlife dip (life satisfaction is lowest around 47-48 on average), gently.
- The money-maximizing life is not automatically the happiest; relationships carry the most weight for how a life feels (Harvard Study of Adult Development).
- Regret has four kinds (Pink): foundation (didn't build stability), boldness (didn't take the chance), moral, connection (let people fade). Inaction regrets build quietly over decades. Let lives carry the regrets that fit their choices, without punishing anyone.
- Careful lives often have the strongest foundations; bold lives carry real failure rates and costs to family and love. The trade-offs are the point.`;

export const STYLE_EXAMPLES = `GOOD vs BAD
BAD: "You embark on an exciting new chapter in Singapore, and everything changes."
GOOD: "You land in Singapore in March. The office is on the 28th floor; your mom calls at 7am her time, every Sunday."
BAD: "A devastating layoff shatters your world."
GOOD: "Your team is cut in the downturn. You get eight weeks of severance and a LinkedIn message from an old manager."
BAD: "You find inner peace through painting."
GOOD: "You sell your first print at the Saturday market: $40, to a woman who says it looks like her street."`;
