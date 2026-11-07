/**
 * The 10 life domains every Life tracks every year (0–100), grouped into 4 families.
 * Keys are stable contract ids: used in Profile.worries, Year.states and Event.domain.
 *
 * Polarity: for every domain except `risk`, higher = going better. `risk` is exposure
 * (how much is on the line: a leap, a layoff, a loan), so high risk is neither good nor bad.
 */

export const DOMAIN_KEYS = [
  "career",
  "wealth",
  "achievement",
  "family",
  "relationships",
  "children",
  "mentalHealth",
  "happiness",
  "lifeGoals",
  "risk",
] as const;
export type DomainKey = (typeof DOMAIN_KEYS)[number];

export const FAMILY_KEYS = ["work", "people", "inner", "direction"] as const;
export type FamilyKey = (typeof FAMILY_KEYS)[number];

export interface DomainFamily {
  key: FamilyKey;
  label: string;
  domains: readonly DomainKey[];
}

export const FAMILIES: readonly DomainFamily[] = [
  { key: "work", label: "Work & money", domains: ["career", "wealth", "achievement"] },
  { key: "people", label: "People", domains: ["family", "relationships", "children"] },
  { key: "inner", label: "Inner life", domains: ["mentalHealth", "happiness"] },
  { key: "direction", label: "Direction", domains: ["lifeGoals", "risk"] },
];

export interface DomainInfo {
  key: DomainKey;
  label: string;
  family: FamilyKey;
  /** What 0–100 means for this domain. Injected into prompts; shown in UI tooltips. */
  meaning: string;
  /** false only for `risk` (exposure, not wellbeing). */
  higherIsBetter: boolean;
}

export const DOMAINS: Record<DomainKey, DomainInfo> = {
  career: {
    key: "career", label: "Career", family: "work", higherIsBetter: true,
    meaning: "How work is going: fit, standing, growth and security in what fills your week.",
  },
  wealth: {
    key: "wealth", label: "Wealth", family: "work", higherIsBetter: true,
    meaning: "Financial footing relative to your age: savings, debt, housing, slack for shocks.",
  },
  achievement: {
    key: "achievement", label: "Achievement", family: "work", higherIsBetter: true,
    meaning: "Things made, finished or recognised: projects, degrees, work you are proud of.",
  },
  family: {
    key: "family", label: "Family", family: "people", higherIsBetter: true,
    meaning: "Parents, siblings and family of origin: closeness, obligations kept, strain.",
  },
  relationships: {
    key: "relationships", label: "Relationships", family: "people", higherIsBetter: true,
    meaning: "A partner (if any) and close friends: intimacy, being known, not being lonely.",
  },
  children: {
    key: "children", label: "Children", family: "people", higherIsBetter: true,
    meaning:
      "How this part of life sits with you: raising kids, wanting them, or contentedly not. 50 = not yet a question.",
  },
  mentalHealth: {
    key: "mentalHealth", label: "Mental health", family: "inner", higherIsBetter: true,
    meaning: "Stress, energy, sleep, steadiness. Hard years go low; never illness or crisis.",
  },
  happiness: {
    key: "happiness", label: "Happiness", family: "inner", higherIsBetter: true,
    meaning: "Day-to-day life satisfaction. Gentle U-curve: dips a little in the late 40s.",
  },
  lifeGoals: {
    key: "lifeGoals", label: "Life goals", family: "direction", higherIsBetter: true,
    meaning: "Living toward what you said matters: the secret want, the values, the 'why'.",
  },
  risk: {
    key: "risk", label: "Personal risk", family: "direction", higherIsBetter: false,
    meaning: "Exposure: how much is on the line right now. Spikes during leaps, loans and layoffs.",
  },
};

export const domainLabel = (k: DomainKey): string => DOMAINS[k].label;
export const familyOf = (k: DomainKey): FamilyKey => DOMAINS[k].family;
