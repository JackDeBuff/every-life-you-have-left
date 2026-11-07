/** The postcard's quote: the person's own words, never cut off mid-thought. */
export const HEART = /if nobody|scare|afraid|want|wish|dream|love|never|always|can't|miss/i;

/**
 * The postcard's quote, verbatim and never cut mid-thought: the whole sentence when it fits; else
 * the sentence (or clause) that carries the feeling; else trimmed at a word with an ellipsis.
 */
export function fitQuote(text: string, max = 120): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const words = (x: string) => x.split(" ").length;
  const sentences = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const heart = sentences.find((x) => HEART.test(x));
  const clausesOf = (x: string) => x.split(/(?<=[,;:])\s+|\s+(?=[—–]\s)/).map((c) => c.replace(/^[—–]\s*/, "").trim()).filter(Boolean);
  const asClause = (c: string, of: string) => {
    const body = c.replace(/[,;:]$/, "");
    return `${of.startsWith(c) ? "" : "…"}${body}${/[.!?…]$/.test(body) ? "" : "…"}`;
  };
  const fitsS = (x: string) => x.length <= max && words(x) >= 3;
  const fitsC = (x: string) => x.length <= max - 2 && words(x) >= 5;
  // 1) the sentence with the feeling  2) a clause of it  3) any sentence  4) any clause  5) trim
  if (heart && fitsS(heart)) return heart;
  if (heart) {
    const cs = clausesOf(heart);
    const c = cs.find((x) => fitsC(x) && HEART.test(x)) ?? cs.find(fitsC);
    if (c) return asClause(c, heart);
  }
  const s = sentences.find(fitsS);
  if (s) return s;
  for (const sen of sentences) {
    const c = clausesOf(sen).find(fitsC);
    if (c) return asClause(c, sen);
  }
  const main = heart ?? sentences[0] ?? t;
  const cut = main.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1)).replace(/[\s,;:.—–-]+$/, "")}…`;
}
