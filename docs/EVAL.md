# Engine eval (WP1)

Sat Nov 7, 2:40-3:45am EST. Everything below was measured on our Agent Platform project. These are small samples
(3-4 sessions per arm), so read them as strong signals, not statistics.

Run it: `npm run eval` (8 personas x 4 heavy-path arms, judged by `gemini-4-argon`; it stops at the budget).
Options: `--models a,b` (an arm can be a hybrid: `gemini-3.8-flash+auto:gemini-3.5-flash-lite`), `--personas key,key`,
`--n 2`, `--budget 8`, `--concurrency 5`, `--no-judge`, `--verbose`.
Read a run: `npx tsx scripts/eval/show.ts <run-file> [persona] [model]` prints exactly what the judge saw.
Merge runs into one table: `npx tsx scripts/eval/summarize.ts <run-a.json> <run-b.json> --tag a,b`.
Full transcripts land in `scripts/eval/results/run-*.json` (gitignored: 0.2 MB each); `summary-*.json` is committed.

## Results: heavy-path model comparison (main run)

Auto mode (5 big decisions, 0 small), full life to the end age. Personas: Maya 19 (US), Dani 24 (Lagos),
Priya 27 (Bengaluru), Marcus 31 (US; not on Flash-Lite). Judge scores are 1-5 means.

| Heavy model | Sessions | Overall | Personal | Believable | No melodrama | Forks | Specific | Ending | Safety | Schema-valid | Rule-valid (1st pass) | First year after a fork (median) | Per year | $/session |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **gemini-3.8-flash** (thinking low) | 4 | **5.0** | 5.0 | **4.5** | 5.0 | **5.0** | 4.8 | **5.0** | 4.8 | 100% | 97.8% | 5.6 s | 3.83 s | $0.33 |
| gemini-4-argon (thinking low) | 4 | 4.5 | 5.0 | 3.8 | 5.0 | 4.3 | 5.0 | 4.8 | 5.0 | 89.6% | 98.4% | 10.2 s | 7.28 s | $0.63 |
| gemini-3.5-flash-lite (speed reference) | 3 | 4.0 | 5.0 | 3.0 | 4.7 | 3.7 | 4.7 | 4.3 | 5.0 | 100% | 96.5% | 2.1 s | **1.09 s** | $0.23 |
| openai/gpt-oss-120b-maas | 4 | 2.3 | 3.3 | 1.5 | 4.0 | 2.0 | 2.8 | 1.5 | 5.0 | 54.6% | 91.3% | 40.0 s | 10.02 s | $0.14 |

What the numbers hide:
- **Every turning point in every arm cited a real quote** (100%), and no session broke the `SimYear` contract or
  `shared/validate.ts checkLife`. Repairs were rare (3-5 of ~180 years per arm). The validator-plus-repair loop holds up.
- **Argon is too slow and too flaky for the live path.** Profile 24 s, big decisions 20 s on average, with several
  hitting the (then 30 s) first-token deadline and falling back to a generic card. Its streams stalled often enough
  that 19 of 183 years were code-made filler. Its quality was not higher than 3.8 Flash, just slower and 2x the price.
- **gpt-oss-120b is out.** Only 55% of its years were schema-valid, 17-24 years per session were filler after stream
  failures, profile extraction took 36 s, and the judge rated believability 1.5 (its notes: a Berlin lead designer
  earning $6-8k a year, a 3-bedroom house in Ikeja for $12k, sisters "in school for 24 years"). Its ending call also
  failed, so verdicts fell back to "The life where you chose X".
- **Flash-Lite is 3.5x faster and still personal, but less believable:** money drifts (income $115k with net worth
  growing $4k a year), promotions come too early ("charge nurse at 24"), and some events contradict each other.
- **3.8 Flash latency is a tail problem, not a mean problem.** Over all 20 forks the first year arrived in a median
  5.6 s (mean 8.3 s; 70% under 8 s), but one took 35 s. In smoke tests, about 1 in 3 calls stalled 25-60 s *before
  the first token*, then streamed
  normally at ~130 tokens/s. That is why the engine now hedges every call on time-to-first-token (5 s), races
  `gemini-3.6-flash` if both stall, and gives up at 30 s (60 s for thinking-first models).
- Cost per 3.8 Flash Auto session: years $0.14, hidden branches $0.11 (Flash-Lite, a third of the total), live
  settings $0.02, big decisions $0.02, profile + answer folding + ending + interludes + chat + safety ~$0.03.
  Hedged duplicates that lose the race are aborted; their partial tokens may still bill and are not counted.

## Confirmation run: the final engine, on personas it was never tuned on

After the fixes below, the final engine ran on Lucía (36, Valencia), Kenji (42, Osaka, with an AI export) and Tom
(58, Leeds; end age 73). The hybrid arm is the new Auto default: Flash-Lite writes the years, except the first 2
years after every fork (the consequence of their answer), which 3.8 Flash still writes. Decisions, profile, settings,
ending and chat stay on 3.8 Flash.

| Config (final engine) | Sessions | Overall | Personal | Believable | No melodrama | Forks | Specific | Ending | Safety | Schema-valid | Rule-valid (1st pass) | First year after a fork (median) | Per year | Start → first card | $/session |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gemini-3.8-flash everywhere | 1 (Kenji) | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 100% | 89.7% | 5.1 s | 2.82 s | 4.2 s | $0.27 |
| **hybrid** (3.8 Flash + Flash-Lite Auto years) | 3 | **5.0** | 5.0 | 4.0 | 5.0 | 5.0 | 5.0 | 5.0 | 5.0 | 100% | 98.8% | 5.1 s | 2.69 s (1.99 s on Kenji's long stretches) | 5.6 s | **$0.24** |

- The fixes held: the rolled setbacks appear (Lucía: two burnout stretches, a facade assessment, a lost municipal
  contract, paid care for her mother in Alicante), no heritage was inferred, and no fallback decision cards appeared.
- Start → first card fell from ~15 s (profile, then card) to 3.5-8.5 s (card from `provisionalProfile` in parallel).
- 3.8 Flash per year fell from 3.83 s to 2.82 s with one streamed call per stretch.
- New judge notes: base rates are US data even for Spain (known; the UI should show "US, applied as approximate"),
  and an interlude caption called a 26-year-old son "the teenager". Captions now get the people's age bands.

## Recommendation

1. **Heavy model: `gemini-3.8-flash`, thinking low**, for the profile, big decisions, live settings, the ending,
   chat, and the years at 1x and 2x. It won every quality criterion, never produced an invalid year, and costs
   **~$0.27-0.33 per Auto session**.
2. **Auto and 4x: the hybrid writer** (`models.yearsBySpeed = { auto, 4x: "gemini-3.5-flash-lite" }`,
   `forkLeadYears: 2`; this is now the engine default). Same judge overall score (5.0, believable 4.0 vs 5.0 on n=3
   vs 1), $0.24 per session, and it keeps a stretch ahead of 1.5 s/year playback. Rough timing for a 25-year-old's
   Auto run: start → first card ~5 s, then each fork's stretch (about 9 years) needs ~17 s to write vs ~21 s to play
   (8 s interlude + 9 x 1.5 s). With 3.8 Flash alone the same stretch needs ~26 s, so the clock would slow about
   5 s per fork (~25 s per run). If Saturday testers find the hybrid lives flatter, set `yearsBySpeed: {}` for 3.8
   Flash everywhere and accept the slower clock.
3. **Fast model: `gemini-3.5-flash-lite`** for hidden branches (coarse, a third of the session cost), small
   decisions, answer folding, safety, interlude captions. Fallback racer: `gemini-3.6-flash`.
4. **Do not use `gemini-4-argon` live** (10 s median first year, 60 s worst, 20 s decisions, 2x cost, no quality
   gain here). It is still the judge. **Do not use `gpt-oss-120b`** at all.
5. **Average latency to the first year** after a fork: median 5.1-5.6 s on 3.8 Flash (mean 7-8 s because of the
   pre-first-token stall tail that the hedge now cuts off). The fork moment and the 6-10 s interlude cover it.

## Spend

| Item | $ |
|---|---|
| Dev smoke tests and benchmarks | ~0.95 |
| Main run (15 sessions + judge) | 5.46 |
| Confirmation runs (4 sessions + judge) | 1.07 |
| **Total** | **~7.5** (cap ~8) |

The main run stopped itself at its $7 projection gate after 15 of the 32 planned sessions. Argon and gpt-oss had
already shown the same pattern on 3-4 personas each, so the remaining budget went to the confirmation run.

## Auto judge run: timing, money and cost (Quality pass, Sat Nov 7 ~5-8am)

Measured with `npx tsx scripts/judge-run.ts [url] --read <s>` against a local production build (`vite preview`,
real engine). The script plays the client's part exactly as `src/ui` does (life clock, fork moment, world-driven
interlude cuts, moment holds, reading time per card), so a hidden browser pane can't stall the numbers.
Start click = 0. "answer → cuts" is what the user waits for after each fork.

| Run | Reading per card | Start → ending | First card | answer → cuts (5 forks) | Starved | Moments (held) | Net worth at 70 | $ |
|---|---|---|---|---|---|---|---|---|
| **Before** (29a2c96), Alex | 2 s | **174 s** | 4.7 s | 13.1 / 6.3 / 7.7 / 7.5 / 4.9 s | 8.3 s | 10, cut after ~2 s | $425k-$450k (1.06x) | 0.37 |
| After, Alex | 2 s | **165 s** | 5.0 s | 5.8 / 0.1 / 0.1 / 0.1 / 2.7 s | 0 | 7 (2.5 s each, they finish) | $157k-$843k (5.4x) | 0.43 |
| After, Alex | 5 s | **167 s** | 4.2 s | skipped / 1.1 / 0.1 / 0.1 / 4.4 s | 0 | 9 | $156k-$978k (6.3x) | 0.38 |
| After, Maya (31, nurse) | 3 s | **154 s** | 4.3 s | 17.9 / 0.1 / 0.8 / 0.1 / 4.3 s | 0 | 6 | $257k-$1.72M (6.7x) | 0.35 |
| Final (main merged), Alex | 2 s | **166 s** | 4.5 s | 7.6 / 0.1 / 0.1 / 0.1 / 0.1 s | 8.2 s (one stall) | 9 | $140k-$845k (6.0x) | 0.41 |
| Final, Ploy (Durham → Bangkok at 47) | 3 s | **157 s** | 4.9 s | 6.5 / 0.1 / 0.1 / 0.1 / 0.1 s | 0 | 7 | $220k-$718k (3.3x), Bangkok pay ~1/3 | 0.42 |
| Production (7c1a672 deployed), Alex | 4 s | **196 s** | 3.9 s | 5.0 / 0.1 / 4.3 / 0.1 / 0.1 s | **38 s** (one 35 s stall at 37) | 7 | $131k-$970k (7.4x) | 0.39 |

The production run lost 35 s to one stalled year stretch (every racer waited). Likely cause: the Worker's ~6
open connections were shared by the year stream and its hedges, three hidden-branch steps, the next decision and
settings. Hidden-branch steps now wait while a year stretch is in flight with < 4 years buffered (commit after
7c1a672, not deployed by this pass).

- Each fork now costs ~7.9 s from the answer to life resuming (2.4 s fork moment + 3 x 1.8 s cuts), down from
  10-18 s. Forks are prepared while the card is open (`prepareFork`); the first fork still waits on the profile
  (7-20 s from the start) when the answer comes fast, and Auto skips that interlude past 8 s.
- 3D moments are fewer (turning points, >= 3 years apart) but now play out; they cost ~2.5 s each.
- Cost: +3-15% per session (one extra single-snapshot branch per fork, more small branch calls; fewer year calls).
- Money lanes (`worker/engine/money.ts`) spread the four lives; place re-anchoring and a savings + returns bound
  stop runaway growth after a move abroad.
- Budget for a judge: ~150 s + 5 x (reading time). With ~5 s per card it lands near 3 minutes; D-090's warm-up
  questions will add to that by design.

## What the judge caught, and what changed in the engine since the main run

The main run used commit `85b4dbb`. Fixes made from its transcripts and the judge's "fix" notes:

| Finding | Fix |
|---|---|
| A model gave a Columbus family dumplings and scallion pancakes from the name "Maya" alone (a D-011 violation, 3.8 Flash and Argon) | Content line: culture, food, faith and customs only from what they said or the place they live. |
| A hidden branch kept a mother "on the veranda" at ~98; branch net worth jumped around | The year prompt now states the parents' approximate ages. Coarse snapshots never repeat events. |
| Branches inherited the chosen life's later answers (same caregiving plan, same book in every life) | Branches only see quotes from before their fork. |
| Lives were too rosy: Dani's 47 years had no setback at all | Code owns the odds: when the base-rate dice roll a layoff, burnout, money setback or caregiving stretch, the writer must use it (gently). Setback dice respect the 3-year shock cap. |
| Argon's decision cards timed out into "Something has to give this year" | Near-valid JSON is coerced, a third try uses the other tier, the last-resort card names the life-stage moment, and thinking-first models get a 15 s hedge and a 60 s deadline. |
| Option labels were cut mid-phrase ("...focus on your porch and") | Labels are cut at a comma or a whole word, never on "and". |
| The interviewer invented a statistic; replies used markdown | It may cite only the base rates already in their life; plain text only. |
| Generation fell behind Auto playback (3.8 s/year vs 1.5 s/year) | Compact year schema (~490 → ~280 output tokens/year), one streamed call per stretch of up to 10 years (call boundaries cost 5-9 s), and the hybrid Auto writer below. |
| ~15 s from the start screen to the first card | `provisionalProfile(input)` lets the agent write the first card in parallel with `startProfile`. |

## Consistency pass: the life ledger (Engine content, Sat Nov 7 ~6-9am)

The QA inspector's live sessions showed lives that forgot themselves: a card at 31 set "ten years into
San Francisco" after Jordan chose CMU, a director post offered to Marisol two years into retirement, Bea
"nineteen" when she was 24, one child at 70 for a mother of two, a partner Jordan never had, a dog alive
37 years after adoption, and the first card saying "It's spring 2026" on November 7.

**What changed.** `worker/engine/ledger.ts` replays a life into code-owned facts at any year: place,
work (and retirement), the people with birth years and status, pets with a real lifespan, and the forks
taken. Every year the model now writes `w` (work) and `ch` (people changes: `+partner:Sam`, `+child:Bea`,
`+pet:dog:Barnaby`, ...), and each `SimYear` carries `life = {work, ch, people}`. Every generator gets one
NOW block (today's date, place, work, people with code-computed ages, forks). `consistency.ts` and
`calendar.ts` check text against it: wrong ages and children counts are rewritten in code; a phantom
partner/child/pet, a pet past its time, a repeated summary or turning point, or a past season in the
first year is a hard error in a year (one repair, then fallback); a decision that names a place or
employer they've left, offers work to a retiree, repeats an earlier fork's subject, or reuses a recent
small-card framing gets one rewrite. Scene people come from the ledger, so the ending's people line is
computed in code.

**Measure.** `npm run eval -- --smalls 15` writes 15 small cards per session on top of Auto, and every
session prints its violations (`scripts/eval/consistency.ts`, code only; also runs on old run files).
Same 5 personas before (the engine at `29a2c96`) and after, hybrid Auto writer, no judge. Two new personas
are shaped like the QA sessions: `jordan-21-pittsburgh` (SF vs CMU, a dog) and `marisol-52-quezon` (teens
with stated ages, retirement by 60).

| Violation | Before | After |
|---|---|---|
| Small card reuses a recent time/setting ("Sunday", "2am", within 3 cards; late night within 6) | 9 | 0 |
| Ending people line wrong (children missing or miscounted) | 10 | 0 |
| Near-duplicate summary or event within 3 years | 3 | 0 |
| A named person's age wrong | 1 | 0 |
| First card set in a season that has passed ("It is spring 2026 at CMU") | 2 | 0 (all 5 say November / late 2026) |
| Phantom child | 1 | 0 |
| Pet past its lifespan (Barnaby, adopted 2026, in 2047-2075) | 16 | 9* |
| Phantom partner in a branch's people line | 0 | 2* |
| Fork repeats an earlier fork's subject | 1 | 1 (Cebu: a son moved there, a real revisit) |
| Card sets the scene in another city | 0 | 1 (Penn Hills, a Pittsburgh suburb) |
| **Total (5 sessions)** | **43** | **13** |

\* Both from two ledger gaps the after-run exposed, fixed in `3fc5510` and not re-run at full length
(budget): the profile never listed Barnaby as a person, so he never entered the ledger (pets named in
their own words are now added); and people first named in later answers (Elena, at 29) leaked into
branches forked before them (`profileAsOf`). A $0.015 smoke on Jordan's state confirms Barnaby leaves on
schedule, a child arrives through `+child:Leo` with a code-owned age, and the future self says the dog is gone.

Cost and speed held: $0.27-0.34 per session (was $0.24-0.33), 3.67 s per year, 6.2 s median first year
after a fork (before: 3.3-6.2 s/yr, 5.1-8.2 s). Spend for this pass: ~$2.91 (baselines $1.38, after $1.51, smoke $0.02).

## Method

**Personas** (`scripts/eval/personas.ts`): eight fictional people, written as the start line they would type
at "What's on your mind lately?", plus a hidden truth and a voice for the user simulator.

| Key | Age | Place | Money | The thing on their mind |
|---|---|---|---|---|
| maya-19-columbus | 19 | Columbus, OH, US | tight, loans | pre-nursing for her parents vs. ceramics |
| dani-24-lagos | 24 | Lagos, NG | supports sisters | a London fintech offer vs. staying for family (CV attached) |
| priya-27-bengaluru | 27 | Bengaluru, IN | comfortable | marriage pressure vs. a design master's in Berlin |
| marcus-31-atlanta | 31 | Atlanta, GA, US | tight, $45k loans | his wife wants a baby; he's scared |
| lucia-36-valencia | 36 | Valencia, ES | okay, single parent | architecture hours vs. a teaching job home by four |
| kenji-42-osaka | 42 | Osaka, JP | okay | 19 years at one firm, burned out, aging parents (AI export attached) |
| denise-50-phoenix | 50 | Phoenix, AZ, US | okay, pension | empty nest: travel nursing vs. keep the pension safe |
| tom-58-leeds | 58 | Leeds, GB | okay | redundancy payout and the narrowboat (end age 73) |

**Session** (`scripts/eval/session.ts`), the way the session agent will drive the engine in Auto mode:
`startProfile` → `planSlots` (5 big, 0 small) → for each big slot: generate years up to it, `makeDecision`,
the user simulator (`gemini-3.5-flash-lite`, role-playing the hidden truth) taps an option and writes a sentence,
`safety`, `applyAnswer`, then in parallel `spawnBranches` + `generateYears` (fork year to the next slot) +
`settingsFor`, then `interlude` → after the last slot, years to the end age → `ending` → one `replyAs` future-self reply.

**What changes between models:** only the heavy tier (`models.heavy`, and repair follows it): profile
extraction, big decisions, every chosen-life year, settings, ending, chat. The fast tier
(`gemini-3.5-flash-lite`: answer folding, safety, interlude captions, coarse branches) is the same for all.

**Measures**
- *Judge* (`gemini-4-argon`, thinking low): the rubric in `scripts/eval/judge.ts`, 1-5 on personal (cites their
  words), believable (base rates, money), no melodrama, forks (4 genuinely different options), specificity,
  ending (verdicts + five-year answers), safety; plus overall, best line, worst line, one fix.
  Argon also generates one of the four arms, so its own scores may be inflated (self-preference); read
  its numbers with that in mind.
- *Schema-valid*: share of chosen-life years whose raw model JSON passed the zod draft schema before any code fix.
- *Rule-valid*: share of years with no hard validator error on the first pass (banned content, uncited turning
  point, budget/cooldown, world events, shock cap). Hard errors get one repair call, then a code fallback.
- *Latency*: time from each `generateYears` call right after an answer to its first finished year (what the
  user waits for after a fork; median over all forks), and average wall time per generated year. 5 sessions ran concurrently, which
  likely adds load-related stalls.
- *Cost*: every call's `usageMetadata` priced with `scripts/eval/pricing.ts` (research/04 §1 prices; thinking
  tokens billed as output; gpt-oss price is an estimate). Session cost excludes the user simulator and the judge.
