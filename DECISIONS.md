# DECISIONS.md

The single source of truth for what we decided. **This file wins over `IDEA.md`** (the pre-event
brief) wherever they disagree. Add new decisions at the bottom of their section, with a date, and
never silently rewrite an old one. Mark a reversal as **Superseded by D-xxx**.

Status key:
- **LOCKED**: the owner decided.
- **DEFAULT**: Claude chose it and the owner can still flip it.
- **OPEN**: waiting on the owner and Paul.

Team: Supawich (owner) and Paul. The build is done mostly by Claude agents.
Event: Triangle AI Hackathon. Submissions close Sun Nov 8, 9:30am; judging runs 10am–12:15pm.

---

## Product

| ID | Decision | Status |
|---|---|---|
| D-001 | **Name: "Every Life You Have Left".** The full name is the brand. (The short "Lives Left" was rejected, Fri Nov 6.) | LOCKED |
| D-002 | **Track: Social Impact & Education.** | LOCKED |
| D-003 | **Lead customer: college students and new grads (18+). University career centers pay**, about $3 per student per year; students use it free, and share cards spread it. "It scales to…": four lives, four crossroads (graduation → layoff/outplacement → midlife → retirement and insurance). Banks and insurers come last in the story, never first. | LOCKED (from the track choice) |
| D-004 | **The four lives:** **Your Path** (if nothing changes; the pauses steer it), **The Leap** (says yes to the user's big decision), **The Careful Life** (fear wins: financially strong, carries regrets of boldness and connection), **The Unjudged Life** (what they would do if nobody judged). Their two axes: bold vs safe, and for others vs for yourself. | LOCKED |
| D-005 | **Personal over global.** Events are about the user's own career, family, partner, children, money, mental health, achievement, goals and personal risk. World events are rare: at most 2 per life, one shared world timeline across all four lives, no repeated catastrophes, no pandemics or hurricanes on a schedule. | LOCKED (owner's brief) |
| D-006 | **Worry weighting.** The domains the user worries about get more story time and more turning points. Worry **never** makes bad outcomes more likely. All 10 domains still appear. | LOCKED |
| D-007 | **Hard events: realistic, handled gently.** Allowed: divorce, layoffs, burnout, debt, caring for a parent, and a parent's death from old age (once, offscreen, never as a twist). Never: the user's own death or serious illness, or the death of a partner or child. | LOCKED |
| D-008 | **Money in real dollars.** Income and net worth appear as $ figures, grounded in base rates and the user's own numbers. A small "projection, not a prediction" note sits wherever $ appears. | LOCKED |
| D-009 | **End age: 70**, or **current age + 15 when the user is over 55**. | LOCKED |
| D-010 | **No life is ranked "best".** Research: one-sided futures persuade, while balanced ones help people think. The lives are shown side by side, each with its own verdict. | DEFAULT |
| D-011 | **Never ask for race**, and never use it. Country, family background, education and money are enough. Marital status is optional. | LOCKED (IDEA.md) |
| D-012 | **Age gate: 18+**, as a checkbox on the consent screen. Because we save data (D-030), minors are out of scope this weekend. | DEFAULT |
| D-013 | **Every turning point has a "why"** with a quote id pointing to the user's exact sentence, plus one base-rate fact with its source when one applies. A code validator rejects lives that break this rule. | LOCKED |

## Flow

| ID | Decision | Status |
|---|---|---|
| D-020 | **Flow:** explainer → consent → choose depth (Quick or Deep) and mode (voice or text) → optional uploads → "what I learned about you" (editable cards) → questions → four lives play out → pauses → result at 70 → postcards and share → talk to future you. | LOCKED |
| D-021 | **The judge's fast path: 5 questions + 1 pause**, about 2.5–3 minutes in total. The lives start drawing while they are still being generated. | LOCKED |
| D-022 | **Deep path:** adaptive gap questions, with no limit, aimed at the domains the user worries about, plus 4–5 pauses. Session length is entirely up to the user, from 90 seconds to hours. | LOCKED |
| D-023 | **A pause answer re-tunes ALL FOUR lives** from the pause year forward, and the UI shows what changed in each one. Owner: "if context has changed, fixing the other 3 is unrealistic; we can also learn a lot from their prompts." | LOCKED |
| D-024 | **Uploads, all optional:** CV PDF, LinkedIn "Save to PDF", and a pasted export from the user's own AI app (we give them the prompt to copy). There is always a "skip, just ask me" path. **Never scrape LinkedIn.** | LOCKED |
| D-025 | **Voice in and out, with a text-only switch.** Hold-to-talk on every answer (Gemini transcribes it), and future-you can read its letter aloud with Gemini TTS in an older voice. Users who prefer text can switch voice off at any time. | LOCKED |
| D-026 | **Talking to future you is adaptive:** **letters** for users we know little about (the fast path), and a **digital-twin chat** that copies their own voice and typing style once we know enough (deep path, uploads or a long AI export). The threshold is a "how well I know you" score. | LOCKED |
| D-027 | **Before/after measure:** "How connected do you feel to yourself at 70?" on a 1–7 scale, asked at the start and the end. It is optional in the app and required in Paul's Saturday study. | DEFAULT |

## Data

| ID | Decision | Status |
|---|---|---|
| D-030 | **Save all the data** (owner, Fri Nov 6): profiles, answers, uploads, generated lives, letters and chats are stored server-side and used to improve the product. The consent screen says so **plainly**. This **supersedes** IDEA.md's "data stays in the browser, never saved". Be ready for the privacy question on stage. | LOCKED |
| D-031 | **Sharing: both.** A downloadable "postcard from 70" image, made in the browser, plus an opt-in share link with a preview card. | LOCKED |
| D-032 | **Abuse guard: leave it open.** No passcode and no rate limit. There is one hidden off switch (the env var `GENERATION_ENABLED`) that turns generation off and falls back to a pre-made life, and GCP budget alerts are set at $50/$90/$100 of gross spend. | LOCKED |
| D-033 | **Admin view for tuning** (`/admin`, behind a passcode secret). Paul and the owner can browse saved sessions, lives and realism ratings to tune the prompts. | DEFAULT |

## Demo and pitch

| ID | Decision | Status |
|---|---|---|
| D-040 | **The owner's own life is the first internal test life**, for the owner and Paul only. It is **not** used for the demo, the video or the pitch. The showcase life is picked later from testers ("there might be another guy's life that's more interesting"). | LOCKED |
| D-041 | **Paul owns testing and tuning** once the first end-to-end version works: he runs it with as many people as possible and feeds back ideas. The owner tests and tunes too. Paul may carry the pitch (decided later). | LOCKED |
| D-042 | **Opening hook:** "Give me 90 seconds and I'll show you four of the lives you have left." | DEFAULT |
| D-043 | **Cite the 2025 MIT/Hershfield multi-future papers before a judge does** (*Possible You*, *Simulating Life Paths*). Our novelty: lives played year by year to 70, a "why" traced to your own words, mid-story re-tuning, a profile built from your own documents, and a 3-minute run. | DEFAULT |
| D-045 | **Hook: "Where do you see yourself in five years?"** (owner's idea, Fri Nov 6). It is the interview question everyone dreads and nobody answers well. Opening line: *"Every interview asks where you see yourself in five years. Nobody can answer it. Give me 90 seconds and you'll have four answers, and you'll know which one is yours."* It ties the product straight to what career centers already sell: interview prep. | LOCKED (idea) / DEFAULT (wording) |
| D-046 | **Feature: "your five-year answer" card.** On the result screen, after the four lives play, Gemini writes a 30-second spoken answer to "Where do you see yourself in 5 years?" for the life the user leans toward. It uses their own words and real milestones from that life, so it is honest, specific, and theirs. It can be copied, read aloud by TTS, and added to the share postcard. The user can switch lives to hear a different answer, and can ask for a "10 years" version. | DEFAULT |
| D-044 | **Saturday study:** ~15 hackers do the before/after measure, plus a small plain-ChatGPT control group, so "isn't this just ChatGPT?" gets a data answer. | DEFAULT |

## Visual

| ID | Decision | Status |
|---|---|---|
| D-050 | **Don't copy *1 in 8 Billion*.** No 0–100 bar meters, no grid of year squares, no charcoal + pink/mint, no slab serif + mono labels, no passport cards, no pixel art. Credit it as inspiration in the pitch. | LOCKED |
| D-051 | **Core visual: Four Horizons** (owner, Fri Nov 6: "cleaner, focuses on a few things, less text, no messy UI"). Four of you walk through four stacked landscapes, and the domains show up as the world (weather, places, companions, houses). v2 adds living figures that age, seasons, focus mode on one life, a cinematic ending and the five-year answer card. The Book That Splits stays the reduced-motion fallback. Paul can still weigh in. | LOCKED (owner) |
| D-052 | **Theme** (Paper / Night / a wildcard) and **font pairing**: chosen in the prototypes. | OPEN |
| D-053 | **No emoji as UI.** Use real icons (the better-icons MCP), editorial type, and motion that feels like time passing, not app chrome. | LOCKED (owner's global rule) |

## Tech

| ID | Decision | Status |
|---|---|---|
| D-060 | **Hosting: Cloudflare Workers** (account on Workers Paid), on a `*.workers.dev` subdomain. One Worker serves the Vite + React SPA as static assets and runs the Hono API under `/api/*`. | LOCKED |
| D-061 | **LLM: Gemini only, on Google Cloud Agent Platform (formerly Vertex AI)**, billed to the $100 hackathon credit. GCP project `triangle-ai-hack-2026`, key = API key bound to service account `elyl-worker` (role Agent Platform User), restricted to the Agent Platform API. Endpoint: `https://aiplatform.googleapis.com/v1/projects/triangle-ai-hack-2026/locations/global/publishers/google/models/{model}:{generateContent\|streamGenerateContent?alt=sse}` with header `x-goog-api-key`. **Verified working Fri 10:55pm.** | LOCKED |
| D-062 | **Models**, all verified live Fri Nov 6: <br>• **heavy** = `gemini-3.8-flash` with `thinkingLevel: "low"` (lives, profile, plan, re-tune; stream: first token 2.4s, 20 schema-valid years in 7s) <br>• **fast** = `gemini-3.5-flash-lite` (questions, transcription, quick replies; 0.8s) <br>• **quality** = `gemini-4-argon` (A/B on Saturday, pre-generated showcase lives; first token 2.8s, 11s total) <br>• **fallback** = `gemini-3.6-flash` <br>Temperature is ignored from 3.6 onward, so the lives have to differ because the prompts make them differ. | DEFAULT |
| D-063 | **Generation architecture:** "code owns the odds, the LLM owns the story". <br>1. A plan call names the four lives and their arcs. <br>2. Four parallel streaming calls, one per life, return schema-checked JSON. <br>3. A code validator checks quote citations, event budgets and cooldowns, and bans repeated catastrophes, then makes one repair call if needed. <br>4. Narration is lazy: the "why" expansions and letters are generated on tap. <br>The base rates are a hand-curated US table (`research/03` §3.3) injected into the prompts. | DEFAULT |
| D-064 | **Streaming:** the Worker passes Gemini's SSE straight through to the browser, which parses partial JSON so the rivers or horizons draw while each life is still arriving. Retries and model fallback happen before the first byte. | DEFAULT |
| D-065 | **Storage:** Cloudflare **D1** for sessions, profiles, answers, lives, letters, ratings and share links, and **R2** for the raw uploaded files. No KV unless it's needed. | DEFAULT |
| D-066 | **PDFs:** text is extracted in the browser with pdf.js. If a PDF has no text (a scan), it is sent to Gemini as an inline PDF instead. The raw file is stored in R2 (D-030). | DEFAULT |
| D-067 | **Front end:** Vite + React + TypeScript. **GSAP** is the master playback clock, **Motion** handles cards and drawers, **d3-shape/scale** does the path maths, and Canvas 2D is optional for particles. No Three.js, Pixi, Rive or Lottie. Fonts are self-hosted. | DEFAULT |
| D-068 | **Repo:** public on GitHub at `JackDeBuff/every-life-you-have-left`, with Paul added as a collaborator. Everything is built from scratch during the event (the organizers' rule). Secrets live only in `.dev.vars` (gitignored) and in Wrangler secrets. | LOCKED |
| D-069 | **Overnight:** the agents build, commit, push and deploy on their own all night. The owner reviews in the morning. | LOCKED |
| D-070 | **The final `main` holds only the product** (owner, Fri Nov 6). At the Sunday freeze, remove `research/`, `docs/`, `prototypes/`, `IDEA.md`, `DECISIONS.md`, `CLAUDE.md` and the other planning `.md` files from `main` in a single "final submission" commit, and leave the git history alone. Keep one short product `README.md` (what it is, how to run it, the live URL, built with) unless the owner says to drop it too. | LOCKED (README: DEFAULT) |
| D-071 | **Non-Gemini models: gpt-oss-120b yes, Claude no** (owner, Fri Nov 6). OpenAI's open-weight `gpt-oss-120b` works on our Agent Platform key (OpenAI-compatible endpoint `.../locations/global/endpoints/openapi/chat/completions`, model `openai/gpt-oss-120b-maas`) and joins WP1's eval next to Gemini 3.8 Flash and Gemini 4 Argon, scored on realism and cost per session. **Claude is skipped:** on Google Cloud it is a Marketplace purchase, Google says most promotional credits don't apply to Marketplace, and the Education billing account has no card. Nothing was enabled or bought. Gemini stays the production default unless the eval says otherwise. **GPT-6 Astra** (checked Fri Nov 6): on Google Cloud it is only in private preview for selected enterprise customers, sold through Marketplace like Claude, and our project gets a 404, so it is out. **Kimi K3, GLM, DeepSeek, Qwen, MiniMax** (checked Fri Nov 6): Google retired its pay-per-token APIs for GLM-5/4.7, DeepSeek V3.2/V3.1/R1, Qwen3, MiniMax M2 and Kimi K2 on Oct 21, 2026. Kimi K3 is listed in Model Garden as self-deploy only (rent our own GPUs on GKE or an endpoint), and its `-maas` id returns 429. Renting GPUs for models this size would burn the $100 in about an hour, so they are all out. The only pay-per-token models we can use are Gemini and gpt-oss-120b. | LOCKED |
