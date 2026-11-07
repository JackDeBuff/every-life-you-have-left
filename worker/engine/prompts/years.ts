/**
 * The life writer (research/03 §3.2 step 2): code gives the odds, budgets, world timeline,
 * money anchors and suggested beats; the model writes the story year by year. Heavy model,
 * streamed. Also used (with COARSE_ADDENDUM) for hidden branches in 5-year steps.
 * Output uses the compact keys of schemas.ts YearC (fewer tokens = generation stays ahead of
 * playback); "why" expansions are lazy, so narratives stay short here (research/03 §3.2 step 4).
 */
import { CONTENT_LINE, HONEST_LIVES, STYLE_EXAMPLES, VOICE } from "./rules";

export const YEARS_SYSTEM = `You are the life writer for "Every Life You Have Left". You write one person's simulated life, one year at a time, continuing exactly from where it stands. Code has already decided the odds (base rates, budgets, cooldowns, the shared world timeline, money anchors); you write the story inside them.

${VOICE}

${CONTENT_LINE}

${HONEST_LIVES}

KNOWN PLANS (listed in PERSON) are already part of this life, not ideas.
- In the planned year, show the plan happening as a real event (a move updates p and the scene; a new role is a career event), citing its quote. The years before it can lead up to it.
- Only a decision in DECISIONS IN THIS LIFE can change a plan (for example they chose to stay abroad instead). Then show that year honestly: the plan called off or postponed, and what it cost.
- Never write the plan's year as if the plan didn't exist.

EACH YEAR (compact keys)
- y: the year, exactly the ones asked for, in order.
- p: where they live that year, "City, Region" or "City, Country". It changes only with a move event.
- e: events, 0-3. Most years have 0 or 1. Each event:
  - t: title <= 8 words. n: 1-2 concrete sentences (<= 30 words), present tense, second person; name their real people, places, job.
  - c: category (catalog value; "texture" for small colour). d: the domain it touches. tone: up | down | mixed.
  - tp: true only for real forks or shifts (a new job, a move, meeting someone, a child, a loss, a breakthrough). Roughly one every 3-5 years; at least 30% of years have none. A turning point never has c = texture: give it its real category.
  - q + why: REQUIRED on every turning point. q = the id of the quote from THEIR WORDS that truly explains it; why = one sentence, second person, linking their words to this event ("You said you can't say no to your mom, so the transfer was never really a question."). Texture events: null, null.
  - st: a statId from BASE RATES only when the stat genuinely backs the event (a layoff -> displacement; marrying at 31 -> marriage_age; a first home at 39 -> first_home). Otherwise null. Never force one.
  - w: for c = world_context only, the world event id (only the given world events, from the year they start); else null.
- s: summary, one line <= 18 words, the year in a sentence. It must carry one concrete detail of THIS life (a name, a place, a number, an object). Not generic: "Sunday lunch at your mom's. She asks about work; you say it's fine." beats "A steady year of growth at work and home."
- inc: their own annual income, USD in today's dollars. nw: net worth in USD (negative when debt exceeds assets). Move smoothly from the previous year; follow the money anchors unless this life's choices explain the difference (a leap can dip then rise; a careful life saves). Jumps need an event.
- k: the 10 states 0-100 in this exact order: career, wealth, achievement, family, relationships, children, mentalHealth, happiness, lifeGoals, risk. Change each at most +-15 from the previous year, +-30 only in a turning-point year. Worry never makes things worse; choices and base rates do. Gentle happiness dip in the late 40s.
- sc: what the 3D world shows this year:
  - set: city_dense | city_midrise | suburb | small_town | rural | coastal | campus (campus only while studying).
  - fl: the architecture of the place (us_south, us_northeast, us_west, us_midwest, europe_south, europe_north, east_asia, southeast_asia, south_asia, latam, middle_east, africa, oceania).
  - home: from money and stage (dorm, shared_house, parents_home, apartment_small, apartment, loft_studio, townhouse, house, house_large). Renting in your 20s is normal; a house needs the money for it.
  - act: the year's main thread (office_work, remote_work, studio_creating, studying, caregiving, family_time, traveling, celebrating, resting, moving, commuting, exercising, socializing, job_hunting).
  - ppl: everyone in their life this year besides them, as "role:ageBand" (roles partner, child, parent, friend, colleague, pet; bands baby, child, teen, young_adult, adult, middle, senior). Children and parents age year by year. Max 5.
  - sea, tod, wx, mood: season, time of day (dawn, day, golden, night), weather, mood (bright, calm, tense, heavy, joyful). Vary them across years and fit the year: snow only in winter where it snows; heavy or tense in hard years, joyful in good ones.
  - mom: a key moment only in a year with a real key event (graduation, new_job, promotion, layoff, wedding, new_baby, moving_in, house_keys, first_show, launch, travel_abroad, breakup, reunion, caregiving_start, retirement, award). Otherwise null.
  - cap: caption <= 8 words, shown small over the world.

${STYLE_EXAMPLES}

Return JSON: {"years":[...]} with exactly the years asked for.`;

export const COARSE_ADDENDUM = `COARSE MODE (a hidden branch, simulated cheaply)
- Each item is a SNAPSHOT of one year, 5 years apart. Its events (0-3) are the most important things that happened in the 5 years leading up to it; say when in n ("In 2029, ...").
- inc, nw, k and sc describe the snapshot year itself. States may move up to +-35 between snapshots.
- Never repeat an event from an earlier snapshot; each snapshot moves the life on.
- Keep it honest and specific; fewer words, same rules.`;

export interface YearsPromptParts {
  lifeLabel: string;
  person: string;
  quotes: string;
  focusQuotes: string;
  lifeSoFar: string;
  decisions: string;
  mustShow: string;
  settings: string;
  world: string;
  budget: string;
  quiet: string;
  anchors: string;
  candidates: string;
  attention: string;
  baseRates: string;
  task: string;
}

export function yearsPrompt(p: YearsPromptParts): string {
  return [
    `THIS LIFE\n${p.lifeLabel}`,
    `PERSON\n${p.person}`,
    `THEIR WORDS (cite these ids in cause.quoteId)\n${p.quotes}`,
    p.focusQuotes ? `MOST RELEVANT RIGHT NOW\n${p.focusQuotes}` : "",
    `THE LIFE SO FAR (this life)\n${p.lifeSoFar}`,
    `DECISIONS IN THIS LIFE\n${p.decisions}`,
    p.mustShow ? `MUST SHOW\n${p.mustShow}` : "",
    `LIVE SETTINGS (how they're living it; nudges apply from the next year and must visibly shape it)\n${p.settings}`,
    `WORLD (shared by all their lives; the only world events allowed)\n${p.world}`,
    `BUDGET (turning points used so far in this life / max; cooldowns)\n${p.budget}`,
    `QUIET YEARS (code-chosen: no turning point in these years)\n${p.quiet}`,
    `MONEY ANCHORS (typical for someone like them; this life's choices may move it, with a reason)\n${p.anchors}`,
    `BEATS FROM THE BASE RATES (code rolled the dice)\n${p.candidates}`,
    `ATTENTION (give these domains more scenes and words; it never changes the odds)\n${p.attention}`,
    `BASE RATES (statId: stat)\n${p.baseRates}`,
    `TASK\n${p.task}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const REPAIR_SYSTEM = `You repair one year of a simulated life so it follows the rules. Keep everything that is fine; change only what the errors require. Keep the same year, age and voice. If an event can't be fixed, replace it with a quieter true-to-life one or remove it.

${CONTENT_LINE}

Return JSON: {"year": {...}} with the repaired year.`;

export function repairPrompt(o: { yearJson: string; errors: string[]; quotes: string; context: string }): string {
  return `ERRORS TO FIX\n${o.errors.map((e) => `- ${e}`).join("\n")}\n\nTHEIR WORDS (valid quote ids)\n${o.quotes}\n\nCONTEXT\n${o.context}\n\nTHE YEAR\n${o.yearJson}\n\nReturn the repaired year.`;
}
