/** Quick live check of every model endpoint the engine uses (no prompt text is logged). */
import { nodeLlm } from "./env";

const llm = nodeLlm();
const schema = { type: "object", properties: { city: { type: "string" }, n: { type: "integer" } }, required: ["city", "n"] };
for (const model of ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-4-argon"]) {
  try {
    const r = await llm.generateJSON<{ city: string; n: number }>({
      model,
      prompt: "Name one city in Portugal and a number 1-9. JSON.",
      schema,
      thinkingLevel: model.includes("lite") ? undefined : "low",
      maxOutputTokens: 2000,
    });
    console.log(model, JSON.stringify(r.json), JSON.stringify(r.usage));
  } catch (e) {
    console.log(model, "ERR", (e as Error).message.slice(0, 200));
  }
}
try {
  let first = 0;
  const t0 = Date.now();
  let out = "";
  for await (const c of llm.streamText({ model: "gemini-3.8-flash", prompt: "Count from 1 to 30 separated by spaces.", thinkingLevel: "low" })) {
    if (c.text && !first) first = Date.now() - t0;
    out += c.text;
    if (c.usage) console.log("stream usage", JSON.stringify(c.usage));
  }
  console.log("stream first", first, out.slice(0, 60));
} catch (e) {
  console.log("stream ERR", (e as Error).message.slice(0, 200));
}
try {
  const r = await llm.chatCompletionsOpenAI({
    model: "openai/gpt-oss-120b-maas",
    messages: [{ role: "user", content: "Name one city in Portugal and a number 1-9 as JSON {city, n}." }],
    jsonSchema: schema,
    maxTokens: 800,
    reasoningEffort: "low",
  });
  console.log("gpt-oss", r.text.slice(0, 200), JSON.stringify(r.usage));
  let d = 0;
  const r2 = await llm.chatCompletionsOpenAI({
    model: "openai/gpt-oss-120b-maas",
    messages: [{ role: "user", content: "Say hi in 5 words." }],
    maxTokens: 300,
    reasoningEffort: "low",
    onDelta: () => d++,
  });
  console.log("gpt-oss stream", d, r2.text.slice(0, 80), JSON.stringify(r2.usage));
} catch (e) {
  console.log("gpt-oss ERR", (e as Error).message.slice(0, 300));
}
