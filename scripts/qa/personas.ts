/**
 * The final QA pass's three personas (Sat Nov 7), for scripts/judge-run.ts --persona sam|chidi|margo:
 * what they type at Start, the documents they upload, their warm-up answers (in their own words), and
 * a script for their forks (an option matching a pattern, and/or their own words, with or without a tap).
 */
import { readFileSync } from "node:fs";
import type { DocInput } from "../../shared/engine";
import type { Decision, StartInput } from "../../shared/sim";

const base = { via: "text" as const, speed: "auto" as const, appearance: null, hasSelfie: false };

export const QA_PERSONAS: Record<string, StartInput> = {
  // minimal: one vague line
  sam: { ...base, firstName: "Sam", age: 22, city: "Chicago", region: "IL", country: "US", currency: "USD", line: "idk, stressed about jobs" },
  // naira, a stated monthly salary, a partner and a toddler
  chidi: {
    ...base, firstName: "Chidi", age: 34, city: "Lagos", region: null, country: "NG", currency: "NGN",
    line: "I'm a software engineer at a bank in Lagos, ₦600k a month. Fifty-hour weeks and three hours of traffic. A UK company offered me a remote role, and I keep sketching a fintech of my own.",
  },
  // a rich AI export and nothing typed
  margo: { ...base, firstName: "Margo", age: 41, city: "Toronto", region: "ON", country: "CA", currency: "CAD", line: "" },
};

export const QA_DOCS: Record<string, DocInput[]> = {
  margo: [{ kind: "ai_export", text: readFileSync(new URL("./margo-export.txt", import.meta.url), "utf8") }],
};

export interface QaStep {
  /** Tap the option whose label/title matches (else the run's default pick). */
  match?: RegExp;
  /** Their own words. */
  text?: string;
  /** false = typed without tapping anything. */
  tap?: boolean;
}

export const QA_SCRIPTS: Record<string, { warm: Partial<Record<string, string>>; big: (QaStep | null)[] }> = {
  sam: {
    warm: {
      now: "Just graduated, looking for work. My parents help with rent and money is tight.",
      crossroads: "My parents want me to take an admin job at my uncle's office, but I want to do UX design.",
      people: "My parents. They want me to have a steady job with benefits.",
      fear: "That I'm 32 and stuck in a job I hate.",
      unjudged: "Make short films and edit videos in LA.",
    },
    big: [{ match: /\bUX\b|design/i }, null, { match: /lead|senior|promot/i, text: "Only if I can keep Fridays for my own studio work." }, null, null],
  },
  chidi: {
    warm: {
      now: "Software engineer at a bank, ₦600k a month. Money is okay but tight with a toddler.",
      people: "Ada, my partner, and our daughter Zara, she's 2. Ada wants stability.",
      fear: "That I never build anything of my own.",
      unjudged: "Build the fintech full-time.",
    },
    big: [
      { match: /\bUK\b|remote/i },
      // QA: typed without tapping; the old card filed it as "Quit the bank to build the Lagos fintech full-time"
      { text: "I keep the UK job and build the fintech on weekends", tap: false },
      { match: /academy|teach|school|mentor|students/i },
      // tapped, then said the opposite
      { text: "No, none of these. I'd take a year to teach kids to code in Lagos." },
      null,
    ],
  },
  margo: {
    warm: {
      now: "Grade 7 and 8 science teacher, 14 years, CA$98,000 a year with a pension.",
      crossroads: "Whether to leave teaching for an instructional design job at an ed-tech firm.",
      people: "Dev, my partner, and my mother Ngozi, who thinks teaching is a job for life.",
      fear: "Burnt out and bitter in the same classroom at 51.",
      unjudged: "A year off travelling with Theo and Dev to Nigeria and Sweden, then building science games.",
    },
    big: [{ match: /evening|curriculum|moonlight|keep teaching/i }, null, null, null, null],
  },
};

/** The old decision card's guess for typed words without a tap (removed in this fix), for --legacy-answer. */
export function bestGuessLegacy(d: Pick<Decision, "options">, text: string): string {
  const words = new Set(text.toLowerCase().match(/[a-z']{3,}/g) ?? []);
  let best = d.options[0]!.id;
  let score = -1;
  for (const o of d.options) {
    const sc = (`${o.label} ${o.branchTitle ?? ""}`.toLowerCase().match(/[a-z']{3,}/g) ?? []).filter((w) => words.has(w)).length;
    if (sc > score) (score = sc), (best = o.id);
  }
  return best;
}
