# 01: Inspirations, the science, naming

Research pass, Fri Nov 6 2026, ~10pm EST. Scope: a teardown of *1 in 8 Billion*, the MIT *Future You* papers,
Hal Hershfield's future-self research and the banks and insurers that used it, adjacent products,
research on regret and life outcomes, and naming.

**Legend:** **[V]** = checked against the primary source or the official page. **[S]** = taken from a
secondary source (press, a university summary, or a search snippet). **[UNVERIFIED]** = do not say it on
stage until someone checks it.

---

## TL;DR: the ten things that matter most

1. **MIT and Hershfield already published "multiple future selves" in late 2025.** *Possible You*
   (NeurIPS 2025, N=209) and *Simulating Life Paths with Digital Twins* (arXiv Dec 2025, N=192) both
   show people more than one future self. **We cannot pitch "several futures" as the new idea.** Our new
   parts are: (a) whole lives played out **year by year to 70** as a visual story, not a 30-years-ahead chat
   avatar; (b) **four lives side by side**, each starting from today; (c) **every turning point traced back to
   the user's own words**; (d) **open-ended answers that re-tune the lives mid-story**; (e) learning who you
   are from your **CV, LinkedIn PDF and AI-app export**. Cite these papers ourselves before a judge brings
   them up. [V]
2. **Original *Future You* (MIT, 2024): N=344, ages 18–30, one session.** On a 7-point scale, anxiety fell
   by 0.68 points, and **future self-continuity rose by 0.42**, more than in all three control groups. The
   study used **GPT-3.5**, a **60-year-old** future self, and an aged photo made with StyleCLIP.
   **Optimism did NOT change significantly** (p=.217), even though the press said it did. [V]
3. **Showing balanced futures changes minds; showing one-sided futures persuades.** In the 2025 *Life Paths*
   study, two balanced future selves led **~34% to reconsider their choice (vs ~11% in the control group)**.
   A system-generated third option was picked by **20% (vs 2.7%)**. One-sided avatars pushed people toward
   the option shown. This is an ethics design rule for us: keep the four lives balanced. [S, UCLA Anderson
   Review]
4. **People valued visual realism the LEAST of the three things they rated.** Visual realism scored
   5.16/7, practical decision logic 5.53, and meaning and alignment with their values 5.58. A second 2025
   study found that text, voice and avatar raised future self-continuity equally (no significant
   difference). **The evidence backs the owner's call to drop the aged face.** [S/V]
5. **Claude 4 beat GPT-3.5, Llama 4 and Qwen 3** at building the future self in the 2025 MIT multimodal
   study (N=92). The *Life Paths* study ran on Claude Sonnet 4.5. Conversation quality predicted the effect,
   not the format. [V abstract]
6. **Hershfield 2011 (J. Marketing Research): meeting an aged avatar raised *hypothetical* retirement
   saving.** The real-world follow-up, a **field RCT with 48,853 Mexican pension clients (2023)**, raised
   contribution rates from **1.5% to 1.7% (a 16% relative increase)** at about 1/500th of the money it
   raised. The effect is real but modest. [V/S]
7. **Merrill Edge "Face Retirement" (Bank of America) is VERIFIED.** It launched in early December 2012:
   you took a webcam photo, it showed your face aging, and it projected your future costs. Prudential's
   **"Day One"** (Droga5, ~2014) is a real campaign, but it was documentary ads, not a future-self tool.
   **KASIKORN Labs** (the lab of Thailand's KBank) co-authored the MIT *Future You* papers. **Found no
   evidence** for Allianz, Fidelity, Vanguard, Wells Fargo or Ally future-self tools. Don't name them. [V/S]
8. **Regret research gives the four lives an honest shape.** In Davidai & Gilovich (2018), **76%** named a
   biggest regret about failing their *ideal* self. Pink's World Regret Survey (**16,000+ people, 105+
   countries**) found four core regrets: foundation, boldness, moral, connection. The Harvard Study (since
   **1938, 724 men**) found that relationship satisfaction at 50 predicted health at 80 better than
   cholesterol did. [V/S]
9. **The happiness U-curve is real but contested.** Across 145 countries the low point averages **48.3**
   (advanced countries 46.7, developing 49.9). So a midlife dip in the late 40s is honest to show, as a
   tendency rather than a law. [V]
10. ***1 in 8 Billion* was built by one person with Claude in ~4 hours** and launched Oct 5, 2026. It works
    because of the *same-second strangers*, a *real-stat line per event* and a *comparison with your real
    country*. Its weak spots: a session lasts 30–90 minutes, it is a dense 3-column dashboard, the life is
    a random stranger's and not yours, and it includes death. Its look (charcoal, hot pink + mint, slab
    serif, ID-card and pixel-art motifs) is very distinctive. **Avoid all of it.** [V, seen in browser]

---

## 1. *1 in 8 Billion*: teardown

**What it is.** A free browser life simulator at https://1in8b.life/en/ (beta v0.9.56). You are "born" as
one of the ~4 babies born each second, in a place picked by real birth statistics for 172
countries and territories, and you live that life to its end. Ages 15+. It has no account and no ads, and
comes in 19 languages. Operator: "Jin's Earth" (solo developer; press names him Jin Hwi-eus). It was built
by "vibe coding" with Anthropic's Claude, ~4 hours from the first prompt to a live link
([RealSound JP](https://realsound.jp/tech/2026/10/post-2558126.html/amp),
[TechNews TW](https://technews.tw/?p=1639838)). **First released Oct 5, 2026**
([About](https://1in8b.life/en/about)). It went viral in Korea, then Japan and Taiwan. *Dragon Quest*
creator Yuji Horii shared his result. **No player numbers have been published** [S].

### Mechanics (seen in the browser plus the site text) [V]

| Element | How it works |
|---|---|
| **Landing** | Huge "1 in 8 Billion" title. Live counters of babies born and people who died since you opened the page. "Right now, ~5,500 people are each living their own life in this simulation". A "Today's theme" (for example "Poverty"). A dotted world map with pink bubbles and a bar chart of birth odds by country. One CTA: **"Be born"**. |
| **Setup (optional)** | Era (past / today / future / any world) and birth year. Weighting by births or by population. **Life length: about 30 min, 1 hour or 1.5 hours.** Optional "where you were actually born" for comparison (it *guesses* from the browser language and keeps it only on the device). A "Leave out frightening scenes" toggle. Calm music. |
| **Birth roulette** | A full-screen country name flickers ("CHOOSING YOUR BIRTHPLACE … India, Odds 21.5%"), then lands on a country. |
| **Birth registration card** | A document-style card with a pink header and a serial number (for example "No. AGO-2000-4311632"): name, sex, place, family income quintile, parents' jobs and ages, religion, life expectancy, child-mortality odds, GDP per person. Then one stat line ("0.56% of babies born in 2000 were born in Angola, about 1 in 179"). Then a table **comparing this child with your real country** (life expectancy, under-5 death rate, schooling, GDP). |
| **Same-second people** | "Born somewhere on Earth in the same second": 4 named strangers (city, sex, wealth band) whose lives run alongside yours by the same statistics. |
| **Main screen** | A 3-column dashboard. **Left:** an "Identity record" passport card with a pixel portrait and passport-style text lines, plus **Status meters 0–100** (Health, Happiness, Knowledge, Relationships) as horizontal bars, plus net worth and income. **Centre:** a pixel-art scene of your home, "This year's focus", and a **Life record** log (newest first; bad events in red; tap a line to star it). **Right:** family panel, same-second people at the same age, and the **Life map** grid (1 square = 1 year, current year outlined in pink). |
| **Time controls** | Pause, 1×/2×/4×/8×/12×/16× speed, "Next decision »", **Auto mode** (pick only a yearly focus and watch), Music. At 2×, 1 year ≈ 15 s. |
| **Decisions** | "A decision is waiting" covers school, work, love, moving abroad and medical care. Meters change the *odds*, never the outcome. Gains in Knowledge above ~70 add little. |
| **Pauses** | At ages **5, 15, 30, 50 and 70**, time stops for one reflective question. You can write a line. At death, you write a few words *to the person*. |
| **Sharing / memory** | A **birth card** and a **death card** to share. Your **last 10 lives** are kept in the browser. **Memorials:** others can "light a candle and leave a word". "Shared lives" lets players post feelings anonymously. Each abandoned life leaves a small stone in a corner. Key moments appear as **"golden memory balls"** (inspired by *Inside Out*) [S]. Lives are grouped into 16 "textures" [S]. |
| **Design choices** | **Money is deliberately not a score.** **Lives are not ranked.** Crime happens at real rates but never succeeds [S, TechNews]. Hard events (death, violence, suicide) happen at real rates but are kept off-screen, with help links. **Classroom mode** (`?edu=1`). |
| **Data** | UN WPP 2024, UN IGME, World Bank WDI, WHO, UNESCO, UNDP, ILO, UNICEF, FAO, World Happiness Report 2024, OWID, Maddison, UCDP/PRIO and others. Some gaps are filled from regional averages. |
| **Business** | Engine API "for NPCs, apps, AI evaluation, research"; refunds/terms pages suggest some paid layer (not checked). |

### Why it lands emotionally
- **It's specific.** A real-sounding name, a document with a serial number, parents' ages ("Mother, 16"),
  and a single stat line ("1 in 179") turn statistics into a person.
- **Comparison is the punch.** The side-by-side with *your real country* and the four same-second
  strangers make the unfairness visible without saying it.
- **Time passes on its own.** You watch years go by, and a decision interrupts you. It isn't a menu you
  click through.
- **Small, quiet questions** at fixed ages, then writing *to* the person at the end, which feels like a ritual.
- **Restraint.** No scores, no ranking, no money meter. That reads as serious and caring.

### Where it's weak (our openings)
- **Length:** 30–90 minutes per life. Most people never finish. **We need a 90-second full arc**, with
  depth available on demand.
- **It's not you.** It's a random stranger. The reflection is about luck and gratitude, not about what
  *you* will do on Monday. We are the reverse: **it's you, and you can still act.**
- **Weak agency by design.** Decisions barely move the odds. That is intentional, but it means you
  observe more than you steer.
- **Dense 3-column dashboard** with small grey text and many panels. It looks like a terminal, not a story.
- **The comparison people are a thin list** of names and stats, not lives you can see.
- **Death is the ending.** Heavy, and the off-screen handling still leaves a mark. We stop at 70, with no
  death and no serious illness.
- **No "why".** Events happen at statistical rates. There is no link back to anything the player said.

### Visual DNA to AVOID (so we are clearly distinct)
| 1in8b uses | We should instead |
|---|---|
| Near-black charcoal/slate background, cards with thin borders | Light or warm base, or a full-bleed scene. Not a dark dashboard. |
| **Hot pink/coral accent + mint/teal + amber** bars | Our own palette. **No pink + mint pairing.** |
| Heavy **slab/serif display** type plus **monospace micro-labels** | A different typeface family. No mono "terminal" captions. |
| **Passport / ID card / birth registration** motifs, passport-style text lines, serial numbers | No document or bureaucracy motifs. |
| **8-bit pixel-art** home scene | Not pixel art. |
| **Dotted world map** with bubbles | No world map (we're personal, not global). |
| **Horizontal 0–100 meter bars** for Health / Happiness / Knowledge / Relationships | If we show meters, use a different set and a different form (for example arcs, rings, a line or "weather" over time), and name them for our themes (money, love, purpose, calm, …). |
| **Grid of squares, 1 square = 1 year**, pink outline on the current year | Four **parallel lanes/rivers** from "you are here" to 70 (the branching is our visual idea), not a square grid. |
| Speed buttons 1×–16×, "Next decision »", Auto mode | Scroll- or tap-driven story. Pauses come as conversation, not a "decision" button. |
| Life record log, newest first, red text for bad events | A "why" card per turning point quoting the user's own sentence. |
| Birth card / death card, memorial candles | A "four of me at 70" share card, with nothing personal by default. |

Credit it out loud in the pitch: "inspired by *1 in 8 Billion*'s idea of lives played out year by year."

---

## 2. MIT *Future You* (2024), plus the 2025 follow-ups that matter for novelty

### The original paper [V]
Pataranutaporn, P., Winson, K., Yin, P., Lapapirojn, A., Ouppaphan, P., Lertsutthiwong, M., Maes, P.,
Hershfield, H. (2024). *Future You: A Conversation with an AI-Generated Future Self Reduces Anxiety,
Negative Emotions, and Increases Future Self-Continuity.* arXiv:2405.12514 (v4, Oct 1 2024). The MIT page
lists it as **IEEE Frontiers in Education (FIE) 2024**.
[arXiv](https://arxiv.org/abs/2405.12514) · [HTML v4](https://arxiv.org/html/2405.12514v4) ·
[MIT Media Lab](https://www.media.mit.edu/publications/future-you-a-conversation-with-an-ai-generated-future-self-reduces-anxiety-negative-emotions-and-increases-future-self-continuity/)
(The co-author list is partly from memory; the arXiv page lists it. MIT, KASIKORN Labs, Harvard, UCLA.)

- **Design:** an autobiographical survey (goals, values, life story), then a GPT-3.5 "future self" **at
  age 60**, then a 10–30 minute chat. After **16 messages** a button lets you finish. The aged photo was
  made with **StyleCLIP** (wrinkles, white hair). Preregistered (AsPredicted #157535), with MIT ethics
  approval.
- **Sample:** 400 recruited, **N = 344** analysed (Qualtrics/CloudResearch). **Ages 18–30, mean 25.05.**
  Four arms: Future You 73, Questionnaire only 76, generic Chat 103, Control 92.
- **Measures (7-point):** emotion checklist items (anxious, overwhelmed, unmotivated), the **Future
  Self-Continuity Questionnaire (FSCQ)** (similarity, vividness, positivity), optimism, hope,
  consideration of future consequences, self-esteem, self-reflection and insight. Pre and post.
- **Results (mean change in the Future You arm):**
  - Anxious **−0.68** (SD 1.52). Better than Control (p=.001) and Questionnaire (p=.040); vs Chat p=.059
    (marginal).
  - Negative emotion **−0.63**; unmotivated **−0.77** (both p<.001 overall).
  - **FSC +0.42** (SD 0.70), higher than all three controls (p=.001 / .001 / .040). FSC similarity +0.58,
    vividness +0.47.
  - **Not significant:** positive emotion, **optimism (p=.217)**, future consideration, self-esteem,
    self-reflection, insight.
  - **No effect sizes reported.** Measured **immediately after** the session, with no follow-up.
- **Quotable (abstract):** "significantly decreased anxiety and increased future self-continuity."
- **Stage-safe line:** *"MIT's Future You study: 344 young adults, one chat with their 60-year-old self.
  Anxiety went down and connection to their future self went up, compared with three control groups."*
- **Don't say:** "boosted optimism" (popular press claim; the paper says not significant), or that it is
  long-lasting.

### The follow-ups: why "several futures" alone is NOT new
| Paper | What it did | Key numbers |
|---|---|---|
| **Possible You** (Pataranutaporn, Winson, Yin, … Maes, **Hershfield**), NeurIPS 2025 Creative AI track [V](https://papers.neurips.cc/paper_files/paper/2025/hash/3bd4e338b06d69dbc16b66be1a0cd4f8-Abstract-Creative_AI_Track.html) | Career exploration as a dialogue with **several possible future selves** (stories plus AI portraits) vs one | N=209. **Seeing many selves widened people's sense of what's possible; one self deepened commitment.** Feeling that the futures were authentic drove the connection. |
| **Simulating Life Paths with Digital Twins** (Poonsiriwong, … Powdthavee, **Hershfield**, … Pataranutaporn), arXiv 2512.05397, Dec 2025 [V](https://arxiv.org/abs/2512.05397) · [UCLA brief](https://anderson-review.ucla.edu/as-ai-advances-tools-to-connect-to-your-future-self-grow-more-vivid-and-useful/) | People with a pending A/B decision had video calls with **+30-year avatars** (aged with Nano Banana, animated with LivePortrait, conversation by **Claude Sonnet 4.5**). Arms: control, a single path, balanced A+B, or A+B+a novel option. | N=192, ages 18–28. Balanced: **~34% reconsidered vs ~11%** in the control group. Novel option chosen by **20% vs 2.7%**. Single-path: 15–18% moved toward the path shown (control ~8%). Ratings out of 7: **visual realism 5.16 (lowest)**, decision logic 5.53, meaning/values 5.58. Higher agency → more openness to change. [S] |
| **Future You: multimodal digital twins** (Albrecht, … Hershfield, Maes, Pataranutaporn), arXiv 2512.06106, Dec 2025 [V](https://arxiv.org/abs/2512.06106) | Text vs voice vs avatar future self vs control; plus an LLM comparison | N=92. **All formats raised future self-continuity, well-being and motivation, with no significant difference between formats.** The avatar gave the most vividness. **Claude 4 did better than GPT-3.5, Llama 4 and Qwen 3.** Interaction quality (persuasiveness, realism, engagement) predicted the effect. |

**What this means for the pitch:**
- Frame it as building on the research: *"MIT showed that one conversation with your future self lowers
  anxiety. Their 2025 work showed that seeing several futures widens what people think is possible. We
  turn that into a whole life you can watch, four times over, from today to 70, and every turning point
  shows you which of your own sentences caused it."*
- Things still new compared with MIT: **year-by-year lives to 70** (they use one point in time, +30 years
  or age 60); **four lives together, compared visually**; **a "why" trace back to the user's words**;
  **re-tuning mid-story from open answers**; **profile from CV, LinkedIn and AI exports**; **a game-like
  story view** (they use chat or video calls); **finished in 90 seconds** (theirs takes 10–30 minutes).
- **Ethics rule from their data:** one-sided futures persuade. Keep the four lives **balanced and not
  ranked** (as 1in8b does), never "the right life", and say so on screen.
- **Model choice:** they found Claude the best future-self model. The brief currently plans Gemini on
  credits. Worth knowing; this is the owner's call.

---

## 3. Hal Hershfield: future self-continuity (FSC)

Hershfield is a professor at UCLA Anderson. Book: *Your Future Self: How to Make Tomorrow Better Today*
(Little, Brown Spark, 2023) [S, from memory].

| Finding | Citation | Number to quote |
|---|---|---|
| **People who feel continuous with their future self discount the future less and have saved more.** FSC was measured with a picture scale of overlapping current-self / future-self circles. | Ersner-Hershfield, Garton, Ballard, Samanez-Larkin & Knutson (2009), *Judgment and Decision Making* 4(4):280–286 [V](https://econpapers.repec.org/RePEc:cup:judgdm:v:4:y:2009:i:4:p:280-286_3) | Higher FSC → **greater accumulated assets**, controlling for age and education. |
| **Seeing an age-progressed avatar of yourself raises *hypothetical* retirement saving.** | Hershfield, Goldstein, Sharpe, Fox, Yeykelis, Carstensen & Bailenson (2011), *J. Marketing Research* 48(SPL):S23–S37 [V](https://vhil.stanford.edu/publications/increasing-saving-behavior-through-age-progressed-renderings-future-self) · [DOL CLEAR review](https://clear.dol.gov/study/increasing-saving-behavior-through-age-progressed-renderings-future-self-hershfield-et-al-2011) | NYU Stern summary: working adults allocated **~33% more** of their paycheck; in a VR study, **~2×** more to long-term savings [S]. The often-cited "$172 vs $80 out of $1,000" is **[UNVERIFIED, from memory]**. **The outcomes were hypothetical allocations** (DOL CLEAR notes this). |
| **Meeting your future self reduces cheating and delinquent choices.** | van Gelder, Hershfield & Nordgren (2013), *Psychological Science* 24(6):974–980 [V](https://pubmed.ncbi.nlm.nih.gov/23592649/) | Cheating **6%** after facing an aged self vs **23.5%** after facing the current self [S, Kellogg Insight](https://insight.kellogg.northwestern.edu/article/for_long_range_thinking_imagine_the_future_self). |
| **Writing to your self 20 years ahead increased exercise** in the following days. | Rutchick, Slepian, Reyes, Pleskus & Hershfield (2018), *J. Exp. Psych: Applied* 24(1):72–80 [V](https://www.columbia.edu/~ms4992/Pubs/2018_Rutchick-Slepian-Reyes-Pleskus-Hershfield_JEPA.pdf) | "1.4× more likely to work out on a given day" [S, secondary citation, UNVERIFIED]. |
| **Real-world RCT: aged selfie → pension contributions.** | Robalino, Fishbane, Goldstein & Hershfield (2023), *Behavioral Science & Policy* [V](https://journals.sagepub.com/doi/10.1177/23794607231190607) · [PDF](https://behavioralpolicy.org/wp-content/uploads/2023/09/BSP_Hershfield_09-06-23.pdf) | **48,853** Mexican pension clients (Aug 2018). Contribution rate **1.5% → 1.7% (+16%)**. Raised ~**500×** its cost. No change in recurring-savings sign-ups. |
| **FSC in a nationally representative US sample.** | Hershfield, Brimhall & Kerbel (2025), *Judgment and Decision Making* 20 [V](https://ideas.repec.org/a/cup/judgdm/v20y2025ip-_9.html) · [UCLA brief](https://anderson-review.ucla.edu/wealth-building-behavioral-trait-holds-up-in-large-scale-study) | **6,000+ Americans**. FSC strongly tied to **financial well-being**. Mean FSC score ~68 [S]. |
| **The FSCQ** (the scale MIT used) | Sokol & Serper (2020); validated by Han, Siegert & Wrapson (2025, *J. Personality Assessment*) [S](https://openrepository.aut.ac.nz/items/8030b8a4-abe1-4aeb-978a-ee2282d0fa5c/full) | 10 items, 3 factors: similarity, vividness, positivity. |

No 2023–2026 **meta-analysis** of FSC interventions was found in a quick search **[not found, not
ruled out]**.

**For the Saturday "bring a number" test:** use the **single-item overlapping-circles FSC measure**
(7 pairs of circles; "pick the pair that best shows how similar you feel to yourself at 70"). It takes
10 seconds and comes from Ersner-Hershfield 2009. Ask it before and after. Optionally add the FSCQ
similarity items to match MIT. Report the mean change and N honestly; with ~10 hackers it is a pilot,
not proof.

### Banks and insurers that used future-self visualization
| Company | What | Status |
|---|---|---|
| **Merrill Edge (Bank of America): "Face Retirement"** | Launched **early Dec 2012**. Webcam photo → your face aged to future ages, plus projected costs of living; shareable to Facebook. Merrill cited "a Stanford study" (Hershfield/Bailenson). A Merrill-sponsored post claimed ~350k visitors soon after launch. | **[V]** [Business Wire release (title)](https://businesswire.com/news/home/20121204005580/en/Merrill-Edge%C2%AE-Launches-Face-Retirement), [Marketplace](https://www.marketplace.org/2012/12/06/using-scary-online-photos-motivate-saving-retirement), [American Banker](https://www.americanbanker.com/news/face-it-youre-getting-old-merrill-tells-customers), [Finextra](https://finextra.com/newsarticle/24349/merrill-face-retirement-tool-gives-consumers-a-harrowing-peek-at-their-future-selves). The 350k figure is **[S, sponsored]**. |
| **Prudential: "Day One"** (Droga5) | Documentary portraits of real retirees on their first day of retirement, plus DayOneStories.com. The name was later reused for Day One target-date funds. Prudential also commissioned research from Hershfield [S]. **Not an age-progression or future-self simulation**, just a campaign about imagining retirement. | **[V campaign exists]** [LBB](https://lbbonline.com/news/droga5-captures-day-one-of-5000-pensioners), [WARC](https://www.warc.com/Content/5fe92c65-7955-4ae6-865f-923c2c7dee4a). "Stories from tomorrow" title **[UNVERIFIED / not found]**. |
| **Mexican pension provider (unnamed in the paper)** | Field RCT above: SMS → selfie → aged face → "how much do you want to save for this person?" | **[V]** |
| **KASIKORN Labs / KBTG (Thailand, KBank's tech arm)** | Co-authors (Lertsutthiwong, Winson) on all the MIT *Future You* papers. A bank's own lab is investing in this research. | **[V]** author lists |
| **BBVA (Spain)** | Personalized pension video showing digital clients "a future where they did save". | **[S, vendor blog only]** [Idomoo](https://blog.idomoo.com/topic/bbva) |
| Allianz, Fidelity, Vanguard, Wells Fargo, Ally | Nothing found that ties them to a future-self or aged-face tool. | **[NOT FOUND, don't say on stage]** |

**Stage-safe line:** *"Banks figured this out in 2012: Merrill Edge's Face Retirement showed you your aged
face to get you saving. A 2023 field trial with almost 49,000 pension savers in Mexico found that an aged
selfie raised contributions by 16%. We do it for the whole life, not just the 401(k)."*

---

## 4. Adjacent products: what exists and how we differ

| Name | One line | How we differ |
|---|---|---|
| **1 in 8 Billion** (2026) | A random stranger's life by world statistics, played year by year | It's **you**, from **today**, four branches, with a "why" |
| **MIT Future You / Possible You** (2024–25) | Chat or video call with a future self at 60 or +30 years; multiple selves in 2025 | Whole lives played out year by year, compared visually, traced to your words, 90 seconds |
| **Wait But Why: "Your Life in Weeks"** (2014) / **"The Tail End"** (2015) | A 90-year life as a grid of weeks; by the end of high school you've used ~93% of your in-person time with your parents | The same urgency (our "45 summers left"), but forward-looking, branching and personal. [S] for 93% ([quoted](https://hq-raydata-co.pages.dev/vault/06-reference/2026-05-08-tim-urban-the-tail-end/)); originals at waitbutwhy.com |
| **Life Calendar / "life in weeks" apps** | Wallpapers and widgets showing weeks lived and weeks left | Static countdown vs simulated futures |
| **Death Clock** (Brent Franson, 2024) | AI predicts your death date from ~25 lifestyle questions; ~125k downloads by Dec 2024 (Sensor Tower), paid tier | **No death.** Life choices, not mortality ([TechCrunch](https://techcrunch.com/2024/12/01/death-clock-app-predicts-the-date-of-your-death)) |
| **BitLife** (Candywriter, 2018) | A text life simulator of a random fictional life; 100M+ Google Play installs | It's a game about a made-up person. Ours is about you, honest and grounded [S] |
| **FutureMe.org** (2002) | Email a letter to your future self; ~10M+ letters | One-way letter vs a two-way conversation and simulated lives [S] |
| **MyFutureSelf** (iOS, Success AI LLC) | Chat or voice with an AI future self "trained on your goals"; 4.7★ / 244 ratings | A single coaching chatbot vs four simulated lives ([App Store](https://apps.apple.com/us/app/id6745573360)) |
| **OniAI** (Product Hunt, Jun 2025) | Chat with your past and future self; tiny traction | Same contrast ([PH](https://www.producthunt.com/products/oniai)) |
| **Replika / Character.ai** | Companion and persona chat | Not about futures or decisions; we're not a companion |
| **Merrill Edge Face Retirement** (2012) | Aged-face photo to sell retirement saving | No face; the whole life, not one financial goal |
| **Devpost look-alikes** (from search snippets, pages blocked) | **TimeSplit** (choose decisions, then meet several AI future selves), **Aevora** (decision simulator with multiple paths and sliders), **Usaid** (Optimistic/Pragmatic/Risky futures in a Gemini graph view), **The One You Could've Been** (your alternate self from choices you didn't make), **PebblePath** (life paths for women 25–35), **Mirror8** (Gemini Live Agent Challenge 2026, photoreal future-self portraits), and **PersonaReflect** (Duke 2025, did not win) | Most are chat or graph UIs with generic labels. We differ in: a year-by-year **animated life** to 70, a **why trace to your sentences**, **re-tuning mid-story**, and a **profile from your real documents** |

---

## 5. Regret and life-outcome research to shape honest futures

| Finding | Source | How to use it in the generator |
|---|---|---|
| **In the short term people regret what they did; in the long term, what they didn't do.** In the original survey, **45/60 (75%)** said they regretted inactions more. ⚠️ A 2023 replication found life-long regrets split **51% action / 49% inaction**, so the long-term inaction claim is weaker than it's usually told. | Gilovich & Medvec (1994), *JPSP* 67(3):357 [V](https://pubmed.ncbi.nlm.nih.gov/7965599/); replication [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282588/) | The "Fear wins" life collects quiet regrets of inaction by its 50s. Present it as a tendency, not a law. |
| **Our most lasting regrets are about not becoming our *ideal* self.** These were **72%** of regrets vs 28% about duty, and **76%** of people named an ideal-self regret as their biggest. | Davidai & Gilovich (2018), *Emotion* [S](https://news.cornell.edu/node/300686) | The "one you secretly want" life is the ideal-self path. The "if nothing changes" life is where the ideal-self regret grows. |
| **Four core regrets: foundation** (didn't build stability), **boldness** (didn't take the chance), **moral** (didn't do right), **connection** (let relationships fade). Inaction regrets are ~2× as common as action regrets. Connection regrets were the largest category. | Daniel Pink, *The Power of Regret* (2022). World Regret Survey: **16,000+ people, 105 countries** at the book's release; later 24–26k regrets. Plus the American Regret Project (**4,489** people). Not a random sample. [S](https://behavioralscientist.org/?p=37928) | **Use these four as turning-point categories.** Every life should touch at least two. The "why" card can name the category. |
| **The five regrets of the dying:** (1) not living true to myself, (2) working so hard, (3) not expressing feelings, (4) losing touch with friends, (5) not letting myself be happier. | Bronnie Ware, palliative nurse. Blog 2009, book 2011/2012. **Anecdotal** (Davidai & Gilovich call it that). [Wikipedia](https://en.wikipedia.org/wiki/The_Top_Five_Regrets_of_the_Dying) | A good prompt seed for the questions at the age-70 pause. Quote it as an observation, never as data. |
| **Relationships are the strongest predictor of a long, happy life.** Satisfaction with relationships at **50** predicted health at **80** better than cholesterol did. | Harvard Study of Adult Development: began **1938** with **724** men (268 Harvard sophomores + 456 Boston youths); now ~1,300 descendants. Waldinger & Schulz, *The Good Life* (2023). [Harvard Gazette](https://news.harvard.edu/gazette/story/2023/02/work-out-daily-ok-but-how-socially-fit-are-you) | **Weight the happiness of each life heavily on relationships**, more than on income. The "worked so hard" life can be rich and lonely. Caveat: the original cohort was all men, mostly American. |
| **The happiness U-curve:** well-being reaches its lowest point in midlife. | Blanchflower (2021), *J. Population Economics* 34(2):575–624, **145 countries**. Average low point **48.3** (advanced countries 46.7, developing 49.9). [V](https://pmc.ncbi.nlm.nih.gov/articles/PMC7480662). The widely quoted **"47.2"** is from a different or earlier analysis **[UNVERIFIED]**. Cross-sectional data; contested. | Give every life a **dip somewhere in the 40s–early 50s**, even the "good" one. That is honesty, not doom. |
| **Feeling connected to your future self is linked to better money, health and ethics** | See §3 | That is the product thesis. |

**Design principle these add up to:** *honest, not flattering* means (a) even the best life has a midlife
dip, (b) the money-maximizing life is not automatically the happiest, (c) inaction has quiet costs, and
(d) relationships carry the most weight. Each of these is defensible with a citation.

---

## 6. Naming

### "Every Life You Have Left": evaluation
**Strengths**
- Poetic. It says what the product is: *every life* (several lives), *you have* (personal), *left*
  (starts from today, and you still have time). It sets up the opening line.
- It contains a mild mortality "sting" that grabs attention without mentioning death.
- **everylifeyouhaveleft.com is unregistered** (whois: "No match", Nov 6 2026) and .app has no DNS.
  No product found with the name.

**Weaknesses**
- **Five words, 21 letters.** Hard to say over expo noise, hard to type, and hard to remember exactly
  ("Every Life You... Have... Left?"). There is no natural short form (ELYHL).
- "Left" reads as **death-adjacent** ("how much life you have left"), close to Death Clock, which clashes
  with our "no death, stop at 70" stance and could make judges hear "morbid".
- "Every" over-promises: we show four.
- It doesn't say "AI" or "future self". Fine for a story brand, but weaker in a Devpost gallery list.
- As an app it truncates (an iOS home-screen label shows ~12 characters: "Every Life Y…"). The URL
  `every-life-you-have-left.<acct>.workers.dev` is long.

**Verdict:** a superb **tagline or opening line**, a weak **brand**. Keep it as the hero sentence and
use a short name for the logo and URL.

### Alternatives (domain status from a quick DNS/whois check, Nov 6 2026; not a registrar lookup)

"Free?" = no nameservers (likely unregistered). "Unregistered" = whois says no match. "Taken" = has
nameservers or a whois record.

| # | Name | Rationale | .com | .app |
|---|---|---|---|---|
| 1 | **Lives Left** | The current name in two words. Doubles as "extra lives left", which fits the game-like story view. Keeps the owner's meaning. | **unregistered** | free? |
| 2 | **Four of You** | Literally our twist on 1in8b ("four of you, from the same moment: today"). Warm, concrete, not morbid. | **unregistered** | free? |
| 3 | **Every You** | The shortest form of the current name. Plural selves, no death note. | taken (2009) | taken |
| 4 | **You at 70** | A concrete endpoint people instantly understand. Risk: sounds like an aged-face filter, and like old age to a 20-year-old. | **unregistered** | free? |
| 5 | **All Your Lives** | Plural and hopeful. A softer "Every Life…". | **unregistered** | free? |
| 6 | **Still Ahead** | Hopeful; stresses that the future is still open. | taken | taken |
| 7 | **The Years Ahead** | Calm and literal; good for a career-center (B2B) product. | — | free? |
| 8 | **Life Rehearsal** | "Rehearse the rest of your life before you live it". This is a simulation, not a prophecy (the "not a horoscope" message). | taken | free? |
| 9 | **Summers Left** | Matches the candidate opening line ("45 summers left"). Personal and seasonal. | taken | taken |
| 10 | **Unlived** | Short and haunting (an earlier candidate). Risk: negative, focused on loss. | taken | taken |
| 11 | **Not Yet** | "You're not done yet." Hopeful, two syllables. | — | taken |
| 12 | **Fourfold** | Elegant; four lives. Risk: abstract. | — | taken |

**Collision check:** no app or product named "Lives Left", "Four of You", "All Your Lives" or "Every
Life You Have Left" turned up. "Hindsight" (an earlier candidate) is already a narrative video game
(Annapurna, 2024) **[from memory, UNVERIFIED]**, and hindsight.app is taken. Avoid it.

### Recommendation (top 3)
1. **Lives Left**, with the tagline *"Every life you have left."* It keeps the owner's chosen name and
   meaning, is easy to say at the booth, fits the game-like view, and livesleft.com looks
   **unregistered**.
2. **Four of You**, with the tagline *"Four of you, from the same moment: today."* The most pitchable and
   the least morbid. It ties directly to the 1in8b inspiration, and the .com looks **unregistered**.
   Risk: it locks the product to four lives.
3. **Every Life You Have Left** (keep as is). Strongest emotionally. The domain is free, but it's long.
   Fine for a hackathon where the name is said once and then shown.

**Cloudflare Workers note:** a Worker is served at `<worker-name>.<account-subdomain>.workers.dev`
(the worker name is lowercase letters, numbers and dashes). For example `lives-left.<you>.workers.dev`
or `four-of-you.<you>.workers.dev`. This is general knowledge; check the length limits in the Cloudflare
docs. A custom domain can be added later.

---

## 7. Lines that are safe to say on stage
- "MIT's Future You study (2024, N=344): one conversation with your 60-year-old self lowered anxiety and
  raised connection to your future self, compared with three control groups."
- "In MIT and UCLA's 2025 follow-up, seeing two balanced futures made about a third of people reconsider a
  big decision, versus about a tenth in the control group."
- "People rated meaning above visual realism. So we skipped the aged-face filter and put the effort into
  the story."
- "Banks have known this since 2012: Merrill Edge's Face Retirement. A 2023 trial with ~49,000 pension
  savers in Mexico raised contributions by 16%."
- "The Harvard Study of Adult Development, running since 1938: relationships at 50 predicted health at 80
  better than cholesterol. Our futures weigh that."

## 8. Questions the owner must decide
1. **Brand vs tagline:** keep "Every Life You Have Left" as the brand, or make it the tagline under a
   short name (Lives Left / Four of You)?
2. **The novelty pitch:** do we name *Possible You* and *Life Paths* (MIT + Hershfield, 2025) on stage
   ourselves? (Recommended: yes, frame it as "building on their research".)
3. **Balance rule:** the evidence says one-sided futures persuade. Do we commit to "no life is ranked or
   labelled best" (as 1in8b does)? This shapes the labels like "Fear wins".
4. **Meters:** which life dimensions do we visualize (money, love, purpose, calm, health, family …), and
   in what form? It must not be 1in8b's 4 horizontal bars.
5. **Money:** 1in8b deliberately has no money score. Our users worry about money. Do we show net worth or
   income on the lives?
6. **Model:** the research found Claude the best future-self model (Claude 4 > GPT-3.5, Llama 4, Qwen 3).
   Do we stay on Gemini (credits) or use Claude for the chat or generation?
7. **The Saturday measure:** the single overlapping-circles FSC item (fast) or FSCQ similarity items
   (matches MIT)? Who are the ~10 testers?
8. **Session modes:** 1in8b offers 30/60/90-minute lives. Ours could offer "90 seconds / 10 minutes / take
   your time". Confirm the default for the expo.
9. **Share card:** what goes on it by default? (Suggest: four tiny lanes plus one line, nothing
   identifying.)
10. **The KASIKORN angle:** a Thai bank lab co-funds the MIT work. Use it as a business precedent in the
    pitch (B2B: banks, insurers, career centers)?

---

## Sources (main)
- 1 in 8 Billion: https://1in8b.life/en/ · https://1in8b.life/en/about · RealSound JP https://realsound.jp/tech/2026/10/post-2558126.html/amp · TechNews TW https://technews.tw/?p=1639838
- Future You (2024): https://arxiv.org/abs/2405.12514 · https://arxiv.org/html/2405.12514v4 · https://www.media.mit.edu/publications/future-you-a-conversation-with-an-ai-generated-future-self-reduces-anxiety-negative-emotions-and-increases-future-self-continuity/
- Possible You (NeurIPS 2025): https://papers.neurips.cc/paper_files/paper/2025/hash/3bd4e338b06d69dbc16b66be1a0cd4f8-Abstract-Creative_AI_Track.html
- Simulating Life Paths (2025): https://arxiv.org/abs/2512.05397 · UCLA brief https://anderson-review.ucla.edu/as-ai-advances-tools-to-connect-to-your-future-self-grow-more-vivid-and-useful/
- Multimodal Future You (2025): https://arxiv.org/abs/2512.06106
- Hershfield 2011: https://vhil.stanford.edu/publications/increasing-saving-behavior-through-age-progressed-renderings-future-self · https://clear.dol.gov/study/increasing-saving-behavior-through-age-progressed-renderings-future-self-hershfield-et-al-2011 · https://www.stern.nyu.edu/experience-stern/faculty-research/hershfield-retirement-savings
- Ersner-Hershfield 2009: https://econpapers.repec.org/RePEc:cup:judgdm:v:4:y:2009:i:4:p:280-286_3
- van Gelder 2013: https://pubmed.ncbi.nlm.nih.gov/23592649/
- Rutchick 2018: https://www.columbia.edu/~ms4992/Pubs/2018_Rutchick-Slepian-Reyes-Pleskus-Hershfield_JEPA.pdf
- Robalino et al. 2023: https://journals.sagepub.com/doi/10.1177/23794607231190607
- Hershfield, Brimhall & Kerbel 2025: https://ideas.repec.org/a/cup/judgdm/v20y2025ip-_9.html
- Merrill Edge Face Retirement: https://businesswire.com/news/home/20121204005580/en/Merrill-Edge%C2%AE-Launches-Face-Retirement · https://www.marketplace.org/2012/12/06/using-scary-online-photos-motivate-saving-retirement · https://www.americanbanker.com/news/face-it-youre-getting-old-merrill-tells-customers
- Prudential Day One: https://lbbonline.com/news/droga5-captures-day-one-of-5000-pensioners · https://www.warc.com/Content/5fe92c65-7955-4ae6-865f-923c2c7dee4a
- Gilovich & Medvec 1994: https://pubmed.ncbi.nlm.nih.gov/7965599/ · replication https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10282588/
- Davidai & Gilovich 2018: https://news.cornell.edu/node/300686
- Pink: https://behavioralscientist.org/?p=37928
- Ware: https://en.wikipedia.org/wiki/The_Top_Five_Regrets_of_the_Dying
- Harvard Study: https://news.harvard.edu/gazette/story/2023/02/work-out-daily-ok-but-how-socially-fit-are-you
- Blanchflower: https://pmc.ncbi.nlm.nih.gov/articles/PMC7480662
- Death Clock: https://techcrunch.com/2024/12/01/death-clock-app-predicts-the-date-of-your-death
