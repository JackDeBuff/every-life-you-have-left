/**
 * QA aid for the mock: `?demo=alex&jump=40` fast-forwards a fresh session to age 40 (answering
 * forks along the way); `&stop=big` then stops at the next open big decision; `jump=end` goes to
 * the ending. Used for screenshots and quick visual checks. Never on in normal use.
 */
import { sim } from "./session";

export function jumpParams(): { age: number | "end"; stopAtBig: boolean } | null {
  const p = new URLSearchParams(location.search);
  const j = p.get("jump");
  if (!j) return null;
  return { age: j === "end" ? "end" : Number(j), stopAtBig: p.get("stop") === "big" };
}

export async function fastForward(target: number | "end", stopAtBig: boolean) {
  await run(target, stopAtBig);
  // `&answer=2`: then answer the open decision through the real card (plays the fork moment).
  const k = new URLSearchParams(location.search).get("answer");
  if (k && /^[1-4]$/.test(k)) {
    window.setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
      window.setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })), 250);
    }, 900);
  }
}

async function run(target: number | "end", stopAtBig: boolean) {
  let n = 0;
  for (;;) {
    if (++n > 400) return;
    const s = sim();
    if (s.phase === "ended") return;
    const pending = s.decisions.find((d) => d.status === "pending");
    const reached = target !== "end" && s.playhead.age >= target;
    if (reached && (!stopAtBig || pending?.kind === "big")) return;
    if (pending) {
      const opt = pending.options[(n * 7) % 4]!;
      await s.answer({ decisionId: pending.id, optionId: opt.id, text: n % 3 === 0 && pending.kind === "big" ? "I'd do it, but I want my evenings back." : null, via: "tap" });
      continue;
    }
    if (s.phase === "interlude") {
      await s.pause(false);
      continue;
    }
    await s.tick(s.playhead.year + 1);
  }
}
