/** Small presentation helpers shared by the tabs and the bug reports. */
import { getBaseRate } from "../../../shared/baseRates";
import { DOMAINS, type DomainKey } from "../../../shared/domains";
import type { SceneSpec } from "../../../shared/sim";
import type { DecisionRow } from "./model";

const words = (s: string, n: number) => {
  const w = s.trim().split(/\s+/);
  return w.length > n ? `${w.slice(0, n).join(" ")}…` : s.trim();
};

/** What a decision's answer chose: the option (branch title for a fork) or their own words. */
export function chosenTitle(r: Pick<DecisionRow, "answer" | "options" | "kind" | "status">): string {
  if (r.status === "slid" || r.answer?.slid) return "let it slide";
  const a = r.answer;
  if (!a) return r.status;
  const o = a.optionId ? r.options.find((x) => x.id === a.optionId) : undefined;
  if (o) return `${r.kind === "big" ? o.branchTitle ?? o.label : o.label}${a.text ? ` + "${words(a.text, 14)}"` : ""}`;
  if (a.text) return `their own words: "${words(a.text, 14)}"`;
  return "no answer";
}

export const domainLabel = (k: string) => DOMAINS[k as DomainKey]?.label ?? k;
export const familyOf = (k: string) => DOMAINS[k as DomainKey]?.family ?? "direction";

export function rateLine(id: string | null | undefined): { id: string; display: string; source: string; url: string } | null {
  if (!id) return null;
  const r = getBaseRate(id);
  return r ? { id, display: r.display, source: `${r.source}, ${r.year}`, url: r.url } : { id, display: "(unknown base-rate id)", source: "", url: "" };
}

/** The 3D scene spec as one line of chips. */
export function sceneChips(s: SceneSpec | undefined | null): string[] {
  if (!s) return [];
  return [
    s.setting,
    s.flavor,
    s.placeLabel ? `"${s.placeLabel}"` : "",
    s.home,
    s.activity,
    s.people.map((p) => `${p.role}:${p.ageBand}`).join(" "),
    `${s.season} · ${s.timeOfDay} · ${s.weather}`,
    s.mood,
    s.moment ? `moment: ${s.moment}` : "",
    s.caption ? `"${s.caption}"` : "",
  ].filter(Boolean);
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
