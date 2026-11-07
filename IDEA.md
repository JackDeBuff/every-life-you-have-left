# Every Life You Have Left

Brief for the Triangle AI Hackathon (Duke, Nov 6–8, 2026). This file is the idea and the decisions
made so far. It is **not** a build plan yet: planning starts when the event starts.

---

## The idea in one paragraph

You tell us who you are. The AI builds a picture of you and plays out **four lives you could still
live, starting from today and running to age 70**: one shaped by your own answers, plus three
different lives you would get from making other choices. Each life plays out year by year in an
animated, game-like story view. At every turning point the AI explains **how and why** it happened,
pointing back to something you actually told it. You can stop at any year and **talk to that
version of you**.

**The point:** research shows that people who feel connected to their future self make better
choices today (they save more, look after their health, and stick with things). Making those
futures feel real, personal and honest is the product.

---

## Background: how we got to this idea

The owner (Supawich) runs **fromyourlove.com**: animated "love pages" you send to someone. It is
live and has paying customers.

1. **First idea: an AI page builder for fromyourlove.** You type a prompt, and the AI picks and
   arranges the whole page, like Gamma does for slides. It was technically a great fit.
2. **We asked the organizers whether building on an existing product was allowed.** Jon
   Reifschneider replied that hacks should be built during the weekend, that building on an
   existing site is a gray area, and that he suggests starting from scratch. So we dropped the
   idea for the hackathon. It may still become a real fromyourlove feature later.
3. **Brainstorm from scratch.** Claude's first ideas were rejected by the owner as weak:
   - an AI party-game host
   - a short film made from a memory
   - a song about someone, made in a minute
   - a choose-your-own-adventure story starring you
4. **The owner brought MIT's *Future You*.** You chat with an AI version of yourself at 60. He
   thought the project had stalled before today's much stronger AI models, and asked us to think
   beyond it, without the aged-face video ("cringe"). Claude offered three directions:
   - **(1)** several futures of you, each having lived a different path, honest instead of
     flattering
   - **(2)** a future you that stays with you over weeks
   - **(3)** "future us" for couples

   **He picked (1)**, with sharply different outcomes.
5. **The owner added how it learns who you are.** Optional uploads (CV, LinkedIn, an export from
   your own ChatGPT or Claude), then follow-up questions about what people never tell their own
   AI. Then it builds a digital twin with multiple outcomes and explains how and why.
6. **The owner brought *1 in 8 Billion*** as the way to tell the story: lives played out year by
   year like a game, plus the chatbot. Its "four people born in the same second" became our
   **"four of you, from the same moment: today."**
7. **Refinements.** Explainer before consent, no race, open-ended answers instead of buttons,
   **start from today, not from birth** (his call: "I'm 25, I can't redo my life"), no death or
   serious illness, stop at 70.
8. **Name.** Candidates were Hindsight, Unlived, Lives Left, There's Still Time, Summers Left, and
   Four Ways to Grow Old. **He chose "Every Life You Have Left".**

**Parked ideas, not for this weekend:**
- the future-you-that-stays-with-you subscription
- "future us" for couples, which could feed fromyourlove later
- the fromyourlove AI page builder

---

## The flow (agreed)

1. **Explainer.** What the site is, what you are about to see, and what happens to your data.
2. **Consent.** Agree to how your data is used. This comes *after* the explainer, so people know
   what they are agreeing to.
3. **Optional uploads.** A CV, the PDF of your own LinkedIn profile (LinkedIn's "Save to PDF"
   button), and/or an export from your own AI app (we give people a prompt to paste into ChatGPT or
   Claude: "describe everything you know about me"). There is always a "skip, just ask me" path.
4. **Analysis.** Build a profile from whatever they gave: age, country, family background,
   education, work, relationships, and the big decisions so far.
5. **Questions (required).** Ask whatever is still missing, **aimed at the gaps**. The focus is
   what people never tell their own AI: family expectations, money worries, fears, what they would
   do if nobody judged them.
6. **Generate the four lives.** The hard part, and the "technical accomplishment" for the judges:
   futures that feel believable and personal, not random stories or cartoon extremes. This needs
   tuning and calibrating.
7. **The story view.** Lives play out year by year, in a style inspired by *1 in 8 Billion* (see
   references). At **4–5 pauses**, the user answers an **open-ended question** (what they focus on,
   what they choose). These are not buttons or dropdowns: they type a paragraph or a single line,
   or **speak it**.
8. **Re-tune.** Each answer feeds back in and reshapes the futures.
9. **The result.** Their own life (the one their answers shaped) plus **three different lives** to
   compare it with. No death, no serious illness. Every life stops at **70**.
10. **Chat.** Talk with any of the four versions of yourself, at any age, for as long as you like.

### The opening shot (agreed)

The decisions start **from today, not from birth**. The first screen quickly fills in the user's
real past from what they told us (for example, ages 0–25), then a **"you are here"** marker, then
the empty years still ahead. The past is shown, but only the future can be played.

Candidate opening line (an idea, not decided):
*"You're 25. You have 45 summers left. Here are four ways to spend them."*

---

## Decisions

### Made by the owner
- **Build it from scratch** in a new project, not on top of fromyourlove.com (after Jon's email,
  below).
- The idea is inspired by MIT's *Future You*, pushed further: several futures, not one.
- **Questions are required.** Uploads (CV, LinkedIn PDF, AI-app export) are optional but nice to
  have, and judges will want to try them.
- **The story is told the way *1 in 8 Billion* does it, plus a chatbot.**
- **Open-ended answers** at the decision points, not multiple choice.
- **Start from the user's current age**, not from 0.
- **No death and no serious illness. Stop at 70.**
- **Four lives:** their own plus three contrasting ones.
- **Name: "Every Life You Have Left".**
- **Demo first.** If it works, it may become a real product later.

### Suggestions that were agreed (Claude's)
- Put the explainer before consent.
- **Do not ask for race**, and never use it to shape anyone's future. Country, family background,
  education and money are enough. Marital status is optional.
- LinkedIn comes as the user's own PDF upload. **Never scrape LinkedIn** (it is against their
  terms, and investors will ask).
- Every "why" points back to something the user said, for example: *"2029: you turned down
  Singapore, because you told me you can't say no to your mom."*
- Keep it **honest, not flattering**. Base the futures on how things really tend to go (careers,
  income, moving abroad), the way *1 in 8 Billion* uses world statistics.
- Keep the futures **believable**. An early idea of four types (not locked):
  - **If nothing changes.** Usually the one that hits hardest.
  - **You take the leap.**
  - **Fear wins.**
  - **The one you secretly want.**
- **Borrow the idea of *1 in 8 Billion*, not its look.** Years ticking by, meters and a grid of
  years are common game ideas, but the screens, colors and style must be our own. Credit it as
  inspiration in the pitch.
- Data stays in the user's browser, is sent to the AI only to generate the lives, and is never
  saved. That is one honest sentence on the consent screen.

### Claude's calls, not confirmed (easy to flip)
- **Track: Social Impact & Education** (see "Track" below).
- **First users: students deciding what to do after graduation.**
- **AI: Gemini on the $100 Google Cloud credit.** The $120 Thinking Machines credit is mainly for
  fine-tuning (training your own version of a model). Keep it as a bonus, for example tuning the
  futures to be more realistic.
- **For the expo floor:** all four lives run at once in about a minute, a fast path of about five
  questions (about 90 seconds) for judges, and a fully worked demo built on the owner's own life.
- Build order if time is short: questions → four lives → animated story view → tap a year to chat.
  Extras: uploads, changing a decision mid-life, grounding in real statistics.

---

## Track

**Social Impact & Education** (Claude's recommendation). The first users are students choosing a
path, which is career and life guidance. **Health & Wellness** also fits (mental wellbeing, the
future-self research), but it invites questions about medical claims and safety that are hard to
answer in a weekend. You can enter only one track.

---

## Hackathon facts

- **Triangle AI Hackathon, Duke University, Wilkinson building.** Kickoff Friday Nov 6 (arrive by
  5:15pm, seated by 5:30pm in Wilkinson 021). **Submit on DevPost by 9:30am Sunday.** Judging runs
  10am–12:15pm, and you must be there in person.
- **Rules:** the project must use AI/ML and fit one of the six tracks.
- **Judged on:** technical accomplishment, novelty, commercial viability, and the quality of the
  pitch and demo.
- **Judging format:** expo-style. Each team gives an elevator pitch to at least two judges. Track
  winners then give a 5-minute pitch on stage for the grand prize. **Design the demo so the judge is
  in it**: they type about themselves and see their own futures in about a minute.
- **Credits:** $100 Google Cloud and $120 Thinking Machines per team. Collect both codes at the
  check-in table before 10pm on Friday.
- From Friday, all communication is on Discord (#questions, #announcements).
- **Organizer's answer (Jon Reifschneider, Nov 5):** hacks are expected to be built during the
  weekend only. Building on an existing site is "a gray area", and if you do, make it very clear
  what was built during the event. → **That is why this is a new project, started from scratch at
  kickoff.**

---

## References

- **Future You, MIT Media Lab:** https://futureyou.media.mit.edu. You chat with an AI version of
  yourself at 60, built from a survey (it also shows an aged photo of your face, which we are
  skipping). Their study reports less anxiety and a stronger connection to the future self. Check
  the paper before quoting numbers on stage.
- **1 in 8 Billion:** https://1in8b.life/en/. You are born as a random person somewhere in the
  world (drawn from UN, World Bank and WHO data for 172 countries) and live that life year by year:
  - four meters (health, happiness, knowledge, relationships)
  - a life map where each square is one year
  - pauses with reflective questions at ages 5, 15, 30, 50 and 70
  - four other people born in the same second shown next to you
  - shareable birth and death cards

  **Our twist on it:** instead of four strangers born in the same second, it shows **four of you,
  starting from the same moment: today.**
- **Future self-continuity:** the research behind "feel close to your future self and you choose
  better today", mainly the work of Hal Hershfield (UCLA).

---

## Last year's hackathon (Duke AI Hackathon 2025): what it tells us

Gallery: https://duke-ai-hackathon-2025.devpost.com/project-gallery (64 projects).

**The six winners:**
- **Gesturify (grand prize):** a webcam scores your sign language and gives tips.
- **The Fitting Room (2nd):** "describe your vibe", and the AI picks clothes for you.
- **ClimaCrete:** machine learning designs low-carbon concrete.
- **Case Closed:** legal research and memo writing.
- **NeuroGaze:** eye-tracking autism screening.
- **Nomad:** a voice and camera assistant for the car.

**What the winners have in common:** a concrete user, a clear before-and-after, and a result you
can see or measure within seconds (a score, a pick, a screening). Most of them do more than chat.

**What did not win:** a crowd of AI companions, journaling apps, wellness apps and reflection apps
(MoodMate, Reflectra, Thankfully, BlueWell, BanterBox, Neural Adapt and others).

**The closest one to ours, and it did not win: *PersonaReflect*.** You write down a dilemma, and
four AI personas (a CBT coach, an empathetic friend, a rational analyst, a mindfulness mentor) each
answer it, followed by an action plan. It was built with Gemini and Google's agent kit, and it
looked like a plain chat UI. **Lesson: "four AI voices about your life" is not enough on its own.**
What must set us apart:
- the futures are **yours** (built from your data and your own words)
- they **play out visually** as lives, not as chat replies
- each one is **grounded and traced**, not generic advice

## How we win (Claude's read, before the event)

**Honest odds:** as a "chat with your future self" app, it would be one of the crowd. As a
**personal, honest, beautifully animated life simulation that the judge is in**, it has a real
shot at the track, and an outside shot at the grand prize if it comes with a number.

The five hooks:
1. **The judge is the demo.** Open with *"Give me 90 seconds and I'll show you four of the lives
   you have left."* They answer five questions and watch their own futures play out. It is the
   only booth that is about *them*, and people remember the booth where they saw themselves.
2. **"Not a horoscope."** Tap any turning point to see *why*: the sentence the judge said, plus a
   real-world number. This is the technical accomplishment, so make it visible, not hidden in the
   backend.
3. **Bring a number.** On Saturday, test it on 10 or more other hackers using a standard
   before-and-after question from the research ("how connected do you feel to yourself at 70?",
   on a 1–7 scale). Walking in with *"connection went up from X to Y"* is what last year's winners
   had and the chatbots did not.
4. **The science, and a precedent for the business.** Hal Hershfield's future-self research. The
   MIT Future You study. Banks have built "see your older self" tools to get people to save for
   retirement. (Merrill Edge's "Face Retirement", around 2012. Check this before saying it on
   stage.) Who pays: university career centers, financial planners and coaching apps. The free
   version spreads through share cards, the way *1 in 8 Billion* did.
5. **The look.** Most hackathon apps look like default templates. Motion and a story that unfolds
   year by year are the owner's strength. Polish wins expo floors.

**Risks:**
- solo against teams of four, so cut scope hard
- looking like PersonaReflect (a plain chat UI)
- AI that flatters instead of being honest
- heavy topics: keep it about choices, and show help resources if someone writes something
  worrying

## What makes it new (for the pitch)

- *Future You* gives you **one** future in a chat. This gives you **four** futures, played out like
  a game, and you steer your own.
- **It's personal and honest.** Every turning point is traced to something you said, and the
  futures are based on how life really tends to go, not on flattery.
- **It learns who you are in minutes** from things you already have: your CV, LinkedIn, and what
  your own AI already knows about you.
- **Open-ended answers, typed or spoken**, instead of multiple-choice buttons.
