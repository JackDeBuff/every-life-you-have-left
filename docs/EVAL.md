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

## The warm-up (D-090): timing against the real engine (Sat Nov 7 ~6-7am)

`npx tsx scripts/warmup-run.ts <url> --persona minimal|medium|rich [--think 6] [--tap]` on a local production
build (`vite preview`, real Gemini). "Start → Q1" is the agent's latency (the browser adds ~0.2-1 s to mount the
Play screen; measured 0.16-1.2 s in headless Chrome). "Card" = last answer → first big card on screen.

| Persona | Start line / uploads | Asked | Covered by line/uploads | Start → Q1 | Card after last answer | Card uses the warm-up |
|---|---|---|---|---|---|---|
| Minimal (Sam, 22, Chicago) | "idk, stressed about jobs" | 5 | 0 | 0.07 s | **1.95 s** (typed, 6 s/question); 1.93 s (taps, 2 s/question) | yes: the uncle's Milwaukee warehouse job, Mom, editing videos in LA (crossroads, people, unjudged); taps: cites the warm-up quote |
| Medium (Priya, 29, Columbus) | 52-word line: ER nurse, $72k, money home to Pune, in-laws | 2 (fear, unjudged) | 3 (now, crossroads, people) | 0.07 s | **1.58 s** | yes: whyQuoteId = the fear answer; New Zealand travel nursing is an option |
| Rich (Marcus, 34, Seattle) | AI export, 2.6k chars | 1 (unjudged) | 4 | 1.34 s ("Reading what you gave me" while the check runs) | **1.83 s** | yes: "Quit tech to teach high school physics and build furniture" |

- How: the first fork is written in the background (heavy model) once the crossroads is known, again whenever
  answers came in since; after the last answer a fast-model refresh with every answer gets 3 s, else the newest
  card stands. In every run above the refresh landed (1.5-1.9 s) and was used.
- Full Auto judge run with the warm-up (`judge-run.ts --persona maya --read 2`, taps): 3 warm-up questions,
  first fork 1.8 s after the last answer, **144 s Start → ending**, 5 forks, no errors. Warm-up model spend
  $0.008 of the session's $0.36 (coverage + folds + personalized answers on Flash-Lite; the rolling first-fork
  cards are under "decision").

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

## D-089: small decisions in batches, and the 1× deep mode (Sat Nov 7 ~7-9am)

**What changed.**
- One fast call (`decision.smallBatch`) writes the next 3-4 small cards, each on its own domain and gap. The domain is
  chosen at batch time (worry-weighted, least known, least asked) and each domain has 3-4 gaps taken in turn. The agent
  keeps the cards in a queue and serves each one the moment its slot comes. `bindSmall` re-checks it in code against
  the life then (place, job, people, date).
- A batch covers only the slots before the next fork. The queue is dropped only when the context changes: a fork, a
  nudge, a speed change, new documents, or an answer that opens a new thread. That check is code heuristics (a person
  they never named, quitting, moving, love, a baby), plus the fold's profile delta. A thread, or an answer that begs a
  question ("only if...", "it depends on..."), gets one follow-up, written singly and served next.
- A small answer becomes a quote at once, in code. Answers fold into the profile every 3 answers or before the next
  year call, in one call (`answer.fold`). A fork's answer folds together with the small answers still waiting.
  **Small answers no longer rewrite the buffered future.** Only forks and nudges do. Safety still screens every text.
- Prompts put the stable part first: year prompts open with the base-rate table, then the person, their words and the
  life so far; the volatile parts come last. DECISIONS shows every fork and only the last 8 small answers.
- 1×: ~150 small / 20 big (D-081 amended). It allows up to 7 cards in a free year and blocks only the fork's own
  year. With the old two-year block, the 45-card plan placed **5** cards at 1× for a 25-year-old.
- `SMALL_BATCH=off` (an env var) brings back the old path, for measuring.

**Measured** with `npx tsx scripts/judge-run.ts <url> --speed 1x --read 3 --small-read 3` on a local dev server
(Alex, 25, 46 years). The script answers every card after 3 s; about half the answers include a sentence of its own,
and every 9th opens a thread.

| | Before (`SMALL_BATCH=off`, old prompt order), first 10 years | After, first 10 years (full run) | After, first 10 years (final code) | **After, full 1× life** |
|---|---|---|---|---|
| Cost (cache-discounted / list) | $0.303 / $0.305 | $0.310 | $0.299 / $0.311 | **$1.38 / $1.43** |
| Model calls | 77 | 89 | 81 | 357 |
| Small cards shown (answered) | 6 (5) | 17 | 13 (12) | 86 (69, 39 with text) |
| Small-card calls | 6 single | 10 batch + 2 single | 7 batch + 1 single | 50 batch + 5 single |
| Fold calls (answers folded) | 3 (3) | 4 | 4 (6) | 21 (38) |
| Year calls (+ repairs) | 11 (+1) | 8 | 8 | 25 (+8) |
| Forks | 6 | 6 | 6 | 21 |
| Cache hits (share of input tokens) | 2.0% | — | 11.0% | 7.5% |

- **Old path, projected to the same life.** Every answered small card cost one rewrite of the buffered years
  ($0.0106 per call), plus a card ($0.0015) and, for typed answers, a fold and a safety call. That is about $0.012 per
  answer. Applied to the run above (86 cards, 69 answers) the old path comes to **~$2.1**; at 150 answered cards,
  **~$3.1**. The new path costs about $0.003 per card. At 150 cards that would be **~$1.6**, still under the $1.8 target.
  The old path also showed far fewer cards. When an answer bumped the epoch, the second card of the same year was
  dropped: 6 cards in 10 years against 17.
- **Where a 1× life's $1.38 goes:** hidden branches $0.45, year calls $0.32, small batches $0.20, big cards $0.18,
  settings $0.11, folds $0.04, everything else $0.08.
- **Speed.** The time from an answer to the next card in the same year was a median of **0.07 s** (max 1.9 s, 65
  cases); 81 of 86 cards came straight from the queue. 5 cards waited: 56 s in all, the longest 19.6 s. The run had 8
  answers that opened a thread, and each one drops the queue by design (the follow-up is written singly). They are the
  likely cause, and a `[small] waited` log line now records each wait. Never starved; the whole 1× life took 13 min.
- **Pacing at 1×.** The clock runs at 0.5× while a card is up. There is one card at a time, and cards the playhead
  passes are dropped. Answering in 3 s, the script saw 86 of the 150 planned cards (~3.5 per free year), so a person
  sees as many as they answer. The first full run had 17 cards shelved by the fork that followed them. Now no new card
  starts in the last part of the year before a fork.
- **Auto must not get worse:** $0.382 (list $0.412), 156 s, 5 forks; before: $0.37-0.43 for Alex (table above).
- **Implicit cache.** A probe sent the same 6.5k-token prefix (system + base rates + a life) back to back on the
  `global` endpoint. `gemini-3.8-flash` never reported `cachedContentTokenCount` (0 of 11, serial or parallel).
  `gemini-3.5-flash-lite` hit 2 of 8 parallel calls, ~4k tokens each time. 3.8 Flash isn't served on `us-central1`
  (404). So the hits are almost all on the hidden branches (Flash-Lite, written in parallel bursts): 14-25% of their
  input. Moving the per-life label after the shared prefix raised branch hits from 3% to 14-25%. Cached tokens are
  priced at 10% of input. That is an assumption (Google's published rate for 2.5); research/04 has no cache price
  for 3.x. Cache savings are small (~$0.04 per 1× life), so the gain comes from making fewer calls.
- **Content-consistency guard** (`npx tsx scripts/eval/index.ts --models gemini-3.8-flash+auto:gemini-3.5-flash-lite
  --personas lucia-36-valencia,kenji-42-osaka --smalls 15 --no-judge`; small cards now written 4 per call). Final
  code: **Kenji 0, Lucía 0 violations**, against a baseline of 0 and 0 (engine-content after-run). An earlier run had 5
  "age" violations for Lucía. A later answer said Leo was nineteen, and the ledger read that age as said on day one
  (Leo 8 → 30). Fixed in `ledger.ts`: an age counts from the year it was said.

Spend for this pass: ~$3.6 (before run $0.30, full 1× $1.38, two eval runs $1.21, Auto $0.38, 10-year check $0.30,
cache probes ~$0.05).

## Pacing fixes after the final QA pass (Sat Nov 7 ~10am-12pm)

`npx tsx scripts/judge-run.ts <url> --speed 1x|2x|auto --read 3 --small-read 3 [--years N]` on a local production
build (`vite preview`, real engine), Alex 25. The script answers every small card after 3 s and now prints cards on
screen per year, cards cut off by a fork, every interlude's length and fork → resume. "Before" is the QA pass on
production (a person playing).

| | Before (QA) | After |
|---|---|---|
| 2× small cards | **0 in 23 years** (`smalls.served` 0, slots ran 14 → 9 unused) | **17 in 26 years**, 0.65 a year (1 every 1.5 years), none cut off; a 13-year run: 8 (0.62) |
| 2× forks | every 2-3 years, 10 by 57 | 25 28 32 36 40 44 48 52: every 4 |
| 1× small cards | 5 in 9 years, 33 slots unused, 2 cut off after 11-15 s | **33 in 11 years, 3.0 a year** (4 in every year but one), none cut off |
| Interludes 1×/2× | 9-20 s, `interlude_late` | cuts on screen at once; 6.9 s of cuts (fork phase 9.3 s incl. the fork moment; 10-year one 7.0 s) |
| Fork → resume 1×/2× | up to 22.5 s | 9.4 s median, max 10.6 s (1× 9.4 s every fork) |
| Auto, 2 s reads | ~2:26 of machine time | 151.5 s total, 137.5 s machine (158.5 / 144.5 s before the last two cuts) |

**Why 2× showed nothing.** Three rules stacked: the planner kept a fork's year and the year after free, the agent also
skipped the year *before* a fork (a fork used to shelve an open card), and windowed fork picks put 2× forks 2-3 years
apart. With a fork every 3 years, no year was left. Now 1×/2× forks sit at even spots (the nearest life-stage moment
names each), the year before a fork is allowed, and a fork never shelves an on-screen card: the agent waits
(`gateCheck`) and the clock holds that year's end (`state.nextFork`, `src/ui/pacing.ts holdsYearEnd`).

**Why 1× showed so few.** A 1× year is 6-12 s; a person answering in 10-15 s got one card a year, none in a fork's
year, none started in the last 6 s before a fork, and a fork shelved the one that was open. Now 1× (the conversation)
plans 3-4 cards in every year, a fork's year included once its consequence has played 3 s; the year doesn't end while
a card is open or the next is being written (`state.smallDue`, 6 s at most); a "Let it slide" button lets one go. Two
intermediate runs measured 1.73 and 1.64 a year: in a fork's year the agent wrote *next* year's card ahead during the
quiet moment, and that blocked this year's (fixed).

**Interludes.** `prepareFork` already ran at every speed and was ready at almost every 1×/2× fork (`[prepare]` /
`[fork]` logs). The long waits were the 13 s fork deadline (+4 s for the cuts) and the 10-year interlude, which was never
prepared and stepped every branch on the spot. Now: past 3.5 s (6 s for a first fork, which has no other lives; Auto
8 s) the lives that are ready play (`readyCuts`: latest snapshots, code captions, no model call); the 10-year interlude
is written a few years ahead and otherwise falls back the same way; cuts are 2.3 s (Auto 1.6 s).

**Auto length.** Safe cuts: cuts 1.8 → 1.6 s; 3D moments at most one every 6 years (a run held 9, 22.5 s; now 5,
12.5 s); once the last fork is behind and the ending is written (`state.endingReady`), the last years play at 0.9 s,
so the coda can never add a wait (the ending was written 11 s after it started, shown 0 s after the last year). The
final run still lost 8.1 s and 6.5 s to two late fork preparations (Auto waited 8 s for them); with lives to fall back
to it now waits 3.5 s at every speed, so a run like it should land near 130 s of machine time (not re-measured: spend
cap). A judge reading ~10 s per card adds ~70-110 s, so ~3.5-4 min.

Spend for this pass: $2.55 (2× 13 years $0.25, 2× 26 years $0.43, three 1× 10-year runs $0.92, two Auto runs $0.87,
a UI check $0.05).

## Engine content after the final QA pass: forks, typed answers, people (Sat Nov 7 ~10am-1pm)

**Why the forks forgot earlier choices.** The NOW block comes from the year ledger, not the profile, but only from the
years written when the card is written, and big cards are written up to 8 years ahead (Auto), sometimes before the
previous fork is answered. And the checks were thin: place/employer only on the question, repeat-topic only between
prompts (not options, chosen paths or typed words), two-letter names (UK, UX) ignored, and "still"/"back"/"this time"
excused any repeat. Now `forkIssues` checks the question and every option against the ledger and every fork taken
(one repair, then one regeneration), the agent re-checks a card written ahead when its years land (rewriting it if a
fork was answered since or it no longer fits), and a fork never rewrites a played year. Typed fork answers are their
own path (`engine/answers.ts`); ages, pets and friends come from uploads (`Person.born`); one parent's old-age death is
code-owned and always logged; stated income is an anchor (₦ amounts now parse).

**Measured** with `npm run check:qa -- --live <url>`: Sam (22, Chicago, minimal, Auto, whole life), Chidi (34, Lagos,
naira, 2×, 16 years, a typed fork answer without a tap and one that refuses the tap), Margo (41, Toronto, AI export only,
2×, 12-14 years). Before = main at `0127d26` with the old card's typed-answer guess; after = this branch merged with
main. Both scored by the same code (`scripts/qa/live.ts`); the code checks (`npm run check:qa`) hold the QA's exact cards.

| Violations (3 sessions) | Before | After |
|---|---|---|
| Fork offers a path already taken / stays with what they left / repeats an earlier option | 12 | 0 |
| Fork offers an entry-level step after years in the field; names a past employer; ignores the latest fork | 3 | 0 |
| A played year rewritten later (Jamie's separation) | 9 | 0 |
| Typed answer filed under an option, or logged as one | 2 | 1* |
| People without ages, missing (Biscuit, Hanna), learned panel empty | 5 | 0 |
| Two parent deaths | 1 | 0 |
| Stated income off by >10% (₦600k a month); "every dollar" to a naira user | 2 | 0 |
| **Total** | **34** | **1** |

\* "No, none of these. I'd take a year to teach kids to code" was logged "You chose: None of these"; fixed after the run
(the label comes from the first sentence that says something), now a code check. After-run cards were repaired by the
same checker, so read them too: Sam at 27 got a mid-level promotion vs an LA lead role (no junior step); Chidi at 41,
"London promotes you to team lead"; Sam's father dies once, at Sam's 55, in the log.

Spend for this pass: $2.00 (before $0.94, after $0.91, a 5-year smoke $0.16).

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
