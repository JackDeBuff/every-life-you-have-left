/**
 * Time the warm-up (D-090) against a real SessionAgent: Start → first warm-up question → the
 * answers → the first big card, and whether that card uses what the warm-up learned.
 *
 *   npx tsx scripts/warmup-run.ts [baseUrl] --persona minimal|medium|rich [--think 6] [--tap] [--out file.json]
 *   baseUrl defaults to http://127.0.0.1:4173 (vite preview of a production build).
 *   --think  seconds spent on each question before answering (reading + typing)
 *   --tap    tap an answer instead of typing the persona's own words (the fastest path)
 *
 * Prints each question with its timing, the first big card, and which warm-up quotes it cites.
 */
import { applyServerMsg, agentPath, isServerMsg, type AgentState, type WarmAnswerInput, type WarmKey } from "../worker/agent/protocol";
import type { DocInput } from "../shared/engine";
import type { StartInput } from "../shared/sim";

const args = process.argv.slice(2);
const flag = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1]! : dflt;
};
const base = (args.find((a) => /^https?:\/\//.test(a)) ?? "http://127.0.0.1:4173").replace(/\/$/, "");
const THINK_S = Number(flag("think", "6"));
const TAP = args.includes("--tap");
const out = flag("out", "");
const who = flag("persona", "minimal");

interface Persona {
  input: StartInput;
  docs: DocInput[];
  /** What they'd type for each question (their own words). */
  says: Record<WarmKey, string>;
}

const common = { via: "text", speed: "auto", appearance: null, hasSelfie: false, currency: "USD" } as const;

const RICH_EXPORT = `Here's what I know about you from our conversations:

- You're Marcus, 34, living in Seattle (Ballard) with your wife Dana and your daughter June, who just turned two.
- Work: you're a senior product manager at a large cloud company, about 7 years in. Base around $210k plus stock. You lead the billing platform team (11 engineers). You've said the work is "fine but I could do it asleep."
- Money: comfortable on paper. You have a big mortgage (about $780k left) on a house you bought in 2023, and you max out your 401k. You've said money doesn't scare you, but losing the stock vesting does.
- The decision you keep coming back to: your former colleague Priya wants you to co-found a climate-tech startup (software for grid batteries). She has a seed term sheet for $2.5M. At the same time your manager has hinted you'll be promoted to director in the spring if you stay. You've asked me three times to compare the two.
- People: Dana is a pediatric nurse; she's supportive but has said "we can't both be on a rollercoaster with a toddler." Your dad was a union electrician in Spokane and is very proud of your "real job." Your mom passed away in 2019.
- Worries you've mentioned: that you'll wake up at 45 having optimized for a title instead of doing something that matters; that a startup would cost you time with June while she's little; burning out like you did in 2021.
- Things you've said you want: to work on climate for real, to be home for dinner most nights, to build things with your hands again (you used to do woodworking).
- What I'd guess you've never told me: that if nobody judged you, you'd leave tech entirely and teach high school physics. You mentioned it once and then changed the subject.`;

const PERSONAS: Record<string, Persona> = {
  minimal: {
    input: { ...common, firstName: "Sam", age: 22, city: "Chicago", region: "IL", country: "US", line: "idk, stressed about jobs" },
    docs: [],
    says: {
      now: "I graduated in May with a marketing degree. I work about 30 hours a week at a coffee shop and money is tight, I have $24k in student loans.",
      crossroads: "Whether to take my uncle's offer to manage his warehouse in Milwaukee or keep applying for marketing jobs here.",
      people: "My mom. She wants me to take the safe job and stop wasting my degree pouring coffee.",
      fear: "That I'll be 32 and still doing something I hate because it pays the bills.",
      unjudged: "Honestly I'd move to LA and try to make it editing videos for YouTubers.",
    },
  },
  medium: {
    input: {
      ...common, firstName: "Priya", age: 29, city: "Columbus", region: "OH", country: "US",
      line: "I'm an ER nurse, three years in, making about $72k. Money is okay but I send $500 a month to my parents in Pune, and they keep asking when we'll move back to India. My husband's job is here though, and his family expects us to buy a house near them.",
    },
    docs: [],
    says: {
      now: "Twelve-hour ER shifts, three or four a week. Money is okay, not great, because of what I send home.",
      crossroads: "Whether to apply to the nurse practitioner program: two more years of school, less money, but I'd stop doing nights.",
      people: "My parents want us back in Pune, and my in-laws want a house five minutes from them. My husband mostly avoids the topic.",
      fear: "That I'll spend my thirties exhausted and never live anywhere but this hospital and this suburb.",
      unjudged: "Take a year off with my husband and do travel nursing in New Zealand.",
    },
  },
  rich: {
    input: {
      ...common, firstName: "Marcus", age: 34, city: "Seattle", region: "WA", country: "US",
      line: "Torn between a director promotion and co-founding a climate startup with Priya. I pasted my AI's summary.",
    },
    docs: [{ kind: "ai_export", text: RICH_EXPORT }],
    says: {
      now: "PM at a big cloud company, comfortable money but a big mortgage.",
      crossroads: "The director promotion or Priya's climate startup.",
      people: "Dana, mostly. She wants one of us to be stable while June is little.",
      fear: "That at 45 I'll have a title and nothing I'm proud of.",
      unjudged: "I'd teach high school physics and build furniture on weekends.",
    },
  },
};
const persona = PERSONAS[who] ?? PERSONAS.minimal!;

const sessionId = `warm-${who}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const ws = new WebSocket(`${base.replace(/^http/, "ws")}${agentPath(sessionId)}`);
let state: AgentState | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
function call<T = unknown>(method: string, ...params: unknown[]): Promise<T> {
  const id = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    ws.send(JSON.stringify({ type: "rpc", id, method, args: params }));
    setTimeout(() => pending.delete(id) && reject(new Error(`rpc ${method} timed out`)), 60_000);
  });
}
ws.addEventListener("message", (ev) => {
  let m: unknown;
  try {
    m = JSON.parse(typeof ev.data === "string" ? ev.data : "");
  } catch {
    return;
  }
  if (isServerMsg(m)) {
    state = applyServerMsg(state, m);
    return;
  }
  const r = m as { type?: string; id?: string; success?: boolean; result?: unknown; error?: string };
  if (r.type === "rpc" && r.id && pending.has(r.id)) {
    const p = pending.get(r.id)!;
    pending.delete(r.id);
    if (r.success) p.resolve(r.result);
    else p.reject(new Error(r.error ?? "rpc error"));
  }
});

let t0 = 0;
const T = () => (performance.now() - t0) / 1000;
const log = (...a: unknown[]) => console.log(`[${T().toFixed(1).padStart(5)}s]`, ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (pred: (s: AgentState) => boolean, ms: number, what: string) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (state && pred(state)) return state;
    await sleep(15);
  }
  throw new Error(`timed out waiting for ${what} (phase ${state?.phase}, warmup ${state?.warmup?.status})`);
};

async function main() {
  await new Promise<void>((res, rej) => {
    ws.addEventListener("open", () => res(), { once: true });
    ws.addEventListener("error", () => rej(new Error("websocket failed")), { once: true });
  });
  await until((s) => s.phase === "start", 10_000, "snapshot");
  t0 = performance.now();
  void call("start", persona.input, persona.docs);
  log(`start ${who} (${persona.input.firstName}, ${persona.input.age}; ${persona.docs.length} docs; ${TAP ? "taps" : "own words"}, think ${THINK_S}s) ${sessionId}`);

  const asked: { key: WarmKey; shown: number; answered: number; personal: boolean; options: string[] }[] = [];
  let firstQ: number | null = null;
  let lastAnswer: number | null = null;
  await until((s) => s.phase !== "start" && !!s.warmup, 15_000, "warm-up");
  for (;;) {
    const s = await until((x) => x.phase !== "warmup" || (!!x.warmup?.current && !asked.some((a) => `w-${a.key}` === x.warmup!.current)), 60_000, "next question or the fork");
    if (s.phase !== "warmup") break;
    const q = s.warmup!.questions.find((x) => x.id === s.warmup!.current)!;
    const shown = T();
    if (firstQ === null) firstQ = shown;
    log(`Q ${q.key}${q.personal ? " (personalized)" : ""}: ${q.prompt}`);
    log(`   answers: ${q.options.map((o) => o.label).join(" | ")}`);
    await sleep(THINK_S * 1000);
    const a: WarmAnswerInput = TAP ? { questionId: q.id, optionId: q.options[asked.length % 4]!.id, text: null, via: "tap" } : { questionId: q.id, optionId: null, text: persona.says[q.key], via: "text" };
    asked.push({ key: q.key, shown, answered: T(), personal: q.personal, options: q.options.map((o) => o.label) });
    lastAnswer = T();
    await call("answerWarmup", a);
    log(`   → ${TAP ? `tap "${q.options.find((o) => o.id === a.optionId)?.label}"` : `"${a.text}"`}`);
  }
  const s = await until((x) => x.phase === "deciding" && x.decisions.some((d) => d.kind === "big" && d.status === "pending"), 60_000, "the first fork");
  const card = T();
  const d = s.decisions.find((x) => x.kind === "big" && x.status === "pending")!;
  const w = s.warmup!;
  const warmQuotes = new Map(w.questions.filter((q) => q.answer?.quoteId).map((q) => [q.answer!.quoteId!, q.key]));
  const covered = w.questions.filter((q) => q.status === "covered").map((q) => `${q.key} (${q.covered!.by}: ${q.covered!.evidence})`);
  const cardText = [d.prompt, d.whyAsking, ...d.options.map((o) => `${o.label} ${o.hint ?? ""} ${o.branchTitle ?? ""}`)].join(" ").toLowerCase();
  // Distinctive words from each warm-up answer that show up in the card (names, places, nouns).
  const STOP = new Set("about after again also always because before being could doing every from have honestly into just keep like make more most much never only other over really should since some still than that their them then there these they thing think this those very want what when where which while will with would your years".split(" "));
  const echoes: Record<string, string[]> = {};
  for (const q of w.questions.filter((x) => x.answer?.quoteId)) {
    const qt = s.profile!.quotes.find((x) => x.id === q.answer!.quoteId);
    const ws2 = (qt?.text.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter((x) => !STOP.has(x));
    const hit = [...new Set(ws2.filter((x) => cardText.includes(x)))];
    if (hit.length) echoes[q.key] = hit;
  }
  console.log("\n— Warm-up run —");
  console.log(`persona ${who}: asked ${asked.length} (${asked.map((a) => a.key).join(", ") || "none"}); covered ${covered.length}: ${covered.join("; ") || "-"}`);
  console.log(`Start → first question: ${firstQ === null ? "-" : `${firstQ.toFixed(2)} s`}`);
  for (const a of asked) console.log(`  ${a.key.padEnd(10)} shown ${a.shown.toFixed(1)} s, answered ${a.answered.toFixed(1)} s${a.personal ? ", personalized" : ""}`);
  console.log(`last answer → first big card: ${lastAnswer === null ? `- (no questions; Start → card ${card.toFixed(1)} s)` : `${(card - lastAnswer).toFixed(2)} s`}   (Start → card ${card.toFixed(1)} s)`);
  console.log(`first card: "${d.prompt}"`);
  console.log(`  why: ${d.whyAsking}  [whyQuoteId ${d.whyQuoteId ?? "-"}${d.whyQuoteId && warmQuotes.has(d.whyQuoteId) ? ` = warm-up ${warmQuotes.get(d.whyQuoteId)}` : ""}]`);
  for (const o of d.options) console.log(`  ${o.id}. [${o.branchTitle}] ${o.label}${o.hint ? ` (${o.hint})` : ""}`);
  console.log(`warm-up words in the card: ${Object.entries(echoes).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ") || "none"}`);
  console.log(`know-me ${s.profile!.knowMeScore}; quotes ${s.profile!.quotes.length}; facts ${s.profile!.facts.length}; people ${s.profile!.people.map((p) => p.label).join(", ") || "-"}`);
  console.log(`seeds: leap="${s.profile!.seeds.leap.text}" careful="${s.profile!.seeds.careful.text}" unjudged="${s.profile!.seeds.unjudged.text}"`);
  await sleep(2500);
  console.log(`usage so far: $${state!.usage?.usd.toFixed(4) ?? "?"} over ${state!.usage?.calls ?? "?"} calls ${JSON.stringify(state!.usage?.byPurpose ?? {})}`);
  if (out) {
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify({ who, sessionId, think: THINK_S, tap: TAP, asked, covered, firstQ, lastAnswer, card, cardAfterLast: lastAnswer === null ? null : card - lastAnswer, decision: d, echoes, whyQuoteWarm: !!(d.whyQuoteId && warmQuotes.has(d.whyQuoteId)), usage: state!.usage }, null, 2));
  }
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
