# SPEC v2: Every Life You Have Left

Finalized by Supawich and Paul on Sat Nov 7, ~2am. **This replaces every earlier visual concept**
(Delta, Four Horizons, Marginalia, Window). `DECISIONS.md` lists the IDs. The contract types live in
`shared/sim.ts`. Build against them.

The one-line pitch: you live your remaining life, from today to 70, in a game-like simulation. It
learns who you are through small decisions and splits at big ones. The lives you didn't choose keep
running in the background: every life you have left.

---

## 1. Screen layout (desktop first, ≥1280px)

```
┌───────────────────────────── TIMELINE BAR ─────────────────────────────────────┐
│ 25 ●━━━━━━◆━━━━━━━━◆━━━━━━━━○━━━━━━━━━━━━━━━━━━━━━━━━━━━ 70   1× 2× 4× Auto  ⏸   │
│        ◆ = big decision (a fork; hover → peek the lives you didn't choose)     │
├────────────────┬──────────────────────────────────────┬────────────────────────┤
│ LEFT · BIO     │ MIDDLE · YOUR LIFE                   │ RIGHT · CONTROL CENTER │
│ portrait       │ ┌──────────────────────────────────┐ │ [Decisions|Steer this  │
│ (illustrated,  │ │                                  │ │  life]  (two tabs)     │
│ ages with you) │ │   3D WORLD (the chosen life,     │ ├────────────────────────┤
│ name · age     │ │   this year): rich, vibrant      │ │ Decisions: the chat    │
│ place · work   │ │                                  │ │ small + big decisions, │
│ people · $     │ └──────────────────────────────────┘ │ 4 answers + "say more" │
│                │ LIFE LOG                              │ (type or voice)        │
│ STATUS         │ 2031 · 30  Promoted to senior analyst │                        │
│ 10 domains in  │   why ↗ "Money scares me." + stat     │ Steer: 3–5 generated   │
│ 4 families     │ 2030 · 29  …                          │ controls (focus,       │
│ "tell me more" │                                       │ investing, balance…)   │
│ (uploads)      │                                       │                        │
└────────────────┴──────────────────────────────────────┴────────────────────────┘
```

- **The column dividers can be dragged** (or focused and moved with the arrow keys; double-click or
  Enter resets). The right pane ranges from 340 px to 55% of the window, and the middle column keeps
  ≥380 px. Widths persist per browser. The play screen never scrolls the page (D-096).
- **Viewport units:** every `dvh` has a `vh` fallback, and the page-scroll lock applies only where
  `dvh` works (WeChat's in-app browser has none; D-099).

- **Phone (<820px):** the 3D world is on top. Below it, tabs switch between Log, Bio and Steer,
  and the chat is a bottom sheet that rises for each decision. Phone layout matters less than
  desktop for the expo; it must work but needn't shine.
- **One focus at a time.** When a big decision arrives, the other panes dim, the right pane switches
  to Decisions (Steer is locked until the fork is answered), and the decision card takes it.
  Everything else stays quiet detail.

## 2. Time and speed

The life runs from the user's current age to `endAge` (70, or current age + 15 if the user is over
55). The playhead advances on its own, one year at a time.

| Speed | Small decisions (whole life) | Big decisions | Pace (target) |
|---|---|---|---|
| 1× | ~150 (a conversation: 147 planned for a 26-year-old, 4 a year for ~20 years, then 2–3; the year waits for them) | ~20 (a fork every ~2 years) | ~6 s per year (12 s while a card is up) + decisions (a long, deep session) |
| 2× | ~30 (1 every ~1.5 years) | ~10, evenly spaced | ~4 s per year |
| 4× | ~15 (1 every ~3 years) | ~5 | ~2 s per year |
| **Auto (judge mode)** | **0** | **5** | ~1.5 s per year. The whole run takes **≤3 min**, decisions included |

- **Small decisions** don't stop time. They slide into the chat and the clock slows to 0.5×. If
  there's no answer within ~12 s (2×) / ~10 s (4×) of idle time (no limit at 1×), the decision
  fades as "let it slide". One small card at a time. 2×/4×: none in a fork's year or the year
  after it. 1× (the conversation): every year holds its planned cards, a fork's year included once
  its consequence has played ~3 s. Cards come one after another, only in their own year, written
  ahead in batches (D-089) so each appears at once. **The year waits for every card planned in
  it**: it doesn't end while one is open or still owed (a "Let it slide" button lets one go). Only
  a card writer that brings nothing for 25 s gives the year's remaining cards up; they are
  skipped, never piled up later. A fork never cuts off an open card: it waits for the answer (or
  the slide). At 2×/4× cards the playhead passes are dropped. (Amended Sat Nov 7 four times, see
  D-081 and D-091.)
  A slid card is logged, and the life follows its inertia. They are spread across the life and **weighted
  toward the domains the user worries about**. Their job is to learn who the user is, so each one
  should cover a gap in the profile. Cards rotate across the person's own life axes (`focus.ts`),
  and the card after a life shock asks how they respond (D-093).
- **Every small card is re-checked against the year it is served in** (place, work, people after
  the latest fork). A card that no longer fits is dropped and the next one takes the slot (D-093).
- **Spend caps** (D-098): once a session has spent $2.50 it gets no more small cards; at $5 its
  model calls stop and the offline engine finishes the life.
- **Big decisions** pause the clock. Other panes dim, and the card explains that this splits the
  life. The engine schedules them at real life-stage moments (job offer, moving, partner,
  kids, money, career pivot, caring for parents, retirement), personalized to the profile. Never
  random. Never two work forks in a row (D-093).
- Changing speed mid-life rescales the remaining budget.
- **Start (every mode):** first name, age, where you live, and one line, "what's on your mind
  lately?" (type or say it). Optional: a selfie (for the portrait), and CV / LinkedIn PDF / AI-app
  export under "tell me more". Then the first big decision happens **today**, at the current age.

## 3. The decision card (design this carefully)

Every decision, small or big, has the same anatomy:

1. **The question.** Large and human, set in the life's moment: "It's 2029. Singapore wants an
   answer by Friday."
2. **Why I'm asking.** One small line: "You said money scares you; this is the first big money
   move."
3. **Four answers.** Pre-made options to tap. They must be genuinely different, not good / bad /
   neutral / other. For a big decision, each answer is a **fork** with a short branch title ("Take
   Singapore", "Stay, ask for a raise", "Quit to paint", "Say yes, bring Mom later").
4. **Say more.** A large text box that is **always visible**, with a hold-to-talk mic. It works on
   its own or on top of a tapped answer ("I'd stay, but only if…"). Microcopy makes clear that the
   user's own words shape the life more than a tap does.
5. **Submit.** Big decisions then play the fork moment (§4). Small ones fold into the log.

The user's free text becomes **quotes** with ids. Every later turning point cites them (the why
thread). Voice goes to Gemini for transcription, and the transcript is shown so the user can edit it.

## 4. Forks: the lives you have left

- At each big decision, the chosen answer continues as **your life**, and the 3 others spawn
  **branches**.
- At most **3 hidden branches** run at once. After each new fork, keep the 3 most different lives
  (by state distance and variety of path) and retire the rest quietly.
- Hidden branches simulate **coarsely and cheaply** (in 5-year steps, fast model) and are refined
  only when someone looks at them.
- **"Meanwhile, in your other lives…"** plays after every big decision, plus every 10 years at 1×
  and 2×. It's a ~7 s interlude in the middle pane (Auto ~5 s): three quick 3D scene cuts, each
  with a one-line caption, then back to your life. It never waits on a slow call: the cuts are
  written ahead (forks while the card is open, the 10-year one a few years early), and if they
  are late the lives that are ready play instead (their latest snapshots). Answer → life resumes
  in ≤ 10 s.
- **Peek anytime.** Clicking a past ◆ on the timeline opens **"the road not taken"** (D-097): the
  question, what you chose and where it led you today, then each other answer as "If you'd chosen
  X → today you'd be N: …" with place, work and net worth, and a plain status tag (Still running /
  Faded out / Not followed / Being written). Branches snapshot every 5 years, so a row uses the
  snapshot nearest the playhead and names its age when that isn't today's. The lives badge reads
  "N other lives still running" and lists each running life today; a Key button explains the
  marks. (No UI opens a branch's 3D scene or log yet; `peekBranch` exists only as an RPC.)
- **At endAge:**
  1. your life + the 3 branches side by side, each with a one-line verdict (no life ranked best)
  2. the postcard from 70
  3. the **five-year answer card** ("Where do you see yourself in five years?", written from your
     own words; tabs per life; copy; read aloud)
  4. **talk to any version of you at any age**: letters if we know little, a digital twin that
     writes like you if we know a lot (D-026)

## 5. Live life settings ("Steer this life", the right pane's second tab)

- They live in the **Steer this life** tab next to Decisions (D-096); the old fold-away settings
  bar above the chat is gone. The tab opens with a short explainer (what a nudge does, and from
  which age). Each row gets an "Applied · from N" tag once nudged, a "Nudge applied" status line
  shows at the top, and a dot marks the tab until it is first opened. A new card brings Decisions
  forward, and a fork locks Steer until it is answered.
- After the start and after every big decision, the engine generates **3–5 controls from the
  user's own answers**. Examples:
  - "What you're focusing on" (choice chips)
  - "How you invest" (dropdown)
  - "Work–life balance" (slider with labelled ends)
  - "Where you live" (dropdown)
  - "Saying yes to family" (toggle)
- Changing a setting is a **nudge**: it applies from next year, is logged ("At 33 you shifted focus
  to family"), and feeds the simulation.
- Control types: `select`, `slider`, `chips` (single or multi), `toggle`. Each has a label and a
  one-line effect hint.

## 6. Left pane: bio and status

- **Portrait:** an optional selfie, turned by Gemini's image model into an **illustrated portrait**
  in our house style. Never photoreal. Aged versions at about 35, 50 and 70 are generated lazily,
  and the pane shows the version for the current age. Without a selfie, the portrait is drawn from
  the user's own description: an optional "how you look" picker (hair, skin tone, glasses), chosen
  by the user. **Never infer race** (D-011).
- **Bio:** name, age, place, work, people (partner/kids as small chips), net worth in $ (with the
  projection note), and one generated line, "life so far".
- **Status:** the 10 domains in 4 families (Work & money / People / Inner life / Direction). It must
  **not** be a stack of identical 0–100 bars. The UI agent designs something better that reads in
  one glance and animates changes, with tiny why links.
- **"Tell me more":** upload slots (CV, LinkedIn PDF, AI export with a copyable prompt), plus a
  "how well I know you" meter that unlocks the twin.

## 7. Middle pane: the 3D world and the life log

**3D world.** A stylized, vibrant, isometric-ish diorama of **the chosen life this year**. It is
built from a large library of pre-made pieces and driven by a `SceneSpec` (see `shared/sim.ts`):
- setting and region
- home type
- activity
- people with age bands
- season, time of day, weather, mood
- an optional key **moment** (wedding, graduation, new baby, moving boxes, promotion, layoff box,
  first show, house keys, retirement party, …)

Behaviour:
- Changes between years animate: the camera eases, pieces build in or fade out, light shifts
  between seasons and times of day, and particles (rain, snow, petals) fill the weather.
- Moments are 3–5 s mini-cinematics.
- The self character ages (posture, hair colour) and matches the user's chosen look.
- Assets are CC0 only (Kenney, Quaternius via poly.pizza), with credits in `ASSETS.md`.

Quality bar: "holy moly beautiful". This is the expo hook.

**Life log.** Generated entries per year, newest at the bottom with auto-scroll. Each entry has:
- year, age, 1–2 short lines
- a domain colour tick
- a **why** affordance: the quote, the base rate with its source, and a link that highlights the
  quote in the chat history

Big-decision rows mark the fork.

## 8. Simulation engine (worker)

- **Session state** lives in a Durable Object (Cloudflare Agents SDK) and is also saved to D1 for
  `/admin` (D-030: save all). The state holds:
  - profile and quotes
  - settings
  - your life's years so far, plus a buffered future
  - pending decisions
  - branches
  - log
  - money
  - portraits (R2 keys)
- **Generate ahead.** The engine writes the chosen life 3–5 years ahead of the playhead in streamed
  chunks, so playback never waits.
  - Each year carries: summary/log lines, the 10 domain states, money {income, netWorth}, events
    with why, a `SceneSpec`, and the decisions scheduled in it.
  - A buffer of at least 2 years ahead is the target. If generation falls behind, the clock slows,
    and a "life is thinking…" state in the world is acceptable.
- **Re-tune.** A big decision or a settings nudge invalidates the buffered future and regenerates
  from the current year. A small answer never does (D-089): it becomes a quote at once, is folded
  into the profile in batches, and shapes the next years written.
- **Content rules** (all carry over): personal over global; worry weighting changes attention, not
  odds; at most 2 world events per life; no repeated catastrophes; no death or serious illness for
  the user, and never a partner's or child's death; a parent's old-age death at most once, gently;
  money in real $ from base rates; every turning point cites a quoteId; no life ranked best; safety
  screen with 988 resources.
- **Life shocks are code-owned** (D-092, `worker/engine/shocks.ts`): a per-life plan at real annual
  odds (home disaster by region, break-in, property accident, scam, a friend in trouble, a parent's
  health scare, windfall, lucky break, landlord sells, visa snag). Each type at most once per life,
  at most one natural disaster, at most 1–3 per life by span (most get 0–2), ≥4 years apart; some
  are good luck. The writer must show a planned shock; the validator rejects a repeated or invented
  catastrophe. The world timeline rolls at most one pandemic per session at 0.6% a year (real: ~2%).
- **Realism guards** (D-093, D-094): year-1 money anchored to savings minus debt and kept continuous
  unless an event explains a jump (`money.ts`); no child unless the user opened that door
  (`kids.ts`); names typed in answers join the people ledger, friends drift (`drifted`) and come
  back only in a framed reunion; invented people get seeded names by place (`names.ts`).
- **Grounding** (D-095): at the start, one Flash-Lite Google Search call (≤6 s) looks up the
  employer, school and city they named; their own facts win (`profile.grounded`).
- **Spend** (D-098, `worker/spend.ts`): an app-wide ledger in D1 stops every model call at
  `SPEND_CAP_USD` (30) like the kill switch; per session, small cards stop at $2.50 and model calls
  at $5. `GET /api/health` shows `spend: {usd, cap, capped}`.
- **Models** (D-062, D-071):
  - heavy: `gemini-3.8-flash` (thinking low)
  - fast: `gemini-3.5-flash-lite`
  - quality A/B: `gemini-4-argon` and `gpt-oss-120b` in the eval
  - TTS: Gemini TTS
  - portraits: Gemini image model on Agent Platform (verify the model id)

## 9. Stack (D-067, revised)

| Layer | Choice |
|---|---|
| UI | React 19 + Vite + TypeScript. Radix primitives for the generated controls. Zustand for client state. GSAP for UI choreography (timeline playhead, pane transitions, the fork moment) |
| 3D | three + @react-three/fiber + @react-three/drei + @react-three/postprocessing. GLB assets compressed with gltf-transform (meshopt + webp textures), lazy-loaded per setting |
| Chat + state | Cloudflare **Agents SDK** (one Durable Object per session) + **AI SDK** (`useAgentChat`, decisions as typed tool calls rendered as cards). Fallback if the AI SDK Google provider rejects our key: our own `worker/gemini.ts` adapter |
| Storage | DO SQLite for live session state; D1 for the admin/analytics copy; R2 for uploads and portraits |
| Hosting | One Worker on `every-life-you-have-left.supawich.workers.dev` |

## 10. Judge path (Auto) must hit

| Phase | Target |
|---|---|
| Start screen: name, age, place, one line (+ optional selfie) | ≤25 s |
| First big decision today; fork moment | — |
| Life plays, with the 3D world changing year by year | — |
| 4 more big decisions, each followed by a "meanwhile" interlude | — |
| Ending: four verdicts, postcard, five-year answer card | — |
| **Total** | **≤3 min** |

There must also be a **pre-generated demo session** that plays offline if Wi-Fi or Gemini fails.

## 11. Look and motion

- **Our own visual identity.** 1 in 8 Billion's 3-pane layout is the inspiration. Its colours,
  fonts, meters, passport cards and pixel art are not.
- Research real references before designing:
  - game UIs (Monument Valley, Townscaper, Alba, Unpacking, Before Your Eyes, Hades HUD)
  - Apple keynote motion
  - Linear and Arc micro-interactions
  - editorial data graphics
- Motion has meaning: time passing, a life splitting, a path not taken.
- No emoji in the UI (use the `better-icons` MCP), no purple gradients, no glassmorphism, no default
  shadcn look. Respect `prefers-reduced-motion` with a static world and crossfades.
