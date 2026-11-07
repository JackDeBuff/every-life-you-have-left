/**
 * Today's date for the prompts, and checks that a card or year set in the first (current) year
 * never places "now" in a season or month that has already passed. The first simulated year is
 * only what's left of the current year (a card on Nov 7 must not say "It's spring 2026").
 */
import type { Profile } from "../../shared/schema";
import { sentences } from "./util";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SOUTH = new Set(["AU", "NZ", "AR", "CL", "UY", "PY", "ZA", "BR", "PE", "BO", "NA", "BW", "ZW", "MZ", "MG", "LS", "SZ"]);

export function seasonOf(month0: number, country: string): string {
  const north = ["winter", "winter", "spring", "spring", "spring", "summer", "summer", "summer", "autumn", "autumn", "autumn", "winter"][month0]!;
  if (!SOUTH.has(country.toUpperCase())) return north;
  return ({ winter: "summer", summer: "winter", spring: "autumn", autumn: "spring" } as Record<string, string>)[north]!;
}

/** Last month index (0-11) of a northern-hemisphere season within a calendar year. */
const SEASON_END: Record<string, number> = { spring: 4, summer: 7, autumn: 10, fall: 10 };

/** One line for the NOW block: today's date and what the first simulated year means. */
export function todayLine(today: Date, profile: Profile, year: number): string {
  const m = today.getMonth();
  const date = today.toISOString().slice(0, 10);
  const left = MONTHS.slice(m).join(", ");
  const head = `Today is ${date} (${MONTHS[m]} ${today.getFullYear()}, ${seasonOf(m, profile.country)} where they live).`;
  if (year === today.getFullYear())
    return `${head} ${year} is only what's left of this year (${m >= 10 ? `${MONTHS[m]}-December` : left.split(", ").slice(0, 3).join(", ") + (m < 9 ? "..." : "")}): anything set "now" happens in ${MONTHS[m]} ${year} or later, never in a season or month of ${year} that has already passed.`;
  return head;
}

/** Sentences from their own words that carry a date or a timeline ("I'll go back in early 2027"). */
export function statedTimelines(profile: Profile): string[] {
  const out: string[] = [];
  const re = new RegExp(`\\b(20[2-9]\\d|next (?:year|spring|summer|autumn|fall|winter|month)|in (?:a|one|two|three|\\d) (?:years?|months?)|by (?:the end of )?(?:${MONTHS.join("|")}|20[2-9]\\d)|(?:early|late|mid)[- ](?:20[2-9]\\d|${MONTHS.join("|")})|after (?:graduation|i graduate)|when i graduate|this (?:spring|summer|winter|fall|autumn))\\b`, "i");
  for (const q of profile.quotes) {
    for (const s of sentences(q.text)) {
      if (re.test(s) && !out.includes(s) && s.length < 260) out.push(s);
      if (out.length >= 4) return out;
    }
  }
  return out;
}

/**
 * Issues when text written for the current year places "now" in a month or season that has
 * already passed. Past references ("since March", "back in spring") are fine.
 */
export function pastTimeIssues(text: string, today: Date, country: string, year: number): string[] {
  if (year !== today.getFullYear()) return [];
  const m = today.getMonth();
  const issues: string[] = [];
  const south = SOUTH.has(country.toUpperCase());
  const PAST_CUE = /\b(since|last|back in|ago|was|were|had|earlier|used to|before|until)\b/i;
  for (const s of sentences(text)) {
    // "It's March", "It's early spring 2026", "It is a spring morning"
    const its = s.match(/\b(?:it's|it is|it’s)\s+(?:a\s+|an\s+)?(?:early\s+|late\s+|mid[- ]|the end of\s+|the start of\s+)?([A-Za-z]+)/i);
    if (its) {
      const w = its[1]!.toLowerCase();
      const mi = MONTHS.findIndex((x) => x.toLowerCase() === w);
      if (mi >= 0 && mi < m) issues.push(`"${s.slice(0, 80)}" sets now in ${MONTHS[mi]}, but today is ${MONTHS[m]} ${year}`);
      if (!south && w in SEASON_END && SEASON_END[w]! < m) issues.push(`"${s.slice(0, 80)}" sets now in ${w}, but today is ${MONTHS[m]} ${year}`);
    }
    if (PAST_CUE.test(s)) continue;
    // "spring 2026", "this summer", "March 2026"
    for (const mm of s.matchAll(new RegExp(`\\b(?:this\\s+)?(spring|summer|autumn|fall)(?:\\s+(?:of\\s+)?(${year}))?\\b`, "gi"))) {
      const w = mm[1]!.toLowerCase();
      const explicit = Boolean(mm[2]) || /^this\s/i.test(mm[0]);
      if (!south && explicit && SEASON_END[w]! < m && !/\bnext\s+$/i.test(s.slice(0, mm.index ?? 0)))
        issues.push(`"${s.slice(0, 80)}" places now in ${w} ${year}, which has passed (today is ${MONTHS[m]} ${year})`);
    }
    for (const mm of s.matchAll(new RegExp(`\\b(${MONTHS.join("|")})\\s+(?:of\\s+)?${year}\\b`, "g"))) {
      const mi = MONTHS.indexOf(mm[1]!);
      if (mi < m) issues.push(`"${s.slice(0, 80)}" places now in ${mm[1]} ${year}, which has passed (today is ${MONTHS[m]} ${year})`);
    }
  }
  return [...new Set(issues)];
}
