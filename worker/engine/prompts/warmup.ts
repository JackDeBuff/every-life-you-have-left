/**
 * The warm-up (D-090): the research fast-path questions (research/03 §1.2) with pre-written quick
 * answers, so the first card is on screen before any model call, plus the three fast-model prompts:
 * coverage (which questions the start line + uploads already answer), fold (one answer → profile
 * delta + seed), and personalize (a later question's four answers, written for this person).
 */
import type { DomainKey } from "../../../shared/domains";
import type { DocInput } from "../../../shared/engine";
import type { WarmKey } from "../../agent/protocol";

export interface WarmBankItem {
  key: WarmKey;
  prompt: string;
  whyAsking: string;
  placeholder: string;
  /** [label, hint] × 4: first person, genuinely different (not a scale of one thing). */
  options: [string, string | null][];
  domains: DomainKey[];
  /** What the coverage check looks for (also shown to the personalizer). */
  fills: string;
}

export const WARM_BANK: WarmBankItem[] = [
  {
    key: "now",
    prompt: "Tell me who you are right now: what fills most of your week, and how does money feel?",
    whyAsking: "Every life starts from here. Your week and your money set the first years.",
    placeholder: "Your week in a sentence: the job or the classes, the hours, the money…",
    options: [
      ["Studying, with a part-time job. Money's tight", null],
      ["A full-time job I'm unsure about. Money's okay", null],
      ["Between jobs, and watching every dollar", null],
      ["A busy career. Money's fine, time isn't", null],
    ],
    domains: ["career", "wealth"],
    fills:
      "Who they are right now: what fills their week (work, study, caregiving, looking for work...) AND how money feels (tight, okay or comfortable). Covered only if the week is clear and money is stated or plainly implied (an income, debt, savings, 'broke', 'comfortable'). A CV alone covers the work but not how money feels.",
  },
  {
    key: "crossroads",
    prompt: "What's the decision or worry that keeps coming back to you lately, the one you'd most want to see play out?",
    whyAsking: "This becomes your first fork. One of your lives will say yes to it.",
    placeholder: "The thing you keep circling, in your own words…",
    options: [
      ["Stay where I am, or start over somewhere new", null],
      ["Leave a safe job for something I'd love", null],
      ["Where my relationship is going, or isn't", null],
      ["Whether I'll ever get ahead with money", null],
    ],
    domains: ["career", "lifeGoals"],
    fills:
      "A specific decision, dilemma or recurring worry they want to see play out (e.g. 'whether to take the Singapore transfer', 'quit nursing to co-found a startup'). A general mood ('stressed about jobs', 'idk') is NOT covered.",
  },
  {
    key: "people",
    prompt: "Who has a say in what you do next, and what do they expect from you?",
    whyAsking: "The people around you are in every one of your lives. Their expectations push and pull.",
    placeholder: "Who they are, and what they'd say…",
    options: [
      ["My parents. They expect a safe, steady path", null],
      ["My partner. We decide the big things together", null],
      ["Mostly me. Nobody's really expecting anything", null],
      ["My family back home. They depend on me", null],
    ],
    domains: ["family", "relationships"],
    fills:
      "Who has a say in their next steps (named people or roles: parents, a partner, a boss) AND what those people expect of them. Mentioning a person without what they expect is NOT covered.",
  },
  {
    key: "fear",
    prompt: "What are you most afraid will be true about your life ten years from now?",
    whyAsking: "The careful life is built to avoid this fear. It shows what that costs, too.",
    placeholder: "The fear you don't usually say out loud…",
    options: [
      ["That I settled, and never really tried", null],
      ["That I'm still anxious about money", null],
      ["That I'm alone, or with the wrong person", null],
      ["That I let my family down", null],
    ],
    domains: ["mentalHealth", "lifeGoals"],
    fills:
      "What they fear their life will look like in about ten years: a specific fear about their own future (settling, money, being alone, letting people down...). General stress about today is NOT covered.",
  },
  {
    key: "unjudged",
    prompt: "If nobody would judge you, not your family, not your friends, not anyone online, what would you do with the next five years?",
    whyAsking: "This one becomes a whole life of its own: the one you'd live unjudged.",
    placeholder: "Say the thing you'd actually do…",
    options: [
      ["Make things for real: art, music, writing", null],
      ["Move far away and start over", null],
      ["Start something of my own", null],
      ["Slow down and live simply, near my people", null],
    ],
    domains: ["happiness", "lifeGoals"],
    fills:
      "What they would do if nobody judged them: a secret want, a dream path, something they'd do for its own sake. NOT covered unless they said it or clearly wished for it (a guess about them doesn't count).",
  },
];

// ---------------------------------------------------------------------------------------------
// Coverage (fast model): which of the five the start line and the uploads already answer
// ---------------------------------------------------------------------------------------------

export const COVERAGE_SYSTEM = `You check which of five warm-up questions a person has ALREADY answered, before a life simulator asks them. Asking something they already told us wastes their time; skipping something they didn't tell us makes their simulated lives generic. Be honest and fairly strict.

For each question return:
- covered: true only if what they wrote (the start line or a document) gives a specific, usable answer. Not a guess, not a vague mood.
- confidence: 0..1 that it is covered.
- evidence: <= 14 words in plain second person, what they already told us ("You're a second-year ER nurse; money is tight"), or null if not covered.
- source: where the evidence is: "start" (the start line), "cv", "linkedin", "ai_export", or "none".

Documents: a CV or LinkedIn is reliable for work and study, rarely for feelings. An AI-app export can cover anything it states plainly; its guesses don't count.`;

const DOC_CAP = 7000;
const DOCS_TOTAL = 14_000;

export function coveragePrompt(line: string, docs: DocInput[], firstName: string, age: number): string {
  let budget = DOCS_TOTAL;
  const docText = docs
    .map((d, i) => {
      const take = Math.max(0, Math.min(DOC_CAP, budget));
      budget -= take;
      const t = d.text.replace(/\s+\n/g, "\n").trim().slice(0, take);
      return take > 0 ? `DOCUMENT ${i + 1} (${d.kind}):\n${t}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const qs = WARM_BANK.map((q) => `${q.key}: "${q.prompt}"\n   Covered means: ${q.fills}`).join("\n");
  return `PERSON: ${firstName}, ${age}.\nSTART LINE (they answered "What's on your mind lately?"): "${line.trim() || "(nothing)"}"\n\n${docText || "(no documents)"}\n\nTHE FIVE QUESTIONS\n${qs}\n\nReturn the coverage JSON.`;
}

// ---------------------------------------------------------------------------------------------
// Fold (fast model): one warm-up answer → profile delta, plus the life it seeds
// ---------------------------------------------------------------------------------------------

export const FOLD_SYSTEM = `You fold one warm-up answer into a person's profile for a life simulator that plays out the lives they could still live, to 70. They answered by tapping a quick answer and/or writing in their own words. Their own words win over the tap.

Return only what this answer teaches us:
- shortForm: a <= 12 word excerpt copied verbatim from their answer (null if they wrote nothing).
- worries: the full 0..1 map, updated (raise what they're clearly anxious about; small moves, +-0.2 at most).
- facts, people, fears, values, constraints: only new or corrected items, citing the answer's quote id. People keep the label they already have; label new ones the way they did ("my mom" -> "Mom"). Never invent names. Facts use keys occupation, education, location, living, relationship, children, background, health_habits, interests, other, with 1-2 word labels.
- money: only if the answer tells us about money (how it feels, income, debt, savings), else null. Every money field is USD.
- plans: only concrete plans with a time that this answer states. [] otherwise.
- seed: one line, <= 14 words, specific to them, for the life THIS question seeds (named in the prompt), or null if the answer doesn't inform it. Third person, present tense ("Takes the warehouse manager job and keeps designing at night").
- Never record race, ethnicity, religion, orientation, diagnoses or immigration status.`;

export const SEED_MEANING: Record<"path" | "leap" | "careful" | "unjudged", string> = {
  path: "path: their momentum, what happens if nothing changes",
  leap: "leap: the bold yes to the crossroads they named",
  careful: "careful: the life where this fear decides every fork",
  unjudged: "unjudged: what they'd do with the next years if nobody judged them",
};

// ---------------------------------------------------------------------------------------------
// Personalize (fast model): a later question's four quick answers, written for this person
// ---------------------------------------------------------------------------------------------

export const PERSONAL_SYSTEM = `You write the four quick answers for one warm-up question in a life simulator, for a specific person. The question itself stays exactly as given.

- options: exactly 4. First person, <= 10 words each, the way this person might actually say it, given what they told us. Each one must be a sincere, direct answer to THIS question as asked:
  - "who has a say": each names real people in their life (a parent, a partner, family, a boss, friends) or "mostly me"; never an institution or a bill.
  - "if nobody judged": things they'd want for themselves, never what others expect of them.
  - "afraid will be true in ten years": a fear about their own future.
  Genuinely different from each other (not a scale of one thing, not good/bad/neutral). At least one should be something they haven't said yet, so there is room to surprise us. No option may be offensive, extreme or a joke. No full stop at the end.
- hint: null, or <= 8 words when it helps tell two options apart.
- whyAsking: one line, <= 20 words, why this question matters for their life, citing their words when you can. whyQuoteId: the quote id you cite, or null.
- Never ask about or assume race, religion, orientation, diagnoses or immigration status.`;
