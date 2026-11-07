# Engine eval (WP1)

Run it: `npm run eval` (all 8 personas x 3 heavy models, judged by `gemini-4-argon`).
Options: `--models a,b`, `--personas key,key`, `--n 2`, `--budget 8`, `--concurrency 4`, `--no-judge`, `--verbose`.
Read a run: `npx tsx scripts/eval/show.ts [run-file] [persona] [model]` prints exactly what the judge saw.
Full transcripts land in `scripts/eval/results/run-*.json` (gitignored); summaries in `summary-*.json` (committed).

RESULTS_PLACEHOLDER

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
  Argon also generates one of the three arms, so its own scores may be inflated (self-preference); read
  its numbers with that in mind.
- *Schema-valid*: share of chosen-life years whose raw model JSON passed the zod draft schema before any code fix.
- *Rule-valid*: share of years with no hard validator error on the first pass (banned content, uncited turning
  point, budget/cooldown, world events, shock cap). Hard errors get one repair call, then a code fallback.
- *Latency*: time from the `generateYears` call after the first decision to the first finished year (what the
  user waits for after the fork), and average wall time per generated year. Concurrency 4 during the run.
- *Cost*: every call's `usageMetadata` priced with `scripts/eval/pricing.ts` (research/04 §1 prices; thinking
  tokens billed as output; gpt-oss price is an estimate). Session cost excludes the user simulator and the judge.
