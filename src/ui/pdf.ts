/** PDF → text in the browser (D-066). pdf.js is loaded lazily, only when someone uploads a PDF. */
export async function pdfText(file: File, maxPages = 8): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  return out.join("\n").replace(/[ \t]+/g, " ").trim();
}

/** The prompt users paste into their own AI app (ChatGPT, Gemini, Claude…) to export what it knows. */
export const AI_EXPORT_PROMPT = `Based on everything you know about me from our conversations, write a plain summary I can paste into another app. Include: what I do for work and how I feel about it; where I live and where I've lived; the people who matter most to me; money worries or goals; what I keep coming back to wanting; what I'm afraid of; and three things I've said that sound most like me, quoted exactly. Don't include passwords, health records, or anything about other people's private details. Keep it under 400 words.`;
