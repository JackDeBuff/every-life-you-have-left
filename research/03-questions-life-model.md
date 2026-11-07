# 03: Questions and the life-simulation model

Research for *Every Life You Have Left*. Written Fri Nov 6 2026 (night), for a Sunday 9:30am submit.
Scope: the adaptive questions, the profile schema, the model that generates four lives to 70, and
safety. Numbers are US unless noted. Every stat has a source link. Where I only found a secondary
source, it says **(verify)**.

---

## 0. TL;DR

- **Fast path = 5 open questions.** Each one feeds a specific part of the output: (1) who you are
  now, (2) the crossroads, which drives *The Leap*, (3) who has a say, which supplies the people and
  pressures, (4) the fear, which drives *The Careful Life*, (5) the unjudged want, which drives
  *The Unjudged Life*. Your own life is the momentum of all five.
- **Four lives on a 2×2.** The axes are *bold vs. safe* and *for others vs. for yourself*. The
  lives are **Your Path** (momentum, steered by your pause answers), **The Leap**, **The Careful
  Life** (fear wins, but not as a punishment), and **The Unjudged Life** (the one you secretly
  want).
- **Hybrid engine.** Code owns the probabilities and budgets: a base-rate table, per-category event
  budgets, cooldowns, and a shared world timeline with at most 3 items. The LLM owns the story and
  the "why", and it must cite a `quoteId` for every turning point. A code validator rejects outputs
  that break the rules, and the LLM gets one repair pass.
- **Worry changes attention, not odds.** The domains a user worries about get more events, more
  words and more pauses. The *probability* of good or bad outcomes comes only from base rates and
  choices. This rule keeps it honest.
- **The measure.** One 1–7 item, adapted from Hershfield's overlapping-circles future
  self-continuity measure, asked before and after.

---

## 1. Question design

### 1.1 Principles

1. **One question per screen, open-ended, typed or spoken.** The model extracts several facts from
   each answer. No forms. The single exception is the 1–7 measurement item (§1.6), which is a
   measurement, not an input.
2. **Concrete beats abstract.** Ask "who would be most disappointed" rather than "what are your
   values". Concrete answers produce quotable sentences, and quotable sentences produce the "this is
   me" moment when the user taps "why".
3. **Every answer is stored as a quote with an id** (`q1`, `q2` …). The lives cite these ids.
4. **Never ask** for race, ethnicity, religion, sexual orientation, health diagnoses or immigration
   status. Use country, family background, education and money. Marital status is optional. If
   the user volunteers any of these, they can shape the story only in the way the user framed them,
   never as a demographic multiplier.
5. **Uploads turn questions into corrections.** If a CV or AI export already answers something,
   don't re-ask it. Confirm it or challenge it: *"Your AI thinks you love your job. Is that the
   whole story?"* These contradiction probes are likely to be the strongest "it knows me"
   moments (an untested hunch: check it in Saturday's tests), so prioritize them.
6. **At most one follow-up probe**, and only when an answer is under ~8 words or vague ("idk",
   "fine"). Example: *"Say a bit more: what would it look like?"* Never probe a sensitive answer.

### 1.2 The 5-question fast path (90 seconds, the expo booth)

Ask them in this order. Each question can be answered in a sentence. Spoken answers should take
about 15 seconds each.

| # | Exact wording | What it fills | Feeds |
|---|---|---|---|
| **Q1** | **"Tell me who you are right now: how old you are, where you live, what fills most of your week, and how money feels — tight, okay, or comfortable."** | age, country/city, occupation or study, living situation, money feel | the starting state for every life and the "you are here" marker |
| **Q2** | **"What's the decision or worry that keeps coming back to you lately — the one you'd most want to see play out?"** | crossroads, top worry domain, worry intensity | **The Leap** (says yes to it), plus worry weighting |
| **Q3** | **"Who has a say in what you do next — and what do they expect from you?"** | people[], expectations, obligations, partner (optional, self-disclosed) | the cast of every life, and the pressure in **Your Path** and **The Careful Life** |
| **Q4** | **"What are you most afraid will be true about your life ten years from now?"** | core fear, foundation vs. connection anxiety | **The Careful Life** (built to avoid this fear, and how that costs) |
| **Q5** | **"If nobody would judge you — not your family, not your friends, not anyone online — what would you do with the next five years?"** | secret want, intrinsic values | **The Unjudged Life** |

Why these five:
- Q2, Q4 and Q5 are the **three branch seeds**. Without them the three contrast lives are generic.
- Q3 supplies **names and pressures**, which is what makes a turning point feel personal (*"…because
  you told me you can't say no to your mom"*).
- Q1 packs four facts into one question to buy room for the emotional ones. If it comes back
  missing money, mark `money.feel` as an **assumption** shown on the results screen ("We guessed
  money is *okay*. Tap to fix."). Don't spend a sixth question on it.
- Q4 asks about ten years, not age 70, because people can picture ten years. That is the horizon
  Hershfield's original measure uses.

**When an upload exists, Q1 changes** to a confirm-and-correct question, which saves about 20
seconds and shows off the upload:
> *"From your CV: 25, analyst in Charlotte, economics at UNC. What does that picture get wrong — and how does money feel right now?"*

**Optional Q6** (standard mode, or if a judge is enjoying it): *"What's something you've never told
your AI — or anyone — about what you want?"*

### 1.3 Deep bank (~33 questions by domain)

Tags: **slots** = the profile fields filled. **Src** = the instrument it borrows from (FSC =
future self-continuity; WoL = Wheel of Life; SVS = Schwartz values; B5 = Big Five, inferred from
text and never asked as items; LSI = McAdams Life Story Interview; PINK = Pink's regret types).
**Sens** = sensitivity: 0 ok any time, 1 after rapport, 2 only in deep mode and after at least 4
answers. ★ = a "never told my AI" question.

| id | Domain | Question | Slots | Src | Sens |
|---|---|---|---|---|---|
| D1 | now | "Walk me through an ordinary Tuesday, from waking up to falling asleep." | routine, energy, work hours, living | WoL | 0 |
| D2 | now | "If this part of your life were a chapter in a book, what would the chapter be called?" | life-chapter framing, mood | LSI | 0 |
| D3 | now | "What are you proud of that would never show up on your CV?" | values, achievement (non-career) | SVS | 0 |
| D4 | career | "If your job disappeared tomorrow, what would you miss — and what would you be relieved to lose?" | job attachment, burnout signals | WoL | 0 |
| D5 | career | "Whose career do you quietly envy? What exactly about it?" | ambition target, status vs. craft | SVS | 1 |
| D6 | career | "If you keep going exactly like this, where do you think you'll feel stuck in five years?" | momentum projection | FSC | 0 |
| D7 | career | "What would have to be true before you'd actually quit?" | risk threshold, Leap trigger | — | 0 |
| D8 | money | "What's the money thought that shows up at 2am?" | money worry, debt | — | 1 |
| D9 | money | "Does anyone depend on your money — or do you depend on anyone's?" | family support, remittances, obligations | — | 1 |
| D10 | risk | "What's the biggest risk you've taken so far, and how did it turn out?" | risk tolerance (revealed), past turning point | LSI | 0 |
| D11 | money | "Someone hands you a year's salary tomorrow, no strings. What do you actually do with it?" | revealed preferences, secret want | — | 0 |
| D12 | family ★ | "What did your family assume you'd become? How close are you to that?" | expectations, gap | — | 1 |
| D13 | family ★ | "What did your parents give up that you feel you owe them for?" | obligation, first-gen/immigrant story | — | 1 |
| D14 | family ★ | "Who would be most disappointed if you changed course — and would they say it out loud?" | gatekeeper person, conflict style | — | 1 |
| D15 | family | "When your parents get older, what part do you expect to play?" | caregiving expectation, location constraint | — | 1 |
| D16 | love | "Is there someone in your life right now, or someone you're hoping for? Share as much or as little as you like." | relationship status (optional), partner person | — | 1 |
| D17 | love | "What have you seen in other couples that you never want to repeat?" | relationship values, divorce fears | LSI | 1 |
| D18 | love ★ | "What's the conversation with your partner — or a future one — that you keep putting off?" | latent conflict (kids, moving, money) | — | 2 |
| D19 | children | "Do kids feature in the life you picture? 'Yes', 'no' and 'honestly, I don't know' are all real answers." | fertility intent, uncertainty | — | 1 |
| D20 | children | "What would you do differently from how you were raised?" | parenting values, family-of-origin | LSI | 1 |
| D21 | friends | "Who would you call at 2am? When did you last actually see them?" | closest tie, loneliness risk | WoL | 0 |
| D22 | friends | "Which friendship do you think is quietly fading?" | connection-regret seed | PINK | 1 |
| D23 | health | "How does your body feel at the end of a normal week?" | energy, sleep, stress (no diagnoses) | WoL | 0 |
| D24 | health | "What's the habit you keep promising to start or stop?" | health-habit arc | — | 0 |
| D25 | happiness | "When were you last truly happy — not fine, happy? What were you doing?" | happiness source, peak experience | LSI | 0 |
| D26 | mental ★ | "What's draining you that you've stopped noticing?" | burnout, chronic stress | — | 1 |
| D27 | mental ★ | "When things go badly, who gets to see that version of you?" | support network, coping | — | 2 |
| D28 | values | "Freedom, security, being admired, helping people, adventure, keeping tradition — which pulls hardest on you right now, and why? (Or name your own.)" | Schwartz top values | SVS | 0 |
| D29 | goals | "At 70, what would make you say 'that was a good life'?" | definition of success, ending target | FSC | 0 |
| D30 | regret | "Which decision from your past do you still replay?" | regret type (foundation/boldness/moral/connection) | PINK | 1 |
| D31 | regret ★ | "What do you pretend not to care about?" | hidden desire / insecurity | — | 2 |
| D32 | regret ★ | "What are you waiting for permission to do?" | Leap/Unjudged seed, gatekeeper | — | 1 |
| D33 | never-told ★ | "What's something you've never told your AI — or anyone — about what you want?" | secret want, sensitive context | — | 2 |

Notes on the instruments:
- **Big Five:** don't ask the TIPI or BFI-10 items, because they break the open-ended rule and cost
  time. Have the extraction model infer the five traits from all the text with a `confidence`
  field. Use them only for **narrative voice and the chat persona**, never to move outcome odds.
- **Schwartz:** D28 is a compressed, open-ended version of the 10-value circle. The model then
  scores all 10 values from every quote.
- **Wheel of Life:** our 10 domains (§1.4) are the wheel. Optional for deep mode: a quick 0–10 dial
  per domain to set the year-0 meters. That is not open-ended, so it needs the **owner's call**.
- **McAdams LSI:** borrow its "chapters", "high point" and "turning point" prompts (D2, D25, D10).
  It is also the right frame for the ending at 70: the life told back as a story with chapters.
- **Pink:** his ~26k-response World Regret Survey found four core regrets: **foundation** (not
  building stability), **boldness** (chances not taken), **moral** and **connection**. Connection
  regrets were the most common. Use the four types to classify D30 and to write each life's ending
  regrets ([Behavioral Scientist interview](https://behavioralscientist.org/what-is-the-power-of-regret-a-conversation-with-daniel-pink/),
  [Psychology Today summary](https://www.psychologytoday.com/us/blog/pressure-proof/202202/the-4-major-kinds-of-regret)).

### 1.4 Gap detection: choosing the next question

**The 10 domains** (the brief's list, merged): `career`, `achievement`, `wealth` (money + risk),
`family` (origin + expectations + caregiving), `love` (partnership), `children`, `friends`
(belonging), `health` (habits/energy only), `mental` (happiness + mental health), `meaning` (values
+ life goals).

**Slots.** Each domain has 2–4 slots, and each slot has a `weight` (its importance to the
simulation) and a `leverage` (how much the answer changes how the four lives differ). These slots
have the highest leverage: `crossroads`, `coreFear`, `secretWant`, `gatekeeperPerson`,
`moneyFeel`, `obligations`, `relationshipStatus`, `kidsIntent`, `locationTies`.

Each profile field carries `{value, source, confidence}`. Extraction sets confidence by source:
an answer is 0.9, a CV or LinkedIn is 0.8 for facts and 0.2 for feelings, an AI export is 0.6
(it may be stale or flattering), and an inference is 0.3.

**Scoring a candidate question q:**

```
coverageGain(q) = Σ_{slot s ∈ q.slots} s.weight × (1 − s.confidence) × q.expectedFill[s]
worryBoost(q)   = 1 + 1.5 × worry[q.domain]          // worry[d] ∈ [0,1], from Q2 + later answers
leverage(q)     = Σ_{s ∈ q.slots} s.leverage × (1 − s.confidence)
contradiction(q)= 0.8 if q confirms/challenges an upload claim with conf 0.4–0.8 that touches a worry domain, else 0
cost(q)         = 0.5 × q.sens × max(0, 4 − answersSoFar)    // don't open with heavy questions
                + 0.3 if q.domain == lastQuestion.domain     // keep it moving
                + 0.2 × q.expectedSeconds/30

score(q) = coverageGain(q) × worryBoost(q) + 0.7 × leverage(q) + contradiction(q) − cost(q)
```

**Hard rules, applied before scoring:**
1. Seeds come first. Q2/Q4/Q5 equivalents (`crossroads`, `coreFear`, `secretWant`) and
   `gatekeeperPerson` must be filled before any non-seed question.
2. Never ask about a slot with confidence ≥ 0.8. Confirm it in the summary instead.
3. **Coverage floor:** before the deep path stops, every domain needs coverage ≥ 0.4, and the
   user's top-2 worry domains need ≥ 0.8.
4. Sensitive (`sens: 2`) questions only in deep mode.
5. A user can always say "skip" (no penalty) or "show me my lives now".

**Stopping rule by mode:**

| Mode | Questions | Stop when |
|---|---|---|
| Fast (booth) | 5 fixed (Q1–Q5) | always 5 |
| Standard | 5 fixed + up to 7 adaptive | 12 asked, ~6 min, or max score < 0.25 |
| Deep | 5 fixed + adaptive | coverage floor met **and** max score < 0.15, or the user stops |

**Implementation for the weekend.** The scoring runs in code (simple, debuggable). The LLM does two
cheap things on each turn:
1. **Extraction:** answer → profile delta + quote + safety flags (one call, JSON mode).
2. **Personalizing the top question:** rewrite it to reference what is known, e.g. D14 becomes
   *"Would your mom be the most disappointed if you left consulting — and would she say it?"*
   Keep the meaning, under 30 words, with no options listed.

**A better "paste this into your AI" prompt** for the export upload (it gets more useful structure
than "describe everything you know about me"):
> *"Describe everything you know about me from our conversations and your memory: age, where I live, work and studies, family, relationships, money, health habits, goals, worries, and big decisions I've mentioned. Then list (a) things I've said I want, (b) things I've said I'm worried about, and (c) what you'd guess I've never told you. Plain bullets. Don't invent anything; mark guesses as guesses."*

Section (c) creates natural material for the contradiction probes.

### 1.5 The in-story pauses (4–5)

**Timing.** The pauses are tied to moments in **Your Path**, not fixed ages. With current age `A`
and remaining span `S = 70 − A`:

| Pause | Target | Domain rule |
|---|---|---|
| P1 | A+1 … A+3 (the named crossroads comes due) | top worry domain (usually the Q2 decision) |
| P2 | ≈ A + 0.25·S | love / family / children (whichever is least covered) |
| P3 | ≈ A + 0.5·S (aim for the mid-40s, where the happiness dip, sandwich years and caregiving cluster) | family (caregiving) or mental (burnout) |
| P4 | ≈ A + 0.75·S | wealth / meaning (plateau, the empty nest, "is this it") |
| P5 | 69–70 | reflection. **Does not re-tune.** It writes the ending in the user's own words |

Snap each pause to the nearest **turning-point year** in Your Path within ±3 years. Across P1–P4:
at least 2 of the 4 pauses come from the user's worry domains, and at least 2 come from other
domains, so the story covers more than the worry.

**The 90-second judge path:** only **P1 and P5** (or P1 alone), each answered in one spoken line.
**(Owner's call.)**

**Wording rules:**
- Open with **"It's {year}. You're {age}."** Then 1–2 sentences of a concrete situation that names a
  person or echoes a quote. Then **one direct question**. 45 words max.
- Present tense, second person. Never list options; the tension is in the scene.
- The life is asking. No therapist voice ("How does that make you feel?").

**Examples** (for a 25-year-old in 2026):
- **P1:** *"It's 2028. You're 27. Your manager offers you Singapore — two years, 30% more money,
  fifteen hours from your mom. She's on the phone right now. What do you tell her?"*
- **P2:** *"It's 2037. You're 36. Maya brings up kids again, 'for real this time.' You've said
  'after the promotion' twice. What do you say tonight?"*
- **P2 (single):** *"It's 2036. You're 35. Your friends' weekends are all birthday parties and
  weddings now. Yours are quiet. What do you want next year to look like?"*
- **P3:** *"It's 2044. You're 43. Your dad can't live alone anymore. Your sister has two kids; you
  have the spare room and the flexible job. What do you offer?"*
- **P3 (burnout):** *"It's 2045. You're 44. You've been tired in a way sleep doesn't fix since
  spring. Something has to go. What do you stop doing?"*
- **P4:** *"It's 2054. You're 53. Jun texts: 'remember the café we swore we'd open?' You finally
  have savings. What do you text back?"*
- **P4 (meaning):** *"It's 2055. You're 54. Nobody needs you at 8am on Monday anymore. What do you
  do with it?"*
- **P5:** *"It's 2071. You're 70. Someone asks which year was the best one. Which do you pick — and
  what would you tell the 25-year-old who started all this?"*

### 1.6 The measurement (the number for the judges)

Adapt the **Future Self-Continuity** overlapping-circles item ([Ersner-Hershfield et al. 2009,
*Judgment and Decision Making* 4(4)](https://dlab.sauder.ubc.ca/sjdm/journal/9310/jdm9310.html)).
The original shows 7 pairs of circles, from no overlap to almost complete overlap, and asks how
similar and connected you feel to yourself in 10 years. It is adapted from Aron's
Inclusion-of-Other-in-Self scale.

**Pre (right after consent, before Q1) and post (after the results, or after chat if they used
it). The wording must be identical both times:**
> **"Picture yourself at 70. Which pair of circles shows how connected you feel to that person?"**
> 1 (circles apart) … 7 (almost fully overlapping). Tap one.

Optional second item, if time allows. It matters because the MIT study saw its effect mostly on
similarity and vividness:
> **"How clearly can you picture your life at 70?"** 1 (not at all) … 7 (like a memory).

Optional post-only behavior-intent item (good for the pitch, open-ended):
> *"Is there one thing you'll do differently this week?"*

**Reporting:** n, the pre and post means, the share of people whose score went up, and a paired
Wilcoxon signed-rank p-value with n ≥ 10. Be honest on stage: it is a one-session self-report, and
there is a demand effect (they know what you hope for).

**Precedent to cite:** MIT Media Lab's *Future You* study (Pataranutaporn et al., 2024; preregistered,
**n = 344, ages 18–30**, four conditions) reported significantly lower anxiety and higher future
self-continuity than the controls after one 10–30-minute session ([arXiv
2405.12514](https://arxiv.org/abs/2405.12514), [MIT
News](https://news.mit.edu/2024/ai-simulation-gives-people-glimpse-potential-future-self-1001)). A
conference poster gives ~18% less anxiety and ~15% more connection, but those are **poster figures;
verify them before quoting**. The poster also says the agency and optimism measures did *not*
change significantly. Don't claim behavior change.

---

## 2. Profile schema

Rules: every field carries provenance. Quotes are first-class objects with stable ids. Anything
guessed goes in `assumptions[]` so the UI can show it and the user can fix it.

```jsonc
{
  "schemaVersion": "1.0",
  "sessionId": "s_8f2c",
  "mode": "fast",                          // fast | standard | deep
  "profileVersion": 3,                     // bump on every answer/pause; lives record which version they used
  "consent": { "explainerSeen": true, "agreedAt": "2026-11-07T14:02:11Z", "uploads": ["cv"] },

  "basics": {
    "age":        { "value": 25, "source": "answer", "quoteIds": ["q1"], "confidence": 0.95 },
    "country":    { "value": "US", "region": "NC", "city": "Charlotte", "source": "cv", "confidence": 0.8 },
    "living":     { "value": "rents with roommate", "source": "answer", "quoteIds": ["q1"], "confidence": 0.9 },
    "education":  { "level": "bachelor", "field": "economics", "inProgress": false, "source": "cv", "confidence": 0.9 },
    "occupation": { "title": "analyst", "field": "consulting", "employerType": "large_firm",
                    "yearsInRole": 2, "source": "linkedin", "confidence": 0.8 },
    "relationship": { "value": "partnered", "disclosed": true, "partnerPersonId": "p2", "source": "answer", "confidence": 0.9 },
    "children":   { "count": 0, "intent": "unsure", "source": "inferred", "confidence": 0.3 },
    "familyBackground": { "firstGenCollege": true, "parentsCountry": "TH", "siblings": 1,
                          "class": "working_to_middle", "source": "answer", "confidence": 0.7 },
    "money":      { "feel": "tight", "debt": "student_loans", "supportsFamily": true,
                    "incomeBand": "50-75k", "source": "answer", "confidence": 0.8 }
  },

  "people": [
    { "id": "p1", "label": "Mom", "relation": "mother", "influence": 0.9, "closeness": 0.8,
      "expectation": "stay close to home, stable job", "livesIn": "Charlotte",
      "quoteIds": ["q3"], "sensitive": false },
    { "id": "p2", "label": "Maya", "relation": "partner", "influence": 0.7, "closeness": 0.9,
      "expectation": null, "quoteIds": ["q3"], "sensitive": false }
  ],

  "seeds": {                                   // the 4 archetype seeds (see §3.1)
    "crossroads": { "text": "whether to take the Singapore transfer", "domain": "career",
                    "options": ["go", "stay"], "dueBy": 2028, "quoteIds": ["q2"] },
    "coreFear":   { "text": "ending up with a safe job I resent, like my dad", "type": "boldness",
                    "quoteIds": ["q4"] },
    "secretWant": { "text": "teach design and live somewhere slower", "quoteIds": ["q5"] },
    "momentum":   { "text": "stays at firm, promoted slowly, near mom", "source": "inferred" }
  },

  "worries": [  { "id": "w1", "domain": "career", "intensity": 0.85, "quoteIds": ["q2"] },
                { "id": "w2", "domain": "wealth", "intensity": 0.6,  "quoteIds": ["q1"] } ],
  "constraints": [ { "id": "k1", "kind": "family_obligation", "text": "sends money home monthly",
                     "personId": "p1", "quoteIds": ["q3"] } ],
  "values":  { "schwartz": { "security": 0.7, "achievement": 0.6, "selfDirection": 0.8,
                             "benevolence": 0.7, "tradition": 0.4, "stimulation": 0.5,
                             "hedonism": 0.3, "power": 0.2, "conformity": 0.5, "universalism": 0.5 },
               "top": ["selfDirection", "security", "benevolence"], "source": "inferred", "confidence": 0.5 },
  "traits":  { "bigFive": { "O": 0.7, "C": 0.6, "E": 0.4, "A": 0.7, "N": 0.6 },
               "source": "inferred", "confidence": 0.3, "useFor": "voice_only" },
  "pastTurningPoints": [ { "age": 18, "title": "first in family to go to college", "source": "answer", "quoteIds": ["q1"] } ],

  "domainCoverage": { "career": 0.9, "achievement": 0.4, "wealth": 0.6, "family": 0.8, "love": 0.5,
                      "children": 0.1, "friends": 0.0, "health": 0.0, "mental": 0.3, "meaning": 0.5 },

  "quotes": [
    { "id": "q3", "text": "My mom. She'd never say it, but she expects me to stay close and not do anything risky. I can't say no to her.",
      "questionId": "fast.q3", "channel": "voice",          // typed | voice | upload
      "sourceDoc": null,                                    // e.g. "cv.pdf#p1" for upload-derived quotes
      "at": "2026-11-07T14:04:40Z",
      "sensitivity": "normal",                              // normal | private | crisis
      "citable": true,                                      // false → never shown verbatim in why-traces or share cards
      "shortForm": "I can't say no to her." }               // ≤12 words, the version shown in the why-trace
  ],

  "assumptions": [ { "field": "children.intent", "value": "unsure", "reason": "not asked in fast path", "userCanEdit": true } ],
  "safety": { "flags": [], "resourcesShown": false, "maxSeverity": "none" },
  "measurement": { "fscPre": 3, "vividPre": 2, "fscPost": null, "vividPost": null, "intent": null }
}
```

---

## 3. The life-simulation model

### 3.1 The four archetypes (reviewing the early idea)

The early four were *if nothing changes / you take the leap / fear wins / the one you secretly
want*. They have two problems:
1. **"Leap" and "secretly want" collapse** whenever the leap *is* the secret want, which is common.
2. **"Nothing changes" and "fear wins" collapse**, because doing nothing is often fear winning.

**The fix: define them on two axes and give each one its own seed:**

| | **For others / outside approval** | **For yourself / inner want** |
|---|---|---|
| **Bold** | **The Leap**: says yes to the big opportunity you named (Q2): the transfer, the startup, the move, the grad school. Ambition, status, speed. | **The Unjudged Life**: does what you'd do if nobody judged (Q5). Often smaller and more intimate than the Leap: a different city, a craft, a slower pace. |
| **Safe** | **The Careful Life** (fear wins): every fork goes toward security and other people's expectations (Q3), avoiding the fear in Q4. | **Your Path**: your momentum. It starts as "if nothing changes", and your pause answers bend it. |

- **Your Path** is the life you steer. It keeps the hard-hitting "if nothing changes" opening,
  because until the first pause it *is* the momentum projection. The pauses then make it yours, and
  at the end it gets a name from what you chose, e.g. *"The life where you said no to Singapore,
  then yes to Lisbon."*
- **The Careful Life is not a punishment.** By base rates it often has the best **foundation**
  (wealth, home, stability), and its cost is **boldness and connection** regrets. **The Leap is not
  a fantasy.** It carries the real failure base rates (§3.3) and its cost is often in the family
  and love domains. The trade-offs are the product.
- **Names on screen:** "Your Path", "The Leap", "The Careful Life", "The Unjudged Life". Use the
  brief's "Fear Wins" if the owner wants an edgier label. **(Owner's call.)**

**Divergence guarantee (checked in code).** At the midpoint age (≈ A + S/2), every pair of lives
must differ on **at least 3 of these 7 life facts**: city/country, occupation family, partner
status, number of children, homeowner yes/no, wealth band, and the closest person. Shared world
events and the parents' aging are allowed to coincide. Personal turning points in the same year
are not.

### 3.2 Architecture: code owns the odds, the LLM owns the story

LLMs left alone write melodrama: a catastrophe every few years, everything either soaring or
collapsing, the same hurricane twice. So split the work:

```
profile ──► seed extraction ──► (code) event planner ──► (LLM) life writer ──► (code) validator ──► UI
                                 │  base-rate table           │ JSON schema §3.6        │ fails? 1 repair call
                                 │  budgets + cooldowns       │ must cite quoteIds      │ with the error list
                                 │  shared world timeline     │ narrates, picks among   │
                                 │  worry weights             │ candidate events        │
```

1. **Event planner (code, ~150 lines).** For each life and each year, compute hazards for each
   event category from the base-rate table × modifiers (education, field, archetype, worry
   attention). Sample a **candidate list** (more candidates than needed). Apply budgets and
   cooldowns. Output roughly 10–14 candidate turning points plus "texture" slots.
2. **Life writer (LLM, one call per life, 4 in parallel).** Input: the profile summary, quotes,
   archetype rules, candidate events, budgets, the world timeline and the banned list. Output: the
   full `years[]` JSON. It may swap at most ~30% of the candidates for its own events, and it must
   tag swaps `"source":"model"` with a base-rate justification or null.
3. **Validator (code).** Check the schema; that every `cause.quoteId` exists in the profile; budget
   counts; banned terms (§4.4); state deltas within ±15 per year except turning points (±30);
   divergence; at least one positive and one negative turning point per decade. On failure, send
   **one repair call** with the error list, then fall back to dropping the offending events.
4. **Lazy narration.** The first pass writes a one-line `summary` per year and 2–3 sentences per
   turning point. The **"why" expansion** and the chat are generated on tap. This keeps four lives
   to 70 inside ~1 minute.

**Simplest weekend version.** If Saturday runs short, skip the sampler in step 1. Put the base-rate
table, the budgets and the world timeline into the prompt as constraints, and keep the **validator**,
which is the part that catches catastrophe spam. Add the sampler later if there's time.

### 3.3 Base rates: the hand-curated table

Every item was checked this week. Primary = a government or official source read directly.
Secondary = a reputable outlet quoting the primary **(verify)**. `howToUse` says how the planner
turns it into a hazard.

#### Career and work
| id | Stat | Source |
|---|---|---|
| `jobs_by_age` | Boomers held **12.7 jobs from 18–56**: **5.6** at 18–24, **4.5** at 25–34, **2.9** at 35–44, **2.3** at 45–56 (a job = one uninterrupted spell with one employer). → One employer change every ~2.2 yrs at 25–34, ~3.4 yrs at 35–44, ~5 yrs at 45–56. | [BLS NLSY79, Aug 2023](https://www.bls.gov/news.release/archives/nlsoy_08222023.htm) |
| `tenure` | Median tenure with the current employer was **3.9 yrs** (Jan 2024): **2.7** for ages 25–34, **9.6** for 55–64; 6.2 public sector vs 3.5 private. | [BLS TED](https://www.bls.gov/opub/ted/2024/median-tenure-with-current-employer-was-3-9-years-in-january-2024.htm) |
| `occ_switch` | **~6.4% of workers switch occupations each year** (BLS projection method, 2016–26). → A real *career change* every ~15 yrs, so ~2–3 in a remaining career. | [BLS separations method](https://www.bls.gov/emp/documentation/separations-methods.htm), [MLR 2018](https://www.bls.gov/opub/mlr/2018/article/occupational-separations-a-new-method-for-projecting-workforce-needs.htm) |
| `layoffs_jolts` | Layoffs and discharges averaged **1.1% of employment per month in 2025** (21.2M for the year). This counts layoff *events*, many in high-churn jobs, so don't use it directly as a personal annual risk. | [BLS JOLTS, Mar 2026 release](https://www.bls.gov/news.release/archives/jolts_03132026.htm) |
| `displacement` | **6.3M workers displaced 2021–23** (2.6M long-tenured, i.e. 3+ yrs with the employer); 8.6M in 2019–21. **65.7%** of long-tenured displaced workers were re-employed by Jan 2024. → *Our derived estimate:* **~1.3%/yr** personal displacement risk in a good economy, **~2%/yr** in a weak one; ×2 in world-timeline downturn years. Over 40 yrs ≈ 40–55% chance of at least one. | [BLS TED](https://www.bls.gov/opub/ted/2024/65-7-percent-of-long-tenured-displaced-workers-were-reemployed-in-january-2024.htm) |
| `stress_work` | **50%** of US employees felt a lot of stress "yesterday" (2025 data); engagement 32%. | [Gallup SOGW, US page](https://www.gallup.com/workplace/704063/state-global-workplace-united-states-country-level-data.aspx) |
| `job_insecurity` | **54%** of US workers say job insecurity significantly affects their stress (APA 2025). | [Newswise / APA Work in America 2025](https://www.newswise.com/articles/more-than-half-of-u-s-workers-say-job-insecurity-causing-stress) (verify on apa.org) |
| `biz_survival` | Only **34.7%** of private establishments born in 2013 were still operating in 2023. The steepest drop is in year 1 (~80% survive year 1; 1994 cohort). | [BLS TED 2024](https://www.bls.gov/opub/ted/2024/34-7-percent-of-business-establishments-born-in-2013-were-still-operating-in-2023.htm), [BLS TED 2018](https://www.bls.gov/opub/ted/2018/18-percent-of-businesses-opening-in-march-1994-remained-open-as-of-march-2017.htm) |
| `retire_age` | Retirees actually retired at **~61–62** on average, vs. **~66** expected by non-retirees. Retirement comes years earlier than planned, often not by choice. | Gallup via [AARP data stories](https://datastories.aarp.org/the-lived-experience-of-adults-50-plus/factors/retirement/index.html) (verify); EBRI RCS 2025: expected 65, actual 62 |

#### Money
| id | Stat | Source |
|---|---|---|
| `earnings_growth` | For the **median lifetime-earnings worker, earnings rise ~60% from age 25 to 55**; ×4.8 at the 95th percentile, ×27.8 for the top 1%. Most growth comes before the mid-40s, then it flattens (sample: men). | [Guvenen, Karahan, Ozkan & Song, *Econometrica* 2021](https://www.econometricsociety.org/publications/econometrica/2021/09/01/what-do-data-millions-us-workers-reveal-about-lifecycle) |
| `weekly_earnings` | Median full-time weekly earnings were **$1,204** in 2025 (≈ $62.6k/yr). | [BLS TED 2026](https://www.bls.gov/opub/ted/2026/median-weekly-earnings-were-1204-in-2025.htm) |
| `hh_income_edu` | Median household income in 2024: **$85,580** (householder 25+); **$132,700** with a bachelor's or more vs **$58,410** with high school only (2.3×). | [Census, Sep 2025](https://www.census.gov/library/stories/2025/09/education-and-income.html) |
| `net_worth_age` | Median household net worth (2022 SCF): **<35: ~$39k · 35–44: ~$135k · 45–54: ~$247k · 55–64: ~$364k · 65–74: ~$410k**. → Anchors each life's wealth band (p25–p75 around the median, shifted by education/field). | Secondary tables quoting the Fed's 2022 SCF ([Motley Fool](https://www.fool.com/investing/2024/08/16/average-income-and-net-worth-americans-by-age), [Boldin](https://www.boldin.com/average-net-worth-by-age/)) (verify against the [Fed Bulletin](https://www.federalreserve.gov/publications/files/scf23.pdf)) |
| `first_home` | Median **first-time buyer age is 40** (record, NAR 2025, up from 38); first-time buyers were only **21%** of purchases; median first-time down payment 10%. | [NAR, Nov 2025](https://www.nar.realtor/newsroom/first-time-home-buyer-share-falls-to-historic-low-of-21-median-age-rises-to-40) |
| `own_u35` | Homeownership **under 35: ~37–38%** (2025 quarters: 36.6 → 37.9%). | Census HVS via [NAHB](https://www.nahb.org/blog/2025/12/homeownership-rate-inches-up) |

#### Love, marriage, children
| id | Stat | Source |
|---|---|---|
| `marriage_age` | Median age at first marriage in 2024: **~30.2 men / 28.6 women** (CPS); **30.8 / 28.8** (ACS). | [BGSU NCFMR FP-26-01](https://www.bgsu.edu/ncfmr/resources/data/family-profiles/fp-26-01.html); Census MS-2 |
| `never_married_40` | **25% of 40-year-olds had never married** (2021; 6% in 1980). About 1 in 4 of those unmarried at 40 marry by 60. | [Pew 2023](https://www.pewresearch.org/short-reads/2023/06/28/a-record-high-share-of-40-year-olds-in-the-us-have-never-been-married/) |
| `marriage_survival` | Chance a first marriage is still intact (women, NSFG 2006–10): **5 yrs 80% · 10 yrs 68% · 15 yrs 60% · 20 yrs 52%** (men 56% at 20). **Married at 25+: 86% / 78% / 73%** at 5/10/15 yrs. **Bachelor's degree: 90% / 85% / 79% / 78%** at 5/10/15/20 yrs. Married before 20: 37% at 20 yrs. → Divorce hazard for a college-educated person married at 25+: **~2%/yr in years 0–5, ~1–1.5%/yr after**. Divorce has declined since 2010, so treat these as upper bounds. | [CDC NHSR No. 49, Table 5](https://www.cdc.gov/nchs/data/nhsr/nhsr049.pdf) |
| `marriage_age_risk` | Divorce risk is lowest for marriages at **~28–32**: before ~32, each extra year cuts the odds ~11%; after, the odds rise ~5% per year (NSFG; partly explained by demographics). | [Wolfinger, IFS](https://ifstudies.org/blog/replicating-the-goldilocks-theory-of-marriage-and-divorce/) |
| `tfr` | Total fertility rate was **1.60** in 2024 (1,599.5 per 1,000 women); birth rates rose only for women 40–44. | [NVSR 75-2, June 2026](https://www.cdc.gov/nchs/data/nvsr/nvsr75/nvsr75-02.pdf) |
| `first_birth_age` | Mean age of mother at first birth was **27.5** in 2023 (26.6 in 2016); **28.5** in large metro counties; Asian American mothers 31.5. | [NCHS blog, June 2025](https://www.cdc.gov/nchs/blog/posts/2025/06/the-rising-age-of-motherhood-in-the-united-states.html), [NCFMR FP-25-29](https://www.bgsu.edu/ncfmr/resources/data/family-profiles/FP-25-29.html) |
| `childless_intent` | **47% of childless adults under 50 say they're unlikely to ever have kids** (2023, up from 37% in 2018); 57% of them say they "just don't want to". | [Pew, July 2024](https://www.pewresearch.org/social-trends/2024/07/25/the-experiences-of-u-s-adults-who-dont-have-children/) |

#### Family, care, belonging, wellbeing
| id | Stat | Source |
|---|---|---|
| `caregiving` | **63M family caregivers, ~1 in 4 US adults** (2025, +45% in a decade); 51M care for someone aged 50+. → Near-certain for at least one period in a 45-year life; most likely between ages 40 and 65. | [AARP/NAC Caregiving in the US 2025](https://www.aarp.org/pri/topics/ltss/family-caregiving/caregiving-in-the-us-2025/) |
| `sandwich` | **54% of adults in their 40s** have a parent 65+ *and* are raising a child or supporting an adult child; 23% of all adults (2021). | [Pew via Pew Trusts](https://www.pew.org/en/trust/archive/fall-2022/more-than-half-of-americans-in-their-40s-are-sandwiched) |
| `loneliness` | **20%** of US adults felt lonely "a lot of yesterday" (2024); **29% of 18–29-year-olds**; ~21% in 2025. | [Gallup 2024](https://news.gallup.com/poll/651881/daily-loneliness-afflicts-one-five.aspx) |
| `close_friends` | **8% have no close friends**; 53% have 1–4. 5+ close friends: **32% of under-30s, 34% at 30–49, 40% at 50–64, 49% at 65+**. → Friendships *grow* with age on average. Don't write a fading-friendship arc into every life. | [Pew 2023](https://www.pewresearch.org/short-reads/2023/10/12/what-does-friendship-look-like-in-america/) |
| `happiness_u` | Wellbeing is **U-shaped with age**, lowest in the **late 40s (~47–48)**, across 145 countries (cross-sectional). It is **contested** in panel data, so apply a gentle dip (−5 to −8 on the happiness meter, mid-40s to early 50s), not a forced crisis. | [Blanchflower 2021, J. Population Economics](https://klausfzimmermann.de/happiness-is-u-shaped-in-145-countries) |
| `moving` | **~11%** of Americans moved in 2024, the lowest since 1948 (vs ~20% in the 1960s). Renters were 61% of movers; ~19% of movers crossed state lines. → Moves cluster in the 20s and early 30s. | Census via [Point2](https://www.point2homes.com/news/research/us-mobility-rates-reach-historical-low.html) (verify) |
| `adaptation` | Happiness spikes after marriage and returns near baseline in ~2 years. Unemployment leaves a *lasting* dent even after re-employment. → Event effects on `happiness` decay with a ~2-year half-life, except job loss (a partial permanent −3). | Lucas et al. 2003 (JPSP 84(3)); Lucas et al. 2004 (*Psychological Science*) (from memory; verify before citing on stage) |
| `recessions` | US recessions came roughly every 6–7 years post-war (NBER dating). → The shared world timeline gets 1–2 downturns over 45 years, not more. | [NBER business cycle dating](https://www.nber.org/research/business-cycle-dating) |

**The JSON form we ship** (`baseRates.json`, hand-curated, ~25 rows):

```jsonc
[
  { "id": "marriage_survival_ba", "domain": "love", "kind": "survival_curve",
    "points": { "5": 0.90, "10": 0.85, "15": 0.79, "20": 0.78 },
    "appliesTo": { "education": ["bachelor", "master_plus"] },
    "display": "About 8 in 10 first marriages of college grads reach 20 years.",
    "source": "CDC NCHS, NHSR No. 49 (NSFG 2006–2010), Table 5",
    "url": "https://www.cdc.gov/nchs/data/nhsr/nhsr049.pdf", "year": 2012, "quality": "primary",
    "howToUse": "annual divorce hazard = 1 − (S(t+5)/S(t))^(1/5) for marriage-duration bucket t" },

  { "id": "displacement", "domain": "career", "kind": "annual_hazard",
    "value": 0.013, "downturnMultiplier": 2.0,
    "modifiers": { "sector.public": 0.5, "field.tech": 1.4, "field.media": 1.5, "archetype.leap": 1.3 },
    "display": "6.3 million Americans lost a job to layoffs or closures in 2021–23.",
    "source": "BLS Displaced Worker Survey, Jan 2024", "quality": "derived",
    "url": "https://www.bls.gov/opub/ted/2024/65-7-percent-of-long-tenured-displaced-workers-were-reemployed-in-january-2024.htm" },

  { "id": "first_home", "domain": "wealth", "kind": "anchor_age",
    "median": 40, "spreadYears": 7,
    "modifiers": { "money.feel.tight": "+3", "education.bachelor": "-2", "archetype.careful": "-4" },
    "display": "The typical first-time US home buyer is now 40.",
    "source": "NAR 2025 Profile of Home Buyers and Sellers", "quality": "primary",
    "url": "https://www.nar.realtor/newsroom/first-time-home-buyer-share-falls-to-historic-low-of-21-median-age-rises-to-40" }
  // … one row per stat in the tables above
]
```

`display` is the human sentence shown on the "why" card next to the user's quote, e.g.
**"Because you said *'I can't say no to her.'* · About 1 in 4 US adults are family caregivers (AARP
2025)."**

**Outside the US.** For the demo, base rates are US. If the user lives elsewhere, mark each
`baseRate.region = "US (applied as approximate)"` and show it. Post-weekend sources: [OECD Family
Database](https://www.oecd.org/en/data/datasets/oecd-family-database.html) (age at first birth,
fertility, divorce), the World Bank (TFR), and the World Happiness Report (country baselines).
**(Owner's call: US-only for the demo.)**

### 3.4 Event catalog, budgets and cooldowns (avoiding catastrophe spam)

**Personal events are the story. World events are rare context.**

The budget is per life, for a span of `S` years (S = 45 for a 25-year-old). "Turning point" =
`isTurningPoint: true`; texture events are small and don't count against the budget.

| Category | Examples | Max per life | Cooldown | Hazard source |
|---|---|---|---|---|
| `career_move` | new job, promotion, transfer | ~S/3 | 1.5 yr | `jobs_by_age`, `tenure` |
| `career_change` | switch fields, grad school, start a business | 3 (Leap/Unjudged 4) | 5 yr | `occ_switch` |
| `job_loss` | layoff, company closes | 2 (Leap 3) | 5 yr | `displacement` (×2 in downturns) |
| `burnout` | an exhausting stretch, taking leave | 2 | 4 yr | `stress_work` |
| `love_start/end` | meet someone, breakup | 4 | 1 yr | judgment + `marriage_age` |
| `marriage` | wedding, commitment | 2 | — | `marriage_age`, `never_married_40` |
| `divorce` | separation | 1 | — | `marriage_survival` |
| `child` | birth, adoption | 3 | 1.5 yr | `first_birth_age`, `tfr`, intent |
| `move` | new city, abroad, back home | 4 | 2 yr | `moving` |
| `home` | buy, sell, downsize | 2 | 5 yr | `first_home`, `own_u35` |
| `money_up/down` | bonus, equity payout, side income / big expense, bad investment | 2 each | 3 yr | `earnings_growth`, `net_worth_age` |
| `caregiving` | caring for a parent | 1 long period (2–6 yrs) | — | `caregiving`, `sandwich` |
| `friendship` | a new close friend, a friendship fades, reconnecting | 1 per decade | — | `close_friends` |
| `health_habit` | start running, quit smoking, fix sleep, minor injury | 1 per decade | — | (habits only, §4.4) |
| `achievement` | ship something, award, finish a degree, make art | ≥1 per decade | — | judgment |
| `world_context` | recession, AI reshapes your field | **≤ 2 per life** (from the shared timeline) | — | `recessions` |

**Global rules (enforced by the validator):**
1. **One world for all four lives.** Generate a **shared world timeline** once per session: 1–2
   downturns + at most 1 tech shift, at plausible years. **No pandemics, wars, hurricanes or other
   disasters** by default. Each life *reacts* differently to the same world event, which is a
   believability win: *"2033: the downturn hits all four of you; only the Leap you loses the
   company."*
2. **No repeated subtypes.** The same `category+subtype` can't recur within its cooldown, and a
   world-context subtype never repeats.
3. **Negative-shock cap:** at most 1 major negative turning point per 3 years.
4. **Joy floor:** at least 1 major positive turning point per 5 years, **in every life**, including
   the Careful one.
5. **Quiet years:** ≥30% of years have no turning point. They show a one-line texture summary
   ("A quiet year. You learn to make your mom's khao man gai."). Real life is mostly quiet, and
   1 in 8 Billion gets its rhythm from this.
6. **Turning-point count:** 8–14 per life (roughly one every 3–5 years).
7. **Rare outcomes are labeled.** Anything beyond the 95th percentile (a startup exit, fame) can
   appear **at most once across all four lives**, with an explicit rarity note ("roughly 1 in 100
   founders").

### 3.5 Worry weighting: more attention, not worse odds

Let `worry[d] ∈ [0,1]` come from Q2 and later answers. The default is 0.1.

```
attention[d] = 1 + 1.5 × worry[d]                            // 1.0 … 2.5
share[d]     = floor_d + (1 − Σ floor) × attention[d] / Σ attention
floor_d      = 0.04 for each of the 10 domains (every domain appears in every life)
cap          = no domain > 40% of turning points
```

What `attention` changes:
- **Event density:** the planner splits the turning-point budget by `share[d]`.
- **Words:** narrative length per event scales with `attention`.
- **Pauses:** ≥2 of P1–P4 come from the top worry domains (§1.5).
- **Meters:** worry domains are always visible on screen. Other domains can collapse.

What `attention` does **not** change: the hazard of a *bad* outcome. A user who worries about
career does not get laid off more. They get more career scenes, and the odds still come from base
rates and the archetype's choices. Say this in the pitch, because it is the honesty argument in one
sentence.

**Coverage guarantee:** every life touches all 10 domains at least once, and touches family, love,
career, wealth and mental at least once per decade, if only as a texture line.

### 3.6 Meters and state dynamics

Show **6 meters** on screen (1 in 8 Billion uses 4; we use our own set and look): **Happiness ·
Love & People · Work & Purpose · Money · Energy** (health habits) **· Growth**. Store all 10
domains in JSON and map them to the 6 for display.

- **Year 0:** the LLM estimates each domain 0–100 from the profile with a one-line reason; the deep
  path optionally uses a dial.
- **Each year:** `state[d] = state[d] + drift(archetype, d) + Σ eventDeltas`. Event happiness
  deltas decay (half-life ~2 yrs; job loss leaves −3 permanently). Add the gentle U-curve to
  happiness (−5 to −8, peaking around 47–50). Cap changes at ±15 per year, or ±30 on a turning
  point.
- **Archetype drift** (per year, small): the Careful Life gets wealth +, a little growth −, and
  a slow happiness decline only if the core fear was boldness. The Leap gets career and wealth
  variance up, and love/family − in the years after the leap. Unjudged gets meaning and happiness
  +, and wealth − early, then flat.

### 3.7 Generated life schema

```jsonc
{
  "lifeId": "leap",                               // own | leap | careful | unjudged
  "title": "The Leap",
  "tagline": "You said yes to Singapore.",
  "archetype": { "axisRisk": "bold", "axisMotive": "others", "seedQuoteId": "q2" },
  "generatedFrom": { "profileVersion": 3, "startAge": 25, "startYear": 2026, "worldTimelineId": "wt_1",
                     "retunes": [ { "pauseId": "P1", "atAge": 27, "quoteId": "q7" } ] },
  "past": [ { "age": 18, "title": "First in your family to go to college", "quoteIds": ["q1"] } ],  // the opening-shot backfill

  "years": [
    {
      "year": 2028, "age": 27,
      "states": { "career": 71, "achievement": 60, "wealth": 44, "family": 52, "love": 58,
                  "children": null, "friends": 45, "health": 62, "mental": 57, "meaning": 55 },
      "facts":  { "location": "Singapore", "occupation": "senior consultant", "partner": "p2 (long distance)",
                  "children": 0, "home": "rent", "wealthBand": "p25-p50", "closestPersonId": "p2" },
      "summary": "You land in Singapore. The money is real; the 2am calls with Maya are harder.",
      "isQuietYear": false,
      "events": [
        {
          "id": "leap-2028-01",
          "domain": "career", "category": "career_move", "subtype": "international_transfer",
          "title": "You take Singapore",
          "narrative": "You told your mom on a Sunday. She said 'okay' in the voice that means it isn't. Three weeks later you're in a 28th-floor office in Raffles Place.",
          "valence": "mixed",                   // positive | negative | mixed
          "magnitude": 3,                       // 1 texture … 3 major
          "isTurningPoint": true,
          "cause": {
            "kind": "quote",                    // quote | prior_event | chance | world | archetype
            "quoteId": "q2",
            "priorEventId": null,
            "reason": "You said the transfer is the decision that keeps coming back. In this life, you say yes."
          },
          "alsoBecause": [ { "quoteId": "q3", "reason": "Your mom's expectation is why it hurts." } ],
          "baseRate": { "statId": "jobs_by_age",
                        "display": "People aged 25–34 hold about 4.5 jobs on average.",
                        "source": "BLS NLSY79 (2023)", "url": "https://www.bls.gov/news.release/archives/nlsoy_08222023.htm" },
          "stateDeltas": { "career": 12, "wealth": 6, "family": -8, "love": -6 },
          "source": "planner",                  // planner | model
          "locked": false                       // true once before a re-tune point
        }
      ],
      "pause": null                             // or { "pauseId": "P1", "prompt": "It's 2028. You're 27. …" }
    }
  ],

  "ending": {
    "age": 70, "year": 2071,
    "lookingBack": "Three countries, one marriage that bent and held, a career people would call successful.",
    "proudOf": [ "You built the Bangkok office from nothing." ],
    "regrets": [ { "type": "connection", "text": "The years you saw your mom twice a year.", "quoteId": "q3" } ],
    "inYourWords": null                          // P5 answer, verbatim, if Your Path
  },

  "audit": { "budgetsUsed": { "job_loss": 1, "world_context": 1 }, "validatorPassed": true, "repairs": 0 }
}
```

**The trace rule:** every `isTurningPoint: true` event **must** have `cause.kind = "quote"` or a
`priorEventId` that chains back to a quote within two steps. `chance` and `world` causes are allowed
for texture events and for the base-rate "this happens to 1 in 4 people" events, but the UI labels
them *"This one wasn't you — it's how life tends to go."* That honest label is a feature.

### 3.8 Re-tune: regenerate only from the pause year

When the user answers pause `P` at age `a` in life `L`:
1. Store the answer as a new quote (`q7`), run extraction, and bump `profileVersion`.
2. **Freeze** all years with age < a (`locked: true`). Keep the budget counters and the world
   timeline.
3. Call the life writer with: the frozen summary (facts at age a, states at age a, the last ~5
   turning points), the new quote, the updated profile and the remaining budget. Ask for years a…70
   **only**. **The answer must show a visible consequence within 0–2 years**, as an event whose
   `cause.quoteId` is the new quote.
4. Validate, diff against the old version, and animate the changed years ("Because you said *'…'*").
5. **Which lives re-tune?** Recommendation: **only Your Path is steered**, so the three contrasts
   stay stable and the comparison means something. If the answer *adds* a new person, fear or want,
   re-generate the contrasts lazily in the background from their own current year onward.
   **(Owner's call.)**
6. Latency: stream the immediate-consequence year first, then the rest. The user is reading the
   consequence while the later years arrive.

**Chat with a version of you at age X:** the persona gets the life JSON **up to age X only** plus
the profile and the quotes. It speaks as that person, cites the same events, and *doesn't know its
own future* ("I'm 52. I don't know what 60 looks like yet."). Safety rules from §4 apply, and it
may break character.

---

## 4. Safety

### 4.1 Detection (two layers, on every free-text input, including chat)

1. **Client-side prefilter (instant, no network):** a short regex list for acute phrases (e.g.
   "kill myself", "end it", "don't want to be alive", "hurt myself", "he hits me", "not safe at
   home"). If it fires, show the resource card at once, before any AI call.
2. **LLM classification in the extraction call** (no extra round trip). Add a `safety` object to the
   output:
   ```jsonc
   { "safety": { "category": "none",   // none | self_harm_current | suicidal_ideation | self_harm_past
                                       // | abuse_current | abuse_past | harm_to_others | eating_disorder | acute_distress
                 "severity": 0,        // 0 none · 1 past/mild · 2 concerning · 3 acute/imminent
                 "evidenceQuoteId": "q4" } }
   ```

### 4.2 What happens

| Severity | Behavior |
|---|---|
| 0 | Nothing. |
| 1 (past, resolved: "I was depressed in college") | Continue. The quote is stored `sensitivity: "private"`, may shape the story *gently* (resilience, support), and is **never shown verbatim** in why-traces or share cards. |
| 2 (concerning: hopelessness, ongoing abuse) | Pause softly. Show the resource card inline, then offer **"Keep going"** or **"Stop here"**. Don't build a future around the disclosure. Abusers are never written into a happy ending. Mark the quote `citable: false`. |
| 3 (acute: current suicidal intent, immediate danger) | **Stop the simulation.** Show a full-screen calm card with the resources, and don't generate lives. Message: *"I'm going to pause the story. What you just wrote matters more than any future I could show you."* Let them come back later. |

**Resource card (US):**
- **988 Suicide & Crisis Lifeline**: call or text **988**, or chat at [988lifeline.org](https://988lifeline.org)
- **Crisis Text Line**: text **HOME** to **741741** ([crisistextline.org](https://www.crisistextline.org))
- **National Domestic Violence Hotline**: **1-800-799-7233**, or text **START** to **88788** ([thehotline.org](https://www.thehotline.org))
- In immediate danger: **911**
- Outside the US: [findahelpline.com](https://findahelpline.com)

Add a **quick-exit** button (it navigates to a neutral page) whenever the abuse category is
flagged. This is standard practice on DV sites. Follow [safe messaging
guidelines](https://reportingonsuicide.org): no method details, no "suicide epidemic" framing, and
help is always visible.

**Chat:** the future-self persona **breaks character** when severity is 2 or higher: *"I'm going to
step out of the story for a second — I'm an AI, not actually you at 50…"* Then it shows the card.
It never plays therapist and never diagnoses.

**Age:** recommend 18+, with a confirmation checkbox on consent. **(Owner's call:** students under
18 at the expo are unlikely, but possible.)

### 4.3 Tone rules (put these in every generation prompt)

1. **Honest, not cruel.** Show trade-offs and base rates. Never mock, blame or say "you failed."
   Every life has dignity, and every life ends with something the person is proud of.
2. **Simulation, not prophecy.** Use "one way it could go" language, and put a persistent
   *"a simulation, not a prediction"* stamp on screen.
3. **No villains.** The people from Q3 are complicated, not evil. Mom's expectation comes from love.
4. **No advice in the story.** The lives show; they don't preach. In chat, the persona can reflect
   but gives **no financial, medical or legal advice** (no "buy X", no "you should take meds").
5. **Specific over grand.** "You learn to make your mom's khao man gai" beats "you find inner
   peace."
6. **No protected-trait shaping** (race, religion, orientation, disability) unless the user framed
   it themselves, and then only in their framing.
7. **Real organizations:** fine in neutral or positive events from the user's own data ("you join
   Deloitte"). Use **generic names for negative events** ("your company announces layoffs") to
   avoid defaming real employers.

### 4.4 No death, no serious illness: the content line

- **Allowed (Energy/health):** sleep, fitness, stress, burnout, back pain, a sprained ankle,
  glasses, a check-up that nudges a habit change, quitting smoking, running a 10k.
- **Banned for the user:** cancer, heart attack, stroke, dementia, terminal or serious chronic
  illness, serious accidents, suicide or self-harm, addiction crises, death.
- **Banned for others, by default:** on-screen death of anyone, pregnancy loss, a child's illness.
  **Parents aging** is shown as caregiving, never as death. The validator runs a keyword blocklist
  (died, death, funeral, cancer, terminal, hospice, stroke, heart attack, miscarriage, …) plus an
  LLM self-check line in the output.
- **Divorce and breakups:** allowed. They are personal, common and base-rate-grounded. Write them
  with care and a recovery arc.
- **Gray zones (owner's call):** infertility ("it takes longer than you hoped"), and parents'
  death left implicit at 70 (a 70-year-old's parents would be in their mid-90s, so "never" strains
  realism).

---

## 5. Decisions the owner needs to make

1. **Archetypes:** approve the 2×2 (Your Path, The Leap, The Careful Life, The Unjudged Life), and
   choose "The Careful Life" or "Fear Wins" as the label.
2. **Re-tune scope:** do pauses steer only Your Path (recommended), or all four?
3. **The 90-second judge path:** 0, 1 (P1) or 2 (P1 + P5) pauses?
4. **Death of others:** never shown (recommended for v1), or allowed implicitly late in life?
5. **Gray topics:** infertility, pregnancy loss and divorce. Recommendation: divorce yes,
   pregnancy loss no, infertility softened.
6. **Base-rate region:** US-only for the demo, with an "approximate" label for other countries?
7. **Non-open inputs:** may the deep path use a quick Wheel-of-Life dial for the year-0 meters?
   (The 1–7 measurement item is assumed fine.)
8. **Age gate:** 18+?
9. **Share cards:** which quotes may appear? Recommendation: only `citable` + `normal`
   sensitivity, and the user ticks which ones.
10. **Meters:** the 6 proposed, or 4 to stay closer to 1 in 8 Billion's simplicity?
