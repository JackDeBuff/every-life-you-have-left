/**
 * The four lives (D-004). Two axes: bold vs safe, and for others vs for yourself.
 * `ink` is a CSS custom-property name defined in src/styles/tokens.css; the theme (D-052)
 * decides the actual colours, so code must reference the token, never a hex value.
 */

export const LIFE_KEYS = ["path", "leap", "careful", "unjudged"] as const;
export type LifeKey = (typeof LIFE_KEYS)[number];

export interface Archetype {
  key: LifeKey;
  title: string;
  /** One-line definition, shown under the title and injected into prompts. */
  definition: string;
  risk: "bold" | "safe";
  motive: "others" | "self";
  /** Which fast-path answer seeds this life (research/03 §1.2). */
  seedQuestion: "fast.q1" | "fast.q2" | "fast.q4" | "fast.q5";
  /** CSS custom property for this life's ink colour, e.g. var(--ink-path). */
  ink: `--ink-${LifeKey}`;
  /** Only Your Path's pauses are asked in its voice; but every pause re-tunes all four (D-023). */
  steered: boolean;
}

export const ARCHETYPES: Record<LifeKey, Archetype> = {
  path: {
    key: "path", title: "Your Path",
    definition: "If nothing changes. Your momentum, bent by the answers you give at each pause.",
    risk: "safe", motive: "self", seedQuestion: "fast.q1", ink: "--ink-path", steered: true,
  },
  leap: {
    key: "leap", title: "The Leap",
    definition: "You say yes to the big decision you keep coming back to.",
    risk: "bold", motive: "others", seedQuestion: "fast.q2", ink: "--ink-leap", steered: false,
  },
  careful: {
    key: "careful", title: "The Careful Life",
    definition: "Fear wins every fork. Strong foundations, and regrets of boldness and connection.",
    risk: "safe", motive: "others", seedQuestion: "fast.q4", ink: "--ink-careful", steered: false,
  },
  unjudged: {
    key: "unjudged", title: "The Unjudged Life",
    definition: "What you would do if nobody judged you: not family, not friends, not anyone online.",
    risk: "bold", motive: "self", seedQuestion: "fast.q5", ink: "--ink-unjudged", steered: false,
  },
};

export const LIVES = LIFE_KEYS.map((k) => ARCHETYPES[k]);
