# UI.md: the look and motion of Every Life You Have Left

Owner of this file: the UI and Motion agent (Sat Nov 7). Builds against `docs/SPEC.md` §1–§6, §10,
§11 and `shared/sim.ts`. The 3D world (`src/world/`) is another agent's; the UI frames it.

## 0. The idea in one line

**A life is one long day.** The interface is lit by a sun that rises at your current age and sets
at 70. The sun is the playhead, your highlight colour and the edge of every choice you make. It
drifts from morning gold to evening coral as you age, so the whole UI ages with you. The lives you
didn't choose are drawn as **threads** that peel off your line at each fork and keep running beside
it.

Everything else stays quiet: a cool, mineral frame of hairline panes (an instrument, not a web
page) around a vivid 3D diorama. Colour is reserved for meaning: the sun is *you, now*; four data
hues are the four families of your life.

## 1. References and what we took from each

| Reference | What we took | What we left |
|---|---|---|
| **Disco Elysium** dialogue column | The right pane is a single vertical dialogue column. Speakers are small caps tags, not bubbles. Four attribute families each own one hue (Intellect blue, Psyche violet, Physique red, Motorics yellow), so our 4 domain families each own one hue too. | The painterly texture and ornate type |
| **Citizen Sleeper** | Economy: one glance tells you your condition. Meters "fill with a subtle pop". Clocks count up as anticipation builds (our small-decision countdown). | Neon sci-fi chrome |
| **Before Your Eyes** | Time passes in a blink. The cut between other lives in the interlude is an **eyelid blink** (two lids close to a line, then open on another life). | The webcam |
| **Unpacking** | Dioramas framed calmly; UI never fights the scene; tiny satisfying settles when something lands. | Pixel art (banned) |
| **Hades HUD** | Big confident numerals and very clear focus states when a choice matters (boon choice = our big decision). | Ornament |
| **Apple keynote, Fitness, Journal** | Wide/compressed widths of one family for numerals (SF Pro Expanded in Fitness). Masks and wipes rather than slides. Values that count and roll. Journal's quiet suggestion cards. | Gradients and blur |
| **Linear / Raycast / Arc** | Keyboard first (1–4, Enter). Hover reveals detail, never hides it. Fast micro-interactions (90–220 ms), springy only where something is *physical*. ⏎ and number keycaps shown inline. | Purple, glass |
| **NYT / The Pudding** | Annotation over legend: labels sit on the data. Small multiples (the ending's four roses). Area-true encoding. | Long scroll |
| **Teenage Engineering** | The instrument frame: 1 px gaps between panes like a spec grid, flat hardware-like speed keys with an LED dot, colour-coded controls that match the data they drive. | Orange + mono everywhere |
| **Florence Nightingale's rose (1858)** | The status glyph: a polar-area diagram with wedge **area** (not radius) proportional to the value. | Her 12 months; ours are 10 domains |

## 2. Explicitly avoided

Cream + serif + terracotta. Purple gradients. Glassmorphism, backdrop blur. Default shadcn. Emoji.
Everything centred (layouts are left-anchored and asymmetric). Rounded shadow cards everywhere
(we separate with hairlines and contrast; shadows only on things that truly float). 1 in 8 Billion's
charcoal/pink/mint, passport cards, pixel art and bar meters. Also the earlier rejected prototypes'
paper-grey + editorial serif look (Marginalia, The Window).

## 3. Type

**Mona Sans** (variable: weight 200–900, width 75–125%) for everything, and **Source Serif 4
Italic** for one thing only: **the user's own words.**

One family, three widths, is the system:

| Role | Face | Size / weight / width | Notes |
|---|---|---|---|
| Hero title (start) | Mona Sans | 72–96 px, 700, **wide 125%**, tracking −0.035em | Left aligned, set in two lines |
| The question (decision) | Mona Sans | 30 px big / 24 px small, 640, **wide 112%**, −0.02em, lh 1.08 | The largest text on the play screen |
| Age numeral (bio) | Mona Sans | 64 px, 760, wide 118%, tabular | Rolls like an odometer each year |
| Section heads | Mona Sans | 13 px, 650, **condensed 82%**, caps, +0.08em | Instrument labels, never mono |
| Body / chat / log | Mona Sans | 14–15.5 px, 420, 100%, lh 1.5 | |
| Data (years, $, ticks) | Mona Sans | 12–13 px, 560, condensed 88%, `tabular-nums` | Replaces the usual mono labels |
| **Your words** (quotes, your answers, the five-year card) | Source Serif 4 Italic | 1.06× the surrounding size, opsz auto | With the sun highlighter when cited |

Why: the width axis gives keynote-grade numerals and HUD-tight labels from one voice, so the UI
feels designed rather than assembled. The only serif is reserved for the person, so "your words
count more than a tap" is also a typographic fact: wherever you see the italic serif, you said it.
Fonts are self-hosted via `@fontsource-variable/*` (works offline at the expo).

## 4. Colour

Tokens live in `src/styles/tokens.css`; code never uses raw hex.

### Frame (neutral, slightly cool; never cream)

| Token | Light "Daylight" | Dark "Blue hour" | Use |
|---|---|---|---|
| `--canvas` | `#E4E9EB` | `#05090B` | The 1 px gaps between panes, page behind |
| `--panel` | `#F4F7F8` | `#0A1215` | Pane surfaces |
| `--raised` | `#FFFFFF` | `#101B1F` | Tiles, inputs |
| `--sunken` | `#EBF0F1` | `#071013` | Wells, tracks |
| `--ink` | `#0D1A1F` | `#E3EBEC` | Text |
| `--ink-2` | `#44555C` | `#A2B3B8` | Secondary text |
| `--ink-3` | `#6B7C83` | `#6E8288` | Labels, ticks |
| `--hair` | ink at 12% | ink at 9% | Rules |

### The sun (you, now)

`--sun` is set at runtime from the playhead: gold `#F5B21F` at the start age → amber `#FF8C2B` at
the midpoint → evening coral `#FF5F4A` at the end age. It colours the playhead, the selected answer,
the highlighter under cited quotes, the LED on the active speed key and focus rings. On light
surfaces text never sits *in* sun colour; the sun is a fill under ink.

### Four family hues (data only)

| Family | Light | Dark | Echo |
|---|---|---|---|
| Work & money | `#2F6BD8` ledger blue | `#6EA2FF` | DE Intellect |
| People | `#D2405E` heart red | `#FF7D96` | DE Physique |
| Inner life | `#7B55D6` violet | `#AE92FF` | DE Psyche |
| Direction | `#23935A` field green | `#5BD08F` | (Motorics' role, moved off yellow so the sun stays unique) |

They appear only in the life rose, the log's domain ticks and the why cards. Never as UI chrome.

### Lives

Your life: solid ink line + the sun. Branches: the same ink, thinner, each with its own dash
(`6 3`, `2 3`, `10 3 2 3`) and a roman numeral I–III. No hue per life, so no life looks "better".

## 5. Space, shape, layout

- 4 px base: 4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64.
- Radius: 2 px for controls and tiles (crisp, instrument-like), 8 px for popovers and the phone
  sheet, round only for the sun, LEDs and the portrait's arched window.
- Desktop: timeline bar 64 px; panes `300px | 1fr | 420px` separated by 1 px of `--canvas`. The
  middle pane is world (60%) over log (40%).
- Left-anchored, asymmetric compositions. The start screen is a two-column spread, form left,
  living illustration right.
- Elevation by contrast; one soft shadow token (`--lift`) only for popovers and the decision card
  when it floats on phone.

## 6. Motion language

Every animation means one of four things:

1. **Time passes.** Linear, constant, never eased: the playhead, the sun's colour drift, the
   countdown hairline. (Time is the only thing that moves linearly.)
2. **Something arrives.** It settles from the direction of its source with `expo.out`: log lines
   rise from the bottom, a decision rises into the chat, a nudge tag slides in beside its control.
3. **A life splits.** The fork moment: the chosen path continues; the other three peel away and
   become threads.
4. **Values change.** They morph, never jump: rose wedges tween, money and age roll like odometers,
   last year's rose lingers as a ghost outline for a beat so you see the direction of change.

| Token | Duration | Easing (CSS / GSAP) | Used for |
|---|---|---|---|
| `--t-press` | 90 ms | `cubic-bezier(.3,.7,.4,1)` | Key and tile press (1 px down) |
| `--t-micro` | 140 ms | same | Hover, focus, LED |
| `--t-quick` | 220 ms | `--e-settle` `cubic-bezier(.16,1,.3,1)` / `expo.out` | Popovers, chips, toggles |
| `--t-base` | 360 ms | `--e-settle` | Log lines, small decision in, tabs |
| `--t-slow` | 640 ms | `--e-tide` `cubic-bezier(.65,0,.35,1)` / `sine.inOut` | Pane dim/undim, portrait crossfade, rose morph |
| `--t-scene` | 1100 ms+ | GSAP timelines | Fork moment (~2.4 s), interlude title, blink cuts |
| exits | 0.6× the entry | `--e-exit` `cubic-bezier(.7,0,.84,0)` / `expo.in` | Anything leaving |

Choreographies (GSAP):

- **Clock slows** (small decision): the global time scale tweens 1 → 0.25 over 600 ms; the sun's
  halo pulse slows with it. At 2×/4× a hairline across the card's top drains linearly over 12 s with
  "let it slide" beside it. Unanswered → the card folds into a log line (`expo.in`, 300 ms).
- **Big decision**: the left pane, middle pane and timeline dim to 32% with a slight desaturate
  (640 ms tide); settings collapse; the card takes the right pane. The timeline marks the fork ◆ at
  the playhead with a slow pulse.
- **Fork moment** (after answering a big decision, ~2.4 s):
  1. 0–0.3 s: the chosen tile locks (sun edge fills, keycap turns to a check); the three others
     desaturate.
  2. 0.3–1.5 s: each unchosen tile lifts, tilts ±4°, shrinks and travels on a curved path up to the
     fork ◆ on the timeline, thinning into a dot; a label "II · Stay, ask for a raise · keeps
     running" ghosts out along the way.
  3. 1.0–1.9 s: three threads draw out of the ◆ (stroke-dashoffset) and bend away from your line;
     the "lives you have left" counter ticks up.
  4. 1.6–2.4 s: the chosen tile collapses into your answer in the dialogue; the panes undim.
  Then the interlude.
- **Interlude** ("Meanwhile, in your other lives…"): the world tints to blue hour, the title wipes
  in by mask, left to right, with the ellipsis dots arriving one by one. Three cuts of ~2.3 s each.
  Between cuts the **blink**: two lids close to a line (180 ms, `expo.in`), hold 70 ms, open on the
  next life (260 ms, `expo.out`). Caption per cut: numeral + branch title in condensed caps, age, one
  line. Then a final blink back to your life.
- **Year tick**: the age numeral rolls, the rose morphs with a ghost, net worth counts, the log line
  rises, the portrait crossfades when the age band changes (35/50/70).
- **Highlight a quote** (from a why link): the chat scrolls to the quote and a sun highlighter
  sweeps under it left to right (background-size, 500 ms), then rests at 35%.

**Reduced motion** (`prefers-reduced-motion: reduce`): no translation, scale, rotation or blink.
Everything becomes a 200 ms crossfade; the playhead steps per year; the fork moment becomes a
crossfade of the three tiles into the threads; numbers swap instead of rolling.

## 7. Component inventory

Location: `src/ui/` (components), `src/screens/` (screens), `src/styles/` (tokens + CSS).

| Component | File | Notes |
|---|---|---|
| Session facade | `ui/session.ts` | `useSim` + `sim` calls. Today it is the mock; the lead swaps in the agent client with the same shapes |
| Mock engine | `ui/mock/*` | zustand store implementing `SessionState` transitions and `SessionCalls` with fake timers and generated content |
| Start screen | `screens/Start.tsx` | Name, age, place, "on your mind" (type or hold to talk), speed keys (Auto pre-selected), look picker, selfie, tell-me-more uploads, plain consent, 18+ |
| Play screen | `screens/Play.tsx` | Timeline bar + three panes; phone layout with tabs and a bottom sheet |
| Timeline bar | `ui/timeline/TimelineBar.tsx` | Age axis, linear sun playhead, ◆ forks with threads, small-decision ticks, speed keys, pause; hover ◆ → `ForkPeek` |
| Speed keys | `ui/timeline/SpeedKeys.tsx` | Hardware-style keys with LED dot |
| Portrait | `ui/left/Portrait.tsx` | Arched window, illustrated placeholder drawn from the chosen look, crossfades by age band |
| Bio | `ui/left/Bio.tsx` | Name, rolling age, place, work, people chips, net worth + projection note, "life so far" |
| Life rose | `ui/left/LifeRose.tsx` | 10 wedges in 4 family quadrants, area-true, ghost of last year, hover → why |
| Tell me more | `ui/left/TellMeMore.tsx` | CV/LinkedIn PDF (pdfjs), AI export with copyable prompt, know-me meter |
| World slot | `ui/middle/WorldSlot.tsx` | `<WorldSlot spec>`; placeholder sky until `<World>` is plugged in |
| Life log | `ui/middle/LifeLog.tsx` | Auto-scroll, domain ticks, fork rows, why popover |
| Why card | `ui/middle/WhyCard.tsx` | Quote (serif italic) + base rate + source + "show in chat" |
| Live settings | `ui/right/LiveSettings.tsx` | Radix select / slider / chips / switch, "applies from next year" tag |
| Dialogue | `ui/right/Dialogue.tsx` | DE-style column, not bubbles; your words in serif italic |
| Decision card | `ui/right/DecisionCard.tsx` | Question, why, 4 tiles with keycaps, say-more, submit, countdown |
| Hold to talk | `ui/right/HoldToTalk.tsx` | MediaRecorder → `/api/transcribe` (mocked) → editable text |
| Fork moment | `ui/motion/forkMoment.ts` | GSAP choreography |
| Interlude | `ui/middle/Interlude.tsx` | Title treatment + blink cuts over the world slot |
| Crisis banner | `ui/CrisisBanner.tsx` | Calm, 988 call/text, 988lifeline.org |
| Ending | `screens/Ending.tsx` + `ui/ending/*` | Four lives with verdicts, postcard (canvas PNG), five-year card (copy, read aloud), talk to any version |
| Icons | `ui/icons.tsx` | Phosphor (MIT) via better-icons |

## 8. Copy rules

Plain, second person, warm, short. No exclamation marks. Never rank a life. Money always carries
"a projection, not a prediction". The microcopy under every say-more box: *"Your own words steer
this life more than a tap. We keep them, and later turning points will quote them back to you."*
