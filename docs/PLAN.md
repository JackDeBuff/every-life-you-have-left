# Build plan — Every Life You Have Left

Written Fri Nov 6, 11pm. Submission is **Sun Nov 8, 9:30am**. Decisions live in `../DECISIONS.md`;
this file is *how and when* we build. Update the checkboxes as work lands.

---

## 0. What "done" means for Sunday

A judge at the table types (or says) five answers and, within ~3 minutes, watches **four of their
own lives** play out to 70 in our visual, taps a turning point and sees **the sentence they said
that caused it plus a real statistic**, answers **one pause** that visibly reshapes all four lives,
lands on **four postcards from 70**, and writes a letter to one of them that comes back in a voice.
It runs on `*.workers.dev`, survives bad Wi-Fi (pre-made fallback life), and we walk in with a
**before/after number** from Saturday's study.

---

## 1. Architecture

```
Browser (Vite + React SPA, served as Workers static assets)
  screens/  Explainer → Consent → Setup(depth, voice) → Uploads → Profile review → Questions
            → Story (Delta | Horizons) ⇄ Pause → Result(postcards, share) → Letters / Twin chat
  lib/      session store (zustand) · SSE + partial-JSON parser · pdf.js · recorder · player
     │  fetch / SSE
     ▼
Worker (Hono, /api/*)                                     Cloudflare D1  (sessions, profiles,
  POST /api/session          create session, consent       answers, lives, letters, ratings,
  POST /api/upload           file → R2, text → profile     shares)       R2 (raw uploads)
  POST /api/profile          docs+answers → Profile JSON
  POST /api/question         next adaptive question (fast model)
  POST /api/transcribe       audio → text (fast model)
  POST /api/plan             Profile → 4 life arcs (heavy)
  POST /api/life/:k   (SSE)  one life, years[] streamed (heavy) → validator → repair
  POST /api/retune    (SSE)  pause answer → all 4 lives regenerated from pause year
  POST /api/why              expand one turning point (fast)
  POST /api/letter           letter from you-at-age-N (heavy) ; /api/twin chat (heavy, streamed)
  POST /api/tts              text → audio (Gemini TTS)
  POST /api/share  GET /s/:id  share link + OG card
  GET  /admin                browse sessions (passcode)
     │  fetch, x-goog-api-key
     ▼
Google Cloud Agent Platform — gemini-3.8-flash · gemini-3.5-flash-lite · gemini-4-argon · TTS
```

Generation pipeline (D-063): `profile → plan (1 call) → 4 × life stream (parallel) → validator →
repair (≤1) → UI`. Pause: `answer → profile delta → 4 × retune stream from pauseYear`.

## 2. Contracts first (written before any parallel work)

`shared/` is the contract every agent codes against. Nobody changes it without updating all users.

- `shared/schema.ts` — zod schemas + exported JSON Schemas for Gemini `responseSchema`:
  `Profile` (facts, values, fears, people, constraints, money, worries[domain weights],
  `quotes[{id, text, questionId}]`, knowMeScore), `LifePlan`, `Life` (`key: path|leap|careful|unjudged`,
  title, verdictAt70, `years[{year, age, summary, states{10 domains 0–100}, money{income, netWorth},
  events[{id, domain, title, narrative, isTurningPoint, cause{quoteId, reason}, baseRate{statId}|null,
  tone}]}]`), `PauseQuestion`, `Letter`, `ShareCard`.
- `shared/domains.ts` — the 10 domains, 4 families (Work & money / People / Inner life / Direction).
- `shared/baseRates.ts` — the curated US table from `research/03` §3.3 with ids + sources.
- `shared/demo/*.json` — the prototype persona (Alex) as a valid `Life[]` for UI dev + offline fallback.

## 3. Work packages (parallel agents, tonight)

| WP | Owner | Scope | Done when |
|---|---|---|---|
| **WP0 Scaffold** | lead (Claude) | C3 React+Hono template at repo root, wrangler.jsonc (D1, R2, vars), `shared/` contracts + demo JSON, CLAUDE.md, deploy hello-world, GitHub push | `npm run dev` works; deployed URL returns the SPA; contracts compile |
| **WP1 AI engine** | agent | `worker/gemini.ts` (stream, retries, fallback chain, timeouts), all prompts (`worker/prompts/*`), validator + repair, base-rate injection, safety screen, `scripts/eval/*` runner with 10 synthetic personas | `npm run eval` produces 4 valid lives for 10 personas; no catastrophe spam; every turning point cites a real quote |
| **WP2 Story view** | agent | Port the chosen prototype (Delta or Horizons) into `src/story/` as React + GSAP driven by `Life[]` data and a streaming input; turning point + why card; pause UI + re-route morph; lenses; year card; reduced-motion "Book" view | Plays the demo JSON end to end at 60fps; accepts lives arriving incrementally |
| **WP3 Onboarding + questions** | agent | Explainer, consent (data-saved copy, 18+), setup (Quick/Deep, voice/text), uploads (pdf.js, AI-export prompt with copy button), profile review cards, question screen with hold-to-talk, adaptive loop, session store + resume | A user can go from landing to a submitted Profile in Quick and Deep modes, voice or text |
| **WP4 Persistence, letters, voice-out, share, admin** | agent | D1 schema + migrations, R2 upload, all save calls, letters UI + twin chat UI, TTS route + player, postcard image export, share link + OG, `/admin` | Data from a full session is visible in /admin; a letter is read aloud; postcard downloads; share link renders a preview |
| **WP5 Integration** | lead | Wire WP1–4, end-to-end flow, deploy, browser smoke test (desktop + phone), fix | Fast path works on the deployed URL in < 3 min |
| **WP6 Quality** | agents (morning) | Realism evals (argon as judge), prompt tuning, perf (TTFT, bundle), a11y, mobile, error states, offline fallback | Eval scores improve; no console errors; Lighthouse sane |

Coordination: each WP agent works in its **own git worktree/branch** on disjoint folders
(`worker/` vs `src/story/` vs `src/screens/` vs `worker/db + src/letters`), codes against
`shared/`, commits small, and the lead merges into `main` and deploys.

## 4. Timeline

| When | What |
|---|---|
| Fri 11:00pm–00:15 | Owner + Paul review the plan artifact, pick visual/theme/font; lead runs WP0 |
| Sat 00:15–05:00 | WP1–WP4 in parallel (Opus 5.5 agents) |
| Sat 05:00–07:00 | WP5 integration, deploy, e2e smoke |
| Sat 07:00–09:00 | WP6 quality pass; owner's own life generated for internal review (D-040) |
| Sat 09:00–18:00 | **Paul's testing loop** with real people (admin view), tuning, deep path, voice/TTS polish, share; before/after study + ChatGPT control (D-044) |
| Sat 18:00–24:00 | Pitch: Devpost text + images, 2-min video, stage deck, rehearse the 90-second table pitch; pick showcase life; pre-generate fallbacks |
| Sun 07:00–09:00 | Freeze, final deploy, **strip planning files from `main` (D-070: research/, docs/, prototypes/, IDEA/DECISIONS/CLAUDE.md; keep a product README)**, submit Devpost by **9:30am** |
| Sun 10:00–12:15 | Expo judging |

## 5. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Lives feel generic / horoscope-like | Quote-cited turning points enforced by validator; worry weighting; eval loop with synthetic personas; Paul's real-user tuning |
| Catastrophe spam / melodrama | Event budgets + cooldowns + shared world timeline; validator; banned list |
| Latency at the expo | Stream per life; animation of the past covers the first ~8s; fast model for questions; pre-generated fallback |
| Gemini 429s / outage | Fallback chain 3.8-flash → 3.6-flash → 3.5-flash-lite; kill switch to demo life |
| Credits not applied to Agent Platform | Check Billing → Reports Saturday morning after first $0.50 |
| Looks like a chat app (PersonaReflect) | Chat is the last layer; letters; the visual is the product |
| Heavy topics | Safety screen on every free-text input → 988 resources; tone rules; no deaths of user/partner/child |
| Privacy question from judges (we save data) | Plain consent copy; "used to improve, never sold"; delete-my-data link |
