# 02 — UI and visual concepts: the "four lives, year by year" view

Research and creative direction for the story view, the opening shot, the result screen, voice, and
the front-end motion stack. Written Fri Nov 6 2026, about 10pm, for a build that runs tonight and
tomorrow. Read `IDEA.md` first. This file only covers how it looks, moves and feels.

---

## TL;DR

- **Recommended concept: "The Delta".** Your past is a single pencil line. At today it reaches a
  "you are here" point, then splits into **four ink rivers** that flow to 70. The split itself is
  the argument: one moment, four outcomes. A judge gets it in one second.
- **Signature moves (use them whatever concept wins):**
  - **receipt threads:** a hairline runs from each turning point back to the sentence you said
  - **freeze-frame pauses:** the water stops mid-flow while the question is asked
  - **ghost re-routes:** after you answer, the old future stays faintly visible as the new one
    morphs in
  - **letters, not chat bubbles**
  - **postcards from 70**
- **Fallback with the same data:** "The Book That Splits" (Concept 4). It is cheap, accessible,
  and doubles as the reduced-motion and screen-reader view.
- **Stack:** Vite + React + TypeScript, deployed as Workers static assets.
  - **GSAP** (free since 2025, plugins included) is the master playback clock: DrawSVG, MorphSVG,
    SplitText.
  - **Motion** handles the DOM overlays (cards, drawers, shared-element transitions).
  - **d3-shape/d3-scale** do the path math only.
  - **Canvas 2D** draws the optional water particles.
  - No Three.js, Pixi, Rive or Lottie for this build.
- **Look:** warm paper and four inks, an editorial serif plus a mono, no gradients, no glass, no
  emoji. The past is drawn in pencil and the future in wet ink.

---

## 1. What the references teach us (steal the idea, not the look)

| Reference | What it does | What we take |
|---|---|---|
| [1 in 8 Billion](https://1in8b.life/en/) | Random birth anywhere, lived year by year: four 0–100 meters (health, happiness, knowledge, relationships), a life-map grid with one square per year, pauses at 5/15/30/50/70, four people born in the same second, birth/death cards, 1×–16× speed. Launched Oct 5 2026 and went viral; reportedly vibe-coded with Claude ([GameWith](https://gamewith.jp/gamedb/18821/articles/64850), [Real Sound](https://realsound.jp/tech/2026/10/post-2558126.html/amp)). | **Judges may have played it.** Keep the pacing idea (years tick by, reflective pauses, share cards). **Avoid the meters, the year grid and the side panel.** Our forms must be continuous (rivers, threads, text), not discrete squares and bars. |
| [MIT Future You](https://futureyou.media.mit.edu) | A chat with you at 60. | It is one future in a chat window. We are four futures played out as a picture, and chat is only the last layer. |
| [NYT Upshot: income mobility dots (2018)](https://www.nytimes.com/interactive/2018/03/19/upshot/race-class-white-and-black-men.html) | Animated dots (people) fall from where they started into where they ended up. | Lives as **flows that split** are readable at a glance. Motion carries the data. |
| [The Pudding: "This is a teenager" (Alvin Chang, 2024)](https://flowingdata.com/2024/04/15/teenage-adversity-that-carries-into-adulthood) | One icon per survey person, tracked year by year as stacks shift. | Showing how life really tends to go (base rates) is emotional when **one person** is followed through it. |
| Giorgia Lupi, [Data Humanism](https://www.printmag.com/article/data-humanism-future-of-data-visualization/) / [Dear Data](https://www.pentagram.com/work/dear-data/story) / [Bruises](https://domusweb.it/en/design/2018/03/28/facing-up-to-illness-through-the-reading-of-data.html) | Hand-made glyphs, a legend you learn once, imperfection, data as "personal documentary". | **The year glyph** (10 petals) and the **legend card**. Data should feel handmade, not dashboard-made. |
| Nicholas Felton, [Feltron Annual Reports](https://dublin.sciencegallery.com/lifelogging-exhibits/feltron-annual-report) | A year of one life as a typographic report. | Typographic confidence: big numbers, small captions, mono labels, rules. Our "Postcard from 70" is a tiny Feltron report. |
| [Florence](https://gamesbeat.com/florence-uses-clever-interactions-to-create-a-relatable-mobile-game-about-romance/) (Mountains) | The conversation puzzle pieces get jagged in arguments and simpler as the couple grows close. | **Mechanics change shape with emotion.** Our river edges go turbulent in risky years and murky in heavy ones. |
| [Before Your Eyes](https://www.gamedeveloper.com/design/gone-before-you-blink-the-webcam-driven-gameplay-of-before-your-eyes) | Every real blink skips time forward. Life flashes past and you cannot stop it. | Time is the main character. The **past ribbon** should play by too fast to hold on to. Give time a physical presence. |
| What Remains of Edith Finch | Each life is told in its own interaction form. In the cannery scene, one hand works while the other daydreams. | Split attention between two realities is an emotional device. Our four rivers run at the same time, and you feel "I can only live one". |
| [Gris](https://medium.com/theuglymonster/how-gris-paints-a-profound-psychological-experience-through-colours-64e783772058) | Color returns stage by stage as the character heals. | **Color carries meaning, not decoration.** The past is grey pencil, and ink saturation follows how alive that year feels. |
| Journey / Alto / Old Man's Journey | A lone figure crossing a landscape, flat silhouettes, no text. | Concept 2 (Four Horizons). A human figure creates empathy for free. |
| [Unpacking](https://www.gamedeveloper.com/gdc2022/gdc-2022-unpacking-a-narrative-through-1-000-household-items) | A whole life told through belongings across rooms and years, with no dialogue. | The "a Tuesday in 2034" vignette: tell a year through the objects and people around you. |
| Spotify Wrapped / Apple Fitness rings | A story-card cadence, one big number per card, made to share. Rings that close. | The result-screen cadence and the share card. Life goals can be shown as rings that do or don't close by 70. |
| Wait But Why, [Your Life in Weeks](https://waitbutwhy.com/2014/05/life-weeks.html) | A grid of weeks. | **Proof that "years as squares" is a cliché.** Don't use it. |

---

## 2. Four concepts for the core view

The 10 domains are a lot to show at once. In every concept, group them into **four families** so the
glance layer stays readable. All 10 still appear in the year card (zoom in).

| Family | Domains |
|---|---|
| **Work and money** | career, wealth, achievement |
| **People** | family, relationships, children |
| **Inner life** | mental health, happiness |
| **Direction** | life goals, personal risk |

---

### Concept 1 — "The Delta" (four rivers from one point) — RECOMMENDED

**One line:** your past is a single pencil line. Today is a glowing knot. From it, four ink rivers
flow to 70: they cross, braid, widen and go murky, while a thread from every turning point leads back
to the words you said.

```
 YOUR WORDS                       past (pencil, compressed)   future (ink, wide open)
┌────────────────────┐
│ "I can't say no    │◄──────────────┐                                     ╭── THE LEAP · Lisbon, 70
│  to my mom."  ×6   │               │                       ≈≈≈≈╮   ╭─────╯   "louder than you planned"
│                    │               │                ╭──≈≈≈≈≈≈≈≈╰───╯  (rapids = risk years)
│ "I'd paint if no   │◄──────┐       │    ╭───────────╯ ●2041 first show
│  one was watching" │       │  2001 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄◉ 2026 · YOU ARE HERE · 25 · 45 summers left
│                    │       │       │    ╲════════════════════════════════  NOTHING CHANGES · Durham
│ "Money scares me." │◄──┐   │       └────╲ 2029 · turned down Singapore      "steady, and quieter"
└────────────────────┘   │   └────────────╲━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  SECRETLY WANT
                         └─────────────────╲_____ ░░░ murky (hard years) ___  FEAR WINS
                                                   ┊
  [ happiness ▾ | money | people | work | mind | risk ]      2034 · 33  ◄ playhead (drag)   ▶ 1× 2×
```

**What the user sees, second by second** (Express run):

- **0–10s, opening.** The past ribbon draws, then the "you are here" knot, then 45 faint summer
  ticks appear and the line splits into four. Full storyboard in §5.
- **Playback (about 45s for 45 years in Express).**
  - **Layout.** The whole span fits on one laptop screen. The past is squeezed into the left ~18%
    and the future gets the rest. The uneven time axis is a statement in itself: the past is
    short and fixed, the future is wide open. It is labeled.
  - **The heads.** Each river's head is a small wet droplet. The path draws behind it
    (stroke-dashoffset), and a thin vertical playhead sweeps across.
  - **The clock.** A mono odometer reads `2034 · 33`.
  - **Captions.** Events pop as small serif captions on hairline leaders. Show at most about one
    labeled event per life every 4–5 years; smaller events are unlabeled beads you can hover.
- **A turning point.**
  1. Playback eases down to 0.3× for about 1.5s.
  2. The other three rivers dim to 30%.
  3. A caption writes itself in, word by word (not a typewriter): *"2029 — You turn down
     Singapore."*
  4. A hairline thread shoots left from the event to the **Your Words** rail. The sentence that
     caused the event lights up: *"I can't say no to my mom."*
  5. A small "why" card shows three rows:
     - **What happened**
     - **Because you said** (the quote, plus which question it answered)
     - **And the world says** (one base-rate fact with its source)
  6. In Express the card closes on its own after about 3s. In Full it stays until you dismiss it.
- **A pause (one of 4–5).**
  1. The playhead stops. The droplets freeze, and the particles hang in mid-flow like frozen water.
  2. The paper dims to a soft shadow.
  3. The question rises in large serif across the full width: *"It's 2031. You're 30. The leap
     cost your savings. What do you protect first?"*
  4. You answer **on the page**: a caret on the next line, with no input box. Or hold the mic.
  5. When you submit, your sentence flies into the Your Words rail and becomes a note.
  6. Everything right of the playhead re-routes. The old futures stay as faint dashed ghosts for
     about 3s while the new paths morph in (MorphSVG, 1.2s).
  7. A one-line change summary appears: *"Your answer moved 3 things: The Leap reaches Lisbon two
     years later. Fear Wins keeps the job. Nothing Changes is unchanged."*
  8. Playback resumes.
- **The comparison (at 70).**
  - **The mouths.** The rivers open into a delta at the right edge. Each mouth carries its title
    and a one-line verdict in that life's ink: *"A smaller life than you planned, and a happier
    one."*
  - **The slice.** Drag the playhead anywhere to get a vertical slice called **"the four of you at
    41"**: four mini cards showing city, who is around you, work, and one line.
  - **Lenses.** Lens chips re-flow every river (an animated path morph) to show money, people,
    work, mind or risk instead of happiness. Rivers that cross under a lens are honest trade-offs.
    For example, the Leap dips below Nothing Changes from 2030 to 2034, then rises above it.
  - **Counts.** The Your Words rail now shows tallies: *"This sentence shaped 6 turning points."*
- **Chat entry.** Click any point on any river. A ripple runs out from the click and the **year
  card** unfolds from that spot (Motion `layoutId`). On the left is the 10-petal year glyph and "a
  Tuesday in 2034". On the right: **"Write to yourself at 41 →"**, which opens the letter view.

**How the domains are drawn:**

| Domain | Encoding |
|---|---|
| Happiness | **Vertical position** (the default lens). The scale is a 0–10 life-satisfaction ladder, like the Cantril ladder used by Gallup and the World Happiness Report. The shape is shown, not a numeric score. |
| Wealth | **River width** (a log scale of net-worth band). A river widens as it gathers resources. |
| Mental health | **Clarity of the water.** Hard stretches turn murky: lower opacity and a grain texture, with a caption such as "the heavy years". No diagnoses. |
| Personal risk | **Rapids.** The edge turns turbulent (noise displacement) with white flecks, for financial or career risk only (no health danger). |
| Relationships | A **partner strand** braids into your river in the year you meet. If you separate, it peels away and fades. |
| Children | **Small strands** emerge from the river, run alongside it, and branch off on their own when the child leaves home. This is the moment people lean in. |
| Family | An amber **strand from upstream** (your parents and your origin) that runs close if you stay near and drifts away if you leave. Shown fully only in the People lens. |
| Career | **Stones** on the river carrying the job title or role; the Work lens re-flows height to career level. |
| Achievement | **Beads** on the thread, sized by magnitude. |
| Life goals | The goals you named become **flags on the right-hand bank at 70**. Each river shows which flags it reached: filled flags, or rings that close. |

**Color, type and motion language:**
- **Surface.** Warm paper. The past is graphite pencil; the four lives are four inks; the "you are
  here" knot is ink with a slow, pulsing ring.
- **Type.** Big editorial serif for the questions and verdicts, a mono for years and labels.
- **Motion feels like water, not UI.** Long ease-outs for drawing paths. Short "breath" holds
  (600–900ms) at key beats. No bouncy springs on data; springs only on the cards you drag.

**Why it's emotionally powerful:**
- The geometry is the thesis. You literally see one moment fan out into four lives.
- Children's strands leaving the river, a partner's strand braiding in, a river going murky and
  then clearing: these read instantly without a word.
- The receipt threads make the "it's not a horoscope" point visible. You can watch your own
  sentence pull on your life.

**Build difficulty (24h):** medium, about 3 out of 5.
- It is all data-driven SVG: four paths of about 45 points each, d3 curves, a GSAP timeline.
- It needs no illustrator and no art assets.
- The particles are optional polish.

**Risks:**
- **It can look like a stock chart or a Sankey diagram.** Avoid that with no axes, no gridlines,
  hand-tuned curves, a paper texture and direct labels.
- **Clutter.** Cap the labels, dim the inactive lives, and use lenses.
- **It is abstract, with no humans in it.** The year card, the "Tuesday" vignettes and the letters
  supply the human scale.

---

### Concept 2 — "Four Horizons" (four of you walking)

**One line:** a lone silhouette walks through a time-lapse of your past, stops at a signpost that
says *you are here*, and then the world splits into four stacked horizons. Four of you walk on, and
companions, children, weather and landmarks gather around each one.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ clear gold sky        ^ summit (2041)        |2034|      THE LEAP        │
│ __/\_______[studio]_____o o__________________|____|____  (you + partner) │
├─────────────────────────────────────────────────────────────────────────┤
│ flat grey, light fog            [office tower]            NOTHING CHANGES│
│ ___________________________o_____________|2034|________                  │
├─────────────────────────────────────────────────────────────────────────┤
│ low cloud            ~rain~         home window lit (near)     FEAR WINS │
│ ________________o_____[house]___________|2034|________                   │
├─────────────────────────────────────────────────────────────────────────┤
│ dawn            distant mountain (the goal)  o o o (kids)  SECRETLY WANT │
│ ____/‾‾‾‾\_____________ rope bridge (risk) ====___|2034|___              │
└─────────────────────────────────────────────────────────────────────────┘
```

**Second by second:**
- **Opening.** A pencil-sepia time-lapse shows the past in about 4s: a school, a plane, a campus
  tower. The figure reaches a crossroads post. The camera cranes up and the world splits into four
  bands, each with its own flat sky.
- **Playback.**
  - Parallax side-scroll, with each life's terrain generated from its data.
  - Mile-posts carry the year numbers.
  - Each year passes as one flash of summer light, so you literally count summers.
- **Turning point.** The figure stops at a signpost: *2029 · Singapore →*. The road not taken
  greys out. Tap the sign to get the why card.
- **Pause.** All four figures stop, turn, and face the camera. It is eerie and unforgettable. The
  question appears. When you answer, the road ahead re-paves itself tile by tile.
- **Compare.** Zoom out to four full panoramas and scrub with a lantern cursor.
- **Chat.** Tap a figure. They sit on a bench, and their letter appears as text written in the
  sky, not in bubbles.

**How the domains are drawn:**
- **Happiness** is the sky light.
- **Mental health** is the weather: fog and rain years.
- **Wealth** is the dwellings you pass, from a room to a flat to a house.
- **Career** is the landmarks on the horizon.
- **Relationships** is a companion walking beside you; the distance between you is closeness.
- **Children** are small figures who join you, grow up, and run ahead onto their own path.
- **Family** is the lit window of your home house, and its distance from you.
- **Achievement** is a summit with a flag.
- **Life goals** are a mountain you can see the whole way. Does the path reach it by 70?
- **Personal risk** is rope bridges and cliff edges.

**Style:** flat silhouettes and a limited palette per band, in the spirit of Alto, Monument Valley
and Old Man's Journey. Three or four parallax layers, weather particles and a continuous walk cycle.

**Why it's powerful:** a human figure triggers empathy instantly. Watching "you" walk hand in hand
with a child, or watching a companion take a different fork, is visceral. The moment all four turn
to face you is the most memorable beat of any concept here.

**Build difficulty:** hard, about 4.5 out of 5.
- It needs a parametric figure with walk, stop, turn and sit states. Rive or hand-rigged SVG would
  work.
- It needs procedural terrain: four bands, each with four parallax layers, in Canvas.
- It needs a landmark library.
- It needs performance work for the judges' laptops.

**Risks:**
- Art quality decides everything; a cheap figure kills it.
- It can read as a "mobile game".
- Four bands make the figures small.
- Showing wealth as houses can feel materialistic.
- The figure's gender and appearance must be abstract and neutral.
- It eats the whole of Saturday.

---

### Concept 3 — "The Herbarium" (four specimens grown from your roots)

**One line:** your past is a root system drawn underground. The soil line is today. Four plants
break through the soil and grow up a pressed-specimen sheet, one leaf per year. The branches you
don't take stay as pencil sketches.

```
 ┌─ NOTHING CHANGES ──┐ ┌─ THE LEAP ─────────┐ ┌─ FEAR WINS ────────┐ ┌─ SECRETLY WANT ────┐
 │            70 ·    │ │        * 70  bloom │ │           70       │ │      ✿ 70 fruit    │
 │            |       │ │      \ |  /        │ │          |         │ │     /|\            │
 │      ~leaf |       │ │  ✿---+-+  2041     │ │    curl  |  thorns │ │  --+ | +-- vine    │
 │            |       │ │      / | (partner  │ │   leaf --|  ><     │ │    | |/ (partner)  │
 │   2029 ┈┈┈ |       │ │   ┈┈┈  |  vine)    │ │          |         │ │ ., | seedlings     │
 │ ~~~~~~~~~~~ soil = today · you are here · 25 ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ │
 │   roots: born BKK ── moved ── Duke ── first job   (your past, shared by all four)        │
 └──────────────────────────────────────────────────────────────────────────────────────────┘
   field note, 2029: "turned down Singapore — you said you can't say no to your mom."
```

**Second by second:**
- **Opening.** The roots draw fast underground, each milestone a small root node with a tiny
  label. Then the soil line, then four shoots break through.
- **Playback.**
  - The four sheets sit side by side and grow from the bottom up, one node per year.
  - A ruler in the margin shows the ages.
  - Field notes in small italic appear in the margins; these are the captions.
- **Turning point.** The stem forks. The branch not taken is drawn in pencil and stops: the road
  not taken, literally. Tap it to see a typed specimen label pinned to the sheet; that is the why
  card.
- **Pause.** The sheets slide together under a glass press, and the question is typed on the
  press label. When you answer, the future buds re-sprout.
- **Compare.** A herbarium drawer opens: four sheets with specimen names (*"Supawich, var.
  Lisbon"*).
- **Chat.** A magnifier loupe on any node opens *"Write to yourself at 41"*.

**How the domains are drawn:**
- **Roots** are your family and origin. A root glows when family pull shapes a decision.
- **Leaf size** is wealth.
- **Leaf color saturation** is happiness. A **curled leaf** marks a heavy year (mental health).
- **Blooms** are achievements; **fruit** is a life goal reached.
- **Branches** are career shifts, each with a tag.
- **A twining vine** is a partner.
- **Seedlings** at the base are children, growing their own small sprouts.
- **Thorns** are risk.

**Style:** cream paper, botanical ink, pencil textures, a hand-drawn "how to read this" legend.
Pure Lupi data humanism.

**Why it's powerful:** growth is a gentle, non-judgmental metaphor. Every person's four plants are
unique generative art, which makes it the best share card of the four concepts. It feels handmade,
the opposite of AI-generic.

**Build difficulty:** medium-hard, about 3.5 out of 5.
- It needs a procedural plant: a spline stem plus glyph placement, with no real L-system needed.
- The legend is required, and so is readability tuning.

**Risks:**
- The legend costs the reader effort, which judges skim past.
- It can feel twee or like a wellness app (the category that lost last year).
- Blooms for achievements may moralize.
- Exact comparisons between lives are harder.

---

### Concept 4 — "The Book That Splits" (one page, then four columns)

**One line:** your life story is typeset as a single page in second person. At today the page
tears into four columns, and four versions of your life keep writing themselves side by side,
synchronized by one year ruler. Re-tuning shows up as an editor's red pen.

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ 2001  You were born in Bangkok. 2019  You moved to Durham for Duke. 2023  ... │
 │ ───────────────────── 2026 · You are here. You are 25. ──────────────────────  │
 ├──────────────────┬──────────────────┬──────────────────┬──────────────────────┤
 │ NOTHING CHANGES  │ THE LEAP         │ FEAR WINS        │ THE ONE YOU SECRETLY │
 │ Durham · alone   │ Lisbon · with M. │ Durham · w/ mom  │ WANT · Chiang Mai    │
 │ 2027 You stay at │ 2027 You quit in │ 2027 You take the│ 2027 You start       │
 │ the lab. ▒career▒│ March.¹ ░money░  │ safer offer.²    │ painting at night.   │
 │ 2029 ~~~~~~~~~~~ │ 2029 ~~~~~~~~~~~ │ ...              │ ...                  │
 │ ┊ (happiness     │ ┊                │ ┊                │ ┊                    │
 │ ┊  pencil line)  │ ┊                │ ┊                │ ┊                    │
 └──────────────────┴──────────────────┴──────────────────┴──────────────────────┘
  ¹ You said: "I'd paint if nobody was watching."  · About 1 in 5 who ... (source)
```

**Second by second:**
- **Opening.** Your past sets itself fast in big serif, with the years in the margin in mono. A
  hairline rule reads *You are here*. The page splits into four with a paper-slide motion (GSAP
  Flip).
- **Playback.**
  - The four columns write themselves year by year.
  - A shared year ruler on the left keeps them in step.
  - Each column's running head shows the current city and who is with you.
- **Turning point.** A sentence gets a superscript. Tap it and the footnote slides up: your quote
  plus one base rate.
- **Pause.** The four columns slide back together into one page, and the question is typeset as a
  huge pull quote. You type on the page's next line. When the columns re-split, you watch **track
  changes** happen: struck-through sentences and red insertions where your answer rewrote the
  future. It is the most honest picture of re-tuning in any concept.
- **Compare.** A "front page at 70": a four-column newspaper spread with a headline and a pull
  quote per life.
- **Chat.** Correspondence. You write a letter, and the reply comes back with a dateline.

**How the domains are drawn:**
- **Ink highlighting.** Every generated sentence is tagged with a domain, and its family's
  highlighter tint shows behind the words. You can see at a glance that one column is all
  work-blue with no people-rose.
- **A pencil line in each gutter** traces happiness.
- **Printer's marks** (§ ¶ † ‡ *) stand in for domain icons, so no emoji are needed.

**Why it's powerful:** words are the AI's native output. Generation streams straight into the
layout, with no translation layer, so it feels like your life being written. The red-pen re-tune
is unforgettable.

**Build difficulty:** easy to medium, about 2 out of 5.

**Risks:**
- Reading load: judges skim, and four columns of prose is a lot to take in.
- It is less game-like.
- It must be typographically excellent to beat the plain-chat look.
- **Best used as the Read mode and the fallback**, not as the hero.

---

### Considered and rejected

- **"Four Rooms" (Unpacking style).** Each life is a room that changes year by year: a desk, a
  crib, photos, plants. It is emotionally great but needs a library of hundreds of drawn objects,
  which is impossible in 24h without inconsistent AI images.
- **"Four Windows" (one building at night, four lit windows).** It is charming, but the domains get
  too small to read.
- **Constellations.** Stars and lines read as horoscope, which is exactly the "not a horoscope"
  thing we are fighting.

---

## 3. Signature interactions (work in any concept)

1. **Receipt threads.** Your answers live as pinned notes in a "Your Words" rail. Every turning
   point draws a hairline back to the note that caused it, and notes count their threads (*"shaped
   6 turning points"*). This makes the technical accomplishment visible, and it is the pitch's
   "not a horoscope" moment in one picture.
2. **Freeze-frame pause.** Time stops physically: particles hang, droplets freeze, the color drains
   except for the question. It reads as "the four of you are waiting for your answer."
3. **Ghost re-route.** After an answer, the old future stays faintly dashed for about 3s while the
   new one morphs in, followed by a one-line change summary. People can see that their answer
   mattered.
4. **Lens re-flow.** One tap re-flows all four lives to another domain family, as an animated
   morph. Comparison becomes a gesture.
5. **Slice.** Drag the playhead to see "the four of you at 41" side by side.
6. **Letters, not chat.** Future you writes back with a dateline (*Lisbon, March 2052*), a
   salutation (*Dear 25-year-old me,*) and a signature. Suggested follow-ups appear as small paper
   slips (*What did it cost? · Was it worth it? · What should I start this week?*). Text reveals
   word by word with a soft ink fade. **Never use a typewriter effect or typing dots; that is the
   chatbot tell.**
7. **"Ask all four."** One question gets four letters side by side. This is the in-chat compare,
   anchored in lives rather than personas, so it does not look like PersonaReflect.
8. **"What if" fork.** From any turning point, *"Change this"* lets you type a different choice. A
   fifth dashed ghost river spawns from that point.
9. **The past ribbon is editable.** Fix a wrong fact and the river's source updates.

---

## 4. Recommendation: The Delta, with Concept 4 as the Read mode and fallback

**Why the Delta:**
1. **The thesis is in the geometry.** "Four of you, from the same moment: today" becomes one point
   splitting into four. At an expo booth the visual has to explain itself in about one second, and
   this is the only concept that does it with zero legend.
2. **It plays to the owner's strength.** Path drawing, morphing, timeline choreography and easing
   are pure motion craft. No illustration pipeline is needed.
3. **Comparison is native.** All four lives sit on one shared axis. Crossings show honest
   trade-offs: the leap costs before it pays.
4. **One artifact does three jobs.** The same SVG is the playback, the comparison poster and the
   share card.
5. **It is nothing like 1 in 8 Billion's look.** Continuous ink rivers on paper versus meters and
   a grid of squares.
6. **Threads are the motif everywhere:** rivers, partner strands, children's strands, receipt
   threads.
7. **Same data contract as Concept 4.** If the river rendering is behind schedule at noon Saturday,
   swap the hero to the Book view without touching the backend.

**What to borrow from the others:**
- From Concept 3: the 10-petal year glyph, used in the year card and on the postcards.
- From Concept 4: the letters, the footnote-style why card, and the red-pen re-tune summary (as
  text under the ghost re-route).
- From Concept 2: the "all four turn and face you" beat, done abstractly. At a pause, the four
  river heads lift and glow, and a tiny label under each reads *"waiting for you"*.

---

## 5. The opening shot (first 10 seconds) and the result moment

### Opening storyboard (recommended)

| t | What's on screen |
|---|---|
| 0.0s | Warm paper, empty. A small mono `2001` sits at the far left. |
| 0.0–3.5s | **The past draws in pencil, fast.** Milestones from your answers pop up as tiny labels and fade (*born, Bangkok · 2019 Durham · 2023 first job*), while the counter flies 2001→2026. It is too fast to hold, like life flashing past. |
| 3.5s | The line reaches a point and **stops dead**. The ink knot appears with a pulsing ring. A beat of silence. |
| 4.2s | Serif, large: **"You are here. You're 25."** |
| 5.0–6.5s | To the right, **45 faint vertical hairlines** ripple in one by one, one per summer, filling the empty future. Then: **"You have 45 summers left."** |
| 7.0s | **"Here are four ways to spend them."** |
| 7.8s | The knot splits into four. The inks bloom one by one, each with its title fading in at the head. |
| 8.5–10s | The four droplets start flowing and the counter resumes at `2027 · 26`. We are playing. |

Generation runs during the opening. The 10-second opening plus the first 4–5 played years (about
5s) buys roughly 15 seconds of model time. Generate the four lives' **skeletons first** (turning
points and keyframes for each life) and stream the details. **The animation is the loading
screen. No spinners anywhere.** Keep a pre-baked demo life as a fallback for flaky Wi-Fi.

**Alternative hooks:**
- **Your name, ×4.** Your typed name sits center screen, then splits into four copies that drift
  apart, each re-setting in a different weight or style. It is fast and very typographic.
- **Summers countdown.** A single number `45` set huge, with four colored tallies peeling off it.
  Minimal and strong on a big booth monitor.
- **Pure darkness and one line.** The same storyboard on night ink instead of paper, if the owner
  wants drama.

### The result moment

1. **Postcards from 70 (recommended).**
   - **The cards.** At 70, each river mouth slides out a postcard. The front is that life's river
     segment drawn as art, with the city name. The back holds 50–70 words from that self, a
     postmark (*Lisbon · 2071*), and the 10-petal glyph for that life's average.
   - **The choice.** Fan the four postcards out and ask: **"Which one are you going to live?"**
     Picking one is the final reflective act.
   - **The closing question.** Then one more open question: *"What's one thing you'll do this
     week?"* This is an implementation intention, the bridge from insight to action.
2. **The closeness measure (your pitch number).**
   - **Before:** at the start, the user drags two circles, *you today* and *you at 70*, to show how
     much they overlap.
   - **After:** at the end they do it again, and the screen shows *"You moved 2 steps closer to
     yourself at 70."*
   - **Source:** this follows the overlapping-circles future self-continuity measure used in
     Hershfield's work, which was adapted from Aron's Inclusion of Other in the Self scale.
     **Verify the exact scale before quoting it on stage.** It is diegetic, takes five seconds,
     and gives the "connection went up from X to Y" number.
3. **"The sentence that shaped your life."** Reveal the note with the most receipt threads. This is
   powerful but **private by default**: it often contains sensitive words.

### Share cards

Render the cards client-side from the existing SVG as a PNG. Sizes are 1200×630 for link previews
and 1080×1350 for stories. Share through the Web Share API (with files) on phones and as a download
on laptops. **By default nothing personal goes on the card unless the user ticks it.**

- **"The Delta"**: the four rivers as art, plus first name, *25 → 70*, *Four lives I could still
  live*, and the four titles. No answers on it.
- **"Postcard from 70"**: the chosen postcard's front, plus one line from its back (opt-in).
- **"The fork"**: *"In 2029, my lives split four ways."* plus the delta art around that year.
- **"45 summers"**: 45 tick marks in four inks, *45 summers. 4 ways.* The most minimal card, and
  the one most likely to be shared.

**Privacy fit.** "Data is never saved" means no share links with stored data by default. For the
site's own link preview, use a static OG image. Dynamic OG images through
[workers-og](https://github.com/kvnang/workers-og) (Satori + resvg on Workers, see the
[Cloudflare tutorial](https://developers.cloudflare.com/workers/tutorials/generate-dynamic-og-images-using-workers))
only make sense if the owner decides to add opt-in share links. Never put answers in URL
parameters.

---

## 6. Flexible depth: a 90-second judge and a three-hour night

The same view serves both. **Depth is reached by zooming and slowing, not by different screens.**

**Disclosure layers:**

| Layer | What you see | How you get there |
|---|---|---|
| **L0 Glance** | The four rivers, the titles, the verdicts at 70 | It plays automatically |
| **L1 Captions** | Labeled turning points | Auto in Express; hover in Full |
| **L2 Why** | The quote, the receipt thread, the base-rate fact | Auto-pop at major turns; tap any bead |
| **L3 Year** | The year card: 10-petal glyph, "a Tuesday in 2034" (generated on demand), who's around you | Click any point on a river |
| **L4 Domain** | Lens re-flow, plus a "your money across four lives" summary | Lens chips |
| **L5 Talk / Fork** | Letters to any self at any age; "what if" fork; edit an old answer and replay | From the year card or a turning point |

**Modes:**

- **Express (booth).**
  - About 5 questions, one of them spoken.
  - One year is about 0.6s and there are only two pauses.
  - Captions and why cards play automatically.
  - Ends on the postcards, then one "write to yourself at 50" letter.
  - About 2.5–3 minutes in total, of which roughly 90s is questions.
- **Full (default at home).**
  - All 4–5 pauses.
  - One year is about 0.9s.
  - Why cards stay open until you dismiss them.
  - Uploads unlock a richer past ribbon and more receipts.
- **Deep (after the first run).**
  - Free scrub, lenses, forks, and editing answers.
  - "Ask all four", long letters, and a Read mode (Concept 4 typesetting) for each life.
  - Sessions are kept in localStorage only.

**Booth extras:**
- **Attract mode.** After 30s idle, the owner's demo life replays on a loop with one line: *"Give
  me 90 seconds and I'll show you four of the lives you have left."* Arcade machines have done this
  for 40 years because it works.
- **Speed control.** Pause, 1×, 2×, and "skip to 70", always visible.
- **Keyboard:**

| Key | Action |
|---|---|
| Space | Play / pause |
| ← → | Step a year |
| 1–4 | Focus one life |
| L | Cycle lenses |
| Esc | Zoom back out |

---

## 7. Voice

**Speaking an answer (push-to-talk):**

```
 idle ──(hold mic stone / hold V)──▶ listening ──(release)──▶ review ──(Enter / 1.5s ring)──▶ sent
         the river ripples with        grey interim words      words turn ink,     the sentence flies
         your mic level                stream in big serif     editable inline     into "Your Words"
```

**How it behaves:**
- **The mic.** The mic is a round "stone" under the question. While you hold it, **the water
  ripples with your voice level**, so the mic is part of the world rather than a separate widget.
- **Live transcript.** Words stream in large serif, interim words at 40% opacity, final words in
  full ink. They are always editable before sending.
- **Auto-send.** It happens after a visible 1.5s countdown ring; any keystroke cancels it.
- **The prompt.** *"Say it the way you'd tell a friend."* Open answers come out better spoken.
- **Keys.** Don't bind push-to-talk to Space, because Space is play/pause. Hold **V**, or press
  and hold the on-screen button. Click to toggle for accessibility.
- **Typing stays first-class.** Expo floors are loud. Bring a headset or lapel mic for the booth.

**Speech-to-text options:**
- **Primary: the browser Web Speech API**
  ([MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API)).
  - It is the fastest way to get a live interim transcript.
  - It works in Chrome, Edge and Safari (as `webkitSpeechRecognition`), but **not Firefox**.
  - Chrome sends the audio to Google's servers unless `processLocally` is set and supported.
    Support for that is patchy ([caniuse](https://caniuse.com/mdn-api_speechrecognition_processlocally)).
  - Say so in the consent copy.
- **Fallback: record and upload.** Use `MediaRecorder` and send the audio to a Worker route.
  - Workers AI options are `@cf/openai/whisper-large-v3-turbo` and `@cf/deepgram/nova-3`
    ([Cloudflare partner models](https://blog.cloudflare.com/workers-ai-partner-models)).
  - Alternatively, send the audio straight to Gemini, which takes audio input.
  - Check the current model catalog before building.

**Hearing future you (optional, stretch):**
- **Off by default at the booth** because of the noise. Offer a "Hear this letter" button on each
  letter.
- **Captions** highlight by sentence while it plays.
- **TTS options.** Gemini speech generation, steered by a style prompt such as *"Speak slowly and
  warmly, a little tired, like someone of 62 looking back."* Model IDs to check against
  [Google's docs](https://ai.google.dev/gemini-api/docs/speech-generation):
  - `gemini-2.5-flash-preview-tts` (older)
  - `gemini-3.1-flash-tts-preview` (newer)

  Workers AI `@cf/deepgram/aura-1` is a cheap alternative.
- **Latency.** Stream it sentence by sentence.
- **No voice cloning of the user.** It is the audio version of the aged-face video the owner
  called cringe, and it raises consent problems. Instead, let the user choose from 2–3 neutral
  voices, with age conveyed by the style prompt.

---

## 8. Front-end tech for the motion

| Option | Fit for this project | Verdict |
|---|---|---|
| **GSAP 3.13+** (free incl. SplitText, MorphSVG, DrawSVG, Flip, CustomEase since Webflow's 2025 change: [CodePen](https://blog.codepen.io/2025/05/05/chris-corner-gsap-more-like-freesap/), [license](https://gsap.com/community/standard-license/)) | One master `timeline` covers the whole requirement:<br>• year labels: `addLabel('y2034')`<br>• pauses: `addPause`<br>• speed: `timeScale()`<br>• jump to a year: `tweenTo()`<br>• scrubbing: `progress()`<br>DrawSVG draws the rivers, MorphSVG does re-routes and lens re-flows, SplitText does the caption reveals. Use `@gsap/react` `useGSAP`. | **Use. It is the clock and owns the stage.** |
| **Motion** (motion.dev, formerly Framer Motion) | `AnimatePresence`, `layoutId` shared-element transitions (a river point unfolding into the year card, a postcard expanding), springs for draggable cards. About 34KB, or about 5KB with `LazyMotion` + `m`. Weaker for one long, scrubbable, choreographed timeline. | **Use for DOM overlays only.** Rule for the agents: **GSAP owns the SVG stage, Motion owns the cards and drawers.** If they start fighting, go GSAP-only (Flip covers layout transitions). |
| **D3** (`d3-shape`, `d3-scale` only) | `curveCatmullRom`/`curveBasis` for river centerlines, `area` for widths, scales for the uneven past/future axis. React renders the `<path>`. | **Use for the math only, never `d3.select`.** |
| **simplex-noise** | Turbulent river edges for risk, grain for murky years. Tiny. | **Use.** |
| **Canvas 2D** | Up to about 400 flowing specks along the paths (`getPointAtLength`, precomputed) at 60fps. | **Optional polish layer** under the SVG. |
| **PixiJS v8** | Great for thousands of sprites; overkill here, and adds a renderer to reconcile with SVG. | Skip (only for Concept 2). |
| **Three.js / R3F** | Shader water would be gorgeous, but it is a 24h risk, an accessibility burden, and makes share-card export harder. | **Skip.** |
| **Rive** | The best tool for an interactive character (Concept 2's walker with a state machine), but it needs time in the Rive editor. | Only if Concept 2 wins. |
| **Lottie** | Pre-baked; it can't be driven by data. Every life is unique. | **Skip.** |

**Recommended stack (24h, static on Cloudflare Workers):**
- **App:** Vite + React + TypeScript, built as a single-page app and deployed as **Workers static
  assets** (`not_found_handling: "single-page-application"`). One Worker serves `/api/*`: the
  Gemini proxy (keeps the key server-side), plus STT and TTS routes.
- **Styling:** Tailwind v4 with our own tokens (below) is fine for layout speed. **Do not install
  shadcn's default theme.**
- **Fonts:** self-host them via Fontsource (`@fontsource-variable/...`). They are SIL OFL
  licensed, and **expo Wi-Fi is flaky**, so nothing should load from fonts.googleapis.com at
  runtime.
- **Share PNG:** serialize the stage SVG with `XMLSerializer`, draw it onto a canvas with
  `drawImage`, then `toBlob`, all on the client. The paper texture must be inlined as a data URI.
- **Performance:**
  - Never animate SVG filters such as `feTurbulence`; pre-render the paper texture as a static
    image.
  - Cap canvas DPR at 2 for 4K booth monitors.
  - Precompute path lengths.
  - Test on a MacBook Air and on the booth monitor.

**Accessibility:**
- **Reduced motion.** Branch with `gsap.matchMedia()` and Motion's `MotionConfig
  reducedMotion="user"`. Under `prefers-reduced-motion`:
  - no particles
  - path draws become 200ms crossfades
  - the counter jumps instead of rolling
  - playback becomes step-through ("Next turning point →")
  - the meaning stays the same
- **Read mode (Concept 4) is the accessible view.** The same data as an ordered list of years per
  life, with real headings and footnotes. It is also what screen readers get. The SVG stage gets
  `aria-hidden`, with a live region announcing the current year and event.
- **Contrast.** Rivers are graphics and need **3:1** against the paper (WCAG 1.4.11). Text labels
  need **4.5:1**, so use the darker "text" ink variant of each life color for labels.
- **Color is never the only signal.** Each river is labeled directly at its head and its mouth.
- **Keyboard and focus.** Every interaction has a keyboard path (§6) and visible focus rings drawn
  as ink underlines.
- **Captions** for any TTS.

**Data contract** (shared by every concept; hand it to the backend agents):

```ts
type Domain = 'career'|'wealth'|'achievement'|'family'|'relationships'|'children'
            |'mentalHealth'|'happiness'|'lifeGoals'|'personalRisk';

type Answer = { id: string; questionId: string; text: string; spoken: boolean; at: string };

type Life = {
  id: 'drift'|'leap'|'fear'|'secret';            // UI titles are a copy decision (see §11)
  title: string; verdict: string;                // "A smaller life than you planned, and a happier one."
  keyframes: Array<{                             // every 2–5 years; client splines between them
    age: number; year: number; city: string;
    ladder: number;                              // 0–10 life satisfaction → default y
    domains: Record<Domain, number>;             // 0–100, used for lenses + year glyph (never shown as numbers)
    netWorthBand: 0|1|2|3|4|5;                   // → river width
    partner: 'none'|'dating'|'together'|'apart'; kids: Array<{ bornYear: number; leavesYear?: number }>;
  }>;
  events: Array<{
    year: number; age: number; domain: Domain;
    weight: 'major'|'minor';                     // major = caption + slowdown; minor = bead
    title: string;                               // "You turn down Singapore."
    why: { answerIds: string[]; quote: string; stat?: { text: string; source: string; url?: string } };
  }>;
  postcard: { city: string; text: string };      // the "from 70" back side
};
```

---

## 9. Typography and color

**Font pairings** (all on Google Fonts; self-host them):

| Pairing | Mood | Notes |
|---|---|---|
| **Newsreader** (variable, opsz 6–72) + **IBM Plex Mono** | Editorial, literary, calm. **Recommended.** | Newsreader at opsz 72 and weight 300–400 is gorgeous for "You have 45 summers left." The italic suits the verdicts and letters. Plex Mono suits years, ages and labels. Set `font-variant-numeric: tabular-nums` on every counter so the digits don't jitter. |
| **Fraunces** (variable: opsz, SOFT, WONK) + **Inter Tight**/**Work Sans** | Warmer, a bit playful. | Party trick: animate the `SOFT` axis from 0 to 100 as a life ages, so the type literally softens. Fraunces is getting common, so use it sparingly. |
| **Literata** + **JetBrains Mono** | Bookish, highly legible. | Best for Concept 4's Read mode. |

**Avoid:**
- **Instrument Serif italic plus Inter.** It became the 2025 "AI startup landing page" pairing.
- **Handwriting fonts** for the letters. They look like a greeting card. Use the serif italic
  instead.
- **Space Grotesk.**

**Color tokens** (paper is the default at the booth: bright halls and glossy screens favor light,
and it separates us from dark-mode AI apps):

```css
:root {                          /* paper */
  --paper: #F2ECDF; --paper-2: #E8E0CF; --rule: #CFC6B2;
  --ink: #1D1B17;  --ink-2: #5A554B;  --pencil: #9A9384;   /* the past */
  --life-drift:  #55595C;  /* If nothing changes: graphite, deliberately colorless */
  --life-leap:   #2E4A9E;  /* You take the leap: ultramarine */
  --life-fear:   #2F7D78;  /* Fear wins: deep teal */
  --life-secret: #C2412D;  /* The one you secretly want: vermilion */
  --family-amber: #B5660E; /* upstream family strand */
}
:root[data-theme="night"] {      /* optional night variant */
  --paper: #13120F; --paper-2: #1C1A16; --rule: #34302A;
  --ink: #ECE5D6;  --ink-2: #A8A090;  --pencil: #6E685D;
  --life-drift: #A6A9A8; --life-leap: #8EA4F0; --life-fear: #5FC0B6; --life-secret: #F07A5F;
}
```

These contrast values are estimates. Run every ink through a contrast checker and a color-blindness
simulator before locking them, since direct labels carry the identity anyway.

**Motion tokens:**
- **Draw ease:** `cubic-bezier(.22,.61,.36,1)`.
- **Breath holds:** 600–900ms.
- **Playback speed:** one year takes 0.6s in Express and 0.9s in Full. At a major turn, ease to
  0.3× for 1.2s.
- **Re-route morph:** 1.2s. The ghost stays for 3s.
- **Text reveal:** by word, with a 30ms stagger and an 8px blur-to-sharp. Never character by
  character.

---

## 10. Anti-patterns (what makes it look cheap or AI-made) → what to do instead

| Looks cheap / AI-generated | Do instead |
|---|---|
| Emoji as domain icons (🎓💼❤️👶💰) | Draw domains in the same ink as the river (beads, strands, flags) or use printer's marks. If an icon is unavoidable in the chrome, use one consistent set (Phosphor or Lucide via better-icons) at hairline weight. |
| Purple-to-pink gradients, glowing orbs, a ✨ "AI" sparkle | Flat inks on paper, one accent per life, and no gradients except a soft paper vignette. |
| Glassmorphism (`backdrop-blur` cards everywhere) | Paper cards with hairline rules and a 1–2px radius, like a printed object. |
| Default shadcn look: zinc palette, `rounded-xl` cards, Inter, gray icon circles, badges | An editorial grid with serif + mono, rules instead of boxes, and generous margins. |
| Chat bubbles left/right with avatars and "…" typing dots | Letters with a dateline and signature, an ink-fade reveal, and paper slips as suggestions. |
| Typewriter character streaming | A word-level fade-in. Or render the turning point first and the text after. |
| Spinners and skeleton screens while the AI thinks | The animation is the loader. Stream the skeleton first. *"The four of you are taking their first steps."* |
| 0–100 meters, progress bars, a grid of year squares (1in8b and Life in Weeks) | Continuous forms: width, clarity, strands, height. |
| Fake precision ("Happiness 73.4%") | Shapes and plain words ("the heavy years", "a steady decade"). Show numbers only for real-world stats, with a source. |
| A centered hero with a gradient headline and a "Get started" button | Open on the content: the pencil line starts drawing, then *"Tell me who you are."* |
| AI-generated faces, aged photos, stock sunsets | No faces at all (the owner's call). Abstraction is more universal and more honest. |
| Bento grids, dashboards of 10 small charts | One hero visual and one focal point at a time. |
| Everything fading up 20px on scroll | Motion only where it carries meaning: time passing, a decision, a change. |
| Confetti, toasts, a modal with an ✕ | A quiet freeze-frame, inline notes, and Esc to zoom out. |
| Peppy copy ("Your journey awaits! 🚀") | Plain, honest, second person, short: *"You're 25. You have 45 summers left."* |
| Disclaimers everywhere | One honest sentence on the consent screen. If something worrying is written, show a calm inline panel with help resources. No red alert styling. |
| Inconsistent AI images per year | No per-year images. The data is the art. |

---

## 11. Questions the owner must decide

1. **Concept:** the Delta (recommended), Four Horizons (more emotional, much riskier), or the
   Herbarium? And should Concept 4 be the Read mode and fallback?
2. **Surface:** warm paper (recommended for the booth) or night ink?
3. **User-facing life titles.** "Fear wins" is harsh on a share card. Keep it, or use gentler names
   ("The safe road", "The leap", "If nothing changes", "The one you secretly want")?
4. **Glance-level domains:** happiness as height, wealth as width, plus strands for people. Is
   that the right default lens, or should the first view lead with something else?
5. **Show numbers?** Should the ladder show "6.8 / 10" on hover, or only shapes and words?
6. **Pauses in Express:** one or two?
7. **Sound:** an ambient score or a tone per year? It is risky on a loud floor but great with
   headphones.
8. **Voice output (TTS):** in scope for Sunday, or a stretch goal?
9. **Sharing:** download-only PNG (keeps the "never saved" promise), or opt-in share links with
   stored card data and dynamic OG images?
10. **Attract mode** with the owner's real life on a public booth monitor: is that OK, or should
    it use a fictional demo person?
11. **The closeness measure** (two overlapping circles before and after): include it as the pitch
    number?

---

## Sources

- 1 in 8 Billion: https://1in8b.life/en/; coverage: https://gamewith.jp/gamedb/18821/articles/64850, https://realsound.jp/tech/2026/10/post-2558126.html/amp
- MIT Future You: https://futureyou.media.mit.edu
- NYT Upshot (2018), race and income mobility: https://www.nytimes.com/interactive/2018/03/19/upshot/race-class-white-and-black-men.html; https://flowingdata.com/2018/03/29/income-mobility-for-different-groups/
- The Pudding, "This is a teenager" (coverage): https://flowingdata.com/2024/04/15/teenage-adversity-that-carries-into-adulthood
- Giorgia Lupi: https://www.printmag.com/article/data-humanism-future-of-data-visualization/, https://www.pentagram.com/work/dear-data/story, https://domusweb.it/en/design/2018/03/28/facing-up-to-illness-through-the-reading-of-data.html, https://arxiv.org/abs/2509.00440v1
- Feltron reports: https://dublin.sciencegallery.com/lifelogging-exhibits/feltron-annual-report, https://underconsideration.com/fpo/archives/2012/04/feltron-2010-annual-report.php
- Florence: https://gamesbeat.com/florence-uses-clever-interactions-to-create-a-relatable-mobile-game-about-romance/
- Before Your Eyes: https://www.gamedeveloper.com/design/gone-before-you-blink-the-webcam-driven-gameplay-of-before-your-eyes
- Unpacking: https://www.gamedeveloper.com/gdc2022/gdc-2022-unpacking-a-narrative-through-1-000-household-items
- Gris: https://medium.com/theuglymonster/how-gris-paints-a-profound-psychological-experience-through-colours-64e783772058
- Wait But Why, Life in Weeks: https://waitbutwhy.com/2014/05/life-weeks.html
- Awwwards Sites of the Day (browse for current motion trends): https://www.awwwards.com/inspiration_search/sites_of_the_day/
- GSAP free incl. plugins: https://blog.codepen.io/2025/05/05/chris-corner-gsap-more-like-freesap/, https://gsap.com/community/standard-license/
- workers-og / OG on Workers: https://github.com/kvnang/workers-og, https://developers.cloudflare.com/workers/tutorials/generate-dynamic-og-images-using-workers, https://dev.to/devoresyah/6-pitfalls-of-dynamic-og-image-generation-on-cloudflare-workers-satori-resvg-wasm-1kle
- Workers AI speech models: https://blog.cloudflare.com/workers-ai-partner-models, https://github.com/cloudflare/ai/releases/tag/workers-ai-provider%403.1.0
- Gemini speech generation: https://ai.google.dev/gemini-api/docs/speech-generation
- Web Speech API: https://developer.mozilla.org/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API, https://caniuse.com/mdn-api_speechrecognition_processlocally
