# Chat-centric prototype brief (shared by both variants)

## The owner's vision, in their words
"The initial idea is Future You, and Future You is just a chatbot with pre-made questions. I like a
chatbot-centric product more, with an imagined, generated future of you shown as infographics and
decorative information around the chatbot." Long text and paragraphs are fine, but don't overwhelm
the user: keep 1–2 things in focus at any moment, and let everything else be quiet extra detail.

The owner rejected the last prototypes as "a replica of 1 in 8 Billion with a new theme" and "AI
slop". **Do not** use any of these:
- parallel lanes for four lives
- a year odometer or ticker
- a scrubber full of event dots
- a "simulation playback" of a life
- 0–100 meters
- a grid of year squares
Do not open 1in8b.life, `research/02-ui-visual-concepts.md`, or the older prototypes in
`prototypes/*.html`.

## What to keep (the owner asked for these)
1. **The "why" thread.** Any fact about a future links back to the exact sentence the user said
   that caused it, plus a real base-rate statistic.
2. **The pause that faces you.** A future self stops and asks *you* a question. Your free-text answer
   visibly re-tunes **all four** futures, and the UI shows what changed in each one.
3. **The ending + five-year card.** The four 70-year-olds' one-line verdicts and a "postcard from
   70", then a card titled "Where do you see yourself in five years?" with a 3–4 sentence
   first-person answer, tabs for each life, Copy, and Read aloud (browser speechSynthesis).

## The core mechanic
**The more you tell it, the clearer your futures get.** The futures start as vague outlines and gain
detail with every answer: a city, a job, people, money, a year, a sentence. Every update should
feel caused by what was just said.

## The script (no AI; use exactly this person)
Person: Alex, 25, Durham NC. Read `prototypes/PERSONA.md` (quotes q1–q5, the four lives, base
rates) and `shared/demo/alex.json` (full structured data: profile, four lives year by year with
events, the money line, and the 2031 pause plus its re-tune). Use real numbers and events from that
JSON.

Conversation flow:
1. **Interviewer phase.** A warm interviewer, not a bot persona, asks the 5 fast-path questions:
   1. "Tell me who you are right now: how old you are, where you live, what fills most of your
      week, and how money feels."
   2. "What's the decision or worry that keeps coming back to you lately?"
   3. "Who has a say in what you do next, and what do they expect from you?"
   4. "What are you most afraid will be true about your life ten years from now?"
   5. "If nobody would judge you, what would you do with the next five years?"

   Alex's answers are written from q1–q5. After each answer, the surrounding futures visibly gain
   detail.
2. **"I can see four of you now."** The four futures snap into focus:
   - Your Path
   - The Leap
   - The Careful Life
   - The Unjudged Life
3. **Talk to one of them.** The user picks a future self and an age (default: The Leap at 41).
   The conversation switches voice: that future Alex replies in first person, specific and honest,
   not flattering. Script 2–3 exchanges. Facts mentioned in the reply light up the matching detail
   in the surroundings, with the why thread.
4. **The pause.** The future self asks: "Before I tell you more: it's 2031, you're 30, and you're
   offered the team lead role, but it eats your weekends. What do you protect first?" The user
   **types a real answer**: an actual input that accepts any text. On submit, all four futures
   re-tune with animation, and a short "what changed" summary appears for each life.
5. **Ending.** The four verdicts at 70, the postcard, then the five-year card.

Provide **Play** (the conversation types itself at a realistic pace, as a film), **Skip to** (each
phase), and **Restart**. The user can also type over Alex's scripted answer at any step; the script
continues either way. Show a small fixed label: "Prototype · <variant name> · sample person, no AI".

## Craft rules
- Load the `artifact-design` skill with the Skill tool before writing. Follow the page contract:
  - a 2–4 word `<title>`
  - tokens on `:root` with light + dark
  - scripts only from cdnjs/jsdelivr/unpkg, with exact versions (GSAP 3.12.5 on cdnjs is fine)
  - Google Fonts only
  - a single self-contained HTML file
  - no emoji
  - reduced motion respected
  - works at 1440, 1280 and 375 wide
- **No chat-app clichés.** No speech bubbles, no avatars in circles, no "typing…" dots, no
  ChatGPT-style layout. Treat the conversation as editorial typography. The interviewer, Alex, and
  future Alex each get a distinct, intentional typographic voice.
- **Avoid the AI-slop looks:**
  - cream + serif + terracotta
  - purple/blue gradients
  - glassmorphism
  - Inter or Space Grotesk as the "safe" face
  - rounded cards with shadows everywhere
  - everything centered
  - neon on near-black

  Make a specific, confident choice of palette and type that fits *this* subject: a person
  meeting themselves across time.
- **Fresh references** (use these, not simulation games):
  - Tufte-style sidenotes and marginalia
  - Stripe Press books
  - NYT / Bloomberg interactive annotations
  - film title design (Saul Bass, A24 title cards)
  - Apple's Journal app
  - the OS1 interface in the film "Her"
  - museum wall labels
  - archival documents and dossiers
  - airline or rail departure boards used sparingly
- **Motion:** one orchestrated moment per phase. Details fade or sharpen into place as they become
  known. Re-tunes morph values with a visible before→after. Never decorative noise.
- Use real infographic craft for the futures: small multiples, a money line in real $ with a tiny
  "projection, not a prediction" note, places, people, a few well-chosen numbers, and a sentence.
  Not dashboards.

## Verify
Serve `prototypes/chat/` locally (python http.server on your own port, then kill it). Open the
page in the built-in browser (mcp__Claude_Browser__* tools, your own tab; do NOT use Claude in
Chrome). Play it end to end at desktop and phone widths, in light and dark. Fix overlaps and
console errors.

Reply in ≤200 words: the concept in one line, what's on screen in each phase, your palette and type
choice and why, and what's rough.
