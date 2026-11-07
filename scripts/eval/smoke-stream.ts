/** Measures streaming time-to-first-token a few times (diagnostic). */
import { nodeLlm } from "./env";

const llm = nodeLlm();
const model = process.argv[2] ?? "gemini-3.8-flash";
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  let first = 0;
  let n = 0;
  try {
    for await (const c of llm.streamText({
      model,
      prompt: "Write 12 short numbered lines about rivers.",
      thinkingLevel: model.includes("lite") ? undefined : "low",
      timeoutMs: 12_000,
    })) {
      if (c.text && !first) first = Date.now() - t0;
      n += c.text.length;
      if (c.usage) console.log(i, model, "first", first, "total", c.usage.ms, "chars", n, "out", c.usage.outputTokens);
    }
  } catch (e) {
    console.log(i, "ERR after", Date.now() - t0, (e as Error).message.slice(0, 120));
  }
}
