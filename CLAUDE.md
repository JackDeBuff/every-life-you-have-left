# CLAUDE.md — Every Life You Have Left

Hackathon project (Triangle AI Hackathon, Duke, Nov 6–8 2026). Submit by **Sun Nov 8, 9:30am**.
Track: Social Impact & Education. Team: Supawich (owner) + Paul. Most code is written by Claude agents.

**What it is (v2, `docs/SPEC.md`):** you tell it who you are (a short warm-up, optional
CV/LinkedIn PDF/AI-app export); Gemini builds your profile and you live your remaining life year
by year to 70 in a 3D world, with small decisions along the way and big ones that fork it. The
answers you didn't pick keep running as hidden lives (up to 3). Every turning point shows *why*:
the exact sentence you said + a real base-rate statistic. Then verdicts, a postcard from 70, the
five-year answer card, and letters / a digital-twin chat with any version of you at any age.

## Read before working
0. **`docs/HANDOFF.md` — start here** (current state, what's in flight, how we work, next steps).
1. `DECISIONS.md` — what's decided (the v2 section on top wins over everything else, including `IDEA.md`).
2. `docs/SPEC.md` — the final design. (`docs/PLAN.md` is the original plan, partly superseded.)
3. The research doc for your area in `research/` (01 science+naming, 02 UI concepts, 03 questions +
   life model + schemas + base rates, 04 tech stack + code snippets, 05 commercial + pitch).
4. `prototypes/` — the visual prototypes (`delta.html`, `horizons.html`) and `PERSONA.md`.

## Stack
- Cloudflare Workers (Paid plan) — one Worker: Vite + React + TS SPA as static assets, Hono API on
  `/api/*`. D1 for data, R2 for uploads. Deployed to `*.workers.dev`.
- Gemini on **Google Cloud Agent Platform** (formerly Vertex AI), project `triangle-ai-hack-2026`.
  Auth: header `x-goog-api-key: $GCP_API_KEY` (key bound to service account `elyl-worker`).
  URL: `https://aiplatform.googleapis.com/v1/projects/triangle-ai-hack-2026/locations/global/publishers/google/models/<model>:streamGenerateContent?alt=sse`
- Models: `gemini-3.8-flash` (heavy, `thinkingConfig.thinkingLevel:"low"`), `gemini-3.5-flash-lite`
  (fast: branches, small cards, folds, grounding), `gemini-4-argon` (eval judge only), `gemini-3.6-flash`
  (fallback). Temperature is ignored on 3.6+ — make lives differ through prompts. **Do not use
  `@google/genai`; use plain fetch.**
- Cost (real GCP prices, `worker/engine/pricing.ts`, fixed Sat Nov 7 — older figures in docs are
  half for the heavy models): 3.8/3.6 Flash $1.5/$7.5, Flash-Lite $0.3/$2.5, Argon $4/$20 per 1M
  tokens in/out; images ~$0.08, TTS ~$18/M audio tokens. An Auto session ≈ $0.55–0.6, a full 1×
  life ≈ $2 (estimates). The $100 credit had $58.76 left at ~4:45pm Sat.
- **Spend caps** (`worker/spend.ts`, D-098): one app-wide ledger in D1. `SPEND_CAP_USD=30`
  (since the ledger started) stops every model call like the kill switch; per session
  `SESSION_SOFT_CAP_USD=2.5` (no more small cards) and `SESSION_HARD_CAP_USD=5` (no more calls).
  See it in `GET /api/health` → `spend: {usd, cap, capped}`. **Local evals and QA runs use the
  local D1, so the prod ledger doesn't count them: keep dev runs small.**
- Front end: React 19, R3F (3D world), GSAP for UI choreography, Radix, Zustand (D-087).

## Commands
```bash
npm run dev               # Vite + workerd locally (SPA + /api); reads .dev.vars
npm run build             # tsc -b + vite build (client + worker)
npm run deploy            # build + wrangler deploy → https://every-life-you-have-left.supawich.workers.dev
npm run typecheck         # tsc -b over app, worker and scripts (strict)
npm run check:demo        # zod + invariant check of shared/demo/*.json
npm run demo:build        # regenerate shared/demo/alex.json from scripts/demo/build-alex.ts
npm run db:migrate:local  # D1 migrations (elyl-db) on the local dev DB
npm run db:migrate:remote # D1 migrations on production
npm run cf-typegen        # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run eval              # synthetic-persona evals (real model calls, Argon judge; costs money)
npm run check:qa          # consistency/pacing regressions in code (free); scripts/qa/pace-sim.ts for 1× pacing
npm run check:world       # 3D: no walker / walk-in passes through the house or a solid model (free)
npm run check:currency    # currency formatting checks
npx tsx scripts/judge-run.ts <url> --speed auto --read 4   # real end-to-end run (~$0.5–0.6)
npx wrangler ...          # wrangler is NOT global; always npx
```
Smoke tests (prod): `/usr/bin/curl -s $URL/api/health` (includes `spend`) and
`/usr/bin/curl -s -X POST $URL/api/smoke` (`?stream=1` exercises the streaming path). Demo stream
without Gemini: `GET /api/demo/life/<key>`.

## Repo map (details: the Architecture section of `docs/HANDOFF.md`)
- `shared/` — the contract: `sim.ts` (SessionState, Decision, SceneSpec, `SPEED_CONFIG`),
  `engine.ts` (Engine interface), `schema.ts`, `domains.ts`, `baseRates.ts`, `currency.ts`.
- `worker/` — Hono API (`index.ts`), the `SessionAgent` Durable Object (`agent/`), the engine
  (`engine/`: prompts, ledger, validators, `slots.ts` + `small-pace.ts` pacing, `shocks.ts`,
  `focus.ts`, `money.ts`, `kids.ts`, `names.ts`, `pricing.ts`), `llm.ts`/`gemini.ts` (model
  clients, kill switch), `spend.ts` (spend ledger + caps), `media.ts`, `share.ts`, `admin.ts`.
- `src/` — React SPA: `screens/` (Start, Play, Ending, Admin), `ui/` (panes, timeline, decision
  card, clock, `live.ts`), `world/` (3D), `styles/tokens.css` (use the variables, never raw colours).
- `migrations/` — D1 schema 0001–0005. `scripts/` — `eval/`, `qa/`, `judge-run.ts`, `assets/`.
- `wrangler.jsonc` — Worker config (D1 `DB` = elyl-db, R2 `UPLOADS` = elyl-uploads, vars incl. the
  spend caps). Secrets: `GCP_API_KEY`, `ADMIN_PASSCODE`, `DATA_KEY` (all in `.dev.vars` locally).

## Rules
- **Secrets:** `GCP_API_KEY` lives only in `.dev.vars` (gitignored) and `npx wrangler secret put`.
  Never print, log, commit or paste it. Never `console.log` request bodies.
- **Contracts:** `shared/` (schemas, domains, base rates, demo data) is the contract between worker
  and UI. Change it deliberately and update every user in the same commit.
- **Design:** don't copy *1 in 8 Billion* (no bar meters, no year grid, no charcoal+pink/mint). No
  emoji as UI — use the `better-icons` MCP for icons. No purple gradients, no glassmorphism, no
  default shadcn look. Respect `prefers-reduced-motion`.
- **Content rules:** never ask for or use race. No death or serious illness for the user; never the
  death of a partner or child; a parent's old-age death at most once, gently. Personal events over
  world events (≤2 world events per life, no repeated catastrophes). Life shocks and the rare
  pandemic are code-owned (`shocks.ts`, D-092), never invented by the model. Every turning point
  cites a `quoteId`. No life is ranked "best". Money shown in real $ with a "projection, not
  prediction" note.
- **Safety:** screen every free-text input; on self-harm/abuse signals show 988 / crisis resources.
- **Data (D-101):** consent is unbundled (18+ / save / team may read); incognito saves nothing to D1;
  saved lives are erased after 30 days and uploads/selfies after 7 (`worker/privacy.ts`, daily
  cron); uploads, their text and selfies are encrypted with `DATA_KEY` (`worker/crypto.ts`).
  The notice people read is `src/ui/privacy/PrivacyText.tsx`: change it with the code. 18+ only.
- **Git:** small commits on your own branch/worktree; the lead merges to `main`. Commit trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Everything must be built during the
  event (organizer rule) — no code from other projects (e.g. fromyourlove).
- **Deploys:** agents never push or deploy. The lead merges, verifies (typecheck, `check:qa`, a
  local or live check), then pushes `main` and runs `npm run deploy`. Check what is live with
  `npx wrangler deployments list`.
- **Shell gotchas on this machine:** zsh treats `$VAR:x` as a modifier — write `${VAR}:x` in URLs.
  The RTK hook may rewrite/condense `curl` and `git log` output; use `/usr/bin/curl` and
  `/usr/bin/git` when you need raw output. A stale `vite preview` from an old worktree can hold
  127.0.0.1:4173 and serve an old build: check `lsof -iTCP:4173` before live tests.
