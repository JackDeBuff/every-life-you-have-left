/**
 * Incremental extraction of finished array items from a streamed JSON document, e.g. each
 * completed object of `{"years":[{...},{...}]}` as soon as its closing brace arrives. This is
 * what lets generateYears emit one SimYear at a time while the model is still writing.
 */
export function createArrayItemExtractor(key: string) {
  let buf = "";
  let pos = 0;
  let arrayStart = -1; // index just after '['
  let depth = 0; // depth inside the array (0 = between items)
  let itemStart = -1;
  let inString = false;
  let escape = false;
  let finished = false;

  return {
    /** Feed more text; returns the raw JSON text of every item completed by this chunk. */
    feed(chunk: string): string[] {
      buf += chunk;
      const out: string[] = [];
      if (finished) return out;
      if (arrayStart < 0) {
        const m = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(buf);
        if (!m) return out;
        arrayStart = m.index + m[0].length;
        pos = arrayStart;
      }
      for (; pos < buf.length; pos++) {
        const ch = buf[pos]!;
        if (inString) {
          if (escape) escape = false;
          else if (ch === "\\") escape = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') {
          inString = true;
          continue;
        }
        if (ch === "{" || ch === "[") {
          if (depth === 0 && ch === "{") itemStart = pos;
          depth++;
        } else if (ch === "}" || ch === "]") {
          if (depth === 0 && ch === "]") {
            finished = true;
            pos++;
            break;
          }
          depth--;
          if (depth === 0 && itemStart >= 0) {
            out.push(buf.slice(itemStart, pos + 1));
            itemStart = -1;
          }
        }
      }
      return out;
    },
    /** All text received so far (for a final whole-document parse). */
    text: () => buf,
    done: () => finished,
  };
}
