# CLAUDE.md — Every Life You Have Left

Hackathon project (Triangle AI Hackathon, Duke, Nov 6–8 2026). Submit by **Sun Nov 8, 9:30am**.
Track: Social Impact & Education. Team: Supawich (owner) + Paul. Most code is written by Claude agents.

**What it is:** you tell it who you are (answers, optional CV/LinkedIn PDF/AI-app export); Gemini
builds your profile and plays out **four lives you could still live** — Your Path, The Leap, The
Careful Life, The Unjudged Life — year by year from today to 70, animated. Every turning point shows
*why*: the exact sentence you said + a real base-rate statistic. Pauses ask open questions that
re-tune all four lives. Then postcards from 70, and letters / a digital-twin chat with any version
of you at any age.

## Read before working
1. `DECISIONS.md` — what's decided (wins over everything else, including `IDEA.md`).
2. `docs/PLAN.md` — architecture, contracts, work packages, timeline.
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
  (fast), `gemini-4-argon` (quality A/B), `gemini-3.6-flash` (fallback). Temperature is ignored on
  3.6+ — make lives differ through prompts. **Do not use `@google/genai`; use plain fetch.**
- Front-end motion: GSAP (playback clock), Motion (cards/drawers), d3-shape/scale (path math).

## Commands
```bash
npm run dev            # Vite + workerd locally; reads .dev.vars
npm run build
npx wrangler deploy    # wrangler is NOT global; always npx
npx wrangler d1 migrations apply <db> --local|--remote
npm run eval           # (WP1) synthetic-persona life generation evals
```

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
  world events (≤2 world events per life, no repeated catastrophes). Every turning point cites a
  `quoteId`. No life is ranked "best". Money shown in real $ with a "projection, not prediction" note.
- **Safety:** screen every free-text input; on self-harm/abuse signals show 988 / crisis resources.
- **Data:** we save sessions (consent screen says so plainly). 18+ only.
- **Git:** small commits on your own branch/worktree; the lead merges to `main`. Commit trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Everything must be built during the
  event (organizer rule) — no code from other projects (e.g. fromyourlove).
- **Shell gotchas on this machine:** zsh treats `$VAR:x` as a modifier — write `${VAR}:x` in URLs.
  The RTK hook may rewrite/condense `curl` output; use `/usr/bin/curl` when you need raw bodies.
