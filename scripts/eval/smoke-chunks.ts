/** Diagnostic: when do streamed chunks arrive (JSON mode vs plain), and how big are they? */
import { nodeLlm } from "./env";

const llm = nodeLlm();
const model = process.argv[2] ?? "gemini-3.8-flash";
const schema = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, text: { type: "string" } }, required: ["n", "text"] } } },
  required: ["items"],
};
for (const json of [true, false]) {
  const t0 = Date.now();
  const marks: string[] = [];
  for await (const c of llm.streamText({
    model,
    prompt: json
      ? "Return 8 items, n = 1..8, each text a 40-word description of a different city."
      : "Write 8 numbered 40-word descriptions of different cities.",
    schema: json ? schema : undefined,
    thinkingLevel: model.includes("lite") ? undefined : "low",
  })) {
    if (c.text) marks.push(`${Date.now() - t0}ms:${c.text.length}`);
    if (c.usage) console.log(`${model} json=${json} out ${c.usage.outputTokens} total ${c.usage.ms}ms first ${c.usage.firstTokenMs}ms chunks ${marks.length}`);
  }
  console.log("  " + marks.join(" "));
}
