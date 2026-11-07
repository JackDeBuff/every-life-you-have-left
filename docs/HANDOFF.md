# HANDOFF: start the next session here

Written Sat Nov 7 2026, ~10:50am EST, at the end of the long kickoff session (Fri 10pm → Sat 11am).
Read this first, then `CLAUDE.md`, `DECISIONS.md` (the v2 section at the top), and `docs/SPEC.md`.

## Where we are
| | |
|---|---|
| Live V1 | https://every-life-you-have-left.supawich.workers.dev (Cloudflare Worker `every-life-you-have-left`, Workers Paid) |
| Repo | https://github.com/JackDeBuff/every-life-you-have-left (public; Paul = `Puminunp`, write access). `main` is the truth |
| Production version | `23ad6f96` (Sat Nov 7 ~3:25pm: playtest fixes round 1). Check: `npx wrangler deployments list \| tail -8` |
| Deadlines | Devpost submission **Sun Nov 8, 9:30am**. Expo judging Sun 10:00–12:15 (in person, Wilkinson). Track: Social Impact & Education |
| Team | Supawich (owner, "broski"), Paul (testing + maybe pitch). Most code is written by Claude agents |

Verified state:
- A scripted Auto judge run on production took 147 s, with no errors, 5 forks, fork→resume ~7 s, $0.37 per session.
- The final QA inspector called it "judge-ready", and all its issues were fixed.

## What the product is (v2, final design: D-080..D-090)
Three panes plus a timeline bar:
- **Left:** illustrated portrait (from a selfie; ages) + bio + status rose (10 domains).
- **Middle:** a 3D diorama world of the chosen life (R3F, CC0 assets) + the life log with "why".
- **Right:** live life settings + chat with decision cards (4 answers + always-open type/voice box).

Flow: start → **warm-up** (≤5 questions, skips what uploads already cover) → life plays year by year → small decisions (batched, instant) and big decisions (forks; the 3 unchosen options keep living as hidden branches, shown in "Meanwhile, in your other lives…" interludes) → the ending at 70:
- verdicts
- "Your words did this"
- the postcard from 70 with QR → `/s/<id>` share page
- the five-year answer card with TTS
- letters / twin chat

| Speed | Small decisions | Big decisions |
|---|---|---|
| 1× (deep) | ~150 | 20 |
| 2× | 30 | 10 |
| 4× | 15 | 5 |
| Auto (judge) | 0 (warm-up still runs) | 5 |

## Architecture (where things live)
- `shared/`: contracts.
  - `schema.ts`: Profile, Year, events
  - `sim.ts`: SessionState, Decision, LiveSetting, SceneSpec, SimYear (+`life` ledger), SPEED_CONFIG
  - `engine.ts`: the Engine interface
  - `currency.ts`: 44 currencies
  - `baseRates.ts`, `domains.ts`
- `worker/`: Hono API + the Agents SDK `SessionAgent` Durable Object (`worker/agent/session-agent.ts`, the orchestration loop; `protocol.ts` is the wire protocol with patches).
  - `worker/engine/`: all prompts and life logic:
    - `index.ts` (wiring notes at the top)
    - `ledger.ts` (people/place/work truth)
    - `consistency.ts` (validators)
    - `smalls.ts` (batched small cards)
    - `warmup.ts`, `answers.ts` (typed answers → own branch), `money.ts` (money lanes)
    - `prompts/`
  - `worker/llm.ts`: Gemini/gpt-oss/image/TTS/transcribe.
  - `worker/share.ts`: share pages.
  - `worker/admin.ts`: admin API.
- `src/`: React UI.
  - `src/ui/`: panes, timeline, decision card, clock, `live.ts` client.
  - `src/world/`: 3D; lab at `/#world-lab`.
  - `src/screens/Ending.tsx`.
  - Offline demo: `/?demo=alex&autopilot=1`. Fresh session: `?new=1`.
- Data: Durable Object SQLite (live state) + D1 `elyl-db` mirror (admin) + R2 `elyl-uploads` (uploads, portraits, postcard PNGs). Migrations 0001–0004 are applied remotely.

## Models (Google Cloud Agent Platform, project `triangle-ai-hack-2026`, $100 credit)
| Role | Model |
|---|---|
| Heavy | `gemini-3.8-flash` (thinking low) |
| Fast | `gemini-3.5-flash-lite` |
| Fallback | `gemini-3.6-flash` |
| Image | `gemini-3.1-flash-image` |
| TTS | `gemini-3.8-flash-tts` |
| Eval only | Argon, gpt-oss |

Notes:
- Claude, GPT-6 and Kimi/GLM/DeepSeek were checked and rejected (Marketplace billing / unavailable / retired). See D-071.
- Cost: Auto ≈ $0.37 per session; a full 1× life ≈ $1.4.
- Check credit usage in GCP Billing → Reports (budget alerts at $50/$90/$100).

## How to work (rules that bit us)
- **Secrets:** `GCP_API_KEY` and `ADMIN_PASSCODE` live in `.dev.vars` (gitignored) and in Wrangler secrets. Never print or commit them.
- **Deploy:** only the lead deploys, from merged `main`: `npm run deploy` (allowed by `.claude/settings.local.json`). If the auto-mode classifier blocks it, give the owner the command.
- **Agents:** they work in worktrees (`isolation: worktree`), commit on their own branch and never deploy. The lead merges (`git merge --no-ff`), resolves `package.json`/lockfile conflicts (union the deps, `git checkout --theirs package-lock.json`, `npm install`), then typecheck → push → deploy.
- **Usage watch (owner's standing rule):**
  - Poll `codexbar usage --provider claude --json-only` (primary.usedPercent) with a Monitor every 2 min.
  - At **92%** of the 5-hour window, tell every running agent to commit and pause; resume after the reset.
  - Weekly usage was 38% at the end of this session.
- **Shell gotchas:**
  - zsh: write `${VAR}:x`, never `$VAR:x`, in URLs.
  - The RTK hook condenses `curl`/`git log` output. Use `/usr/bin/curl` and `/usr/bin/git` for raw output.
- **Checks:** `npm run typecheck`, `npm run check:qa` (consistency regressions, free), `npm run check:currency`, `npx tsx scripts/judge-run.ts <url> --speed auto --read 4` (a real end-to-end run, ~$0.4).
- **Privacy:** production D1 holds real personal data (the owner's and Paul's lives). Never copy it into the repo, docs, commits or agent prompts. Use made-up personas.
- **Final submission (D-070):** at the Sunday freeze, remove `research/`, `docs/`, `prototypes/`, `IDEA.md`, `DECISIONS.md`, `CLAUDE.md` and other planning `.md` files from `main` in one commit, and keep a product `README.md`. The history stays.

## Admin page: DONE (deployed at session end)
- **`/admin` is live:** https://every-life-you-have-left.supawich.workers.dev/admin. Passcode: `grep ADMIN_PASSCODE .dev.vars`.
- **Sessions list:** cost, warm-up count and errors; live refresh.
- **Full session view:**
  - life by year with "why"
  - decisions + answers
  - profile
  - branches
  - ending
  - uploads
  - Health: cost by purpose, engine log, consistency checks
- **"Copy bug report for Claude"** buttons.
- **API:** `GET /api/admin/sessions`, `/api/admin/session/:id` (D1 mirror + the Durable Object's full state via the passcode-checked `adminSnapshot` RPC), `/api/admin/session/:id/checks`.
- **Migration** `0004_admin.sql` is applied remotely.
- Production version at the end of the session: `7e72e43a`.

## Spend caps: LIVE (Sat Nov 7 ~5pm, production `627b35b1`)
- GCP credit: "The Triangle AI Hackathon", $100 one-time, **$58.76 left** at ~4:45pm (Billing → Credits). The billing account has no payment method, so nothing can be charged to a card.
- Where the first $51 went: development (agent evals, QA runs, Argon), not players (all player sessions ≈ $6.40 tracked).
- `worker/spend.ts`: D1 `spend_ledger` (one row per day) gets every model call (agent usage sink) and media call (portrait $0.08, TTS $0.02, transcribe $0.002 estimates). `GET /api/health` shows `spend: {usd, cap, capped}`.
- Caps (wrangler vars): `SPEND_CAP_USD=30` app-wide since the ledger started (at the cap all model calls stop like the kill switch; new sessions get the offline engine); per session `SESSION_SOFT_CAP_USD=2.5` (no more small cards) and `SESSION_HARD_CAP_USD=5` (no more calls).
- Prices in `worker/engine/pricing.ts` were half of what GCP bills for 3.8/3.6 Flash and Argon; fixed (1.5/7.5, 4/20). Per-session costs in /admin before this date read ~half the truth.
- Local evals use the local D1, so they are NOT counted by the prod ledger: keep dev runs small.

## Playtest fixes round 1: DONE (Sat Nov 7 afternoon, production `23ad6f96`)
From the owner's and Paul's own lives. Six agents in worktrees, merged into main:
- **Pacing (1×):** small cards are held in their own year (no more dropped slots); 4/yr in the 20s–30s, 2–3 later, a fork every ~2 years (147 small / 20 big planned). Live check: 28 cards over ages 28–34, 4 each. `worker/engine/small-pace.ts`, `scripts/qa/pace-sim.ts`.
- **Stale cards:** every small card is re-checked against the year it's served in (place/work/people); old-city cards are dropped.
- **Money:** year 1 anchored to stated savings minus debt; code guard keeps income/net worth continuous unless an event explains a jump (`money.ts`).
- **Kids:** a life is closed to children until a fact/answer/fork opens it (`kids.ts`); a children card is planted before ~35.
- **People:** names typed in answers join the ledger; friends drift with distance/time (`closeness`, status `drifted`), never offered again except as a framed reunion; seeded culture-aware name pools (`names.ts`; no more "Lin" twice).
- **Content:** code-owned rare shocks (`shocks.ts`: once per type, ≤1 natural disaster, 0–3 per life, some positive); pandemic at 0.6%/yr (owner wants catastrophes rare, real rate is ~2%); life axes + card focus rotation (`focus.ts`, no work-fork streaks); charitable reading of their words; Google Search grounding at profile build (`profile.grounded`, flash-lite, ≤6 s, user facts win).
- **UI:** no page overflow; draggable column dividers; readable decision card; "Decisions | Steer this life" tabs; compact currency picker.
- **Timeline:** "Road not taken" fork popover (your choice + each other answer at today's age, plain status tags), "N other lives still running" badge, Key legend.
- **3D:** perf pass (N8AO transparency off, shadow map on demand, light pool, frozen matrices, quality tiers; draw calls 414→232) and per-year story beats with name tags (`src/world/story.ts`).

Open follow-ups: branches only snapshot every 5 years (popover shows the nearest age); grounding only at start, not after warm-up; many small cards are reflective rather than situations; DECISIONS.md needs entries for shocks/pandemic (overrides D-005) and D-081 (1× no longer drops slots).
Gotcha: a stale `vite preview` from an old worktree can hold 127.0.0.1:4173 — check `lsof -iTCP:4173` before live tests.

## Next up (owner's plan, Sat Nov 7)
1. **Supawich and Paul playtest their own lives** and report anything weird or unrealistic, using `/admin`'s "Copy bug report for Claude". Fix fast (agents in worktrees), deploy, repeat.
2. Then send the app to outside testers.
3. **Pitch kit** (not started):
   - Devpost text + tagline
   - a 2-minute video script
   - a stage deck (5-minute track-winner pitch)
   - the 90-second table pitch
   - a product `README.md`

   Pitch material is in `research/05-commercial-pitch.md`. Hooks:
   - D-045: "Where do you see yourself in five years?"
   - Cite MIT's 2025 multi-future papers before a judge does (D-043).
   - The 1 in 8 Billion inspiration is credited.
4. Optional: the D-044 before/after study (the 1–7 "connection to yourself at 70" question) with ~15 hackers + a ChatGPT control.
5. **Sunday:** freeze ~7am, D-070 cleanup, final deploy, submit Devpost by 9:30am.

## Known rough edges (not yet fixed)
- Hidden branches still rewrite their own fork year.
- The share page's OG image exists only if the browser's postcard upload succeeds.
- Base rates are US-only (labeled "US figure" for non-US users).
- 3D fps not measured on a MacBook Air.
- Reduced-motion not browser-tested.
- Gemini implicit caching barely hits on the `global` endpoint (~8–18%).
- About 16 old agent worktrees under `.claude/worktrees/` (gitignored, merged). Clean them up when convenient: `git worktree list`, then `git worktree remove --force <path>` for merged ones. Keep any that hold unmerged work.

## Docs map
| Doc | What's in it |
|---|---|
| `DECISIONS.md` | every decision, IDs D-001..D-090. The v2 section on top wins |
| `docs/SPEC.md` | the final design + speed numbers |
| `docs/STATUS.md` | the overnight log |
| `docs/EVAL.md` | model evals, costs, consistency results |
| `docs/UI.md`, `docs/WORLD.md` | visual language and 3D art direction |
| `docs/AGENTS.md` | the agent rules |
| `docs/PLAN.md` | the original plan (partly superseded) |
| `research/01..05` | pre-build research (science, UI, questions, tech, pitch) |
| `docs/plan.html` | the plan artifact (https://claude.ai/artifact/MXzk16zkU1o8sxusqjeNU4) |
